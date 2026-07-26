import { BadRequestException } from '@nestjs/common';

/**
 * Opaque keyset cursor for the API-013 audit trail: newest-first over `(occurred_at, id)`, with the
 * id breaking ties inside one timestamp. Lives as a flat file because ADR-001 forbids tactical
 * layer directories under identity-access.
 */
export interface AuditEventCursor { occurredAt: string; id: string }

export function encodeAuditEventCursor(value: AuditEventCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeAuditEventCursor(value: string | undefined): AuditEventCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isAuditEventCursor(parsed)) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ', retryable: false
    });
  }
}

function isAuditEventCursor(value: unknown): value is AuditEventCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.occurredAt === 'string'
    && Number.isFinite(Date.parse(candidate.occurredAt))
    && typeof candidate.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id);
}
