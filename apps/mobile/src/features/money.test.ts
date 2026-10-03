import { formatMoney, parseMoney } from './money';

describe('formatMoney', () => {
  it('shows minor units as a decimal amount with the company currency', () => {
    expect(formatMoney(2499, 'EUR')).toBe('24.99 EUR');
    expect(formatMoney(27900, 'SEK')).toBe('279.00 SEK');
    expect(formatMoney(5, 'EUR')).toBe('0.05 EUR');
    expect(formatMoney(0, 'EUR')).toBe('0.00 EUR');
  });
});

describe('parseMoney', () => {
  it('turns a typed amount into integer minor units without rounding errors', () => {
    expect(parseMoney('24.99')).toBe(2499);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('1199')).toBe(119900);
    expect(parseMoney(' 279,50 ')).toBe(27950);
    expect(parseMoney('4.35')).toBe(435);
  });

  it('rejects anything that is not a plain non-negative amount', () => {
    for (const text of ['', 'abc', '-1', '1.234', '1e3', '12345678', '1.']) {
      expect(parseMoney(text)).toBeNull();
    }
  });
});
