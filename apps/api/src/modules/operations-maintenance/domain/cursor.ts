import { BadRequestException } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/** Opaque keyset cursor for the newest-first O&M listings (API-114/116/118); `id` breaks ties. */
export interface OperationsMaintenanceCursor { createdAt: string; id: string }

/** The only tables a cursor may be applied to — a closed set, so the table name is never injectable. */
export type CursorTable = 'alarm_cases' | 'service_incidents' | 'work_orders';

export function encodeOperationsCursor(value: OperationsMaintenanceCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeOperationsCursor(
  value: string | undefined
): OperationsMaintenanceCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isOperationsCursor(parsed)) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ', retryable: false
    });
  }
}

function isOperationsCursor(value: unknown): value is OperationsMaintenanceCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.createdAt === 'string'
    && Number.isFinite(Date.parse(candidate.createdAt))
    && typeof candidate.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id);
}

/**
 * Adds the keyset predicate for one page, comparing ROW-WISE against what the boundary row actually
 * stores, scoped by tenant.
 *
 * The naive `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)` silently
 * loses rows: Postgres keeps `timestamptz` at microsecond precision while the JS `Date` behind the
 * encoded cursor only carries milliseconds, so a row with sub-millisecond digits satisfies neither
 * branch and vanishes from the next page — and a batch written under one `now()` puts a whole group
 * on the boundary at once. `(created_at, id) < (SELECT …)` stays index-drivable and compares the
 * stored values; the millisecond comparison survives only as the fallback for a cursor whose
 * boundary row no longer exists.
 */
export function applyCursor<T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>, alias: string, table: CursorTable,
  cursor: OperationsMaintenanceCursor | null, tenantId: string
): SelectQueryBuilder<T> {
  if (!cursor) return builder;
  return builder.andWhere(
    `((${alias}.createdAt, ${alias}.id) < (
        SELECT boundary.created_at, boundary.id FROM ${table} boundary
        WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
      ) OR (
        NOT EXISTS (SELECT 1 FROM ${table} missing
          WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId)
        AND (${alias}.createdAt < :cursorTime
          OR (${alias}.createdAt = :cursorTime AND ${alias}.id < :cursorId))
      ))`,
    { cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: tenantId }
  );
}
