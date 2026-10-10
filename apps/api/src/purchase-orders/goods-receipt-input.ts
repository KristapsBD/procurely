import { BadRequestException } from '@nestjs/common';
import type {
  CreateGoodsReceiptRequest,
  GoodsReceiptLineInput,
} from '../contract/api.dto';
import { MAX_MINOR_AMOUNT, requireArray, requireUuid } from '../contract/input';

export const MAX_NOTE_LENGTH = 500;

function parseQuantity(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value === 0 ||
    Math.abs(value) > MAX_MINOR_AMOUNT
  ) {
    throw new BadRequestException(`${field} must be a whole number, not zero`);
  }
  return value;
}

function parseNote(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  const note = value.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    throw new BadRequestException(
      `${field} must be at most ${MAX_NOTE_LENGTH} characters`,
    );
  }
  return note === '' ? undefined : note;
}

function parseLine(value: unknown, index: number): GoodsReceiptLineInput {
  const line = (value ?? {}) as Partial<GoodsReceiptLineInput>;
  const field = `lines[${index}]`;
  const quantity = parseQuantity(line.quantity, `${field}.quantity`);
  const note = parseNote(line.note, `${field}.note`);
  if (quantity < 0 && note === undefined) {
    throw new BadRequestException(
      `${field}.note is required to correct an earlier entry`,
    );
  }
  return {
    purchaseOrderLineId: requireUuid(
      line.purchaseOrderLineId,
      `${field}.purchaseOrderLineId`,
    ),
    quantity,
    ...(note === undefined ? {} : { note }),
  };
}

export function parseCreateGoodsReceipt(
  body: Partial<CreateGoodsReceiptRequest> | undefined,
): CreateGoodsReceiptRequest {
  const lines = requireArray(body?.lines, 'lines').map(parseLine);
  if (lines.length === 0) {
    throw new BadRequestException('A receipt needs at least one line');
  }
  if (new Set(lines.map((l) => l.purchaseOrderLineId)).size !== lines.length) {
    throw new BadRequestException('An order line may appear once per receipt');
  }
  return { lines };
}
