import { BadRequestException } from '@nestjs/common';
import { isUuid } from '../tenancy/uuid';

/** Largest amount a Postgres integer column holds. */
const MAX_MINOR_AMOUNT = 2 ** 31 - 1;

/** A non-blank string, trimmed. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

/** Undefined when the field is absent, otherwise whatever `parse` makes of it. */
export function optional<T>(
  value: unknown,
  field: string,
  parse: (value: unknown, field: string) => T,
): T | undefined {
  return value === undefined ? undefined : parse(value, field);
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

export function requireUuid(value: unknown, field: string): string {
  if (!isUuid(value)) throw new BadRequestException(`${field} must be a UUID`);
  return value;
}

/** Money in integer minor units (cents, öre): a whole number, zero or more. */
export function requireMinorAmount(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_MINOR_AMOUNT
  ) {
    throw new BadRequestException(
      `${field} must be a whole number of minor units, zero or more`,
    );
  }
  return value;
}

/** A partial update must name at least one field. */
export function requireAnyField<T extends object>(
  update: T,
  fields: string,
): T {
  const named = Object.values(update).some((v) => v !== undefined);
  if (!named) throw new BadRequestException(`${fields} is required`);
  return update;
}
