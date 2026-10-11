import type { GoodsReceipt } from '@procurely/shared-types';
import { lineNotes } from './order-lines';

function receipt(
  receivedAt: string,
  lines: { line: string; quantity: number; note: string | null }[],
): GoodsReceipt {
  return {
    id: receivedAt,
    companyId: 'c',
    purchaseOrderId: 'po',
    receivedByPersonId: 'p',
    receivedByName: 'Carol',
    receivedAt,
    lines: lines.map((l, i) => ({
      id: `${receivedAt}-${i}`,
      purchaseOrderLineId: l.line,
      catalogItemName: 'Pens',
      quantity: l.quantity,
      note: l.note,
    })),
  };
}

describe('lineNotes', () => {
  const receipts = [
    receipt('2026-10-12T08:00:00.000Z', [
      { line: 'a', quantity: -1, note: 'counted twice' },
    ]),
    receipt('2026-10-11T08:00:00.000Z', [
      { line: 'a', quantity: 5, note: '2 boxes crushed' },
      { line: 'b', quantity: 3, note: 'other line' },
      { line: 'a', quantity: 1, note: null },
    ]),
  ];

  it('collects the notes of one line, oldest first, and marks corrections', () => {
    expect(lineNotes(receipts, 'a')).toEqual([
      { kind: 'Note', text: '2 boxes crushed' },
      { kind: 'Correction', text: 'counted twice' },
    ]);
  });

  it('is empty for a line with no notes', () => {
    expect(lineNotes(receipts, 'c')).toEqual([]);
  });
});
