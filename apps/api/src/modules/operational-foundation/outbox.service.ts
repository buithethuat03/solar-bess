import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import {
  OutboxEventStatus, TransactionalOutboxEventEntity
} from '../../database/entities';

export interface OutboxContext {
  tenantId: string;
  userId: string | null;
  correlationId: string;
}

export interface AppendOutboxEvent {
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number | null;
  eventType: string;
  schemaVersion?: number;
  eventKey?: string;
  payload: Record<string, unknown>;
  availableAt?: Date;
}

@Injectable()
export class OutboxService {
  async append(
    manager: EntityManager,
    context: OutboxContext,
    event: AppendOutboxEvent
  ): Promise<string> {
    const id = randomUUID();
    const eventKey = event.eventKey ?? createHash('sha256')
      .update(`${context.correlationId}:${event.eventType}:${event.aggregateId}`)
      .digest('hex');
    await manager.getRepository(TransactionalOutboxEventEntity).save({
      id,
      tenantId: context.tenantId,
      actorId: context.userId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion ?? null,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion ?? 1,
      eventKey,
      payload: event.payload,
      status: OutboxEventStatus.PENDING,
      occurredAt: new Date(),
      availableAt: event.availableAt ?? new Date(),
      lockedAt: null,
      lockedBy: null,
      publishedAt: null,
      attemptCount: 0,
      lastError: null,
      correlationId: context.correlationId
    });
    return id;
  }
}
