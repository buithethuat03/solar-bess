/**
 * Exact decimal arithmetic over decimal STRINGS for the API-075 advisory dispatch check.
 *
 * NO FLOATS EVER: every value stays a string outside this file and a scaled BigInt inside it, so
 * the envelope comparison can never be corrupted by binary floating point. Only the minimal
 * operations the simulation needs exist — compare, subtract, absolute value and multiplication by
 * a plain integer — nothing here can round.
 */

const DECIMAL_PATTERN = /^-?\d{1,24}(\.\d{1,12})?$/;

export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value);
}

interface ScaledPair { a: bigint; b: bigint; scale: number }

function parseParts(value: string): { units: bigint; fractionDigits: number } {
  const negative = value.startsWith('-');
  const body = negative ? value.slice(1) : value;
  const [integerPart, fractionPart = ''] = body.split('.');
  const digits = `${integerPart}${fractionPart}`;
  const units = BigInt(digits) * (negative ? -1n : 1n);
  return { units, fractionDigits: fractionPart.length };
}

function toCommonScale(a: string, b: string): ScaledPair {
  const left = parseParts(a);
  const right = parseParts(b);
  const scale = Math.max(left.fractionDigits, right.fractionDigits);
  const scaleUp = (units: bigint, from: number) => units * 10n ** BigInt(scale - from);
  return {
    a: scaleUp(left.units, left.fractionDigits),
    b: scaleUp(right.units, right.fractionDigits),
    scale
  };
}

function render(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const integerPart = digits.slice(0, digits.length - scale) || '0';
  const fractionPart = scale === 0 ? '' : digits.slice(digits.length - scale).replace(/0+$/, '');
  const body = fractionPart === '' ? integerPart : `${integerPart}.${fractionPart}`;
  return negative && body !== '0' ? `-${body}` : body;
}

function assertDecimal(value: string, label: string): void {
  if (!isDecimalString(value)) {
    throw new TypeError(`${label} is not an exact decimal string: ${JSON.stringify(value)}`);
  }
}

/** Exact three-way comparison: -1 when a < b, 0 when equal, 1 when a > b. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  assertDecimal(a, 'left operand');
  assertDecimal(b, 'right operand');
  const scaled = toCommonScale(a, b);
  if (scaled.a < scaled.b) return -1;
  if (scaled.a > scaled.b) return 1;
  return 0;
}

/** Exact a - b as a decimal string with no trailing zeros. */
export function subtractDecimal(a: string, b: string): string {
  assertDecimal(a, 'left operand');
  assertDecimal(b, 'right operand');
  const scaled = toCommonScale(a, b);
  return render(scaled.a - scaled.b, scaled.scale);
}

/** Exact absolute value of a decimal string. */
export function absDecimal(value: string): string {
  assertDecimal(value, 'operand');
  return value.startsWith('-') ? value.slice(1) : value;
}

/** Exact value × integer factor (the factor must be a safe non-negative integer). */
export function multiplyDecimalByInt(value: string, factor: number): string {
  assertDecimal(value, 'operand');
  if (!Number.isSafeInteger(factor) || factor < 0) {
    throw new TypeError(`factor must be a non-negative integer: ${String(factor)}`);
  }
  const parsed = parseParts(value);
  return render(parsed.units * BigInt(factor), parsed.fractionDigits);
}
