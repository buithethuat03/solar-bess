import { BadRequestException } from '@nestjs/common';

/** Opaque keyset cursor for the newest-first API-086 workfront listing; `id` breaks ties. */
export interface FieldHseQualityCursor { createdAt: string; id: string }

export function encodeFieldHseQualityCursor(value: FieldHseQualityCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeFieldHseQualityCursor(
  value: string | undefined
): FieldHseQualityCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isFieldHseQualityCursor(parsed)) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ', retryable: false
    });
  }
}

function isFieldHseQualityCursor(value: unknown): value is FieldHseQualityCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.createdAt === 'string'
    && Number.isFinite(Date.parse(candidate.createdAt))
    && typeof candidate.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id);
}
