import type { Pool, PoolClient } from 'pg';
import { FailedOutboxReplay, parseReplayTarget } from '../../src/replay-failed';
import type { WorkerLogger } from '../../src/worker-logger';

const tenantId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';

describe('single-event outbox replay', () => {
  it('requires one exact tenant UUID and one exact event UUID', () => {
    expect(parseReplayTarget([tenantId, eventId])).toEqual({ tenantId, eventId });
    expect(() => parseReplayTarget([eventId])).toThrow('Usage');
    expect(() => parseReplayTarget([tenantId, eventId, eventId])).toThrow('Usage');
    expect(() => parseReplayTarget(['all', eventId])).toThrow('Usage');
  });

  it('resets only the tenant-scoped FAILED event and writes DB-098 audit before commit', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('UPDATE transactional_outbox_events')) {
          return { rows: [{ correlationId: 'correlation-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn()
    } as unknown as PoolClient;
    const pool = { connect: jest.fn().mockResolvedValue(client) } as unknown as Pool;
    const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    await new FailedOutboxReplay(pool, logger, 'worker-test').execute({ tenantId, eventId });

    const update = queries.find((query) => query.sql.includes('UPDATE transactional_outbox_events'));
    expect(update?.sql).toContain("status = 'FAILED'");
    expect(update?.params).toEqual([tenantId, eventId]);
    expect(queries.some((query) => query.sql.includes('INSERT INTO audit_events'))).toBe(true);
    expect(queries.at(-1)?.sql).toBe('COMMIT');
  });
});
