// Money school maths for the loan widget and the December series (pure functions, no database).
import { describe, expect, it } from 'vitest';
import { installment, loanTotals, perMonth } from '../src/features/help/learn/math';

describe('installment', () => {
  it('0% is just the amount ÷ the months', () => {
    expect(installment(1_200_000, 0, 12)).toBe(100_000);
    expect(installment(1000, 0, 3)).toBe(333);
  });

  it('matches the usual fixed-payment formula (yearly rate ÷ 12), rounded to the cent', () => {
    // 1 000.00 at 12% a year over 12 months → 88.85 a month
    expect(installment(100_000, 12, 12)).toBe(8885);
    expect(installment(100_000, 20, 12)).toBe(9263);
    expect(installment(100_000, 20, 36)).toBe(3716);
  });

  it('copes with odd input', () => {
    expect(installment(0, 10, 12)).toBe(0);
    expect(installment(-500, 10, 12)).toBe(0);
    expect(installment(1000, 10, 0)).toBe(installment(1000, 10, 1));
    expect(installment(1000, 0, 1)).toBe(1000);
  });
});

describe('loanTotals', () => {
  it('0%: the last payment absorbs the rounding and the total is exactly the amount', () => {
    const t = loanTotals(1000, 0, 3);
    expect(t.schedule.map((x) => x.pay)).toEqual([333, 333, 334]);
    expect(t.installment).toBe(333);
    expect(t.last).toBe(334);
    expect(t.total).toBe(1000);
    expect(t.interest).toBe(0);
  });

  it('total = the sum of the payments, the capital is paid back exactly and nothing is left owed', () => {
    for (const [p, r, n] of [[100_000, 20, 12], [100_000, 20, 36], [100_000, 12, 12], [500_000, 30, 60], [12_345, 7.5, 7], [99, 3, 1]]) {
      const t = loanTotals(p, r, n);
      expect(t.schedule).toHaveLength(n);
      expect(t.total).toBe(t.schedule.reduce((s, x) => s + x.pay, 0));
      expect(t.schedule.reduce((s, x) => s + x.capital, 0)).toBe(p);
      expect(t.interest).toBe(t.total - p);
      expect(t.schedule.at(-1)!.owed).toBe(0);
      // every payment but the last is the installment; the last is within a few cents of it
      expect(t.schedule.slice(0, -1).every((x) => x.pay === t.installment)).toBe(true);
      expect(Math.abs(t.last - t.installment)).toBeLessThanOrEqual(n);
    }
  });

  it('known example: 1 000.00 at 20% a year over 12 months', () => {
    const t = loanTotals(100_000, 20, 12);
    expect(t.installment).toBe(9263);
    expect(t.last).toBe(9268);
    expect(t.total).toBe(111_161);
    expect(t.interest).toBe(11_161);
    expect(t.schedule[0]).toEqual({ pay: 9263, interest: 1667, capital: 7596, owed: 92_404 });
  });

  it('more interest at the start, more capital at the end', () => {
    const t = loanTotals(100_000, 20, 12);
    expect(t.schedule[0].interest).toBeGreaterThan(t.schedule[11].interest);
    expect(t.schedule[0].capital).toBeLessThan(t.schedule[11].capital);
  });

  it('a longer term: a smaller installment but more interest in total', () => {
    const short = loanTotals(100_000, 20, 12);
    const long = loanTotals(100_000, 20, 36);
    expect(long.installment).toBeLessThan(short.installment);
    expect(long.interest).toBeGreaterThan(short.interest);
    expect(long.total).toBe(133_795);
  });

  it('nothing borrowed, nothing paid', () => {
    const t = loanTotals(0, 15, 6);
    expect(t.total).toBe(0);
    expect(t.interest).toBe(0);
  });
});

describe('perMonth', () => {
  it('turns weekly pocket money into about-per-month', () => {
    expect(perMonth(12_000, 'week')).toBe(52_000);
    expect(perMonth(50_000, 'month')).toBe(50_000);
    expect(perMonth(50_000, null)).toBe(50_000);
  });
});
