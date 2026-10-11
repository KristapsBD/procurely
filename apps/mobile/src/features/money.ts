/**
 * Amounts are integer minor units of the company currency (cents, öre), shown as "€578.00" or
 * "SEK 1,234.50". Rounding to two decimals keeps every cent for amounts up to the API's limit.
 */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** The amount alone ("24.99"), as a price field shows it for editing. */
export function formatAmount(minor: number): string {
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${minor < 0 ? '-' : ''}${major}.${cents}`;
}

/** Up to 7 digits, so the result always fits the API's integer price column. */
const AMOUNT = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/** A typed amount ("24.99", "279,5", "1199") in minor units, or null when it is not one. */
export function parseMoney(text: string): number | null {
  const match = AMOUNT.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
