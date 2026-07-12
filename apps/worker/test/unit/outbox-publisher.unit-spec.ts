import type { WorkerConfig } from '../../src/config';
import { outboxJobOptions } from '../../src/outbox.publisher';

describe('BullMQ outbox job contract — TEST-180', () => {
  it('uses DB-102 event ID as deterministic BullMQ jobId with bounded retry', () => {
    const config = {
      queue: { consumerAttempts: 5, consumerBackoffMs: 1_000 }
    } as WorkerConfig;
    const eventId = '00000000-0000-4000-8000-000000000001';
    expect(outboxJobOptions(eventId, config)).toMatchObject({
      jobId: eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnFail: false
    });
  });
});
