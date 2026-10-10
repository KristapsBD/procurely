import type {
  CreateGoodsReceiptRequest,
  PurchaseOrder,
} from '@procurely/shared-types';

type PurchaseOrderStatus = PurchaseOrder['status'];

/** What a buyer typed for one order line. Blank quantity means nothing arrived for the line. */
export interface ReceiptLineDraft {
  purchaseOrderLineId: string;
  quantity: string;
  note: string;
}

const QUANTITY = /^-?\d{1,6}$/;

/** A whole number, not zero, negative to correct an earlier entry. Null otherwise. */
export function parseReceiptQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!QUANTITY.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity === 0 ? null : quantity;
}

export function emptyDrafts(order: PurchaseOrder): ReceiptLineDraft[] {
  return order.lines.map((l) => ({
    purchaseOrderLineId: l.id,
    quantity: '',
    note: '',
  }));
}

/** Why this line's draft cannot be sent, or null when it can (or is blank). */
export function lineIssue(
  order: PurchaseOrder,
  draft: ReceiptLineDraft,
): string | null {
  if (draft.quantity.trim() === '') return null;
  const quantity = parseReceiptQuantity(draft.quantity);
  if (quantity === null) return 'Enter a whole number, not zero';
  const line = order.lines.find((l) => l.id === draft.purchaseOrderLineId);
  if (!line) return 'Not a line of this order';
  const net = line.receivedQuantity + quantity;
  if (net > line.quantity) {
    return `Only ${line.quantity - line.receivedQuantity} still expected`;
  }
  if (net < 0) return `Only ${line.receivedQuantity} received so far`;
  if (quantity < 0 && draft.note.trim() === '') {
    return 'A correction needs a note';
  }
  return null;
}

/** The request the panel would send, or null while nothing is entered or a line has an issue. */
export function toReceiptRequest(
  order: PurchaseOrder,
  drafts: ReceiptLineDraft[],
): CreateGoodsReceiptRequest | null {
  const entered = drafts.filter((d) => d.quantity.trim() !== '');
  if (entered.length === 0) return null;
  if (entered.some((d) => lineIssue(order, d) !== null)) return null;
  return {
    lines: entered.map((d) => ({
      purchaseOrderLineId: d.purchaseOrderLineId,
      quantity: parseReceiptQuantity(d.quantity) as number,
      ...(d.note.trim() === '' ? {} : { note: d.note.trim() }),
    })),
  };
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_RECEIVED: 'Partially received',
  FULLY_RECEIVED: 'Fully received',
  CLOSED: 'Closed',
};

export function statusLabel(status: PurchaseOrderStatus): string {
  return STATUS_LABELS[status];
}
