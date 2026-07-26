import {
  ConflictException, HttpException, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { AuditEventEntity } from '../../../database/entities';
import type { AuthContext } from '../../identity-access/auth.types';
import type { AccessScopeSets } from '../../identity-access/permission.service';
import type { OutboxService } from '../../operational-foundation/outbox.service';

export interface RequestContext extends AuthContext { correlationId: string }

export function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message, retryable: false });
}

export function unprocessable(code: string, message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, retryable: false });
}

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message, retryable: false });
}

export function assertVersion(currentVersion: number, expectedVersion: number): void {
  if (currentVersion !== expectedVersion) {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
      retryable: false, currentVersion
    });
  }
}

/**
 * ABAC reach for the O&M registers.
 *
 * `role_assignments` only knows TENANT / PORTFOLIO / PROJECT / PACKAGE — there is no SITE and no
 * ASSET scope type, and inventing one would be inventing an authorization model. Every O&M row
 * therefore carries the project of its site (sites are project-scoped), and site/asset reach is
 * DERIVED from that project. A PACKAGE-scoped assignment reaches nothing here on purpose: an O&M
 * row belongs to a site, not to a contract package, so there is no honest way to map one onto the
 * other and deny-by-default is the correct answer.
 */
export function inScope(projectId: string, scope: AccessScopeSets): boolean {
  return scope.tenantWide || scope.projectIds.includes(projectId);
}

/**
 * Maps a named database constraint violation (unique, check or foreign key) to its domain error.
 * The constraint stays the enforcement; this only translates its failure for the wire.
 */
export async function withConstraintMap<T>(
  action: () => Promise<T>, map: Record<string, () => HttpException>
): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    const candidate = cause as {
      code?: string; constraint?: string;
      driverError?: { code?: string; constraint?: string };
    };
    const code = candidate.code ?? candidate.driverError?.code;
    const constraint = candidate.constraint ?? candidate.driverError?.constraint;
    if (
      constraint !== undefined
      && (code === '23505' || code === '23514' || code === '23503')
      && map[constraint] !== undefined
    ) {
      throw map[constraint]();
    }
    throw cause;
  }
}

/**
 * Writes the audit event and the transactional outbox event for one committed aggregate change,
 * inside the command transaction. Payloads must already be redacted by the caller; for O&M that
 * means ids, classification and local case state only — never a raw source event, tag, endpoint or
 * anything else that could describe a path back into OT (SEC-127/SEC-128).
 */
export async function emit(
  outbox: OutboxService, manager: EntityManager, context: RequestContext,
  aggregateType: string, aggregateId: string, aggregateVersion: number, eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId };
  await manager.getRepository(AuditEventEntity).insert({
    id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
    action: eventType, result: 'SUCCEEDED', reasonCode: null,
    correlationId: context.correlationId, ipHash: null,
    objectType: aggregateType, objectId: aggregateId, payload: safePayload
  });
  await outbox.append(manager, context, {
    aggregateType, aggregateId, aggregateVersion, eventType,
    eventKey: createHash('sha256')
      .update(`${aggregateType}:${aggregateId}:${aggregateVersion}:${eventType}`)
      .digest('hex'),
    payload: safePayload
  });
}
