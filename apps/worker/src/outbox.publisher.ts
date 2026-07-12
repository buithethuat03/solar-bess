import { Queue, type JobsOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { toDomainEventJob, type OutboxEvent } from './domain-event';
import type { WorkerConfig } from './config';

export interface OutboxPublisher {
  publish(event: OutboxEvent): Promise<void>;
  close(timeoutMs?: number): Promise<void>;
}

export function outboxJobOptions(eventId: string, config: WorkerConfig): JobsOptions {
  return {
    jobId: eventId,
    attempts: config.queue.consumerAttempts,
    backoff: { type: 'exponential', delay: config.queue.consumerBackoffMs },
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: false
  };
}

export function bullConnectionOptions(config: WorkerConfig): RedisOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.database,
    connectTimeout: config.redis.connectTimeoutMs,
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  };
}

export function bullProducerConnectionOptions(config: WorkerConfig): RedisOptions {
  return {
    ...bullConnectionOptions(config),
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  };
}

export class BullOutboxPublisher implements OutboxPublisher {
  private readonly queue: Queue;

  constructor(private readonly config: WorkerConfig) {
    this.queue = new Queue(config.queue.name, {
      connection: bullProducerConnectionOptions(config),
      prefix: config.queue.prefix
    });
  }

  async publish(event: OutboxEvent): Promise<void> {
    await this.queue.add(event.eventType, toDomainEventJob(event), outboxJobOptions(event.id, this.config));
  }

  async close(timeoutMs = 5_000): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
      timer.unref();
    });
    const result = await Promise.race([
      this.queue.close().then(() => 'closed' as const),
      timedOut
    ]);
    if (timer) clearTimeout(timer);
    if (result === 'timeout') await this.queue.disconnect();
  }
}
