import type { WorkerConfig } from './config';
import type { OutboxPublisher } from './outbox.publisher';
import type { OutboxRepository } from './outbox.repository';
import { safeErrorCode } from './safe-error';
import type { WorkerLogger } from './worker-logger';

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;
  private activePoll: Promise<void> | null = null;
  private running = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: OutboxPublisher,
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.triggerPoll();
    this.timer = setInterval(() => this.triggerPoll(), this.config.relay.pollIntervalMs);
    this.timer.unref();
  }

  isRunning(): boolean {
    return this.running;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const activePoll = this.activePoll;
    if (!activePoll) return;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.config.shutdownTimeoutMs);
      timer.unref();
    });
    const result = await Promise.race([activePoll.then(() => 'stopped' as const), timedOut]);
    if (timer) clearTimeout(timer);
    if (result === 'timeout') {
      throw new Error('Outbox relay shutdown timed out');
    }
  }

  async pollOnce(): Promise<void> {
    const events = await this.repository.claimBatch({
      workerId: this.config.workerId,
      batchSize: this.config.relay.batchSize,
      leaseMs: this.config.relay.leaseMs,
      maxAttempts: this.config.relay.maxAttempts
    });
    for (const event of events) {
      try {
        await this.publishWithTimeout(event);
        const marked = await this.repository.markEnqueued(event, this.config.workerId);
        if (!marked) {
          this.logger.warn('outbox_mark_enqueued_lost_lease', {
            eventId: event.id,
            tenantId: event.tenantId,
            correlationId: event.correlationId
          });
        }
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const released = await this.repository.releaseAfterFailure(
          event,
          this.config.workerId,
          errorCode,
          this.config.relay.maxAttempts,
          this.config.relay.retryBackoffMs
        );
        this.logger.warn('outbox_publish_failed', {
          eventId: event.id,
          tenantId: event.tenantId,
          correlationId: event.correlationId,
          errorCode,
          status: released?.status ?? 'LEASE_LOST',
          attemptCount: released?.attemptCount ?? event.attemptCount
        });
      }
    }
  }

  private async publishWithTimeout(event: Parameters<OutboxPublisher['publish']>[0]): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Outbox publish timed out')),
        this.config.relay.publishTimeoutMs
      );
      timer.unref();
    });
    try {
      await Promise.race([this.publisher.publish(event), timedOut]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private triggerPoll(): void {
    if (!this.running || this.activePoll) return;
    this.activePoll = this.pollOnce()
      .catch((error: unknown) => {
        this.logger.error('outbox_poll_failed', { errorCode: safeErrorCode(error) });
      })
      .finally(() => {
        this.activePoll = null;
      });
  }
}
