import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { DomainEventJob } from './domain-event';
import { safeErrorHash } from './safe-error';

export type ConsumptionResult = 'PROCESSED' | 'DUPLICATE';
export type EventHandler = (client: PoolClient, event: DomainEventJob) => Promise<void>;

class ConsumptionBusyError extends Error {
  constructor() {
    super('Event consumption is already leased');
    this.name = 'ConsumptionBusyError';
  }
}

interface ConsumptionRow {
  status: 'PROCESSING' | 'PROCESSED' | 'FAILED';
  leaseUntil: Date | null;
}

export class EventConsumptionStore {
  constructor(
    private readonly pool: Pool,
    private readonly consumerName: string,
    private readonly handlerVersion: string,
    private readonly leaseMs: number
  ) {}

  async consume(event: DomainEventJob, handler: EventHandler): Promise<ConsumptionResult> {
    const client = await this.pool.connect();
    let busy = false;
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO event_consumptions (
          id, tenant_id, event_id, consumer_name, handler_version, status,
          lease_until, attempt_count, last_error_hash, processed_at,
          correlation_id, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, 'PROCESSING',
          CURRENT_TIMESTAMP + ($6::integer * INTERVAL '1 millisecond'),
          1, NULL, NULL, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ON CONSTRAINT uq_event_consumption_dedupe DO NOTHING
        RETURNING id
      `, [
        randomUUID(), event.tenantId, event.eventId, this.consumerName,
        this.handlerVersion, this.leaseMs, event.correlationId
      ]);

      if (inserted.rowCount === 0) {
        const existing = await client.query<ConsumptionRow>(`
          SELECT status, lease_until AS "leaseUntil"
          FROM event_consumptions
          WHERE tenant_id = $1 AND consumer_name = $2 AND event_id = $3
          FOR UPDATE
        `, [event.tenantId, this.consumerName, event.eventId]);
        const row = existing.rows[0];
        if (!row) throw new Error('Event consumption dedupe row disappeared');
        if (row.status === 'PROCESSED') {
          await client.query('COMMIT');
          return 'DUPLICATE';
        }
        if (row.status === 'PROCESSING' && row.leaseUntil && row.leaseUntil > new Date()) {
          busy = true;
          throw new ConsumptionBusyError();
        }
        await client.query(`
          UPDATE event_consumptions
          SET status = 'PROCESSING',
              handler_version = $4,
              lease_until = CURRENT_TIMESTAMP + ($5::integer * INTERVAL '1 millisecond'),
              attempt_count = attempt_count + 1,
              last_error_hash = NULL,
              correlation_id = $6,
              updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND consumer_name = $2 AND event_id = $3
        `, [
          event.tenantId, this.consumerName, event.eventId,
          this.handlerVersion, this.leaseMs, event.correlationId
        ]);
      }

      await handler(client, event);
      await client.query(`
        UPDATE event_consumptions
        SET status = 'PROCESSED',
            lease_until = NULL,
            processed_at = CURRENT_TIMESTAMP,
            last_error_hash = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND consumer_name = $2 AND event_id = $3
      `, [event.tenantId, this.consumerName, event.eventId]);
      await client.query('COMMIT');
      return 'PROCESSED';
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (!busy) await this.recordFailure(event, safeErrorHash(error));
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordFailure(event: DomainEventJob, errorHash: string): Promise<void> {
    await this.pool.query(`
      INSERT INTO event_consumptions (
        id, tenant_id, event_id, consumer_name, handler_version, status,
        lease_until, attempt_count, last_error_hash, processed_at,
        correlation_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, 'FAILED', NULL, 1, $6, NULL,
        $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ON CONSTRAINT uq_event_consumption_dedupe DO UPDATE
      SET handler_version = EXCLUDED.handler_version,
          status = 'FAILED',
          lease_until = NULL,
          attempt_count = event_consumptions.attempt_count + 1,
          last_error_hash = EXCLUDED.last_error_hash,
          correlation_id = EXCLUDED.correlation_id,
          updated_at = CURRENT_TIMESTAMP
      WHERE event_consumptions.status <> 'PROCESSED'
    `, [
      randomUUID(), event.tenantId, event.eventId, this.consumerName,
      this.handlerVersion, errorHash, event.correlationId
    ]);
  }
}
