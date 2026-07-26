import {
  absDecimal, compareDecimal, isDecimalString, multiplyDecimalByInt, subtractDecimal
} from 'src/modules/engineering-plants/domain/exact-decimal';

describe('Exact decimal string arithmetic — API-075 envelope comparison', () => {
  it('recognizes decimal strings and rejects everything else', () => {
    for (const value of ['0', '2', '-2', '2.0000', '-0.5', '25450.123456789012']) {
      expect(isDecimalString(value)).toBe(true);
    }
    for (const value of ['', '.', '2.', '.5', '1e3', 'NaN', '0x10', '2,5', 2, null, undefined, {}]) {
      expect(isDecimalString(value)).toBe(false);
    }
  });

  it.each([
    ['2', '2.0000', 0],
    ['2.0001', '2', 1],
    ['-2', '-1.9999', -1],
    ['-0.0000', '0', 0],
    ['10', '9.999999999999', 1],
    ['-2.5', '2.5', -1]
  ] as const)('compares %s vs %s as %d', (a, b, expected) => {
    expect(compareDecimal(a, b)).toBe(expected);
  });

  it('compares values floating point would get wrong', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; exact decimals do not care.
    expect(compareDecimal('0.3', '0.30000')).toBe(0);
    expect(compareDecimal('0.300000000001', '0.3')).toBe(1);
  });

  it('subtracts exactly across scales and signs', () => {
    expect(subtractDecimal('2.5', '1.25')).toBe('1.25');
    expect(subtractDecimal('1.25', '2.5')).toBe('-1.25');
    expect(subtractDecimal('2', '2.0000')).toBe('0');
    expect(subtractDecimal('-1.5', '0.5')).toBe('-2');
    expect(subtractDecimal('0.3', '0.1')).toBe('0.2');
  });

  it('takes absolute values without arithmetic', () => {
    expect(absDecimal('-2.5')).toBe('2.5');
    expect(absDecimal('2.5')).toBe('2.5');
    expect(absDecimal('0')).toBe('0');
  });

  it('multiplies by a plain integer exactly', () => {
    expect(multiplyDecimalByInt('1.0', 5)).toBe('5');
    expect(multiplyDecimalByInt('0.5', 15)).toBe('7.5');
    expect(multiplyDecimalByInt('-0.25', 4)).toBe('-1');
    expect(multiplyDecimalByInt('2.5', 0)).toBe('0');
  });

  it('refuses non-decimal operands and non-integer factors loudly', () => {
    expect(() => compareDecimal('1e3', '1')).toThrow(TypeError);
    expect(() => subtractDecimal('1', 'abc')).toThrow(TypeError);
    expect(() => multiplyDecimalByInt('1', 1.5)).toThrow(TypeError);
    expect(() => multiplyDecimalByInt('1', -2)).toThrow(TypeError);
  });
});
