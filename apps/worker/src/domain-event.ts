export interface OutboxEvent {
  id: string;
  tenantId: string;
  actorId: string | null;
  eventKey: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number | null;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  occurredAt: Date;
  availableAt: Date;
  attemptCount: number;
  correlationId: string;
}

export interface DomainEventJob {
  eventId: string;
  tenantId: string;
  actorId: string | null;
  eventKey: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number | null;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  occurredAt: string;
  correlationId: string;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid domain event ${name}`);
  return value;
}

export function parseDomainEventJob(value: unknown): DomainEventJob {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid domain event envelope');
  }
  const event = value as Record<string, unknown>;
  const payload = event.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid domain event payload');
  }
  const schemaVersion = event.schemaVersion;
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 1) {
    throw new Error('Invalid domain event schemaVersion');
  }
  const aggregateVersion = event.aggregateVersion;
  if (aggregateVersion !== null && (!Number.isInteger(aggregateVersion) || (aggregateVersion as number) < 0)) {
    throw new Error('Invalid domain event aggregateVersion');
  }
  const actorId = event.actorId;
  if (actorId !== null && typeof actorId !== 'string') throw new Error('Invalid domain event actorId');
  return {
    eventId: string(event.eventId, 'eventId'),
    tenantId: string(event.tenantId, 'tenantId'),
    actorId: actorId as string | null,
    eventKey: string(event.eventKey, 'eventKey'),
    aggregateType: string(event.aggregateType, 'aggregateType'),
    aggregateId: string(event.aggregateId, 'aggregateId'),
    aggregateVersion: aggregateVersion as number | null,
    eventType: string(event.eventType, 'eventType'),
    schemaVersion: schemaVersion as number,
    payload: payload as Record<string, unknown>,
    occurredAt: string(event.occurredAt, 'occurredAt'),
    correlationId: string(event.correlationId, 'correlationId')
  };
}

export function toDomainEventJob(event: OutboxEvent): DomainEventJob {
  return {
    eventId: event.id,
    tenantId: event.tenantId,
    actorId: event.actorId,
    eventKey: event.eventKey,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.aggregateVersion,
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    payload: event.payload,
    occurredAt: event.occurredAt.toISOString(),
    correlationId: event.correlationId
  };
}
