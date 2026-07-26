import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  Brackets, In, Repository, type EntityManager, type ObjectLiteral, type SelectQueryBuilder
} from 'typeorm';
import {
  CommissioningSystemEntity, CommissioningSystemStatus, DocumentRevisionEntity,
  DocumentRevisionStatus, DocumentScanStatus, PackageEntity, ProjectEntity, TestPackEntity,
  TestPackStatus, TestRunEntity, TestRunStatus
} from '../../database/entities';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeCommissioningCursor, encodeCommissioningCursor } from './domain/cursor';
import { canRetest } from './domain/state-policy';
import {
  assertVersion, conflict, emit, notFound, type RequestContext, unprocessable, withConstraintMap
} from './domain/support';
import type {
  CommissioningSystemListQueryDto, CompleteTestRunDto, CreateCommissioningSystemDto,
  CreateRetestDto, CreateTestPackDto, StartTestRunDto
} from './dto/commissioning-cod.dto';

/**
 * Commissioning execution (API-098…API-103).
 *
 * The rules this half of the module is built around:
 * - A RECORDED RESULT IS PERMANENT. API-102 writes the result once; the row is frozen by trigger
 *   afterwards, so a FAILED run can never become PASSED — a retest (API-103) is a new row that
 *   points back at the failure through `previous_run_id`. The failure stays visible forever.
 * - THE PROCEDURE IS A CONTROLLED DOCUMENT. API-100 refuses any revision that is not ISSUED with a
 *   CLEAN malware scan (`PROCEDURE_REVISION_LOCKED`), so a test can never be run against a draft or
 *   a quarantined file.
 * - Out of ABAC scope is indistinguishable from missing: 404, never 403.
 *
 * Commissioning rows carry NO package dimension — a system, a pack and a run belong to the project
 * as a whole — so package-scoped reach is resolved once, against the project, exactly as the
 * Field/HSE punch register already does for its package-less rows.
 */
@Injectable()
export class CommissioningService {
  constructor(
    @InjectRepository(CommissioningSystemEntity)
    private readonly systems: Repository<CommissioningSystemEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-098 — the system/subsystem register with the ABAC reach applied in SQL. */
  async listCommissioningSystems(
    context: RequestContext, projectId: string, query: CommissioningSystemListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'commissioning.read');
    await this.assertProjectVisible(this.systems.manager, context, projectId, scope);
    const cursor = decodeCommissioningCursor(query.cursor);
    const builder = this.systems.createQueryBuilder('system')
      .where('system.tenantId = :tenantId AND system.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    this.applyScope(builder, 'system', projectId, scope, context.tenantId);
    if (query.status) builder.andWhere('system.status = :status', { status: query.status });
    if (query.systemType) {
      builder.andWhere('system.systemType = :systemType', { systemType: query.systemType });
    }
    if (query.parentSystemId) {
      builder.andWhere('system.parentSystemId = :parentSystemId', {
        parentSystemId: query.parentSystemId
      });
    }
    if (cursor) this.applyCursor(builder, 'system', cursor, 'commissioning_systems', context.tenantId);
    const rows = await builder
      .orderBy('system.createdAt', 'DESC').addOrderBy('system.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.systemView(row)),
      meta: {
        limit: query.limit,
        nextCursor: rows.length > query.limit && last
          ? encodeCommissioningCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /** API-099 — create a system boundary; a sub-system's parent must live in the same project. */
  async createCommissioningSystem(
    context: RequestContext, projectId: string, input: CreateCommissioningSystemDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'commissioningSystem.create');
    return this.commands.execute({
      context, operation: 'API-099:create-commissioning-system', idempotencyKey,
      request: { projectId, input }, responseStatus: 201,
      resourceType: 'CommissioningSystem',
      resultReference: (result: { id: string }) => ({
        resourceType: 'CommissioningSystem', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const systems = manager.getRepository(CommissioningSystemEntity);
        if (input.parentSystemId) {
          const parentExists = await systems.existsBy({
            id: input.parentSystemId, tenantId: context.tenantId, projectId
          });
          if (!parentExists) {
            throw unprocessable(
              'PARENT_SYSTEM_NOT_FOUND', 'System cha không thuộc dự án này'
            );
          }
        }
        const row = systems.create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          parentSystemId: input.parentSystemId ?? null, code: input.code, name: input.name,
          systemType: input.systemType, boundary: input.boundary ?? {},
          status: CommissioningSystemStatus.NOT_READY,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await withConstraintMap(() => systems.save(row), {
          uq_commissioning_system_code: () => conflict(
            'COMMISSIONING_SYSTEM_CODE_CONFLICT', 'Mã system đã tồn tại trong dự án'
          ),
          ck_commissioning_system_parent: () => unprocessable(
            'PARENT_SYSTEM_INVALID', 'System không thể là cha của chính nó'
          )
        });
        await emit(this.outbox, manager, context, 'CommissioningSystem', saved.id, saved.versionNo,
          'CommissioningSystem.Created', {
            projectId, code: saved.code, systemType: saved.systemType,
            parentSystemId: saved.parentSystemId, status: saved.status,
            summary: `Commissioning system ${saved.code} created`
          });
        return this.systemView(saved);
      }
    });
  }

  /**
   * API-100 — create a test pack against an ISSUED + CLEAN procedure revision. There is no separate
   * approve operation in the catalog, so the pack is born APPROVED and immediately frozen by
   * `trg_test_pack_approved_immutable`; a revised procedure produces a NEW pack row.
   */
  async createTestPack(
    context: RequestContext, systemId: string, input: CreateTestPackDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'testPack.create');
    return this.commands.execute({
      context, operation: 'API-100:create-test-pack', idempotencyKey,
      request: { systemId, input }, responseStatus: 201, resourceType: 'TestPack',
      resultReference: (result: { id: string }) => ({
        resourceType: 'TestPack', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const system = await this.lockSystem(manager, context, systemId, scope);
        const revision = await manager.getRepository(DocumentRevisionEntity).findOneBy({
          id: input.procedureRevisionId, tenantId: context.tenantId
        });
        // An invisible revision reads as a locked procedure, never as a missing-row oracle.
        if (!revision || revision.projectId !== system.projectId
          || revision.status !== DocumentRevisionStatus.ISSUED
          || revision.scanStatus !== DocumentScanStatus.CLEAN) {
          throw unprocessable(
            'PROCEDURE_REVISION_LOCKED',
            'Test pack chỉ được tạo từ revision quy trình đã ISSUED và quét sạch mã độc'
          );
        }
        const packs = manager.getRepository(TestPackEntity);
        const approvedAt = new Date();
        const row = packs.create({
          id: randomUUID(), tenantId: context.tenantId, projectId: system.projectId,
          commissioningSystemId: system.id, code: input.code, title: input.title,
          procedureRevisionId: revision.id,
          prerequisitesSnapshot: input.prerequisitesSnapshot ?? {},
          status: TestPackStatus.APPROVED, approvedBy: context.userId, approvedAt,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await withConstraintMap(() => packs.save(row), {
          uq_test_pack_code_revision: () => conflict(
            'TEST_PACK_CONFLICT', 'Test pack cho mã và revision quy trình này đã tồn tại'
          )
        });
        await emit(this.outbox, manager, context, 'TestPack', saved.id, saved.versionNo,
          'TestPack.Created', {
            projectId: saved.projectId, commissioningSystemId: saved.commissioningSystemId,
            code: saved.code, procedureRevisionId: saved.procedureRevisionId,
            status: saved.status, summary: `Test pack ${saved.code} approved`
          });
        return this.packView(saved);
      }
    });
  }

  /** API-101 — start a run once the pack's prerequisites are met and no run is already open. */
  async startTestRun(
    context: RequestContext, testPackId: string, input: StartTestRunDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'testRun.start');
    return this.commands.execute({
      context, operation: 'API-101:start-test-run', idempotencyKey,
      request: { testPackId, input }, responseStatus: 201, resourceType: 'TestRun',
      resultReference: (result: { id: string }) => ({
        resourceType: 'TestRun', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const pack = await this.lockPack(manager, context, testPackId, scope);
        if (pack.status !== TestPackStatus.APPROVED) {
          throw unprocessable(
            'TEST_PACK_NOT_APPROVED', 'Chỉ test pack đã được phê duyệt mới được chạy'
          );
        }
        this.assertPrerequisitesMet(pack, input.satisfiedPrerequisites ?? []);
        return this.insertRun(manager, context, pack, {
          previousRunId: null, instrumentSnapshot: input.instrumentSnapshot ?? null,
          witnesses: input.witnesses ?? [], eventType: 'TestRun.Started', reason: null
        });
      }
    });
  }

  /** API-102 — record the immutable result. Evidence is mandatory whatever the outcome. */
  async completeTestRun(
    context: RequestContext, testRunId: string, input: CompleteTestRunDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'testRun.complete');
    return this.commands.execute({
      context, operation: 'API-102:complete-test-run', idempotencyKey,
      request: { testRunId, input }, responseStatus: 200,
      resourceType: 'TestRun', resourceId: testRunId,
      execute: async (manager) => {
        const run = await this.lockRun(manager, context, testRunId, scope);
        assertVersion(run.versionNo, input.expectedVersion);
        if (run.status !== TestRunStatus.IN_PROGRESS) {
          throw conflict(
            'RESULT_ALREADY_RECORDED', 'Kết quả của lần chạy này đã được ghi nhận'
          );
        }
        const runs = manager.getRepository(TestRunEntity);
        const recordedAt = new Date();
        await withConstraintMap(
          () => runs.update(
            { id: run.id, tenantId: context.tenantId },
            {
              status: TestRunStatus.RECORDED, result: input.result,
              evidenceRefs: input.evidenceRefs, rawDataRef: input.rawDataRef ?? null,
              witnessSnapshot: {
                recordedBy: context.userId, recordedAt: recordedAt.toISOString(),
                witnesses: input.witnesses ?? []
              },
              endedAt: recordedAt, recordedBy: context.userId, recordedAt,
              updatedBy: context.userId, versionNo: run.versionNo + 1
            }
          ),
          {
            ck_test_run_recorded: () => unprocessable(
              'EVIDENCE_REQUIRED', 'Ghi nhận kết quả phải kèm ít nhất một bằng chứng'
            )
          }
        );
        const updated = await runs.findOneByOrFail({ id: run.id, tenantId: context.tenantId });
        await emit(this.outbox, manager, context, 'TestRun', updated.id, updated.versionNo,
          'TestRun.Completed', {
            projectId: updated.projectId, testPackId: updated.testPackId, runNo: updated.runNo,
            result: updated.result, evidenceCount: input.evidenceRefs.length,
            summary: `Test run #${updated.runNo} ${updated.result}`
          });
        return this.runView(updated);
      }
    });
  }

  /** API-103 — a retest is a NEW run row; only a FAILED or ABORTED run may be retested. */
  async createRetest(
    context: RequestContext, testRunId: string, input: CreateRetestDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'testRun.retest');
    return this.commands.execute({
      context, operation: 'API-103:create-retest', idempotencyKey,
      request: { testRunId, input }, responseStatus: 201, resourceType: 'TestRun',
      resultReference: (result: { id: string }) => ({
        resourceType: 'TestRun', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const previous = await this.lockRun(manager, context, testRunId, scope);
        if (previous.status !== TestRunStatus.RECORDED || !canRetest(previous.result)) {
          throw unprocessable(
            'RETEST_NOT_ALLOWED',
            'Chỉ lần chạy đã ghi nhận kết quả FAILED hoặc ABORTED mới được chạy lại'
          );
        }
        const pack = await manager.getRepository(TestPackEntity).findOneByOrFail({
          id: previous.testPackId, tenantId: context.tenantId
        });
        this.assertPrerequisitesMet(pack, input.satisfiedPrerequisites ?? []);
        return this.insertRun(manager, context, pack, {
          previousRunId: previous.id, instrumentSnapshot: input.instrumentSnapshot ?? null,
          witnesses: [], eventType: 'TestRun.RetestCreated', reason: input.reason
        });
      }
    });
  }

  /** Shared insert path of API-101 and API-103; `run_no` is allocated inside the transaction. */
  private async insertRun(
    manager: EntityManager, context: RequestContext, pack: TestPackEntity,
    options: {
      previousRunId: string | null;
      instrumentSnapshot: Record<string, unknown> | null;
      witnesses: Array<Record<string, unknown>>;
      eventType: string;
      reason: string | null;
    }
  ) {
    const runs = manager.getRepository(TestRunEntity);
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(run_no), 0) + 1)::int AS "next"
      FROM test_runs WHERE tenant_id = $1 AND test_pack_id = $2`,
      [context.tenantId, pack.id]
    );
    const id = randomUUID();
    const startedAt = new Date();
    const row = runs.create({
      id, tenantId: context.tenantId, projectId: pack.projectId, testPackId: pack.id,
      previousRunId: options.previousRunId, runNo: next.next,
      status: TestRunStatus.IN_PROGRESS, result: null, rawDataRef: null,
      instrumentSnapshot: options.instrumentSnapshot,
      witnessSnapshot: options.witnesses.length > 0 ? { witnesses: options.witnesses } : null,
      evidenceRefs: [], startedAt, endedAt: null, startedBy: context.userId,
      recordedBy: null, recordedAt: null,
      createdBy: context.userId, updatedBy: context.userId
    });
    await withConstraintMap(
      () => runs.save(row),
      {
        uq_test_run_open: () => conflict(
          'RUN_IN_PROGRESS', 'Test pack này đang có một lần chạy chưa ghi nhận kết quả'
        ),
        uq_test_run_pack_run_no: () => conflict(
          'RUN_SEQUENCE_CONFLICT', 'Số thứ tự lần chạy vừa được cấp bởi yêu cầu khác'
        ),
        uq_test_run_retest_once: () => conflict(
          'RETEST_ALREADY_EXISTS', 'Lần chạy này đã có một lần chạy lại'
        )
      }
    );
    const saved = await runs.findOneByOrFail({ id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'TestRun', saved.id, saved.versionNo,
      options.eventType, {
        projectId: saved.projectId, testPackId: saved.testPackId, runNo: saved.runNo,
        previousRunId: saved.previousRunId, reason: options.reason,
        summary: `Test run #${saved.runNo} started`
      });
    return this.runView(saved);
  }

  /**
   * FR-108: a run may not start until the pack's frozen prerequisite snapshot is satisfied. The
   * snapshot's `required` array is the contract; anything else in the snapshot is descriptive.
   */
  private assertPrerequisitesMet(pack: TestPackEntity, satisfied: readonly string[]): void {
    const declared = pack.prerequisitesSnapshot?.required;
    if (!Array.isArray(declared) || declared.length === 0) return;
    const provided = new Set(satisfied);
    const missing = declared
      .filter((item): item is string => typeof item === 'string')
      .filter((item) => !provided.has(item));
    if (missing.length > 0) {
      throw unprocessable(
        'PREREQUISITES_NOT_MET',
        `Chưa đáp ứng điều kiện tiên quyết: ${missing.join(', ')}`
      );
    }
  }

  private async lockSystem(
    manager: EntityManager, context: RequestContext, systemId: string, scope: AccessScopeSets
  ): Promise<CommissioningSystemEntity> {
    const system = await manager.getRepository(CommissioningSystemEntity)
      .createQueryBuilder('system')
      .setLock('pessimistic_write')
      .where('system.id = :id AND system.tenantId = :tenantId', {
        id: systemId, tenantId: context.tenantId
      })
      .getOne();
    if (!system) throw notFound('COMMISSIONING_SYSTEM_NOT_FOUND', 'Không tìm thấy system');
    await this.assertProjectVisible(manager, context, system.projectId, scope);
    return system;
  }

  private async lockPack(
    manager: EntityManager, context: RequestContext, testPackId: string, scope: AccessScopeSets
  ): Promise<TestPackEntity> {
    const pack = await manager.getRepository(TestPackEntity).createQueryBuilder('pack')
      .setLock('pessimistic_write')
      .where('pack.id = :id AND pack.tenantId = :tenantId', {
        id: testPackId, tenantId: context.tenantId
      })
      .getOne();
    if (!pack) throw notFound('TEST_PACK_NOT_FOUND', 'Không tìm thấy test pack');
    await this.assertProjectVisible(manager, context, pack.projectId, scope);
    return pack;
  }

  private async lockRun(
    manager: EntityManager, context: RequestContext, testRunId: string, scope: AccessScopeSets
  ): Promise<TestRunEntity> {
    const run = await manager.getRepository(TestRunEntity).createQueryBuilder('run')
      .setLock('pessimistic_write')
      .where('run.id = :id AND run.tenantId = :tenantId', {
        id: testRunId, tenantId: context.tenantId
      })
      .getOne();
    if (!run) throw notFound('TEST_RUN_NOT_FOUND', 'Không tìm thấy lần chạy thử nghiệm');
    await this.assertProjectVisible(manager, context, run.projectId, scope);
    return run;
  }

  /**
   * Project visibility: tenant reach, explicit project reach, or an ACTIVE package inside the
   * project. Invisible and missing answer identically — 404 with the same code — so the endpoint
   * never becomes an existence oracle for another tenant's or project's ids.
   */
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

  /**
   * The ABAC reach as a SQL predicate, applied BEFORE pagination. Package-scoped reach resolves to
   * an EXISTS over the caller's ACTIVE packages in the row's project, so a caller with no such
   * package gets an empty page from SQL rather than a page pruned after the fact.
   */
  private applyScope<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>, alias: string, projectId: string, scope: AccessScopeSets,
    tenantId: string
  ): void {
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return;
    if (scope.packageIds.length === 0) {
      builder.andWhere('1 = 0');
      return;
    }
    builder.andWhere(
      `EXISTS (
        SELECT 1 FROM packages reachable
        WHERE reachable.tenant_id = :scopeTenantId
          AND reachable.project_id = ${alias}.project_id
          AND reachable.status = 'ACTIVE'
          AND reachable.id IN (:...scopePackageIds)
      )`,
      { scopeTenantId: tenantId, scopePackageIds: scope.packageIds }
    );
  }

  /**
   * Keyset predicate compared row-wise against the cursor row's stored values.
   *
   * The naive form — `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)` —
   * silently loses rows. Postgres keeps `timestamptz` at microsecond precision while a JS `Date`
   * (and so the ISO string inside the cursor) only carries milliseconds, so any row whose stored
   * timestamp has sub-millisecond digits matches neither branch and disappears from the next page.
   * Reading the boundary straight out of `table` compares the real stored values instead, scoped by
   * tenant, and `(created_at, id) < (…)` stays a row-wise comparison the ordering index can drive.
   *
   * When the cursor row itself has gone the millisecond comparison is the fallback — a marginally
   * conservative page beats failing a request that carries a stale cursor.
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

  private systemView(row: CommissioningSystemEntity) {
    return {
      id: row.id, projectId: row.projectId, parentSystemId: row.parentSystemId,
      code: row.code, name: row.name, systemType: row.systemType, boundary: row.boundary,
      status: row.status, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private packView(row: TestPackEntity) {
    return {
      id: row.id, projectId: row.projectId, commissioningSystemId: row.commissioningSystemId,
      code: row.code, title: row.title, procedureRevisionId: row.procedureRevisionId,
      prerequisitesSnapshot: row.prerequisitesSnapshot, status: row.status,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private runView(row: TestRunEntity) {
    return {
      id: row.id, projectId: row.projectId, testPackId: row.testPackId,
      previousRunId: row.previousRunId, runNo: row.runNo, status: row.status,
      result: row.result, rawDataRef: row.rawDataRef,
      instrumentSnapshot: row.instrumentSnapshot, witnessSnapshot: row.witnessSnapshot,
      evidenceRefs: row.evidenceRefs, startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
      startedBy: row.startedBy, recordedBy: row.recordedBy,
      recordedAt: row.recordedAt === null ? null : row.recordedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }
}
