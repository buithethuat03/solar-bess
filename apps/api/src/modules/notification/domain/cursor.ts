import { BadRequestException } from '@nestjs/common';

/**
 * Notifications are ordered newest-first, so the cursor carries the same `(createdAt, id)` pair the
 * ORDER BY uses. `id` breaks ties because the projection can insert several rows in one transaction
 * and `createdAt` alone is not unique.
 */
export interface NotificationCursor { createdAt: string; id: string }

export function encodeNotificationCursor(value: NotificationCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeNotificationCursor(value: string | undefined): NotificationCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isNotificationCursor(parsed)) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ', retryable: false
    });
  }
}

function isNotificationCursor(value: unknown): value is NotificationCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.createdAt === 'string'
    && Number.isFinite(Date.parse(candidate.createdAt))
    && typeof candidate.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id);
}
