import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { loadWorkerConfig } from './config';
import { safeErrorCode } from './safe-error';
import type { WorkerLogger } from './worker-logger';
import { workerLogger } from './worker-logger';

export interface ReplayTarget {
  tenantId: string;
  eventId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseReplayTarget(args: string[]): ReplayTarget {
  if (args.length !== 2 || !UUID.test(args[0] ?? '') || !UUID.test(args[1] ?? '')) {
    throw new Error('Usage: outbox:replay -- <tenant-uuid> <failed-event-uuid>');
  }
  return { tenantId: args[0].toLowerCase(), eventId: args[1].toLowerCase() };
}

export class FailedOutboxReplay {
  constructor(
    private readonly pool: Pool,
    private readonly logger: WorkerLogger,
    private readonly workerId: string
  ) {}

  async execute(target: ReplayTarget): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const replayed = await client.query<{ correlationId: string }>(`
        UPDATE transactional_outbox_events
        SET status = 'PENDING',
            available_at = CURRENT_TIMESTAMP,
            locked_at = NULL,
            locked_by = NULL,
            published_at = NULL,
            attempt_count = 0,
            last_error = NULL
        WHERE tenant_id = $1 AND id = $2 AND status = 'FAILED'
        RETURNING correlation_id AS "correlationId"
      `, [target.tenantId, target.eventId]);
      const row = replayed.rows[0];
      if (!row) throw new Error('Outbox event was not found in FAILED state for the supplied tenant');
      await this.writeAudit(client, target, row.correlationId);
      await client.query('COMMIT');
      this.logger.info('outbox_event_replayed', {
        tenantId: target.tenantId,
        eventId: target.eventId,
        correlationId: row.correlationId,
        workerId: this.workerId
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async writeAudit(client: PoolClient, target: ReplayTarget, correlationId: string): Promise<void> {
    await client.query(`
      INSERT INTO audit_events (
        id, tenant_id, actor_id, action, result, reason_code, correlation_id,
        ip_hash, object_type, object_id, payload, occurred_at
      ) VALUES (
        $1, $2, NULL, 'OUTBOX_EVENT_REPLAY_REQUESTED', 'SUCCESS', 'MANUAL_REPLAY', $3,
        NULL, 'TransactionalOutboxEvent', $4,
        jsonb_build_object('sourceStatus', 'FAILED', 'requestedBy', $5), CURRENT_TIMESTAMP
      )
    `, [randomUUID(), target.tenantId, correlationId, target.eventId, this.workerId]);
  }
}

async function run(): Promise<void> {
  const config = loadWorkerConfig();
  const target = parseReplayTarget(process.argv.slice(2));
  const pool = new Pool({
    connectionString: config.database.url,
    max: 1,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    query_timeout: config.database.queryTimeoutMs,
    statement_timeout: config.database.queryTimeoutMs,
    application_name: 'solar-bess-outbox-replay'
  });
  try {
    await new FailedOutboxReplay(pool, workerLogger, config.workerId).execute(target);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    workerLogger.error('outbox_replay_failed', { errorCode: safeErrorCode(error) });
    process.exitCode = 1;
  });
}
