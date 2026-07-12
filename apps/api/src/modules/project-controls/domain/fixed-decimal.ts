const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

export class FixedDecimalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixedDecimalValidationError';
  }
}

export function parseFixedDecimal(value: string | number, scale: number): bigint {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 12) {
    throw new FixedDecimalValidationError('decimal scale must be an integer between 0 and 12');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new FixedDecimalValidationError('decimal value must be finite');
  }
  const raw = typeof value === 'number' ? String(value) : value;
  if (raw.trim() !== raw) throw new FixedDecimalValidationError('decimal value must not contain whitespace');
  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) throw new FixedDecimalValidationError('decimal value has an invalid format');
  const fraction = match[3] ?? '';
  if (fraction.length > scale) {
    throw new FixedDecimalValidationError(`decimal value must have at most ${scale} fractional digits`);
  }
  const magnitude = BigInt(match[2]) * powerOfTen(scale)
    + BigInt(fraction.padEnd(scale, '0') || '0');
  return match[1] === '-' ? -magnitude : magnitude;
}

export function formatFixedDecimal(value: bigint, scale: number): string {
  const factor = powerOfTen(scale);
  const sign = value < 0n ? '-' : '';
  const magnitude = value < 0n ? -value : value;
  if (scale === 0) return `${sign}${magnitude}`;
  const whole = magnitude / factor;
  const fraction = (magnitude % factor).toString().padStart(scale, '0');
  return `${sign}${whole}.${fraction}`;
}

export function divideAndRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new FixedDecimalValidationError('denominator must be positive');
  if (numerator === 0n) return 0n;
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  return sign * ((magnitude + denominator / 2n) / denominator);
}

export function powerOfTen(scale: number): bigint {
  return 10n ** BigInt(scale);
}
