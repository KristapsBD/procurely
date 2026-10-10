import { createHash } from 'node:crypto';

/**
 * A UUID derived from a namespace and parts, so every seeded row has the same id on every machine
 * and every reset. Formatted as a version 4, variant 8 UUID, which the database accepts.
 */
export function seedId(namespace: string, ...parts: string[]): string {
  const hex = createHash('sha256')
    .update([namespace, ...parts].join('\u0000'))
    .digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** A fixed UTC instant from an ISO string. */
export function at(iso: string): Date {
  return new Date(iso);
}

export function membershipId(companyId: string, personId: string): string {
  return seedId('membership', companyId, personId);
}

/** A small seeded PRNG, so the bulk layer is identical on every machine and every run. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** mulberry32: a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** A key of the table, in proportion to its weight. */
  weighted<K extends string>(table: readonly (readonly [K, number])[]): K {
    const total = table.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.next() * total;
    for (const [key, weight] of table) {
      roll -= weight;
      if (roll < 0) return key;
    }
    return table[table.length - 1][0];
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function plus(instant: Date, ms: number): Date {
  return new Date(instant.getTime() + ms);
}
