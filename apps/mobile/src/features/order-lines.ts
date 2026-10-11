import type { GoodsReceipt } from '@procurely/shared-types';

/** A short, stable reference for a purchase order, which the API identifies only by uuid. */
export function orderReference(orderId: string): string {
  return `PO-${orderId.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

export interface LineNote {
  /** "Damage" for a delivery that came with a note, "Correction" for a negative entry. */
  kind: 'Damage' | 'Correction';
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
      kind: l.quantity < 0 ? 'Correction' : 'Damage',
      text: l.note as string,
    }));
}
