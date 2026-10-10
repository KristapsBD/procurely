import type { PurchaseOrderStatus } from '../contract/api.dto';

export interface ReceivableLine {
  quantity: number;
  receivedQuantity: number;
}

/**
 * The status of an order, derived from what was received: an order is never updated, so there
 * is no stored status to keep in step. A closure exists only for a fully received order.
 */
export function statusOf(
  lines: readonly ReceivableLine[],
  closed: boolean,
): PurchaseOrderStatus {
  if (closed) return 'CLOSED';
  if (lines.every((l) => l.receivedQuantity === l.quantity)) {
    return 'FULLY_RECEIVED';
  }
  return lines.some((l) => l.receivedQuantity > 0)
    ? 'PARTIALLY_RECEIVED'
    : 'ISSUED';
}
