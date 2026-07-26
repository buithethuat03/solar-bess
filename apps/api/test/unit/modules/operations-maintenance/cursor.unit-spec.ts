import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  applyCursor, decodeOperationsCursor, encodeOperationsCursor
} from 'src/modules/operations-maintenance/domain/cursor';

/** Minimal stand-in for the query builder: `applyCursor` only ever calls `andWhere`. */
function fakeBuilder() {
  const calls: Array<{ sql: string; parameters: Record<string, unknown> }> = [];
  const builder = {
    calls,
    andWhere(sql: string, parameters: Record<string, unknown>) {
      calls.push({ sql, parameters });
      return builder;
    }
  };
  return builder as typeof builder & SelectQueryBuilder<ObjectLiteral>;
}

describe('O&M keyset cursor — API-114/116/118', () => {
  it('round-trips an encoded cursor', () => {
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeOperationsCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(decodeOperationsCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeOperationsCursor(undefined)).toBeNull();
    expect(decodeOperationsCursor('')).toBeNull();
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ page: 2 })).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      createdAt: 'yesterday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: 'work-order-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeOperationsCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });

  it('adds no predicate at all when there is no cursor', () => {
    const builder = fakeBuilder();
    applyCursor(builder, 'workOrder', 'work_orders', null, randomUUID());
    expect(builder.calls).toHaveLength(0);
  });

  it('compares row-wise against the boundary row instead of the encoded millisecond', () => {
    const builder = fakeBuilder();
    const tenantId = randomUUID();
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    applyCursor(builder, 'workOrder', 'work_orders', cursor, tenantId);

    expect(builder.calls).toHaveLength(1);
    const [{ sql, parameters }] = builder.calls;
    // The tuple comparison against the stored boundary row is the whole point: the millisecond
    // comparison alone silently drops rows whose timestamp carries sub-millisecond digits.
    expect(sql.replace(/\s+/g, ' ')).toContain('(workOrder.createdAt, workOrder.id) < ( SELECT');
    expect(sql).toContain('FROM work_orders boundary');
    // The fallback is reachable ONLY when the boundary row is gone.
    expect(sql.replace(/\s+/g, ' ')).toContain(
      'NOT EXISTS (SELECT 1 FROM work_orders missing WHERE missing.id = :cursorId'
    );
    // Every lookup is tenant-scoped; a cursor can never point across tenants.
    expect(sql.match(/boundary\.tenant_id = :cursorTenantId/g)).toHaveLength(1);
    expect(sql.match(/missing\.tenant_id = :cursorTenantId/g)).toHaveLength(1);
    expect(parameters).toEqual({
      cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: tenantId
    });
  });

  it.each(['alarm_cases', 'service_incidents', 'work_orders'] as const)(
    'binds the boundary lookup to the %s table and its alias', (table) => {
      const builder = fakeBuilder();
      applyCursor(builder, 'row', table, {
        createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID()
      }, randomUUID());
      expect(builder.calls[0].sql).toContain(`FROM ${table} boundary`);
      expect(builder.calls[0].sql).toContain('(row.createdAt, row.id)');
    }
  );
});
