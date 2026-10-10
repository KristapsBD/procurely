import type {
  CatalogItem,
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  Requisition,
} from '@procurely/shared-types';
import { formatAmount, parseMoney } from './money';

/** One line of the purchase order being made, quantity and price as typed. */
export interface OrderLineDraft {
  catalogItemId: string;
  name: string;
  quantity: string;
  /** In the company currency as typed ("24.99"). */
  price: string;
}

const QUANTITY = /^\d{1,6}$/;

export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!QUANTITY.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= 1 ? quantity : null;
}

/** Approved requisitions that have no purchase order yet: what a buyer can still order. */
export function orderable(
  requisitions: Requisition[],
  orders: PurchaseOrder[],
): Requisition[] {
  const ordered = new Set(orders.map((o) => o.requisitionId));
  return requisitions.filter(
    (r) => r.status === 'APPROVED' && !ordered.has(r.id),
  );
}

/**
 * The starting lines for ordering `requisition` from one supplier: the requisition's lines for
 * that supplier's items, at the price the requisition was priced at.
 */
export function initialLines(
  requisition: Requisition,
  catalog: CatalogItem[],
  supplierId: string,
): OrderLineDraft[] {
  return requisition.lines
    .filter(
      (l) =>
        catalog.find((i) => i.id === l.catalogItemId)?.supplierId ===
        supplierId,
    )
    .map((l) => ({
      catalogItemId: l.catalogItemId,
      name: l.catalogItemName,
      quantity: String(l.quantity),
      price: formatAmount(l.unitPriceMinor),
    }));
}

/** The request the form would send, or null while a line has no valid quantity or price. */
export function toOrderRequest(
  requisitionId: string,
  supplierId: string,
  lines: OrderLineDraft[],
): CreatePurchaseOrderRequest | null {
  if (lines.length === 0) return null;
  const parsed = lines.map((l) => ({
    catalogItemId: l.catalogItemId,
    quantity: parseQuantity(l.quantity),
    unitPriceMinor: parseMoney(l.price),
  }));
  if (parsed.some((l) => l.quantity === null || l.unitPriceMinor === null)) {
    return null;
  }
  return {
    requisitionId,
    supplierId,
    lines: parsed.map((l) => ({
      catalogItemId: l.catalogItemId,
      quantity: l.quantity as number,
      unitPriceMinor: l.unitPriceMinor as number,
    })),
  };
}

/** The total of the lines that parse, in minor units. */
export function estimateTotal(lines: OrderLineDraft[]): number {
  return lines.reduce(
    (sum, l) =>
      sum + (parseQuantity(l.quantity) ?? 0) * (parseMoney(l.price) ?? 0),
    0,
  );
}
