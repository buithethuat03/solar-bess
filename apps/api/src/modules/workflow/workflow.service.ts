import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  ApprovalDecisionEntity, AuditEventEntity, DelegationEntity, DelegationStatus,
  TERMINAL_WORKFLOW_STATES, WorkflowDecision,
  WorkflowDefinitionEntity, WorkflowDefinitionStatus, WorkflowInstanceEntity,
  WorkflowInstanceState, WorkflowVersionEntity, WorkflowVersionStatus,
  type WorkflowRoutingRules, type WorkflowRoutingStep
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeWorkflowCursor, encodeWorkflowCursor } from './domain/cursor';
import { matchDelegations } from './domain/delegation-match';
import {
  findStep, firstStepKey, nextStepKey, requiredApprovals, validateRoutingRules
} from './domain/routing-rules';
import type {
  ApprovalTaskListQueryDto, CancelWorkflowInstanceDto, EscalateWorkflowInstanceDto,
  PublishWorkflowVersionDto, RecordApprovalDecisionDto, StartWorkflowInstanceDto,
  WorkflowDefinitionListQueryDto
} from './dto/workflow.dto';
import {
  WORKFLOW_TARGET_RESOLVER, type WorkflowTargetResolver
} from './workflow-target.port';

export interface RequestContext extends AuthContext { correlationId: string }

/** The only columns a decision or cancellation may move; the frozen route is not among them. */
interface InstanceTransitionPatch {
  versionNo: number;
  state?: WorkflowInstanceState;
  currentStepKey?: string | null;
  currentAttemptNo?: number;
  closedBy?: string | null;
  closedAt?: Date | null;
  closureReason?: string | null;
}

/**
 * US-015 approval engine (API-106…API-112).
 *
 * The engine records who decided what; the domain aggregate still owns its own final transition,
 * its own version check and its own SoD rule. Nothing here writes to a target aggregate.
 */
@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(WorkflowDefinitionEntity)
    private readonly definitions: Repository<WorkflowDefinitionEntity>,
    @InjectRepository(WorkflowVersionEntity)
    private readonly versions: Repository<WorkflowVersionEntity>,
    @InjectRepository(WorkflowInstanceEntity)
    private readonly instances: Repository<WorkflowInstanceEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService,
    @Inject(WORKFLOW_TARGET_RESOLVER)
    private readonly targets: WorkflowTargetResolver
  ) {}

  /** API-106 — definitions are tenant configuration, so this list is tenant-scoped only. */
  async listDefinitions(context: RequestContext, query: WorkflowDefinitionListQueryDto) {
    const cursor = decodeWorkflowCursor(query.cursor);
    const builder = this.definitions.createQueryBuilder('definition')
      .where('definition.tenantId = :tenantId', { tenantId: context.tenantId });
    if (query.objectType) {
      builder.andWhere('definition.objectType = :objectType', { objectType: query.objectType });
    }
    if (query.status) {
      builder.andWhere('definition.status = :status', { status: query.status });
    }
    if (cursor) this.applyCursor(builder, 'definition', cursor, 'workflow_definitions', context.tenantId);
    const rows = await builder
      .orderBy('definition.createdAt', 'DESC').addOrderBy('definition.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const versions = await this.versionsFor(context.tenantId, page.map((row) => row.id));
    return {
      items: page.map((row) => ({
        ...this.definitionView(row),
        versions: (versions.get(row.id) ?? []).map((version) => this.versionView(version))
      })),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-107 — publish an immutable version under BR-034 maker-checker. */
  async publishVersion(
    context: RequestContext, definitionId: string,
    input: PublishWorkflowVersionDto, idempotencyKey: string
  ) {
    await this.assertPermission(context, 'workflowDefinition.publish');
    return this.commands.execute({
      context, operation: 'API-107:publish-workflow-version', idempotencyKey,
      request: { definitionId, input }, responseStatus: 200,
      resourceType: 'WorkflowVersion', resourceId: input.workflowVersionId,
      execute: async (manager) => {
        const definition = await manager.getRepository(WorkflowDefinitionEntity).findOneBy({
          id: definitionId, tenantId: context.tenantId
        });
        if (!definition) throw this.notFound('WORKFLOW_DEFINITION_NOT_FOUND', 'Không tìm thấy workflow definition');

        const version = await manager.getRepository(WorkflowVersionEntity)
          .createQueryBuilder('version')
          .setLock('pessimistic_write')
          .where('version.id = :id AND version.tenantId = :tenantId AND version.workflowDefinitionId = :definitionId', {
            id: input.workflowVersionId, tenantId: context.tenantId, definitionId
          })
          .getOne();
        if (!version) throw this.notFound('WORKFLOW_VERSION_NOT_FOUND', 'Không tìm thấy workflow version');
        if (version.version !== input.expectedVersion) {
          throw this.versionConflict(version.version);
        }
        if (version.status !== WorkflowVersionStatus.DRAFT) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ version DRAFT mới được publish'
          );
        }
        // BR-034: the author of a version can never be the one who releases it.
        if (version.createdBy === context.userId) {
          throw new ForbiddenException({
            code: 'WORKFLOW_PUBLISH_SOD',
            message: 'Người tạo version không được tự publish',
            retryable: false
          });
        }

        const issues = validateRoutingRules(version.routingRules);
        if (issues.length > 0) {
          throw new BadRequestException({
            code: 'WORKFLOW_RULES_INVALID',
            message: 'Routing rules không hợp lệ',
            retryable: false,
            issues: issues.map((issue) => ({
              code: issue.code, path: issue.path, row: null,
              severity: 'ERROR' as const, message: issue.message
            }))
          });
        }

        const now = new Date();
        // Only one PUBLISHED version per definition (partial unique index backs this up).
        await manager.getRepository(WorkflowVersionEntity).update(
          {
            tenantId: context.tenantId, workflowDefinitionId: definitionId,
            status: WorkflowVersionStatus.PUBLISHED
          },
          { status: WorkflowVersionStatus.SUPERSEDED, effectiveTo: now }
        );
        await manager.getRepository(WorkflowVersionEntity).update(
          { id: version.id, tenantId: context.tenantId },
          {
            status: WorkflowVersionStatus.PUBLISHED, publishedBy: context.userId,
            publishedAt: now, effectiveFrom: now
          }
        );
        const published = await manager.getRepository(WorkflowVersionEntity)
          .findOneByOrFail({ id: version.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'WorkflowVersion', published.id, published.version,
          'WorkflowVersion.Published', {
            workflowDefinitionId: definitionId, version: published.version,
            rulesHash: published.rulesHash, comment: input.comment,
            summary: `Workflow version ${published.version} published`
          });
        return this.versionView(published);
      }
    });
  }

  /** API-108 — start an instance, freezing the published route so AC-069 holds. */
  async startInstance(
    context: RequestContext, input: StartWorkflowInstanceDto, idempotencyKey: string
  ) {
    await this.assertPermission(context, 'workflow.start');
    const scope = await this.permissions.accessScopeSets(context, 'workflow.start');
    return this.commands.execute({
      context, operation: 'API-108:start-workflow-instance', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'WorkflowInstance',
      resultReference: (result: { id: string }) => ({
        resourceType: 'WorkflowInstance', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const definition = await manager.getRepository(WorkflowDefinitionEntity).findOneBy({
          id: input.workflowDefinitionId, tenantId: context.tenantId
        });
        if (!definition) throw this.notFound('WORKFLOW_DEFINITION_NOT_FOUND', 'Không tìm thấy workflow definition');
        if (definition.status !== WorkflowDefinitionStatus.ACTIVE) {
          throw this.unprocessable('INVALID_STATE_TRANSITION', 'Workflow definition không ACTIVE');
        }
        if (definition.objectType !== input.objectType) {
          throw this.unprocessable(
            'WORKFLOW_CONFIGURATION_ERROR', 'Definition không phục vụ object type này'
          );
        }

        const version = await manager.getRepository(WorkflowVersionEntity).findOneBy({
          tenantId: context.tenantId, workflowDefinitionId: definition.id,
          status: WorkflowVersionStatus.PUBLISHED
        });
        if (!version) {
          throw this.unprocessable(
            'WORKFLOW_VERSION_NOT_PUBLISHED', 'Definition chưa có version được publish'
          );
        }

        if (!this.targets.supports(input.objectType)) {
          throw this.unprocessable('WORKFLOW_CONFIGURATION_ERROR', 'Object type chưa được hỗ trợ');
        }
        const target = await this.targets.resolve(
          manager, { tenantId: context.tenantId, userId: context.userId },
          input.objectType, input.objectId
        );
        // Scope is taken from the resolved aggregate, never from the request.
        if (!target || !this.inScope(target.projectId, target.packageId, scope)) {
          throw this.notFound('WORKFLOW_TARGET_NOT_FOUND', 'Không tìm thấy đối tượng cần phê duyệt');
        }

        const stepKey = firstStepKey(version.routingRules);
        if (!stepKey) {
          throw this.unprocessable(
            'WORKFLOW_CONFIGURATION_ERROR', 'Route đã publish không có step nào'
          );
        }

        const row = manager.getRepository(WorkflowInstanceEntity).create({
          id: randomUUID(), tenantId: context.tenantId,
          workflowDefinitionId: definition.id, workflowVersionId: version.id,
          objectType: input.objectType, objectId: input.objectId,
          objectVersion: target.objectVersion,
          projectId: target.projectId, packageId: target.packageId,
          state: WorkflowInstanceState.SUBMITTED, currentStepKey: stepKey,
          currentAttemptNo: 1, routeSnapshot: version.routingRules,
          routeHash: version.rulesHash, slaDueAt: null,
          requestedBy: target.requesterId, closedBy: null, closedAt: null, closureReason: null
        });
        const saved = await this.rethrowUnique(
          () => manager.getRepository(WorkflowInstanceEntity).save(row),
          'WORKFLOW_INSTANCE_ACTIVE', 'Đối tượng đã có workflow instance đang chạy'
        );
        await this.emit(manager, context, 'WorkflowInstance', saved.id, saved.versionNo,
          'WorkflowInstance.Started', this.instanceEvent(saved));
        return this.instanceView(saved);
      }
    });
  }

  /** API-109 — instance detail plus its append-only decision history. */
  async getInstance(context: RequestContext, instanceId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'workflow.read');
    const row = await this.instances.findOneBy({ id: instanceId, tenantId: context.tenantId });
    if (!row || !this.inScope(row.projectId, row.packageId, scope)) {
      throw this.notFound('WORKFLOW_INSTANCE_NOT_FOUND', 'Không tìm thấy workflow instance');
    }
    const decisions = await this.instances.manager.getRepository(ApprovalDecisionEntity).find({
      where: { tenantId: context.tenantId, workflowInstanceId: row.id },
      order: { sequenceNo: 'ASC' }
    });
    return {
      data: this.instanceView(row),
      decisions: decisions.map((decision) => this.decisionView(decision))
    };
  }

  /** API-110 — the effective actor's cross-project inbox. */
  async listApprovalTasks(context: RequestContext, query: ApprovalTaskListQueryDto) {
    const scope = await this.permissions.accessScopeSets(context, 'approvalTask.read');
    const cursor = decodeWorkflowCursor(query.cursor);
    const builder = this.instances.createQueryBuilder('instance')
      .where('instance.tenantId = :tenantId', { tenantId: context.tenantId });
    // An inbox only ever contains work that can still be acted on.
    builder.andWhere('instance.state NOT IN (:...terminal)', { terminal: TERMINAL_WORKFLOW_STATES });
    this.applyScope(builder, scope);
    if (query.state) builder.andWhere('instance.state = :state', { state: query.state });
    if (query.objectType) {
      builder.andWhere('instance.objectType = :objectType', { objectType: query.objectType });
    }
    if (query.projectId) {
      builder.andWhere('instance.projectId = :projectId', { projectId: query.projectId });
    }
    if (cursor) this.applyCursor(builder, 'instance', cursor, 'workflow_instances', context.tenantId);
    const rows = await builder
      .orderBy('instance.createdAt', 'DESC').addOrderBy('instance.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => this.instanceView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-111 — record an approve/reject/return decision. */
  async recordDecision(
    context: RequestContext, instanceId: string,
    input: RecordApprovalDecisionDto, idempotencyKey: string
  ) {
    await this.assertPermission(context, 'approval.decide');
    const scope = await this.permissions.accessScopeSets(context, 'approval.decide');
    if (input.decision === WorkflowDecision.CONDITIONAL_APPROVE) {
      // The list of non-waivable safety/statutory controls does not exist yet, so a conditional
      // approval cannot be proven not to waive one.
      throw this.unprocessable(
        'CONDITIONAL_APPROVE_NOT_ENABLED',
        'Conditional approve chưa được bật vì danh sách control không thể miễn trừ chưa được phê duyệt'
      );
    }
    return this.commands.execute({
      context, operation: 'API-111:record-approval-decision', idempotencyKey,
      request: { instanceId, input }, responseStatus: 200,
      resourceType: 'WorkflowInstance', resourceId: instanceId,
      execute: async (manager) => {
        const instance = await this.lockInstance(manager, context, instanceId, scope);
        if (TERMINAL_WORKFLOW_STATES.includes(instance.state)) {
          throw this.unprocessable('INVALID_STATE_TRANSITION', 'Workflow instance đã kết thúc');
        }
        if (instance.currentStepKey !== input.stepKey) {
          throw this.unprocessable('INVALID_STATE_TRANSITION', 'Step không phải bước hiện tại');
        }
        if (instance.versionNo !== input.expectedVersion) {
          throw this.versionConflict(instance.versionNo);
        }
        // SEC-110/BR-034: the signed-in actor can never decide on their own submission — no
        // delegation can launder that, because delegation never expands or transfers SoD immunity.
        if (instance.requestedBy === context.userId) {
          throw new ForbiddenException({
            code: 'SOD_CONFLICT',
            message: 'Người yêu cầu không được tự quyết định',
            retryable: false
          });
        }

        const rules = instance.routeSnapshot;
        const step = findStep(rules, input.stepKey);
        if (!step) {
          throw this.unprocessable('WORKFLOW_CONFIGURATION_ERROR', 'Step không có trong route snapshot');
        }
        // US-018 delegation consumption: when the caller does not personally hold a step role, an
        // ACTIVE in-window, scope-matching delegation whose DELEGATOR is eligible lets the caller
        // act. `actor_id` stays the caller; `effective_actor_id` becomes the delegator, so the
        // ledger shows both identities of the decision.
        const effectiveActorId = await this.resolveEffectiveActor(manager, context, instance, step);
        // SoD against BOTH identities: the requester may be neither the one who clicks nor the one
        // whose authority is consumed (requester-as-delegator would be self-approval by proxy).
        if (instance.requestedBy === effectiveActorId) {
          throw new ForbiddenException({
            code: 'SOD_CONFLICT',
            message: 'Người yêu cầu không được tự quyết định (kể cả qua ủy quyền)',
            retryable: false
          });
        }

        const decisions = manager.getRepository(ApprovalDecisionEntity);
        // `uq_approval_decision_actor_attempt` guards the signed-in actor; the same rule must hold
        // for the effective identity, or one person's authority could decide twice in a step
        // (once directly, once through a delegate).
        const effectiveDuplicate = await decisions.existsBy({
          tenantId: context.tenantId, workflowInstanceId: instance.id,
          stepKey: input.stepKey, attemptNo: instance.currentAttemptNo, effectiveActorId
        });
        if (effectiveDuplicate) {
          throw new ConflictException({
            code: 'DECISION_ALREADY_RECORDED',
            message: 'Danh tính hiệu lực này đã quyết định ở bước hiện tại',
            retryable: false
          });
        }
        const sequenceNo = await decisions.countBy({
          tenantId: context.tenantId, workflowInstanceId: instance.id
        }) + 1;
        const decidedAt = new Date();
        await this.rethrowUnique(
          () => decisions.insert({
            id: randomUUID(), tenantId: context.tenantId, workflowInstanceId: instance.id,
            sequenceNo, stepKey: input.stepKey, attemptNo: instance.currentAttemptNo,
            decision: input.decision, actorId: context.userId, effectiveActorId,
            comment: input.comment, conditions: [], decidedAt,
            correlationId: context.correlationId
          }),
          'DECISION_ALREADY_RECORDED', 'Người này đã quyết định ở bước hiện tại'
        );

        const transition = await this.applyDecision(manager, context, instance, input, sequenceNo, decidedAt);
        const updated = await manager.getRepository(WorkflowInstanceEntity)
          .findOneByOrFail({ id: instance.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'WorkflowInstance', updated.id, updated.versionNo,
          `WorkflowInstance.${transition}`, {
            ...this.instanceEvent(updated), decision: input.decision,
            stepKey: input.stepKey, sequenceNo, actorId: context.userId
          }, effectiveActorId);
        return { ...this.instanceView(updated), sequenceNo, effectiveActorId };
      }
    });
  }

  /** API-112 — cancel per policy; never an implicit approval. */
  async cancelInstance(
    context: RequestContext, instanceId: string,
    input: CancelWorkflowInstanceDto, idempotencyKey: string
  ) {
    await this.assertPermission(context, 'workflow.cancel');
    const scope = await this.permissions.accessScopeSets(context, 'workflow.cancel');
    return this.commands.execute({
      context, operation: 'API-112:cancel-workflow-instance', idempotencyKey,
      request: { instanceId, input }, responseStatus: 200,
      resourceType: 'WorkflowInstance', resourceId: instanceId,
      execute: async (manager) => {
        const instance = await this.lockInstance(manager, context, instanceId, scope);
        if (TERMINAL_WORKFLOW_STATES.includes(instance.state)) {
          throw this.unprocessable('INVALID_STATE_TRANSITION', 'Workflow instance đã kết thúc');
        }
        if (instance.versionNo !== input.expectedVersion) {
          throw this.versionConflict(instance.versionNo);
        }
        await manager.getRepository(WorkflowInstanceEntity).update(
          { id: instance.id, tenantId: context.tenantId },
          {
            state: WorkflowInstanceState.CANCELLED, currentStepKey: null,
            closedBy: context.userId, closedAt: new Date(), closureReason: input.reason,
            versionNo: instance.versionNo + 1
          }
        );
        const updated = await manager.getRepository(WorkflowInstanceEntity)
          .findOneByOrFail({ id: instance.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'WorkflowInstance', updated.id, updated.versionNo,
          'WorkflowInstance.Cancelled',
          { ...this.instanceEvent(updated), reason: input.reason });
        return this.instanceView(updated);
      }
    });
  }

  /**
   * API-113 — escalate/remind the pending step. Deliberately NOT a state transition: the instance
   * keeps its state, step and `version_no` (a raw UPDATE bypasses the optimistic column so an open
   * decision's `expectedVersion` stays valid). Only the escalation facts move, and the outbox event
   * uses the new `escalation_count` as its aggregateVersion — `version_no` does not advance here,
   * so reusing it would collide with the start/decision event of the same version under
   * `uq_outbox_aggregate_event`, while the count is unique per escalation by construction.
   */
  async escalateInstance(
    context: RequestContext, instanceId: string,
    input: EscalateWorkflowInstanceDto, idempotencyKey: string
  ) {
    await this.assertPermission(context, 'workflow.escalate');
    const scope = await this.permissions.accessScopeSets(context, 'workflow.escalate');
    return this.commands.execute({
      context, operation: 'API-113:escalate-workflow-instance', idempotencyKey,
      request: { instanceId, input }, responseStatus: 200,
      resourceType: 'WorkflowInstance', resourceId: instanceId,
      execute: async (manager) => {
        const instance = await this.lockInstance(manager, context, instanceId, scope);
        if (TERMINAL_WORKFLOW_STATES.includes(instance.state)) {
          throw this.unprocessable('INVALID_STATE_TRANSITION', 'Workflow instance đã kết thúc');
        }
        // TypeORM answers raw UPDATE queries as [rows, affectedCount].
        const [escalatedRows] = await manager.query<[
          Array<{ escalationCount: number; lastEscalatedAt: Date }>, number
        ]>(
          `UPDATE workflow_instances
           SET escalation_count = escalation_count + 1, last_escalated_at = now(), updated_at = now()
           WHERE tenant_id = $1 AND id = $2
           RETURNING escalation_count AS "escalationCount", last_escalated_at AS "lastEscalatedAt"`,
          [context.tenantId, instance.id]
        );
        const escalated = escalatedRows[0];
        await this.emit(manager, context, 'WorkflowInstance', instance.id,
          escalated.escalationCount, 'WorkflowInstance.EscalationRequested', {
            ...this.instanceEvent(instance), reason: input.reason,
            escalationCount: escalated.escalationCount,
            escalatedAt: escalated.lastEscalatedAt.toISOString(),
            requestedBy: instance.requestedBy,
            summary: `Workflow instance escalation ${escalated.escalationCount} requested`
          });
        return {
          ...this.instanceView(instance),
          escalationCount: escalated.escalationCount,
          lastEscalatedAt: escalated.lastEscalatedAt.toISOString()
        };
      }
    });
  }

  /**
   * Moves the instance according to the decision. APPROVE advances only when the step has collected
   * enough approvals for its rule; RETURN re-opens the same step under a new attempt so the
   * "one decision per actor per step" rule does not block a legitimate resubmission.
   */
  private async applyDecision(
    manager: EntityManager, context: RequestContext, instance: WorkflowInstanceEntity,
    input: RecordApprovalDecisionDto, sequenceNo: number, decidedAt: Date
  ): Promise<string> {
    const repository = manager.getRepository(WorkflowInstanceEntity);
    const rules: WorkflowRoutingRules = instance.routeSnapshot;
    // Only the transition columns are patched. Typing the patch narrowly keeps `routeSnapshot`
    // out of the update entirely, which is what makes the frozen route unrewritable here.
    const patch: InstanceTransitionPatch = { versionNo: instance.versionNo + 1 };

    if (input.decision === WorkflowDecision.REJECT) {
      Object.assign(patch, {
        state: WorkflowInstanceState.REJECTED, currentStepKey: null,
        closedBy: context.userId, closedAt: decidedAt, closureReason: input.comment
      });
      await repository.update({ id: instance.id, tenantId: context.tenantId }, patch);
      return 'Rejected';
    }

    if (input.decision === WorkflowDecision.RETURN) {
      Object.assign(patch, {
        state: WorkflowInstanceState.RETURNED,
        currentStepKey: instance.currentStepKey,
        currentAttemptNo: instance.currentAttemptNo + 1
      });
      await repository.update({ id: instance.id, tenantId: context.tenantId }, patch);
      return 'Returned';
    }

    const step = findStep(rules, input.stepKey)!;
    const approvals = await manager.getRepository(ApprovalDecisionEntity).countBy({
      tenantId: context.tenantId, workflowInstanceId: instance.id,
      stepKey: input.stepKey, attemptNo: instance.currentAttemptNo,
      decision: WorkflowDecision.APPROVE
    });
    if (approvals < requiredApprovals(step)) {
      // Still gathering approvals for this step; the instance stays open on the same step.
      Object.assign(patch, { state: WorkflowInstanceState.IN_REVIEW });
      await repository.update({ id: instance.id, tenantId: context.tenantId }, patch);
      return 'StepApprovalRecorded';
    }

    const next = nextStepKey(rules, input.stepKey);
    if (next) {
      Object.assign(patch, {
        state: WorkflowInstanceState.IN_REVIEW, currentStepKey: next, currentAttemptNo: 1
      });
      await repository.update({ id: instance.id, tenantId: context.tenantId }, patch);
      return 'StepAdvanced';
    }
    Object.assign(patch, {
      state: WorkflowInstanceState.APPROVED, currentStepKey: null,
      closedBy: context.userId, closedAt: decidedAt, closureReason: input.comment
    });
    await repository.update({ id: instance.id, tenantId: context.tenantId }, patch);
    void sequenceNo;
    return 'Approved';
  }

  private async lockInstance(
    manager: EntityManager, context: RequestContext, instanceId: string, scope: AccessScopeSets
  ): Promise<WorkflowInstanceEntity> {
    const instance = await manager.getRepository(WorkflowInstanceEntity)
      .createQueryBuilder('instance')
      .setLock('pessimistic_write')
      .where('instance.id = :id AND instance.tenantId = :tenantId', {
        id: instanceId, tenantId: context.tenantId
      })
      .getOne();
    // Out of scope is indistinguishable from missing, so an instance id cannot be probed.
    if (!instance || !this.inScope(instance.projectId, instance.packageId, scope)) {
      throw this.notFound('WORKFLOW_INSTANCE_NOT_FOUND', 'Không tìm thấy workflow instance');
    }
    return instance;
  }

  /**
   * US-018: who does this decision count for?
   *
   * 1. Personally eligible (holds a step/fallback role right now) → the caller themself.
   * 2. Otherwise, walk the caller's ACTIVE delegations in deterministic (created_at, id) order and
   *    return the first delegator who (a) still holds a step role — re-read live, a revoked
   *    delegator confers nothing — and (b) whose delegation scope covers this instance
   *    (workflowDefinitionCodes empty-or-contains, projectIds empty-or-contains).
   * 3. Nobody → the same APPROVER_NOT_FOUND the engine always answered; a delegation must never
   *    make ineligibility more observable than it already is.
   */
  private async resolveEffectiveActor(
    manager: EntityManager, context: RequestContext,
    instance: WorkflowInstanceEntity, step: WorkflowRoutingStep
  ): Promise<string> {
    const roleCodes = step.approverSelector.roleCodes;
    const fallbackRoleCodes = step.fallbackRoleCodes;
    if (await this.holdsStepRole(context, context.userId, roleCodes, fallbackRoleCodes)) {
      return context.userId;
    }
    // The definition code anchors delegation scope; the definition row always outlives its
    // instances (RESTRICT FK), so a missing row can only mean a foreign-tenant id.
    const definition = await manager.getRepository(WorkflowDefinitionEntity).findOneBy({
      id: instance.workflowDefinitionId, tenantId: context.tenantId
    });
    const rows = await manager.getRepository(DelegationEntity).find({
      where: {
        tenantId: context.tenantId, delegateId: context.userId, status: DelegationStatus.ACTIVE
      },
      order: { createdAt: 'ASC', id: 'ASC' }
    });
    const candidates = matchDelegations(rows, {
      definitionCode: definition?.code ?? null,
      projectId: instance.projectId,
      at: new Date()
    });
    for (const candidate of candidates) {
      if (await this.holdsStepRole(context, candidate.delegatorId, roleCodes, fallbackRoleCodes)) {
        return candidate.delegatorId;
      }
    }
    throw this.unprocessable(
      'APPROVER_NOT_FOUND', 'Người dùng không giữ vai trò được phép phê duyệt bước này'
    );
  }

  /**
   * Live role check for one identity. Grants are re-read per decision rather than trusted from any
   * snapshot, so a revoked approver — or a revoked delegator — cannot decide.
   */
  private async holdsStepRole(
    context: RequestContext, userId: string, roleCodes: string[], fallbackRoleCodes: string[]
  ): Promise<boolean> {
    const assignments = await this.permissions.effectiveAssignments({ ...context, userId });
    const held = new Set(assignments.map((assignment) => assignment.roleCode));
    return roleCodes.some((code) => held.has(code))
      || fallbackRoleCodes.some((code) => held.has(code));
  }

  private async assertPermission(context: RequestContext, action: string): Promise<void> {
    if (await this.permissions.has(context, action, 'ANY')) return;
    throw new ForbiddenException({
      code: 'PERMISSION_DENIED', message: 'Không đủ quyền thực hiện thao tác', retryable: false
    });
  }

  private async versionsFor(
    tenantId: string, definitionIds: string[]
  ): Promise<Map<string, WorkflowVersionEntity[]>> {
    const grouped = new Map<string, WorkflowVersionEntity[]>();
    if (definitionIds.length === 0) return grouped;
    const rows = await this.versions.createQueryBuilder('version')
      .where('version.tenantId = :tenantId', { tenantId })
      .andWhere('version.workflowDefinitionId IN (:...definitionIds)', { definitionIds })
      .orderBy('version.version', 'DESC')
      .getMany();
    for (const row of rows) {
      const list = grouped.get(row.workflowDefinitionId) ?? [];
      list.push(row);
      grouped.set(row.workflowDefinitionId, list);
    }
    return grouped;
  }

  private applyScope(builder: SelectQueryBuilder<WorkflowInstanceEntity>, scope: AccessScopeSets): void {
    if (scope.tenantWide) return;
    if (scope.projectIds.length === 0 && scope.packageIds.length === 0) {
      builder.andWhere('1 = 0');
      return;
    }
    builder.andWhere(new Brackets((where) => {
      where.where('1 = 0');
      if (scope.projectIds.length > 0) {
        where.orWhere('instance.projectId IN (:...scopeProjectIds)', {
          scopeProjectIds: scope.projectIds
        });
      }
      if (scope.packageIds.length > 0) {
        where.orWhere('instance.packageId IN (:...scopePackageIds)', {
          scopePackageIds: scope.packageIds
        });
      }
    }));
  }

  /**
   * Keyset predicate compared row-wise against the cursor row's stored values.
   *
   * The naive form — `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)` —
   * silently loses rows. Postgres keeps `timestamptz` at microsecond precision while a JS `Date`
   * (and so the ISO string inside the cursor) only carries milliseconds, so any row whose stored
   * timestamp has sub-millisecond digits matches neither branch and vanishes from the next page.
   * An inbox is exactly where that shows: a fan-out starts many instances under one `now()`.
   * Reading the boundary straight out of `table` compares the real stored values, and
   * `(created_at, id) < (…)` stays a row-wise comparison the `(created_at DESC, id DESC)` ordering
   * index can drive.
   *
   * When the cursor row itself has gone the old millisecond comparison is used as a fallback — a
   * marginally conservative page beats failing a request that carries a stale cursor.
   */
  private applyCursor<T extends { createdAt: Date; id: string }>(
    builder: SelectQueryBuilder<T>, alias: string, cursor: { createdAt: string; id: string },
    table: string, tenantId: string
  ): void {
    builder.andWhere(new Brackets((where) => where
      .where(
        `(${alias}.createdAt, ${alias}.id) < (
           SELECT boundary.created_at, boundary.id FROM ${table} boundary
           WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
         )`,
        { cursorId: cursor.id, cursorTenantId: tenantId }
      )
      .orWhere(new Brackets((fallback) => fallback
        .where(`NOT EXISTS (SELECT 1 FROM ${table} missing WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId)`)
        .andWhere(new Brackets((legacy) => legacy
          .where(`${alias}.createdAt < :cursorTime`, { cursorTime: cursor.createdAt })
          .orWhere(`${alias}.createdAt = :cursorTime AND ${alias}.id < :cursorId`, {
            cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: tenantId
          })))))));
  }

  private pageMeta<T extends { createdAt: Date; id: string }>(
    rows: T[], page: T[], limit: number
  ) {
    const last = page.at(-1);
    return {
      limit,
      nextCursor: rows.length > limit && last
        ? encodeWorkflowCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    };
  }

  private inScope(projectId: string, packageId: string | null, scope: AccessScopeSets): boolean {
    if (scope.tenantWide) return true;
    if (scope.projectIds.includes(projectId)) return true;
    return packageId !== null && scope.packageIds.includes(packageId);
  }

  private definitionView(row: WorkflowDefinitionEntity) {
    return {
      id: row.id, code: row.code, name: row.name, objectType: row.objectType,
      processOwnerId: row.processOwnerId, status: row.status, versionNo: row.versionNo,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private versionView(row: WorkflowVersionEntity) {
    return {
      id: row.id, workflowDefinitionId: row.workflowDefinitionId, version: row.version,
      status: row.status, rulesHash: row.rulesHash,
      stepCount: row.routingRules.steps.length,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo === null ? null : row.effectiveTo.toISOString(),
      createdBy: row.createdBy, publishedBy: row.publishedBy,
      publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString()
    };
  }

  private instanceView(row: WorkflowInstanceEntity) {
    return {
      id: row.id, workflowDefinitionId: row.workflowDefinitionId,
      workflowVersionId: row.workflowVersionId, objectType: row.objectType,
      objectId: row.objectId, objectVersion: row.objectVersion,
      projectId: row.projectId, packageId: row.packageId, state: row.state,
      currentStepKey: row.currentStepKey, currentAttemptNo: row.currentAttemptNo,
      routeHash: row.routeHash, requestedBy: row.requestedBy,
      escalationCount: row.escalationCount,
      lastEscalatedAt: row.lastEscalatedAt === null ? null : row.lastEscalatedAt.toISOString(),
      closedBy: row.closedBy, closedAt: row.closedAt === null ? null : row.closedAt.toISOString(),
      closureReason: row.closureReason, versionNo: row.versionNo,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private decisionView(row: ApprovalDecisionEntity) {
    return {
      id: row.id, sequenceNo: row.sequenceNo, stepKey: row.stepKey, attemptNo: row.attemptNo,
      decision: row.decision, actorId: row.actorId, effectiveActorId: row.effectiveActorId,
      comment: row.comment, decidedAt: row.decidedAt.toISOString()
    };
  }

  private instanceEvent(row: WorkflowInstanceEntity): Record<string, unknown> {
    return {
      workflowDefinitionId: row.workflowDefinitionId, objectType: row.objectType,
      objectId: row.objectId, projectId: row.projectId, packageId: row.packageId,
      state: row.state, currentStepKey: row.currentStepKey,
      summary: `Workflow instance ${row.state}`
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>,
    // Defaults to the caller; a delegated decision passes the delegator so audit and outbox carry
    // the identity the decision counts for, alongside `actorId` (who signed in).
    effectiveActorId: string = context.userId
  ): Promise<void> {
    const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId };
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
      if ((cause as { code?: string }).code === '23505') {
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

  private versionConflict(currentVersion: number): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
      retryable: false, currentVersion
    });
  }
}
