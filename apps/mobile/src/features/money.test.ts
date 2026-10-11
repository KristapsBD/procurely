import { formatMoney, parseMoney } from './money';

describe('formatMoney', () => {
  it('shows minor units as a currency amount with the symbol or code in front', () => {
    expect(formatMoney(57800, 'EUR')).toBe('€578.00');
    expect(formatMoney(123450, 'SEK')).toBe('SEK\u00a01,234.50');
    expect(formatMoney(2499, 'EUR')).toBe('€24.99');
    expect(formatMoney(5, 'EUR')).toBe('€0.05');
    expect(formatMoney(0, 'EUR')).toBe('€0.00');
  });

  it('puts the sign before the currency for negative minor units', () => {
    expect(formatMoney(-500, 'EUR')).toBe('-€5.00');
    expect(formatMoney(-5, 'EUR')).toBe('-€0.05');
    expect(formatMoney(-27900, 'SEK')).toBe('-SEK\u00a0279.00');
  });

  it('keeps every digit of the minor amount, with no float drift', () => {
    expect(formatMoney(435, 'EUR')).toBe('€4.35');
    expect(formatMoney(50001, 'EUR')).toBe('€500.01');
    expect(formatMoney(49999, 'EUR')).toBe('€499.99');
    expect(formatMoney(999999999, 'EUR')).toBe('€9,999,999.99');
    expect(formatMoney(-435, 'EUR')).toBe('-€4.35');
    expect(formatMoney(-999999999, 'SEK')).toBe('-SEK\u00a09,999,999.99');
  });

  it('matches the exact digits across the whole range up to the API limit', () => {
    for (let minor = 0; minor <= 999999999; minor += 104729) {
      const digits = String(minor).padStart(3, '0');
      const exact = `${digits.slice(0, -2)}.${digits.slice(-2)}`.replace(
        /\B(?=(\d{3})+(?!\d)(?=\.))/g,
        ',',
      );
      expect(formatMoney(minor, 'EUR')).toBe(`€${exact}`);
    }
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
