import type { Pool } from 'pg';
import { PostgresOutboxRepository } from '../../src/outbox.repository';

describe('PostgresOutboxRepository stale lease recovery — TEST-180', () => {
  it('bounds fresh PENDING attempts but still reclaims an expired PROCESSING lease at max attempts', async () => {
    let sql = '';
    const pool = {
      query: jest.fn(async (statement: string) => {
        sql = statement;
        return { rows: [], rowCount: 0 };
      })
    } as unknown as Pool;
    await new PostgresOutboxRepository(pool).claimBatch({
      workerId: 'worker-test', batchSize: 10, leaseMs: 30_000, maxAttempts: 3
    });
    expect(sql).toMatch(/status = 'PENDING'[\s\S]*attempt_count < \$4[\s\S]*OR \([\s\S]*status = 'PROCESSING'/);
    expect(sql).not.toMatch(/\)\s*AND attempt_count < \$4\s*ORDER BY/);
  });
});
