import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository, type EntityManager } from 'typeorm';
import {
  CompanyEntity, DailyLogEntity, DailyLogStatus, HseIncidentEntity, HseIncidentStatus,
  PackageEntity, PermitToWorkEntity, PermitToWorkStatus, ProjectEntity,
  QuantityProgressRecordEntity, SiteEntity, StopWorkAction, StopWorkActionEntity,
  StopWorkTargetType, UserAccountEntity, WbsNodeEntity, WorkfrontEntity, WorkfrontReadiness,
  WorkfrontStatus
} from '../../database/entities';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { canonicalHash } from '../risk-change/domain/canonical-hash';
import { decodeFieldHseQualityCursor, encodeFieldHseQualityCursor } from './domain/cursor';
import {
  assertVersion, conflict, emit, forbidden, inScope, notFound, type RequestContext,
  unprocessable, withConstraintMap
} from './domain/support';
import type {
  CreateDailyLogDto, CreatePermitToWorkDto, IssuePermitToWorkDto, RecordQuantityProgressDto,
  ReleaseWorkfrontDto, ReportHseIncidentDto, StopWorkActionDto, SubmitDailyLogDto,
  WorkfrontListQueryDto
} from './dto/field-hse-quality.dto';

/** What an unlifted stop-work would have to cover to block an operation. */
interface StopWorkCoverage {
  projectId: string;
  siteId?: string;
  workfrontId?: string;
  permitId?: string;
}

/**
 * Field & HSE operations (API-086…API-094).
 *
 * The rules this half of the module is built around:
 * - SAFETY FAILS CLOSED. Workfront release and permit issue consult the stop-work ledger; an
 *   unlifted ISSUE covering the project/site/workfront/permit refuses the operation — and if the
 *   ledger cannot be read, the answer is the same refusal, never a shrug.
 * - INCIDENT REPORTING IS NEVER GATED. API-093 can fail only as 400 (validation), 404 (invisible
 *   project), 409 (idempotency) or 500. No aggregate state — stop-work, permit, workfront, another
 *   incident — is ever consulted.
 * - `restricted_facts` NEVER LEAVES THE ROW. Responses, audit events and outbox payloads carry ids
 *   and classification only (SEC-130).
 * - Out of ABAC scope is indistinguishable from missing: 404, never 403.
 */
@Injectable()
export class FieldOperationsService {
  constructor(
    @InjectRepository(WorkfrontEntity)
    private readonly workfronts: Repository<WorkfrontEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-086 — the workfront/readiness register with the ABAC reach applied in SQL. */
  async listWorkfronts(
    context: RequestContext, projectId: string, query: WorkfrontListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'workfront.read');
    await this.assertProjectVisible(this.workfronts.manager, context, projectId, scope);
    const cursor = decodeFieldHseQualityCursor(query.cursor);
    const builder = this.workfronts.createQueryBuilder('workfront')
      .where('workfront.tenantId = :tenantId AND workfront.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    if (!scope.tenantWide && !scope.projectIds.includes(projectId)) {
      // Package-scoped reach only: the row filter is part of the SQL, not post-pagination pruning.
      builder.andWhere('workfront.packageId IN (:...packageIds)', {
        packageIds: scope.packageIds
      });
    }
    if (query.status) builder.andWhere('workfront.status = :status', { status: query.status });
    if (cursor) {
      // Compared row-wise against what `workfronts` actually stores. The naive
      // `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)` silently loses
      // rows: Postgres keeps `timestamptz` at microsecond precision while the JS `Date` behind the
      // encoded cursor only carries milliseconds, so a row with sub-millisecond digits satisfies
      // neither branch and vanishes from the next page — and a batch created under one `now()` puts
      // a whole group on the boundary. `(created_at, id) < (…)` stays index-drivable; the old
      // comparison survives only as a fallback for a cursor whose row is gone.
      builder.andWhere(
        `((workfront.createdAt, workfront.id) < (
            SELECT boundary.created_at, boundary.id FROM workfronts boundary
            WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
          ) OR (
            NOT EXISTS (SELECT 1 FROM workfronts missing WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId)
            AND (workfront.createdAt < :cursorTime
              OR (workfront.createdAt = :cursorTime AND workfront.id < :cursorId))
          ))`,
        { cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: context.tenantId }
      );
    }
    const rows = await builder
      .orderBy('workfront.createdAt', 'DESC').addOrderBy('workfront.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.workfrontView(row)),
      meta: {
        limit: query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeFieldHseQualityCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /**
   * API-087 — release a workfront. READY + GATES_CLEARED only, and refused while any unlifted
   * stop-work covers the workfront, its site or its project.
   */
  async releaseWorkfront(
    context: RequestContext, workfrontId: string, input: ReleaseWorkfrontDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'workfront.release');
    return this.commands.execute({
      context, operation: 'API-087:release-workfront', idempotencyKey,
      request: { workfrontId, input }, responseStatus: 200,
      resourceType: 'Workfront', resourceId: workfrontId,
      execute: async (manager) => {
        const workfront = await this.lockWorkfront(manager, context, workfrontId, scope);
        assertVersion(workfront.versionNo, input.expectedVersion);
        if (workfront.status !== WorkfrontStatus.READY) {
          throw unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ workfront READY mới được release'
          );
        }
        if (workfront.readiness !== WorkfrontReadiness.GATES_CLEARED) {
          throw unprocessable(
            'READINESS_GATES_NOT_CLEARED', 'Readiness gates chưa được xác nhận'
          );
        }
        await this.assertNoActiveStopWork(manager, context, {
          projectId: workfront.projectId, siteId: workfront.siteId, workfrontId: workfront.id
        });
        await manager.getRepository(WorkfrontEntity).update(
          { id: workfront.id, tenantId: context.tenantId },
          {
            status: WorkfrontStatus.RELEASED, releasedBy: context.userId, releasedAt: new Date(),
            updatedBy: context.userId, versionNo: workfront.versionNo + 1
          }
        );
        const updated = await manager.getRepository(WorkfrontEntity)
          .findOneByOrFail({ id: workfront.id, tenantId: context.tenantId });
        await emit(this.outbox, manager, context, 'Workfront', updated.id, updated.versionNo,
          'Workfront.Released', {
            projectId: updated.projectId, siteId: updated.siteId, code: updated.code,
            summary: `Workfront ${updated.code} released`
          });
        return this.workfrontView(updated);
      }
    });
  }

  /**
   * API-088 — create a daily log, or correct a SIGNED one: the correction is a new row at
   * revision + 1 for the same slot and the original moves to SUPERSEDED in the same transaction.
   */
  async createDailyLog(
    context: RequestContext, projectId: string, input: CreateDailyLogDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'dailyLog.create');
    return this.commands.execute({
      context, operation: 'API-088:create-daily-log', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'DailyLog',
      resultReference: (result: { id: string }) => ({
        resourceType: 'DailyLog', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const logs = manager.getRepository(DailyLogEntity);
        if (input.correctionOfId) {
          return this.correctDailyLog(manager, context, projectId, input);
        }
        const siteExists = await manager.getRepository(SiteEntity).existsBy({
          id: input.siteId, tenantId: context.tenantId, projectId
        });
        if (!siteExists) throw unprocessable('SITE_NOT_FOUND', 'Site không thuộc dự án này');
        const contractorExists = await manager.getRepository(CompanyEntity).existsBy({
          id: input.contractorCompanyId, tenantId: context.tenantId
        });
        if (!contractorExists) {
          throw unprocessable('CONTRACTOR_NOT_FOUND', 'Nhà thầu không thuộc tenant này');
        }
        const row = logs.create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          siteId: input.siteId, contractorCompanyId: input.contractorCompanyId,
          logDate: input.logDate, shift: input.shift, revision: 1,
          status: DailyLogStatus.DRAFT, summary: input.summary,
          details: input.details ?? {}, correctionOfId: null, reason: null,
          signerSnapshot: null, signedBy: null, signedAt: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await withConstraintMap(() => logs.save(row), {
          uq_daily_log_slot_live: () => conflict(
            'DAILY_LOG_SLOT_CONFLICT', 'Slot này đã có daily log đang hiệu lực'
          ),
          uq_daily_log_slot_revision: () => conflict(
            'DAILY_LOG_SLOT_CONFLICT', 'Slot này đã có daily log đang hiệu lực'
          )
        });
        await emit(this.outbox, manager, context, 'DailyLog', saved.id, saved.versionNo,
          'DailyLog.Created', {
            projectId, siteId: saved.siteId, contractorCompanyId: saved.contractorCompanyId,
            logDate: saved.logDate, shift: saved.shift, revision: saved.revision,
            summary: `Daily log ${saved.logDate}/${saved.shift} created`
          });
        return this.dailyLogView(saved);
      }
    });
  }

  /** API-089 — SUBMIT (DRAFT → SUBMITTED) or SIGN (SUBMITTED → SIGNED with a legal snapshot). */
  async submitDailyLog(
    context: RequestContext, dailyLogId: string, input: SubmitDailyLogDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'dailyLog.submit');
    return this.commands.execute({
      context, operation: 'API-089:submit-daily-log', idempotencyKey,
      request: { dailyLogId, input }, responseStatus: 200,
      resourceType: 'DailyLog', resourceId: dailyLogId,
      execute: async (manager) => {
        const logs = manager.getRepository(DailyLogEntity);
        const log = await logs.createQueryBuilder('log')
          .setLock('pessimistic_write')
          .where('log.id = :id AND log.tenantId = :tenantId', {
            id: dailyLogId, tenantId: context.tenantId
          })
          .getOne();
        if (!log || !inScope(log.projectId, null, scope)) {
          throw notFound('DAILY_LOG_NOT_FOUND', 'Không tìm thấy daily log');
        }
        assertVersion(log.versionNo, input.expectedVersion);
        if (input.action === 'SUBMIT') {
          if (log.status !== DailyLogStatus.DRAFT) {
            throw unprocessable(
              'INVALID_STATE_TRANSITION', 'Chỉ daily log DRAFT mới được submit'
            );
          }
          await logs.update(
            { id: log.id, tenantId: context.tenantId },
            {
              status: DailyLogStatus.SUBMITTED,
              updatedBy: context.userId, versionNo: log.versionNo + 1
            }
          );
        } else {
          if (log.status !== DailyLogStatus.SUBMITTED) {
            throw unprocessable(
              'INVALID_STATE_TRANSITION', 'Chỉ daily log SUBMITTED mới được ký'
            );
          }
          const signer = await manager.getRepository(UserAccountEntity)
            .findOneByOrFail({ id: context.userId, tenantId: context.tenantId });
          const signedAt = new Date();
          // The legal snapshot: stable id + identity + a canonical hash of the signed content.
          const snapshot = {
            userId: signer.id, displayName: signer.displayName, email: signer.email,
            signedAt: signedAt.toISOString(),
            contentHash: canonicalHash({
              logDate: log.logDate, shift: log.shift, revision: log.revision,
              summary: log.summary, details: log.details
            })
          };
          await logs.update(
            { id: log.id, tenantId: context.tenantId },
            {
              status: DailyLogStatus.SIGNED, signerSnapshot: snapshot,
              signedBy: context.userId, signedAt,
              updatedBy: context.userId, versionNo: log.versionNo + 1
            }
          );
        }
        const updated = await logs.findOneByOrFail({ id: log.id, tenantId: context.tenantId });
        await emit(this.outbox, manager, context, 'DailyLog', updated.id, updated.versionNo,
          input.action === 'SUBMIT' ? 'DailyLog.Submitted' : 'DailyLog.Signed', {
            projectId: updated.projectId, logDate: updated.logDate, shift: updated.shift,
            revision: updated.revision, signedBy: updated.signedBy,
            summary: `Daily log ${updated.logDate}/${updated.shift} ${input.action === 'SUBMIT' ? 'submitted' : 'signed'}`
          });
        return this.dailyLogView(updated);
      }
    });
  }

  /**
   * API-090 — append to the quantity ledger (permission: the EXISTING `progress.record`).
   * Corrections and certifications are new rows; the stored rows never change.
   */
  async recordQuantityProgress(
    context: RequestContext, workfrontId: string, input: RecordQuantityProgressDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'progress.record');
    return this.commands.execute({
      context, operation: 'API-090:record-quantity-progress', idempotencyKey,
      request: { workfrontId, input }, responseStatus: 201,
      resourceType: 'QuantityProgressRecord',
      resultReference: (result: { id: string }) => ({
        resourceType: 'QuantityProgressRecord', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const workfront = await this.lockWorkfront(manager, context, workfrontId, scope);
        if (input.correctionOfId && input.certificationOfId) {
          throw unprocessable(
            'QUANTITY_ROLE_CONFLICT', 'Một bản ghi không thể vừa đính chính vừa nghiệm thu'
          );
        }
        if (input.correctionOfId && !input.reason) {
          throw unprocessable('CORRECTION_REASON_REQUIRED', 'Đính chính phải có lý do');
        }
        if (input.wbsNodeId) {
          const wbsExists = await manager.getRepository(WbsNodeEntity).existsBy({
            id: input.wbsNodeId, tenantId: context.tenantId, projectId: workfront.projectId
          });
          if (!wbsExists) {
            throw unprocessable('WBS_NODE_NOT_FOUND', 'WBS node không thuộc dự án này');
          }
        }
        const records = manager.getRepository(QuantityProgressRecordEntity);
        for (const reference of [input.correctionOfId, input.certificationOfId]) {
          if (!reference) continue;
          const target = await records.findOneBy({
            id: reference, tenantId: context.tenantId, workfrontId: workfront.id
          });
          if (!target) {
            throw unprocessable(
              'QUANTITY_RECORD_NOT_FOUND', 'Bản ghi tham chiếu không thuộc workfront này'
            );
          }
          if (reference === input.certificationOfId && target.certificationOfId !== null) {
            throw unprocessable(
              'QUANTITY_CERTIFY_CERTIFICATION', 'Không thể nghiệm thu một bản ghi nghiệm thu'
            );
          }
        }
        const id = randomUUID();
        await withConstraintMap(
          () => records.insert({
            id, tenantId: context.tenantId, projectId: workfront.projectId,
            workfrontId: workfront.id, wbsNodeId: input.wbsNodeId ?? null,
            correctionOfId: input.correctionOfId ?? null,
            certificationOfId: input.certificationOfId ?? null,
            recordDate: input.recordDate, quantity: input.quantity, unit: input.unit,
            evidenceRefs: input.evidenceRefs ?? [], reason: input.reason ?? null,
            sourceKey: input.sourceKey, recordedBy: context.userId
          }),
          {
            uq_qpr_source: () => conflict(
              'QUANTITY_SOURCE_CONFLICT', 'Source key này đã được ghi nhận'
            ),
            uq_qpr_single_certification: () => conflict(
              'QUANTITY_ALREADY_CERTIFIED', 'Bản ghi này đã được nghiệm thu'
            ),
            ck_qpr_quantity_positive: () => unprocessable(
              'QUANTITY_INVALID', 'Khối lượng phải lớn hơn 0'
            )
          }
        );
        const saved = await records.findOneByOrFail({ id, tenantId: context.tenantId });
        const eventType = saved.certificationOfId !== null
          ? 'QuantityProgress.Certified'
          : saved.correctionOfId !== null
            ? 'QuantityProgress.Corrected' : 'QuantityProgress.Recorded';
        await emit(this.outbox, manager, context, 'QuantityProgressRecord', saved.id, 1,
          eventType, {
            projectId: saved.projectId, workfrontId: saved.workfrontId,
            wbsNodeId: saved.wbsNodeId, quantity: saved.quantity, unit: saved.unit,
            recordDate: saved.recordDate, sourceKey: saved.sourceKey,
            summary: `Quantity ${saved.quantity} ${saved.unit} recorded`
          });
        return this.quantityView(saved);
      }
    });
  }

  /** API-091 — request a permit to work for a workfront; it is born REQUESTED. */
  async createPermitToWork(
    context: RequestContext, workfrontId: string, input: CreatePermitToWorkDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'permitToWork.request');
    return this.commands.execute({
      context, operation: 'API-091:request-permit', idempotencyKey,
      request: { workfrontId, input }, responseStatus: 201, resourceType: 'PermitToWork',
      resultReference: (result: { id: string }) => ({
        resourceType: 'PermitToWork', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const workfront = await this.lockWorkfront(manager, context, workfrontId, scope);
        const validFrom = new Date(input.validFrom);
        const validTo = new Date(input.validTo);
        if (validTo.getTime() <= validFrom.getTime()) {
          throw unprocessable(
            'PERMIT_WINDOW_INVALID', 'Thời hạn permit phải kết thúc sau khi bắt đầu'
          );
        }
        const permits = manager.getRepository(PermitToWorkEntity);
        const row = permits.create({
          id: randomUUID(), tenantId: context.tenantId, projectId: workfront.projectId,
          siteId: workfront.siteId, workfrontId: workfront.id,
          permitType: input.permitType, description: input.description ?? null,
          status: PermitToWorkStatus.REQUESTED, validFrom, validTo,
          requestedBy: context.userId, issuerId: null, issuedAt: null,
          isolationSnapshot: null, createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await permits.save(row);
        await emit(this.outbox, manager, context, 'PermitToWork', saved.id, saved.versionNo,
          'PermitToWork.Requested', {
            projectId: saved.projectId, siteId: saved.siteId, workfrontId: saved.workfrontId,
            permitType: saved.permitType,
            summary: `Permit ${saved.permitType} requested`
          });
        return this.permitView(saved);
      }
    });
  }

  /**
   * API-092 — issue a permit. Only PERMIT_ISSUER/HSE_MANAGER hold the permission; the issuer can
   * never be the requester; an unlifted stop-work covering the permit's reach refuses the issue.
   */
  async issuePermitToWork(
    context: RequestContext, permitToWorkId: string, input: IssuePermitToWorkDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'permitToWork.issue');
    return this.commands.execute({
      context, operation: 'API-092:issue-permit', idempotencyKey,
      request: { permitToWorkId, input }, responseStatus: 200,
      resourceType: 'PermitToWork', resourceId: permitToWorkId,
      execute: async (manager) => {
        const permits = manager.getRepository(PermitToWorkEntity);
        const permit = await permits.createQueryBuilder('permit')
          .setLock('pessimistic_write')
          .where('permit.id = :id AND permit.tenantId = :tenantId', {
            id: permitToWorkId, tenantId: context.tenantId
          })
          .getOne();
        if (!permit || !inScope(permit.projectId, null, scope)) {
          throw notFound('PERMIT_NOT_FOUND', 'Không tìm thấy permit');
        }
        assertVersion(permit.versionNo, input.expectedVersion);
        if (permit.status !== PermitToWorkStatus.REQUESTED
          && permit.status !== PermitToWorkStatus.VERIFIED) {
          throw unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ permit REQUESTED/VERIFIED mới được cấp'
          );
        }
        if (permit.requestedBy === context.userId) {
          throw unprocessable('SOD_CONFLICT', 'Người yêu cầu permit không được tự cấp permit');
        }
        await this.assertNoActiveStopWork(manager, context, {
          projectId: permit.projectId, siteId: permit.siteId,
          workfrontId: permit.workfrontId, permitId: permit.id
        });
        permit.status = PermitToWorkStatus.ISSUED;
        permit.issuerId = context.userId;
        permit.issuedAt = new Date();
        permit.isolationSnapshot = input.isolationSnapshot;
        permit.updatedBy = context.userId;
        await withConstraintMap(
          () => permits.save(permit),
          {
            uq_permit_active_per_type: () => conflict(
              'PERMIT_ALREADY_ACTIVE',
              'Workfront này đã có permit cùng loại đang ISSUED/ACTIVE'
            ),
            ck_permit_issuer_independent: () => unprocessable(
              'SOD_CONFLICT', 'Người yêu cầu permit không được tự cấp permit'
            )
          }
        );
        const updated = await permits.findOneByOrFail({
          id: permit.id, tenantId: context.tenantId
        });
        await emit(this.outbox, manager, context, 'PermitToWork', updated.id, updated.versionNo,
          'PermitToWork.Issued', {
            projectId: updated.projectId, siteId: updated.siteId,
            workfrontId: updated.workfrontId, permitType: updated.permitType,
            issuerId: updated.issuerId,
            summary: `Permit ${updated.permitType} issued`
          });
        return this.permitView(updated);
      }
    });
  }

  /**
   * API-093 — report an HSE incident. NEVER gated on any aggregate state; the only failures are
   * 400 (validation), 404 (project invisible), 409 (idempotency) and 500. Audit/outbox payloads
   * carry ids and classification only; `restricted_facts` never leaves the row.
   */
  async reportHseIncident(
    context: RequestContext, projectId: string, input: ReportHseIncidentDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'hseIncident.report');
    return this.commands.execute({
      context, operation: 'API-093:report-hse-incident', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'HseIncident',
      resultReference: (result: { id: string }) => ({
        resourceType: 'HseIncident', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const reportedAt = new Date();
        const occurredAt = new Date(input.occurredAt);
        if (occurredAt.getTime() > reportedAt.getTime()) {
          throw new BadRequestException({
            code: 'OCCURRED_AT_IN_FUTURE',
            message: 'Thời điểm xảy ra sự cố không thể ở tương lai', retryable: false
          });
        }
        if (input.siteId) {
          const siteExists = await manager.getRepository(SiteEntity).existsBy({
            id: input.siteId, tenantId: context.tenantId, projectId
          });
          if (!siteExists) {
            throw new BadRequestException({
              code: 'SITE_NOT_FOUND', message: 'Site không thuộc dự án này', retryable: false
            });
          }
        }
        const incidents = manager.getRepository(HseIncidentEntity);
        const row = incidents.create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          siteId: input.siteId ?? null, occurredAt, reportedAt, reportedBy: context.userId,
          incidentType: input.incidentType, actualSeverity: input.actualSeverity,
          potentialSeverity: input.potentialSeverity, narrative: input.narrative,
          immediateAction: input.immediateAction ?? null,
          restrictedFacts: input.restrictedFacts ?? null, legalHold: false,
          status: HseIncidentStatus.REPORTED, closedBy: null, closedAt: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await incidents.save(row);
        // Ids and classification ONLY — no narrative, no immediate action, no restricted facts.
        await emit(this.outbox, manager, context, 'HseIncident', saved.id, saved.versionNo,
          'HseIncident.Reported', {
            projectId: saved.projectId, siteId: saved.siteId,
            incidentType: saved.incidentType, actualSeverity: saved.actualSeverity,
            potentialSeverity: saved.potentialSeverity,
            occurredAt: saved.occurredAt.toISOString(),
            summary: `HSE incident ${saved.incidentType} reported`
          });
        return this.incidentView(saved);
      }
    });
  }

  /**
   * API-094 — append a stop-work ISSUE or LIFT. Recorded deviation from the YAML's single
   * `stopWork.manage`: issuing is `stopWork.issue` (every role — anyone may stop unsafe work);
   * lifting is `stopWork.lift` (HSE_MANAGER only). The half-specific permission is re-checked
   * here because the route guard can only see the union.
   */
  async recordStopWorkAction(
    context: RequestContext, projectId: string, input: StopWorkActionDto, idempotencyKey: string
  ) {
    const action = input.action === StopWorkAction.LIFT ? 'stopWork.lift' : 'stopWork.issue';
    if (!await this.permissions.has(context, action, 'PROJECT', projectId)) {
      throw forbidden();
    }
    const scope = await this.permissions.accessScopeSets(context, action);
    return this.commands.execute({
      context, operation: 'API-094:stop-work-action', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'StopWorkAction',
      resultReference: (result: { id: string }) => ({
        resourceType: 'StopWorkAction', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        return input.action === StopWorkAction.ISSUE
          ? this.issueStopWork(manager, context, projectId, input)
          : this.liftStopWork(manager, context, projectId, input);
      }
    });
  }

  private async issueStopWork(
    manager: EntityManager, context: RequestContext, projectId: string, input: StopWorkActionDto
  ) {
    const target = this.resolveStopWorkTarget(input);
    await this.assertStopWorkTargetExists(manager, context, projectId, target);
    if (input.hseIncidentId) {
      const incidentExists = await manager.getRepository(HseIncidentEntity).existsBy({
        id: input.hseIncidentId, tenantId: context.tenantId, projectId
      });
      if (!incidentExists) {
        throw unprocessable('HSE_INCIDENT_NOT_FOUND', 'Sự cố HSE không thuộc dự án này');
      }
    }
    const ledger = manager.getRepository(StopWorkActionEntity);
    const id = randomUUID();
    await ledger.insert({
      id, tenantId: context.tenantId, projectId, action: StopWorkAction.ISSUE,
      targetType: target.targetType, siteId: target.siteId, workfrontId: target.workfrontId,
      permitId: target.permitId, hseIncidentId: input.hseIncidentId ?? null,
      reason: input.reason, liftsActionId: null, verifiedControls: [],
      actorId: context.userId
    });
    const saved = await ledger.findOneByOrFail({ id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'StopWorkAction', saved.id, 1,
      'StopWork.Issued', {
        projectId, targetType: saved.targetType, siteId: saved.siteId,
        workfrontId: saved.workfrontId, permitId: saved.permitId,
        hseIncidentId: saved.hseIncidentId,
        summary: `Stop-work issued for ${saved.targetType}`
      });
    return this.stopWorkView(saved);
  }

  private async liftStopWork(
    manager: EntityManager, context: RequestContext, projectId: string, input: StopWorkActionDto
  ) {
    if (!input.liftsActionId) {
      throw unprocessable(
        'STOP_WORK_LIFT_REFERENCE_REQUIRED', 'LIFT phải tham chiếu lệnh dừng cần gỡ'
      );
    }
    if (!input.verifiedControls || input.verifiedControls.length === 0) {
      throw unprocessable(
        'VERIFIED_CONTROLS_REQUIRED', 'LIFT phải ghi nhận các biện pháp đã kiểm chứng'
      );
    }
    const ledger = manager.getRepository(StopWorkActionEntity);
    const issue = await ledger.findOneBy({
      id: input.liftsActionId, tenantId: context.tenantId, projectId
    });
    if (!issue || issue.action !== StopWorkAction.ISSUE) {
      throw unprocessable(
        'STOP_WORK_ISSUE_NOT_FOUND', 'Không tìm thấy lệnh dừng ISSUE trong dự án này'
      );
    }
    if (issue.actorId === context.userId) {
      throw unprocessable('SOD_CONFLICT', 'Người ra lệnh dừng không được tự gỡ lệnh dừng');
    }
    const id = randomUUID();
    await withConstraintMap(
      () => ledger.insert({
        id, tenantId: context.tenantId, projectId, action: StopWorkAction.LIFT,
        targetType: issue.targetType, siteId: issue.siteId, workfrontId: issue.workfrontId,
        permitId: issue.permitId, hseIncidentId: issue.hseIncidentId,
        reason: input.reason, liftsActionId: issue.id,
        verifiedControls: input.verifiedControls, actorId: context.userId
      }),
      {
        uq_stop_work_single_lift: () => conflict(
          'STOP_WORK_ALREADY_LIFTED', 'Lệnh dừng này đã được gỡ'
        ),
        ck_stop_work_lift_independent: () => unprocessable(
          'SOD_CONFLICT', 'Người ra lệnh dừng không được tự gỡ lệnh dừng'
        ),
        ck_stop_work_lift_targets_issue: () => unprocessable(
          'STOP_WORK_ISSUE_NOT_FOUND', 'Không tìm thấy lệnh dừng ISSUE trong dự án này'
        )
      }
    );
    const saved = await ledger.findOneByOrFail({ id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'StopWorkAction', saved.id, 1,
      'StopWork.Lifted', {
        projectId, targetType: saved.targetType, liftsActionId: saved.liftsActionId,
        verifiedControlCount: input.verifiedControls.length,
        summary: `Stop-work lifted for ${saved.targetType}`
      });
    return this.stopWorkView(saved);
  }

  private resolveStopWorkTarget(input: StopWorkActionDto): {
    targetType: StopWorkTargetType;
    siteId: string | null;
    workfrontId: string | null;
    permitId: string | null;
  } {
    const targetType = input.targetType;
    const invalid = unprocessable(
      'STOP_WORK_TARGET_INVALID',
      'Target của stop-work phải khai báo đúng một định danh khớp với target type'
    );
    if (!targetType) throw invalid;
    const expectation: Record<StopWorkTargetType, (typeof input.siteId)[]> = {
      [StopWorkTargetType.PROJECT]: [input.siteId, input.workfrontId, input.permitId],
      [StopWorkTargetType.SITE]: [input.workfrontId, input.permitId],
      [StopWorkTargetType.WORKFRONT]: [input.siteId, input.permitId],
      [StopWorkTargetType.PERMIT]: [input.siteId, input.workfrontId]
    };
    if (expectation[targetType].some((value) => value !== undefined)) throw invalid;
    if (targetType === StopWorkTargetType.SITE && !input.siteId) throw invalid;
    if (targetType === StopWorkTargetType.WORKFRONT && !input.workfrontId) throw invalid;
    if (targetType === StopWorkTargetType.PERMIT && !input.permitId) throw invalid;
    return {
      targetType,
      siteId: input.siteId ?? null,
      workfrontId: input.workfrontId ?? null,
      permitId: input.permitId ?? null
    };
  }

  private async assertStopWorkTargetExists(
    manager: EntityManager, context: RequestContext, projectId: string,
    target: { targetType: StopWorkTargetType; siteId: string | null; workfrontId: string | null; permitId: string | null }
  ): Promise<void> {
    const missing = unprocessable(
      'STOP_WORK_TARGET_NOT_FOUND', 'Đối tượng dừng việc không thuộc dự án này'
    );
    if (target.targetType === StopWorkTargetType.SITE) {
      const exists = await manager.getRepository(SiteEntity).existsBy({
        id: target.siteId!, tenantId: context.tenantId, projectId
      });
      if (!exists) throw missing;
    }
    if (target.targetType === StopWorkTargetType.WORKFRONT) {
      const exists = await manager.getRepository(WorkfrontEntity).existsBy({
        id: target.workfrontId!, tenantId: context.tenantId, projectId
      });
      if (!exists) throw missing;
    }
    if (target.targetType === StopWorkTargetType.PERMIT) {
      const exists = await manager.getRepository(PermitToWorkEntity).existsBy({
        id: target.permitId!, tenantId: context.tenantId, projectId
      });
      if (!exists) throw missing;
    }
  }

  /** Correction path of API-088: new revision row + supersede the SIGNED original, atomically. */
  private async correctDailyLog(
    manager: EntityManager, context: RequestContext, projectId: string, input: CreateDailyLogDto
  ) {
    if (!input.reason) {
      throw unprocessable('CORRECTION_REASON_REQUIRED', 'Đính chính phải có lý do');
    }
    const logs = manager.getRepository(DailyLogEntity);
    const original = await logs.createQueryBuilder('log')
      .setLock('pessimistic_write')
      .where('log.id = :id AND log.tenantId = :tenantId AND log.projectId = :projectId', {
        id: input.correctionOfId, tenantId: context.tenantId, projectId
      })
      .getOne();
    if (!original) {
      throw unprocessable('DAILY_LOG_NOT_FOUND', 'Không tìm thấy daily log cần đính chính');
    }
    if (original.status !== DailyLogStatus.SIGNED) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', 'Chỉ daily log đã ký mới được đính chính'
      );
    }
    // Supersede first so the partial live-slot unique admits the correction row.
    await logs.update(
      { id: original.id, tenantId: context.tenantId },
      {
        status: DailyLogStatus.SUPERSEDED,
        updatedBy: context.userId, versionNo: original.versionNo + 1
      }
    );
    const row = logs.create({
      id: randomUUID(), tenantId: context.tenantId, projectId,
      siteId: original.siteId, contractorCompanyId: original.contractorCompanyId,
      logDate: original.logDate, shift: original.shift, revision: original.revision + 1,
      status: DailyLogStatus.DRAFT, summary: input.summary, details: input.details ?? {},
      correctionOfId: original.id, reason: input.reason,
      signerSnapshot: null, signedBy: null, signedAt: null,
      createdBy: context.userId, updatedBy: context.userId
    });
    const saved = await withConstraintMap(() => logs.save(row), {
      uq_daily_log_slot_live: () => conflict(
        'DAILY_LOG_SLOT_CONFLICT', 'Slot này đã có daily log đang hiệu lực'
      ),
      uq_daily_log_slot_revision: () => conflict(
        'DAILY_LOG_SLOT_CONFLICT', 'Slot này đã có daily log đang hiệu lực'
      )
    });
    await emit(this.outbox, manager, context, 'DailyLog', saved.id, saved.versionNo,
      'DailyLog.Corrected', {
        projectId, siteId: saved.siteId, contractorCompanyId: saved.contractorCompanyId,
        logDate: saved.logDate, shift: saved.shift, revision: saved.revision,
        correctionOfId: saved.correctionOfId,
        summary: `Daily log ${saved.logDate}/${saved.shift} corrected to revision ${saved.revision}`
      });
    return this.dailyLogView(saved);
  }

  /**
   * The stop-work gate (FR-088, SEC-108): true refusal when an unlifted ISSUE covers the given
   * project/site/workfront/permit — and the SAME refusal when the ledger cannot be read. Safety
   * fails closed; it never fails open because a query failed.
   */
  private async assertNoActiveStopWork(
    manager: EntityManager, context: RequestContext, coverage: StopWorkCoverage
  ): Promise<void> {
    let blocked = true;
    try {
      const [row] = await manager.query<Array<{ blocked: boolean }>>(
        `SELECT EXISTS (
          SELECT 1 FROM stop_work_actions issue
          WHERE issue.tenant_id = $1 AND issue.action = 'ISSUE'
            AND NOT EXISTS (
              SELECT 1 FROM stop_work_actions lift
              WHERE lift.tenant_id = issue.tenant_id AND lift.lifts_action_id = issue.id
            )
            AND (
              (issue.target_type = 'PROJECT' AND issue.project_id = $2::uuid)
              OR (issue.target_type = 'SITE' AND issue.site_id = $3::uuid)
              OR (issue.target_type = 'WORKFRONT' AND issue.workfront_id = $4::uuid)
              OR (issue.target_type = 'PERMIT' AND issue.permit_id = $5::uuid)
            )
        ) AS "blocked"`,
        [
          context.tenantId, coverage.projectId, coverage.siteId ?? null,
          coverage.workfrontId ?? null, coverage.permitId ?? null
        ]
      );
      blocked = row.blocked;
    } catch {
      blocked = true;
    }
    if (blocked) {
      throw unprocessable(
        'STOP_WORK_ACTIVE', 'Đang có lệnh dừng việc chưa được gỡ trong phạm vi này'
      );
    }
  }

  private async lockWorkfront(
    manager: EntityManager, context: RequestContext, workfrontId: string, scope: AccessScopeSets
  ): Promise<WorkfrontEntity> {
    const workfront = await manager.getRepository(WorkfrontEntity)
      .createQueryBuilder('workfront')
      .setLock('pessimistic_write')
      .where('workfront.id = :id AND workfront.tenantId = :tenantId', {
        id: workfrontId, tenantId: context.tenantId
      })
      .getOne();
    if (!workfront || !inScope(workfront.projectId, workfront.packageId, scope)) {
      throw notFound('WORKFRONT_NOT_FOUND', 'Không tìm thấy workfront');
    }
    return workfront;
  }

  /** Package-aware project visibility: reach through tenant, project or an in-project package. */
  private async assertProjectVisible(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets
  ): Promise<void> {
    const exists = await manager.getRepository(ProjectEntity).existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!exists) throw notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return;
    if (scope.packageIds.length > 0 && await manager.getRepository(PackageEntity).existsBy({
      tenantId: context.tenantId, projectId, id: In(scope.packageIds)
    })) return;
    throw notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
  }

  private workfrontView(row: WorkfrontEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, packageId: row.packageId,
      code: row.code, name: row.name, status: row.status, readiness: row.readiness,
      releasedBy: row.releasedBy,
      releasedAt: row.releasedAt === null ? null : row.releasedAt.toISOString(),
      suspendedReason: row.suspendedReason, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private dailyLogView(row: DailyLogEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId,
      contractorCompanyId: row.contractorCompanyId, logDate: row.logDate, shift: row.shift,
      revision: row.revision, status: row.status, summary: row.summary, details: row.details,
      correctionOfId: row.correctionOfId, reason: row.reason,
      signerSnapshot: row.signerSnapshot, signedBy: row.signedBy,
      signedAt: row.signedAt === null ? null : row.signedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private quantityView(row: QuantityProgressRecordEntity) {
    return {
      id: row.id, projectId: row.projectId, workfrontId: row.workfrontId,
      wbsNodeId: row.wbsNodeId, correctionOfId: row.correctionOfId,
      certificationOfId: row.certificationOfId, recordDate: row.recordDate,
      quantity: row.quantity, unit: row.unit, evidenceRefs: row.evidenceRefs,
      reason: row.reason, sourceKey: row.sourceKey, recordedBy: row.recordedBy,
      recordedAt: row.recordedAt.toISOString()
    };
  }

  private permitView(row: PermitToWorkEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, workfrontId: row.workfrontId,
      permitType: row.permitType, description: row.description, status: row.status,
      validFrom: row.validFrom.toISOString(), validTo: row.validTo.toISOString(),
      requestedBy: row.requestedBy, issuerId: row.issuerId,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      isolationSnapshot: row.isolationSnapshot, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  /** The incident view NEVER carries `restrictedFacts` (SEC-130). */
  private incidentView(row: HseIncidentEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId,
      occurredAt: row.occurredAt.toISOString(), reportedAt: row.reportedAt.toISOString(),
      reportedBy: row.reportedBy, incidentType: row.incidentType,
      actualSeverity: row.actualSeverity, potentialSeverity: row.potentialSeverity,
      narrative: row.narrative, immediateAction: row.immediateAction,
      legalHold: row.legalHold, status: row.status, closedBy: row.closedBy,
      closedAt: row.closedAt === null ? null : row.closedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private stopWorkView(row: StopWorkActionEntity) {
    return {
      id: row.id, projectId: row.projectId, action: row.action, targetType: row.targetType,
      siteId: row.siteId, workfrontId: row.workfrontId, permitId: row.permitId,
      hseIncidentId: row.hseIncidentId, reason: row.reason,
      liftsActionId: row.liftsActionId, verifiedControls: row.verifiedControls,
      actorId: row.actorId, actedAt: row.actedAt.toISOString()
    };
  }
}
