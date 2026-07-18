import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import {
  And, EntityManager, In, MoreThan, Repository
} from 'typeorm';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import {
  ActivityDependencyEntity, ActivityStatus, ActivityType, AlertType, AssignmentScopeType,
  AuditEventEntity,
  BaselineStatus, BaselineType, CompanyEntity, DependencyType, PackageEntity, PackageStatus,
  ProgressUpdateEntity, ProjectEntity, ProjectRecordStatus, ProjectScheduleEntity,
  ProjectScheduleStatus, ScheduleActivityEntity, ScheduleBaselineEntity,
  NotificationSourceType, ScheduleNotificationEntity, ScheduleSourceFormat,
  UserAccountEntity, WbsNodeEntity,
  WbsNodeStatus
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import {
  APPROVED_CHANGE_READER, type ApprovedChangeForRebaseline, type ApprovedChangeReader
} from '../risk-change/approved-change-reader.port';
import { DayLevelCalendar } from './domain/calendar-calculator';
import {
  calculateCriticalPath, CPM_FORMULA_VERSION, CriticalPathValidationError,
  type CriticalPathResult
} from './domain/critical-path-calculator';
import { exportLookAheadCsv } from './domain/look-ahead-csv';
import {
  calculateProgress, ProgressCalculationError
} from './domain/progress-calculator';
import { materializeProgressProjection } from './domain/progress-projector';
import { validateScheduleWeights } from './domain/weight-validator';
import {
  ApplyScheduleDraftDto, BaselineDecisionDto, BaselineDecisionValueDto,
  BaselineTypeDto, CreatePackageDto, DraftModeDto, DraftSourceFormatDto,
  LookAheadExportQueryDto,
  PackageListQueryDto, ProgressHistoryQueryDto, ProgressUpdateDto, ScheduleQueryDto,
  ScheduleBaselineListQueryDto, SubmitScheduleBaselineDto
} from './dto/project-controls.dto';

interface RequestContext extends AuthContext { correlationId: string }

export interface ValidationIssue {
  code: string;
  path: string;
  row: number | null;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

interface PreparedDraft {
  schedule: ProjectScheduleEntity | null;
  scheduleId: string;
  calendar: DayLevelCalendar;
  wbsNodes: WbsNodeEntity[];
  activities: ScheduleActivityEntity[];
  dependencies: ActivityDependencyEntity[];
  wbsToSave: WbsNodeEntity[];
  activitiesToSave: ScheduleActivityEntity[];
  dependenciesToSave: ActivityDependencyEntity[];
  dependencyIdsToDelete: string[];
  packageScope: readonly string[] | null;
  sourceHash: string;
  issues: ValidationIssue[];
  criticalPath: CriticalPathResult | null;
}

@Injectable()
export class ProjectControlsService {
  constructor(
    @InjectRepository(PackageEntity) private readonly packages: Repository<PackageEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(CompanyEntity) private readonly companies: Repository<CompanyEntity>,
    @InjectRepository(UserAccountEntity) private readonly users: Repository<UserAccountEntity>,
    @InjectRepository(ProjectScheduleEntity)
    private readonly schedules: Repository<ProjectScheduleEntity>,
    @InjectRepository(WbsNodeEntity) private readonly wbsNodes: Repository<WbsNodeEntity>,
    @InjectRepository(ScheduleActivityEntity)
    private readonly activities: Repository<ScheduleActivityEntity>,
    @InjectRepository(ActivityDependencyEntity)
    private readonly dependencies: Repository<ActivityDependencyEntity>,
    @InjectRepository(ScheduleBaselineEntity)
    private readonly baselines: Repository<ScheduleBaselineEntity>,
    @InjectRepository(ProgressUpdateEntity)
    private readonly progressUpdates: Repository<ProgressUpdateEntity>,
    @InjectRepository(ScheduleNotificationEntity)
    private readonly notifications: Repository<ScheduleNotificationEntity>,
    @InjectRepository(AuditEventEntity)
    private readonly audits: Repository<AuditEventEntity>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(APPROVED_CHANGE_READER)
    private readonly approvedChanges: ApprovedChangeReader,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  async listPackages(
    context: RequestContext, projectId: string, query: PackageListQueryDto
  ): Promise<{ items: ReturnType<ProjectControlsService['packageView']>[]; nextCursor: string | null }> {
    await this.requireProject(context.tenantId, projectId);
    const allowedPackageIds = await this.permissions.packageScopeIds(context, 'package.read', projectId);
    if (allowedPackageIds?.length === 0) return { items: [], nextCursor: null };
    const where: Record<string, unknown> = { tenantId: context.tenantId, projectId };
    if (query.status) where.status = query.status;
    if (query.cursor && allowedPackageIds) {
      where.id = And(In(allowedPackageIds), MoreThan(query.cursor));
    } else if (query.cursor) {
      where.id = MoreThan(query.cursor);
    } else if (allowedPackageIds) {
      where.id = In(allowedPackageIds);
    }
    const rows = await this.packages.find({
      where: where as never,
      order: { id: 'ASC' },
      take: query.limit + 1
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => this.packageView(row)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    };
  }

  async createPackage(
    context: RequestContext, projectId: string, input: CreatePackageDto, idempotencyKey: string
  ) {
    try {
      return await this.commands.execute({
        context,
        operation: `package.create:${projectId}`,
        idempotencyKey,
        request: { projectId, input },
        execute: async (manager) => {
          await this.requireMutableProject(manager, context.tenantId, projectId);
          const allowedPackageIds = await this.permissions.packageScopeIds(
            context, 'package.create', projectId
          );
          if (allowedPackageIds && (
            !input.parentPackageId || !allowedPackageIds.includes(input.parentPackageId)
          )) await this.denyScope(context, 'PROJECT', projectId);
          if (input.parentPackageId) {
            await this.requireTenantProjectEntity(
              manager.getRepository(PackageEntity), context.tenantId, projectId,
              input.parentPackageId, 'PACKAGE_NOT_FOUND', 'Không tìm thấy package cha'
            );
          }
          if (input.contractorCompanyId) {
            await this.requireTenantEntity(
              manager.getRepository(CompanyEntity), context.tenantId,
              input.contractorCompanyId, 'COMPANY_NOT_FOUND', 'Không tìm thấy contractor company'
            );
          }
          const row = await manager.getRepository(PackageEntity).save({
            id: randomUUID(), tenantId: context.tenantId, projectId,
            parentPackageId: input.parentPackageId ?? null,
            contractorCompanyId: input.contractorCompanyId ?? null,
            code: input.code, name: input.name.trim(), packageType: input.packageType.trim(),
            status: PackageStatus.ACTIVE, idempotencyKey: null,
            createdBy: context.userId, updatedBy: context.userId
          });
          await this.recordMutation(manager, context, {
            action: 'PACKAGE_CREATED', objectType: 'Package', objectId: row.id,
            aggregateVersion: row.versionNo,
            payload: { projectId, code: row.code, parentPackageId: row.parentPackageId }
          });
          return this.packageView(row);
        },
        resultReference: (result) => ({
          resourceType: 'Package', resourceId: result.id, responseStatus: 201
        })
      });
    } catch (error) {
      this.rethrowUnique(error, 'PACKAGE_DUPLICATE', 'Mã package đã tồn tại trong dự án');
    }
  }

  async getSchedule(context: RequestContext, projectId: string, query: ScheduleQueryDto) {
    const project = await this.requireProject(context.tenantId, projectId);
    const schedule = await this.schedules.findOneBy({ tenantId: context.tenantId, projectId });
    if (!schedule) throw this.notFound('SCHEDULE_NOT_FOUND', 'Dự án chưa có schedule');
    const packageScope = await this.permissions.packageScopeIds(context, 'schedule.read', projectId);
    if (packageScope?.length === 0) await this.denyScope(context, 'PROJECT', projectId);
    const calendar = this.calendar(schedule);
    const dataDate = query.dataDate ?? schedule.dataDate;
    const lookAheadDays = query.lookAheadDays ?? this.config.schedule.defaultLookAheadDays;
    const [packageRows, allWbs, allActivities, allDependencies, currentBaseline, alerts] = await Promise.all([
      this.packages.find({ where: { tenantId: context.tenantId, projectId }, order: { code: 'ASC' } }),
      this.wbsNodes.find({ where: { tenantId: context.tenantId, projectId, scheduleId: schedule.id } }),
      this.activities.find({ where: { tenantId: context.tenantId, projectId, scheduleId: schedule.id } }),
      this.dependencies.find({ where: { tenantId: context.tenantId, projectId, scheduleId: schedule.id } }),
      query.baselineNumber
        ? this.baselines.findOneBy({
          tenantId: context.tenantId, projectId, baselineNumber: query.baselineNumber
        })
        : this.baselines.findOne({
          where: {
            tenantId: context.tenantId, projectId,
            status: In([BaselineStatus.SUBMITTED, BaselineStatus.APPROVED])
          },
          order: { baselineNumber: 'DESC' }
        }),
      this.notifications.find({
        where: {
          tenantId: context.tenantId, projectId, recipientUserId: context.userId,
          sourceType: NotificationSourceType.SCHEDULE_ACTIVITY
        },
        order: { dueAt: 'ASC' }
      })
    ]);
    const visiblePackage = (packageId: string | null) => !packageScope
      || (packageId !== null && packageScope.includes(packageId));
    const calculationWbs = allWbs.filter((row) => row.status === WbsNodeStatus.ACTIVE);
    const calculationActivities = allActivities.filter((row) => row.status !== ActivityStatus.CANCELLED);
    const calculationActivityIds = new Set(calculationActivities.map((row) => row.id));
    const calculationDependencies = allDependencies.filter((row) => (
      calculationActivityIds.has(row.predecessorId) && calculationActivityIds.has(row.successorId)
    ));
    const { issues, criticalPath } = this.validateState(
      calendar, calculationWbs, calculationActivities, calculationDependencies, 'DRAFT'
    );
    const metrics = criticalPath?.metricsByActivity ?? new Map();
    const forecastMetrics = this.calculateForecastPath(
      calendar, calculationActivities, calculationDependencies, dataDate
    );
    const wbs = calculationWbs.filter((row) => visiblePackage(row.packageId));
    const activities = calculationActivities.filter((row) => (
      row.status !== ActivityStatus.CANCELLED
      && visiblePackage(row.packageId)
    ));
    const visibleActivityIds = new Set(activities.map((row) => row.id));
    const dependencies = allDependencies.filter((row) => (
      visibleActivityIds.has(row.predecessorId) && visibleActivityIds.has(row.successorId)
    ));
    const progress = this.calculateScheduleProgress(
      calendar, calculationWbs, activities, dataDate, packageScope !== null
    );
    const visibleIssues = this.visibleValidationIssues(
      issues, packageScope, wbs, activities
    );
    const lookAheadEnd = calendar.addWorkdays(dataDate, lookAheadDays);
    const activityViews = activities
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart) || left.code.localeCompare(right.code))
      .map((row) => this.activityView(
        row, metrics.get(row.id), forecastMetrics.get(row.id)
      ));
    const baselineFinish = this.snapshotFinish(
      currentBaseline?.snapshot ?? null, packageScope
    );
    const forecastFinish = activityViews
      .map((row) => row.forecastFinish ?? row.plannedFinish)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
    return {
      id: schedule.id,
      projectId,
      projectStatus: project.recordStatus,
      status: schedule.status,
      versionNo: schedule.versionNo,
      calendar: this.calendarView(schedule),
      dataDate,
      packages: packageRows.filter((row) => visiblePackage(row.id)).map((row) => this.packageView(row)),
      wbsNodes: wbs.sort((left, right) => left.sortOrder - right.sortOrder).map((row) => this.wbsView(row)),
      activities: activityViews,
      dependencies: dependencies.map((row) => this.dependencyView(row)),
      currentBaseline: currentBaseline ? this.baselineView(currentBaseline) : null,
      validationIssues: visibleIssues,
      plannedProgress: progress.plannedProgress,
      actualProgress: progress.actualProgress,
      spi: progress.spi,
      forecastFinish,
      varianceWorkDays: baselineFinish && forecastFinish
        ? this.safeWorkdayDistance(calendar, baselineFinish, forecastFinish) : null,
      lookAhead: activityViews.filter((row) => (
        row.status !== ActivityStatus.COMPLETE
        && row.plannedStart >= dataDate
        && row.plannedStart <= lookAheadEnd
      )),
      alerts: alerts
        .filter((row) => (
          row.activityId !== null
          && visibleActivityIds.has(row.activityId)
          && row.dataDate === dataDate
        ))
        .map((row) => this.notificationView(row)),
      calculatedAt: new Date().toISOString(),
      formulaVersion: this.config.schedule.calculationVersion,
      thresholdVersion: this.config.schedule.thresholdVersion
    };
  }

  async exportLookAhead(
    context: RequestContext, projectId: string, query: LookAheadExportQueryDto
  ): Promise<string> {
    const schedule = await this.getSchedule(context, projectId, {
      dataDate: query.dataDate,
      lookAheadDays: query.lookAheadDays
    });
    await this.audits.save({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: 'SCHEDULE_LOOKAHEAD_EXPORTED', result: 'SUCCESS', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: 'ProjectSchedule', objectId: schedule.id,
      payload: {
        projectId, dataDate: schedule.dataDate,
        lookAheadDays: query.lookAheadDays ?? this.config.schedule.defaultLookAheadDays,
        rowCount: schedule.lookAhead.length
      }
    });
    return exportLookAheadCsv(projectId, schedule.lookAhead);
  }

  async applyDraft(
    context: RequestContext, projectId: string, input: ApplyScheduleDraftDto, idempotencyKey: string
  ) {
    if (input.mode === DraftModeDto.PREVIEW) {
      const prepared = await this.prepareDraft(undefined, context, projectId, input);
      return this.draftResult(
        input.mode, false, null, this.visiblePreparedIssues(prepared)
      );
    }
    return this.commands.execute({
      context,
      operation: `schedule.apply-draft:${projectId}`,
      idempotencyKey,
      request: { projectId, input },
      execute: async (manager) => {
        const prepared = await this.prepareDraft(manager, context, projectId, input);
        const visibleIssues = this.visiblePreparedIssues(prepared);
        if (prepared.issues.some((issue) => issue.severity === 'ERROR')) {
          throw new UnprocessableEntityException({
            code: 'SCHEDULE_VALIDATION_FAILED',
            message: 'Schedule draft không hợp lệ',
            retryable: false,
            issues: visibleIssues
          });
        }
        const version = await this.commitDraft(manager, context, projectId, input, prepared);
        await this.recordMutation(manager, context, {
          action: 'SCHEDULE_DRAFT_CHANGED', objectType: 'ProjectSchedule',
          objectId: prepared.scheduleId, aggregateVersion: version,
          eventType: 'ScheduleDraftChanged',
          payload: {
            projectId, sourceFormat: input.source.format,
            wbsUpserts: input.wbsUpserts.length,
            activityUpserts: input.activityUpserts.length,
            dependencyUpserts: input.dependencyUpserts.length
          }
        });
        return this.draftResult(input.mode, true, version, visibleIssues);
      },
      resultReference: () => ({
        resourceType: 'ProjectSchedule', resourceId: projectId, responseStatus: 200
      })
    });
  }

  async listBaselinesByApprovedChange(
    context: RequestContext,
    projectId: string,
    query: ScheduleBaselineListQueryDto
  ): Promise<{
    items: ReturnType<ProjectControlsService['baselineView']>[];
    nextCursor: string | null;
  }> {
    await this.requireProject(context.tenantId, projectId);
    const packageScope = await this.permissions.packageScopeIds(
      context, 'schedule.read', projectId
    );
    if (packageScope !== null) {
      await this.denyScope(context, 'PROJECT', projectId, 'PROJECT_SCOPE_DENIED');
    }
    await this.approvedChanges.assertReferenceForBaselineHistory(this.baselines.manager, {
      tenantId: context.tenantId,
      projectId,
      changeRequestId: query.approvedChangeRequestId
    });
    const rows = await this.baselines.find({
      where: {
        tenantId: context.tenantId,
        projectId,
        approvedChangeRequestId: query.approvedChangeRequestId,
        ...(query.cursor ? { id: MoreThan(query.cursor) } : {})
      },
      order: { id: 'ASC' },
      take: query.limit + 1
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => this.baselineView(row)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    };
  }

  async submitBaseline(
    context: RequestContext, projectId: string, input: SubmitScheduleBaselineDto,
    idempotencyKey: string
  ) {
    this.assertBaselineRequestShape(input);
    return this.commands.execute({
      context,
      operation: `schedule-baseline.submit:${projectId}`,
      idempotencyKey,
      request: { projectId, input },
      execute: async (manager) => {
        await this.requireMutableProject(manager, context.tenantId, projectId);
        const packageScope = await this.permissions.packageScopeIds(
          context, 'baseline.submit', projectId
        );
        if (packageScope !== null) await this.denyScope(context, 'PROJECT', projectId);
        const scheduleRepository = manager.getRepository(ProjectScheduleEntity);
        const schedule = await scheduleRepository.findOne({
          where: { tenantId: context.tenantId, projectId },
          lock: { mode: 'pessimistic_write' }
        });
        if (!schedule) throw this.notFound('SCHEDULE_NOT_FOUND', 'Dự án chưa có schedule');
        if (schedule.versionNo !== input.expectedScheduleVersion) {
          throw this.versionConflict(schedule.versionNo);
        }
        const [wbs, activities, dependencies] = await Promise.all([
          manager.getRepository(WbsNodeEntity).findBy({
            tenantId: context.tenantId, projectId, scheduleId: schedule.id,
            status: WbsNodeStatus.ACTIVE
          }),
          manager.getRepository(ScheduleActivityEntity).findBy({
            tenantId: context.tenantId, projectId, scheduleId: schedule.id
          }),
          manager.getRepository(ActivityDependencyEntity).findBy({
            tenantId: context.tenantId, projectId, scheduleId: schedule.id
          })
        ]);
        const calendar = this.calendar(schedule);
        const activeActivities = activities.filter((row) => row.status !== ActivityStatus.CANCELLED);
        const activeActivityIds = new Set(activeActivities.map((row) => row.id));
        const activeDependencies = dependencies.filter((row) => (
          activeActivityIds.has(row.predecessorId) && activeActivityIds.has(row.successorId)
        ));
        const validation = this.validateState(
          calendar, wbs, activeActivities, activeDependencies, 'SUBMIT'
        );
        if (validation.issues.some((issue) => issue.severity === 'ERROR')) {
          throw new UnprocessableEntityException({
            code: 'SCHEDULE_VALIDATION_FAILED', message: 'Schedule chưa đủ điều kiện submit baseline',
            retryable: false, issues: validation.issues
          });
        }
        const baselineRepository = manager.getRepository(ScheduleBaselineEntity);
        let approvedChange: ApprovedChangeForRebaseline | null = null;
        let replacesBaselineId: string | null = null;
        if (input.baselineType === BaselineTypeDto.INITIAL) {
          const existingInitial = await baselineRepository.existsBy({
            tenantId: context.tenantId, projectId, baselineType: BaselineType.INITIAL,
            status: In([BaselineStatus.SUBMITTED, BaselineStatus.APPROVED])
          });
          if (existingInitial) {
            throw new ConflictException({
              code: 'BASELINE_STATE_INVALID',
              message: 'Dự án đã có initial baseline đang chờ hoặc đã phê duyệt',
              retryable: false
            });
          }
        } else {
          const currentBaseline = await baselineRepository.findOne({
            where: {
              tenantId: context.tenantId, projectId, status: BaselineStatus.APPROVED
            },
            lock: { mode: 'pessimistic_write' }
          });
          if (!currentBaseline) {
            throw new ConflictException({
              code: 'BASELINE_MISMATCH',
              message: 'Dự án chưa có current baseline để thực hiện rebaseline',
              retryable: false
            });
          }
          approvedChange = await this.approvedChanges.resolveForRebaseline(manager, {
            tenantId: context.tenantId,
            projectId,
            changeRequestId: input.approvedChangeRequestId!,
            currentBaselineId: currentBaseline.id
          });
          replacesBaselineId = currentBaseline.id;
          const pendingForChange = await baselineRepository.existsBy({
            tenantId: context.tenantId,
            projectId,
            approvedChangeRequestId: approvedChange.id,
            status: BaselineStatus.SUBMITTED
          });
          if (pendingForChange) {
            throw new ConflictException({
              code: 'BASELINE_STATE_INVALID',
              message: 'Approved Change đã có rebaseline đang chờ quyết định',
              retryable: false
            });
          }
        }
        const [{ next }] = await manager.query<Array<{ next: string }>>(
          `SELECT (COALESCE(MAX(baseline_number), 0) + 1)::text AS next
           FROM schedule_baselines WHERE tenant_id = $1 AND project_id = $2`,
          [context.tenantId, projectId]
        );
        const scheduleSnapshot = this.baselineSnapshot(
          schedule, wbs, activeActivities, activeDependencies, schedule.versionNo + 1
        );
        const snapshot = approvedChange ? {
          ...scheduleSnapshot,
          approvedChange: {
            id: approvedChange.id,
            code: approvedChange.code,
            title: approvedChange.title,
            sourceBaselineId: approvedChange.sourceBaselineId,
            impactSnapshotHash: approvedChange.impactSnapshotHash,
            approvalSnapshotHash: approvedChange.approvalSnapshotHash,
            decisionVersion: approvedChange.decisionVersion,
            approvedBy: approvedChange.approvedBy,
            approvedAt: approvedChange.approvedAt.toISOString(),
            versionNo: approvedChange.versionNo
          }
        } : scheduleSnapshot;
        const row = await baselineRepository.save({
          id: randomUUID(), tenantId: context.tenantId, projectId, scheduleId: schedule.id,
          baselineNumber: Number(next), baselineType: input.baselineType === BaselineTypeDto.INITIAL
            ? BaselineType.INITIAL : BaselineType.REBASELINE,
          status: BaselineStatus.SUBMITTED, dataDate: input.dataDate.slice(0, 10),
          snapshot, snapshotHash: this.hashCanonical(snapshot),
          reason: approvedChange?.changeReason ?? input.reason!.trim(),
          impactSummary: approvedChange?.scheduleImpactSummary ?? input.impactSummary!.trim(),
          approvedChangeRequestId: approvedChange?.id ?? null,
          replacesBaselineId, createdBy: context.userId, submittedBy: context.userId,
          submittedAt: new Date(), approvedBy: null, approvedAt: null, decisionComment: null
        });
        await scheduleRepository.update({ id: schedule.id, tenantId: context.tenantId }, {
          status: ProjectScheduleStatus.SUBMITTED, updatedBy: context.userId
        });
        await this.recordMutation(manager, context, {
          action: 'BASELINE_SUBMITTED', objectType: 'ScheduleBaseline', objectId: row.id,
          aggregateVersion: row.versionNo,
          eventType: 'BaselineSubmitted',
          payload: {
            projectId,
            baselineNumber: row.baselineNumber,
            baselineType: row.baselineType,
            approvedChangeRequestId: row.approvedChangeRequestId,
            snapshotHash: row.snapshotHash
          }
        });
        return this.baselineView(row);
      },
      resultReference: (result) => ({
        resourceType: 'ScheduleBaseline', resourceId: result.id, responseStatus: 201
      })
    });
  }

  async decideBaseline(
    context: RequestContext, baselineId: string, input: BaselineDecisionDto,
    idempotencyKey: string
  ) {
    return this.commands.execute({
      context,
      operation: `schedule-baseline.decision:${baselineId}`,
      idempotencyKey,
      request: { baselineId, input },
      execute: async (manager) => {
        const repository = manager.getRepository(ScheduleBaselineEntity);
        const baseline = await repository.findOne({
          where: { id: baselineId, tenantId: context.tenantId },
          lock: { mode: 'pessimistic_write' }
        });
        if (!baseline) throw this.notFound('BASELINE_NOT_FOUND', 'Không tìm thấy baseline');
        const packageScope = await this.permissions.packageScopeIds(
          context, 'baseline.approve', baseline.projectId
        );
        if (packageScope !== null) {
          await this.denyScope(context, 'ScheduleBaseline', baseline.id);
        }
        await this.requireMutableProject(
          manager, context.tenantId, baseline.projectId
        );
        if (baseline.status !== BaselineStatus.SUBMITTED) {
          throw new ConflictException({
            code: 'BASELINE_STATE_INVALID', message: 'Chỉ baseline SUBMITTED mới được quyết định',
            retryable: false
          });
        }
        if (baseline.versionNo !== input.expectedVersion) {
          throw this.versionConflict(baseline.versionNo);
        }
        const schedule = await manager.getRepository(ProjectScheduleEntity).findOne({
          where: {
            id: baseline.scheduleId, tenantId: context.tenantId,
            projectId: baseline.projectId
          },
          lock: { mode: 'pessimistic_write' }
        });
        const snapshotSchedule = baseline.snapshot.schedule;
        const snapshotVersion = snapshotSchedule && typeof snapshotSchedule === 'object'
          ? (snapshotSchedule as { versionNo?: unknown }).versionNo : null;
        if (
          !schedule || snapshotVersion !== schedule.versionNo
          || this.hashCanonical(baseline.snapshot) !== baseline.snapshotHash
        ) {
          throw new ConflictException({
            code: 'BASELINE_LOCKED',
            message: 'Schedule đã thay đổi hoặc baseline snapshot không còn hợp lệ',
            retryable: false
          });
        }
        if (baseline.createdBy === context.userId || baseline.submittedBy === context.userId) {
          await this.denyScope(
            context, 'ScheduleBaseline', baseline.id, 'BASELINE_SELF_APPROVAL_DENIED'
          );
        }
        let action: string;
        if (input.decision === BaselineDecisionValueDto.APPROVE) {
          const current = await repository.findOneBy({
            tenantId: context.tenantId, projectId: baseline.projectId,
            status: BaselineStatus.APPROVED
          });
          if (current && current.id !== baseline.id) {
            await repository.update({ id: current.id, tenantId: current.tenantId }, {
              status: BaselineStatus.SUPERSEDED
            });
          }
          baseline.status = BaselineStatus.APPROVED;
          baseline.approvedBy = context.userId;
          baseline.approvedAt = new Date();
          baseline.decisionComment = input.comment?.trim() || null;
          action = 'BASELINE_APPROVED';
        } else {
          baseline.status = input.decision === BaselineDecisionValueDto.RETURN
            ? BaselineStatus.RETURNED : BaselineStatus.REJECTED;
          baseline.decisionComment = input.comment?.trim() || null;
          action = input.decision === BaselineDecisionValueDto.RETURN
            ? 'BASELINE_RETURNED' : 'BASELINE_REJECTED';
        }
        const saved = await repository.save(baseline);
        await manager.getRepository(ProjectScheduleEntity).update({
          id: schedule.id, tenantId: context.tenantId
        }, {
          status: input.decision === BaselineDecisionValueDto.APPROVE
            ? ProjectScheduleStatus.APPROVED
            : input.decision === BaselineDecisionValueDto.RETURN
              ? ProjectScheduleStatus.RETURNED : ProjectScheduleStatus.REJECTED,
          updatedBy: context.userId
        });
        await this.recordMutation(manager, context, {
          action, objectType: 'ScheduleBaseline', objectId: saved.id,
          aggregateVersion: saved.versionNo,
          eventType: action === 'BASELINE_APPROVED' ? 'BaselineApproved' : undefined,
          payload: {
            projectId: saved.projectId, baselineNumber: saved.baselineNumber,
            decision: input.decision
          }
        });
        return this.baselineView(saved);
      },
      resultReference: (result) => ({
        resourceType: 'ScheduleBaseline', resourceId: result.id, responseStatus: 200
      })
    });
  }

  async recordProgress(
    context: RequestContext, projectId: string, input: ProgressUpdateDto,
    idempotencyKey: string
  ) {
    const permission = input.correctionOfId ? 'progress.correct' : 'progress.record';
    return this.commands.execute({
      context,
      operation: `progress.record:${projectId}:${input.activityId}`,
      idempotencyKey,
      request: { projectId, input },
      execute: async (manager) => {
        const project = await this.requireMutableProject(manager, context.tenantId, projectId);
        const activityRepository = manager.getRepository(ScheduleActivityEntity);
        const activity = await activityRepository.findOne({
          where: { id: input.activityId, tenantId: context.tenantId, projectId },
          lock: { mode: 'pessimistic_write' }
        });
        if (!activity) throw this.notFound('ACTIVITY_NOT_FOUND', 'Không tìm thấy activity');
        if (activity.status === ActivityStatus.CANCELLED) {
          throw new ConflictException({
            code: 'ACTIVITY_STATE_INVALID',
            message: 'Không được ghi tiến độ cho activity đã bị hủy',
            retryable: false
          });
        }
        const packageScope = await this.permissions.packageScopeIds(context, permission, projectId);
        if (packageScope && (
          !activity.packageId || !packageScope.includes(activity.packageId)
        )) await this.denyScope(context, 'ScheduleActivity', activity.id);
        if (packageScope) {
          const assignments = await this.permissions.effectiveAssignments(context);
          const mayManagePackageProgress = assignments.some((assignment) => (
            assignment.permissions.includes(permission)
            && ['PMO', 'PROJECT_MANAGER', 'PROJECT_CONTROLS'].includes(assignment.roleCode)
            && (
              assignment.scopeType === AssignmentScopeType.TENANT
              || (assignment.scopeType === AssignmentScopeType.PORTFOLIO
                && assignment.scopeId === project.portfolioId)
              || (assignment.scopeType === AssignmentScopeType.PROJECT
                && assignment.scopeId === projectId)
              || (assignment.scopeType === AssignmentScopeType.PACKAGE
                && assignment.scopeId === activity.packageId)
            )
          ));
          if (!mayManagePackageProgress && activity.ownerId !== context.userId) {
            await this.denyScope(context, 'ScheduleActivity', activity.id);
          }
        }
        if (activity.versionNo !== input.expectedActivityVersion) {
          throw this.versionConflict(activity.versionNo);
        }
        const progressRepository = manager.getRepository(ProgressUpdateEntity);
        const history = await progressRepository.find({
          where: { tenantId: context.tenantId, projectId, activityId: activity.id },
          order: { dataDate: 'ASC', recordedAt: 'ASC', id: 'ASC' }
        });
        const currentProjection = materializeProgressProjection(history);
        let correctionTarget: ProgressUpdateEntity | null = null;
        if (input.correctionOfId) {
          correctionTarget = history.find((row) => row.id === input.correctionOfId) ?? null;
          if (!correctionTarget) {
            throw new BadRequestException({
              code: 'ACTUAL_CORRECTION_REQUIRED',
              message: 'Correction phải tham chiếu progress history cùng activity',
              retryable: false
            });
          }
          if (input.dataDate.slice(0, 10) !== correctionTarget.dataDate) {
            throw new UnprocessableEntityException({
              code: 'CORRECTION_DATE_MISMATCH',
              message: 'Correction phải giữ nguyên dataDate của record được điều chỉnh',
              retryable: false
            });
          }
        } else if (currentProjection && input.dataDate.slice(0, 10) < currentProjection.dataDate) {
          throw new UnprocessableEntityException({
            code: 'PROGRESS_DATE_REGRESSION',
            message: 'Progress mới không được có dataDate cũ hơn projection hiện tại',
            retryable: false
          });
        } else if (Number(input.percentComplete) < Number(activity.percentComplete)) {
          throw new UnprocessableEntityException({
            code: 'ACTUAL_CORRECTION_REQUIRED',
            message: 'Progress giảm phải được ghi dưới dạng correction có lý do',
            retryable: false
          });
        }
        const basis = correctionTarget ?? currentProjection;
        // ValidationPipe/class-transformer may materialize optional DTO fields as
        // own properties with value undefined. Only a supplied value (including
        // explicit null) may replace the correction basis.
        const hasActualStart = input.actualStart !== undefined;
        const hasActualFinish = input.actualFinish !== undefined;
        const actualStart = hasActualStart
          ? input.actualStart?.slice(0, 10) ?? null
          : basis ? basis.actualStart : activity.actualStart;
        const actualFinish = hasActualFinish
          ? input.actualFinish?.slice(0, 10) ?? null
          : basis ? basis.actualFinish : activity.actualFinish;
        const evidenceRefs = input.evidenceRefs ?? basis?.evidenceRefs ?? [];
        if (Number(input.percentComplete) === 100 && (
          !actualStart || !actualFinish || evidenceRefs.length === 0
        )) {
          throw new UnprocessableEntityException({
            code: 'PROGRESS_EVIDENCE_REQUIRED',
            message: 'Hoàn thành activity cần actual start, actual finish và evidence',
            retryable: false
          });
        }
        if (actualFinish && (
          !actualStart || Number(input.percentComplete) !== 100 || evidenceRefs.length === 0
        )) {
          throw new UnprocessableEntityException({
            code: 'PROGRESS_EVIDENCE_REQUIRED',
            message: 'Actual finish cần actual start, 100% và evidence',
            retryable: false
          });
        }
        if (actualStart && actualFinish && actualFinish < actualStart) {
          throw new UnprocessableEntityException({
            code: 'INVALID_ACTUAL_DATES',
            message: 'Actual finish không được trước actual start',
            retryable: false
          });
        }
        const row = await progressRepository.save({
          id: randomUUID(), tenantId: context.tenantId, projectId, activityId: activity.id,
          correctionOfId: input.correctionOfId ?? null, dataDate: input.dataDate.slice(0, 10),
          percentComplete: input.percentComplete, remainingDurationWorkDays: input.remainingDurationWorkDays,
          quantity: input.quantity ?? null, unit: input.unit?.trim() || null,
          actualStart, actualFinish,
          evidenceRefs, note: input.note?.trim() || null,
          reason: input.reason?.trim() || null,
          sourceKey: this.progressSourceKey(context, projectId, activity.id, idempotencyKey),
          recordedBy: context.userId, recordedAt: new Date()
        });
        const projection = materializeProgressProjection([...history, row]);
        if (!projection) throw new Error('Progress projection cannot be empty after append');
        const schedule = await manager.getRepository(ProjectScheduleEntity).findOneByOrFail({
          id: activity.scheduleId, tenantId: context.tenantId, projectId
        });
        await manager.query(`UPDATE project_schedules
          SET data_date = GREATEST(data_date, $4::date),
              updated_by = $5,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND tenant_id = $2 AND project_id = $3`, [
          schedule.id, context.tenantId, projectId, input.dataDate.slice(0, 10), context.userId
        ]);
        const updated = await activityRepository.createQueryBuilder().update(ScheduleActivityEntity)
          .set({
            percentComplete: projection.percentComplete,
            remainingDurationWorkDays: projection.remainingDurationWorkDays,
            actualStart: projection.actualStart,
            actualFinish: projection.actualFinish,
            forecastStart: null,
            forecastFinish: null,
            status: Number(projection.percentComplete) === 100
              ? ActivityStatus.COMPLETE
              : projection.actualStart ? ActivityStatus.IN_PROGRESS : ActivityStatus.READY,
            updatedBy: context.userId,
            versionNo: () => '"version_no" + 1'
          })
          .where('id = :id AND tenant_id = :tenantId AND project_id = :projectId AND version_no = :version', {
            id: activity.id, tenantId: context.tenantId, projectId, version: input.expectedActivityVersion
          })
          .execute();
        if (updated.affected !== 1) throw this.versionConflict(activity.versionNo);
        const refreshed = await activityRepository.findOneByOrFail({
          id: activity.id, tenantId: context.tenantId, projectId
        });
        await this.recordMutation(manager, context, {
          action: 'PROGRESS_RECORDED', objectType: 'ScheduleActivity', objectId: activity.id,
          aggregateVersion: refreshed.versionNo,
          eventType: 'ProgressRecorded',
          payload: {
            projectId, progressUpdateId: row.id, percentComplete: row.percentComplete,
            scheduleId: activity.scheduleId, dataDate: row.dataDate,
            correctionOfId: row.correctionOfId
          }
        });
        return this.progressView(row);
      },
      resultReference: (result) => ({
        resourceType: 'ProgressUpdate', resourceId: result.id, responseStatus: 201
      })
    });
  }

  async listProgressHistory(
    context: RequestContext, projectId: string, query: ProgressHistoryQueryDto
  ): Promise<{
    items: ReturnType<ProjectControlsService['progressDetailView']>[];
    nextCursor: string | null;
  }> {
    await this.requireProject(context.tenantId, projectId);
    const activity = await this.requireTenantProjectEntity(
      this.activities, context.tenantId, projectId, query.activityId,
      'ACTIVITY_NOT_FOUND', 'Không tìm thấy activity'
    );
    const packageScope = await this.permissions.packageScopeIds(
      context, 'schedule.read', projectId
    );
    if (packageScope && (
      !activity.packageId || !packageScope.includes(activity.packageId)
    )) await this.denyScope(context, 'ScheduleActivity', activity.id);

    let cursor: ProgressUpdateEntity | null = null;
    if (query.cursor) {
      cursor = await this.progressUpdates.findOneBy({
        id: query.cursor, tenantId: context.tenantId,
        projectId, activityId: activity.id
      });
      if (!cursor) {
        throw new BadRequestException({
          code: 'INVALID_CURSOR', message: 'Progress history cursor không hợp lệ',
          retryable: false
        });
      }
    }
    const builder = this.progressUpdates.createQueryBuilder('progress')
      .where('progress.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('progress.projectId = :projectId', { projectId })
      .andWhere('progress.activityId = :activityId', { activityId: activity.id });
    if (cursor) {
      builder.andWhere(`(
        progress.dataDate < :cursorDate
        OR (progress.dataDate = :cursorDate AND progress.recordedAt < :cursorRecordedAt)
        OR (progress.dataDate = :cursorDate AND progress.recordedAt = :cursorRecordedAt
          AND progress.id < :cursorId)
      )`, {
        cursorDate: cursor.dataDate,
        cursorRecordedAt: cursor.recordedAt,
        cursorId: cursor.id
      });
    }
    const rows = await builder
      .orderBy('progress.dataDate', 'DESC')
      .addOrderBy('progress.recordedAt', 'DESC')
      .addOrderBy('progress.id', 'DESC')
      .take(query.limit + 1)
      .getMany();
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map((row) => this.progressDetailView(row)),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null
    };
  }

  private async prepareDraft(
    manager: EntityManager | undefined, context: RequestContext, projectId: string,
    input: ApplyScheduleDraftDto
  ): Promise<PreparedDraft> {
    const issues: ValidationIssue[] = [];
    const rowCount = input.wbsUpserts.length + input.activityUpserts.length
      + input.dependencyUpserts.length + input.archiveWbsIds.length
      + input.archiveActivityIds.length + input.unlinkDependencyIds.length;
    if (rowCount > this.config.schedule.importMaxRows) {
      issues.push(this.issue(
        'IMPORT_ROW_LIMIT_EXCEEDED', 'source',
        `Import có ${rowCount} rows, vượt giới hạn ${this.config.schedule.importMaxRows}`
      ));
    }
    issues.push(...this.validateDraftInputUniqueness(input));
    const projectRepository = manager?.getRepository(ProjectEntity) ?? this.projects;
    const project = manager
      ? await projectRepository.findOne({
        where: { tenantId: context.tenantId, id: projectId },
        lock: { mode: 'pessimistic_write' }
      })
      : await projectRepository.findOneBy({ tenantId: context.tenantId, id: projectId });
    if (!project) throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    this.assertProjectMutable(project);
    if (input.source.format !== DraftSourceFormatDto.MANUAL) {
      const canImport = await this.permissions.has(
        context, 'schedule.import', 'PROJECT', projectId
      );
      if (!canImport) await this.denyScope(context, 'PROJECT', projectId);
    }
    const packageScope = await this.permissions.packageScopeIds(
      context, 'schedule.manage', projectId
    );
    if (packageScope?.length === 0) await this.denyScope(context, 'PROJECT', projectId);

    const scheduleRepository = manager?.getRepository(ProjectScheduleEntity) ?? this.schedules;
    const wbsRepository = manager?.getRepository(WbsNodeEntity) ?? this.wbsNodes;
    const activityRepository = manager?.getRepository(ScheduleActivityEntity) ?? this.activities;
    const dependencyRepository = manager?.getRepository(ActivityDependencyEntity) ?? this.dependencies;
    const packageRepository = manager?.getRepository(PackageEntity) ?? this.packages;
    const userRepository = manager?.getRepository(UserAccountEntity) ?? this.users;
    const schedule = await scheduleRepository.findOneBy({ tenantId: context.tenantId, projectId });
    const currentVersion = schedule?.versionNo ?? 0;
    if (currentVersion !== input.expectedVersion) throw this.versionConflict(currentVersion);
    if (schedule && [
      ProjectScheduleStatus.SUBMITTED, ProjectScheduleStatus.APPROVED
    ].includes(schedule.status)) {
      throw new ConflictException({
        code: 'BASELINE_LOCKED',
        message: 'Không được sửa draft khi baseline đang chờ duyệt hoặc đã phê duyệt',
        retryable: false
      });
    }
    const scheduleId = schedule?.id ?? randomUUID();
    const [existingWbs, existingActivities, existingDependencies, projectPackages] = schedule
      ? await Promise.all([
        wbsRepository.findBy({ tenantId: context.tenantId, projectId, scheduleId }),
        activityRepository.findBy({ tenantId: context.tenantId, projectId, scheduleId }),
        dependencyRepository.findBy({ tenantId: context.tenantId, projectId, scheduleId }),
        packageRepository.findBy({ tenantId: context.tenantId, projectId })
      ])
      : [[], [], [], await packageRepository.findBy({ tenantId: context.tenantId, projectId })];
    const originalActivityById = new Map(existingActivities.map((row) => [row.id, row]));

    let calendar: DayLevelCalendar;
    try {
      calendar = new DayLevelCalendar(input.calendar);
    } catch (error) {
      issues.push(this.issue(
        'INVALID_CALENDAR', 'calendar', error instanceof Error ? error.message : 'Calendar không hợp lệ'
      ));
      calendar = new DayLevelCalendar({
        timezone: 'UTC', workingWeek: [1, 2, 3, 4, 5], exceptions: []
      });
    }

    const sourceHash = rowCount <= this.config.schedule.importMaxRows
      ? this.hashCanonical(this.draftSourcePayload(input)) : '';
    const suppliedHash = input.source.sourceHash?.replace(/^sha256:/i, '').toLowerCase();
    if (suppliedHash && suppliedHash !== sourceHash) {
      issues.push(this.issue(
        'SOURCE_HASH_MISMATCH', 'source.sourceHash',
        'sourceHash không khớp payload canonical do server tính'
      ));
    }
    if (rowCount > this.config.schedule.importMaxRows) {
      return {
        schedule, scheduleId, calendar,
        wbsNodes: existingWbs, activities: existingActivities,
        dependencies: existingDependencies, wbsToSave: [], activitiesToSave: [],
        dependenciesToSave: [], dependencyIdsToDelete: [], packageScope, sourceHash,
        issues: this.uniqueIssues(issues), criticalPath: null
      };
    }

    const packageById = new Map(projectPackages.map((row) => [row.id, row]));
    const touchedPackageIds = new Set<string>();
    const touchPackage = (packageId: string | null | undefined) => {
      if (packageId) touchedPackageIds.add(packageId);
    };
    const wbsById = new Map(existingWbs.map((row) => [row.id, row]));
    const wbsByCode = new Map(existingWbs.map((row) => [row.code, row]));
    const wbsClientRefs = new Map(existingWbs.map((row) => [row.code, row.id]));
    const wbsInputById = new Map<string, typeof input.wbsUpserts[number]>();
    const wbsToSave: WbsNodeEntity[] = [];
    for (const [index, item] of input.wbsUpserts.entries()) {
      if (wbsClientRefs.has(item.clientRef) && !wbsByCode.has(item.clientRef)) {
        issues.push(this.issue(
          'DUPLICATE_CLIENT_REF', `wbsUpserts[${index}].clientRef`,
          `clientRef ${item.clientRef} bị trùng`
        ));
      }
      const current = item.id ? wbsById.get(item.id) : wbsByCode.get(item.code);
      if (current) {
        await this.assertPackageScope(context, projectId, packageScope, current.packageId);
      }
      await this.assertPackageScope(context, projectId, packageScope, item.packageId ?? null);
      touchPackage(current?.packageId);
      touchPackage(item.packageId);
      if (item.id && !current) {
        issues.push(this.issue('WBS_NOT_FOUND', `wbsUpserts[${index}].id`, 'Không tìm thấy WBS cần cập nhật'));
      }
      const id = current?.id ?? item.id ?? randomUUID();
      wbsClientRefs.set(item.clientRef, id);
      wbsInputById.set(id, item);
      const row = wbsRepository.create({
        ...(current ?? {}), id, tenantId: context.tenantId, projectId, scheduleId,
        packageId: item.packageId ?? null, parentWbsId: null,
        ownerId: item.ownerId ?? null, code: item.code, name: item.name.trim(),
        description: item.description?.trim() || null, weight: item.weight,
        sortOrder: item.sortOrder, status: WbsNodeStatus.ACTIVE,
        createdBy: current?.createdBy ?? context.userId, updatedBy: context.userId
      });
      wbsById.set(id, row);
      wbsByCode.set(row.code, row);
      wbsToSave.push(row);
    }
    for (const row of wbsToSave) {
      const item = wbsInputById.get(row.id)!;
      if (item.parentClientRef) {
        const parentId = wbsClientRefs.get(item.parentClientRef);
        if (!parentId) {
          issues.push(this.issue(
            'WBS_NOT_FOUND', `wbsUpserts[${input.wbsUpserts.indexOf(item)}].parentClientRef`,
            `Không tìm thấy parentClientRef ${item.parentClientRef}`
          ));
        } else {
          await this.assertPackageScope(
            context, projectId, packageScope, wbsById.get(parentId)?.packageId ?? null
          );
          touchPackage(wbsById.get(parentId)?.packageId);
          row.parentWbsId = parentId;
        }
      }
    }
    for (const [index, id] of input.archiveWbsIds.entries()) {
      const row = wbsById.get(id);
      if (!row) {
        issues.push(this.issue('WBS_NOT_FOUND', `archiveWbsIds[${index}]`, 'Không tìm thấy WBS cần archive'));
        continue;
      }
      await this.assertPackageScope(context, projectId, packageScope, row.packageId);
      touchPackage(row.packageId);
      row.status = WbsNodeStatus.ARCHIVED;
      row.updatedBy = context.userId;
      if (!wbsToSave.some((candidate) => candidate.id === row.id)) wbsToSave.push(row);
    }

    const activityById = new Map(existingActivities.map((row) => [row.id, row]));
    const activityByCode = new Map(existingActivities.map((row) => [row.code, row]));
    const activityClientRefs = new Map(existingActivities.map((row) => [row.code, row.id]));
    const activitiesToSave: ScheduleActivityEntity[] = [];
    for (const [index, item] of input.activityUpserts.entries()) {
      const current = item.id ? activityById.get(item.id) : activityByCode.get(item.code);
      if (current) {
        await this.assertPackageScope(context, projectId, packageScope, current.packageId);
      }
      await this.assertPackageScope(context, projectId, packageScope, item.packageId ?? null);
      touchPackage(current?.packageId);
      touchPackage(item.packageId);
      if (item.id && !current) {
        issues.push(this.issue(
          'ACTIVITY_NOT_FOUND', `activityUpserts[${index}].id`, 'Không tìm thấy activity cần cập nhật'
        ));
      }
      const wbsId = wbsClientRefs.get(item.wbsClientRef);
      if (!wbsId) {
        issues.push(this.issue(
          'WBS_NOT_FOUND', `activityUpserts[${index}].wbsClientRef`,
          `Không tìm thấy WBS clientRef ${item.wbsClientRef}`
        ));
      }
      if (wbsId) {
        await this.assertPackageScope(
          context, projectId, packageScope, wbsById.get(wbsId)?.packageId ?? null
        );
        touchPackage(wbsById.get(wbsId)?.packageId);
      }
      let plannedFinish = item.plannedStart;
      try {
        plannedFinish = calendar.calculatePlannedFinish(item.plannedStart, item.durationWorkDays);
        if (item.plannedFinish && item.plannedFinish !== plannedFinish) {
          issues.push(this.issue(
            'INVALID_SCHEDULE_DATE', `activityUpserts[${index}].plannedFinish`,
            `plannedFinish phải bằng ngày server tính ${plannedFinish}`
          ));
        }
      } catch (error) {
        issues.push(this.issue(
          'INVALID_SCHEDULE_DATE', `activityUpserts[${index}].plannedStart`,
          error instanceof Error ? error.message : 'Ngày kế hoạch không hợp lệ'
        ));
      }
      const id = current?.id ?? item.id ?? randomUUID();
      if (activityClientRefs.has(item.clientRef) && activityClientRefs.get(item.clientRef) !== id) {
        issues.push(this.issue(
          'DUPLICATE_CLIENT_REF', `activityUpserts[${index}].clientRef`,
          `clientRef ${item.clientRef} bị trùng`
        ));
      }
      activityClientRefs.set(item.clientRef, id);
      const row = activityRepository.create({
        ...(current ?? {}), id, tenantId: context.tenantId, projectId, scheduleId,
        wbsId: wbsId ?? randomUUID(), packageId: item.packageId ?? null,
        ownerId: item.ownerId, code: item.code, name: item.name.trim(),
        activityType: item.activityType === 'TASK' ? ActivityType.TASK : ActivityType.MILESTONE,
        weight: item.weight,
        plannedStart: item.plannedStart.slice(0, 10), plannedFinish,
        forecastStart: current?.forecastStart ?? null, forecastFinish: current?.forecastFinish ?? null,
        actualStart: current?.actualStart ?? null, actualFinish: current?.actualFinish ?? null,
        durationWorkDays: item.durationWorkDays,
        remainingDurationWorkDays: current?.remainingDurationWorkDays ?? item.durationWorkDays,
        percentComplete: current?.percentComplete ?? '0.00',
        status: current?.status ?? ActivityStatus.DRAFT,
        createdBy: current?.createdBy ?? context.userId, updatedBy: context.userId
      });
      activityById.set(id, row);
      activityByCode.set(row.code, row);
      activitiesToSave.push(row);
    }
    for (const [index, id] of input.archiveActivityIds.entries()) {
      const row = activityById.get(id);
      if (!row) {
        issues.push(this.issue(
          'ACTIVITY_NOT_FOUND', `archiveActivityIds[${index}]`, 'Không tìm thấy activity cần archive'
        ));
        continue;
      }
      await this.assertPackageScope(context, projectId, packageScope, row.packageId);
      touchPackage(row.packageId);
      row.status = ActivityStatus.CANCELLED;
      row.updatedBy = context.userId;
      if (!activitiesToSave.some((candidate) => candidate.id === row.id)) activitiesToSave.push(row);
    }

    const dependencyById = new Map(existingDependencies.map((row) => [row.id, row]));
    const dependencyIdsToDelete: string[] = [];
    for (const [index, id] of input.unlinkDependencyIds.entries()) {
      if (!dependencyById.has(id)) {
        issues.push(this.issue(
          'DEPENDENCY_NOT_FOUND', `unlinkDependencyIds[${index}]`, 'Không tìm thấy dependency cần unlink'
        ));
      } else {
        const original = dependencyById.get(id)!;
        await this.assertDependencyScope(
          context, projectId, packageScope, original, originalActivityById
        );
        dependencyIdsToDelete.push(id);
        dependencyById.delete(id);
      }
    }
    const dependenciesToSave: ActivityDependencyEntity[] = [];
    for (const [index, item] of input.dependencyUpserts.entries()) {
      const predecessorId = activityClientRefs.get(item.predecessorClientRef);
      const successorId = activityClientRefs.get(item.successorClientRef);
      if (!predecessorId) {
        issues.push(this.issue(
          'ACTIVITY_NOT_FOUND', `dependencyUpserts[${index}].predecessorClientRef`,
          `Không tìm thấy predecessor ${item.predecessorClientRef}`
        ));
      }
      if (!successorId) {
        issues.push(this.issue(
          'ACTIVITY_NOT_FOUND', `dependencyUpserts[${index}].successorClientRef`,
          `Không tìm thấy successor ${item.successorClientRef}`
        ));
      }
      if (predecessorId) {
        await this.assertPackageScope(
          context, projectId, packageScope,
          activityById.get(predecessorId)?.packageId ?? null
        );
        touchPackage(activityById.get(predecessorId)?.packageId);
      }
      if (successorId) {
        await this.assertPackageScope(
          context, projectId, packageScope,
          activityById.get(successorId)?.packageId ?? null
        );
        touchPackage(activityById.get(successorId)?.packageId);
      }
      const current = item.id ? dependencyById.get(item.id) : undefined;
      if (current) {
        await this.assertDependencyScope(
          context, projectId, packageScope, current, originalActivityById
        );
      }
      if (item.id && !current) {
        issues.push(this.issue(
          'DEPENDENCY_NOT_FOUND', `dependencyUpserts[${index}].id`,
          'Không tìm thấy dependency cần cập nhật'
        ));
      }
      const row = dependencyRepository.create({
        ...(current ?? {}), id: current?.id ?? item.id ?? randomUUID(),
        tenantId: context.tenantId, projectId, scheduleId,
        predecessorId: predecessorId ?? randomUUID(), successorId: successorId ?? randomUUID(),
        dependencyType: this.dependencyType(item.dependencyType),
        lagWorkDays: item.lagWorkDays,
        createdBy: current?.createdBy ?? context.userId, updatedBy: context.userId
      });
      dependencyById.set(row.id, row);
      dependenciesToSave.push(row);
    }

    const activeWbs = [...wbsById.values()].filter((row) => row.status === WbsNodeStatus.ACTIVE);
    const activeActivities = [...activityById.values()].filter((row) => row.status !== ActivityStatus.CANCELLED);
    const activeActivityIds = new Set(activeActivities.map((row) => row.id));
    const activeDependencies = [...dependencyById.values()].filter((row) => (
      activeActivityIds.has(row.predecessorId) && activeActivityIds.has(row.successorId)
    ));
    const referencedPackageIds = new Set([
      ...activeWbs.map((row) => row.packageId),
      ...activeActivities.map((row) => row.packageId)
    ].filter((id): id is string => Boolean(id)));
    const packageIdsToValidate = packageScope ? touchedPackageIds : referencedPackageIds;
    for (const packageId of packageIdsToValidate) {
      const packageRow = packageById.get(packageId);
      if (!packageRow || packageRow.status !== PackageStatus.ACTIVE) {
        issues.push(this.issue('PACKAGE_NOT_FOUND', 'packageId', `Package ${packageId} không hợp lệ`));
      }
    }
    const ownerIds = [...new Set([
      ...activeWbs.map((row) => row.ownerId),
      ...activeActivities.map((row) => row.ownerId)
    ].filter((id): id is string => Boolean(id)))];
    const knownOwners = ownerIds.length
      ? await userRepository.findBy({ tenantId: context.tenantId, id: In(ownerIds) }) : [];
    const knownOwnerIds = new Set(knownOwners.map((row) => row.id));
    for (const ownerId of ownerIds) {
      if (!knownOwnerIds.has(ownerId)) {
        issues.push(this.issue('USER_NOT_FOUND', 'ownerId', `Owner ${ownerId} không thuộc tenant`));
      }
    }
    for (const row of activeWbs) {
      if (!row.parentWbsId) continue;
      const parent = wbsById.get(row.parentWbsId);
      if (parent && parent.packageId && row.packageId && parent.packageId !== row.packageId) {
        issues.push(this.issue(
          'WBS_SCOPE_MISMATCH', `wbsNodes[${row.id}].parentWbsId`,
          'WBS cha và con phải thuộc cùng package khi cả hai có package'
        ));
      }
    }
    for (const row of activeActivities) {
      const activityWbs = wbsById.get(row.wbsId);
      if (activityWbs && activityWbs.packageId !== row.packageId) {
        issues.push(this.issue(
          'ACTIVITY_WBS_SCOPE_MISMATCH', `activities[${row.id}].wbsId`,
          'Activity và WBS phải thuộc cùng package'
        ));
      }
    }
    const validation = this.validateState(
      calendar, activeWbs, activeActivities, activeDependencies, 'DRAFT'
    );
    issues.push(...validation.issues);
    return {
      schedule, scheduleId, calendar,
      wbsNodes: [...wbsById.values()], activities: [...activityById.values()],
      dependencies: [...dependencyById.values()], wbsToSave, activitiesToSave,
      dependenciesToSave, dependencyIdsToDelete, packageScope, sourceHash,
      issues: this.uniqueIssues(issues),
      criticalPath: validation.criticalPath
    };
  }

  private async commitDraft(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: ApplyScheduleDraftDto, prepared: PreparedDraft
  ): Promise<number> {
    const scheduleRepository = manager.getRepository(ProjectScheduleEntity);
    let version: number;
    if (!prepared.schedule) {
      const created = await scheduleRepository.save({
        id: prepared.scheduleId, tenantId: context.tenantId, projectId,
        timezone: input.calendar.timezone, calendarCode: input.calendar.calendarCode,
        workingWeek: [...input.calendar.workingWeek],
        calendarExceptions: input.calendar.exceptions.map((row) => ({ ...row })),
        dataDate: this.currentDate(input.calendar.timezone),
        status: ProjectScheduleStatus.DRAFT,
        sourceFormat: this.sourceFormat(input.source.format),
        sourceName: input.source.sourceName.trim(), sourceHash: prepared.sourceHash,
        createdBy: context.userId, updatedBy: context.userId
      });
      version = created.versionNo;
    } else {
      version = prepared.schedule.versionNo + 1;
    }
    if (prepared.dependencyIdsToDelete.length) {
      await manager.getRepository(ActivityDependencyEntity).delete({
        tenantId: context.tenantId, id: In(prepared.dependencyIdsToDelete)
      });
    }
    const orderedWbs = this.orderWbsParentsFirst(prepared.wbsToSave, prepared.wbsNodes);
    if (orderedWbs.length) await manager.getRepository(WbsNodeEntity).save(orderedWbs);
    if (prepared.activitiesToSave.length) {
      await manager.getRepository(ScheduleActivityEntity).save(prepared.activitiesToSave);
    }
    if (prepared.dependenciesToSave.length) {
      await manager.getRepository(ActivityDependencyEntity).save(prepared.dependenciesToSave);
    }
    if (prepared.schedule) {
      const result = await scheduleRepository.createQueryBuilder().update(ProjectScheduleEntity)
        .set({
          timezone: input.calendar.timezone,
          calendarCode: input.calendar.calendarCode,
          workingWeek: [...input.calendar.workingWeek],
          calendarExceptions: input.calendar.exceptions.map((row) => ({ ...row })),
          status: ProjectScheduleStatus.DRAFT,
          sourceFormat: this.sourceFormat(input.source.format),
          sourceName: input.source.sourceName.trim(),
          sourceHash: prepared.sourceHash,
          updatedBy: context.userId,
          versionNo: () => '"version_no" + 1'
        })
        .where('id = :id AND tenant_id = :tenantId AND project_id = :projectId AND version_no = :version', {
          id: prepared.schedule.id, tenantId: context.tenantId, projectId,
          version: input.expectedVersion
        })
        .execute();
      if (result.affected !== 1) throw this.versionConflict(input.expectedVersion);
    }
    return version;
  }

  private validateState(
    calendar: DayLevelCalendar, wbs: WbsNodeEntity[], activities: ScheduleActivityEntity[],
    dependencies: ActivityDependencyEntity[], mode: 'DRAFT' | 'SUBMIT'
  ): { issues: ValidationIssue[]; criticalPath: CriticalPathResult | null } {
    const issues: ValidationIssue[] = [];
    const weight = validateScheduleWeights(wbs.map((row) => ({
      id: row.id, parentWbsId: row.parentWbsId, weight: row.weight
    })), activities.map((row) => ({
      id: row.id, wbsId: row.wbsId, weight: row.weight
    })), mode);
    issues.push(...weight.issues.map((entry) => this.issue(entry.code, entry.path, entry.message)));
    let criticalPath: CriticalPathResult | null = null;
    try {
      criticalPath = calculateCriticalPath(activities.map((row) => ({
        id: row.id, tenantId: row.tenantId, projectId: row.projectId,
        scheduleId: row.scheduleId, activityType: row.activityType,
        plannedStart: row.plannedStart, plannedFinish: row.plannedFinish,
        durationWorkDays: row.durationWorkDays
      })), dependencies.map((row) => ({
        predecessorId: row.predecessorId, successorId: row.successorId,
        dependencyType: row.dependencyType, lagWorkDays: row.lagWorkDays
      })), {
        timezone: calendar.timezone,
        workingWeek: calendar.workingWeek,
        exceptions: calendar.exceptions
      }, {
        nearCriticalFloatDays: this.config.schedule.nearCriticalFloatDays,
        maxAbsoluteLagDays: this.config.schedule.maxAbsoluteLagDays,
        scope: activities[0] ? {
          tenantId: activities[0].tenantId,
          projectId: activities[0].projectId,
          scheduleId: activities[0].scheduleId
        } : undefined
      });
      const activityById = new Map(activities.map((row) => [row.id, row]));
      for (const metric of criticalPath.metricsByActivity.values()) {
        const activity = activityById.get(metric.activityId)!;
        if (
          metric.earlyStart !== activity.plannedStart
          || metric.earlyFinish !== activity.plannedFinish
        ) {
          issues.push(this.issue(
            'DEPENDENCY_DATE_CONFLICT', `activities[${activity.id}].plannedStart`,
            `Dependency yêu cầu ${metric.earlyStart}…${metric.earlyFinish}, không khớp ngày kế hoạch đã khai báo`
          ));
        }
      }
    } catch (error) {
      if (error instanceof CriticalPathValidationError) {
        issues.push(...error.issues.map((entry) => this.issue(entry.code, entry.path, entry.message)));
      } else throw error;
    }
    return { issues: this.uniqueIssues(issues), criticalPath };
  }

  private calculateScheduleProgress(
    calendar: DayLevelCalendar, wbs: WbsNodeEntity[], activities: ScheduleActivityEntity[],
    dataDate: string, normalizeToVisibleScope = false
  ): { plannedProgress: string; actualProgress: string; spi: string | null } {
    try {
      const result = calculateProgress(activities.map((row) => ({
        id: row.id, activityType: row.activityType, wbsId: row.wbsId,
        weight: row.weight, plannedStart: row.plannedStart,
        durationWorkDays: row.durationWorkDays, percentComplete: row.percentComplete
      })), dataDate, {
        timezone: calendar.timezone,
        workingWeek: calendar.workingWeek,
        exceptions: calendar.exceptions
      }, wbs.map((row) => ({
        id: row.id, parentWbsId: row.parentWbsId, weight: row.weight
      })));
      const visibleWeight = result.activityMetrics.reduce(
        (sum, metric) => sum + Number(metric.effectiveWeight), 0
      );
      const normalized = (value: string) => normalizeToVisibleScope && visibleWeight > 0
        ? (Number(value) / visibleWeight * 100).toFixed(4) : value;
      return {
        plannedProgress: normalized(result.plannedProgress),
        actualProgress: normalized(result.actualProgress),
        spi: result.spi
      };
    } catch (error) {
      if (error instanceof ProgressCalculationError) {
        throw new UnprocessableEntityException({
          code: 'SCHEDULE_VALIDATION_FAILED', message: 'Không thể tính progress schedule',
          retryable: false, issues: error.issues
        });
      }
      throw error;
    }
  }

  private baselineSnapshot(
    schedule: ProjectScheduleEntity, wbs: WbsNodeEntity[], activities: ScheduleActivityEntity[],
    dependencies: ActivityDependencyEntity[], scheduleVersion = schedule.versionNo
  ): Record<string, unknown> {
    return {
      schemaVersion: 1,
      schedule: {
        id: schedule.id, projectId: schedule.projectId, timezone: schedule.timezone,
        calendarCode: schedule.calendarCode, workingWeek: schedule.workingWeek,
        exceptions: schedule.calendarExceptions, versionNo: scheduleVersion
      },
      wbsNodes: [...wbs].sort((left, right) => left.code.localeCompare(right.code)).map((row) => ({
        id: row.id, code: row.code, name: row.name, parentWbsId: row.parentWbsId,
        packageId: row.packageId, ownerId: row.ownerId, weight: row.weight,
        sortOrder: row.sortOrder
      })),
      activities: [...activities].sort((left, right) => left.code.localeCompare(right.code)).map((row) => ({
        id: row.id, code: row.code, name: row.name, wbsId: row.wbsId,
        packageId: row.packageId, ownerId: row.ownerId, activityType: row.activityType,
        weight: row.weight, plannedStart: row.plannedStart, plannedFinish: row.plannedFinish,
        durationWorkDays: row.durationWorkDays
      })),
      dependencies: [...dependencies].sort((left, right) => (
        left.predecessorId.localeCompare(right.predecessorId)
        || left.successorId.localeCompare(right.successorId)
        || left.dependencyType.localeCompare(right.dependencyType)
      )).map((row) => ({
        id: row.id, predecessorId: row.predecessorId, successorId: row.successorId,
        dependencyType: row.dependencyType, lagWorkDays: row.lagWorkDays
      }))
    };
  }

  private calculateForecastPath(
    calendar: DayLevelCalendar,
    activities: ScheduleActivityEntity[],
    dependencies: ActivityDependencyEntity[],
    dataDate: string
  ): ReadonlyMap<string, { earlyStart: string; earlyFinish: string }> {
    if (activities.length === 0) return new Map();
    const reportingStart = calendar.isWorkingDay(dataDate)
      ? dataDate : calendar.addWorkdays(dataDate, 1);
    const result = calculateCriticalPath(activities.map((row) => {
      const complete = row.status === ActivityStatus.COMPLETE || Number(row.percentComplete) === 100;
      const candidateStart = complete
        ? row.actualFinish ?? row.plannedFinish
        : row.actualStart || row.plannedStart <= reportingStart
          ? reportingStart : row.plannedStart;
      const plannedStart = calendar.isWorkingDay(candidateStart)
        ? candidateStart : calendar.addWorkdays(candidateStart, 1);
      return {
        id: row.id, tenantId: row.tenantId, projectId: row.projectId,
        scheduleId: row.scheduleId,
        activityType: complete || row.activityType === ActivityType.MILESTONE
          ? 'MILESTONE' as const : 'TASK' as const,
        plannedStart,
        durationWorkDays: complete || row.activityType === ActivityType.MILESTONE
          ? 0 : Math.max(1, row.remainingDurationWorkDays)
      };
    }), dependencies.map((row) => ({
      predecessorId: row.predecessorId, successorId: row.successorId,
      dependencyType: row.dependencyType, lagWorkDays: row.lagWorkDays
    })), {
      timezone: calendar.timezone,
      workingWeek: calendar.workingWeek,
      exceptions: calendar.exceptions
    }, {
      nearCriticalFloatDays: this.config.schedule.nearCriticalFloatDays,
      maxAbsoluteLagDays: this.config.schedule.maxAbsoluteLagDays,
      scope: activities[0] ? {
        tenantId: activities[0].tenantId,
        projectId: activities[0].projectId,
        scheduleId: activities[0].scheduleId
      } : undefined
    });
    return result.metricsByActivity;
  }

  private hashCanonical(value: unknown): string {
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

  private calendar(schedule: ProjectScheduleEntity): DayLevelCalendar {
    try {
      return new DayLevelCalendar({
        timezone: schedule.timezone, workingWeek: schedule.workingWeek,
        exceptions: schedule.calendarExceptions
      });
    } catch (error) {
      throw new UnprocessableEntityException({
        code: 'INVALID_CALENDAR',
        message: error instanceof Error ? error.message : 'Calendar không hợp lệ',
        retryable: false
      });
    }
  }

  private currentDate(timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  private orderWbsParentsFirst(rows: WbsNodeEntity[], all: WbsNodeEntity[]): WbsNodeEntity[] {
    const byId = new Map(all.map((row) => [row.id, row]));
    const depth = (row: WbsNodeEntity): number => {
      let current = row;
      let result = 0;
      const seen = new Set<string>();
      while (current.parentWbsId && !seen.has(current.parentWbsId)) {
        seen.add(current.parentWbsId);
        const parent = byId.get(current.parentWbsId);
        if (!parent) break;
        result += 1;
        current = parent;
      }
      return result;
    };
    return [...rows].sort((left, right) => depth(left) - depth(right) || left.code.localeCompare(right.code));
  }

  private draftResult(
    mode: DraftModeDto, committed: boolean, scheduleVersion: number | null,
    validationIssues: ValidationIssue[]
  ) {
    return {
      mode, committed, scheduleVersion, validationIssues,
      calculatedAt: new Date().toISOString(), formulaVersion: CPM_FORMULA_VERSION
    };
  }

  private packageView(row: PackageEntity) {
    return {
      id: row.id, projectId: row.projectId, parentPackageId: row.parentPackageId,
      contractorCompanyId: row.contractorCompanyId, code: row.code, name: row.name,
      packageType: row.packageType, status: row.status, versionNo: row.versionNo
    };
  }

  private wbsView(row: WbsNodeEntity) {
    return {
      id: row.id, packageId: row.packageId, parentWbsId: row.parentWbsId,
      ownerId: row.ownerId, code: row.code, name: row.name, description: row.description,
      weight: row.weight, sortOrder: row.sortOrder, status: row.status, versionNo: row.versionNo
    };
  }

  private activityView(
    row: ScheduleActivityEntity,
    metric?: { totalFloatWorkDays: number; critical: boolean; nearCritical: boolean },
    forecastMetric?: { earlyStart: string; earlyFinish: string }
  ) {
    const complete = row.status === ActivityStatus.COMPLETE || Number(row.percentComplete) === 100;
    return {
      id: row.id, wbsId: row.wbsId, packageId: row.packageId, ownerId: row.ownerId,
      code: row.code, name: row.name, activityType: row.activityType, weight: row.weight,
      plannedStart: row.plannedStart, plannedFinish: row.plannedFinish,
      forecastStart: complete
        ? row.actualStart ?? row.forecastStart
        : forecastMetric?.earlyStart ?? row.forecastStart,
      forecastFinish: complete
        ? row.actualFinish ?? row.forecastFinish
        : forecastMetric?.earlyFinish ?? row.forecastFinish,
      actualStart: row.actualStart, actualFinish: row.actualFinish,
      durationWorkDays: row.durationWorkDays,
      remainingDurationWorkDays: row.remainingDurationWorkDays,
      percentComplete: row.percentComplete, status: row.status,
      totalFloatWorkDays: metric?.totalFloatWorkDays ?? 0,
      critical: metric?.critical ?? false, nearCritical: metric?.nearCritical ?? false,
      versionNo: row.versionNo
    };
  }

  private dependencyView(row: ActivityDependencyEntity) {
    return {
      id: row.id, predecessorId: row.predecessorId, successorId: row.successorId,
      dependencyType: row.dependencyType, lagWorkDays: row.lagWorkDays
    };
  }

  private assertBaselineRequestShape(input: SubmitScheduleBaselineDto): void {
    const initial = input.baselineType === BaselineTypeDto.INITIAL;
    const valid = initial
      ? typeof input.reason === 'string'
        && typeof input.impactSummary === 'string'
        && input.approvedChangeRequestId === undefined
      : typeof input.approvedChangeRequestId === 'string'
        && input.reason === undefined
        && input.impactSummary === undefined;
    if (!valid) {
      throw new BadRequestException({
        code: 'BASELINE_REQUEST_INVALID',
        message: initial
          ? 'INITIAL chỉ nhận reason và impactSummary'
          : 'REBASELINE chỉ nhận approvedChangeRequestId; provenance do server resolve',
        retryable: false
      });
    }
  }

  private baselineView(row: ScheduleBaselineEntity) {
    return {
      id: row.id, baselineNumber: row.baselineNumber, baselineType: row.baselineType,
      status: row.status, dataDate: row.dataDate, snapshotHash: row.snapshotHash,
      reason: row.reason, impactSummary: row.impactSummary,
      approvedChangeRequestId: row.approvedChangeRequestId,
      replacesBaselineId: row.replacesBaselineId,
      createdBy: row.createdBy, submittedBy: row.submittedBy,
      submittedAt: row.submittedAt,
      approvedBy: row.approvedBy, approvedAt: row.approvedAt,
      decisionComment: row.decisionComment,
      versionNo: row.versionNo
    };
  }

  private progressView(row: ProgressUpdateEntity) {
    return {
      id: row.id, activityId: row.activityId, dataDate: row.dataDate,
      percentComplete: row.percentComplete,
      remainingDurationWorkDays: row.remainingDurationWorkDays,
      correctionOfId: row.correctionOfId, recordedAt: row.recordedAt
    };
  }

  private progressDetailView(row: ProgressUpdateEntity) {
    return {
      ...this.progressView(row),
      quantity: row.quantity,
      unit: row.unit,
      actualStart: row.actualStart,
      actualFinish: row.actualFinish,
      evidenceRefs: row.evidenceRefs,
      note: row.note,
      reason: row.reason,
      recordedBy: row.recordedBy
    };
  }

  private notificationView(row: ScheduleNotificationEntity) {
    return {
      id: row.id, activityId: row.activityId,
      alertType: row.alertType as AlertType, dataDate: row.dataDate,
      priority: row.priority, dueAt: row.dueAt, thresholdVersion: row.thresholdVersion
    };
  }

  private calendarView(row: ProjectScheduleEntity) {
    return {
      timezone: row.timezone, calendarCode: row.calendarCode,
      workingWeek: row.workingWeek, exceptions: row.calendarExceptions
    };
  }

  private snapshotFinish(
    snapshot: Record<string, unknown> | null,
    packageScope: readonly string[] | null = null
  ): string | null {
    if (!snapshot || !Array.isArray(snapshot.activities)) return null;
    const dates = snapshot.activities
      .filter((value) => {
        if (!packageScope) return true;
        if (!value || typeof value !== 'object') return false;
        const packageId = (value as { packageId?: unknown }).packageId;
        return typeof packageId === 'string' && packageScope.includes(packageId);
      })
      .map((value) => value && typeof value === 'object'
        ? (value as { plannedFinish?: unknown }).plannedFinish : null)
      .filter((value): value is string => typeof value === 'string')
      .sort((left, right) => right.localeCompare(left));
    return dates[0] ?? null;
  }

  private safeWorkdayDistance(
    calendar: DayLevelCalendar, from: string, to: string
  ): number | null {
    try {
      return calendar.workdayDistance(from, to);
    } catch {
      return null;
    }
  }

  private progressSourceKey(
    context: RequestContext, projectId: string, activityId: string, idempotencyKey: string
  ): string {
    return `progress:${createHash('sha256').update([
      context.tenantId, context.userId, projectId, activityId, idempotencyKey
    ].join(':')).digest('hex')}`;
  }

  private dependencyType(value: string): DependencyType {
    const mapping: Record<string, DependencyType> = {
      FS: DependencyType.FS,
      SS: DependencyType.SS,
      FF: DependencyType.FF,
      SF: DependencyType.SF
    };
    return mapping[value];
  }

  private sourceFormat(value: DraftSourceFormatDto): ScheduleSourceFormat {
    switch (value) {
      case DraftSourceFormatDto.MANUAL: return ScheduleSourceFormat.MANUAL;
      case DraftSourceFormatDto.CANONICAL_CSV: return ScheduleSourceFormat.CANONICAL_CSV;
      case DraftSourceFormatDto.CANONICAL_JSON: return ScheduleSourceFormat.CANONICAL_JSON;
    }
  }

  private async requireProject(tenantId: string, projectId: string): Promise<ProjectEntity> {
    return this.requireTenantEntity(
      this.projects, tenantId, projectId, 'PROJECT_NOT_FOUND', 'Không tìm thấy dự án'
    );
  }

  private async requireMutableProject(
    manager: EntityManager, tenantId: string, projectId: string
  ): Promise<ProjectEntity> {
    const row = await this.requireTenantEntity(
      manager.getRepository(ProjectEntity), tenantId, projectId,
      'PROJECT_NOT_FOUND', 'Không tìm thấy dự án'
    );
    this.assertProjectMutable(row);
    return row;
  }

  private assertProjectMutable(project: ProjectEntity): void {
    if ([
      ProjectRecordStatus.ARCHIVED, ProjectRecordStatus.CLOSED, ProjectRecordStatus.CANCELLED
    ].includes(project.recordStatus)) {
      throw new ConflictException({
        code: 'PROJECT_NOT_MUTABLE',
        message: 'Schedule không được thay đổi khi project đã đóng, hủy hoặc archive',
        retryable: false
      });
    }
  }

  private async requireTenantEntity<T extends { id: string; tenantId: string }>(
    repository: Repository<T>, tenantId: string, id: string, code: string, message: string
  ): Promise<T> {
    const row = await repository.findOneBy({ id, tenantId } as never);
    if (!row) throw this.notFound(code, message);
    return row;
  }

  private async requireTenantProjectEntity<T extends { id: string; tenantId: string; projectId: string }>(
    repository: Repository<T>, tenantId: string, projectId: string, id: string,
    code: string, message: string
  ): Promise<T> {
    const row = await repository.findOneBy({ id, tenantId, projectId } as never);
    if (!row) throw this.notFound(code, message);
    return row;
  }

  private async denyScope(
    context: RequestContext, objectType: string, objectId: string | null,
    reasonCode = 'PERMISSION_DENIED'
  ): Promise<never> {
    await this.audits.save({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: 'AUTHORIZATION_CHECK', result: 'DENIED', reasonCode,
      correlationId: context.correlationId, ipHash: null,
      objectType, objectId, payload: { enforcement: 'SERVICE_SCOPE' }
    }).catch(() => undefined);
    throw new ForbiddenException({
      code: reasonCode,
      message: reasonCode === 'BASELINE_SELF_APPROVAL_DENIED'
        ? 'Người tạo hoặc submit không được duyệt baseline của chính mình'
        : 'Bạn không có quyền trong project/package này',
      retryable: false
    });
  }

  private async assertPackageScope(
    context: RequestContext, projectId: string,
    allowedPackageIds: readonly string[] | null, ...packageIds: Array<string | null>
  ): Promise<void> {
    if (!allowedPackageIds) return;
    if (packageIds.some((packageId) => (
      packageId === null || !allowedPackageIds.includes(packageId)
    ))) await this.denyScope(context, 'PROJECT', projectId);
  }

  private async assertDependencyScope(
    context: RequestContext, projectId: string,
    allowedPackageIds: readonly string[] | null,
    dependency: ActivityDependencyEntity,
    activities: ReadonlyMap<string, ScheduleActivityEntity>
  ): Promise<void> {
    await this.assertPackageScope(
      context, projectId, allowedPackageIds,
      activities.get(dependency.predecessorId)?.packageId ?? null,
      activities.get(dependency.successorId)?.packageId ?? null
    );
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message, retryable: false });
  }

  private versionConflict(currentVersion: number): ConflictException {
    return new ConflictException({
      code: 'VERSION_CONFLICT', message: 'Schedule đã được cập nhật bởi yêu cầu khác',
      retryable: true, currentVersion
    });
  }

  private issue(code: string, path: string, message: string): ValidationIssue {
    return { code, path, row: null, severity: 'ERROR', message };
  }

  private validateDraftInputUniqueness(input: ApplyScheduleDraftDto): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const collect = (
      values: Array<{ value: string | undefined; path: string }>, code: string
    ) => {
      const seen = new Set<string>();
      for (const entry of values) {
        if (!entry.value) continue;
        if (seen.has(entry.value)) {
          issues.push(this.issue(code, entry.path, `Giá trị ${entry.value} bị trùng trong batch`));
        }
        seen.add(entry.value);
      }
    };
    collect(input.wbsUpserts.map((row, index) => ({
      value: row.id, path: `wbsUpserts[${index}].id`
    })), 'DUPLICATE_ENTITY_ID');
    collect(input.wbsUpserts.map((row, index) => ({
      value: row.code, path: `wbsUpserts[${index}].code`
    })), 'DUPLICATE_CODE');
    collect(input.wbsUpserts.map((row, index) => ({
      value: row.clientRef, path: `wbsUpserts[${index}].clientRef`
    })), 'DUPLICATE_CLIENT_REF');
    collect(input.activityUpserts.map((row, index) => ({
      value: row.id, path: `activityUpserts[${index}].id`
    })), 'DUPLICATE_ENTITY_ID');
    collect(input.activityUpserts.map((row, index) => ({
      value: row.code, path: `activityUpserts[${index}].code`
    })), 'DUPLICATE_CODE');
    collect(input.activityUpserts.map((row, index) => ({
      value: row.clientRef, path: `activityUpserts[${index}].clientRef`
    })), 'DUPLICATE_CLIENT_REF');
    collect(input.dependencyUpserts.map((row, index) => ({
      value: row.id, path: `dependencyUpserts[${index}].id`
    })), 'DUPLICATE_ENTITY_ID');
    return issues;
  }

  private draftSourcePayload(input: ApplyScheduleDraftDto): Record<string, unknown> {
    return {
      schemaVersion: 1,
      calendar: input.calendar,
      wbsUpserts: input.wbsUpserts,
      activityUpserts: input.activityUpserts,
      dependencyUpserts: input.dependencyUpserts,
      archiveWbsIds: input.archiveWbsIds,
      archiveActivityIds: input.archiveActivityIds,
      unlinkDependencyIds: input.unlinkDependencyIds
    };
  }

  private uniqueIssues(issues: ValidationIssue[]): ValidationIssue[] {
    const seen = new Set<string>();
    return issues.filter((issue) => {
      const key = `${issue.code}:${issue.path}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private visibleValidationIssues(
    issues: ValidationIssue[], packageScope: readonly string[] | null,
    wbs: WbsNodeEntity[], activities: ScheduleActivityEntity[]
  ): ValidationIssue[] {
    if (!packageScope) return issues;
    const visibleIds = new Set([
      ...wbs.map((row) => row.id),
      ...activities.map((row) => row.id)
    ]);
    return issues.filter((issue) => (
      issue.path === 'calendar'
      || [...visibleIds].some((id) => issue.path.includes(id))
    )).map((issue) => ({
      ...issue,
      message: issue.path === 'calendar'
        ? issue.message : 'Record trong package được phép chưa hợp lệ'
    }));
  }

  private visiblePreparedIssues(prepared: PreparedDraft): ValidationIssue[] {
    if (!prepared.packageScope) return prepared.issues;
    const visibleWbs = prepared.wbsNodes.filter((row) => (
      row.packageId !== null && prepared.packageScope!.includes(row.packageId)
    ));
    const visibleActivities = prepared.activities.filter((row) => (
      row.packageId !== null && prepared.packageScope!.includes(row.packageId)
    ));
    const inputPath = /^(source|calendar|wbsUpserts|activityUpserts|dependencyUpserts|archiveWbsIds|archiveActivityIds|unlinkDependencyIds)(\.|\[|$)/;
    const visibleIds = new Set([
      ...visibleWbs.map((row) => row.id),
      ...visibleActivities.map((row) => row.id)
    ]);
    return prepared.issues.filter((issue) => (
      inputPath.test(issue.path)
      || [...visibleIds].some((id) => issue.path.includes(id))
    )).map((issue) => ({
      ...issue,
      message: issue.path === 'calendar' || issue.path.startsWith('source')
        ? issue.message : 'Dữ liệu trong package được phép chưa hợp lệ'
    }));
  }

  private rethrowUnique(error: unknown, code: string, message: string): never {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ConflictException({ code, message, retryable: false });
    }
    throw error;
  }

  private async recordMutation(
    manager: EntityManager, context: RequestContext,
    event: {
      action: string;
      objectType: string;
      objectId: string;
      aggregateVersion: number;
      eventType?: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await manager.getRepository(AuditEventEntity).save({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: event.action, result: 'SUCCESS', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: event.objectType, objectId: event.objectId, payload: event.payload
    });
    await this.outbox.append(manager, context, {
      aggregateType: event.objectType, aggregateId: event.objectId,
      aggregateVersion: event.aggregateVersion, eventType: event.eventType ?? event.action,
      payload: event.payload
    });
  }
}
