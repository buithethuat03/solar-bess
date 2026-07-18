import { Queue, Worker, type Job } from 'bullmq';
import type { PoolClient } from 'pg';
import type { WorkerConfig } from './config';
import { parseDomainEventJob, type DomainEventJob } from './domain-event';
import { EventConsumptionStore } from './event-consumption.store';
import { bullConnectionOptions, bullProducerConnectionOptions } from './outbox.publisher';
import { safeErrorCode } from './safe-error';
import type { WorkerLogger } from './worker-logger';
import type { DomainEventProcessor } from './domain-event.processor';

interface DeadLetterEvent extends DomainEventJob {
  failedAt: string;
  failureCode: string;
  sourceQueue: string;
}

export class FoundationConsumer {
  private worker: Worker<DomainEventJob> | null = null;
  private readonly deadLetterQueue: Queue<DeadLetterEvent>;
  private running = false;

  constructor(
    private readonly store: EventConsumptionStore,
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger,
    private readonly processors: readonly DomainEventProcessor[] = []
  ) {
    this.deadLetterQueue = new Queue<DeadLetterEvent>(config.queue.deadLetterName, {
      connection: bullProducerConnectionOptions(config),
      prefix: config.queue.prefix
    });
  }

  async start(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker<DomainEventJob>(
      this.config.queue.name,
      (job) => this.process(job),
      {
        connection: bullConnectionOptions(this.config),
        prefix: this.config.queue.prefix,
        concurrency: this.config.queue.consumerConcurrency,
        lockDuration: this.config.queue.lockDurationMs
      }
    );
    this.worker.on('failed', (job, error) => this.onFailed(job, error));
    this.worker.on('error', (error) => {
      this.logger.error('bull_worker_error', { errorCode: safeErrorCode(error) });
    });
    await this.worker.waitUntilReady();
    this.running = true;
  }

  isRunning(): boolean {
    return this.running;
  }

  async close(timeoutMs: number): Promise<void> {
    this.running = false;
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      let timedOut = false;
      await Promise.race([
        worker.close(false),
        new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, timeoutMs);
          timer.unref();
        })
      ]);
      if (timedOut) await worker.close(true);
    }
    let timer: NodeJS.Timeout | undefined;
    const result = await Promise.race([
      this.deadLetterQueue.close().then(() => 'closed' as const),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
        timer.unref();
      })
    ]);
    if (timer) clearTimeout(timer);
    if (result === 'timeout') await this.deadLetterQueue.disconnect();
  }

  private async process(job: Job<DomainEventJob>): Promise<void> {
    const event = parseDomainEventJob(job.data);
    if (job.id !== event.eventId) throw new Error('BullMQ job ID must equal outbox event ID');
    const result = await this.store.consume(event, (client, current) => this.handle(client, current));
    this.logger.info('domain_event_consumed', {
      eventId: event.eventId,
      tenantId: event.tenantId,
      correlationId: event.correlationId,
      consumer: this.config.consumption.consumerName,
      result
    });
  }

  private async handle(client: PoolClient, event: DomainEventJob): Promise<void> {
    parseDomainEventJob(event);
    for (const processor of this.processors) {
      if (processor.supports(event)) await processor.process(client, event);
    }
  }

  private onFailed(job: Job<DomainEventJob> | undefined, error: Error): void {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const failureCode = safeErrorCode(error);
    this.logger.warn('domain_event_attempt_failed', {
      eventId: job.data.eventId,
      tenantId: job.data.tenantId,
      correlationId: job.data.correlationId,
      attemptsMade: job.attemptsMade,
      maxAttempts: attempts,
      failureCode
    });
    if (job.attemptsMade < attempts) return;
    let event: DomainEventJob;
    try {
      event = parseDomainEventJob(job.data);
    } catch (invalidError) {
      this.logger.error('domain_event_invalid_envelope_retained_in_failed_queue', {
        jobId: job.id,
        failureCode: safeErrorCode(invalidError)
      });
      return;
    }
    const deadLetter: DeadLetterEvent = {
      ...event,
      failedAt: new Date().toISOString(),
      failureCode,
      sourceQueue: this.config.queue.name
    };
    void this.deadLetterQueue.add('dead-letter', deadLetter, {
      jobId: event.eventId,
      removeOnComplete: false,
      removeOnFail: false
    }).then(() => {
      this.logger.error('domain_event_dead_lettered', {
        eventId: event.eventId,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        failureCode
      });
    }).catch((dlqError: unknown) => {
      this.logger.error('dead_letter_enqueue_failed', {
        eventId: event.eventId,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        failureCode: safeErrorCode(dlqError)
      });
    });
  }
}
