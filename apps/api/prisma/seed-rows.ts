// Turns requisition histories and the hand-written reference data into one array of rows per
// table. This is the only place that derives a route, a decision note, an audit entry, an id or a
// receipt total, and it uses the API's own lifecycle functions to do it, so the seed cannot
// disagree with the API. A history the API could not have produced throws.

import type { Prisma } from '@prisma/client';
import type { Role } from '../src/contract/api.dto';
import {
  approvalRequirement,
  autoApprovalNote,
  decide,
  decideApproval,
  lineAmount,
  routeOf,
  totalOf,
  type ApprovalRuleState,
  type RequisitionState,
} from '../src/requisitions/requisition-lifecycle';
import { statusOf } from '../src/purchase-orders/purchase-order-status';
import { bulkHistories } from './seed-bulk';
import { reference, storyHistories } from './seed-data';
import { membershipId, rulesAsOf, seedId } from './seed-kit';
import type {
  At,
  OrderSpec,
  Outcome,
  ReceiptSpec,
  Reference,
  RequisitionHistory,
  SeedRows,
} from './seed-types';

type CatalogRow = Reference['catalogItems'][number];
type AuditRow = Prisma.AuditLogCreateManyInput;

function must(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Seed: ${message}`);
}

function ascending(label: string, ...instants: At[]): void {
  for (let i = 1; i < instants.length; i++) {
    must(
      instants[i].getTime() > instants[i - 1].getTime(),
      `${label}: ${instants[i].toISOString()} is not after ${instants[i - 1].toISOString()}`,
    );
  }
}

interface Context {
  ref: Reference;
  currencyOf(companyId: string): string;
  roleOf(companyId: string, personId: string): Role | null;
  item(companyId: string, catalogItemId: string): CatalogRow;
  costCenterId(companyId: string, code: string): string;
  supplierActive(supplierId: string): boolean;
  rulesAsOf(companyId: string, instant: At): ApprovalRuleState[];
}

const costCenterId = (companyId: string, code: string) =>
  seedId('cost-center', companyId, code);

function contextOf(ref: Reference): Context {
  const items = new Map(ref.catalogItems.map((i) => [i.id, i]));
  const suppliers = new Map(ref.suppliers.map((s) => [s.id as string, s]));
  return {
    ref,
    currencyOf(companyId) {
      const company = ref.companies.find((c) => c.id === companyId);
      must(company, `unknown company ${companyId}`);
      return company.currency;
    },
    roleOf(companyId, personId) {
      const m = ref.memberships.find(
        (x) => x.companyId === companyId && x.personId === personId && x.active,
      );
      return m?.role ?? null;
    },
    item(companyId, catalogItemId) {
      const found = items.get(catalogItemId);
      must(found, `unknown catalog item ${catalogItemId}`);
      must(found.companyId === companyId, `${found.name} is another company's`);
      return found;
    },
    costCenterId(companyId, code) {
      must(
        ref.costCenters.some(
          (c) => c.companyId === companyId && c.code === code,
        ),
        `unknown cost center ${code}`,
      );
      return costCenterId(companyId, code);
    },
    supplierActive: (supplierId) => suppliers.get(supplierId)?.active !== false,
    rulesAsOf: (companyId, instant) =>
      rulesAsOf(ref.approvalRules, companyId, instant),
  };
}

interface AuditInput {
  at: At;
  companyId: string;
  actorPersonId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: Prisma.InputJsonObject;
  id?: string;
}

/** Collects rows per table and audit events, which it orders by instant when finished. */
class Sink {
  readonly rows: SeedRows = {
    companies: [],
    people: [],
    memberships: [],
    costCenters: [],
    suppliers: [],
    catalogItems: [],
    approvalRules: [],
    requisitions: [],
    requisitionLines: [],
    requisitionDecisions: [],
    purchaseOrders: [],
    purchaseOrderLines: [],
    goodsReceipts: [],
    goodsReceiptLines: [],
    purchaseOrderClosures: [],
    pushDevices: [],
    auditLog: [],
  };
  private events: { at: At; row: AuditRow }[] = [];

  audit(e: AuditInput): void {
    this.events.push({
      at: e.at,
      row: {
        id: e.id ?? seedId('audit', e.entityId ?? '', e.action),
        companyId: e.companyId,
        actorPersonId: e.actorPersonId,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        details: e.details,
        createdAt: e.at,
      },
    });
  }

  finish(): SeedRows {
    const ordered = this.events
      .map((event, index) => ({ ...event, index }))
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.index - b.index);
    const ids = new Set<string>();
    for (const { row } of ordered) {
      must(!ids.has(row.id!), `duplicate audit id ${row.id}`);
      ids.add(row.id!);
      this.rows.auditLog.push(row);
    }
    return this.rows;
  }
}

function addReference(ctx: Context, sink: Sink): void {
  const { ref } = ctx;
  const { rows } = sink;
  rows.companies.push(...ref.companies);
  rows.people.push(...ref.people);
  rows.memberships.push(
    ...ref.memberships.map((m) => ({
      ...m,
      id: membershipId(m.companyId, m.personId),
    })),
  );
  rows.costCenters.push(
    ...ref.costCenters.map((c) => ({
      ...c,
      id: costCenterId(c.companyId, c.code),
    })),
  );
  rows.suppliers.push(...ref.suppliers);
  rows.catalogItems.push(...ref.catalogItems);
  rows.approvalRules.push(...ref.approvalRules);
  rows.pushDevices.push(
    ...ref.pushDevices.map((d) => ({
      ...d,
      id: seedId('push-device', d.token),
    })),
  );
  ref.audit.forEach((e) => sink.audit(e));
}

interface PricedLine {
  catalogItemId: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
}

function pricedLines(ctx: Context, h: RequisitionHistory): PricedLine[] {
  must(h.lines.length > 0, `${h.id} has no lines`);
  return h.lines.map((line) => {
    must(line.quantity >= 1, `${h.id}: a line needs a positive quantity`);
    const item = ctx.item(h.companyId, line.catalogItemId);
    must(
      ctx.supplierActive(item.supplierId),
      `${h.id}: ${item.name} is from an inactive supplier`,
    );
    const amountMinor = lineAmount(line.quantity, item.unitPriceMinor);
    must(
      amountMinor !== null,
      `${h.id}: the amount for ${item.name} is too big`,
    );
    return { ...line, unitPriceMinor: item.unitPriceMinor, amountMinor };
  });
}

type Stage = Pick<
  Prisma.RequisitionCreateManyInput,
  'status' | 'approvalRoute' | 'decisionNote'
>;

/** What the requisition looks like at some point, in the lifecycle's own terms. */
interface Walk {
  ctx: Context;
  sink: Sink;
  h: RequisitionHistory;
  costCenter: string | null;
  lines: PricedLine[];
  stage: Stage;
}

const stateOf = (w: Walk): RequisitionState => ({
  status: w.stage.status ?? 'DRAFT',
  requesterPersonId: w.h.requesterPersonId,
  costCenterId: w.costCenter,
  justification: w.h.justification,
  approvalRoute: w.stage.approvalRoute ?? null,
  lines: w.lines,
});

function recordRequisition(
  w: Walk,
  at: At,
  action: string,
  actorPersonId: string,
  details: Prisma.InputJsonObject,
): void {
  w.sink.audit({
    at,
    companyId: w.h.companyId,
    actorPersonId,
    action,
    entityType: 'requisition',
    entityId: w.h.id,
    details,
  });
}

function cancel(w: Walk, at: At): void {
  const requirement = approvalRequirement(
    w.ctx.rulesAsOf(w.h.companyId, at),
    totalOf(w.lines),
  );
  const verdict = decide(
    stateOf(w),
    'cancel',
    w.h.requesterPersonId,
    requirement,
  );
  must(
    verdict.allowed,
    `${w.h.id}: cannot be cancelled (${JSON.stringify(verdict)})`,
  );
  recordRequisition(w, at, 'requisition.cancelled', w.h.requesterPersonId, {
    from: stateOf(w).status,
    to: verdict.to,
  });
  w.stage = { ...w.stage, status: verdict.to };
}

function submit(w: Walk, at: At): void {
  const total = totalOf(w.lines);
  const rules = w.ctx.rulesAsOf(w.h.companyId, at);
  const requirement = approvalRequirement(rules, total);
  const verdict = decide(
    stateOf(w),
    'submit',
    w.h.requesterPersonId,
    requirement,
  );
  must(
    verdict.allowed,
    `${w.h.id}: cannot be submitted (${JSON.stringify(verdict)})`,
  );
  const auto = verdict.to === 'APPROVED';
  const decisionNote = auto
    ? autoApprovalNote(total, rules, w.ctx.currencyOf(w.h.companyId))
    : null;
  recordRequisition(w, at, 'requisition.submitted', w.h.requesterPersonId, {
    from: 'DRAFT',
    to: verdict.to,
  });
  if (auto) {
    recordRequisition(
      w,
      at,
      'requisition.auto_approved',
      w.h.requesterPersonId,
      {
        totalMinor: total,
        note: decisionNote,
      },
    );
  }
  w.stage = {
    status: verdict.to,
    approvalRoute: routeOf(requirement),
    decisionNote,
  };
}

type Decided = Extract<Outcome, { status: 'APPROVED' | 'REJECTED' }>;

function decideStep(w: Walk, o: Decided): void {
  const { decision } = o;
  must(decision, `${w.h.id}: no decision to apply`);
  ascending(`${w.h.id} decision`, o.at, decision.at);
  must(
    o.status === 'APPROVED' || decision.comment?.trim(),
    `${w.h.id}: a rejection needs a reason`,
  );
  const action = o.status === 'APPROVED' ? 'approve' : 'reject';
  const actor = {
    personId: decision.by,
    role: w.ctx.roleOf(w.h.companyId, decision.by),
  };
  const verdict = decideApproval(stateOf(w), action, actor);
  must(
    verdict.allowed,
    `${w.h.id}: ${decision.by} may not decide (${JSON.stringify(verdict)})`,
  );
  recordRequisition(
    w,
    decision.at,
    `requisition.${o.status.toLowerCase()}`,
    decision.by,
    {
      from: 'SUBMITTED',
      to: verdict.to,
      approvalRoute: w.stage.approvalRoute ?? null,
      note: decision.comment,
    },
  );
  w.sink.rows.requisitionDecisions.push({
    id: seedId('requisition-decision', w.h.id),
    companyId: w.h.companyId,
    requisitionId: w.h.id,
    actorPersonId: decision.by,
    outcome: verdict.to,
    comment: decision.comment,
    createdAt: decision.at,
  });
  w.stage = { ...w.stage, status: verdict.to, decisionNote: decision.comment };
}

function walkOutcome(w: Walk): void {
  const o = w.h.outcome;
  switch (o.status) {
    case 'DRAFT':
      return;
    case 'SUBMITTED':
      ascending(`${w.h.id} submit`, w.h.createdAt, o.at);
      return submit(w, o.at);
    case 'CANCELLED':
      must(
        (o.from === 'SUBMITTED') === (o.submittedAt !== undefined),
        `${w.h.id}: submittedAt belongs to a cancelled submission only`,
      );
      if (o.submittedAt) {
        ascending(`${w.h.id} cancel`, w.h.createdAt, o.submittedAt, o.at);
        submit(w, o.submittedAt);
      } else {
        ascending(`${w.h.id} cancel`, w.h.createdAt, o.at);
      }
      return cancel(w, o.at);
    default:
      ascending(`${w.h.id} submit`, w.h.createdAt, o.at);
      submit(w, o.at);
      if (o.decision) return decideStep(w, o);
      must(
        o.status === 'APPROVED' && w.stage.status === 'APPROVED',
        `${w.h.id}: only an under-threshold submit is decided by nobody`,
      );
  }
}

function checkOutcomeReached(w: Walk): void {
  const wanted = w.h.outcome.status;
  must(
    w.stage.status === wanted,
    `${w.h.id}: the rules lead to ${w.stage.status}, not ${wanted}`,
  );
}

function requisitionRows(
  ctx: Context,
  sink: Sink,
  h: RequisitionHistory,
): PricedLine[] {
  const role = ctx.roleOf(h.companyId, h.requesterPersonId);
  must(
    role === 'REQUESTER' || role === 'ADMIN',
    `${h.id}: ${h.requesterPersonId} may not request`,
  );
  const lines = pricedLines(ctx, h);
  const costCenter =
    h.costCenterCode === null
      ? null
      : ctx.costCenterId(h.companyId, h.costCenterCode);
  const w: Walk = {
    ctx,
    sink,
    h,
    costCenter,
    lines,
    stage: { status: 'DRAFT', approvalRoute: null, decisionNote: null },
  };
  recordRequisition(
    w,
    h.createdAt,
    'requisition.created',
    h.requesterPersonId,
    {
      costCenterId: costCenter,
      justification: h.justification,
      lines: lines.map(
        ({ catalogItemId, quantity, unitPriceMinor, amountMinor }) => ({
          catalogItemId,
          quantity,
          unitPriceMinor,
          amountMinor,
        }),
      ),
    },
  );
  walkOutcome(w);
  checkOutcomeReached(w);
  sink.rows.requisitions.push({
    id: h.id,
    companyId: h.companyId,
    requesterPersonId: h.requesterPersonId,
    costCenterId: costCenter,
    justification: h.justification,
    createdAt: h.createdAt,
    ...w.stage,
  });
  sink.rows.requisitionLines.push(
    ...lines.map((line, position) => ({
      id: seedId('requisition-line', h.id, String(position)),
      companyId: h.companyId,
      requisitionId: h.id,
      position,
      ...line,
    })),
  );
  return lines;
}

function approvedAt(o: Outcome): At {
  must(o.status === 'APPROVED', 'an order needs an approved requisition');
  return o.decision?.at ?? o.at;
}

interface OrderLine {
  catalogItemId: string;
  quantity: number;
  unitPriceMinor: number;
}

function orderLines(
  spec: OrderSpec,
  requisitionLines: PricedLine[],
): OrderLine[] {
  return spec.lines ?? requisitionLines;
}

function supplierOf(
  ctx: Context,
  h: RequisitionHistory,
  lines: OrderLine[],
): string {
  const suppliers = new Set(
    lines.map((l) => ctx.item(h.companyId, l.catalogItemId).supplierId),
  );
  must(suppliers.size === 1, `${h.id}: an order has one supplier`);
  const [supplierId] = suppliers;
  must(ctx.supplierActive(supplierId), `${h.id}: the supplier is inactive`);
  return supplierId;
}

function canBuy(ctx: Context, companyId: string, personId: string): boolean {
  const role = ctx.roleOf(companyId, personId);
  return role === 'BUYER' || role === 'ADMIN';
}

interface Receivable {
  id: string;
  quantity: number;
  received: number;
}

const statusNow = (poLines: Receivable[]) =>
  statusOf(
    poLines.map((l) => ({
      quantity: l.quantity,
      receivedQuantity: l.received,
    })),
    false,
  );

function applyEntry(
  receiptId: string,
  poLines: Receivable[],
  entry: ReceiptSpec['lines'][number],
): void {
  const line = poLines[entry.position];
  must(line, `${receiptId}: no order line ${entry.position}`);
  must(entry.quantity !== 0, `${receiptId}: a zero receipt`);
  must(
    entry.quantity > 0 || entry.note?.trim(),
    `${receiptId}: a correction needs a note`,
  );
  line.received += entry.quantity;
  must(
    line.received >= 0 && line.received <= line.quantity,
    `${receiptId}: line ${entry.position} would hold ${line.received} of ${line.quantity}`,
  );
}

function receiptRows(
  ctx: Context,
  sink: Sink,
  h: RequisitionHistory,
  spec: OrderSpec,
  poLines: Receivable[],
): void {
  let previous = spec.at;
  for (const r of spec.receipts) {
    ascending(`${spec.id} receipt ${r.id}`, previous, r.at);
    previous = r.at;
    must(canBuy(ctx, h.companyId, r.by), `${spec.id}: ${r.by} may not receive`);
    must(r.lines.length > 0, `${r.id} has no lines`);
    const before = statusNow(poLines);
    r.lines.forEach((entry) => applyEntry(r.id, poLines, entry));
    const after = statusNow(poLines);
    sink.rows.goodsReceipts.push({
      id: r.id,
      companyId: h.companyId,
      purchaseOrderId: spec.id,
      receivedByPersonId: r.by,
      receivedAt: r.at,
    });
    const lineRows = r.lines.map((entry) => ({
      id: seedId('goods-receipt-line', r.id, String(entry.position)),
      companyId: h.companyId,
      goodsReceiptId: r.id,
      purchaseOrderId: spec.id,
      purchaseOrderLineId: poLines[entry.position].id,
      quantity: entry.quantity,
      note: entry.note,
    }));
    sink.rows.goodsReceiptLines.push(...lineRows);
    sink.audit({
      at: r.at,
      companyId: h.companyId,
      actorPersonId: r.by,
      action: 'goods_receipt.recorded',
      entityType: 'goods_receipt',
      entityId: r.id,
      details: {
        purchaseOrderId: spec.id,
        lines: lineRows.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          quantity: l.quantity,
          note: l.note,
        })),
        statusBefore: before,
        statusAfter: after,
      },
    });
  }
}

function closureRows(
  ctx: Context,
  sink: Sink,
  h: RequisitionHistory,
  spec: OrderSpec,
  poLines: Receivable[],
): void {
  const { closure } = spec;
  if (!closure) return;
  const last = spec.receipts.at(-1)?.at ?? spec.at;
  ascending(`${spec.id} closure`, last, closure.at);
  must(
    canBuy(ctx, h.companyId, closure.by),
    `${spec.id}: ${closure.by} may not close`,
  );
  const status = statusNow(poLines);
  must(
    status === 'FULLY_RECEIVED',
    `${spec.id}: only a fully received order closes, not ${status}`,
  );
  sink.rows.purchaseOrderClosures.push({
    id: seedId('purchase-order-closure', spec.id),
    companyId: h.companyId,
    purchaseOrderId: spec.id,
    closedByPersonId: closure.by,
    closedAt: closure.at,
  });
  sink.audit({
    at: closure.at,
    companyId: h.companyId,
    actorPersonId: closure.by,
    action: 'purchase_order.closed',
    entityType: 'purchase_order',
    entityId: spec.id,
    details: { statusBefore: 'FULLY_RECEIVED', statusAfter: 'CLOSED' },
  });
}

function orderRows(
  ctx: Context,
  sink: Sink,
  h: RequisitionHistory,
  requisitionLines: PricedLine[],
  spec: OrderSpec,
): void {
  ascending(`${spec.id} order`, approvedAt(h.outcome), spec.at);
  must(
    canBuy(ctx, h.companyId, spec.by),
    `${spec.id}: ${spec.by} may not order`,
  );
  const lines = orderLines(spec, requisitionLines).map((l) => ({
    catalogItemId: l.catalogItemId,
    quantity: l.quantity,
    unitPriceMinor: l.unitPriceMinor,
    amountMinor: lineAmount(l.quantity, l.unitPriceMinor)!,
  }));
  const supplierId = supplierOf(ctx, h, lines);
  sink.rows.purchaseOrders.push({
    id: spec.id,
    companyId: h.companyId,
    requisitionId: h.id,
    supplierId,
    createdByPersonId: spec.by,
    createdAt: spec.at,
  });
  const poLines = lines.map((line, position) => ({
    ...line,
    id: seedId('purchase-order-line', spec.id, String(position)),
    position,
  }));
  sink.rows.purchaseOrderLines.push(
    ...poLines.map((l) => ({
      id: l.id,
      companyId: h.companyId,
      purchaseOrderId: spec.id,
      position: l.position,
      catalogItemId: l.catalogItemId,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      amountMinor: l.amountMinor,
    })),
  );
  sink.audit({
    at: spec.at,
    companyId: h.companyId,
    actorPersonId: spec.by,
    action: 'purchase_order.created',
    entityType: 'purchase_order',
    entityId: spec.id,
    details: {
      requisitionId: h.id,
      supplierId,
      totalMinor: totalOf(lines),
      lines,
    },
  });
  const receivable = poLines.map((l) => ({
    id: l.id,
    quantity: l.quantity,
    received: 0,
  }));
  receiptRows(ctx, sink, h, spec, receivable);
  closureRows(ctx, sink, h, spec, receivable);
}

/** The single owner of every derived rule: histories and reference data in, table rows out. */
export function materialize(
  histories: readonly RequisitionHistory[],
  ref: Reference,
): SeedRows {
  const ctx = contextOf(ref);
  const sink = new Sink();
  addReference(ctx, sink);
  const justifications = new Set<string>();
  for (const h of histories) {
    must(
      !justifications.has(h.justification),
      `${h.id}: duplicate justification`,
    );
    justifications.add(h.justification);
    const lines = requisitionRows(ctx, sink, h);
    if (h.order) orderRows(ctx, sink, h, lines, h.order);
  }
  return sink.finish();
}

/** Every row of the seed: the story layer and the bulk layer over the reference data. */
export function seedRows(): SeedRows {
  return materialize([...bulkHistories(), ...storyHistories], reference);
}
