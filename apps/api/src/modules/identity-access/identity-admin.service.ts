import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, Repository, type EntityManager } from 'typeorm';
import {
  AssignmentScopeType, AuditEventEntity, DelegationEntity, DelegationStatus,
  MasterRecordStatus, PackageEntity, PackageStatus, ProjectEntity, RoleAssignmentEntity,
  RoleEntity, TenantEntity, UserAccountEntity, type DelegationScopeSnapshot
} from '../../database/entities';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeAuditEventCursor, encodeAuditEventCursor } from './audit-event.cursor';
import type { AuthContext } from './auth.types';
import type {
  AuditEventListQueryDto, CreateDelegationDto, CreateRoleAssignmentDto, RevokeDelegationDto
} from './dto/identity-admin.dto';
import { PermissionService } from './permission.service';

export interface RequestContext extends AuthContext { correlationId: string }

/**
 * Identity & Tenant administration (API-002/003/009/010/011/012/013).
 *
 * Design rules of this service:
 * - API-002 is a THIN VIEW over `PermissionService.identityPermissions()` — never a second
 *   authorization evaluator that could drift from the one the guards use.
 * - Grants are revoked, never deleted (SEC-118): API-010 flips the row to INACTIVE so the history
 *   of who could act, and when, stays reconstructable.
 * - Delegation (DB-008) is bounded and one level deep: no chains, no self-delegation, no
 *   `valueLimit` fake control, and revocation is delegator self-service or TENANT_ADMIN.
 * - The audit trail (API-013) answers under a hard tenant mandate only.
 */
@Injectable()
export class IdentityAdminService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(AuditEventEntity)
    private readonly audits: Repository<AuditEventEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-002 — the caller's effective permissions, explained per assignment. */
  async mePermissions(context: RequestContext) {
    const identity = await this.permissions.identityPermissions(context);
    return { data: { userId: context.userId, tenantId: context.tenantId, ...identity } };
  }

  /** API-003 — tenant configuration; any other tenant id is indistinguishable from missing. */
  async getTenant(context: RequestContext, tenantId: string) {
    // A cross-tenant probe must not learn whether the tenant exists: same 404 either way.
    if (tenantId !== context.tenantId) {
      throw this.notFound('TENANT_NOT_FOUND', 'Không tìm thấy tenant');
    }
    const tenant = await this.tenants.findOneBy({ id: tenantId });
    if (!tenant) throw this.notFound('TENANT_NOT_FOUND', 'Không tìm thấy tenant');
    // `locale` from the design sketch does not exist on DB-001 yet; only real columns are returned.
    return {
      data: {
        id: tenant.id, code: tenant.code, name: tenant.name, status: tenant.status,
        createdAt: tenant.createdAt.toISOString(), updatedAt: tenant.updatedAt.toISOString()
      }
    };
  }

  /** API-009 — grant a scoped role assignment with an effective window. */
  async createRoleAssignment(
    context: RequestContext, input: CreateRoleAssignmentDto, idempotencyKey: string
  ) {
    return this.commands.execute({
      context, operation: 'API-009:grant-role-assignment', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'RoleAssignment',
      resultReference: (result: { id: string }) => ({
        resourceType: 'RoleAssignment', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const role = await manager.getRepository(RoleEntity).findOneBy({
          id: input.roleId, tenantId: context.tenantId
        });
        if (!role || role.status !== MasterRecordStatus.ACTIVE) {
          throw this.unprocessable('ROLE_NOT_FOUND', 'Role không tồn tại hoặc không ACTIVE');
        }
        const user = await manager.getRepository(UserAccountEntity).findOneBy({
          id: input.userAccountId, tenantId: context.tenantId
        });
        if (!user || user.status !== MasterRecordStatus.ACTIVE) {
          throw this.unprocessable('USER_NOT_FOUND', 'Người dùng không tồn tại hoặc không ACTIVE');
        }
        const scopeId = await this.resolveScope(manager, context, input);
        const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
        const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
        if (effectiveTo !== null && effectiveTo.getTime() <= effectiveFrom.getTime()) {
          throw this.unprocessable(
            'EFFECTIVE_WINDOW_INVALID', 'effectiveTo phải sau effectiveFrom'
          );
        }

        const id = randomUUID();
        // `uq_role_assignment_active_tuple` is the enforcement; this only translates its failure.
        await this.rethrowUnique(
          () => manager.getRepository(RoleAssignmentEntity).insert({
            id, tenantId: context.tenantId, userAccountId: user.id, roleId: role.id,
            scopeType: input.scopeType as AssignmentScopeType, scopeId,
            effectiveFrom, effectiveTo, status: MasterRecordStatus.ACTIVE
          }),
          'ROLE_ASSIGNMENT_EXISTS', 'Người dùng đã có assignment ACTIVE trùng role và scope'
        );
        const saved = await manager.getRepository(RoleAssignmentEntity)
          .findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'RoleAssignment', saved.id, 1,
          'RoleAssignment.Granted', {
            userAccountId: saved.userAccountId, roleId: saved.roleId, roleCode: role.code,
            scopeType: saved.scopeType, scopeId: saved.scopeId,
            effectiveFrom: saved.effectiveFrom.toISOString(),
            effectiveTo: saved.effectiveTo?.toISOString() ?? null,
            summary: `Role ${role.code} granted`
          });
        return this.assignmentView(saved);
      }
    });
  }

  /**
   * API-010 — revoke, never delete. Replay-idempotent by design (the spec marks it safe and sends
   * no Idempotency-Key): revoking an already-INACTIVE assignment converges silently, and the
   * audit/outbox pair is only written for the actual transition.
   */
  async revokeRoleAssignment(context: RequestContext, assignmentId: string): Promise<void> {
    await this.audits.manager.transaction(async (manager) => {
      const assignment = await manager.getRepository(RoleAssignmentEntity)
        .createQueryBuilder('assignment')
        .setLock('pessimistic_write')
        .where('assignment.id = :id AND assignment.tenantId = :tenantId', {
          id: assignmentId, tenantId: context.tenantId
        })
        .getOne();
      // Unknown and cross-tenant are the same missing thing.
      if (!assignment) {
        throw this.notFound('ROLE_ASSIGNMENT_NOT_FOUND', 'Không tìm thấy role assignment');
      }
      if (assignment.status === MasterRecordStatus.INACTIVE) return;
      await manager.getRepository(RoleAssignmentEntity).update(
        { id: assignment.id, tenantId: context.tenantId },
        { status: MasterRecordStatus.INACTIVE }
      );
      await this.emit(manager, context, 'RoleAssignment', assignment.id, 2,
        'RoleAssignment.Revoked', {
          userAccountId: assignment.userAccountId, roleId: assignment.roleId,
          scopeType: assignment.scopeType, scopeId: assignment.scopeId,
          summary: 'Role assignment revoked'
        });
    });
  }

  /** API-011 — bounded delegation; the delegator is always the caller. */
  async createDelegation(
    context: RequestContext, input: CreateDelegationDto, idempotencyKey: string
  ) {
    // Refused before anything is written: a stored `valueLimit` nothing enforces is a fake control.
    if (input.valueLimit !== undefined) {
      throw this.unprocessable(
        'VALUE_LIMIT_NOT_SUPPORTED',
        'valueLimit chưa được hỗ trợ: chưa có cơ chế nào cưỡng chế hạn mức nên không được lưu'
      );
    }
    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = new Date(input.effectiveTo);
    if (effectiveTo.getTime() <= effectiveFrom.getTime()) {
      throw this.unprocessable('DELEGATION_WINDOW_INVALID', 'effectiveTo phải sau effectiveFrom');
    }
    return this.commands.execute({
      context, operation: 'API-011:create-delegation', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'Delegation',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Delegation', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        if (input.delegateId === context.userId) {
          throw this.unprocessable(
            'DELEGATION_SELF_FORBIDDEN', 'Không thể ủy quyền cho chính mình'
          );
        }
        const delegate = await manager.getRepository(UserAccountEntity).findOneBy({
          id: input.delegateId, tenantId: context.tenantId
        });
        if (!delegate || delegate.status !== MasterRecordStatus.ACTIVE) {
          throw this.unprocessable(
            'DELEGATE_NOT_FOUND', 'Người nhận ủy quyền không tồn tại hoặc không ACTIVE'
          );
        }
        const delegations = manager.getRepository(DelegationEntity);
        // No chains (SEC-110): while the requested window is open, the delegator must not be
        // acting as anyone's delegate — otherwise authority would flow A→B→C unseen.
        const chained = await delegations.createQueryBuilder('delegation')
          .where('delegation.tenantId = :tenantId', { tenantId: context.tenantId })
          .andWhere('delegation.delegateId = :userId', { userId: context.userId })
          .andWhere('delegation.status = :status', { status: DelegationStatus.ACTIVE })
          .andWhere('delegation.effectiveFrom < :to AND delegation.effectiveTo > :from', {
            from: effectiveFrom, to: effectiveTo
          })
          .getExists();
        if (chained) {
          throw this.unprocessable(
            'DELEGATION_CHAIN_FORBIDDEN',
            'Người ủy quyền đang là delegate của người khác; chuỗi ủy quyền bị cấm'
          );
        }
        const overlapping = await delegations.createQueryBuilder('delegation')
          .where('delegation.tenantId = :tenantId', { tenantId: context.tenantId })
          .andWhere('delegation.delegatorId = :delegatorId', { delegatorId: context.userId })
          .andWhere('delegation.delegateId = :delegateId', { delegateId: input.delegateId })
          .andWhere('delegation.status = :status', { status: DelegationStatus.ACTIVE })
          .andWhere('delegation.effectiveFrom < :to AND delegation.effectiveTo > :from', {
            from: effectiveFrom, to: effectiveTo
          })
          .getExists();
        if (overlapping) {
          throw this.conflict(
            'DELEGATION_OVERLAP', 'Đã có delegation ACTIVE trùng cặp người và giai đoạn'
          );
        }

        const scope: DelegationScopeSnapshot = {
          workflowDefinitionCodes: input.scope?.workflowDefinitionCodes ?? [],
          projectIds: input.scope?.projectIds ?? []
        };
        const id = randomUUID();
        await delegations.insert({
          id, tenantId: context.tenantId,
          delegatorId: context.userId, delegateId: input.delegateId,
          scope, effectiveFrom, effectiveTo, reason: input.reason,
          status: DelegationStatus.ACTIVE, revokedBy: null, revokedAt: null
        });
        const saved = await delegations.findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Delegation', saved.id, 1, 'Delegation.Created', {
          delegatorId: saved.delegatorId, delegateId: saved.delegateId, scope: { ...saved.scope },
          effectiveFrom: saved.effectiveFrom.toISOString(),
          effectiveTo: saved.effectiveTo.toISOString(),
          summary: 'Delegation created'
        });
        return this.delegationView(saved);
      }
    });
  }

  /** API-012 — immediate revocation: delegator self-service or TENANT_ADMIN. */
  async revokeDelegation(
    context: RequestContext, delegationId: string, input: RevokeDelegationDto,
    idempotencyKey: string
  ) {
    return this.commands.execute({
      context, operation: 'API-012:revoke-delegation', idempotencyKey,
      request: { delegationId, input }, responseStatus: 200,
      resourceType: 'Delegation', resourceId: delegationId,
      execute: async (manager) => {
        const delegation = await manager.getRepository(DelegationEntity)
          .createQueryBuilder('delegation')
          .setLock('pessimistic_write')
          .where('delegation.id = :id AND delegation.tenantId = :tenantId', {
            id: delegationId, tenantId: context.tenantId
          })
          .getOne();
        if (!delegation) {
          throw this.notFound('DELEGATION_NOT_FOUND', 'Không tìm thấy delegation');
        }
        // Out of mandate is indistinguishable from missing: only the delegator or a TENANT_ADMIN
        // may see this row through the revoke path.
        if (delegation.delegatorId !== context.userId && !await this.isTenantAdmin(context)) {
          throw this.notFound('DELEGATION_NOT_FOUND', 'Không tìm thấy delegation');
        }
        if (delegation.status === DelegationStatus.REVOKED) {
          // Converge silently: a repeated revoke is the same decision, not a conflict.
          return this.delegationView(delegation);
        }
        const revokedAt = new Date();
        await manager.getRepository(DelegationEntity).update(
          { id: delegation.id, tenantId: context.tenantId },
          { status: DelegationStatus.REVOKED, revokedBy: context.userId, revokedAt }
        );
        const updated = await manager.getRepository(DelegationEntity)
          .findOneByOrFail({ id: delegation.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Delegation', updated.id, 2, 'Delegation.Revoked', {
          delegatorId: updated.delegatorId, delegateId: updated.delegateId,
          revokedBy: context.userId, revokedAt: revokedAt.toISOString(),
          reason: input.reason ?? null,
          summary: 'Delegation revoked'
        });
        return this.delegationView(updated);
      }
    });
  }

  /** API-013 — the tenant's audit trail under a hard tenant mandate. */
  async listAuditEvents(context: RequestContext, query: AuditEventListQueryDto) {
    const cursor = decodeAuditEventCursor(query.cursor);
    const builder = this.audits.createQueryBuilder('audit')
      // Hard mandate: `tenant_id = :tenantId`. Platform-level rows carry tenant_id NULL and are
      // deliberately unreachable here — a tenant administrator audits their tenant, not the
      // platform, and NULL rows would otherwise leak cross-tenant operational facts.
      .where('audit.tenantId = :tenantId', { tenantId: context.tenantId });
    if (query.objectType) {
      builder.andWhere('audit.objectType = :objectType', { objectType: query.objectType });
    }
    if (query.objectId) builder.andWhere('audit.objectId = :objectId', { objectId: query.objectId });
    if (query.actorId) builder.andWhere('audit.actorId = :actorId', { actorId: query.actorId });
    if (query.action) builder.andWhere('audit.action = :action', { action: query.action });
    if (query.occurredFrom) {
      builder.andWhere('audit.occurredAt >= :occurredFrom', { occurredFrom: query.occurredFrom });
    }
    if (query.occurredTo) {
      builder.andWhere('audit.occurredAt <= :occurredTo', { occurredTo: query.occurredTo });
    }
    if (cursor) {
      // Compared row-wise against what `audit_events` actually stores. Spelling the boundary out as
      // `:cursorTime` loses rows: Postgres keeps `occurred_at` at microsecond precision while the
      // encoded cursor carries a millisecond JS `Date`, so an event written in the same millisecond
      // as the boundary — a single command emits several — satisfies neither `<` nor `=` and
      // vanishes from the next page. Losing audit rows is worse than losing any other list.
      // The boundary lookup is tenant-scoped so a forged cursor cannot shift this tenant's page.
      builder.andWhere(new Brackets((where) => where
        .where(
          `(audit.occurredAt, audit.id) < (
             SELECT boundary.occurred_at, boundary.id FROM audit_events boundary
             WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
           )`,
          { cursorId: cursor.id, cursorTenantId: context.tenantId }
        )
        .orWhere(new Brackets((fallback) => fallback
          .where(`NOT EXISTS (
             SELECT 1 FROM audit_events missing
             WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId
           )`)
          .andWhere(new Brackets((legacy) => legacy
            .where('audit.occurredAt < :cursorTime', { cursorTime: cursor.occurredAt })
            .orWhere('audit.occurredAt = :cursorTime AND audit.id < :cursorId', {
              cursorTime: cursor.occurredAt, cursorId: cursor.id
            })))))));
    }
    const rows = await builder
      .orderBy('audit.occurredAt', 'DESC').addOrderBy('audit.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.auditView(row)),
      meta: {
        limit: query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeAuditEventCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /** Scope object of an API-009 grant must exist in this tenant; TENANT must carry none. */
  private async resolveScope(
    manager: EntityManager, context: RequestContext, input: CreateRoleAssignmentDto
  ): Promise<string | null> {
    if (input.scopeType === 'TENANT') {
      if (input.scopeId !== undefined) {
        throw this.unprocessable('SCOPE_INVALID', 'Scope TENANT không nhận scopeId');
      }
      return null;
    }
    if (!input.scopeId) {
      throw this.unprocessable('SCOPE_INVALID', 'Scope PROJECT/PACKAGE cần scopeId');
    }
    if (input.scopeType === 'PROJECT') {
      const exists = await manager.getRepository(ProjectEntity).existsBy({
        id: input.scopeId, tenantId: context.tenantId
      });
      if (!exists) throw this.unprocessable('PROJECT_NOT_FOUND', 'Dự án không thuộc tenant này');
      return input.scopeId;
    }
    const packageExists = await manager.getRepository(PackageEntity).existsBy({
      id: input.scopeId, tenantId: context.tenantId, status: PackageStatus.ACTIVE
    });
    if (!packageExists) {
      throw this.unprocessable('PACKAGE_NOT_FOUND', 'Package không tồn tại hoặc không ACTIVE');
    }
    return input.scopeId;
  }

  /**
   * Role-code check, not a permission check: docs/09 names TENANT_ADMIN as the administrative
   * revoker, and a permission here would let any future grant widen the kill switch unnoticed.
   */
  private async isTenantAdmin(context: RequestContext): Promise<boolean> {
    const assignments = await this.permissions.effectiveAssignments(context);
    return assignments.some((assignment) => assignment.roleCode === 'TENANT_ADMIN');
  }

  private assignmentView(row: RoleAssignmentEntity) {
    return {
      id: row.id, userAccountId: row.userAccountId, roleId: row.roleId,
      scopeType: row.scopeType, scopeId: row.scopeId,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
      status: row.status, createdAt: row.createdAt.toISOString()
    };
  }

  private delegationView(row: DelegationEntity) {
    return {
      id: row.id, delegatorId: row.delegatorId, delegateId: row.delegateId,
      scope: {
        workflowDefinitionCodes: row.scope.workflowDefinitionCodes ?? [],
        projectIds: row.scope.projectIds ?? []
      },
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo.toISOString(),
      reason: row.reason, status: row.status,
      revokedBy: row.revokedBy,
      revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    };
  }

  private auditView(row: AuditEventEntity) {
    return {
      id: row.id, actorId: row.actorId, action: row.action, result: row.result,
      reasonCode: row.reasonCode, objectType: row.objectType, objectId: row.objectId,
      correlationId: row.correlationId, payload: row.payload,
      occurredAt: row.occurredAt.toISOString()
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId };
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: eventType, result: 'SUCCEEDED', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: aggregateType, objectId: aggregateId, payload: safePayload
    });
    await this.outbox.append(manager, context, {
      aggregateType, aggregateId, aggregateVersion, eventType,
      eventKey: createHash('sha256')
        .update(`${aggregateType}:${aggregateId}:${aggregateVersion}:${eventType}`)
        .digest('hex'),
      payload: safePayload
    });
  }

  private async rethrowUnique<T>(action: () => Promise<T>, code: string, message: string): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as { code?: string; driverError?: { code?: string } };
      if ((candidate.code ?? candidate.driverError?.code) === '23505') {
        throw new ConflictException({ code, message, retryable: false });
      }
      throw cause;
    }
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message, retryable: false });
  }

  private unprocessable(code: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, message, retryable: false });
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message, retryable: false });
  }
}
