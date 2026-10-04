import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  Requisition,
  RequisitionAction,
  RequisitionLineInput,
  SaveRequisitionRequest,
} from '../contract/api.dto';
import { writeAudit } from '../audit/audit-log';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import { REQUISITION_ROLES, rejectUnmatchedWrite } from '../tenancy/roles';
import {
  type Refusal,
  decide,
  lineAmount,
  offeredActions,
  totalOf,
} from './requisition-lifecycle';

type Tx = Prisma.TransactionClient;

const withDetails = {
  requester: { select: { name: true } },
  lines: {
    include: { catalogItem: { select: { name: true } } },
    orderBy: { position: 'asc' },
  },
} as const satisfies Prisma.RequisitionInclude;
type RequisitionRow = Prisma.RequisitionGetPayload<{
  include: typeof withDetails;
}>;

interface PricedLine extends RequisitionLineInput {
  unitPriceMinor: number;
  amountMinor: number;
}

const AUDIT_ACTION: Record<RequisitionAction, string> = {
  edit: 'requisition.updated',
  submit: 'requisition.submitted',
  cancel: 'requisition.cancelled',
};

const DONE: Record<RequisitionAction, string> = {
  edit: 'edited',
  submit: 'submitted',
  cancel: 'cancelled',
};

function toRequisition(r: RequisitionRow, personId: string): Requisition {
  const lines = r.lines.map((l) => ({
    id: l.id,
    catalogItemId: l.catalogItemId,
    catalogItemName: l.catalogItem.name,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    amountMinor: l.amountMinor,
  }));
  return {
    id: r.id,
    companyId: r.companyId,
    requesterPersonId: r.requesterPersonId,
    requesterName: r.requester.name,
    costCenterId: r.costCenterId,
    justification: r.justification,
    status: r.status,
    lines,
    totalMinor: totalOf(lines),
    actions: offeredActions(r, personId),
  };
}

function refusalError(refusal: Refusal): HttpException {
  switch (refusal.reason) {
    case 'not-requester':
      return new ForbiddenException(
        'Only the requester may change a requisition',
      );
    case 'not-now':
      return new ConflictException(
        `A ${refusal.status.toLowerCase()} requisition cannot be ${DONE[refusal.action]}`,
      );
    case 'incomplete':
      return new ConflictException(
        `Cannot submit without ${refusal.missing.join(', ')}`,
      );
    default: {
      const unhandled: never = refusal;
      throw new Error(`Unhandled refusal ${JSON.stringify(unhandled)}`);
    }
  }
}

/** The saved draft as the audit log records it, prices included. */
function draftDetails(
  input: SaveRequisitionRequest,
  lines: PricedLine[],
): Prisma.InputJsonObject {
  return {
    costCenterId: input.costCenterId,
    justification: input.justification,
    lines: lines.map((l) => ({ ...l })),
  };
}

/** Copies each item's current catalog price onto its line. Only items of active suppliers. */
async function priceLines(
  tx: Tx,
  lines: RequisitionLineInput[],
): Promise<PricedLine[]> {
  const items = await tx.catalogItem.findMany({
    where: { id: { in: lines.map((l) => l.catalogItemId) } },
    include: { supplier: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return lines.map((line) => {
    const item = byId.get(line.catalogItemId);
    if (!item) {
      throw new BadRequestException(
        `Catalog item ${line.catalogItemId} does not exist`,
      );
    }
    if (!item.supplier.active) {
      throw new ConflictException(
        `${item.name} is from inactive supplier ${item.supplier.name} and cannot be chosen`,
      );
    }
    const amountMinor = lineAmount(line.quantity, item.unitPriceMinor);
    if (amountMinor === null) {
      throw new BadRequestException(`The amount for ${item.name} is too large`);
    }
    return { ...line, unitPriceMinor: item.unitPriceMinor, amountMinor };
  });
}

/**
 * Requisitions of the person asking (an admin reads all of the company's). Every method runs
 * inside the caller's TenantDb.run, so a change and its audit entry share one transaction.
 * Row-level security decides who sees and writes which rows; the requisition lifecycle module
 * decides which change is legal in which status.
 */
@Injectable()
export class RequisitionsService {
  async list(tx: Tx, scope: CompanyRequestScope): Promise<Requisition[]> {
    const rows = await tx.requisition.findMany({
      include: withDetails,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map((r) => toRequisition(r, scope.personId));
  }

  async get(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
  ): Promise<Requisition> {
    const row = await tx.requisition.findUnique({
      where: { id },
      include: withDetails,
    });
    if (!row) throw new NotFoundException();
    return toRequisition(row, scope.personId);
  }

  async create(
    tx: Tx,
    scope: CompanyRequestScope,
    input: SaveRequisitionRequest,
  ): Promise<Requisition> {
    const { id } = await tx.requisition.create({
      data: {
        companyId: scope.companyId,
        requesterPersonId: scope.personId,
        costCenterId: input.costCenterId,
        justification: input.justification,
      },
    });
    const lines = await this.writeLines(tx, scope, id, input.lines);
    await writeAudit(tx, scope, {
      action: 'requisition.created',
      entityType: 'requisition',
      entityId: id,
      details: draftDetails(input, lines),
    });
    return this.reread(tx, scope, id);
  }

  /** Replaces the draft's cost center, justification and lines, with fresh catalog prices. */
  async update(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    input: SaveRequisitionRequest,
  ): Promise<Requisition> {
    await this.loadForChange(tx, scope, id, 'edit');
    await tx.requisition.update({
      where: { id },
      data: {
        costCenterId: input.costCenterId,
        justification: input.justification,
      },
    });
    await tx.requisitionLine.deleteMany({ where: { requisitionId: id } });
    const lines = await this.writeLines(tx, scope, id, input.lines);
    await writeAudit(tx, scope, {
      action: AUDIT_ACTION.edit,
      entityType: 'requisition',
      entityId: id,
      details: draftDetails(input, lines),
    });
    return this.reread(tx, scope, id);
  }

  async transition(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    action: 'submit' | 'cancel',
  ): Promise<Requisition> {
    const { from, to } = await this.loadForChange(tx, scope, id, action);
    await tx.requisition.update({ where: { id }, data: { status: to } });
    await writeAudit(tx, scope, {
      action: AUDIT_ACTION[action],
      entityType: 'requisition',
      entityId: id,
      details: { from, to },
    });
    return this.reread(tx, scope, id);
  }

  /**
   * Locks the requisition, then asks the lifecycle whether the action is legal. The lock makes
   * a concurrent edit, submit or cancel wait, so the decision holds until this one commits.
   * FOR UPDATE only returns rows the person may change, so an admin reading someone else's
   * requisition locks nothing, and the lifecycle then refuses them.
   */
  private async loadForChange(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    action: RequisitionAction,
  ) {
    await tx.$queryRaw`SELECT id FROM requisitions WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.requisition.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row) return rejectUnmatchedWrite(tx, scope, REQUISITION_ROLES);
    const decision = decide(row, action, scope.personId);
    if (!decision.allowed) throw refusalError(decision);
    return { from: row.status, to: decision.to };
  }

  private async writeLines(
    tx: Tx,
    scope: CompanyRequestScope,
    requisitionId: string,
    input: RequisitionLineInput[],
  ): Promise<PricedLine[]> {
    const lines = await priceLines(tx, input);
    await tx.requisitionLine.createMany({
      data: lines.map((line, position) => ({
        ...line,
        companyId: scope.companyId,
        requisitionId,
        position,
      })),
    });
    return lines;
  }

  private async reread(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
  ): Promise<Requisition> {
    const row = await tx.requisition.findUniqueOrThrow({
      where: { id },
      include: withDetails,
    });
    return toRequisition(row, scope.personId);
  }
}
