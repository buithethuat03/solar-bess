import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { In, type EntityManager } from 'typeorm';
import {
  CapaActionEntity, CapaActionStatus, DocumentEntity, DocumentRevisionEntity,
  DocumentRevisionStatus, DocumentScanStatus, InspectionEntity, InspectionStatus,
  InspectionTestPlanEntity, NcrDispositionCycleEntity, NcrEntity, NcrStatus, PackageEntity,
  ProjectEntity, PunchCategory, PunchClosureCycleEntity, PunchItemEntity, PunchItemStatus,
  QualityCycleDecision, UserAccountEntity
} from '../../database/entities';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import {
  NCR_RETURN_STATUS, NCR_TRANSITIONS, PUNCH_RETURN_STATUS, PUNCH_TRANSITIONS, canTransition,
  type NcrTransitionCommand, type PunchTransitionCommand
} from './domain/state-policy';
import {
  assertVersion, conflict, emit, inScope, notFound, type RequestContext, unprocessable,
  withConstraintMap
} from './domain/support';
import type {
  InspectionCommandDto, NcrCommandDto, PunchCommandDto
} from './dto/field-hse-quality.dto';

/**
 * Quality control (API-095…API-097) — three multiplexed command endpoints, each a discriminated
 * union on `commandType`, each answering a fixed 200 with the resulting resource + versionNo.
 *
 * Recorded V1 decision for API-095: no ITP-create operation exists in the catalog, so the FIRST
 * command for an unknown `{itpId}` treats that id as a document revision id and materializes the
 * approved ITP from it — the revision must be ISSUED with a CLEAN malware scan, and the ITP's id
 * IS the revision id (1:1). Every later call finds the row by primary key.
 *
 * Independence rules (verifier ≠ owner, disposition approver ≠ raiser, cycle decider ≠ proposer)
 * are checked here for a domain error and enforced again as row constraints.
 */
@Injectable()
export class QualityControlService {
  constructor(
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-095 — REQUEST (open a hold-point inspection) or RECORD (write the immutable result). */
  async inspectionCommand(
    context: RequestContext, itpId: string, input: InspectionCommandDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'inspection.manage');
    return this.commands.execute({
      context, operation: 'API-095:inspection-command', idempotencyKey,
      request: { itpId, input }, responseStatus: 200,
      resourceType: 'Inspection',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Inspection', resourceId: result.id, responseStatus: 200
      }),
      execute: async (manager) => {
        const itp = await this.resolveInspectionTestPlan(manager, context, itpId, scope, input);
        return input.commandType === 'REQUEST'
          ? this.requestInspection(manager, context, itp, input)
          : this.recordInspection(manager, context, itp, input);
      }
    });
  }

  /** API-096 — the NCR lifecycle as one multiplexed command endpoint. */
  async ncrCommand(
    context: RequestContext, projectId: string, input: NcrCommandDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'ncr.manage');
    return this.commands.execute({
      context, operation: 'API-096:ncr-command', idempotencyKey,
      request: { projectId, input }, responseStatus: 200,
      resourceType: 'Ncr',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Ncr', resourceId: result.id, responseStatus: 200
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        if (input.commandType === 'RAISE') {
          return this.raiseNcr(manager, context, projectId, input);
        }
        if (input.commandType === 'VERIFY_CAPA') {
          return this.verifyCapa(manager, context, projectId, input);
        }
        const ncr = await this.lockNcr(manager, context, projectId, input, scope);
        if (input.commandType === 'RECORD_CAPA') {
          return this.recordCapa(manager, context, ncr, input);
        }
        return this.transitionNcr(manager, context, ncr, input);
      }
    });
  }

  /** API-097 — the punch lifecycle as one multiplexed command endpoint. */
  async punchCommand(
    context: RequestContext, projectId: string, input: PunchCommandDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'punch.manage');
    return this.commands.execute({
      context, operation: 'API-097:punch-command', idempotencyKey,
      request: { projectId, input }, responseStatus: 200,
      resourceType: 'PunchItem',
      resultReference: (result: { id: string }) => ({
        resourceType: 'PunchItem', resourceId: result.id, responseStatus: 200
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        if (input.commandType === 'CREATE') {
          return this.createPunchItem(manager, context, projectId, input);
        }
        return this.transitionPunchItem(manager, context, projectId, input);
      }
    });
  }

  /**
   * Finds the ITP by primary key, or — first call only — materializes it from the ISSUED+CLEAN
   * document revision whose id equals the path id. Out of scope reads as missing (404).
   */
  private async resolveInspectionTestPlan(
    manager: EntityManager, context: RequestContext, itpId: string, scope: AccessScopeSets,
    input: InspectionCommandDto
  ): Promise<InspectionTestPlanEntity> {
    const plans = manager.getRepository(InspectionTestPlanEntity);
    const existing = await plans.findOneBy({ id: itpId, tenantId: context.tenantId });
    if (existing) {
      if (!inScope(existing.projectId, existing.packageId, scope)) {
        throw notFound('ITP_NOT_FOUND', 'Không tìm thấy inspection test plan');
      }
      return existing;
    }
    if (input.commandType !== 'REQUEST') {
      throw notFound('ITP_NOT_FOUND', 'Không tìm thấy inspection test plan');
    }
    const revision = await manager.getRepository(DocumentRevisionEntity).findOneBy({
      id: itpId, tenantId: context.tenantId
    });
    if (!revision) throw notFound('ITP_NOT_FOUND', 'Không tìm thấy inspection test plan');
    const document = await manager.getRepository(DocumentEntity).findOneBy({
      id: revision.documentId, tenantId: context.tenantId
    });
    if (!document || !inScope(document.projectId, document.packageId, scope)) {
      throw notFound('ITP_NOT_FOUND', 'Không tìm thấy inspection test plan');
    }
    if (revision.status !== DocumentRevisionStatus.ISSUED
      || revision.scanStatus !== DocumentScanStatus.CLEAN) {
      throw unprocessable(
        'ITP_SOURCE_NOT_ISSUED', 'ITP chỉ được tạo từ revision đã ISSUED và quét sạch mã độc'
      );
    }
    if (document.packageId === null) {
      throw unprocessable('ITP_PACKAGE_REQUIRED', 'Tài liệu ITP phải thuộc một gói thầu');
    }
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(version), 0) + 1)::int AS "next"
      FROM inspection_test_plans WHERE tenant_id = $1 AND package_id = $2`,
      [context.tenantId, document.packageId]
    );
    await withConstraintMap(
      () => plans.insert({
        id: revision.id, tenantId: context.tenantId, projectId: document.projectId,
        packageId: document.packageId!, documentRevisionId: revision.id,
        version: next.next, createdBy: context.userId
      }),
      {
        uq_itp_package_version: () => conflict(
          'ITP_VERSION_CONFLICT', 'ITP version vừa được cấp bởi yêu cầu khác; hãy thử lại'
        ),
        uq_itp_document_revision: () => conflict(
          'ITP_ALREADY_MATERIALIZED', 'ITP cho revision này vừa được tạo bởi yêu cầu khác'
        )
      }
    );
    const created = await plans.findOneByOrFail({ id: revision.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'InspectionTestPlan', created.id, 1,
      'InspectionTestPlan.Materialized', {
        projectId: created.projectId, packageId: created.packageId,
        documentRevisionId: created.documentRevisionId, version: created.version,
        summary: `ITP v${created.version} materialized from issued revision`
      });
    return created;
  }

  private async requestInspection(
    manager: EntityManager, context: RequestContext, itp: InspectionTestPlanEntity,
    input: InspectionCommandDto
  ) {
    if (!input.holdPointRef) {
      throw unprocessable('HOLD_POINT_REQUIRED', 'REQUEST phải khai báo hold point');
    }
    const inspections = manager.getRepository(InspectionEntity);
    const [latest] = await manager.query<Array<{ maxSequence: number; lastResult: string | null }>>(
      `SELECT COALESCE(MAX(sequence_no), 0)::int AS "maxSequence",
        (SELECT result FROM inspections last
          WHERE last.tenant_id = $1 AND last.itp_id = $2 AND last.hold_point_ref = $3
          ORDER BY last.sequence_no DESC LIMIT 1) AS "lastResult"
      FROM inspections WHERE tenant_id = $1 AND itp_id = $2 AND hold_point_ref = $3`,
      [context.tenantId, itp.id, input.holdPointRef]
    );
    if (latest.lastResult === 'PASS') {
      throw unprocessable(
        'HOLD_POINT_ALREADY_PASSED', 'Hold point này đã đạt; không cần tái kiểm tra'
      );
    }
    const id = randomUUID();
    await withConstraintMap(
      () => inspections.insert({
        id, tenantId: context.tenantId, projectId: itp.projectId, itpId: itp.id,
        holdPointRef: input.holdPointRef!, sequenceNo: latest.maxSequence + 1,
        status: InspectionStatus.REQUESTED, result: null, evidenceRefs: [],
        witnessSnapshot: null, requestedBy: context.userId, recordedBy: null, recordedAt: null,
        createdBy: context.userId, updatedBy: context.userId
      }),
      {
        uq_inspection_hold_point_open: () => conflict(
          'INSPECTION_ALREADY_REQUESTED', 'Hold point này đang có yêu cầu kiểm tra mở'
        ),
        uq_inspection_hold_point_sequence: () => conflict(
          'INSPECTION_SEQUENCE_CONFLICT', 'Trình tự kiểm tra vừa được cấp bởi yêu cầu khác'
        )
      }
    );
    const saved = await inspections.findOneByOrFail({ id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'Inspection', saved.id, saved.versionNo,
      'Inspection.Requested', {
        projectId: saved.projectId, itpId: saved.itpId, holdPointRef: saved.holdPointRef,
        sequenceNo: saved.sequenceNo,
        summary: `Inspection ${saved.holdPointRef} #${saved.sequenceNo} requested`
      });
    return this.inspectionView(saved, itp);
  }

  private async recordInspection(
    manager: EntityManager, context: RequestContext, itp: InspectionTestPlanEntity,
    input: InspectionCommandDto
  ) {
    if (!input.inspectionId || input.expectedVersion === undefined) {
      throw unprocessable(
        'INSPECTION_REFERENCE_REQUIRED', 'RECORD phải khai báo inspection và expectedVersion'
      );
    }
    if (!input.result) {
      throw unprocessable('RESULT_REQUIRED', 'RECORD phải khai báo kết quả PASS/FAIL');
    }
    if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
      throw unprocessable('EVIDENCE_REQUIRED', 'RECORD phải kèm ít nhất một bằng chứng');
    }
    const inspections = manager.getRepository(InspectionEntity);
    const inspection = await inspections.createQueryBuilder('inspection')
      .setLock('pessimistic_write')
      .where(
        `inspection.id = :id AND inspection.tenantId = :tenantId
          AND inspection.itpId = :itpId`,
        { id: input.inspectionId, tenantId: context.tenantId, itpId: itp.id }
      )
      .getOne();
    if (!inspection) throw notFound('INSPECTION_NOT_FOUND', 'Không tìm thấy inspection');
    assertVersion(inspection.versionNo, input.expectedVersion);
    if (inspection.status !== InspectionStatus.REQUESTED) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', 'Chỉ inspection REQUESTED mới được ghi kết quả'
      );
    }
    const recordedAt = new Date();
    await inspections.update(
      { id: inspection.id, tenantId: context.tenantId },
      {
        status: InspectionStatus.RECORDED, result: input.result,
        evidenceRefs: input.evidenceRefs,
        witnessSnapshot: {
          recordedBy: context.userId, recordedAt: recordedAt.toISOString(),
          witnesses: input.witnesses ?? []
        },
        recordedBy: context.userId, recordedAt,
        updatedBy: context.userId, versionNo: inspection.versionNo + 1
      }
    );
    const updated = await inspections.findOneByOrFail({
      id: inspection.id, tenantId: context.tenantId
    });
    await emit(this.outbox, manager, context, 'Inspection', updated.id, updated.versionNo,
      'Inspection.Recorded', {
        projectId: updated.projectId, itpId: updated.itpId, holdPointRef: updated.holdPointRef,
        sequenceNo: updated.sequenceNo, result: updated.result,
        evidenceCount: input.evidenceRefs.length,
        summary: `Inspection ${updated.holdPointRef} #${updated.sequenceNo} ${updated.result}`
      });
    return this.inspectionView(updated, itp);
  }

  private async raiseNcr(
    manager: EntityManager, context: RequestContext, projectId: string, input: NcrCommandDto
  ) {
    this.require(input.code, 'CODE_REQUIRED', 'RAISE phải khai báo mã NCR');
    this.require(input.title, 'TITLE_REQUIRED', 'RAISE phải khai báo tiêu đề');
    this.require(input.description, 'DESCRIPTION_REQUIRED', 'RAISE phải khai báo mô tả');
    this.require(input.severity, 'SEVERITY_REQUIRED', 'RAISE phải khai báo mức độ');
    if (input.packageId) {
      const packageExists = await manager.getRepository(PackageEntity).existsBy({
        id: input.packageId, tenantId: context.tenantId, projectId
      });
      if (!packageExists) {
        throw unprocessable('PACKAGE_NOT_FOUND', 'Gói thầu không thuộc dự án này');
      }
    }
    const ownerId = input.ownerUserId ?? context.userId;
    await this.assertUserExists(manager, context, ownerId);
    const ncrs = manager.getRepository(NcrEntity);
    const row = ncrs.create({
      id: randomUUID(), tenantId: context.tenantId, projectId,
      packageId: input.packageId ?? null, code: input.code!, title: input.title!,
      description: input.description!, severity: input.severity!, status: NcrStatus.OPEN,
      raisedBy: context.userId, ownerId, containmentAction: null, rootCause: null,
      disposition: null, dispositionApprovedBy: null, verifiedBy: null, verifiedAt: null,
      closureEvidenceRefs: [], createdBy: context.userId, updatedBy: context.userId
    });
    const saved = await withConstraintMap(() => ncrs.save(row), {
      uq_ncr_project_code: () => conflict('NCR_CODE_CONFLICT', 'Mã NCR đã tồn tại trong dự án')
    });
    await emit(this.outbox, manager, context, 'Ncr', saved.id, saved.versionNo, 'Ncr.Raised', {
      projectId, packageId: saved.packageId, code: saved.code, severity: saved.severity,
      ownerId: saved.ownerId, summary: `NCR ${saved.code} raised`
    });
    return this.ncrView(saved);
  }

  private async transitionNcr(
    manager: EntityManager, context: RequestContext, ncr: NcrEntity, input: NcrCommandDto
  ) {
    const command = input.commandType as NcrTransitionCommand;
    if (!canTransition(NCR_TRANSITIONS, command, ncr.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', `NCR đang ${ncr.status} không nhận lệnh ${command}`
      );
    }
    const ncrs = manager.getRepository(NcrEntity);
    const patch: Partial<NcrEntity> = {
      updatedBy: context.userId, versionNo: ncr.versionNo + 1
    };
    let eventType = `Ncr.${command}`;
    let cycleView: Record<string, unknown> | null = null;

    switch (command) {
      case 'CONTAIN': {
        this.require(
          input.containmentAction, 'CONTAINMENT_REQUIRED', 'CONTAIN phải mô tả biện pháp cô lập'
        );
        patch.status = NcrStatus.CONTAINED;
        patch.containmentAction = input.containmentAction!;
        eventType = 'Ncr.Contained';
        break;
      }
      case 'RECORD_ROOT_CAUSE': {
        this.require(input.rootCause, 'ROOT_CAUSE_REQUIRED', 'Phải khai báo nguyên nhân gốc');
        patch.status = NcrStatus.ROOT_CAUSE;
        patch.rootCause = input.rootCause!;
        eventType = 'Ncr.RootCauseRecorded';
        break;
      }
      case 'PROPOSE_DISPOSITION': {
        this.require(input.disposition, 'DISPOSITION_REQUIRED', 'Phải đề xuất disposition');
        this.require(input.reason, 'REASON_REQUIRED', 'Phải kèm thuyết minh đề xuất');
        cycleView = await this.openNcrDispositionCycle(manager, context, ncr, input);
        patch.status = NcrStatus.DISPOSITION_PROPOSED;
        eventType = 'Ncr.DispositionProposed';
        break;
      }
      case 'DECIDE_DISPOSITION': {
        this.require(input.decision, 'DECISION_REQUIRED', 'Phải khai báo quyết định');
        this.require(input.reason, 'REASON_REQUIRED', 'Phải kèm thuyết minh quyết định');
        const cycle = await this.decideNcrDispositionCycle(manager, context, ncr, input);
        cycleView = cycle.view;
        if (input.decision === QualityCycleDecision.APPROVE) {
          if (context.userId === ncr.raisedBy) {
            throw unprocessable(
              'SOD_CONFLICT', 'Người lập NCR không được tự phê duyệt disposition'
            );
          }
          patch.status = NcrStatus.DISPOSITION_APPROVED;
          patch.disposition = cycle.proposedDisposition;
          patch.dispositionApprovedBy = context.userId;
          eventType = 'Ncr.DispositionApproved';
        } else {
          patch.status = NCR_RETURN_STATUS;
          eventType = 'Ncr.DispositionReturned';
        }
        break;
      }
      case 'START_RECTIFICATION': {
        patch.status = NcrStatus.RECTIFICATION;
        eventType = 'Ncr.RectificationStarted';
        break;
      }
      case 'REQUEST_VERIFICATION': {
        patch.status = NcrStatus.READY_FOR_VERIFICATION;
        eventType = 'Ncr.VerificationRequested';
        break;
      }
      case 'VERIFY_CLOSE': {
        if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
          throw unprocessable('EVIDENCE_REQUIRED', 'Đóng NCR phải kèm ít nhất một bằng chứng');
        }
        if (context.userId === ncr.ownerId) {
          throw unprocessable('SOD_CONFLICT', 'Người phụ trách NCR không được tự xác nhận đóng');
        }
        patch.status = NcrStatus.CLOSED;
        patch.verifiedBy = context.userId;
        patch.verifiedAt = new Date();
        patch.closureEvidenceRefs = input.evidenceRefs!;
        eventType = 'Ncr.Closed';
        break;
      }
      case 'REOPEN': {
        this.require(input.reason, 'REASON_REQUIRED', 'REOPEN phải kèm lý do');
        patch.status = NcrStatus.REOPENED;
        eventType = 'Ncr.Reopened';
        break;
      }
    }

    await withConstraintMap(
      () => ncrs.update({ id: ncr.id, tenantId: context.tenantId }, patch),
      {
        ck_ncr_verifier_independent: () => unprocessable(
          'SOD_CONFLICT', 'Người phụ trách NCR không được tự xác nhận đóng'
        ),
        ck_ncr_disposition_independent: () => unprocessable(
          'SOD_CONFLICT', 'Người lập NCR không được tự phê duyệt disposition'
        )
      }
    );
    const updated = await ncrs.findOneByOrFail({ id: ncr.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'Ncr', updated.id, updated.versionNo, eventType, {
      projectId: updated.projectId, code: updated.code, status: updated.status,
      disposition: updated.disposition, reason: input.reason ?? null,
      summary: `NCR ${updated.code} → ${updated.status}`
    });
    return { ...this.ncrView(updated), dispositionCycle: cycleView };
  }

  private async openNcrDispositionCycle(
    manager: EntityManager, context: RequestContext, ncr: NcrEntity, input: NcrCommandDto
  ): Promise<Record<string, unknown>> {
    const cycles = manager.getRepository(NcrDispositionCycleEntity);
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(sequence_no), 0) + 1)::int AS "next"
      FROM ncr_disposition_cycles WHERE tenant_id = $1 AND ncr_id = $2`,
      [context.tenantId, ncr.id]
    );
    const id = randomUUID();
    await withConstraintMap(
      () => cycles.insert({
        id, tenantId: context.tenantId, projectId: ncr.projectId, ncrId: ncr.id,
        sequenceNo: next.next, proposedDisposition: input.disposition!,
        proposalComment: input.reason!, proposedBy: context.userId, proposedAt: new Date(),
        decision: null, decisionComment: null, decidedBy: null, decidedAt: null
      }),
      {
        uq_ncr_disposition_cycle_open: () => conflict(
          'DISPOSITION_CYCLE_OPEN', 'NCR này đang có đề xuất disposition chưa được quyết định'
        ),
        uq_ncr_disposition_cycle_sequence: () => conflict(
          'DISPOSITION_CYCLE_CONFLICT', 'Trình tự cycle vừa được cấp bởi yêu cầu khác'
        )
      }
    );
    const saved = await cycles.findOneByOrFail({ id, tenantId: context.tenantId });
    return this.cycleView(saved);
  }

  private async decideNcrDispositionCycle(
    manager: EntityManager, context: RequestContext, ncr: NcrEntity, input: NcrCommandDto
  ): Promise<{ view: Record<string, unknown>; proposedDisposition: NcrEntity['disposition'] }> {
    const cycles = manager.getRepository(NcrDispositionCycleEntity);
    const open = await cycles.createQueryBuilder('cycle')
      .setLock('pessimistic_write')
      .where(
        `cycle.tenantId = :tenantId AND cycle.ncrId = :ncrId AND cycle.decision IS NULL`,
        { tenantId: context.tenantId, ncrId: ncr.id }
      )
      .getOne();
    if (!open) {
      throw unprocessable('NO_OPEN_CYCLE', 'NCR này không có đề xuất disposition đang chờ');
    }
    if (open.proposedBy === context.userId) {
      throw unprocessable('SOD_CONFLICT', 'Người đề xuất disposition không được tự quyết định');
    }
    await withConstraintMap(
      () => cycles.update(
        { id: open.id, tenantId: context.tenantId },
        {
          decision: input.decision!, decisionComment: input.reason!,
          decidedBy: context.userId, decidedAt: new Date()
        }
      ),
      {
        ck_ncr_disposition_cycle_sod: () => unprocessable(
          'SOD_CONFLICT', 'Người đề xuất disposition không được tự quyết định'
        )
      }
    );
    const decided = await cycles.findOneByOrFail({ id: open.id, tenantId: context.tenantId });
    return { view: this.cycleView(decided), proposedDisposition: decided.proposedDisposition };
  }

  private async recordCapa(
    manager: EntityManager, context: RequestContext, ncr: NcrEntity, input: NcrCommandDto
  ) {
    this.require(input.capaTitle, 'CAPA_TITLE_REQUIRED', 'RECORD_CAPA phải khai báo tiêu đề');
    if (ncr.status === NcrStatus.CLOSED) {
      throw unprocessable('INVALID_STATE_TRANSITION', 'NCR đã đóng không nhận CAPA mới');
    }
    const ownerId = input.capaOwnerUserId ?? context.userId;
    await this.assertUserExists(manager, context, ownerId);
    const capas = manager.getRepository(CapaActionEntity);
    const row = capas.create({
      id: randomUUID(), tenantId: context.tenantId, projectId: ncr.projectId,
      hseIncidentId: null, ncrId: ncr.id, title: input.capaTitle!, ownerId,
      dueDate: input.capaDueDate ?? null, status: CapaActionStatus.OPEN,
      effectivenessAssessment: null, verifiedBy: null, verifiedAt: null,
      createdBy: context.userId, updatedBy: context.userId
    });
    const saved = await capas.save(row);
    await emit(this.outbox, manager, context, 'CapaAction', saved.id, saved.versionNo,
      'CapaAction.Recorded', {
        projectId: saved.projectId, ncrId: saved.ncrId, ownerId: saved.ownerId,
        summary: `CAPA recorded for NCR ${ncr.code}`
      });
    return this.capaView(saved);
  }

  private async verifyCapa(
    manager: EntityManager, context: RequestContext, projectId: string, input: NcrCommandDto
  ) {
    this.require(input.capaActionId, 'CAPA_REFERENCE_REQUIRED', 'VERIFY_CAPA phải khai báo CAPA');
    this.require(
      input.effectivenessAssessment,
      'EFFECTIVENESS_REQUIRED', 'VERIFY_CAPA phải đánh giá hiệu quả'
    );
    if (input.expectedVersion === undefined) {
      throw unprocessable('EXPECTED_VERSION_REQUIRED', 'VERIFY_CAPA phải kèm expectedVersion');
    }
    const capas = manager.getRepository(CapaActionEntity);
    const capa = await capas.createQueryBuilder('capa')
      .setLock('pessimistic_write')
      .where(
        `capa.id = :id AND capa.tenantId = :tenantId AND capa.projectId = :projectId`,
        { id: input.capaActionId, tenantId: context.tenantId, projectId }
      )
      .getOne();
    if (!capa) throw notFound('CAPA_NOT_FOUND', 'Không tìm thấy CAPA');
    assertVersion(capa.versionNo, input.expectedVersion);
    if (capa.status !== CapaActionStatus.OPEN) {
      throw unprocessable('INVALID_STATE_TRANSITION', 'CAPA này đã được xác nhận');
    }
    if (capa.ownerId === context.userId) {
      throw unprocessable('SOD_CONFLICT', 'Người phụ trách CAPA không được tự xác nhận hiệu quả');
    }
    await withConstraintMap(
      () => capas.update(
        { id: capa.id, tenantId: context.tenantId },
        {
          status: CapaActionStatus.VERIFIED,
          effectivenessAssessment: input.effectivenessAssessment!,
          verifiedBy: context.userId, verifiedAt: new Date(),
          updatedBy: context.userId, versionNo: capa.versionNo + 1
        }
      ),
      {
        ck_capa_verifier_independent: () => unprocessable(
          'SOD_CONFLICT', 'Người phụ trách CAPA không được tự xác nhận hiệu quả'
        )
      }
    );
    const updated = await capas.findOneByOrFail({ id: capa.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'CapaAction', updated.id, updated.versionNo,
      'CapaAction.Verified', {
        projectId: updated.projectId, ncrId: updated.ncrId, verifiedBy: updated.verifiedBy,
        summary: 'CAPA effectiveness verified'
      });
    return this.capaView(updated);
  }

  private async createPunchItem(
    manager: EntityManager, context: RequestContext, projectId: string, input: PunchCommandDto
  ) {
    this.require(input.code, 'CODE_REQUIRED', 'CREATE phải khai báo mã punch');
    this.require(input.title, 'TITLE_REQUIRED', 'CREATE phải khai báo tiêu đề');
    this.require(input.category, 'CATEGORY_REQUIRED', 'CREATE phải khai báo category');
    const category = input.category!;
    if (category === PunchCategory.A
      && (input.codBlocking === false || input.waivable === true)) {
      throw unprocessable(
        'PUNCH_CATEGORY_A_INVALID', 'Punch category A luôn chặn COD và không thể waive'
      );
    }
    const codBlocking = category === PunchCategory.A ? true : (input.codBlocking ?? false);
    const waivable = category === PunchCategory.A ? false : (input.waivable ?? true);
    const ownerId = input.ownerUserId ?? context.userId;
    await this.assertUserExists(manager, context, ownerId);
    const punches = manager.getRepository(PunchItemEntity);
    const row = punches.create({
      id: randomUUID(), tenantId: context.tenantId, projectId, code: input.code!,
      title: input.title!, description: input.description ?? null, category, codBlocking,
      waivable, status: PunchItemStatus.OPEN, raisedBy: context.userId, ownerId,
      waivedBy: null, waivedReason: null, verifiedBy: null, verifiedAt: null,
      closureEvidenceRefs: [], createdBy: context.userId, updatedBy: context.userId
    });
    const saved = await withConstraintMap(() => punches.save(row), {
      uq_punch_project_code: () => conflict(
        'PUNCH_CODE_CONFLICT', 'Mã punch đã tồn tại trong dự án'
      ),
      ck_punch_category_a_blocking: () => unprocessable(
        'PUNCH_CATEGORY_A_INVALID', 'Punch category A luôn chặn COD và không thể waive'
      ),
      ck_punch_category_a_not_waivable: () => unprocessable(
        'PUNCH_CATEGORY_A_INVALID', 'Punch category A luôn chặn COD và không thể waive'
      )
    });
    await emit(this.outbox, manager, context, 'PunchItem', saved.id, saved.versionNo,
      'PunchItem.Created', {
        projectId, code: saved.code, category: saved.category, codBlocking: saved.codBlocking,
        waivable: saved.waivable, ownerId: saved.ownerId,
        summary: `Punch ${saved.code} (cat ${saved.category}) created`
      });
    return this.punchView(saved);
  }

  private async transitionPunchItem(
    manager: EntityManager, context: RequestContext, projectId: string, input: PunchCommandDto
  ) {
    if (!input.punchItemId || input.expectedVersion === undefined) {
      throw unprocessable(
        'PUNCH_REFERENCE_REQUIRED', 'Lệnh này phải khai báo punchItemId và expectedVersion'
      );
    }
    const punches = manager.getRepository(PunchItemEntity);
    const punch = await punches.createQueryBuilder('punch')
      .setLock('pessimistic_write')
      .where(
        `punch.id = :id AND punch.tenantId = :tenantId AND punch.projectId = :projectId`,
        { id: input.punchItemId, tenantId: context.tenantId, projectId }
      )
      .getOne();
    if (!punch) throw notFound('PUNCH_NOT_FOUND', 'Không tìm thấy punch item');
    assertVersion(punch.versionNo, input.expectedVersion);
    const command = input.commandType as PunchTransitionCommand;
    if (!canTransition(PUNCH_TRANSITIONS, command, punch.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', `Punch đang ${punch.status} không nhận lệnh ${command}`
      );
    }
    const patch: Partial<PunchItemEntity> = {
      updatedBy: context.userId, versionNo: punch.versionNo + 1
    };
    let eventType = `PunchItem.${command}`;
    let cycleView: Record<string, unknown> | null = null;

    if (command === 'REQUEST_CLOSURE') {
      this.require(input.reason, 'REASON_REQUIRED', 'REQUEST_CLOSURE phải kèm thuyết minh');
      if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
        throw unprocessable('EVIDENCE_REQUIRED', 'REQUEST_CLOSURE phải kèm bằng chứng');
      }
      cycleView = await this.openPunchClosureCycle(manager, context, punch, input);
      patch.status = PunchItemStatus.READY_FOR_VERIFICATION;
      eventType = 'PunchItem.ClosureRequested';
    } else if (command === 'DECIDE_CLOSURE') {
      this.require(input.decision, 'DECISION_REQUIRED', 'DECIDE_CLOSURE phải khai báo quyết định');
      this.require(input.reason, 'REASON_REQUIRED', 'DECIDE_CLOSURE phải kèm thuyết minh');
      const cycle = await this.decidePunchClosureCycle(manager, context, punch, input);
      cycleView = cycle.view;
      if (input.decision === QualityCycleDecision.APPROVE) {
        if (context.userId === punch.ownerId) {
          throw unprocessable(
            'SOD_CONFLICT', 'Người phụ trách punch không được tự xác nhận đóng'
          );
        }
        patch.status = PunchItemStatus.CLOSED;
        patch.verifiedBy = context.userId;
        patch.verifiedAt = new Date();
        patch.closureEvidenceRefs = input.evidenceRefs ?? cycle.requestEvidenceRefs;
        eventType = 'PunchItem.Closed';
      } else {
        patch.status = PUNCH_RETURN_STATUS;
        eventType = 'PunchItem.ClosureReturned';
      }
    } else {
      this.require(input.reason, 'REASON_REQUIRED', 'WAIVE phải kèm lý do');
      if (!punch.waivable) {
        throw unprocessable('PUNCH_NOT_WAIVABLE', 'Punch item này không thể waive');
      }
      patch.status = PunchItemStatus.WAIVED;
      patch.waivedBy = context.userId;
      patch.waivedReason = input.reason!;
      eventType = 'PunchItem.Waived';
    }

    await withConstraintMap(
      () => punches.update({ id: punch.id, tenantId: context.tenantId }, patch),
      {
        ck_punch_verifier_independent: () => unprocessable(
          'SOD_CONFLICT', 'Người phụ trách punch không được tự xác nhận đóng'
        ),
        ck_punch_waiver: () => unprocessable(
          'PUNCH_NOT_WAIVABLE', 'Punch item này không thể waive'
        )
      }
    );
    const updated = await punches.findOneByOrFail({ id: punch.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'PunchItem', updated.id, updated.versionNo,
      eventType, {
        projectId: updated.projectId, code: updated.code, status: updated.status,
        category: updated.category, summary: `Punch ${updated.code} → ${updated.status}`
      });
    return { ...this.punchView(updated), closureCycle: cycleView };
  }

  private async openPunchClosureCycle(
    manager: EntityManager, context: RequestContext, punch: PunchItemEntity,
    input: PunchCommandDto
  ): Promise<Record<string, unknown>> {
    const cycles = manager.getRepository(PunchClosureCycleEntity);
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(sequence_no), 0) + 1)::int AS "next"
      FROM punch_closure_cycles WHERE tenant_id = $1 AND punch_item_id = $2`,
      [context.tenantId, punch.id]
    );
    const id = randomUUID();
    await withConstraintMap(
      () => cycles.insert({
        id, tenantId: context.tenantId, projectId: punch.projectId, punchItemId: punch.id,
        sequenceNo: next.next, requestComment: input.reason!,
        requestEvidenceRefs: input.evidenceRefs!, requestedBy: context.userId,
        requestedAt: new Date(), decision: null, decisionComment: null,
        decidedBy: null, decidedAt: null
      }),
      {
        uq_punch_closure_cycle_open: () => conflict(
          'CLOSURE_CYCLE_OPEN', 'Punch này đang có yêu cầu đóng chưa được quyết định'
        ),
        uq_punch_closure_cycle_sequence: () => conflict(
          'CLOSURE_CYCLE_CONFLICT', 'Trình tự cycle vừa được cấp bởi yêu cầu khác'
        )
      }
    );
    const saved = await cycles.findOneByOrFail({ id, tenantId: context.tenantId });
    return this.punchCycleView(saved);
  }

  private async decidePunchClosureCycle(
    manager: EntityManager, context: RequestContext, punch: PunchItemEntity,
    input: PunchCommandDto
  ): Promise<{ view: Record<string, unknown>; requestEvidenceRefs: string[] }> {
    const cycles = manager.getRepository(PunchClosureCycleEntity);
    const open = await cycles.createQueryBuilder('cycle')
      .setLock('pessimistic_write')
      .where(
        `cycle.tenantId = :tenantId AND cycle.punchItemId = :punchItemId
          AND cycle.decision IS NULL`,
        { tenantId: context.tenantId, punchItemId: punch.id }
      )
      .getOne();
    if (!open) {
      throw unprocessable('NO_OPEN_CYCLE', 'Punch này không có yêu cầu đóng đang chờ');
    }
    if (open.requestedBy === context.userId) {
      throw unprocessable('SOD_CONFLICT', 'Người yêu cầu đóng punch không được tự quyết định');
    }
    await withConstraintMap(
      () => cycles.update(
        { id: open.id, tenantId: context.tenantId },
        {
          decision: input.decision!, decisionComment: input.reason!,
          decidedBy: context.userId, decidedAt: new Date()
        }
      ),
      {
        ck_punch_closure_cycle_sod: () => unprocessable(
          'SOD_CONFLICT', 'Người yêu cầu đóng punch không được tự quyết định'
        )
      }
    );
    const decided = await cycles.findOneByOrFail({ id: open.id, tenantId: context.tenantId });
    return { view: this.punchCycleView(decided), requestEvidenceRefs: decided.requestEvidenceRefs };
  }

  private async lockNcr(
    manager: EntityManager, context: RequestContext, projectId: string, input: NcrCommandDto,
    scope: AccessScopeSets
  ): Promise<NcrEntity> {
    if (!input.ncrId || input.expectedVersion === undefined) {
      throw unprocessable(
        'NCR_REFERENCE_REQUIRED', 'Lệnh này phải khai báo ncrId và expectedVersion'
      );
    }
    const ncr = await manager.getRepository(NcrEntity).createQueryBuilder('ncr')
      .setLock('pessimistic_write')
      .where('ncr.id = :id AND ncr.tenantId = :tenantId AND ncr.projectId = :projectId', {
        id: input.ncrId, tenantId: context.tenantId, projectId
      })
      .getOne();
    if (!ncr || !inScope(ncr.projectId, ncr.packageId, scope)) {
      throw notFound('NCR_NOT_FOUND', 'Không tìm thấy NCR');
    }
    assertVersion(ncr.versionNo, input.expectedVersion);
    return ncr;
  }

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

  private async assertUserExists(
    manager: EntityManager, context: RequestContext, userId: string
  ): Promise<void> {
    const exists = await manager.getRepository(UserAccountEntity).existsBy({
      id: userId, tenantId: context.tenantId
    });
    if (!exists) throw unprocessable('OWNER_NOT_FOUND', 'Người phụ trách không thuộc tenant này');
  }

  private require(value: unknown, code: string, message: string): void {
    if (value === undefined || value === null || value === '') {
      throw unprocessable(code, message);
    }
  }

  private inspectionView(row: InspectionEntity, itp: InspectionTestPlanEntity) {
    return {
      id: row.id, projectId: row.projectId, itpId: row.itpId,
      itp: {
        id: itp.id, projectId: itp.projectId, packageId: itp.packageId,
        documentRevisionId: itp.documentRevisionId, version: itp.version
      },
      holdPointRef: row.holdPointRef, sequenceNo: row.sequenceNo, status: row.status,
      result: row.result, evidenceRefs: row.evidenceRefs, witnessSnapshot: row.witnessSnapshot,
      requestedBy: row.requestedBy, recordedBy: row.recordedBy,
      recordedAt: row.recordedAt === null ? null : row.recordedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private ncrView(row: NcrEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId, code: row.code,
      title: row.title, description: row.description, severity: row.severity,
      status: row.status, raisedBy: row.raisedBy, ownerId: row.ownerId,
      containmentAction: row.containmentAction, rootCause: row.rootCause,
      disposition: row.disposition, dispositionApprovedBy: row.dispositionApprovedBy,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
      closureEvidenceRefs: row.closureEvidenceRefs, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private cycleView(row: NcrDispositionCycleEntity) {
    return {
      id: row.id, ncrId: row.ncrId, sequenceNo: row.sequenceNo,
      proposedDisposition: row.proposedDisposition, proposalComment: row.proposalComment,
      proposedBy: row.proposedBy, proposedAt: row.proposedAt.toISOString(),
      decision: row.decision, decisionComment: row.decisionComment, decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString()
    };
  }

  private punchView(row: PunchItemEntity) {
    return {
      id: row.id, projectId: row.projectId, code: row.code, title: row.title,
      description: row.description, category: row.category, codBlocking: row.codBlocking,
      waivable: row.waivable, status: row.status, raisedBy: row.raisedBy,
      ownerId: row.ownerId, waivedBy: row.waivedBy, waivedReason: row.waivedReason,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
      closureEvidenceRefs: row.closureEvidenceRefs, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private punchCycleView(row: PunchClosureCycleEntity) {
    return {
      id: row.id, punchItemId: row.punchItemId, sequenceNo: row.sequenceNo,
      requestComment: row.requestComment, requestEvidenceRefs: row.requestEvidenceRefs,
      requestedBy: row.requestedBy, requestedAt: row.requestedAt.toISOString(),
      decision: row.decision, decisionComment: row.decisionComment, decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString()
    };
  }

  private capaView(row: CapaActionEntity) {
    return {
      id: row.id, projectId: row.projectId, hseIncidentId: row.hseIncidentId, ncrId: row.ncrId,
      title: row.title, ownerId: row.ownerId, dueDate: row.dueDate, status: row.status,
      effectivenessAssessment: row.effectivenessAssessment, verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }
}
