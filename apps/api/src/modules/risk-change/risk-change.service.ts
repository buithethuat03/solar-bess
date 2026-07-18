import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import {
  Brackets, type EntityManager, Repository, type SelectQueryBuilder
} from 'typeorm';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import {
  AuditEventEntity, ChangeRequestEntity, ChangeRequestStatus, ChangeSourceType,
  AssignmentScopeType, ExposureLevel, IssueEntity, IssueSeverity, IssueStatus,
  MasterRecordStatus, PackageEntity, ProjectEntity, RoleAssignmentEntity,
  RiskChangeDecision, RiskEntity, RiskIssueActionEntity, RiskIssueActionStatus,
  RiskIssueClosureCycleEntity, RiskStatus, ScheduleBaselineEntity
} from '../../database/entities';
import type {
  ChangeImpactRecord
} from '../../database/entities/change-request.entity';
import type { EvidenceReferenceRecord } from '../../database/entities/risk-change.enums';
import type { AuthContext } from '../identity-access/auth.types';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import {
  ActionListQueryDto, ChangeDecisionDto, ChangeListQueryDto, ClosureDecisionDto,
  CreateActionDto, CreateChangeDto, CreateIssueDto, CreateRiskDto, DetailQueryDto,
  IssueListQueryDto, RiskChangeHistoryQueryDto, RiskChangeHistorySourceTypeDto,
  RiskChangeSummaryQueryDto, RiskListQueryDto, SubmitChangeDto, UpdateActionDto,
  UpdateChangeDto, UpdateIssueDto, UpdateRiskDto
} from './dto/risk-change.dto';
import {
  decodeCursor, encodeCursor, isClosureCursor, isHistoryCursor, isTimeCursor
} from './domain/cursor';
import { effectiveRiskScore, scoreRisk } from './domain/risk-scoring';
import {
  actionCommandKind, canChangeTransition, canIssueTransition, canRiskTransition
} from './domain/state-policy';

interface RequestContext extends AuthContext { correlationId: string }
type PackageScope = string[] | null;

interface CompleteChangeImpact {
  scope: { summary: string };
  schedule: {
    summary: string;
    durationDeltaDays: number;
    requiresRebaseline: boolean;
    affectedMilestoneIds: string[];
  };
  cost: { summary: string; amountDelta: string; currency: string };
  quality: { summary: string };
  hse: { summary: string };
  contract: { summary: string };
}

@Injectable()
export class RiskChangeService {
  constructor(
    @InjectRepository(RiskEntity) private readonly risks: Repository<RiskEntity>,
    @InjectRepository(IssueEntity) private readonly issues: Repository<IssueEntity>,
    @InjectRepository(RiskIssueActionEntity)
    private readonly actions: Repository<RiskIssueActionEntity>,
    @InjectRepository(ChangeRequestEntity)
    private readonly changes: Repository<ChangeRequestEntity>,
    @InjectRepository(RiskIssueClosureCycleEntity)
    private readonly closureCycles: Repository<RiskIssueClosureCycleEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(PackageEntity) private readonly packages: Repository<PackageEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async listRisks(context: RequestContext, projectId: string, query: RiskListQueryDto) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    this.assertRequestedPackage(scope, query.packageId);
    const cursor = decodeCursor(query.cursor, isTimeCursor);
    const builder = this.risks.createQueryBuilder('risk')
      .where('risk.tenantId = :tenantId AND risk.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(builder, 'risk', scope, query.packageId);
    if (query.status) builder.andWhere('risk.status = :status', { status: query.status });
    if (query.ownerId) builder.andWhere('risk.ownerId = :ownerId', { ownerId: query.ownerId });
    if (query.exposureLevel) {
      builder.andWhere('COALESCE(risk.residualLevel, risk.inherentLevel) = :level', {
        level: query.exposureLevel
      });
    }
    if (query.reviewBefore) {
      builder.andWhere('risk.reviewDate <= :reviewBefore', { reviewBefore: query.reviewBefore });
    }
    if (cursor) {
      builder.andWhere(new Brackets((where) => where
        .where('risk.createdAt < :cursorTime', { cursorTime: cursor.createdAt })
        .orWhere('risk.createdAt = :cursorTime AND risk.id < :cursorId', {
          cursorTime: cursor.createdAt, cursorId: cursor.id
        })));
    }
    const rows = await builder.orderBy('risk.createdAt', 'DESC').addOrderBy('risk.id', 'DESC')
      .take(query.limit + 1).getMany();
    return this.page(rows, query.limit, (row) => this.riskSummary(row));
  }

  async getRisk(
    context: RequestContext, projectId: string, riskId: string, query: DetailQueryDto
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    const row = await this.risks.findOneBy({ id: riskId, tenantId: context.tenantId, projectId });
    this.assertVisible(row, scope, 'RISK_NOT_FOUND', 'Không tìm thấy Risk');
    const cycles = await this.closureCyclePage(
      context.tenantId, projectId, row.id, null, query
    );
    return { data: this.riskView(row), ...cycles };
  }

  async createRisk(
    context: RequestContext, projectId: string, input: CreateRiskDto, idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.create');
    await this.assertCreatePackage(context.tenantId, projectId, input.packageId ?? null, scope);
    try {
      return await this.commands.execute({
        context, operation: 'API-038:create-risk', idempotencyKey, request: { projectId, input },
        responseStatus: 201,
        execute: async (manager) => {
          await this.assertAssignable(
            manager, context.tenantId, projectId, input.packageId ?? null, input.ownerId
          );
          const score = this.score({
            probability: input.probability,
            costImpactRating: input.costImpactRating,
            scheduleImpactRating: input.scheduleImpactRating,
            hseImpactRating: input.hseImpactRating
          });
          const row = manager.getRepository(RiskEntity).create({
            id: randomUUID(), tenantId: context.tenantId, projectId,
            packageId: input.packageId ?? null, code: input.code, category: input.category.trim(),
            cause: input.cause.trim(), event: input.event.trim(), impact: input.impact.trim(),
            probability: score.probability, costImpactRating: score.costImpactRating,
            scheduleImpactRating: score.scheduleImpactRating,
            hseImpactRating: score.hseImpactRating, impactRating: score.impactRating,
            inherentExposure: score.exposure, inherentLevel: score.level,
            residualProbability: null, residualCostImpactRating: null,
            residualScheduleImpactRating: null, residualHseImpactRating: null,
            residualImpactRating: null, residualExposure: null, residualLevel: null,
            scoringVersion: this.config.riskChange.scoringVersion,
            thresholdVersion: this.config.riskChange.thresholdVersion,
            ownerId: input.ownerId, reviewDate: input.reviewDate,
            responseStrategy: input.responseStrategy ?? null,
            responsePlan: this.optionalText(input.responsePlan), trigger: this.optionalText(input.trigger),
            contingencyPlan: this.optionalText(input.contingencyPlan),
            evidenceRefs: input.evidenceRefs, status: RiskStatus.IDENTIFIED,
            occurredIssueId: null, closureRequestedBy: null, closureRequestedAt: null,
            closureReason: null, closureRequestEvidenceRefs: [], closureDecision: null,
            closureDecisionEvidenceRefs: [], closureDecidedBy: null, closureDecidedAt: null,
            closureDecisionComment: null, versionNo: 1,
            createdBy: context.userId, updatedBy: context.userId
          });
          const saved = await manager.getRepository(RiskEntity).save(row);
          await this.emit(
            manager, context, 'Risk', saved.id, saved.versionNo,
            'RiskCreated', this.riskEvent(saved)
          );
          return this.riskView(saved);
        },
        resultReference: (result) => ({
          resourceType: 'Risk', resourceId: result.id, responseStatus: 201
        })
      });
    } catch (error) {
      this.rethrowUnique(error, 'uq_risk_project_code', 'RISK_DUPLICATE', 'Mã Risk đã tồn tại');
    }
  }

  async updateRisk(
    context: RequestContext, projectId: string, riskId: string, input: UpdateRiskDto,
    idempotencyKey: string
  ) {
    this.assertRiskUpdateShape(input);
    const permission = input.status === RiskStatus.CLOSURE_PENDING
      ? 'riskChange.requestClosure' : 'riskChange.manage';
    const scope = await this.accessScope(context, projectId, permission);
    return this.commands.execute({
      context, operation: 'API-144:update-risk', idempotencyKey,
      request: { projectId, riskId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(RiskEntity);
        const row = await repository.createQueryBuilder('risk').setLock('pessimistic_write')
          .where('risk.id = :riskId AND risk.tenantId = :tenantId AND risk.projectId = :projectId', {
            riskId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(row, scope, 'RISK_NOT_FOUND', 'Không tìm thấy Risk');
        this.assertVersion(row.versionNo, input.expectedVersion);
        const beforeStatus = row.status;
        let eventType = 'RiskChanged';
        if (input.status && !canRiskTransition(row.status, input.status)) {
          this.invalidTransition(row.status, input.status);
        }
        if (input.residualAssessment) {
          this.requireFullScope(scope);
          if (!input.residualAssessmentReason || !input.evidenceRefs?.length) {
            throw new UnprocessableEntityException({
              code: 'RESIDUAL_EVIDENCE_REQUIRED',
              message: 'Residual reassessment cần reason và evidence', retryable: false
            });
          }
          const residual = this.score(input.residualAssessment);
          row.residualProbability = residual.probability;
          row.residualCostImpactRating = residual.costImpactRating;
          row.residualScheduleImpactRating = residual.scheduleImpactRating;
          row.residualHseImpactRating = residual.hseImpactRating;
          row.residualImpactRating = residual.impactRating;
          row.residualExposure = residual.exposure;
          row.residualLevel = residual.level;
        }
        if (input.status === RiskStatus.CLOSURE_PENDING) {
          if (beforeStatus !== RiskStatus.MONITORING || !input.closureReason
            || !input.closureEvidenceRefs?.length) {
            throw new UnprocessableEntityException({
              code: 'CLOSE_EVIDENCE_REQUIRED',
              message: 'Chỉ Risk MONITORING với reason/evidence mới được yêu cầu closure', retryable: false
            });
          }
          await this.assertNoBlockingActions(manager, context.tenantId, projectId, row.id, null);
          await this.appendClosureCycle(
            manager, context, projectId, row.packageId, row.id, null,
            input.closureReason, input.closureEvidenceRefs
          );
          row.closureRequestedBy = context.userId;
          row.closureRequestedAt = new Date();
          row.closureReason = input.closureReason.trim();
          row.closureRequestEvidenceRefs = input.closureEvidenceRefs;
          row.closureDecision = null;
          row.closureDecisionEvidenceRefs = [];
          row.closureDecidedBy = null;
          row.closureDecidedAt = null;
          row.closureDecisionComment = null;
          eventType = 'RiskClosureRequested';
        }
        if (beforeStatus === RiskStatus.CLOSED && input.status === RiskStatus.MONITORING
          && !input.evidenceRefs?.length) {
          throw new UnprocessableEntityException({
            code: 'REOPEN_EVIDENCE_REQUIRED',
            message: 'Reopen Risk cần evidence mới', retryable: false
          });
        }
        if (input.status === RiskStatus.OCCURRED) {
          if (!input.occurredIssueId) {
            throw new UnprocessableEntityException({
              code: 'ISSUE_NOT_FOUND', message: 'Risk OCCURRED cần Issue liên kết', retryable: false
            });
          }
          const issue = await manager.getRepository(IssueEntity).findOneBy({
            id: input.occurredIssueId, tenantId: context.tenantId, projectId,
            sourceRiskId: row.id
          });
          if (!issue || issue.packageId !== row.packageId) {
            throw new NotFoundException({
              code: 'ISSUE_NOT_FOUND', message: 'Không tìm thấy Issue cùng Risk/package scope', retryable: false
            });
          }
          row.occurredIssueId = issue.id;
        }
        if (input.ownerId && input.ownerId !== row.ownerId) {
          await this.assertAssignable(manager, context.tenantId, projectId, row.packageId, input.ownerId);
        }
        this.assignRiskFields(row, input);
        if (input.status) row.status = input.status;
        if (this.inherentInputChanged(input)) {
          const score = this.score({
            probability: input.probability ?? row.probability,
            costImpactRating: input.costImpactRating ?? row.costImpactRating,
            scheduleImpactRating: input.scheduleImpactRating ?? row.scheduleImpactRating,
            hseImpactRating: input.hseImpactRating ?? row.hseImpactRating
          });
          row.probability = score.probability;
          row.costImpactRating = score.costImpactRating;
          row.scheduleImpactRating = score.scheduleImpactRating;
          row.hseImpactRating = score.hseImpactRating;
          row.impactRating = score.impactRating;
          row.inherentExposure = score.exposure;
          row.inherentLevel = score.level;
          row.scoringVersion = this.config.riskChange.scoringVersion;
          row.thresholdVersion = this.config.riskChange.thresholdVersion;
        }
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'Risk', saved.id, saved.versionNo, eventType,
          { ...this.riskEvent(saved), previousStatus: beforeStatus,
            ...(input.residualAssessment ? {
              residualAssessmentReason: input.residualAssessmentReason!.trim()
            } : {}),
            summary: eventType === 'RiskClosureRequested'
              ? 'Risk closure requested' : 'Risk updated' }
        );
        return this.riskView(saved);
      },
      resultReference: (result) => ({ resourceType: 'Risk', resourceId: result.id, responseStatus: 200 })
    });
  }

  async listIssues(context: RequestContext, projectId: string, query: IssueListQueryDto) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    this.assertRequestedPackage(scope, query.packageId);
    const cursor = decodeCursor(query.cursor, isTimeCursor);
    const builder = this.issues.createQueryBuilder('issue')
      .where('issue.tenantId = :tenantId AND issue.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(builder, 'issue', scope, query.packageId);
    if (query.status) builder.andWhere('issue.status = :status', { status: query.status });
    if (query.ownerId) builder.andWhere('issue.ownerId = :ownerId', { ownerId: query.ownerId });
    if (query.severity) builder.andWhere('issue.severity = :severity', { severity: query.severity });
    if (query.targetBefore) {
      builder.andWhere('issue.targetDate <= :targetBefore', { targetBefore: query.targetBefore });
    }
    if (query.sourceRiskId) {
      builder.andWhere('issue.sourceRiskId = :sourceRiskId', { sourceRiskId: query.sourceRiskId });
    }
    if (cursor) {
      builder.andWhere(new Brackets((where) => where
        .where('issue.createdAt < :cursorTime', { cursorTime: cursor.createdAt })
        .orWhere('issue.createdAt = :cursorTime AND issue.id < :cursorId', {
          cursorTime: cursor.createdAt, cursorId: cursor.id
        })));
    }
    const rows = await builder.orderBy('issue.createdAt', 'DESC').addOrderBy('issue.id', 'DESC')
      .take(query.limit + 1).getMany();
    return this.page(rows, query.limit, (row) => this.issueSummary(row));
  }

  async getIssue(
    context: RequestContext, projectId: string, issueId: string, query: DetailQueryDto
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    const row = await this.issues.findOneBy({ id: issueId, tenantId: context.tenantId, projectId });
    this.assertVisible(row, scope, 'ISSUE_NOT_FOUND', 'Không tìm thấy Issue');
    const cycles = await this.closureCyclePage(
      context.tenantId, projectId, null, row.id, query
    );
    return { data: this.issueView(row), ...cycles };
  }

  async createIssue(
    context: RequestContext, projectId: string, input: CreateIssueDto, idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.create');
    let requestedPackageId = input.packageId ?? null;
    if (!input.sourceRiskId) {
      await this.assertCreatePackage(context.tenantId, projectId, requestedPackageId, scope);
    }
    try {
      return await this.commands.execute({
        context, operation: 'API-145:create-issue', idempotencyKey,
        request: { projectId, input }, responseStatus: 201,
        execute: async (manager) => {
          let sourceRisk: RiskEntity | null = null;
          if (input.sourceRiskId) {
            sourceRisk = await manager.getRepository(RiskEntity).createQueryBuilder('risk')
              .setLock('pessimistic_write')
              .where('risk.id = :id AND risk.tenantId = :tenantId AND risk.projectId = :projectId', {
                id: input.sourceRiskId, tenantId: context.tenantId, projectId
              }).getOne();
            this.assertVisible(sourceRisk, scope, 'RISK_NOT_FOUND', 'Không tìm thấy source Risk');
            if (input.packageId !== undefined && input.packageId !== sourceRisk.packageId) {
              throw new UnprocessableEntityException({
                code: 'PROJECT_SCOPE_DENIED',
                message: 'Issue phải kế thừa package scope của source Risk', retryable: false
              });
            }
            requestedPackageId = sourceRisk.packageId;
          }
          await this.assertAssignable(
            manager, context.tenantId, projectId, requestedPackageId, input.ownerId
          );
          const row = manager.getRepository(IssueEntity).create({
            id: randomUUID(), tenantId: context.tenantId, projectId,
            packageId: requestedPackageId, code: input.code, title: input.title.trim(),
            description: input.description.trim(), occurredAt: new Date(input.occurredAt),
            rootCause: input.rootCause.trim(), actualImpact: input.actualImpact.trim(),
            severity: input.severity, decisionSummary: null, ownerId: input.ownerId,
            targetDate: input.targetDate, sourceRiskId: sourceRisk?.id ?? null,
            evidenceRefs: input.evidenceRefs, status: IssueStatus.REPORTED,
            resolutionSummary: null, resolutionEvidenceRefs: [], resolvedBy: null, resolvedAt: null,
            closureRequestedBy: null, closureRequestedAt: null, closureReason: null,
            closureRequestEvidenceRefs: [], closureDecision: null,
            closureDecisionEvidenceRefs: [], closureDecidedBy: null, closureDecidedAt: null,
            closureDecisionComment: null, versionNo: 1,
            createdBy: context.userId, updatedBy: context.userId
          });
          const savedIssue = await manager.getRepository(IssueEntity).save(row);
          await this.emit(
            manager, context, 'Issue', savedIssue.id, savedIssue.versionNo,
            'IssueCreated', this.issueEvent(savedIssue)
          );
          if (input.markSourceRiskOccurred) {
            if (!sourceRisk || sourceRisk.status === RiskStatus.CLOSED
              || sourceRisk.status === RiskStatus.OCCURRED) {
              throw new UnprocessableEntityException({
                code: 'INVALID_STATE_TRANSITION',
                message: 'Source Risk không ở trạng thái cho phép OCCURRED', retryable: false
              });
            }
            const previousRiskStatus = sourceRisk.status;
            sourceRisk.status = RiskStatus.OCCURRED;
            sourceRisk.occurredIssueId = row.id;
            sourceRisk.updatedBy = context.userId;
            const savedRisk = await manager.getRepository(RiskEntity).save(sourceRisk);
            await this.emit(
              manager, context, 'Risk', savedRisk.id, savedRisk.versionNo, 'RiskChanged',
              { ...this.riskEvent(savedRisk), previousStatus: previousRiskStatus,
                summary: 'Risk occurred and linked to Issue' }
            );
          }
          return this.issueView(savedIssue);
        },
        resultReference: (result) => ({
          resourceType: 'Issue', resourceId: result.id, responseStatus: 201
        })
      });
    } catch (error) {
      this.rethrowUnique(error, 'uq_issue_project_code', 'ISSUE_DUPLICATE', 'Mã Issue đã tồn tại');
    }
  }

  async updateIssue(
    context: RequestContext, projectId: string, issueId: string, input: UpdateIssueDto,
    idempotencyKey: string
  ) {
    this.assertIssueUpdateShape(input);
    const permission = input.status === IssueStatus.CLOSURE_PENDING
      ? 'riskChange.requestClosure' : 'riskChange.manage';
    const scope = await this.accessScope(context, projectId, permission);
    return this.commands.execute({
      context, operation: 'API-147:update-issue', idempotencyKey,
      request: { projectId, issueId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(IssueEntity);
        const row = await repository.createQueryBuilder('issue').setLock('pessimistic_write')
          .where('issue.id = :issueId AND issue.tenantId = :tenantId AND issue.projectId = :projectId', {
            issueId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(row, scope, 'ISSUE_NOT_FOUND', 'Không tìm thấy Issue');
        this.assertVersion(row.versionNo, input.expectedVersion);
        const beforeStatus = row.status;
        let eventType = 'IssueChanged';
        if (input.status && !canIssueTransition(row.status, input.status)) {
          this.invalidTransition(row.status, input.status);
        }
        if (input.status === IssueStatus.RESOLVED) {
          if (!input.resolutionSummary || !input.resolutionEvidenceRefs?.length) {
            throw new UnprocessableEntityException({
              code: 'CLOSE_EVIDENCE_REQUIRED',
              message: 'Issue RESOLVED cần resolution summary và evidence', retryable: false
            });
          }
          row.resolutionSummary = input.resolutionSummary.trim();
          row.resolutionEvidenceRefs = input.resolutionEvidenceRefs;
          row.resolvedBy = context.userId;
          row.resolvedAt = new Date();
        }
        if (input.status === IssueStatus.CLOSURE_PENDING) {
          if (beforeStatus !== IssueStatus.RESOLVED || !input.closureReason
            || !input.closureEvidenceRefs?.length) {
            throw new UnprocessableEntityException({
              code: 'CLOSE_EVIDENCE_REQUIRED',
              message: 'Chỉ Issue RESOLVED với reason/evidence mới được yêu cầu closure', retryable: false
            });
          }
          await this.assertNoBlockingActions(manager, context.tenantId, projectId, null, row.id);
          await this.appendClosureCycle(
            manager, context, projectId, row.packageId, null, row.id,
            input.closureReason, input.closureEvidenceRefs
          );
          row.closureRequestedBy = context.userId;
          row.closureRequestedAt = new Date();
          row.closureReason = input.closureReason.trim();
          row.closureRequestEvidenceRefs = input.closureEvidenceRefs;
          row.closureDecision = null;
          row.closureDecisionEvidenceRefs = [];
          row.closureDecidedBy = null;
          row.closureDecidedAt = null;
          row.closureDecisionComment = null;
          eventType = 'IssueClosureRequested';
        }
        if (input.status === IssueStatus.REOPENED && !input.evidenceRefs?.length) {
          throw new UnprocessableEntityException({
            code: 'REOPEN_EVIDENCE_REQUIRED',
            message: 'Reopen Issue cần evidence mới', retryable: false
          });
        }
        if (input.ownerId && input.ownerId !== row.ownerId) {
          await this.assertAssignable(manager, context.tenantId, projectId, row.packageId, input.ownerId);
        }
        this.assignIssueFields(row, input);
        if (input.status) row.status = input.status;
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'Issue', saved.id, saved.versionNo, eventType,
          { ...this.issueEvent(saved), previousStatus: beforeStatus,
            summary: eventType === 'IssueClosureRequested'
              ? 'Issue closure requested' : 'Issue updated' }
        );
        return this.issueView(saved);
      },
      resultReference: (result) => ({ resourceType: 'Issue', resourceId: result.id, responseStatus: 200 })
    });
  }

  async listActions(context: RequestContext, projectId: string, query: ActionListQueryDto) {
    if (query.riskId && query.issueId) {
      throw new BadRequestException({
        code: 'ACTION_PARENT_FILTER_INVALID',
        message: 'Chỉ được lọc một trong riskId hoặc issueId', retryable: false
      });
    }
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    const cursor = decodeCursor(query.cursor, isTimeCursor);
    const builder = this.actions.createQueryBuilder('action')
      .where('action.tenantId = :tenantId AND action.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(builder, 'action', scope);
    if (query.riskId) builder.andWhere('action.riskId = :riskId', { riskId: query.riskId });
    if (query.issueId) builder.andWhere('action.issueId = :issueId', { issueId: query.issueId });
    if (query.status) builder.andWhere('action.status = :status', { status: query.status });
    if (query.ownerId) builder.andWhere('action.ownerId = :ownerId', { ownerId: query.ownerId });
    if (query.dueBefore) builder.andWhere('action.dueDate <= :dueBefore', { dueBefore: query.dueBefore });
    if (cursor) {
      builder.andWhere(new Brackets((where) => where
        .where('action.createdAt < :cursorTime', { cursorTime: cursor.createdAt })
        .orWhere('action.createdAt = :cursorTime AND action.id < :cursorId', {
          cursorTime: cursor.createdAt, cursorId: cursor.id
        })));
    }
    const rows = await builder.orderBy('action.createdAt', 'DESC').addOrderBy('action.id', 'DESC')
      .take(query.limit + 1).getMany();
    return this.page(rows, query.limit, (row) => this.actionSummary(row));
  }

  async getAction(context: RequestContext, projectId: string, actionId: string) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    const row = await this.actions.findOneBy({
      id: actionId, tenantId: context.tenantId, projectId
    });
    this.assertVisible(row, scope, 'ACTION_NOT_FOUND', 'Không tìm thấy Action');
    return this.actionView(row);
  }

  async createAction(
    context: RequestContext, projectId: string, input: CreateActionDto, idempotencyKey: string
  ) {
    if ((input.riskId === undefined) === (input.issueId === undefined)) {
      throw new BadRequestException({
        code: 'ACTION_PARENT_REQUIRED',
        message: 'Action cần đúng một riskId hoặc issueId', retryable: false
      });
    }
    const scope = await this.accessScope(context, projectId, 'riskChange.manage');
    try {
      return await this.commands.execute({
        context, operation: 'API-148:create-action', idempotencyKey,
        request: { projectId, input }, responseStatus: 201,
        execute: async (manager) => {
          const parent = input.riskId
            ? await manager.getRepository(RiskEntity).findOneBy({
              id: input.riskId, tenantId: context.tenantId, projectId
            })
            : await manager.getRepository(IssueEntity).findOneBy({
              id: input.issueId!, tenantId: context.tenantId, projectId
            });
          this.assertVisible(
            parent, scope, input.riskId ? 'RISK_NOT_FOUND' : 'ISSUE_NOT_FOUND',
            input.riskId ? 'Không tìm thấy Risk' : 'Không tìm thấy Issue'
          );
          await this.assertAssignable(
            manager, context.tenantId, projectId, parent.packageId, input.ownerId
          );
          const row = manager.getRepository(RiskIssueActionEntity).create({
            id: randomUUID(), tenantId: context.tenantId, projectId,
            packageId: parent.packageId, riskId: input.riskId ?? null,
            issueId: input.issueId ?? null, code: input.code, actionType: input.actionType,
            title: input.title.trim(), description: this.optionalText(input.description),
            ownerId: input.ownerId, dueDate: input.dueDate, status: RiskIssueActionStatus.OPEN,
            statusReason: null, evidenceRefs: input.evidenceRefs,
            residualProbability: null, residualCostImpactRating: null,
            residualScheduleImpactRating: null, residualHseImpactRating: null,
            residualRationale: null, residualRiskVersion: null,
            completedBy: null, completedAt: null,
            verifiedBy: null, verifiedAt: null, cancelledBy: null, cancelledAt: null,
            versionNo: 1, createdBy: context.userId, updatedBy: context.userId
          });
          const saved = await manager.getRepository(RiskIssueActionEntity).save(row);
          await this.emit(
            manager, context, 'RiskIssueAction', saved.id, saved.versionNo,
            'RiskIssueActionCreated', this.actionEvent(saved)
          );
          return this.actionView(saved);
        },
        resultReference: (result) => ({
          resourceType: 'RiskIssueAction', resourceId: result.id, responseStatus: 201
        })
      });
    } catch (error) {
      this.rethrowUnique(
        error, 'uq_risk_issue_action_project_code', 'ACTION_DUPLICATE', 'Mã Action đã tồn tại'
      );
    }
  }

  async updateAction(
    context: RequestContext, projectId: string, actionId: string, input: UpdateActionDto,
    idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.manage');
    const kind = actionCommandKind(input.status);
    this.assertActionCommandShape(input, kind);
    if (kind === 'VERIFY' || kind === 'CANCEL') this.requireFullScope(scope);
    return this.commands.execute({
      context, operation: `API-149:update-action:${kind}`, idempotencyKey,
      request: { projectId, actionId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(RiskIssueActionEntity);
        const row = await repository.createQueryBuilder('action').setLock('pessimistic_write')
          .where('action.id = :actionId AND action.tenantId = :tenantId AND action.projectId = :projectId', {
            actionId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(row, scope, 'ACTION_NOT_FOUND', 'Không tìm thấy Action');
        this.assertVersion(row.versionNo, input.expectedVersion);
        const beforeStatus = row.status;
        let eventType = 'RiskIssueActionChanged';
        if (kind === 'FIELDS') {
          if (row.status === RiskIssueActionStatus.VERIFIED
            || row.status === RiskIssueActionStatus.CANCELLED
            || row.status === RiskIssueActionStatus.DONE) {
            this.invalidTransition(row.status, input.status ?? row.status);
          }
          if (input.ownerId && input.ownerId !== row.ownerId) {
            await this.assertAssignable(
              manager, context.tenantId, projectId, row.packageId, input.ownerId
            );
          }
          if (input.title !== undefined) row.title = input.title.trim();
          if (input.description !== undefined) row.description = this.optionalText(input.description);
          if (input.ownerId !== undefined) row.ownerId = input.ownerId;
          if (input.dueDate !== undefined) row.dueDate = input.dueDate;
          if (input.statusReason !== undefined) row.statusReason = input.statusReason.trim();
          if (input.evidenceRefs !== undefined) row.evidenceRefs = input.evidenceRefs;
          if (input.status !== undefined) {
            if (![RiskIssueActionStatus.OPEN, RiskIssueActionStatus.IN_PROGRESS,
              RiskIssueActionStatus.BLOCKED].includes(input.status)) {
              this.invalidTransition(row.status, input.status);
            }
            row.status = input.status;
          }
        } else if (kind === 'COMPLETE') {
          if (![RiskIssueActionStatus.OPEN, RiskIssueActionStatus.IN_PROGRESS,
            RiskIssueActionStatus.BLOCKED].includes(row.status)) {
            this.invalidTransition(row.status, RiskIssueActionStatus.DONE);
          }
          if (!input.evidenceRefs?.length) this.actionEvidenceRequired();
          if ((input.residualAssessment === undefined) !== (input.residualRiskVersion === undefined)) {
            throw new BadRequestException({
              code: 'ACTION_RESIDUAL_COMMAND_INVALID',
              message: 'Residual proposal cần đủ assessment và residualRiskVersion', retryable: false
            });
          }
          if (input.residualAssessment) {
            if (!row.riskId) {
              throw new UnprocessableEntityException({
                code: 'ACTION_RESIDUAL_PARENT_INVALID',
                message: 'Chỉ Risk Action được đề xuất residual assessment', retryable: false
              });
            }
            const risk = await manager.getRepository(RiskEntity).createQueryBuilder('risk')
              .setLock('pessimistic_read')
              .where('risk.id = :id AND risk.tenantId = :tenantId AND risk.projectId = :projectId', {
                id: row.riskId, tenantId: context.tenantId, projectId
              }).getOneOrFail();
            if (risk.versionNo !== input.residualRiskVersion) this.versionConflict();
            row.residualProbability = input.residualAssessment.probability;
            row.residualCostImpactRating = input.residualAssessment.costImpactRating;
            row.residualScheduleImpactRating = input.residualAssessment.scheduleImpactRating;
            row.residualHseImpactRating = input.residualAssessment.hseImpactRating;
            row.residualRationale = this.optionalText(input.residualAssessment.rationale);
            row.residualRiskVersion = input.residualRiskVersion;
          }
          row.status = RiskIssueActionStatus.DONE;
          row.evidenceRefs = input.evidenceRefs!;
          row.completedBy = context.userId;
          row.completedAt = new Date();
          eventType = 'RiskIssueActionCompleted';
        } else if (kind === 'VERIFY') {
          if (row.status !== RiskIssueActionStatus.DONE) {
            this.invalidTransition(row.status, RiskIssueActionStatus.VERIFIED);
          }
          this.assertIndependentActionActor(row, context.userId);
          if (!input.evidenceRefs?.length) this.actionEvidenceRequired();
          if (row.residualProbability !== null) {
            const risk = await manager.getRepository(RiskEntity).createQueryBuilder('risk')
              .setLock('pessimistic_write')
              .where('risk.id = :id AND risk.tenantId = :tenantId AND risk.projectId = :projectId', {
                id: row.riskId, tenantId: context.tenantId, projectId
              }).getOneOrFail();
            if (risk.versionNo !== row.residualRiskVersion) this.versionConflict();
            const residual = this.score({
              probability: row.residualProbability,
              costImpactRating: row.residualCostImpactRating!,
              scheduleImpactRating: row.residualScheduleImpactRating!,
              hseImpactRating: row.residualHseImpactRating!
            });
            risk.residualProbability = residual.probability;
            risk.residualCostImpactRating = residual.costImpactRating;
            risk.residualScheduleImpactRating = residual.scheduleImpactRating;
            risk.residualHseImpactRating = residual.hseImpactRating;
            risk.residualImpactRating = residual.impactRating;
            risk.residualExposure = residual.exposure;
            risk.residualLevel = residual.level;
            risk.scoringVersion = this.config.riskChange.scoringVersion;
            risk.thresholdVersion = this.config.riskChange.thresholdVersion;
            risk.updatedBy = context.userId;
            const savedRisk = await manager.getRepository(RiskEntity).save(risk);
            await this.emit(
              manager, context, 'Risk', savedRisk.id, savedRisk.versionNo, 'RiskChanged',
              { ...this.riskEvent(savedRisk), summary: 'Verified Action promoted residual assessment' }
            );
          }
          row.status = RiskIssueActionStatus.VERIFIED;
          row.evidenceRefs = input.evidenceRefs!;
          row.verifiedBy = context.userId;
          row.verifiedAt = new Date();
          eventType = 'RiskIssueActionVerified';
        } else {
          if (row.status === RiskIssueActionStatus.VERIFIED
            || row.status === RiskIssueActionStatus.CANCELLED) {
            this.invalidTransition(row.status, RiskIssueActionStatus.CANCELLED);
          }
          this.assertIndependentActionActor(row, context.userId);
          if (!input.evidenceRefs?.length || !input.statusReason) {
            throw new UnprocessableEntityException({
              code: 'ACTION_CANCEL_REASON_REQUIRED',
              message: 'Cancel Action cần reason và evidence', retryable: false
            });
          }
          row.status = RiskIssueActionStatus.CANCELLED;
          row.statusReason = input.statusReason.trim();
          row.evidenceRefs = input.evidenceRefs;
          row.cancelledBy = context.userId;
          row.cancelledAt = new Date();
          eventType = 'RiskIssueActionCancelled';
        }
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'RiskIssueAction', saved.id, saved.versionNo, eventType,
          { ...this.actionEvent(saved), previousStatus: beforeStatus,
            summary: this.actionEventSummary(eventType) }
        );
        return this.actionView(saved);
      },
      resultReference: (result) => ({
        resourceType: 'RiskIssueAction', resourceId: result.id, responseStatus: 200
      })
    });
  }

  async listChanges(context: RequestContext, projectId: string, query: ChangeListQueryDto) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    this.assertRequestedPackage(scope, query.packageId);
    const cursor = decodeCursor(query.cursor, isTimeCursor);
    const builder = this.changes.createQueryBuilder('change')
      .where('change.tenantId = :tenantId AND change.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(builder, 'change', scope, query.packageId);
    if (query.status) builder.andWhere('change.status = :status', { status: query.status });
    if (query.ownerId) builder.andWhere('change.ownerId = :ownerId', { ownerId: query.ownerId });
    if (query.sourceType) {
      builder.andWhere('change.sourceType = :sourceType', { sourceType: query.sourceType });
    }
    if (query.sourceId) {
      builder.andWhere('(change.sourceRiskId = :sourceId OR change.sourceIssueId = :sourceId)', {
        sourceId: query.sourceId
      });
    }
    if (cursor) {
      builder.andWhere(new Brackets((where) => where
        .where('change.createdAt < :cursorTime', { cursorTime: cursor.createdAt })
        .orWhere('change.createdAt = :cursorTime AND change.id < :cursorId', {
          cursorTime: cursor.createdAt, cursorId: cursor.id
        })));
    }
    const rows = await builder.orderBy('change.createdAt', 'DESC')
      .addOrderBy('change.id', 'DESC').take(query.limit + 1).getMany();
    return this.page(rows, query.limit, (row) => this.changeSummary(row));
  }

  async getChange(context: RequestContext, projectId: string, changeRequestId: string) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    const row = await this.changes.findOneBy({
      id: changeRequestId, tenantId: context.tenantId, projectId
    });
    this.assertVisible(row, scope, 'CHANGE_REQUEST_NOT_FOUND', 'Không tìm thấy Change Request');
    return this.changeView(row);
  }

  async createChange(
    context: RequestContext, projectId: string, input: CreateChangeDto, idempotencyKey: string
  ) {
    this.assertChangeSourceShape(input.source);
    const scope = await this.accessScope(context, projectId, 'riskChange.create');
    if (input.source.type === ChangeSourceType.MANUAL) {
      await this.assertCreatePackage(context.tenantId, projectId, input.packageId ?? null, scope);
    }
    try {
      return await this.commands.execute({
        context, operation: 'API-150:create-change', idempotencyKey,
        request: { projectId, input }, responseStatus: 201,
        execute: async (manager) => {
          let packageId = input.packageId ?? null;
          let sourceRiskId: string | null = null;
          let sourceIssueId: string | null = null;
          let sourceEvidence: EvidenceReferenceRecord[] = input.evidenceRefs.map((ref) => ({ ...ref }));
          if (input.source.type === ChangeSourceType.RISK) {
            const risk = await manager.getRepository(RiskEntity).findOneBy({
              id: input.source.riskId!, tenantId: context.tenantId, projectId
            });
            this.assertVisible(risk, scope, 'RISK_NOT_FOUND', 'Không tìm thấy source Risk');
            if (input.packageId !== undefined && input.packageId !== risk.packageId) {
              this.scopeDenied();
            }
            packageId = risk.packageId;
            sourceRiskId = risk.id;
            sourceEvidence = risk.evidenceRefs.map((ref) => ({ ...ref }));
          } else if (input.source.type === ChangeSourceType.ISSUE) {
            const issue = await manager.getRepository(IssueEntity).findOneBy({
              id: input.source.issueId!, tenantId: context.tenantId, projectId
            });
            this.assertVisible(issue, scope, 'ISSUE_NOT_FOUND', 'Không tìm thấy source Issue');
            if (input.packageId !== undefined && input.packageId !== issue.packageId) {
              this.scopeDenied();
            }
            packageId = issue.packageId;
            sourceIssueId = issue.id;
            sourceEvidence = issue.evidenceRefs.map((ref) => ({ ...ref }));
          }
          await this.assertAssignable(
            manager, context.tenantId, projectId, packageId, input.ownerId
          );
          if (input.sourceBaselineId) {
            await this.assertBaselineReference(
              manager, context.tenantId, projectId, input.sourceBaselineId, false
            );
          }
          const impactDraft = this.plainImpact(input.impact);
          const row = manager.getRepository(ChangeRequestEntity).create({
            id: randomUUID(), tenantId: context.tenantId, projectId, packageId,
            code: input.code, title: input.title.trim(), reason: input.reason.trim(),
            options: input.options.map((option) => option.trim()),
            recommendation: this.optionalText(input.recommendation), ownerId: input.ownerId,
            requesterId: context.userId, sourceBaselineId: input.sourceBaselineId ?? null,
            sourceType: input.source.type, sourceRiskId, sourceIssueId,
            evidenceRefs: input.evidenceRefs, sourceEvidenceSnapshot: sourceEvidence,
            impactDraft, impactSnapshot: null, impactSnapshotHash: null,
            approvalSnapshot: null, approvalSnapshotHash: null,
            status: ChangeRequestStatus.DRAFT, submittedBy: null, submittedAt: null,
            decisionVersion: null, decidedBy: null, decidedAt: null,
            approvedBy: null, approvedAt: null, decisionComment: null,
            scheduleImpactApproved: false, versionNo: 1,
            createdBy: context.userId, updatedBy: context.userId
          });
          const saved = await manager.getRepository(ChangeRequestEntity).save(row);
          await this.emit(
            manager, context, 'ChangeRequest', saved.id, saved.versionNo,
            'ChangeRequestCreated', this.changeEvent(saved)
          );
          return this.changeView(saved);
        },
        resultReference: (result) => ({
          resourceType: 'ChangeRequest', resourceId: result.id, responseStatus: 201
        })
      });
    } catch (error) {
      this.rethrowUnique(
        error, 'uq_change_request_project_code',
        'CHANGE_REQUEST_DUPLICATE', 'Mã Change Request đã tồn tại'
      );
    }
  }

  async updateChange(
    context: RequestContext, projectId: string, changeRequestId: string,
    input: UpdateChangeDto, idempotencyKey: string
  ) {
    this.assertChangeUpdateShape(input);
    const scope = await this.accessScope(context, projectId, 'riskChange.manage');
    return this.commands.execute({
      context, operation: 'API-152:update-change', idempotencyKey,
      request: { projectId, changeRequestId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(ChangeRequestEntity);
        const row = await repository.createQueryBuilder('change').setLock('pessimistic_write')
          .where('change.id = :id AND change.tenantId = :tenantId AND change.projectId = :projectId', {
            id: changeRequestId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(
          row, scope, 'CHANGE_REQUEST_NOT_FOUND', 'Không tìm thấy Change Request'
        );
        this.assertVersion(row.versionNo, input.expectedVersion);
        if (![ChangeRequestStatus.DRAFT, ChangeRequestStatus.ASSESSED,
          ChangeRequestStatus.RETURNED].includes(row.status)) {
          this.invalidTransition(row.status, input.status ?? row.status);
        }
        if (input.status && ![ChangeRequestStatus.DRAFT, ChangeRequestStatus.ASSESSED]
          .includes(input.status)) {
          this.invalidTransition(row.status, input.status);
        }
        if (input.status && !canChangeTransition(row.status, input.status)) {
          this.invalidTransition(row.status, input.status);
        }
        if (input.ownerId && input.ownerId !== row.ownerId) {
          await this.assertAssignable(
            manager, context.tenantId, projectId, row.packageId, input.ownerId
          );
        }
        if (input.sourceBaselineId) {
          await this.assertBaselineReference(
            manager, context.tenantId, projectId, input.sourceBaselineId, false
          );
        }
        if (input.title !== undefined) row.title = input.title.trim();
        if (input.reason !== undefined) row.reason = input.reason.trim();
        if (input.options !== undefined) row.options = input.options.map((option) => option.trim());
        if (input.recommendation !== undefined) {
          row.recommendation = this.optionalText(input.recommendation);
        }
        if (input.ownerId !== undefined) row.ownerId = input.ownerId;
        if (input.sourceBaselineId !== undefined) row.sourceBaselineId = input.sourceBaselineId;
        if (input.impact !== undefined) row.impactDraft = this.plainImpact(input.impact);
        if (input.evidenceRefs !== undefined) row.evidenceRefs = input.evidenceRefs;
        if (input.status !== undefined) {
          if (row.status === ChangeRequestStatus.RETURNED
            && input.status === ChangeRequestStatus.ASSESSED) {
            row.submittedBy = null;
            row.submittedAt = null;
            row.decisionVersion = null;
            row.decidedBy = null;
            row.decidedAt = null;
            row.approvedBy = null;
            row.approvedAt = null;
            row.decisionComment = null;
            row.impactSnapshot = null;
            row.impactSnapshotHash = null;
            row.approvalSnapshot = null;
            row.approvalSnapshotHash = null;
            row.scheduleImpactApproved = false;
          }
          row.status = input.status;
        }
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'ChangeRequest', saved.id, saved.versionNo,
          'ChangeRequestChanged', { ...this.changeEvent(saved), summary: 'Change Request updated' }
        );
        return this.changeView(saved);
      },
      resultReference: (result) => ({
        resourceType: 'ChangeRequest', resourceId: result.id, responseStatus: 200
      })
    });
  }

  async submitChange(
    context: RequestContext, projectId: string, changeRequestId: string,
    input: SubmitChangeDto, idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.submit');
    this.requireFullScope(scope);
    return this.commands.execute({
      context, operation: 'API-153:submit-change', idempotencyKey,
      request: { projectId, changeRequestId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(ChangeRequestEntity);
        const row = await repository.createQueryBuilder('change').setLock('pessimistic_write')
          .where('change.id = :id AND change.tenantId = :tenantId AND change.projectId = :projectId', {
            id: changeRequestId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(
          row, scope, 'CHANGE_REQUEST_NOT_FOUND', 'Không tìm thấy Change Request'
        );
        this.assertVersion(row.versionNo, input.expectedVersion);
        if (row.status !== ChangeRequestStatus.ASSESSED) {
          this.invalidTransition(row.status, ChangeRequestStatus.SUBMITTED);
        }
        const impact = this.completeImpact(row.impactDraft);
        if (!row.recommendation?.trim()) {
          throw new UnprocessableEntityException({
            code: 'IMPACT_INCOMPLETE',
            message: 'Change cần recommendation và đủ sáu chiều impact trước submit', retryable: false
          });
        }
        if (impact.schedule.requiresRebaseline) {
          if (!row.sourceBaselineId) this.baselineMismatch();
          await this.assertBaselineReference(
            manager, context.tenantId, projectId, row.sourceBaselineId, true
          );
        }
        const approvalSnapshot = {
          projectId: row.projectId, packageId: row.packageId, code: row.code,
          source: this.changeSource(row), sourceBaselineId: row.sourceBaselineId,
          reason: row.reason, recommendation: row.recommendation,
          sourceEvidenceSnapshot: row.sourceEvidenceSnapshot, evidenceRefs: row.evidenceRefs,
          impact
        };
        row.impactSnapshot = impact;
        row.impactSnapshotHash = this.canonicalHash(impact);
        row.approvalSnapshot = approvalSnapshot;
        row.approvalSnapshotHash = this.canonicalHash(approvalSnapshot);
        row.status = ChangeRequestStatus.SUBMITTED;
        row.submittedBy = context.userId;
        row.submittedAt = new Date();
        row.decisionVersion = null;
        row.decidedBy = null;
        row.decidedAt = null;
        row.approvedBy = null;
        row.approvedAt = null;
        row.decisionComment = null;
        row.scheduleImpactApproved = false;
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'ChangeRequest', saved.id, saved.versionNo,
          'ChangeRequestSubmitted', { ...this.changeEvent(saved), summary: 'Change Request submitted' }
        );
        return this.changeView(saved);
      },
      resultReference: (result) => ({
        resourceType: 'ChangeRequest', resourceId: result.id, responseStatus: 200
      })
    });
  }

  async decideChange(
    context: RequestContext, projectId: string, changeRequestId: string,
    input: ChangeDecisionDto, idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.approve');
    this.requireFullScope(scope);
    return this.commands.execute({
      context, operation: 'API-156:decide-change', idempotencyKey,
      request: { projectId, changeRequestId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(ChangeRequestEntity);
        const row = await repository.createQueryBuilder('change').setLock('pessimistic_write')
          .where('change.id = :id AND change.tenantId = :tenantId AND change.projectId = :projectId', {
            id: changeRequestId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(
          row, scope, 'CHANGE_REQUEST_NOT_FOUND', 'Không tìm thấy Change Request'
        );
        this.assertVersion(row.versionNo, input.expectedVersion);
        if (row.status !== ChangeRequestStatus.SUBMITTED) {
          this.invalidTransition(row.status, input.decision);
        }
        if (row.requesterId === context.userId || row.submittedBy === context.userId) {
          throw new ForbiddenException({
            code: 'CHANGE_APPROVAL_SOD',
            message: 'Requester/submitter không được quyết định Change của chính mình', retryable: false
          });
        }
        if (!row.impactSnapshot || !row.impactSnapshotHash || !row.approvalSnapshot
          || !row.approvalSnapshotHash) {
          throw new ConflictException({
            code: 'IMPACT_INCOMPLETE', message: 'Submitted Change thiếu immutable snapshot', retryable: false
          });
        }
        const impact = this.completeImpact(row.impactSnapshot);
        if (input.decision === RiskChangeDecision.APPROVE && impact.schedule.requiresRebaseline) {
          if (!row.sourceBaselineId) this.baselineMismatch();
          await this.assertBaselineReference(
            manager, context.tenantId, projectId, row.sourceBaselineId, true
          );
        }
        row.status = input.decision === RiskChangeDecision.APPROVE
          ? ChangeRequestStatus.APPROVED
          : input.decision === RiskChangeDecision.RETURN
            ? ChangeRequestStatus.RETURNED : ChangeRequestStatus.REJECTED;
        row.decisionVersion = row.versionNo + 1;
        row.decidedBy = context.userId;
        row.decidedAt = new Date();
        row.decisionComment = input.comment.trim();
        if (input.decision === RiskChangeDecision.APPROVE) {
          row.approvedBy = context.userId;
          row.approvedAt = new Date();
          row.scheduleImpactApproved = impact.schedule.requiresRebaseline;
        } else {
          row.approvedBy = null;
          row.approvedAt = null;
          row.scheduleImpactApproved = false;
        }
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'ChangeRequest', saved.id, saved.versionNo,
          'ChangeRequestDecided', {
            ...this.changeEvent(saved), decision: input.decision,
            summary: `Change Request decision ${input.decision}`
          }
        );
        return this.changeView(saved);
      },
      resultReference: (result) => ({
        resourceType: 'ChangeRequest', resourceId: result.id, responseStatus: 200
      })
    });
  }

  async decideRiskClosure(
    context: RequestContext, projectId: string, riskId: string,
    input: ClosureDecisionDto, idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.close');
    this.requireFullScope(scope);
    return this.commands.execute({
      context, operation: 'API-154:decide-risk-closure', idempotencyKey,
      request: { projectId, riskId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(RiskEntity);
        const row = await repository.createQueryBuilder('risk').setLock('pessimistic_write')
          .where('risk.id = :id AND risk.tenantId = :tenantId AND risk.projectId = :projectId', {
            id: riskId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(row, scope, 'RISK_NOT_FOUND', 'Không tìm thấy Risk');
        this.assertVersion(row.versionNo, input.expectedVersion);
        if (row.status !== RiskStatus.CLOSURE_PENDING) {
          this.invalidTransition(row.status, RiskStatus.CLOSED);
        }
        if (row.createdBy === context.userId || row.ownerId === context.userId
          || row.closureRequestedBy === context.userId) this.closureSod();
        const effective = effectiveRiskScore(row);
        if ([ExposureLevel.HIGH, ExposureLevel.CRITICAL].includes(effective.level)) {
          const criticalScope = await this.permissions.packageScopeIds(
            context, 'riskChange.closeCritical', projectId
          );
          this.requireFullScope(criticalScope);
        }
        await this.assertNoBlockingActions(manager, context.tenantId, projectId, row.id, null);
        const cycle = await this.requireOpenClosureCycle(
          manager, context.tenantId, projectId, row.id, null
        );
        const resultingStatus = input.decision === RiskChangeDecision.APPROVE
          ? RiskStatus.CLOSED : RiskStatus.MONITORING;
        cycle.decision = input.decision;
        cycle.decisionComment = input.comment.trim();
        cycle.decisionEvidenceRefs = input.evidenceRefs;
        cycle.decidedBy = context.userId;
        cycle.decidedAt = new Date();
        cycle.resultingStatus = resultingStatus;
        await manager.getRepository(RiskIssueClosureCycleEntity).save(cycle);
        row.status = resultingStatus;
        row.closureDecision = input.decision;
        row.closureDecisionEvidenceRefs = input.evidenceRefs;
        row.closureDecidedBy = context.userId;
        row.closureDecidedAt = new Date();
        row.closureDecisionComment = input.comment.trim();
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'Risk', saved.id, saved.versionNo, 'RiskClosureDecided', {
            ...this.riskEvent(saved), decision: input.decision,
            closureCycleId: cycle.id, summary: `Risk closure decision ${input.decision}`
          }
        );
        return this.riskView(saved);
      },
      resultReference: (result) => ({ resourceType: 'Risk', resourceId: result.id, responseStatus: 200 })
    });
  }

  async decideIssueClosure(
    context: RequestContext, projectId: string, issueId: string,
    input: ClosureDecisionDto, idempotencyKey: string
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.close');
    this.requireFullScope(scope);
    return this.commands.execute({
      context, operation: 'API-155:decide-issue-closure', idempotencyKey,
      request: { projectId, issueId, input }, responseStatus: 200,
      execute: async (manager) => {
        const repository = manager.getRepository(IssueEntity);
        const row = await repository.createQueryBuilder('issue').setLock('pessimistic_write')
          .where('issue.id = :id AND issue.tenantId = :tenantId AND issue.projectId = :projectId', {
            id: issueId, tenantId: context.tenantId, projectId
          }).getOne();
        this.assertVisible(row, scope, 'ISSUE_NOT_FOUND', 'Không tìm thấy Issue');
        this.assertVersion(row.versionNo, input.expectedVersion);
        if (row.status !== IssueStatus.CLOSURE_PENDING) {
          this.invalidTransition(row.status, IssueStatus.CLOSED);
        }
        if (row.createdBy === context.userId || row.ownerId === context.userId
          || row.closureRequestedBy === context.userId) this.closureSod();
        if ([IssueSeverity.HIGH, IssueSeverity.CRITICAL].includes(row.severity)) {
          const criticalScope = await this.permissions.packageScopeIds(
            context, 'riskChange.closeCritical', projectId
          );
          this.requireFullScope(criticalScope);
        }
        await this.assertNoBlockingActions(manager, context.tenantId, projectId, null, row.id);
        const cycle = await this.requireOpenClosureCycle(
          manager, context.tenantId, projectId, null, row.id
        );
        const resultingStatus = input.decision === RiskChangeDecision.APPROVE
          ? IssueStatus.CLOSED : IssueStatus.RESOLVED;
        cycle.decision = input.decision;
        cycle.decisionComment = input.comment.trim();
        cycle.decisionEvidenceRefs = input.evidenceRefs;
        cycle.decidedBy = context.userId;
        cycle.decidedAt = new Date();
        cycle.resultingStatus = resultingStatus;
        await manager.getRepository(RiskIssueClosureCycleEntity).save(cycle);
        row.status = resultingStatus;
        row.closureDecision = input.decision;
        row.closureDecisionEvidenceRefs = input.evidenceRefs;
        row.closureDecidedBy = context.userId;
        row.closureDecidedAt = new Date();
        row.closureDecisionComment = input.comment.trim();
        row.updatedBy = context.userId;
        const saved = await repository.save(row);
        await this.emit(
          manager, context, 'Issue', saved.id, saved.versionNo, 'IssueClosureDecided', {
            ...this.issueEvent(saved), decision: input.decision,
            closureCycleId: cycle.id, summary: `Issue closure decision ${input.decision}`
          }
        );
        return this.issueView(saved);
      },
      resultReference: (result) => ({ resourceType: 'Issue', resourceId: result.id, responseStatus: 200 })
    });
  }

  async getSummary(
    context: RequestContext, projectId: string, query: RiskChangeSummaryQueryDto
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    this.assertRequestedPackage(scope, query.packageId);

    const riskBuilder = this.risks.createQueryBuilder('risk')
      .where('risk.tenantId = :tenantId AND risk.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(riskBuilder, 'risk', scope, query.packageId);
    if (query.ownerId) riskBuilder.andWhere('risk.ownerId = :summaryOwnerId', {
      summaryOwnerId: query.ownerId
    });
    if (query.riskStatus) riskBuilder.andWhere('risk.status = :summaryRiskStatus', {
      summaryRiskStatus: query.riskStatus
    });
    if (query.riskCategory) riskBuilder.andWhere('risk.category = :summaryRiskCategory', {
      summaryRiskCategory: query.riskCategory.trim()
    });
    if (query.riskReviewBefore) riskBuilder.andWhere('risk.reviewDate <= :summaryReviewBefore', {
      summaryReviewBefore: query.riskReviewBefore
    });
    if (query.scoringVersion) riskBuilder.andWhere('risk.scoringVersion = :summaryScoringVersion', {
      summaryScoringVersion: query.scoringVersion
    });
    if (query.thresholdVersion) {
      riskBuilder.andWhere('risk.thresholdVersion = :summaryThresholdVersion', {
        summaryThresholdVersion: query.thresholdVersion
      });
    }
    const riskRows = await riskBuilder.getMany();

    const issueBuilder = this.issues.createQueryBuilder('issue')
      .where('issue.tenantId = :tenantId AND issue.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(issueBuilder, 'issue', scope, query.packageId);
    if (query.ownerId) issueBuilder.andWhere('issue.ownerId = :summaryIssueOwnerId', {
      summaryIssueOwnerId: query.ownerId
    });
    const issueRows = await issueBuilder.getMany();

    const today = new Date().toISOString().slice(0, 10);
    const actionBuilder = this.actions.createQueryBuilder('action')
      .where('action.tenantId = :tenantId AND action.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(actionBuilder, 'action', scope, query.packageId);
    if (query.ownerId) actionBuilder.andWhere('action.ownerId = :summaryActionOwnerId', {
      summaryActionOwnerId: query.ownerId
    });
    const actionRows = await actionBuilder.getMany();

    const changeBuilder = this.changes.createQueryBuilder('change')
      .where('change.tenantId = :tenantId AND change.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyPackageScope(changeBuilder, 'change', scope, query.packageId);
    if (query.ownerId) changeBuilder.andWhere('change.ownerId = :summaryChangeOwnerId', {
      summaryChangeOwnerId: query.ownerId
    });
    const changeRows = await changeBuilder.getMany();

    const high = riskRows.filter((risk) => effectiveRiskScore(risk).level === ExposureLevel.HIGH);
    const critical = riskRows.filter((risk) => (
      effectiveRiskScore(risk).level === ExposureLevel.CRITICAL
    ));
    const criticalIssues = issueRows.filter((issue) => issue.severity === IssueSeverity.CRITICAL);
    const overdueActions = actionRows.filter((action) => (
      action.dueDate < today && ![
        RiskIssueActionStatus.DONE, RiskIssueActionStatus.VERIFIED,
        RiskIssueActionStatus.CANCELLED
      ].includes(action.status)
    ));
    const pendingChanges = changeRows.filter((change) => (
      change.status === ChangeRequestStatus.SUBMITTED
    ));

    return {
      riskTotal: riskRows.length,
      highRiskCount: high.length,
      criticalRiskCount: critical.length,
      riskHeatmap: this.riskHeatmap(riskRows),
      issueTotal: issueRows.length,
      criticalIssueCount: criticalIssues.length,
      overdueActionCount: overdueActions.length,
      pendingChangeDecisionCount: pendingChanges.length,
      topRisks: [...riskRows]
        .sort((left, right) => effectiveRiskScore(right).exposure
          - effectiveRiskScore(left).exposure || left.reviewDate.localeCompare(right.reviewDate)
          || left.id.localeCompare(right.id))
        .slice(0, 10).map((row) => this.riskSummary(row)),
      criticalIssues: criticalIssues
        .sort((left, right) => left.targetDate.localeCompare(right.targetDate)
          || left.id.localeCompare(right.id))
        .slice(0, 10).map((row) => this.issueSummary(row)),
      overdueActions: overdueActions
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate)
          || left.id.localeCompare(right.id))
        .slice(0, 10).map((row) => this.actionSummary(row)),
      pendingChangeRequests: pendingChanges
        .sort((left, right) => (left.submittedAt?.getTime() ?? 0)
          - (right.submittedAt?.getTime() ?? 0) || left.id.localeCompare(right.id))
        .slice(0, 10).map((row) => this.changeSummary(row)),
      calculatedAt: new Date()
    };
  }

  async getHistory(
    context: RequestContext, projectId: string, query: RiskChangeHistoryQueryDto
  ) {
    const scope = await this.accessScope(context, projectId, 'riskChange.read');
    this.assertRequestedPackage(scope, query.packageId);
    const cursor = decodeCursor(query.cursor, isHistoryCursor);
    const builder = this.risks.manager.getRepository(AuditEventEntity)
      .createQueryBuilder('audit')
      .where('audit.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('audit.objectType IN (:...objectTypes)', {
        objectTypes: ['Risk', 'Issue', 'RiskIssueAction', 'ChangeRequest']
      })
      .andWhere("audit.payload ->> 'projectId' = CAST(:projectId AS text)", { projectId });

    const sourceScopeSql = query.packageId
      ? 'record.package_id = :historyPackageId'
      : scope === null ? 'TRUE' : 'record.package_id IN (:...historyScopeIds)';
    if (query.packageId) builder.setParameter('historyPackageId', query.packageId);
    if (scope !== null) builder.setParameter('historyScopeIds', scope);
    builder.andWhere(`(
      (audit.object_type = 'Risk' AND EXISTS (
        SELECT 1 FROM risks record WHERE record.id = audit.object_id
          AND record.tenant_id = :tenantId AND record.project_id = CAST(:projectId AS uuid)
          AND ${sourceScopeSql}
      )) OR
      (audit.object_type = 'Issue' AND EXISTS (
        SELECT 1 FROM issues record WHERE record.id = audit.object_id
          AND record.tenant_id = :tenantId AND record.project_id = CAST(:projectId AS uuid)
          AND ${sourceScopeSql}
      )) OR
      (audit.object_type = 'RiskIssueAction' AND EXISTS (
        SELECT 1 FROM risk_issue_actions record WHERE record.id = audit.object_id
          AND record.tenant_id = :tenantId AND record.project_id = CAST(:projectId AS uuid)
          AND ${sourceScopeSql}
      )) OR
      (audit.object_type = 'ChangeRequest' AND EXISTS (
        SELECT 1 FROM change_requests record WHERE record.id = audit.object_id
          AND record.tenant_id = :tenantId AND record.project_id = CAST(:projectId AS uuid)
          AND ${sourceScopeSql}
      ))
    )`);
    if (query.sourceType) builder.andWhere('audit.objectType = :historyObjectType', {
      historyObjectType: this.historyObjectType(query.sourceType)
    });
    if (query.sourceId) builder.andWhere('audit.objectId = :historySourceId', {
      historySourceId: query.sourceId
    });
    if (query.eventType) builder.andWhere('audit.action = :historyEventType', {
      historyEventType: query.eventType
    });
    if (query.actorId) builder.andWhere('audit.actorId = :historyActorId', {
      historyActorId: query.actorId
    });
    if (cursor) builder.andWhere(new Brackets((where) => where
      .where('audit.occurredAt < :historyCursorTime', {
        historyCursorTime: cursor.occurredAt
      })
      .orWhere('audit.occurredAt = :historyCursorTime AND audit.id < :historyCursorId', {
        historyCursorTime: cursor.occurredAt, historyCursorId: cursor.id
      })));
    const rows = await builder.orderBy('audit.occurredAt', 'DESC')
      .addOrderBy('audit.id', 'DESC').take(query.limit + 1).getMany();
    return this.page(rows, query.limit, (row) => ({
      id: row.id,
      sourceType: this.historySourceType(row.objectType!),
      sourceId: row.objectId!,
      eventType: row.action,
      actorId: row.actorId,
      effectiveActorId: this.nullableString(row.payload?.effectiveActorId) ?? row.actorId,
      versionNo: this.positiveInteger(row.payload?.versionNo) ?? 1,
      summary: this.safeHistorySummary(row.payload?.summary, row.action),
      occurredAt: row.occurredAt,
      correlationId: row.correlationId
    }), 'occurredAt');
  }

  private async accessScope(
    context: RequestContext, projectId: string, action: string
  ): Promise<PackageScope> {
    const projectExists = await this.projects.existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!projectExists) this.scopeDenied();
    const scope = await this.permissions.packageScopeIds(context, action, projectId);
    if (scope !== null && scope.length === 0) this.scopeDenied();
    return scope;
  }

  private applyPackageScope<T extends { packageId: string | null }>(
    builder: SelectQueryBuilder<T>, alias: string, scope: PackageScope,
    requestedPackageId?: string
  ): void {
    if (requestedPackageId) {
      builder.andWhere(`${alias}.packageId = :requestedPackageId`, { requestedPackageId });
    } else if (scope !== null) {
      builder.andWhere(`${alias}.packageId IN (:...allowedPackageIds)`, {
        allowedPackageIds: scope
      });
    }
  }

  private assertRequestedPackage(scope: PackageScope, packageId?: string): void {
    if (packageId && scope !== null && !scope.includes(packageId)) this.scopeDenied();
  }

  private requireFullScope(scope: PackageScope): void {
    if (scope !== null) this.scopeDenied();
  }

  private async assertCreatePackage(
    tenantId: string, projectId: string, packageId: string | null, scope: PackageScope
  ): Promise<void> {
    if (scope !== null && (!packageId || !scope.includes(packageId))) this.scopeDenied();
    if (!packageId) return;
    const exists = await this.packages.createQueryBuilder('package')
      .where('package.id = :packageId AND package.tenantId = :tenantId', {
        packageId, tenantId
      })
      .andWhere('package.projectId = :projectId AND package.status = :active', {
        projectId, active: 'ACTIVE'
      }).getExists();
    if (!exists) this.scopeDenied();
  }

  private assertVisible<T extends { packageId: string | null }>(
    row: T | null, scope: PackageScope, code: string, message: string
  ): asserts row is T {
    if (!row || (scope !== null && (!row.packageId || !scope.includes(row.packageId)))) {
      throw new NotFoundException({ code, message, retryable: false });
    }
  }

  private async assertAssignable(
    manager: EntityManager, tenantId: string, projectId: string,
    packageId: string | null, ownerId: string
  ): Promise<void> {
    const project = await manager.getRepository(ProjectEntity).findOneBy({
      id: projectId, tenantId
    });
    if (!project) this.scopeDenied();
    if (packageId && !await manager.getRepository(PackageEntity).existsBy({
      id: packageId, tenantId, projectId
    })) this.scopeDenied();
    const now = new Date();
    const builder = manager.getRepository(RoleAssignmentEntity).createQueryBuilder('assignment')
      .innerJoin('assignment.userAccount', 'user')
      .innerJoin('assignment.role', 'role')
      .where('assignment.tenantId = :tenantId', { tenantId })
      .andWhere('assignment.userAccountId = :ownerId', { ownerId })
      .andWhere('user.tenantId = :tenantId AND user.status = :active', {
        tenantId, active: MasterRecordStatus.ACTIVE
      })
      .andWhere('assignment.status = :active AND role.status = :active', {
        active: MasterRecordStatus.ACTIVE
      })
      .andWhere('assignment.effectiveFrom <= :now', { now })
      .andWhere('(assignment.effectiveTo IS NULL OR assignment.effectiveTo > :now)', { now })
      .andWhere('role.permissions @> CAST(:assignPermission AS jsonb)', {
        assignPermission: JSON.stringify(['riskChange.manage'])
      })
      .andWhere(new Brackets((where) => {
        where.where('assignment.scopeType = :tenantScope', {
          tenantScope: AssignmentScopeType.TENANT
        }).orWhere(`(
          assignment.scopeType = :portfolioScope AND assignment.scopeId = :portfolioId
        )`, {
          portfolioScope: AssignmentScopeType.PORTFOLIO, portfolioId: project.portfolioId
        }).orWhere(`(
          assignment.scopeType = :projectScope AND assignment.scopeId = :projectId
        )`, {
          projectScope: AssignmentScopeType.PROJECT, projectId
        });
        if (packageId) where.orWhere(`(
          assignment.scopeType = :packageScope AND assignment.scopeId = :packageId
        )`, {
          packageScope: AssignmentScopeType.PACKAGE, packageId
        });
      }));
    if (!await builder.getExists()) {
      throw new UnprocessableEntityException({
        code: 'OWNER_NOT_ASSIGNABLE',
        message: 'Owner không có effective riskChange.manage trong exact scope',
        retryable: false
      });
    }
  }

  private assertVersion(current: number, expected: number): void {
    if (current !== expected) this.versionConflict();
  }

  private score(input: {
    probability: number;
    costImpactRating: number;
    scheduleImpactRating: number;
    hseImpactRating: number;
  }) {
    return scoreRisk(input, {
      high: this.config.riskChange.highExposureThreshold,
      critical: this.config.riskChange.criticalExposureThreshold
    });
  }

  private inherentInputChanged(input: UpdateRiskDto): boolean {
    return input.probability !== undefined || input.costImpactRating !== undefined
      || input.scheduleImpactRating !== undefined || input.hseImpactRating !== undefined;
  }

  private assignRiskFields(row: RiskEntity, input: UpdateRiskDto): void {
    if (input.category !== undefined) row.category = input.category.trim();
    if (input.cause !== undefined) row.cause = input.cause.trim();
    if (input.event !== undefined) row.event = input.event.trim();
    if (input.impact !== undefined) row.impact = input.impact.trim();
    if (input.ownerId !== undefined) row.ownerId = input.ownerId;
    if (input.reviewDate !== undefined) row.reviewDate = input.reviewDate;
    if (input.responseStrategy !== undefined) row.responseStrategy = input.responseStrategy;
    if (input.responsePlan !== undefined) row.responsePlan = this.optionalText(input.responsePlan);
    if (input.trigger !== undefined) row.trigger = this.optionalText(input.trigger);
    if (input.contingencyPlan !== undefined) {
      row.contingencyPlan = this.optionalText(input.contingencyPlan);
    }
    if (input.evidenceRefs !== undefined) row.evidenceRefs = input.evidenceRefs;
  }

  private assignIssueFields(row: IssueEntity, input: UpdateIssueDto): void {
    if (input.title !== undefined) row.title = input.title.trim();
    if (input.description !== undefined) row.description = input.description.trim();
    if (input.occurredAt !== undefined) row.occurredAt = new Date(input.occurredAt);
    if (input.rootCause !== undefined) row.rootCause = input.rootCause.trim();
    if (input.actualImpact !== undefined) row.actualImpact = input.actualImpact.trim();
    if (input.severity !== undefined) row.severity = input.severity;
    if (input.decisionSummary !== undefined) {
      row.decisionSummary = this.optionalText(input.decisionSummary);
    }
    if (input.ownerId !== undefined) row.ownerId = input.ownerId;
    if (input.targetDate !== undefined) row.targetDate = input.targetDate;
    if (input.evidenceRefs !== undefined) row.evidenceRefs = input.evidenceRefs;
  }

  private optionalText(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async assertNoBlockingActions(
    manager: EntityManager, tenantId: string, projectId: string,
    riskId: string | null, issueId: string | null
  ): Promise<void> {
    const builder = manager.getRepository(RiskIssueActionEntity).createQueryBuilder('action')
      .where('action.tenantId = :tenantId AND action.projectId = :projectId', {
        tenantId, projectId
      })
      .andWhere('action.status NOT IN (:...terminalStatuses)', {
        terminalStatuses: [RiskIssueActionStatus.VERIFIED, RiskIssueActionStatus.CANCELLED]
      });
    if (riskId) builder.andWhere('action.riskId = :riskId', { riskId });
    else builder.andWhere('action.issueId = :issueId', { issueId });
    if (await builder.getExists()) {
      throw new ConflictException({
        code: 'BLOCKING_ACTIONS_EXIST',
        message: 'Còn Action chưa VERIFIED hoặc CANCELLED', retryable: false
      });
    }
  }

  private async appendClosureCycle(
    manager: EntityManager, context: RequestContext, projectId: string,
    packageId: string | null,
    riskId: string | null, issueId: string | null, reason: string,
    evidenceRefs: EvidenceReferenceRecord[]
  ): Promise<RiskIssueClosureCycleEntity> {
    const repository = manager.getRepository(RiskIssueClosureCycleEntity);
    const builder = repository.createQueryBuilder('cycle')
      .select('COALESCE(MAX(cycle.sequenceNo), 0)', 'maximum')
      .where('cycle.tenantId = :tenantId AND cycle.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    if (riskId) builder.andWhere('cycle.riskId = :riskId', { riskId });
    else builder.andWhere('cycle.issueId = :issueId', { issueId });
    const maximum = await builder.getRawOne<{ maximum: string }>();
    const cycle = repository.create({
      id: randomUUID(), tenantId: context.tenantId,
      projectId,
      packageId, riskId, issueId, sequenceNo: Number(maximum?.maximum ?? 0) + 1,
      requestReason: reason.trim(), requestEvidenceRefs: evidenceRefs,
      requestedBy: context.userId, requestedAt: new Date(), decision: null,
      decisionComment: null, decisionEvidenceRefs: [], decidedBy: null,
      decidedAt: null, resultingStatus: null
    });
    return repository.save(cycle);
  }

  private async requireOpenClosureCycle(
    manager: EntityManager, tenantId: string, projectId: string,
    riskId: string | null, issueId: string | null
  ): Promise<RiskIssueClosureCycleEntity> {
    const builder = manager.getRepository(RiskIssueClosureCycleEntity)
      .createQueryBuilder('cycle').setLock('pessimistic_write')
      .where('cycle.tenantId = :tenantId AND cycle.projectId = :projectId', {
        tenantId, projectId
      }).andWhere('cycle.decision IS NULL');
    if (riskId) builder.andWhere('cycle.riskId = :riskId', { riskId });
    else builder.andWhere('cycle.issueId = :issueId', { issueId });
    const cycle = await builder.getOne();
    if (!cycle) {
      throw new ConflictException({
        code: 'CLOSURE_CYCLE_NOT_FOUND',
        message: 'Không tìm thấy closure cycle đang mở', retryable: false
      });
    }
    return cycle;
  }

  private page<T extends { id: string }, R>(
    rows: T[], limit: number, map: (row: T) => R,
    timeProperty: 'createdAt' | 'occurredAt' = 'createdAt'
  ) {
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1) as (T & { createdAt?: Date; occurredAt?: Date }) | undefined;
    const time = last?.[timeProperty];
    return {
      items: pageRows.map(map),
      meta: {
        nextCursor: hasMore && last && time
          ? encodeCursor({ [timeProperty]: time.toISOString(), id: last.id }) : null,
        limit
      }
    };
  }

  private async closureCyclePage(
    tenantId: string, projectId: string, riskId: string | null,
    issueId: string | null, query: DetailQueryDto
  ) {
    const cursor = decodeCursor(query.closureCycleCursor, isClosureCursor);
    const builder = this.closureCycles.createQueryBuilder('cycle')
      .where('cycle.tenantId = :tenantId AND cycle.projectId = :projectId', {
        tenantId, projectId
      });
    if (riskId) builder.andWhere('cycle.riskId = :riskId', { riskId });
    else builder.andWhere('cycle.issueId = :issueId', { issueId });
    if (cursor) builder.andWhere(new Brackets((where) => where
      .where('cycle.sequenceNo < :closureSequence', {
        closureSequence: cursor.sequenceNo
      })
      .orWhere('cycle.sequenceNo = :closureSequence AND cycle.id < :closureId', {
        closureSequence: cursor.sequenceNo, closureId: cursor.id
      })));
    const rows = await builder.orderBy('cycle.sequenceNo', 'DESC')
      .addOrderBy('cycle.id', 'DESC').take(query.closureCycleLimit + 1).getMany();
    const hasMore = rows.length > query.closureCycleLimit;
    const pageRows = hasMore ? rows.slice(0, query.closureCycleLimit) : rows;
    const last = pageRows.at(-1);
    return {
      closureCycles: pageRows.map((row) => this.closureCycleView(row)),
      closureCycleMeta: {
        nextCursor: hasMore && last
          ? encodeCursor({ sequenceNo: last.sequenceNo, id: last.id }) : null,
        limit: query.closureCycleLimit
      }
    };
  }

  private riskSummary(row: RiskEntity) {
    const effective = effectiveRiskScore(row);
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      code: row.code, category: row.category, ownerId: row.ownerId,
      reviewDate: row.reviewDate, status: row.status,
      inherentProbability: row.probability, inherentImpactRating: row.impactRating,
      inherentExposure: row.inherentExposure, inherentLevel: row.inherentLevel,
      residualProbability: row.residualProbability,
      residualImpactRating: row.residualImpactRating,
      residualExposure: row.residualExposure, residualLevel: row.residualLevel,
      effectiveExposure: effective.exposure, effectiveLevel: effective.level,
      scoringVersion: row.scoringVersion, thresholdVersion: row.thresholdVersion,
      versionNo: row.versionNo
    };
  }

  private riskView(row: RiskEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      code: row.code, category: row.category, cause: row.cause, event: row.event,
      impact: row.impact, probability: row.probability,
      costImpactRating: row.costImpactRating,
      scheduleImpactRating: row.scheduleImpactRating,
      hseImpactRating: row.hseImpactRating, impactRating: row.impactRating,
      inherentExposure: row.inherentExposure, inherentLevel: row.inherentLevel,
      residualProbability: row.residualProbability,
      residualCostImpactRating: row.residualCostImpactRating,
      residualScheduleImpactRating: row.residualScheduleImpactRating,
      residualHseImpactRating: row.residualHseImpactRating,
      residualImpactRating: row.residualImpactRating,
      residualExposure: row.residualExposure, residualLevel: row.residualLevel,
      scoringVersion: row.scoringVersion, thresholdVersion: row.thresholdVersion,
      ownerId: row.ownerId, reviewDate: row.reviewDate,
      responseStrategy: row.responseStrategy, responsePlan: row.responsePlan,
      trigger: row.trigger, contingencyPlan: row.contingencyPlan,
      evidenceRefs: row.evidenceRefs, status: row.status,
      occurredIssueId: row.occurredIssueId, createdBy: row.createdBy,
      closureRequestedBy: row.closureRequestedBy,
      closureRequestedAt: row.closureRequestedAt, closureReason: row.closureReason,
      closureRequestEvidenceRefs: row.closureRequestEvidenceRefs,
      closureDecision: row.closureDecision,
      closureDecisionEvidenceRefs: row.closureDecisionEvidenceRefs,
      closureDecidedBy: row.closureDecidedBy, closureDecidedAt: row.closureDecidedAt,
      closureDecisionComment: row.closureDecisionComment, versionNo: row.versionNo,
      createdAt: row.createdAt, updatedAt: row.updatedAt
    };
  }

  private issueSummary(row: IssueEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      code: row.code, title: row.title, severity: row.severity,
      ownerId: row.ownerId, targetDate: row.targetDate, status: row.status,
      sourceRiskId: row.sourceRiskId, versionNo: row.versionNo
    };
  }

  private issueView(row: IssueEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      code: row.code, title: row.title, description: row.description,
      occurredAt: row.occurredAt, rootCause: row.rootCause,
      actualImpact: row.actualImpact, severity: row.severity,
      decisionSummary: row.decisionSummary, ownerId: row.ownerId,
      targetDate: row.targetDate, sourceRiskId: row.sourceRiskId,
      evidenceRefs: row.evidenceRefs, status: row.status,
      resolutionSummary: row.resolutionSummary,
      resolutionEvidenceRefs: row.resolutionEvidenceRefs,
      resolvedBy: row.resolvedBy, resolvedAt: row.resolvedAt, createdBy: row.createdBy,
      closureRequestedBy: row.closureRequestedBy,
      closureRequestedAt: row.closureRequestedAt, closureReason: row.closureReason,
      closureRequestEvidenceRefs: row.closureRequestEvidenceRefs,
      closureDecision: row.closureDecision,
      closureDecisionEvidenceRefs: row.closureDecisionEvidenceRefs,
      closureDecidedBy: row.closureDecidedBy, closureDecidedAt: row.closureDecidedAt,
      closureDecisionComment: row.closureDecisionComment, versionNo: row.versionNo,
      createdAt: row.createdAt, updatedAt: row.updatedAt
    };
  }

  private actionSummary(row: RiskIssueActionEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      riskId: row.riskId, issueId: row.issueId, code: row.code,
      actionType: row.actionType, title: row.title, ownerId: row.ownerId,
      dueDate: row.dueDate, status: row.status, versionNo: row.versionNo
    };
  }

  private actionView(row: RiskIssueActionEntity) {
    const residualAssessment = row.residualProbability === null ? null : {
      probability: row.residualProbability,
      costImpactRating: row.residualCostImpactRating,
      scheduleImpactRating: row.residualScheduleImpactRating,
      hseImpactRating: row.residualHseImpactRating,
      rationale: row.residualRationale
    };
    return {
      ...this.actionSummary(row), description: row.description,
      statusReason: row.statusReason, evidenceRefs: row.evidenceRefs,
      residualAssessment, residualRiskVersion: row.residualRiskVersion,
      completedBy: row.completedBy, completedAt: row.completedAt,
      verifiedBy: row.verifiedBy, verifiedAt: row.verifiedAt,
      cancelledBy: row.cancelledBy, cancelledAt: row.cancelledAt,
      createdAt: row.createdAt, updatedAt: row.updatedAt
    };
  }

  private changeSource(row: ChangeRequestEntity) {
    return row.sourceType === ChangeSourceType.RISK
      ? { type: row.sourceType, riskId: row.sourceRiskId }
      : row.sourceType === ChangeSourceType.ISSUE
        ? { type: row.sourceType, issueId: row.sourceIssueId }
        : { type: row.sourceType };
  }

  private changeSummary(row: ChangeRequestEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      code: row.code, title: row.title, ownerId: row.ownerId,
      requesterId: row.requesterId, source: this.changeSource(row),
      status: row.status, submittedAt: row.submittedAt,
      scheduleImpactApproved: row.scheduleImpactApproved,
      versionNo: row.versionNo, updatedAt: row.updatedAt
    };
  }

  private changeView(row: ChangeRequestEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      code: row.code, title: row.title, reason: row.reason, options: row.options,
      recommendation: row.recommendation, ownerId: row.ownerId,
      requesterId: row.requesterId, sourceBaselineId: row.sourceBaselineId,
      source: this.changeSource(row), evidenceRefs: row.evidenceRefs,
      sourceEvidenceSnapshot: row.sourceEvidenceSnapshot, impactDraft: row.impactDraft,
      impactSnapshot: row.impactSnapshot, impactSnapshotHash: row.impactSnapshotHash,
      approvalSnapshotHash: row.approvalSnapshotHash, status: row.status,
      submittedBy: row.submittedBy, submittedAt: row.submittedAt,
      decisionVersion: row.decisionVersion, decidedBy: row.decidedBy,
      decidedAt: row.decidedAt, approvedBy: row.approvedBy, approvedAt: row.approvedAt,
      decisionComment: row.decisionComment,
      scheduleImpactApproved: row.scheduleImpactApproved, versionNo: row.versionNo,
      createdAt: row.createdAt, updatedAt: row.updatedAt
    };
  }

  private closureCycleView(row: RiskIssueClosureCycleEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      riskId: row.riskId, issueId: row.issueId, sequenceNo: row.sequenceNo,
      requestReason: row.requestReason, requestEvidenceRefs: row.requestEvidenceRefs,
      requestedBy: row.requestedBy, requestedAt: row.requestedAt,
      decision: row.decision, decisionComment: row.decisionComment,
      decisionEvidenceRefs: row.decisionEvidenceRefs,
      decidedBy: row.decidedBy, decidedAt: row.decidedAt,
      resultingStatus: row.resultingStatus, createdAt: row.createdAt
    };
  }

  private riskEvent(row: RiskEntity): Record<string, unknown> {
    const effective = effectiveRiskScore(row);
    return {
      projectId: row.projectId, packageId: row.packageId, code: row.code,
      status: row.status, ownerId: row.ownerId, reviewDate: row.reviewDate,
      inherentExposure: row.inherentExposure, inherentLevel: row.inherentLevel,
      residualExposure: row.residualExposure, residualLevel: row.residualLevel,
      effectiveExposure: effective.exposure, effectiveLevel: effective.level,
      scoringVersion: row.scoringVersion, thresholdVersion: row.thresholdVersion,
      versionNo: row.versionNo, summary: `Risk ${row.code} ${row.status}`
    };
  }

  private issueEvent(row: IssueEntity): Record<string, unknown> {
    return {
      projectId: row.projectId, packageId: row.packageId, code: row.code,
      status: row.status, severity: row.severity, ownerId: row.ownerId,
      targetDate: row.targetDate, sourceRiskId: row.sourceRiskId,
      versionNo: row.versionNo, summary: `Issue ${row.code} ${row.status}`
    };
  }

  private actionEvent(row: RiskIssueActionEntity): Record<string, unknown> {
    return {
      projectId: row.projectId, packageId: row.packageId, code: row.code,
      riskId: row.riskId, issueId: row.issueId, status: row.status,
      ownerId: row.ownerId, dueDate: row.dueDate, versionNo: row.versionNo,
      summary: `Action ${row.code} ${row.status}`
    };
  }

  private changeEvent(row: ChangeRequestEntity): Record<string, unknown> {
    return {
      projectId: row.projectId, packageId: row.packageId, code: row.code,
      source: this.changeSource(row), status: row.status, ownerId: row.ownerId,
      requesterId: row.requesterId, sourceBaselineId: row.sourceBaselineId,
      scheduleImpactApproved: row.scheduleImpactApproved,
      versionNo: row.versionNo, summary: `Change Request ${row.code} ${row.status}`
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const safePayload = {
      ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId
    };
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

  private riskHeatmap(rows: RiskEntity[]) {
    const groups = new Map<string, {
      scoringVersion: string;
      thresholdVersion: string;
      inherent: Map<string, number>;
      residual: Map<string, number>;
      residualMissingCount: number;
    }>();
    for (const row of rows) {
      const key = `${row.scoringVersion}\u0000${row.thresholdVersion}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          scoringVersion: row.scoringVersion, thresholdVersion: row.thresholdVersion,
          inherent: new Map(), residual: new Map(), residualMissingCount: 0
        };
        groups.set(key, group);
      }
      const inherentKey = `${row.probability}:${row.impactRating}`;
      group.inherent.set(inherentKey, (group.inherent.get(inherentKey) ?? 0) + 1);
      if (row.residualProbability === null || row.residualImpactRating === null) {
        group.residualMissingCount += 1;
      } else {
        const residualKey = `${row.residualProbability}:${row.residualImpactRating}`;
        group.residual.set(residualKey, (group.residual.get(residualKey) ?? 0) + 1);
      }
    }
    const cells = (counts: Map<string, number>) => Array.from({ length: 5 }, (_, index) => index + 1)
      .flatMap((probability) => Array.from({ length: 5 }, (_, index) => index + 1)
        .map((impactRating) => ({
          probability, impactRating, count: counts.get(`${probability}:${impactRating}`) ?? 0
        })));
    return {
      filteredRiskCount: rows.length,
      versionGroups: [...groups.values()]
        .sort((left, right) => left.scoringVersion.localeCompare(right.scoringVersion)
          || left.thresholdVersion.localeCompare(right.thresholdVersion))
        .map((group) => ({
          scoringVersion: group.scoringVersion,
          thresholdVersion: group.thresholdVersion,
          inherentCells: cells(group.inherent), residualCells: cells(group.residual),
          residualMissingCount: group.residualMissingCount
        }))
    };
  }

  private assertRiskUpdateShape(input: UpdateRiskDto): void {
    const closureCommand = input.status === RiskStatus.CLOSURE_PENDING;
    const manageValues = [
      input.category, input.cause, input.event, input.impact, input.probability,
      input.costImpactRating, input.scheduleImpactRating, input.hseImpactRating,
      input.residualAssessment, input.residualAssessmentReason, input.ownerId,
      input.reviewDate, input.responseStrategy, input.responsePlan, input.trigger,
      input.contingencyPlan, input.evidenceRefs, input.occurredIssueId
    ];
    const closureValues = [input.closureReason, input.closureEvidenceRefs];
    if (closureCommand && manageValues.some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'RISK_CLOSURE_COMMAND_INVALID',
        message: 'Closure command không được trộn với Risk management fields', retryable: false
      });
    }
    if (!closureCommand && closureValues.some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'RISK_CLOSURE_COMMAND_INVALID',
        message: 'Closure fields chỉ hợp lệ khi status là CLOSURE_PENDING', retryable: false
      });
    }
    const hasUpdate = input.status !== undefined
      || manageValues.some((value) => value !== undefined)
      || closureValues.some((value) => value !== undefined);
    if (!hasUpdate) this.noOpUpdate();
  }

  private assertIssueUpdateShape(input: UpdateIssueDto): void {
    const closureCommand = input.status === IssueStatus.CLOSURE_PENDING;
    const manageValues = [
      input.title, input.description, input.occurredAt, input.rootCause,
      input.actualImpact, input.severity, input.decisionSummary, input.ownerId,
      input.targetDate, input.evidenceRefs, input.resolutionSummary,
      input.resolutionEvidenceRefs
    ];
    const closureValues = [input.closureReason, input.closureEvidenceRefs];
    if (closureCommand && manageValues.some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'ISSUE_CLOSURE_COMMAND_INVALID',
        message: 'Closure command không được trộn với Issue management fields', retryable: false
      });
    }
    if (!closureCommand && closureValues.some((value) => value !== undefined)) {
      throw new BadRequestException({
        code: 'ISSUE_CLOSURE_COMMAND_INVALID',
        message: 'Closure fields chỉ hợp lệ khi status là CLOSURE_PENDING', retryable: false
      });
    }
    const hasUpdate = input.status !== undefined
      || manageValues.some((value) => value !== undefined)
      || closureValues.some((value) => value !== undefined);
    if (!hasUpdate) this.noOpUpdate();
  }

  private assertChangeUpdateShape(input: UpdateChangeDto): void {
    if (![
      input.title, input.reason, input.options, input.recommendation, input.ownerId,
      input.sourceBaselineId, input.impact, input.evidenceRefs, input.status
    ].some((value) => value !== undefined)) this.noOpUpdate();
  }

  private assertActionCommandShape(
    input: UpdateActionDto, kind: 'FIELDS' | 'COMPLETE' | 'VERIFY' | 'CANCEL'
  ): void {
    const fields = [input.title, input.description, input.ownerId, input.dueDate];
    const hasFields = fields.some((value) => value !== undefined);
    const hasResidual = input.residualAssessment !== undefined
      || input.residualRiskVersion !== undefined;
    const hasRoutineUpdate = hasFields || input.status !== undefined
      || input.statusReason !== undefined || input.evidenceRefs !== undefined;
    const invalid = kind === 'FIELDS'
      ? hasResidual
      : kind === 'COMPLETE'
        ? hasFields || input.statusReason !== undefined
        : kind === 'VERIFY'
          ? hasFields || hasResidual || input.statusReason !== undefined
          : hasFields || hasResidual;
    if (invalid) {
      throw new BadRequestException({
        code: 'ACTION_COMMAND_SHAPE_INVALID',
        message: 'Payload Action terminal không được trộn với field command khác',
        retryable: false
      });
    }
    if (kind === 'FIELDS' && !hasRoutineUpdate) this.noOpUpdate();
  }

  private assertIndependentActionActor(row: RiskIssueActionEntity, actorId: string): void {
    if (row.ownerId === actorId || row.completedBy === actorId) {
      throw new ForbiddenException({
        code: 'ACTION_TERMINAL_SOD',
        message: 'Owner/completer không được verify hoặc cancel Action của chính mình',
        retryable: false
      });
    }
  }

  private actionEvidenceRequired(): never {
    throw new UnprocessableEntityException({
      code: 'ACTION_EVIDENCE_REQUIRED',
      message: 'Terminal Action command cần evidence', retryable: false
    });
  }

  private actionEventSummary(eventType: string): string {
    const summaries: Record<string, string> = {
      RiskIssueActionChanged: 'Risk/Issue Action updated',
      RiskIssueActionCompleted: 'Risk/Issue Action completed',
      RiskIssueActionVerified: 'Risk/Issue Action verified',
      RiskIssueActionCancelled: 'Risk/Issue Action cancelled'
    };
    return summaries[eventType] ?? 'Risk/Issue Action changed';
  }

  private assertChangeSourceShape(source: CreateChangeDto['source']): void {
    const valid = source.type === ChangeSourceType.MANUAL
      ? source.riskId === undefined && source.issueId === undefined
      : source.type === ChangeSourceType.RISK
        ? source.riskId !== undefined && source.issueId === undefined
        : source.issueId !== undefined && source.riskId === undefined;
    if (!valid) {
      throw new BadRequestException({
        code: 'CHANGE_SOURCE_INVALID',
        message: 'Change source phải là đúng một trong MANUAL, RISK hoặc ISSUE',
        retryable: false
      });
    }
  }

  private plainImpact(value: CreateChangeDto['impact'] | UpdateChangeDto['impact']): ChangeImpactRecord {
    return value ? JSON.parse(JSON.stringify(value)) as ChangeImpactRecord : {};
  }

  private completeImpact(value: ChangeImpactRecord): CompleteChangeImpact {
    const candidate = value as Partial<CompleteChangeImpact>;
    const textDimensions = [candidate.scope, candidate.quality, candidate.hse, candidate.contract];
    const validText = textDimensions.every((dimension) => (
      typeof dimension?.summary === 'string' && dimension.summary.trim().length >= 3
    ));
    const schedule = candidate.schedule;
    const cost = candidate.cost;
    const validSchedule = typeof schedule?.summary === 'string'
      && schedule.summary.trim().length >= 3
      && Number.isInteger(schedule.durationDeltaDays)
      && typeof schedule.requiresRebaseline === 'boolean'
      && Array.isArray(schedule.affectedMilestoneIds);
    const validCost = typeof cost?.summary === 'string' && cost.summary.trim().length >= 3
      && typeof cost.amountDelta === 'string'
      && /^-?[0-9]{1,15}(\.[0-9]{1,4})?$/.test(cost.amountDelta)
      && typeof cost.currency === 'string' && /^[A-Z]{3}$/.test(cost.currency);
    if (!validText || !validSchedule || !validCost) {
      throw new UnprocessableEntityException({
        code: 'IMPACT_INCOMPLETE',
        message: 'Change cần đủ sáu chiều impact hợp lệ trước submit', retryable: false
      });
    }
    return JSON.parse(JSON.stringify(candidate)) as CompleteChangeImpact;
  }

  private canonicalHash(value: unknown): string {
    return createHash('sha256').update(this.stableSerialize(value)).digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${this.stableSerialize(record[key])}`
    )).join(',')}}`;
  }

  private async assertBaselineReference(
    manager: EntityManager, tenantId: string, projectId: string,
    baselineId: string, requireCurrentApproved: boolean
  ): Promise<void> {
    const builder = manager.getRepository(ScheduleBaselineEntity).createQueryBuilder('baseline')
      .where('baseline.id = :baselineId AND baseline.tenantId = :tenantId', {
        baselineId, tenantId
      }).andWhere('baseline.projectId = :projectId', { projectId });
    if (requireCurrentApproved) builder.andWhere('baseline.status = :approved', {
      approved: 'APPROVED'
    });
    if (!await builder.getExists()) this.baselineMismatch();
  }

  private historyObjectType(sourceType: RiskChangeHistorySourceTypeDto): string {
    return {
      [RiskChangeHistorySourceTypeDto.RISK]: 'Risk',
      [RiskChangeHistorySourceTypeDto.ISSUE]: 'Issue',
      [RiskChangeHistorySourceTypeDto.ACTION]: 'RiskIssueAction',
      [RiskChangeHistorySourceTypeDto.CHANGE_REQUEST]: 'ChangeRequest'
    }[sourceType];
  }

  private historySourceType(objectType: string): RiskChangeHistorySourceTypeDto {
    const values: Record<string, RiskChangeHistorySourceTypeDto> = {
      Risk: RiskChangeHistorySourceTypeDto.RISK,
      Issue: RiskChangeHistorySourceTypeDto.ISSUE,
      RiskIssueAction: RiskChangeHistorySourceTypeDto.ACTION,
      ChangeRequest: RiskChangeHistorySourceTypeDto.CHANGE_REQUEST
    };
    return values[objectType] ?? RiskChangeHistorySourceTypeDto.RISK;
  }

  private nullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private positiveInteger(value: unknown): number | null {
    return Number.isInteger(value) && (value as number) >= 1 ? value as number : null;
  }

  private safeHistorySummary(value: unknown, eventType: string): string {
    const summary = typeof value === 'string' ? value.trim() : eventType;
    return summary.slice(0, 2000);
  }

  private invalidTransition(from: string, to: string): never {
    throw new UnprocessableEntityException({
      code: 'INVALID_STATE_TRANSITION',
      message: `Không thể chuyển trạng thái từ ${from} sang ${to}`, retryable: false
    });
  }

  private noOpUpdate(): never {
    throw new BadRequestException({
      code: 'UPDATE_FIELDS_REQUIRED',
      message: 'Update cần ít nhất một field ngoài expectedVersion', retryable: false
    });
  }

  private versionConflict(): never {
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất', retryable: false
    });
  }

  private scopeDenied(): never {
    throw new ForbiddenException({
      code: 'PROJECT_SCOPE_DENIED',
      message: 'Không có quyền trên project/package scope này', retryable: false
    });
  }

  private closureSod(): never {
    throw new ForbiddenException({
      code: 'CLOSURE_DECISION_SOD',
      message: 'Creator/owner/requester không được quyết định closure của chính mình',
      retryable: false
    });
  }

  private baselineMismatch(): never {
    throw new UnprocessableEntityException({
      code: 'BASELINE_MISMATCH',
      message: 'Source baseline không phải current approved baseline của project',
      retryable: false
    });
  }

  private rethrowUnique(
    error: unknown, constraint: string, code: string, message: string
  ): never {
    if (typeof error === 'object' && error !== null) {
      const candidate = error as {
        code?: unknown; constraint?: unknown;
        driverError?: { code?: unknown; constraint?: unknown };
      };
      const databaseCode = candidate.code ?? candidate.driverError?.code;
      const databaseConstraint = candidate.constraint ?? candidate.driverError?.constraint;
      if (databaseCode === '23505' && databaseConstraint === constraint) {
        throw new ConflictException({ code, message, retryable: false });
      }
    }
    throw error;
  }
}
