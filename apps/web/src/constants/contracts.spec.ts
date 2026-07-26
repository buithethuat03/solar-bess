import { formatMoney, sumMoney } from './contracts';

/** The display separator: narrow no-break space, never a digit-altering conversion. */
const S = '\u202F';

describe('contract money helpers — string end-to-end', () => {
  it('groups integer digits without ever rounding or converting', () => {
    // 2^53 + 1: any Number() round-trip would silently turn …993 into …992.
    expect(formatMoney('9007199254740993.0001')).toBe(`9${S}007${S}199${S}254${S}740${S}993.0001`);
    expect(formatMoney('1250000000.5')).toBe(`1${S}250${S}000${S}000.5`);
    expect(formatMoney('-2500000.5')).toBe(`-2${S}500${S}000.5`);
    expect(formatMoney('999')).toBe('999');
    expect(formatMoney('0')).toBe('0');
  });

  it('renders absence as a dash, never as zero', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('')).toBe('—');
  });

  it('sums decimal text exactly at any magnitude via scaled BigInt', () => {
    // The classic float trap: 0.1 + 0.2 must be exactly 0.3.
    expect(sumMoney(['0.1', '0.2'])).toBe('0.3');
    // Largest DTO money (15 integer digits, 4 dp) still carries every digit exactly.
    expect(sumMoney(['999999999999999.9998', '0.0001'])).toBe('999999999999999.9999');
    expect(sumMoney(['110000.0001', '-11000', '-99000.0001'])).toBe('0');
    expect(sumMoney(['-0.0001', '-0.0002'])).toBe('-0.0003');
    expect(sumMoney([])).toBe('0');
  });

  it('refuses to sum as soon as one entry is not valid signed-money text', () => {
    expect(sumMoney(['10', 'abc'])).toBeNull();
    expect(sumMoney(['10', ''])).toBeNull();
    expect(sumMoney(['1.00001'])).toBeNull();
  });
});
