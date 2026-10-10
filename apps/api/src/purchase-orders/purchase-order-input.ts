import { BadRequestException } from '@nestjs/common';
import type {
  CreatePurchaseOrderRequest,
  PurchaseOrderLineInput,
} from '../contract/api.dto';
import {
  requireArray,
  requireMinorAmount,
  requirePositiveInteger,
  requireUuid,
} from '../contract/input';

function parseLine(value: unknown, index: number): PurchaseOrderLineInput {
  const line = (value ?? {}) as Partial<PurchaseOrderLineInput>;
  const field = `lines[${index}]`;
  return {
    catalogItemId: requireUuid(line.catalogItemId, `${field}.catalogItemId`),
    quantity: requirePositiveInteger(line.quantity, `${field}.quantity`),
    unitPriceMinor: requireMinorAmount(
      line.unitPriceMinor,
      `${field}.unitPriceMinor`,
    ),
  };
}

export function parseCreatePurchaseOrder(
  body: Partial<CreatePurchaseOrderRequest> | undefined,
): CreatePurchaseOrderRequest {
  const lines = requireArray(body?.lines, 'lines').map(parseLine);
  if (lines.length === 0) {
    throw new BadRequestException('A purchase order needs at least one line');
  }
  const items = new Set(lines.map((l) => l.catalogItemId));
  if (items.size !== lines.length) {
    throw new BadRequestException('An item may appear on only one line');
  }
  return {
    requisitionId: requireUuid(body?.requisitionId, 'requisitionId'),
    supplierId: requireUuid(body?.supplierId, 'supplierId'),
    lines,
  };
}
