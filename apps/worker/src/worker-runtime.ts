import { createServer, type Server } from 'node:http';
import Redis from 'ioredis';
import { Pool } from 'pg';
import type { WorkerConfig } from './config';
import { EventConsumptionStore } from './event-consumption.store';
import { FoundationConsumer } from './foundation-consumer';
import { BullOutboxPublisher, bullConnectionOptions } from './outbox.publisher';
import { OutboxRelay } from './outbox-relay';
import { PostgresOutboxRepository } from './outbox.repository';
import { safeErrorCode } from './safe-error';
import type { WorkerLogger } from './worker-logger';
import {
  ScheduleAlertProcessor, ScheduleAlertScanner
} from './schedule-alert.processor';

export class WorkerRuntime {
  private readonly pool: Pool;
  private readonly redis: Redis;
  private readonly repository: PostgresOutboxRepository;
  private readonly publisher: BullOutboxPublisher;
  private readonly relay: OutboxRelay;
  private readonly consumer: FoundationConsumer;
  private readonly scheduleAlertScanner: ScheduleAlertScanner;
  private server: Server | null = null;
  private started = false;
  private stopping = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger
  ) {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolSize,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      query_timeout: config.database.queryTimeoutMs,
      statement_timeout: config.database.queryTimeoutMs,
      application_name: 'solar-bess-worker'
    });
    this.pool.on('error', (error) => {
      this.logger.error('postgres_pool_error', { errorCode: safeErrorCode(error) });
    });
    this.redis = new Redis({
      ...bullConnectionOptions(config),
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    this.redis.on('error', (error) => {
      this.logger.error('redis_connection_error', { errorCode: safeErrorCode(error) });
    });
    this.repository = new PostgresOutboxRepository(this.pool);
    this.publisher = new BullOutboxPublisher(config);
    this.relay = new OutboxRelay(this.repository, this.publisher, config, logger);
    const store = new EventConsumptionStore(
      this.pool,
      config.consumption.consumerName,
      config.consumption.handlerVersion,
      config.consumption.leaseMs
    );
    const scheduleAlertProcessor = new ScheduleAlertProcessor(config, logger);
    this.consumer = new FoundationConsumer(store, config, logger, [scheduleAlertProcessor]);
    this.scheduleAlertScanner = new ScheduleAlertScanner(
      this.pool, scheduleAlertProcessor, config, logger
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.redis.connect();
    await Promise.all([this.redis.ping(), this.pool.query('SELECT 1')]);
    await this.consumer.start();
    this.relay.start();
    this.scheduleAlertScanner.start();
    await this.startHealthServer();
    this.started = true;
    this.logger.info('worker_started', {
      workerId: this.config.workerId,
      queue: this.config.queue.name,
      consumer: this.config.consumption.consumerName,
      healthPort: this.config.health.port
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.started = false;
    const errors: unknown[] = [];
    await this.closeHealthServer().catch((error: unknown) => errors.push(error));
    await this.relay.stop().catch((error: unknown) => errors.push(error));
    await this.scheduleAlertScanner.stop().catch((error: unknown) => errors.push(error));
    await this.consumer.close(this.config.shutdownTimeoutMs).catch((error: unknown) => errors.push(error));
    const closed = await Promise.allSettled([
      this.publisher.close(this.config.shutdownTimeoutMs),
      this.redis.quit().catch(() => this.redis.disconnect()),
      this.pool.end()
    ]);
    for (const result of closed) if (result.status === 'rejected') errors.push(result.reason);
    this.logger.info('worker_stopped', { workerId: this.config.workerId });
    if (errors.length) throw new AggregateError(errors, 'Worker shutdown completed with errors');
  }

  private async ready(): Promise<boolean> {
    if (
      !this.started || this.stopping || !this.relay.isRunning()
      || !this.consumer.isRunning() || !this.scheduleAlertScanner.isRunning()
    ) return false;
    const [databaseReady, redisReply] = await Promise.all([
      this.repository.ready(),
      this.redis.ping()
    ]);
    return databaseReady && redisReply === 'PONG';
  }

  private startHealthServer(): Promise<void> {
    this.server = createServer((request, response) => {
      if (request.url === '/live') {
        const live = !this.stopping;
        response.writeHead(live ? 200 : 503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: live ? 'ok' : 'stopping' }));
        return;
      }
      if (request.url === '/ready') {
        void this.ready()
          .then((ready) => {
            response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
          })
          .catch((error: unknown) => {
            this.logger.warn('worker_readiness_failed', { errorCode: safeErrorCode(error) });
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ status: 'not_ready' }));
          });
        return;
      }
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: 'NOT_FOUND' }));
    });
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.config.health.port, this.config.health.host, () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  private closeHealthServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
