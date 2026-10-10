// The bulk layer of the seed: about 200 requisition histories for each company that has people,
// generated from a fixed random seed and fixed UTC instants, so every machine and every reset
// gets the same rows. The window ends before the story layer begins. Who requests, who decides and
// who buys follows each company's people and approval rules.

import {
  approvalRequirement,
  mayDecide,
  type ApprovalRequirement,
} from '../src/requisitions/requisition-lifecycle';
import {
  COMPANY,
  PERSON,
  approvalRules,
  catalogItems,
  costCenters,
  memberships,
  suppliers,
} from './seed-data';
import { DAY, HOUR, MINUTE, Rng, plus, seedId } from './seed-kit';
import type {
  LineSpec,
  Outcome,
  OrderSpec,
  ReceiptSpec,
  RequisitionHistory,
} from './seed-types';

export const BULK_SEED = 0x5eed2026;
export const BULK_PER_COMPANY = 200;

const WINDOW_START = Date.UTC(2026, 2, 2, 8);
const WINDOW_END = Date.UTC(2026, 5, 25, 17);

type Kind =
  | 'draft'
  | 'cancelDraft'
  | 'cancelSubmitted'
  | 'submitted'
  | 'rejected'
  | 'approved'
  | 'issued'
  | 'partial'
  | 'fully'
  | 'closed';

const KINDS: readonly (readonly [Kind, number])[] = [
  ['draft', 8],
  ['cancelDraft', 5],
  ['cancelSubmitted', 7],
  ['submitted', 12],
  ['rejected', 12],
  ['approved', 10],
  ['issued', 12],
  ['partial', 13],
  ['fully', 12],
  ['closed', 9],
];
const APPROVED_KINDS: ReadonlySet<Kind> = new Set([
  'approved',
  'issued',
  'partial',
  'fully',
  'closed',
]);
const WAITING_KINDS: ReadonlySet<Kind> = new Set([
  'cancelSubmitted',
  'submitted',
]);

const REJECTIONS = [
  'Over budget for this quarter.',
  'Please consolidate with the open request for the same items.',
  'This is covered by the framework agreement already in place.',
  'Not needed this quarter. Ask again after the review.',
];
const APPROVALS = ['Approved.', 'Go ahead.', 'Fine, order it.'];
const DAMAGE_NOTES = [
  'Some units arrived damaged. The supplier will redeliver.',
  'Packaging was torn open and part of the delivery is unusable.',
  'Short delivery, the rest is promised for next week.',
];
const CORRECTION_NOTES = [
  'Counted again at the dock: fewer units than first recorded.',
  'Wrong model delivered and sent back.',
];
const REPLACEMENT_NOTES = [
  'Replacement delivered.',
  'The missing units arrived.',
];

interface Plan {
  companyId: string;
  tag: string;
  requesters: string[];
  buyers: string[];
  costCenters: string[];
  catalogBySupplier: { catalogItemId: string; supplierId: string }[][];
  topics: string[];
  maxQuantity: number;
}

const itemsOf = (companyId: string) => {
  const active = new Set(
    suppliers
      .filter((s) => s.companyId === companyId && s.active)
      .map((s) => s.id),
  );
  const bySupplier = new Map<
    string,
    { catalogItemId: string; supplierId: string }[]
  >();
  for (const item of catalogItems) {
    if (item.companyId !== companyId || !active.has(item.supplierId)) continue;
    const list = bySupplier.get(item.supplierId) ?? [];
    list.push({ catalogItemId: item.id, supplierId: item.supplierId });
    bySupplier.set(item.supplierId, list);
  }
  return [...bySupplier.values()];
};

const buyersOf = (companyId: string) =>
  memberships
    .filter((m) => m.companyId === companyId && m.active)
    .flatMap((m) =>
      m.role === 'BUYER'
        ? [m.personId, m.personId, m.personId, m.personId]
        : m.role === 'ADMIN'
          ? [m.personId]
          : [],
    );

const centersOf = (companyId: string) =>
  costCenters.filter((c) => c.companyId === companyId).map((c) => c.code);

const plan = (
  companyId: string,
  tag: string,
  requesters: string[],
  topics: string[],
  maxQuantity = 14,
): Plan => ({
  companyId,
  tag,
  requesters,
  buyers: buyersOf(companyId),
  costCenters: centersOf(companyId),
  catalogBySupplier: itemsOf(companyId),
  topics,
  maxQuantity,
});

const { alice, paula, frida, ivan, lukas, gustav } = PERSON;

const PLANS: Plan[] = [
  plan(
    COMPANY.main,
    'A',
    [alice, alice, alice, paula, paula],
    [
      'Monthly restock',
      'Request from the team',
      'Replacement order',
      'Planned purchase',
      'Urgent request',
    ],
  ),
  plan(
    COMPANY.sek,
    'N',
    [frida],
    [
      'Månadens inköp',
      'Begäran från teamet',
      'Ersättningsbeställning',
      'Planerat inköp',
    ],
    30,
  ),
  plan(
    COMPANY.large,
    'M',
    [ivan, ivan, lukas, lukas, gustav],
    [
      'Monthly restock',
      'Request from the shift',
      'Replacement order',
      'Planned purchase',
      'Urgent request',
    ],
  ),
];

function rulesAsOf(companyId: string, instant: Date) {
  return approvalRules
    .filter((r) => r.companyId === companyId && r.createdAt <= instant)
    .map((r) => ({
      thresholdMinor: r.thresholdMinor,
      requiredRole: r.requiredRole,
    }));
}

const priceOf = new Map(catalogItems.map((i) => [i.id, i.unitPriceMinor]));

function linesFor(rng: Rng, p: Plan): LineSpec[] {
  const pool = [...rng.pick(p.catalogBySupplier)];
  const count = Math.min(pool.length, rng.int(1, 3));
  const lines: LineSpec[] = [];
  for (let i = 0; i < count; i++) {
    const [{ catalogItemId }] = pool.splice(rng.int(0, pool.length - 1), 1);
    lines.push({ catalogItemId, quantity: rng.int(2, p.maxQuantity) });
  }
  return lines;
}

const totalOf = (lines: LineSpec[]) =>
  lines.reduce((sum, l) => sum + l.quantity * priceOf.get(l.catalogItemId)!, 0);

const decidersFor = (
  p: Plan,
  requirement: ApprovalRequirement,
  requester: string,
) =>
  memberships
    .filter((m) => m.companyId === p.companyId && m.active)
    .filter(
      (m) =>
        mayDecide(
          requirement,
          { personId: m.personId, role: m.role },
          requester,
        ).allowed,
    )
    .map((m) => m.personId);

function kindFor(
  rng: Rng,
  requirement: ApprovalRequirement,
  deciders: string[],
): Kind {
  const auto = requirement.kind === 'under-threshold';
  return rng.weighted(
    KINDS.filter(([kind]) => {
      if (kind === 'draft' || kind === 'cancelDraft') return true;
      if (auto) return APPROVED_KINDS.has(kind);
      return WAITING_KINDS.has(kind) || deciders.length > 0;
    }),
  );
}

function receipt(
  poId: string,
  n: number,
  by: string,
  at: Date,
  lines: ReceiptSpec['lines'],
): ReceiptSpec {
  return { id: seedId('goods-receipt', poId, String(n)), by, at, lines };
}

/** Receipts that leave the order partly received: damaged or short deliveries. */
function partialReceipts(
  rng: Rng,
  poId: string,
  buyers: string[],
  from: Date,
  lines: LineSpec[],
): ReceiptSpec[] {
  const ordered = lines[0].quantity;
  const first = rng.int(1, ordered - 1);
  const noteOf = (m: number) =>
    m === 0 && rng.chance(0.5) ? rng.pick(DAMAGE_NOTES) : null;
  const receipts = [
    receipt(poId, 1, rng.pick(buyers), plus(from, rng.int(2, 7) * DAY), [
      { position: 0, quantity: first, note: noteOf(0) },
    ]),
  ];
  const left = ordered - first - 1;
  if (left >= 1 && rng.chance(0.3)) {
    receipts.push(
      receipt(
        poId,
        2,
        rng.pick(buyers),
        plus(receipts[0].at, rng.int(1, 5) * DAY),
        [{ position: 0, quantity: rng.int(1, left), note: null }],
      ),
    );
  }
  return receipts;
}

/** Receipts that deliver every line in full: in one go, in two, or with a correction. */
function completeReceipts(
  rng: Rng,
  poId: string,
  buyers: string[],
  from: Date,
  lines: LineSpec[],
): ReceiptSpec[] {
  const full = (skip = -1) =>
    lines.flatMap((l, position) =>
      position === skip ? [] : [{ position, quantity: l.quantity, note: null }],
    );
  const at1 = plus(from, rng.int(2, 7) * DAY);
  const at2 = plus(at1, rng.int(1, 5) * DAY);
  const at3 = plus(at2, rng.int(1, 5) * DAY);
  const ordered = lines[0].quantity;
  const shape = rng.weighted([
    ['single', 14],
    ['split', 5],
    ['corrected', 3],
  ] as const);
  const by = () => rng.pick(buyers);
  if (shape === 'single') return [receipt(poId, 1, by(), at1, full())];
  const part = rng.int(1, ordered - 1);
  if (shape === 'split') {
    return [
      receipt(poId, 1, by(), at1, [
        {
          position: 0,
          quantity: part,
          note: rng.chance(0.5) ? rng.pick(DAMAGE_NOTES) : null,
        },
        ...full(0),
      ]),
      receipt(poId, 2, by(), at2, [
        { position: 0, quantity: ordered - part, note: null },
      ]),
    ];
  }
  return [
    receipt(poId, 1, by(), at1, full()),
    receipt(poId, 2, by(), at2, [
      { position: 0, quantity: -part, note: rng.pick(CORRECTION_NOTES) },
    ]),
    receipt(poId, 3, by(), at3, [
      { position: 0, quantity: part, note: rng.pick(REPLACEMENT_NOTES) },
    ]),
  ];
}

function orderFor(
  rng: Rng,
  p: Plan,
  kind: Kind,
  requisitionId: string,
  approvedAt: Date,
  lines: LineSpec[],
): OrderSpec | undefined {
  if (kind === 'approved') return undefined;
  const id = seedId('purchase-order', requisitionId);
  const at = plus(approvedAt, rng.int(1, 72) * HOUR);
  const by = rng.pick(p.buyers);
  if (kind === 'issued') return { id, by, at, receipts: [] };
  if (kind === 'partial') {
    return {
      id,
      by,
      at,
      receipts: partialReceipts(rng, id, p.buyers, at, lines),
    };
  }
  const receipts = completeReceipts(rng, id, p.buyers, at, lines);
  if (kind === 'fully') return { id, by, at, receipts };
  const closedAt = plus(receipts[receipts.length - 1].at, rng.int(1, 3) * DAY);
  return {
    id,
    by,
    at,
    receipts,
    closure: { by: rng.pick(p.buyers), at: closedAt },
  };
}

interface Ending {
  outcome: Outcome;
  order?: OrderSpec;
}

function endingFor(
  rng: Rng,
  p: Plan,
  kind: Kind,
  requisitionId: string,
  submitAt: Date,
  requirement: ApprovalRequirement,
  deciders: string[],
  lines: LineSpec[],
): Ending {
  switch (kind) {
    case 'draft':
      return { outcome: { status: 'DRAFT' } };
    case 'cancelDraft':
      return {
        outcome: {
          status: 'CANCELLED',
          from: 'DRAFT',
          at: plus(submitAt, rng.int(1, 30) * MINUTE),
        },
      };
    case 'submitted':
      return { outcome: { status: 'SUBMITTED', at: submitAt } };
    case 'cancelSubmitted':
      return {
        outcome: {
          status: 'CANCELLED',
          from: 'SUBMITTED',
          submittedAt: submitAt,
          at: plus(submitAt, rng.int(1, 40) * HOUR),
        },
      };
    case 'rejected':
      return {
        outcome: {
          status: 'REJECTED',
          at: submitAt,
          decision: {
            by: rng.pick(deciders),
            at: plus(submitAt, rng.int(1, 48) * HOUR),
            comment: rng.pick(REJECTIONS),
          },
        },
      };
    default: {
      if (requirement.kind === 'under-threshold') {
        return {
          outcome: { status: 'APPROVED', at: submitAt },
          order: orderFor(rng, p, kind, requisitionId, submitAt, lines),
        };
      }
      const decidedAt = plus(submitAt, rng.int(1, 48) * HOUR);
      return {
        outcome: {
          status: 'APPROVED',
          at: submitAt,
          decision: {
            by: rng.pick(deciders),
            at: decidedAt,
            comment: rng.chance(0.6) ? rng.pick(APPROVALS) : null,
          },
        },
        order: orderFor(rng, p, kind, requisitionId, decidedAt, lines),
      };
    }
  }
}

function historyOf(
  rng: Rng,
  p: Plan,
  index: number,
  createdAt: Date,
): RequisitionHistory {
  const id = seedId('requisition', p.companyId, String(index));
  const requester = rng.pick(p.requesters);
  const lines = linesFor(rng, p);
  const submitAt = plus(createdAt, rng.int(5, 120) * MINUTE);
  const requirement = approvalRequirement(
    rulesAsOf(p.companyId, submitAt),
    totalOf(lines),
  );
  const deciders = decidersFor(p, requirement, requester);
  const kind = kindFor(rng, requirement, deciders);
  const topic = rng.pick(p.topics);
  const ending = endingFor(
    rng,
    p,
    kind,
    id,
    submitAt,
    requirement,
    deciders,
    lines,
  );
  const unfinished = kind === 'draft' && rng.chance(0.3);
  return {
    id,
    companyId: p.companyId,
    requesterPersonId: requester,
    costCenterCode: unfinished ? null : rng.pick(p.costCenters),
    justification: `${topic}, ref ${p.tag}${String(index + 1).padStart(3, '0')}`,
    lines,
    createdAt,
    ...ending,
  };
}

function planHistories(p: Plan, rng: Rng): RequisitionHistory[] {
  const step = (WINDOW_END - WINDOW_START) / BULK_PER_COMPANY;
  return Array.from({ length: BULK_PER_COMPANY }, (_, index) => {
    const createdAt = new Date(
      Math.floor(
        WINDOW_START + index * step + rng.int(0, step / MINUTE - 1) * MINUTE,
      ),
    );
    return historyOf(rng, p, index, createdAt);
  });
}

export function bulkHistories(seed = BULK_SEED): RequisitionHistory[] {
  return PLANS.flatMap((p, i) => planHistories(p, new Rng(seed + i * 7919)));
}
