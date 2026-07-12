import type { WorkerConfig } from '../../src/config';
import type { OutboxEvent } from '../../src/domain-event';
import { OutboxRelay } from '../../src/outbox-relay';
import type { OutboxPublisher } from '../../src/outbox.publisher';
import type { OutboxRepository } from '../../src/outbox.repository';
import type { WorkerLogger } from '../../src/worker-logger';

const event: OutboxEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  actorId: null,
  eventKey: 'event-key',
  aggregateType: 'Project',
  aggregateId: '00000000-0000-4000-8000-000000000003',
  aggregateVersion: 1,
  eventType: 'PROJECT_CREATED',
  schemaVersion: 1,
  payload: {},
  occurredAt: new Date(),
  availableAt: new Date(),
  attemptCount: 1,
  correlationId: 'correlation-1'
};

const config = {
  workerId: 'worker-test',
  relay: {
    batchSize: 10,
    leaseMs: 30_000,
    maxAttempts: 3,
    retryBackoffMs: 1_000,
    pollIntervalMs: 1_000,
    publishTimeoutMs: 100
  },
  shutdownTimeoutMs: 100
} as WorkerConfig;

const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function repository(): jest.Mocked<OutboxRepository> {
  return {
    claimBatch: jest.fn().mockResolvedValue([event]),
    markEnqueued: jest.fn().mockResolvedValue(true),
    releaseAfterFailure: jest.fn(),
    ready: jest.fn().mockResolvedValue(true)
  };
}

describe('OutboxRelay — TEST-180', () => {
  it('marks the DB-102 event only after deterministic publish succeeds', async () => {
    const repo = repository();
    const publisher: jest.Mocked<OutboxPublisher> = {
      publish: jest.fn().mockResolvedValue(undefined), close: jest.fn()
    };
    await new OutboxRelay(repo, publisher, config, logger).pollOnce();
    expect(publisher.publish).toHaveBeenCalledWith(event);
    expect(repo.markEnqueued).toHaveBeenCalledWith(event, 'worker-test');
    expect(repo.releaseAfterFailure).not.toHaveBeenCalled();
  });

  it('releases a failed publish for bounded retry without marking it enqueued', async () => {
    const repo = repository();
    repo.releaseAfterFailure.mockResolvedValue({ status: 'PENDING', attemptCount: 1 });
    const publisher: jest.Mocked<OutboxPublisher> = {
      publish: jest.fn().mockRejectedValue(new Error('connection failed')), close: jest.fn()
    };
    await new OutboxRelay(repo, publisher, config, logger).pollOnce();
    expect(repo.markEnqueued).not.toHaveBeenCalled();
    expect(repo.releaseAfterFailure).toHaveBeenCalledWith(
      event, 'worker-test', expect.stringMatching(/^ERR_[0-9A-F]{16}$/), 3, 1_000
    );
  });

  it('turns a stalled publish into a bounded retry', async () => {
    const repo = repository();
    repo.releaseAfterFailure.mockResolvedValue({ status: 'PENDING', attemptCount: 1 });
    const publisher: jest.Mocked<OutboxPublisher> = {
      publish: jest.fn((_event: OutboxEvent) => new Promise<void>(() => undefined)),
      close: jest.fn()
    };
    await new OutboxRelay(repo, publisher, config, logger).pollOnce();
    expect(repo.markEnqueued).not.toHaveBeenCalled();
    expect(repo.releaseAfterFailure).toHaveBeenCalled();
  });
});
