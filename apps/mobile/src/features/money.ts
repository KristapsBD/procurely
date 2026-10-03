/**
 * Amounts are integer minor units of the company currency (cents, öre). Converting through
 * strings, never floats, keeps 4.35 at 435 instead of 434.99999.
 */
export function formatMoney(minor: number, currency: string): string {
  const major = Math.floor(minor / 100);
  const cents = String(minor % 100).padStart(2, '0');
  return `${major}.${cents} ${currency}`;
}

/** Up to 7 digits, so the result always fits the API's integer price column. */
const AMOUNT = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/** A typed amount ("24.99", "279,5", "1199") in minor units, or null when it is not one. */
export function parseMoney(text: string): number | null {
  const match = AMOUNT.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
