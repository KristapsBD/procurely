import { createHash } from 'node:crypto';
import { statusOf } from '../src/purchase-orders/purchase-order-status';
import { BULK_SEED, bulkHistories } from '../prisma/seed-bulk';
import {
  COMPANY,
  REQUISITION,
  reference,
  storyHistories,
} from '../prisma/seed-data';
import { materialize, seedRows } from '../prisma/seed-rows';
import type { RequisitionHistory, SeedRows } from '../prisma/seed-types';

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

const time = (instant: Date | string) => new Date(instant).getTime();

const fingerprint = (rows: SeedRows) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(rows)))
    .digest('hex');

function orderStatuses(rows: SeedRows): Set<string> {
  const closed = new Set(
    rows.purchaseOrderClosures.map((c) => c.purchaseOrderId),
  );
  const received = new Map<string, number>();
  for (const l of rows.goodsReceiptLines) {
    received.set(
      l.purchaseOrderLineId,
      (received.get(l.purchaseOrderLineId) ?? 0) + l.quantity,
    );
  }
  return new Set(
    rows.purchaseOrders.map((po) =>
      statusOf(
        rows.purchaseOrderLines
          .filter((l) => l.purchaseOrderId === po.id)
          .map((l) => ({
            quantity: l.quantity,
            receivedQuantity: received.get(l.id!) ?? 0,
          })),
        closed.has(po.id!),
      ),
    ),
  );
}

const REQUISITION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];
const ORDER_STATUSES = [
  'ISSUED',
  'PARTIALLY_RECEIVED',
  'FULLY_RECEIVED',
  'CLOSED',
];

describe('seed', () => {
  const rows = seedRows();

  it('has the same rows on every machine and every run', () => {
    expect(fingerprint(rows)).toBe(
      'f576af57a498c0f9eb141856a1f35c4600a4567fbad39138468b9f6293b2cb4d',
    );
    expect(fingerprint(seedRows())).toBe(fingerprint(rows));
  });

  it('depends on the random seed', () => {
    expect(bulkHistories(BULK_SEED + 1)).not.toEqual(bulkHistories());
  });

  it('gives about 200 histories to each company with people, and none to the empty one', () => {
    const count = (companyId: string) =>
      bulkHistories().filter((h) => h.companyId === companyId).length;
    for (const id of [COMPANY.main, COMPANY.sek, COMPANY.large]) {
      expect(count(id)).toBeGreaterThanOrEqual(190);
      expect(count(id)).toBeLessThanOrEqual(210);
    }
    expect(count(COMPANY.empty)).toBe(0);
  });

  it('puts the bulk layer before the story layer', () => {
    const instants = (h: RequisitionHistory) =>
      JSON.stringify(h).match(/\d{4}-\d\d-\d\dT[\d:.]+Z/g)!;
    const newestBulk = bulkHistories().flatMap(instants).sort().at(-1)!;
    const oldestStory = storyHistories
      .filter((h) => h.id !== REQUISITION.fridaApproved)
      .flatMap(instants)
      .sort()[0];
    expect(newestBulk < oldestStory).toBe(true);
  });

  it('straddles the 500.00 approver threshold in the large company by one cent', () => {
    const total = (id: string) =>
      rows.requisitionLines
        .filter((l) => l.requisitionId === id)
        .reduce((sum, l) => sum + l.amountMinor, 0);
    const route = (id: string) =>
      rows.requisitions.find((r) => r.id === id)!.approvalRoute;
    const cases = [
      [REQUISITION.ivanUnderThreshold, 49999, 'UNDER_THRESHOLD'],
      [REQUISITION.ivanAtThreshold, 50000, 'APPROVER'],
      [REQUISITION.lukasOverThreshold, 50001, 'APPROVER'],
    ] as const;
    for (const [id, expected, expectedRoute] of cases) {
      expect([total(id), route(id)]).toEqual([expected, expectedRoute]);
    }
  });

  it('shows every requisition and order status in both layers', () => {
    for (const histories of [storyHistories, bulkHistories()]) {
      const layer = materialize(histories, reference);
      expect(new Set(layer.requisitions.map((r) => r.status))).toEqual(
        new Set(REQUISITION_STATUSES),
      );
      expect(orderStatuses(layer)).toEqual(new Set(ORDER_STATUSES));
    }
  });

  it('shows every requisition status in the bulk layer of each company', () => {
    for (const companyId of [COMPANY.main, COMPANY.sek, COMPANY.large]) {
      const layer = materialize(
        bulkHistories().filter((h) => h.companyId === companyId),
        reference,
      );
      expect(new Set(layer.requisitions.map((r) => r.status))).toEqual(
        new Set(REQUISITION_STATUSES),
      );
    }
  });

  it('shows the newest Acme audit page the latest invitation and deactivation', () => {
    const newest = rows.auditLog
      .map((row, seq) => ({ row, seq }))
      .filter(({ row }) => row.companyId === COMPANY.main)
      .sort(
        (a, b) =>
          time(b.row.createdAt!) - time(a.row.createdAt!) || b.seq - a.seq,
      )
      .slice(0, 200)
      .map(({ row }) => [row.action, row.details]);
    expect(newest).toEqual(
      expect.arrayContaining([
        [
          'member.invited',
          expect.objectContaining({ email: 'paula@procurely.test' }),
        ],
        ['member.deactivated', { email: 'oscar@procurely.test' }],
      ]),
    );
  });
});
