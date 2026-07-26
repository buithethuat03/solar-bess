import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, Repository, type EntityManager } from 'typeorm';
import {
  AuditEventEntity, NotificationEntity, NotificationStatus
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import {
  decodeNotificationCursor, encodeNotificationCursor
} from './domain/cursor';
import type { NotificationListQueryDto } from './dto/notification.dto';

export interface RequestContext extends AuthContext { correlationId: string }

/**
 * Read/acknowledge side of the DB-105 notification projection (US-022, API-135/API-136). The worker
 * owns every write that creates a row; this service never creates, mutates or deletes the source
 * object a notification points at.
 */
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  async list(context: RequestContext, query: NotificationListQueryDto) {
    const scope = await this.readScope(context);
    const cursor = decodeNotificationCursor(query.cursor);
    const builder = this.notifications.createQueryBuilder('notification')
      .where('notification.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('notification.recipientUserId = :userId', { userId: context.userId });
    this.applyScope(builder, scope);
    if (query.status) builder.andWhere('notification.status = :status', { status: query.status });
    if (query.priority) {
      builder.andWhere('notification.priority = :priority', { priority: query.priority });
    }
    if (query.sourceType) {
      builder.andWhere('notification.sourceType = :sourceType', { sourceType: query.sourceType });
    }
    if (query.alertType) {
      builder.andWhere('notification.alertType = :alertType', { alertType: query.alertType });
    }
    if (query.projectId) {
      builder.andWhere('notification.projectId = :projectId', { projectId: query.projectId });
    }
    if (cursor) {
      builder.andWhere(new Brackets((where) => where
        .where('notification.createdAt < :cursorTime', { cursorTime: cursor.createdAt })
        .orWhere('notification.createdAt = :cursorTime AND notification.id < :cursorId', {
          cursorTime: cursor.createdAt, cursorId: cursor.id
        })));
    }
    const rows = await builder
      .orderBy('notification.createdAt', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.view(row)),
      meta: {
        limit: query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeNotificationCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
        ...await this.unreadCounters(context, scope)
      }
    };
  }

  /**
   * The inbox badge needs a total the current page cannot supply, so the counters travel in the list
   * meta rather than in a separate operation. They deliberately ignore the caller's filters — a
   * badge must not drop when the user narrows the view — but they obey exactly the same tenant,
   * recipient and scope predicates, so they can never disclose that unreachable work exists.
   */
  private async unreadCounters(context: RequestContext, scope: AccessScopeSets) {
    const builder = this.notifications.createQueryBuilder('notification')
      .select('notification.priority', 'priority')
      .addSelect('COUNT(*)::int', 'count')
      .where('notification.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('notification.recipientUserId = :userId', { userId: context.userId })
      .andWhere('notification.status = :status', { status: NotificationStatus.UNREAD });
    this.applyScope(builder, scope);
    const rows = await builder.groupBy('notification.priority').getRawMany<{
      priority: string; count: number;
    }>();
    const byPriority = Object.fromEntries(rows.map((row) => [row.priority, row.count]));
    return {
      unreadTotal: rows.reduce((total, row) => total + row.count, 0),
      unreadHigh: byPriority.HIGH ?? 0,
      unreadNormal: byPriority.NORMAL ?? 0
    };
  }

  async acknowledge(context: RequestContext, notificationId: string, idempotencyKey: string) {
    const scope = await this.readScope(context);
    return this.commands.execute({
      context,
      operation: 'API-136:acknowledge-notification',
      idempotencyKey,
      request: { notificationId },
      responseStatus: 200,
      resourceType: 'Notification',
      resourceId: notificationId,
      execute: async (manager) => {
        const row = await manager.getRepository(NotificationEntity).findOneBy({
          id: notificationId, tenantId: context.tenantId, recipientUserId: context.userId
        });
        // A notification the caller may not read must be indistinguishable from one that does not
        // exist, otherwise acknowledging probes the existence of hidden project or package work.
        if (!row || !this.inScope(row, scope)) {
          throw new NotFoundException({
            code: 'NOTIFICATION_NOT_FOUND',
            message: 'Không tìm thấy notification',
            retryable: false
          });
        }
        // Acknowledging twice is a no-op rather than a conflict: the inbox is a projection, so a
        // retried or duplicated client call must converge on the same READ state.
        if (row.status === NotificationStatus.READ) return this.view(row);
        row.status = NotificationStatus.READ;
        row.readAt = new Date();
        await manager.getRepository(NotificationEntity).update(
          { id: row.id, tenantId: context.tenantId },
          { status: row.status, readAt: row.readAt }
        );
        await this.emit(manager, context, row);
        return this.view(row);
      }
    });
  }

  private readScope(context: RequestContext): Promise<AccessScopeSets> {
    // SEC-107: authorization is re-evaluated at read time against the current role assignments, not
    // against whatever scope the recipient held when the worker wrote the projection row.
    return this.permissions.accessScopeSets(context, 'notification.read');
  }

  private applyScope(
    builder: { andWhere: (condition: Brackets) => unknown }, scope: AccessScopeSets
  ): void {
    if (scope.tenantWide) return;
    if (scope.projectIds.length === 0 && scope.packageIds.length === 0) {
      builder.andWhere(new Brackets((where) => where.where('1 = 0')));
      return;
    }
    builder.andWhere(new Brackets((where) => {
      where.where('1 = 0');
      if (scope.projectIds.length > 0) {
        where.orWhere('notification.projectId IN (:...scopeProjectIds)', {
          scopeProjectIds: scope.projectIds
        });
      }
      if (scope.packageIds.length > 0) {
        where.orWhere('notification.packageId IN (:...scopePackageIds)', {
          scopePackageIds: scope.packageIds
        });
      }
    }));
  }

  private inScope(row: NotificationEntity, scope: AccessScopeSets): boolean {
    if (scope.tenantWide) return true;
    if (scope.projectIds.includes(row.projectId)) return true;
    return row.packageId !== null && scope.packageIds.includes(row.packageId);
  }

  private view(row: NotificationEntity) {
    return {
      id: row.id,
      projectId: row.projectId,
      packageId: row.packageId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      activityId: row.activityId,
      alertType: row.alertType,
      priority: row.priority,
      objectLink: row.objectLink,
      reason: row.reason,
      dueAt: row.dueAt,
      dataDate: row.dataDate,
      thresholdVersion: row.thresholdVersion,
      status: row.status,
      readAt: row.readAt === null ? null : row.readAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, row: NotificationEntity
  ): Promise<void> {
    const facts: Record<string, unknown> = {
      projectId: row.projectId,
      packageId: row.packageId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      alertType: row.alertType,
      status: row.status,
      readAt: row.readAt?.toISOString() ?? null,
      summary: `Notification ${row.alertType} acknowledged`
    };
    const payload = { ...facts, effectiveActorId: context.userId };
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: 'Notification.Acknowledged',
      result: 'SUCCEEDED',
      reasonCode: null,
      correlationId: context.correlationId,
      ipHash: null,
      objectType: 'Notification',
      objectId: row.id,
      payload
    });
    await this.outbox.append(manager, context, {
      aggregateType: 'Notification',
      aggregateId: row.id,
      aggregateVersion: null,
      eventType: 'Notification.Acknowledged',
      // The projection carries no version column, so the acknowledgement itself is the unique fact.
      eventKey: createHash('sha256')
        .update(`Notification:${row.id}:acknowledged`)
        .digest('hex'),
      payload
    });
  }
}
