import type { Pool } from 'pg';
import type { OutboxEvent } from './domain-event';

export interface ClaimOptions {
  workerId: string;
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
}

export interface ReleaseResult {
  status: 'PENDING' | 'FAILED';
  attemptCount: number;
}

export interface OutboxRepository {
  claimBatch(options: ClaimOptions): Promise<OutboxEvent[]>;
  markEnqueued(event: OutboxEvent, workerId: string): Promise<boolean>;
  releaseAfterFailure(
    event: OutboxEvent,
    workerId: string,
    errorCode: string,
    maxAttempts: number,
    retryBackoffMs: number
  ): Promise<ReleaseResult | null>;
  ready(): Promise<boolean>;
}

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private readonly pool: Pool) {}

  async claimBatch(options: ClaimOptions): Promise<OutboxEvent[]> {
    const result = await this.pool.query<OutboxEvent>(`
      WITH candidates AS (
        SELECT id
        FROM transactional_outbox_events
        WHERE (
          (
            status = 'PENDING'
            AND available_at <= CURRENT_TIMESTAMP
            AND attempt_count < $4
          )
          OR (
            status = 'PROCESSING'
            AND locked_at < CURRENT_TIMESTAMP - ($3::integer * INTERVAL '1 millisecond')
          )
        )
        ORDER BY available_at ASC, occurred_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE transactional_outbox_events AS event
      SET status = 'PROCESSING',
          locked_at = CURRENT_TIMESTAMP,
          locked_by = $1,
          attempt_count = event.attempt_count + 1,
          last_error = NULL
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id,
                event.tenant_id AS "tenantId",
                event.actor_id AS "actorId",
                event.event_key AS "eventKey",
                event.aggregate_type AS "aggregateType",
                event.aggregate_id AS "aggregateId",
                event.aggregate_version AS "aggregateVersion",
                event.event_type AS "eventType",
                event.schema_version AS "schemaVersion",
                event.payload,
                event.occurred_at AS "occurredAt",
                event.available_at AS "availableAt",
                event.attempt_count AS "attemptCount",
                event.correlation_id AS "correlationId"
    `, [options.workerId, options.batchSize, options.leaseMs, options.maxAttempts]);
    return result.rows;
  }

  async markEnqueued(event: OutboxEvent, workerId: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE transactional_outbox_events
      SET status = 'ENQUEUED',
          published_at = CURRENT_TIMESTAMP,
          locked_at = NULL,
          locked_by = NULL,
          last_error = NULL
      WHERE id = $1
        AND tenant_id = $2
        AND status = 'PROCESSING'
        AND locked_by = $3
    `, [event.id, event.tenantId, workerId]);
    return result.rowCount === 1;
  }

  async releaseAfterFailure(
    event: OutboxEvent,
    workerId: string,
    errorCode: string,
    maxAttempts: number,
    retryBackoffMs: number
  ): Promise<ReleaseResult | null> {
    const result = await this.pool.query<ReleaseResult>(`
      UPDATE transactional_outbox_events
      SET status = CASE WHEN attempt_count >= $4 THEN 'FAILED' ELSE 'PENDING' END,
          available_at = CASE
            WHEN attempt_count >= $4 THEN available_at
            ELSE CURRENT_TIMESTAMP + ($5::integer * INTERVAL '1 millisecond')
          END,
          locked_at = NULL,
          locked_by = NULL,
          last_error = $6
      WHERE id = $1
        AND tenant_id = $2
        AND status = 'PROCESSING'
        AND locked_by = $3
      RETURNING status, attempt_count AS "attemptCount"
    `, [event.id, event.tenantId, workerId, maxAttempts, retryBackoffMs, errorCode]);
    return result.rows[0] ?? null;
  }

  async ready(): Promise<boolean> {
    const result = await this.pool.query<{ ready: boolean }>(`
      SELECT to_regclass('public.transactional_outbox_events') IS NOT NULL
         AND to_regclass('public.event_consumptions') IS NOT NULL AS ready
    `);
    return result.rows[0]?.ready === true;
  }
}
