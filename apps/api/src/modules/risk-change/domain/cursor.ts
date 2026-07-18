import { BadRequestException } from '@nestjs/common';

export interface TimeCursor { createdAt: string; id: string }
export interface HistoryCursor { occurredAt: string; id: string }
export interface ClosureCursor { sequenceNo: number; id: string }

export function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor<T extends object>(value: string | undefined, guard: (input: unknown) => input is T): T | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!guard(parsed)) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ', retryable: false
    });
  }
}

export const isTimeCursor = (value: unknown): value is TimeCursor => isRecord(value)
  && isIso(value.createdAt) && isUuid(value.id);
export const isHistoryCursor = (value: unknown): value is HistoryCursor => isRecord(value)
  && isIso(value.occurredAt) && isUuid(value.id);
export const isClosureCursor = (value: unknown): value is ClosureCursor => isRecord(value)
  && Number.isInteger(value.sequenceNo) && (value.sequenceNo as number) >= 1 && isUuid(value.id);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
