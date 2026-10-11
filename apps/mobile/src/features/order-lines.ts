import type { GoodsReceipt } from '@procurely/shared-types';

export interface LineNote {
  /** "Note" for a delivery that came with one, since the API has no damage flag, "Correction" for a negative entry. */
  kind: 'Note' | 'Correction';
  text: string;
}

/** The notes recorded against one order line across its receipts, oldest receipt first. */
export function lineNotes(
  receipts: GoodsReceipt[],
  purchaseOrderLineId: string,
): LineNote[] {
  return [...receipts]
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .flatMap((r) => r.lines)
    .filter((l) => l.purchaseOrderLineId === purchaseOrderLineId && l.note)
    .map((l) => ({
      kind: l.quantity < 0 ? 'Correction' : 'Note',
      text: l.note as string,
    }));
}
