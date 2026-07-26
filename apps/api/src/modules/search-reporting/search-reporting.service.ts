import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, In, Repository, type EntityManager } from 'typeorm';
import {
  AuditEventEntity, PackageEntity, ProjectEntity, ReportJobEntity, ReportJobStatus,
  ReportType, SavedViewEntity, SavedViewShareScope
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeSavedViewCursor, encodeSavedViewCursor } from './domain/cursor';
import {
  buildSearchQuery, SEARCH_RESULT_TYPES, type SearchResultType
} from './domain/search-query';
import type {
  CreateReportJobDto, CreateSavedViewDto, SavedViewListQueryDto, SearchRequestDto
} from './dto/search-reporting.dto';

export interface RequestContext extends AuthContext { correlationId: string }

export interface SearchRow {
  type: SearchResultType;
  id: string;
  code: string;
  title: string;
  projectId: string;
}

/**
 * Search & Reporting (API-130…API-134, FR-171…FR-173).
 *
 * - API-130 is strictly relational and ACL-aware: one SQL statement, one UNION ALL branch per
 *   register, each branch under that module's own scope predicate. Lacking a module's read
 *   permission silently empties its branch — search must never turn authorization into a probe.
 * - Saved views are PRIVATE by construction in V1 (`ck_saved_view_share_scope`); any other scope
 *   is refused with the recorded 422 SHARE_SCOPE_NOT_SUPPORTED.
 * - Report jobs are commands: the API validates the caller can read the target register NOW,
 *   inserts a QUEUED row and emits `ReportJob.Requested`; the worker owns everything after that.
 *   API-134 re-checks the module permission again at read time before revealing the download.
 */
@Injectable()
export class SearchReportingService {
  constructor(
    @InjectRepository(SavedViewEntity)
    private readonly savedViews: Repository<SavedViewEntity>,
    @InjectRepository(ReportJobEntity)
    private readonly reportJobs: Repository<ReportJobEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-130 — cross-register search over the implemented registers only. */
  async search(context: RequestContext, input: SearchRequestDto) {
    const types = input.types ?? [...SEARCH_RESULT_TYPES];
    const [projectVisibleIds, documentScope, riskChangeScope, contractScope] = await Promise.all([
      this.permissions.projectScopeIds(context, 'project.read'),
      this.permissions.accessScopeSets(context, 'document.read'),
      this.permissions.accessScopeSets(context, 'riskChange.read'),
      this.permissions.accessScopeSets(context, 'contract.read')
    ]);
    const built = buildSearchQuery({
      tenantId: context.tenantId,
      query: input.query,
      types,
      limit: input.limit,
      scopes: {
        projectVisibleIds,
        document: documentScope,
        riskChange: riskChangeScope,
        contract: contractScope
      }
    });
    if (!built) return { items: [], meta: { limit: input.limit } };
    const rows: SearchRow[] = await this.savedViews.manager.query(built.sql, built.parameters);
    return { items: rows, meta: { limit: input.limit } };
  }

  /** API-131 — the caller's own PRIVATE views; there is nothing else to list in V1. */
  async listSavedViews(context: RequestContext, query: SavedViewListQueryDto) {
    const cursor = decodeSavedViewCursor(query.cursor);
    const builder = this.savedViews.createQueryBuilder('view')
      .where('view.tenantId = :tenantId', { tenantId: context.tenantId })
      .andWhere('view.ownerUserId = :userId', { userId: context.userId });
    if (query.targetType) {
      builder.andWhere('view.targetType = :targetType', { targetType: query.targetType });
    }
    if (cursor) {
      builder.andWhere(new Brackets((where) => where
        .where('view.createdAt < :cursorTime', { cursorTime: cursor.createdAt })
        .orWhere('view.createdAt = :cursorTime AND view.id < :cursorId', {
          cursorTime: cursor.createdAt, cursorId: cursor.id
        })));
    }
    const rows = await builder
      .orderBy('view.createdAt', 'DESC').addOrderBy('view.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.savedViewView(row)),
      meta: {
        limit: query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeSavedViewCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /** API-132 — create a PRIVATE saved view; the view stores presentation state, never permission. */
  async createSavedView(
    context: RequestContext, input: CreateSavedViewDto, idempotencyKey: string
  ) {
    // By-construction control (recorded): V1 has exactly one share scope. Refused before any row
    // exists, mirroring `ck_saved_view_share_scope`.
    if (input.shareScope !== undefined && input.shareScope !== SavedViewShareScope.PRIVATE) {
      throw this.unprocessable(
        'SHARE_SCOPE_NOT_SUPPORTED',
        'Chỉ hỗ trợ shareScope PRIVATE: chia sẻ view sẽ tái phát hành bộ lọc mà không tái thẩm định quyền'
      );
    }
    return this.commands.execute({
      context, operation: 'API-132:create-saved-view', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'SavedView',
      resultReference: (result: { id: string }) => ({
        resourceType: 'SavedView', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const id = randomUUID();
        const row = manager.getRepository(SavedViewEntity).create({
          id, tenantId: context.tenantId, ownerUserId: context.userId,
          name: input.name, targetType: input.targetType,
          filterSnapshot: input.filterSnapshot ?? {},
          columnSnapshot: input.columnSnapshot ?? [],
          sortSnapshot: input.sortSnapshot ?? [],
          shareScope: SavedViewShareScope.PRIVATE, versionNo: 1
        });
        await this.rethrowUnique(
          () => manager.getRepository(SavedViewEntity).save(row),
          'SAVED_VIEW_EXISTS', 'Bạn đã có saved view trùng tên cho register này'
        );
        const saved = await manager.getRepository(SavedViewEntity)
          .findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'SavedView', saved.id, saved.versionNo,
          'SavedView.Created', {
            targetType: saved.targetType, name: saved.name,
            summary: `Saved view ${saved.name} created`
          });
        return this.savedViewView(saved);
      }
    });
  }

  /** API-133 — queue a register export after proving the caller can read that register NOW. */
  async createReportJob(
    context: RequestContext, input: CreateReportJobDto, idempotencyKey: string
  ) {
    const permission = this.modulePermission(input.reportType);
    const scope = await this.permissions.accessScopeSets(context, permission);
    return this.commands.execute({
      context, operation: 'API-133:create-report-job', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'ReportJob',
      resultReference: (result: { id: string }) => ({
        resourceType: 'ReportJob', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        // Out of module scope is indistinguishable from a missing project.
        if (!await this.projectVisible(manager, context, scope, input.projectId)) {
          throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
        }
        const id = randomUUID();
        await manager.getRepository(ReportJobEntity).insert({
          id, tenantId: context.tenantId, reportType: input.reportType,
          filterSnapshot: { projectId: input.projectId },
          dataAsOf: null, status: ReportJobStatus.QUEUED,
          outputObjectRef: null, errorCode: null, expiresAt: null,
          requestedBy: context.userId, correlationId: context.correlationId
        });
        const saved = await manager.getRepository(ReportJobEntity)
          .findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'ReportJob', saved.id, 1, 'ReportJob.Requested', {
          reportType: saved.reportType, projectId: input.projectId,
          requestedBy: context.userId,
          summary: `Report ${saved.reportType} requested`
        });
        return this.reportJobView(saved, null);
      }
    });
  }

  /** API-134 — requester-only status; the download re-passes the module permission gate. */
  async getReportJob(context: RequestContext, reportJobId: string) {
    const job = await this.reportJobs.findOneBy({ id: reportJobId, tenantId: context.tenantId });
    // Another user's job — even a colleague's — is indistinguishable from a missing one: a report
    // is a snapshot cut under ONE person's scope and is never a sharing channel.
    if (!job || job.requestedBy !== context.userId) {
      throw this.notFound('REPORT_JOB_NOT_FOUND', 'Không tìm thấy report job');
    }
    let download: { bucket: string; objectKey: string } | null = null;
    if (job.status === ReportJobStatus.COMPLETED && job.outputObjectRef !== null) {
      // Re-check NOW: a permission revoked after completion hides the produced file.
      const scope = await this.permissions.accessScopeSets(
        context, this.modulePermission(job.reportType)
      );
      const projectId = typeof job.filterSnapshot.projectId === 'string'
        ? job.filterSnapshot.projectId : null;
      const stillVisible = projectId !== null && await this.projectVisible(
        this.reportJobs.manager, context, scope, projectId
      );
      const notExpired = job.expiresAt !== null && job.expiresAt.getTime() > Date.now();
      if (stillVisible && notExpired) {
        // Honest gap: an S3 presigner is not available in this build (no
        // @aws-sdk/s3-request-presigner dependency), so the client receives the stable object
        // reference and downloads through infrastructure that can authenticate to MinIO.
        download = { bucket: job.outputObjectRef.bucket, objectKey: job.outputObjectRef.objectKey };
      }
    }
    return { data: this.reportJobView(job, download) };
  }

  private modulePermission(reportType: ReportType): string {
    return reportType === ReportType.RISK_REGISTER_CSV ? 'riskChange.read' : 'document.read';
  }

  /**
   * The module's own project visibility rule: tenant-wide, explicit project reach, or at least one
   * of the caller's packages inside the project (the register rows will then be package-filtered
   * again by the worker under the same scope).
   */
  private async projectVisible(
    manager: EntityManager, context: RequestContext, scope: AccessScopeSets, projectId: string
  ): Promise<boolean> {
    const exists = await manager.getRepository(ProjectEntity).existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!exists) return false;
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return true;
    if (scope.packageIds.length === 0) return false;
    return manager.getRepository(PackageEntity).existsBy({
      tenantId: context.tenantId, projectId, id: In(scope.packageIds)
    });
  }

  private savedViewView(row: SavedViewEntity) {
    return {
      id: row.id, name: row.name, targetType: row.targetType,
      filterSnapshot: row.filterSnapshot, columnSnapshot: row.columnSnapshot,
      sortSnapshot: row.sortSnapshot, shareScope: row.shareScope,
      versionNo: row.versionNo,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private reportJobView(
    row: ReportJobEntity, download: { bucket: string; objectKey: string } | null
  ) {
    return {
      id: row.id, reportType: row.reportType, filterSnapshot: row.filterSnapshot,
      status: row.status,
      dataAsOf: row.dataAsOf === null ? null : row.dataAsOf.toISOString(),
      errorCode: row.errorCode,
      expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
      requestedBy: row.requestedBy, correlationId: row.correlationId,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      download
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
}
