import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit-log';
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrder,
} from '../contract/api.dto';
import { lineAmount, totalOf } from '../requisitions/requisition-lifecycle';
import { statusOf } from './purchase-order-status';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { PURCHASING_ROLES, rejectUnmatchedWrite } from '../tenancy/roles';

type Tx = Prisma.TransactionClient;

const withDetails = {
  requisition: { select: { justification: true } },
  supplier: { select: { name: true } },
  createdBy: { select: { name: true } },
  lines: {
    include: {
      catalogItem: { select: { name: true } },
      receiptLines: { select: { quantity: true } },
    },
    orderBy: { position: 'asc' },
  },
  closures: { include: { closedBy: { select: { name: true } } } },
} as const satisfies Prisma.PurchaseOrderInclude;
type PurchaseOrderRow = Prisma.PurchaseOrderGetPayload<{
  include: typeof withDetails;
}>;

function toPurchaseOrder(o: PurchaseOrderRow): PurchaseOrder {
  const lines = o.lines.map((l) => ({
    id: l.id,
    catalogItemId: l.catalogItemId,
    catalogItemName: l.catalogItem.name,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    amountMinor: l.amountMinor,
    receivedQuantity: l.receiptLines.reduce((sum, r) => sum + r.quantity, 0),
  }));
  const closure = o.closures[0];
  return {
    id: o.id,
    companyId: o.companyId,
    requisitionId: o.requisitionId,
    requisitionJustification: o.requisition.justification,
    supplierId: o.supplierId,
    supplierName: o.supplier.name,
    createdByPersonId: o.createdByPersonId,
    createdByName: o.createdBy.name,
    createdAt: o.createdAt.toISOString(),
    lines,
    totalMinor: totalOf(lines),
    status: statusOf(lines, closure !== undefined),
    closedAt: closure?.closedAt.toISOString() ?? null,
    closedByName: closure?.closedBy.name ?? null,
  };
}

/**
 * Purchase orders. Every method runs inside the caller's TenantDb.run, so an order, its lines
 * and its audit entry commit together. Row-level security decides who reads which orders and
 * lets only a buyer or admin insert, for an approved requisition and an active supplier. The
 * checks here repeat those rules to give the refusal a reason, and add what a policy cannot
 * say: the items belong to the chosen supplier.
 */
@Injectable()
export class PurchaseOrdersService {
  async list(tx: Tx): Promise<PurchaseOrder[]> {
    const rows = await tx.purchaseOrder.findMany({
      include: withDetails,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toPurchaseOrder);
  }

  async get(tx: Tx, id: string): Promise<PurchaseOrder> {
    const row = await tx.purchaseOrder.findUnique({
      where: { id },
      include: withDetails,
    });
    if (!row) throw new NotFoundException();
    return toPurchaseOrder(row);
  }

  /**
   * A requisition converts once. A second order for it is refused with 409, whether the first
   * was made a moment ago or long before: orders are never cancelled or deleted, so the
   * requisition stays converted.
   */
  async create(
    tx: Tx,
    scope: CompanyRequestScope,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrder> {
    await this.requirePurchasingRole(tx, scope);
    await this.requireConvertible(tx, input.requisitionId);
    await this.requireActiveSupplier(tx, input.supplierId);
    const lines = await this.priceLines(tx, input);
    const { id } = await tx.purchaseOrder.create({
      data: {
        companyId: scope.companyId,
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        createdByPersonId: scope.personId,
      },
    });
    await tx.purchaseOrderLine.createMany({
      data: lines.map((line, position) => ({
        ...line,
        companyId: scope.companyId,
        purchaseOrderId: id,
        position,
      })),
    });
    await writeAudit(tx, scope, {
      action: 'purchase_order.created',
      entityType: 'purchase_order',
      entityId: id,
      details: {
        requisitionId: input.requisitionId,
        supplierId: input.supplierId,
        totalMinor: totalOf(lines),
        lines: lines.map((l) => ({ ...l })),
      },
    });
    return this.get(tx, id);
  }

  async requirePurchasingRole(tx: Tx, scope: CompanyRequestScope) {
    const own = await tx.membership.findFirst({
      where: {
        companyId: scope.companyId,
        personId: scope.personId,
        active: true,
      },
      select: { role: true },
    });
    if (!own || !PURCHASING_ROLES.includes(own.role)) {
      await rejectUnmatchedWrite(tx, scope, PURCHASING_ROLES);
    }
  }

  /** The requisition is approved and has no order. A buyer reads approved ones only. */
  private async requireConvertible(tx: Tx, requisitionId: string) {
    const requisition = await tx.requisition.findUnique({
      where: { id: requisitionId },
      select: { status: true, purchaseOrders: { select: { id: true } } },
    });
    if (!requisition) {
      throw new NotFoundException(
        `Requisition ${requisitionId} does not exist or is not approved`,
      );
    }
    if (requisition.status !== 'APPROVED') {
      throw new ConflictException(
        `A ${requisition.status.toLowerCase()} requisition cannot be ordered: only an approved one can`,
      );
    }
    // The requisition's orders are filtered by row-level security like any read, and a buyer
    // or admin reads all of the company's; the unique requisition_id backs this up.
    if (requisition.purchaseOrders.length > 0) {
      throw new ConflictException(
        'This requisition already has a purchase order',
      );
    }
  }

  private async requireActiveSupplier(tx: Tx, supplierId: string) {
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) {
      throw new BadRequestException(`Supplier ${supplierId} does not exist`);
    }
    if (!supplier.active) {
      throw new ConflictException(
        `Supplier ${supplier.name} is inactive and cannot be chosen`,
      );
    }
  }

  /** The line amounts, after checking each item exists and is the chosen supplier's. */
  private async priceLines(tx: Tx, input: CreatePurchaseOrderRequest) {
    const items = await tx.catalogItem.findMany({
      where: { id: { in: input.lines.map((l) => l.catalogItemId) } },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    return input.lines.map((line) => {
      const item = byId.get(line.catalogItemId);
      if (!item) {
        throw new BadRequestException(
          `Catalog item ${line.catalogItemId} does not exist`,
        );
      }
      if (item.supplierId !== input.supplierId) {
        throw new BadRequestException(
          `${item.name} is not an item of the chosen supplier`,
        );
      }
      const amountMinor = lineAmount(line.quantity, line.unitPriceMinor);
      if (amountMinor === null) {
        throw new BadRequestException(
          `The amount for ${item.name} is too large`,
        );
      }
      return { ...line, amountMinor };
    });
  }
}
