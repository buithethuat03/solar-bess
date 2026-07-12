import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Pool, type PoolClient } from 'pg';
import { loadWorkerConfig, type WorkerConfig } from '../../src/config';
import type { DomainEventJob, OutboxEvent } from '../../src/domain-event';
import { EventConsumptionStore } from '../../src/event-consumption.store';
import { FoundationConsumer } from '../../src/foundation-consumer';
import { BullOutboxPublisher, bullConnectionOptions } from '../../src/outbox.publisher';
import { OutboxRelay } from '../../src/outbox-relay';
import { PostgresOutboxRepository } from '../../src/outbox.repository';
import type { WorkerLogger } from '../../src/worker-logger';

const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

async function waitFor(check: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for worker integration condition');
}

describe('PostgreSQL outbox + BullMQ worker — TEST-180', () => {
  let config: WorkerConfig;
  let pool: Pool;
  let redis: Redis;
  let publisher: BullOutboxPublisher;
  let consumer: FoundationConsumer;
  let queue: Queue<DomainEventJob>;
  const tenantId = randomUUID();
  const eventIds: string[] = [];

  beforeAll(async () => {
    const secretDirectory = process.env.WORKER_TEST_SECRETS_DIR
      ?? '/tmp/solar-bess-worker-test-secrets';
    const databaseSecret = process.env.WORKER_TEST_DATABASE_URL_FILE
      ?? resolve(secretDirectory, 'database_url');
    const redisSecret = process.env.WORKER_TEST_REDIS_PASSWORD_FILE
      ?? resolve(secretDirectory, 'redis_password');
    if (!existsSync(databaseSecret) || !existsSync(redisSecret)) {
      throw new Error(
        'Run `npm run worker:test:secrets` before worker integration tests'
      );
    }
    const suffix = `${process.pid}-${Date.now()}`;
    config = loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: databaseSecret,
      WORKER_DATABASE_HOST_OVERRIDE: process.env.WORKER_TEST_DATABASE_HOST,
      WORKER_DATABASE_PORT_OVERRIDE: process.env.WORKER_TEST_DATABASE_PORT,
      WORKER_DATABASE_NAME_OVERRIDE: process.env.WORKER_TEST_DATABASE_NAME,
      WORKER_REDIS_PASSWORD_FILE: redisSecret,
      WORKER_REDIS_HOST: process.env.WORKER_TEST_REDIS_HOST ?? '127.0.0.1',
      WORKER_REDIS_PORT: process.env.WORKER_TEST_REDIS_PORT ?? '6380',
      WORKER_QUEUE_NAME: `worker-test-${suffix}`,
      WORKER_DLQ_NAME: `worker-test-dlq-${suffix}`,
      WORKER_QUEUE_PREFIX: `worker-test-${suffix}`,
      WORKER_ID: `worker-test-${process.pid}`,
      WORKER_CONSUMER_NAME: `worker-integration-${process.pid}`,
      WORKER_CONSUMER_ATTEMPTS: '2',
      WORKER_CONSUMER_BACKOFF_MS: '100',
      OUTBOX_BATCH_SIZE: '10'
    }, (path) => readFileSync(path, 'utf8'));
    pool = new Pool({ connectionString: config.database.url });
    redis = new Redis({ ...bullConnectionOptions(config), maxRetriesPerRequest: 1 });
    publisher = new BullOutboxPublisher(config);
    const store = new EventConsumptionStore(
      pool,
      config.consumption.consumerName,
      config.consumption.handlerVersion,
      config.consumption.leaseMs
    );
    consumer = new FoundationConsumer(store, config, logger);
    queue = new Queue<DomainEventJob>(config.queue.name, {
      connection: bullConnectionOptions(config), prefix: config.queue.prefix
    });
    await pool.query(`
      INSERT INTO tenants (id, code, name, status)
      VALUES ($1, $2, 'Worker Integration', 'ACTIVE')
    `, [tenantId, `worker-${suffix}`.slice(0, 64)]);
    await consumer.start();
  });

  afterAll(async () => {
    await consumer?.close(5_000);
    await publisher?.close();
    await queue?.close();
    if (pool) {
      await pool.query('DELETE FROM event_consumptions WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM transactional_outbox_events WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
      await pool.end();
    }
    if (redis && config) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${config.queue.prefix}:*`, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.unlink(...keys);
      } while (cursor !== '0');
      await redis.quit();
    }
  });

  it('relays DB-102 with deterministic job ID and records one DB-103 consumption', async () => {
    const event = await insertOutboxEvent();
    const repository = new PostgresOutboxRepository(pool);
    const relay = new OutboxRelay(repository, publisher, config, logger);
    await relay.pollOnce();
    await waitFor(async () => {
      const result = await pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM event_consumptions
        WHERE tenant_id = $1 AND event_id = $2 AND status = 'PROCESSED'
      `, [tenantId, event.id]);
      return result.rows[0]?.count === '1';
    });
    const queued = await queue.getJob(event.id);
    expect(queued?.id).toBe(event.id);
  });

  it('deduplicates concurrent DB-103 claims so the side effect runs once', async () => {
    const event = await insertOutboxEvent();
    const store = new EventConsumptionStore(pool, 'dedupe-integration-v1', '1.0.0', 5_000);
    let calls = 0;
    const handler = async (client: PoolClient): Promise<void> => {
      calls += 1;
      await client.query('SELECT pg_sleep(0.05)');
    };
    const envelope: DomainEventJob = {
      eventId: event.id, tenantId: event.tenantId, actorId: null,
      eventKey: event.eventKey, aggregateType: event.aggregateType,
      aggregateId: event.aggregateId, aggregateVersion: event.aggregateVersion,
      eventType: event.eventType, schemaVersion: event.schemaVersion,
      payload: event.payload, occurredAt: event.occurredAt.toISOString(),
      correlationId: event.correlationId
    };
    const results = await Promise.all([store.consume(envelope, handler), store.consume(envelope, handler)]);
    expect(results.sort()).toEqual(['DUPLICATE', 'PROCESSED']);
    expect(calls).toBe(1);
  });

  it('reclaims a stale PROCESSING lease even when the previous claim reached max attempts', async () => {
    const event = await insertOutboxEvent();
    await pool.query(`
      UPDATE transactional_outbox_events
      SET status = 'PROCESSING', locked_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
          locked_by = 'crashed-worker', attempt_count = $3
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, event.id, config.relay.maxAttempts]);
    const relay = new OutboxRelay(new PostgresOutboxRepository(pool), publisher, config, logger);
    await relay.pollOnce();
    const status = await pool.query<{ status: string }>(`
      SELECT status FROM transactional_outbox_events WHERE tenant_id = $1 AND id = $2
    `, [tenantId, event.id]);
    expect(status.rows[0]?.status).toBe('ENQUEUED');
  });

  it('moves a terminal valid-envelope failure to the explicit DLQ', async () => {
    const missingEventId = randomUUID();
    const job: DomainEventJob = {
      eventId: missingEventId,
      tenantId,
      actorId: null,
      eventKey: `missing:${missingEventId}`,
      aggregateType: 'IntegrationProbe',
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      eventType: 'INTEGRATION_FAILURE_PROBE',
      schemaVersion: 1,
      payload: {},
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID()
    };
    await queue.add(job.eventType, job, {
      jobId: missingEventId,
      attempts: 2,
      backoff: { type: 'fixed', delay: 100 },
      removeOnFail: false
    });
    const deadLetterQueue = new Queue(config.queue.deadLetterName, {
      connection: bullConnectionOptions(config), prefix: config.queue.prefix
    });
    await waitFor(async () => Boolean(await deadLetterQueue.getJob(missingEventId)));
    expect((await deadLetterQueue.getJob(missingEventId))?.data.failureCode).toMatch(/^ERR_/);
    await deadLetterQueue.close();
  });

  async function insertOutboxEvent(): Promise<OutboxEvent> {
    const id = randomUUID();
    eventIds.push(id);
    const aggregateId = randomUUID();
    const correlationId = randomUUID();
    const result = await pool.query<OutboxEvent>(`
      INSERT INTO transactional_outbox_events (
        id, tenant_id, actor_id, event_key, aggregate_type, aggregate_id,
        aggregate_version, event_type, schema_version, payload, status,
        occurred_at, available_at, locked_at, locked_by, published_at,
        attempt_count, last_error, correlation_id
      ) VALUES (
        $1, $2, NULL, $3, 'IntegrationProbe', $4,
        1, 'INTEGRATION_PROBE_CREATED', 1, '{}'::jsonb, 'PENDING',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL,
        0, NULL, $5
      )
      RETURNING id, tenant_id AS "tenantId", actor_id AS "actorId",
        event_key AS "eventKey", aggregate_type AS "aggregateType",
        aggregate_id AS "aggregateId", aggregate_version AS "aggregateVersion",
        event_type AS "eventType", schema_version AS "schemaVersion", payload,
        occurred_at AS "occurredAt", available_at AS "availableAt",
        attempt_count AS "attemptCount", correlation_id AS "correlationId"
    `, [id, tenantId, `integration:${id}`, aggregateId, correlationId]);
    return result.rows[0];
  }
});
