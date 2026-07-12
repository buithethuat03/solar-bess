import { parseDomainEventJob, toDomainEventJob, type OutboxEvent } from '../../src/domain-event';

const event: OutboxEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  actorId: null,
  eventKey: 'project:created:1',
  aggregateType: 'Project',
  aggregateId: '00000000-0000-4000-8000-000000000003',
  aggregateVersion: 1,
  eventType: 'PROJECT_CREATED',
  schemaVersion: 1,
  payload: { projectId: '00000000-0000-4000-8000-000000000003' },
  occurredAt: new Date('2026-07-11T00:00:00.000Z'),
  availableAt: new Date('2026-07-11T00:00:00.000Z'),
  attemptCount: 1,
  correlationId: 'correlation-1'
};

describe('domain event envelope', () => {
  it('uses the outbox event ID as stable transport identity', () => {
    const job = toDomainEventJob(event);
    expect(job.eventId).toBe(event.id);
    expect(parseDomainEventJob(job)).toEqual(job);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseDomainEventJob({ ...toDomainEventJob(event), payload: [] })).toThrow('payload');
  });

  it('rejects an unsupported schema version', () => {
    expect(() => parseDomainEventJob({ ...toDomainEventJob(event), schemaVersion: 0 })).toThrow('schemaVersion');
  });
});
