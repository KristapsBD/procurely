import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit/audit-log';
import type {
  CreateGoodsReceiptRequest,
  GoodsReceipt,
  PurchaseOrder,
} from '../contract/api.dto';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { PurchaseOrdersService } from './purchase-orders.service';

type Tx = Prisma.TransactionClient;

const withLines = {
  receivedBy: { select: { name: true } },
  lines: {
    include: {
      purchaseOrderLine: {
        select: { position: true, catalogItem: { select: { name: true } } },
      },
    },
  },
} as const satisfies Prisma.GoodsReceiptInclude;
type GoodsReceiptRow = Prisma.GoodsReceiptGetPayload<{
  include: typeof withLines;
}>;

function toGoodsReceipt(r: GoodsReceiptRow): GoodsReceipt {
  return {
    id: r.id,
    companyId: r.companyId,
    purchaseOrderId: r.purchaseOrderId,
    receivedByPersonId: r.receivedByPersonId,
    receivedByName: r.receivedBy.name,
    receivedAt: r.receivedAt.toISOString(),
    lines: [...r.lines]
      .sort(
        (a, b) => a.purchaseOrderLine.position - b.purchaseOrderLine.position,
      )
      .map((l) => ({
        id: l.id,
        purchaseOrderLineId: l.purchaseOrderLineId,
        catalogItemName: l.purchaseOrderLine.catalogItem.name,
        quantity: l.quantity,
        note: l.note,
      })),
  };
}

/**
 * Goods receipts and closing an order. Every method runs inside the caller's TenantDb.run, so a
 * receipt, its lines and its audit entry commit together. Row-level security lets only a buyer
 * or admin write, and a trigger keeps each line's net received quantity between zero and the
 * ordered quantity even for concurrent receipts. The checks here repeat those rules to give the
 * refusal a reason. The order's status is derived from the receipts, so recording one moves the
 * order on without touching it.
 */
@Injectable()
export class GoodsReceiptsService {
  constructor(private readonly orders: PurchaseOrdersService) {}

  async list(tx: Tx, purchaseOrderId: string): Promise<GoodsReceipt[]> {
    await this.orders.get(tx, purchaseOrderId);
    const rows = await tx.goodsReceipt.findMany({
      where: { purchaseOrderId },
      include: withLines,
      orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toGoodsReceipt);
  }

  /**
   * Records one receipt. A positive quantity confirms a delivery; a negative one corrects
   * earlier entries (a receipt is never edited). Refused with 409 when it would receive more
   * than was ordered, correct below zero, or when the order is closed.
   */
  async create(
    tx: Tx,
    scope: CompanyRequestScope,
    purchaseOrderId: string,
    input: CreateGoodsReceiptRequest,
  ): Promise<GoodsReceipt> {
    await this.orders.requirePurchasingRole(tx, scope);
    const before = await this.orders.get(tx, purchaseOrderId);
    if (before.status === 'CLOSED') {
      throw new ConflictException('This purchase order is closed');
    }
    const lineById = new Map(before.lines.map((l) => [l.id, l]));
    for (const entry of input.lines) {
      const line = lineById.get(entry.purchaseOrderLineId);
      if (!line) {
        throw new BadRequestException(
          `Line ${entry.purchaseOrderLineId} is not a line of this purchase order`,
        );
      }
      const net = line.receivedQuantity + entry.quantity;
      if (net > line.quantity) {
        throw new ConflictException(
          `${line.catalogItemName}: ${line.quantity} ordered and ${line.receivedQuantity} already received, so ${entry.quantity} more is too many`,
        );
      }
      if (net < 0) {
        throw new ConflictException(
          `${line.catalogItemName}: only ${line.receivedQuantity} received, so it cannot be corrected by ${entry.quantity}`,
        );
      }
    }
    const { id } = await tx.goodsReceipt.create({
      data: {
        companyId: scope.companyId,
        purchaseOrderId,
        receivedByPersonId: scope.personId,
      },
    });
    await tx.goodsReceiptLine.createMany({
      data: input.lines.map((l) => ({
        companyId: scope.companyId,
        goodsReceiptId: id,
        purchaseOrderId,
        purchaseOrderLineId: l.purchaseOrderLineId,
        quantity: l.quantity,
        note: l.note ?? null,
      })),
    });
    const order = await this.orders.get(tx, purchaseOrderId);
    await writeAudit(tx, scope, {
      action: 'goods_receipt.recorded',
      entityType: 'goods_receipt',
      entityId: id,
      details: {
        purchaseOrderId,
        lines: input.lines.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          quantity: l.quantity,
          note: l.note ?? null,
        })),
        statusBefore: before.status,
        statusAfter: order.status,
      },
    });
    const row = await tx.goodsReceipt.findUnique({
      where: { id },
      include: withLines,
    });
    if (!row) throw new NotFoundException();
    return toGoodsReceipt(row);
  }

  /** Only a fully received order closes. Closing is final. */
  async close(
    tx: Tx,
    scope: CompanyRequestScope,
    purchaseOrderId: string,
  ): Promise<PurchaseOrder> {
    await this.orders.requirePurchasingRole(tx, scope);
    const order = await this.orders.get(tx, purchaseOrderId);
    if (order.status === 'CLOSED') {
      throw new ConflictException('This purchase order is already closed');
    }
    if (order.status !== 'FULLY_RECEIVED') {
      throw new ConflictException(
        `A ${order.status.toLowerCase().replace('_', ' ')} purchase order cannot be closed: only a fully received one can`,
      );
    }
    await tx.purchaseOrderClosure.createMany({
      data: [
        {
          companyId: scope.companyId,
          purchaseOrderId,
          closedByPersonId: scope.personId,
        },
      ],
    });
    await writeAudit(tx, scope, {
      action: 'purchase_order.closed',
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      details: { statusBefore: order.status, statusAfter: 'CLOSED' },
    });
    return this.orders.get(tx, purchaseOrderId);
  }
}
