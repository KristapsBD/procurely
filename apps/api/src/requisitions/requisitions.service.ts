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
  DecisionAction,
  RequesterAction,
  Requisition,
  RequisitionAction,
  RequisitionLineInput,
  SaveRequisitionRequest,
} from '../contract/api.dto';
import { writeAudit } from '../audit/audit-log';
import type { CompanyRequestScope } from '../tenancy/request-scope';
import {
  DECIDER_ROLES,
  REQUISITION_ROLES,
  rejectUnmatchedWrite,
} from '../tenancy/roles';
import {
  type Actor,
  type Refusal,
  approvalRequirement,
  autoApprovalNote,
  decide,
  decideApproval,
  lineAmount,
  offeredActions,
  routeOf,
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
  approve: 'requisition.approved',
  reject: 'requisition.rejected',
};

const DONE: Record<RequisitionAction, string> = {
  edit: 'edited',
  submit: 'submitted',
  cancel: 'cancelled',
  approve: 'approved',
  reject: 'rejected',
};

function toRequisition(r: RequisitionRow, actor: Actor): Requisition {
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
    approvalRoute: r.approvalRoute,
    decisionNote: r.decisionNote,
    lines,
    totalMinor: totalOf(lines),
    actions: offeredActions(r, actor),
  };
}

function refusalError(refusal: Refusal): HttpException {
  switch (refusal.reason) {
    case 'not-requester':
      return new ForbiddenException(
        'Only the requester may change a requisition',
      );
    case 'own-requisition':
      return new ForbiddenException(
        'You cannot approve or reject your own requisition',
      );
    case 'not-decider':
      return new ForbiddenException(
        'Your role may not approve or reject this requisition',
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

/** The person asking and their role in the company they act in. */
async function actorOf(tx: Tx, scope: CompanyRequestScope): Promise<Actor> {
  const own = await tx.membership.findFirst({
    where: {
      companyId: scope.companyId,
      personId: scope.personId,
      active: true,
    },
    select: { role: true },
  });
  return { personId: scope.personId, role: own?.role ?? null };
}

/**
 * Requisitions the person may read: their own, all of the company's for an admin, and for an
 * approver the submitted ones routed to approvers and those they decided. Every method runs
 * inside the caller's TenantDb.run, so a change and its audit entry share one transaction.
 * Row-level security decides who sees and writes which rows; the requisition lifecycle module
 * decides which change is legal in which status, and who decides by the approval rules.
 */
@Injectable()
export class RequisitionsService {
  async list(tx: Tx, scope: CompanyRequestScope): Promise<Requisition[]> {
    const rows = await tx.requisition.findMany({
      include: withDetails,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    const actor = await actorOf(tx, scope);
    return rows.map((r) => toRequisition(r, actor));
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
    return toRequisition(row, await actorOf(tx, scope));
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

  /**
   * Submit fixes who decides, by the company's rules now. Under every threshold it is approved
   * at once, and the requester reads why.
   */
  async transition(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    action: 'submit' | 'cancel',
  ): Promise<Requisition> {
    const { from, to, requirement, rules, totalMinor } =
      await this.loadForChange(tx, scope, id, action);
    const autoApproved = action === 'submit' && to === 'APPROVED';
    const decisionNote = autoApproved
      ? autoApprovalNote(totalMinor, rules, await this.currency(tx, scope))
      : null;
    await tx.requisition.update({
      where: { id },
      data:
        action === 'submit'
          ? { status: to, approvalRoute: routeOf(requirement), decisionNote }
          : { status: to },
    });
    await writeAudit(tx, scope, {
      action: AUDIT_ACTION[action],
      entityType: 'requisition',
      entityId: id,
      details: { from, to },
    });
    if (autoApproved) {
      await writeAudit(tx, scope, {
        action: 'requisition.auto_approved',
        entityType: 'requisition',
        entityId: id,
        details: { totalMinor, note: decisionNote },
      });
    }
    return this.reread(tx, scope, id);
  }

  /** Approve (comment optional) or reject (reason required) someone else's submitted requisition. */
  async decide(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    action: DecisionAction,
    note: string | null,
  ): Promise<Requisition> {
    const row = await this.lock(tx, id);
    if (!row) return rejectUnmatchedWrite(tx, scope, DECIDER_ROLES);
    const decision = decideApproval(row, action, await actorOf(tx, scope));
    if (!decision.allowed) throw refusalError(decision);
    // The decision row first: it is what lets an approver read the requisition once decided.
    await tx.requisitionDecision.createMany({
      data: [
        {
          companyId: scope.companyId,
          requisitionId: id,
          actorPersonId: scope.personId,
          outcome: decision.to,
          comment: note,
        },
      ],
    });
    await tx.requisition.update({
      where: { id },
      data: { status: decision.to, decisionNote: note },
    });
    await writeAudit(tx, scope, {
      action: AUDIT_ACTION[action],
      entityType: 'requisition',
      entityId: id,
      details: {
        from: row.status,
        to: decision.to,
        approvalRoute: row.approvalRoute,
        note,
      },
    });
    return this.reread(tx, scope, id);
  }

  /**
   * Locks the requisition. The lock makes a concurrent change wait, so a decision holds until
   * this one commits. FOR UPDATE only returns rows the person may change, so an admin reading
   * someone else's draft locks nothing, and the lifecycle then refuses them.
   */
  private async lock(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT id FROM requisitions WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.requisition.findUnique({
      where: { id },
      include: { lines: true },
    });
  }

  /** Locks the requisition, then asks the lifecycle whether the requester's action is legal. */
  private async loadForChange(
    tx: Tx,
    scope: CompanyRequestScope,
    id: string,
    action: RequesterAction,
  ) {
    const row = await this.lock(tx, id);
    if (!row) return rejectUnmatchedWrite(tx, scope, REQUISITION_ROLES);
    const rules = await tx.approvalRule.findMany({
      select: { thresholdMinor: true, requiredRole: true },
    });
    const totalMinor = totalOf(row.lines);
    const requirement = approvalRequirement(rules, totalMinor);
    const decision = decide(row, action, scope.personId, requirement);
    if (!decision.allowed) throw refusalError(decision);
    return {
      from: row.status,
      to: decision.to,
      requirement,
      rules,
      totalMinor,
    };
  }

  private async currency(tx: Tx, scope: CompanyRequestScope): Promise<string> {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: scope.companyId },
      select: { currency: true },
    });
    return company.currency;
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
    return toRequisition(row, await actorOf(tx, scope));
  }
}
