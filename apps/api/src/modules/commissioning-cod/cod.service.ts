import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository, type EntityManager } from 'typeorm';
import {
  CodGateEntity, CodGateReviewCycleEntity, CodGateReviewDecision, CodGateStatus,
  CodPackageEntity, CodPackageStatus, PackageEntity, ProjectEntity, UserAccountEntity,
  HandoverEntity
} from '../../database/entities';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { canonicalHash } from '../risk-change/domain/canonical-hash';
import {
  evaluateReadiness, type BlockingFinding, type ReadinessEvaluation, type ReadinessGate
} from './domain/readiness';
import {
  COD_GATE_REVIEW_OUTCOME, COD_GATE_TRANSITIONS, COD_PACKAGE_TRANSITIONS, canTransition
} from './domain/state-policy';
import {
  assertVersion, conflict, emit, notFound, type RequestContext, unprocessable, withConstraintMap
} from './domain/support';
import type { CodReadinessQueryDto, CodTransitionCommandDto } from './dto/commissioning-cod.dto';

/**
 * COD readiness and transitions (API-104, API-105).
 *
 * RECORDED SCOPE DECISION for API-105. The API catalog names this operation
 * "Submit/sign COD hoặc accept handover theo command type" — three verbs. AC-058 (define each COD
 * condition with its source, mandatory/waivable flag, reviewer, evidence and due date), AC-059 (an
 * independent reviewer records Pass/Fail/Conditional on submitted evidence, and expired or
 * superseded evidence can never Pass) and AC-060 (a condition that is blocked may not be waived)
 * each require a write path, and no other operation in the catalog offers one. Inventing API ids
 * for them is forbidden by `AGENTS.md` §4, so DEFINE_GATE, REVIEW_EVIDENCE and WAIVE_GATE join
 * this operation's closed `commandType` union — the same shape API-149 already uses to carry a
 * closed union of transitions under a single id.
 *
 * RECORDED SECURITY GAP (SEC-102). The OpenAPI entry lists SEC-102 (step-up authentication) for
 * this operation, but no step-up factor, re-authentication endpoint or assurance-level claim
 * exists anywhere in the approved auth profile — the login flow issues one bearer token and the
 * session carries no AAL. Faking a step-up (a re-typed password, a self-asserted header) would
 * record an assurance that was never obtained, which is worse than recording none. What IS enforced
 * here instead: Segregation of Duties on the signature (`ck_cod_package_sod` plus the 422 below),
 * an immutable signer snapshot with a canonical hash of exactly what was signed, refusal to sign
 * while any blocking finding is open, and an audit + outbox record inside the signing transaction.
 * Closing SEC-102 needs an auth-profile change; it is out of this slice's scope.
 */
@Injectable()
export class CodService {
  constructor(
    @InjectRepository(CodGateEntity)
    private readonly gates: Repository<CodGateEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-104 — the readiness matrix plus the blocking findings, evaluated as of an instant. */
  async readCodReadiness(
    context: RequestContext, projectId: string, query: CodReadinessQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'cod.read');
    const manager = this.gates.manager;
    await this.assertProjectVisible(manager, context, projectId, scope);
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const evaluation = await this.evaluate(manager, context, projectId, scope, asOf);
    const packages = await manager.getRepository(CodPackageEntity).find({
      where: { tenantId: context.tenantId, projectId }, order: { version: 'DESC' }
    });
    return {
      projectId,
      readiness: evaluation,
      packages: packages.map((row) => this.packageView(row))
    };
  }

  /** API-105 — the closed COD transition command union; every branch answers a committed 200. */
  async codTransitionCommand(
    context: RequestContext, projectId: string, input: CodTransitionCommandDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'cod.manage');
    return this.commands.execute({
      context, operation: 'API-105:cod-transition-command', idempotencyKey,
      request: { projectId, input }, responseStatus: 200, resourceType: 'CodPackage',
      resultReference: (result: { resourceType: string; resourceId: string }) => ({
        resourceType: result.resourceType, resourceId: result.resourceId, responseStatus: 200
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        switch (input.commandType) {
          case 'DEFINE_GATE':
            return this.defineGate(manager, context, projectId, input);
          case 'REVIEW_EVIDENCE':
            return this.reviewEvidence(manager, context, projectId, input);
          case 'WAIVE_GATE':
            return this.waiveGate(manager, context, projectId, input);
          case 'SUBMIT_COD':
            return this.submitCod(manager, context, projectId, scope, input);
          case 'SIGN_COD':
            return this.signCod(manager, context, projectId, scope, input);
          default:
            return this.acceptHandover(manager, context, projectId, input);
        }
      }
    });
  }

  /** AC-058 — one gate instance per (project, category, code), with its own owner and flags. */
  private async defineGate(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: CodTransitionCommandDto
  ) {
    this.require(input.category, 'CATEGORY_REQUIRED', 'DEFINE_GATE phải khai báo category');
    this.require(input.code, 'CODE_REQUIRED', 'DEFINE_GATE phải khai báo mã điều kiện');
    this.require(input.title, 'TITLE_REQUIRED', 'DEFINE_GATE phải khai báo tiêu đề');
    const ownerId = input.ownerUserId ?? context.userId;
    const ownerExists = await manager.getRepository(UserAccountEntity).existsBy({
      id: ownerId, tenantId: context.tenantId
    });
    if (!ownerExists) {
      throw unprocessable('OWNER_NOT_FOUND', 'Người phụ trách không thuộc tenant này');
    }
    const gates = manager.getRepository(CodGateEntity);
    const row = gates.create({
      id: randomUUID(), tenantId: context.tenantId, projectId,
      category: input.category!, code: input.code!, title: input.title!,
      mandatory: input.mandatory ?? true, waivable: input.waivable ?? false,
      ownerId, dueDate: input.dueDate ?? null, status: CodGateStatus.PENDING,
      evidenceRefs: [], evidenceExpiry: input.evidenceExpiry ?? null,
      acceptedBy: null, acceptedAt: null, waivedBy: null, waivedAt: null, waiverReason: null,
      createdBy: context.userId, updatedBy: context.userId
    });
    const saved = await withConstraintMap(() => gates.save(row), {
      uq_cod_gate_instance: () => conflict(
        'COD_GATE_CONFLICT', 'Điều kiện COD này đã tồn tại trong dự án'
      )
    });
    await emit(this.outbox, manager, context, 'CodGate', saved.id, saved.versionNo,
      'CodGate.Defined', {
        projectId, category: saved.category, code: saved.code, mandatory: saved.mandatory,
        waivable: saved.waivable, ownerId: saved.ownerId, dueDate: saved.dueDate,
        summary: `COD gate ${saved.category}/${saved.code} defined`
      });
    return { resourceType: 'CodGate', resourceId: saved.id, gate: this.gateView(saved) };
  }

  /**
   * AC-059 — one review round. `SUBMIT` opens the round with the evidence; `DECIDE` closes it with
   * Pass/Fail/Conditional. The decider can never be the submitter (`ck_cod_gate_review_cycle_sod`)
   * and expired evidence can never Pass.
   */
  private async reviewEvidence(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: CodTransitionCommandDto
  ) {
    this.require(
      input.reviewAction, 'REVIEW_ACTION_REQUIRED',
      'REVIEW_EVIDENCE phải khai báo reviewAction là SUBMIT hoặc DECIDE'
    );
    const gate = await this.lockGate(manager, context, projectId, input);
    return input.reviewAction === 'SUBMIT'
      ? this.submitGateEvidence(manager, context, gate, input)
      : this.decideGateReview(manager, context, gate, input);
  }

  private async submitGateEvidence(
    manager: EntityManager, context: RequestContext, gate: CodGateEntity,
    input: CodTransitionCommandDto
  ) {
    if (!canTransition(COD_GATE_TRANSITIONS, 'SUBMIT_EVIDENCE', gate.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', `Gate đang ${gate.status} không nhận thêm bằng chứng`
      );
    }
    if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
      throw unprocessable('EVIDENCE_REQUIRED', 'Nộp bằng chứng phải kèm ít nhất một tệp');
    }
    this.require(input.reason, 'REASON_REQUIRED', 'Nộp bằng chứng phải kèm thuyết minh');
    const cycles = manager.getRepository(CodGateReviewCycleEntity);
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(sequence_no), 0) + 1)::int AS "next"
      FROM cod_gate_review_cycles WHERE tenant_id = $1 AND cod_gate_id = $2`,
      [context.tenantId, gate.id]
    );
    const cycleId = randomUUID();
    await withConstraintMap(
      () => cycles.insert({
        id: cycleId, tenantId: context.tenantId, projectId: gate.projectId, codGateId: gate.id,
        sequenceNo: next.next, evidenceRefs: input.evidenceRefs!,
        evidenceExpiry: input.evidenceExpiry ?? null, submissionComment: input.reason!,
        submittedBy: context.userId, submittedAt: new Date(),
        decision: null, decisionComment: null, decidedBy: null, decidedAt: null
      }),
      {
        uq_cod_gate_review_cycle_open: () => conflict(
          'REVIEW_CYCLE_OPEN', 'Gate này đang có một vòng thẩm tra chưa được quyết định'
        ),
        uq_cod_gate_review_cycle_sequence: () => conflict(
          'REVIEW_CYCLE_CONFLICT', 'Trình tự vòng thẩm tra vừa được cấp bởi yêu cầu khác'
        )
      }
    );
    const gates = manager.getRepository(CodGateEntity);
    await gates.update(
      { id: gate.id, tenantId: context.tenantId },
      {
        status: COD_GATE_TRANSITIONS.SUBMIT_EVIDENCE.to, evidenceRefs: input.evidenceRefs!,
        evidenceExpiry: input.evidenceExpiry ?? gate.evidenceExpiry,
        updatedBy: context.userId, versionNo: gate.versionNo + 1
      }
    );
    const updated = await gates.findOneByOrFail({ id: gate.id, tenantId: context.tenantId });
    const cycle = await manager.getRepository(CodGateReviewCycleEntity)
      .findOneByOrFail({ id: cycleId, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'CodGate', updated.id, updated.versionNo,
      'CodGate.EvidenceSubmitted', {
        projectId: updated.projectId, category: updated.category, code: updated.code,
        sequenceNo: cycle.sequenceNo, evidenceCount: input.evidenceRefs!.length,
        evidenceExpiry: updated.evidenceExpiry,
        summary: `COD gate ${updated.code} evidence submitted (round ${cycle.sequenceNo})`
      });
    return {
      resourceType: 'CodGate', resourceId: updated.id,
      gate: this.gateView(updated), reviewCycle: this.cycleView(cycle)
    };
  }

  private async decideGateReview(
    manager: EntityManager, context: RequestContext, gate: CodGateEntity,
    input: CodTransitionCommandDto
  ) {
    if (!canTransition(COD_GATE_TRANSITIONS, 'DECIDE_REVIEW', gate.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', `Gate đang ${gate.status} không có vòng thẩm tra để quyết định`
      );
    }
    this.require(input.decision, 'DECISION_REQUIRED', 'DECIDE phải khai báo quyết định');
    this.require(input.reason, 'REASON_REQUIRED', 'DECIDE phải kèm thuyết minh quyết định');
    const cycles = manager.getRepository(CodGateReviewCycleEntity);
    const open = await cycles.createQueryBuilder('cycle')
      .setLock('pessimistic_write')
      .where('cycle.tenantId = :tenantId AND cycle.codGateId = :gateId AND cycle.decision IS NULL', {
        tenantId: context.tenantId, gateId: gate.id
      })
      .getOne();
    if (!open) {
      throw unprocessable('NO_OPEN_REVIEW_CYCLE', 'Gate này không có vòng thẩm tra đang chờ');
    }
    if (open.submittedBy === context.userId) {
      throw unprocessable(
        'SOD_CONFLICT', 'Người nộp bằng chứng không được tự thẩm tra bằng chứng đó'
      );
    }
    const decidedAt = new Date();
    // AC-059: evidence that has lapsed can never produce a Pass, whatever the reviewer intends.
    if (input.decision === CodGateReviewDecision.PASS
      && this.isExpired(open.evidenceExpiry ?? gate.evidenceExpiry, decidedAt)) {
      throw unprocessable(
        'EVIDENCE_EXPIRED', 'Bằng chứng đã hết hiệu lực; không thể kết luận đạt'
      );
    }
    await withConstraintMap(
      () => cycles.update(
        { id: open.id, tenantId: context.tenantId },
        {
          decision: input.decision!, decisionComment: input.reason!,
          decidedBy: context.userId, decidedAt
        }
      ),
      {
        ck_cod_gate_review_cycle_sod: () => unprocessable(
          'SOD_CONFLICT', 'Người nộp bằng chứng không được tự thẩm tra bằng chứng đó'
        )
      }
    );
    const nextStatus = COD_GATE_REVIEW_OUTCOME[input.decision!];
    const gates = manager.getRepository(CodGateEntity);
    await gates.update(
      { id: gate.id, tenantId: context.tenantId },
      {
        status: nextStatus,
        acceptedBy: nextStatus === CodGateStatus.ACCEPTED ? context.userId : null,
        acceptedAt: nextStatus === CodGateStatus.ACCEPTED ? decidedAt : null,
        updatedBy: context.userId, versionNo: gate.versionNo + 1
      }
    );
    const updated = await gates.findOneByOrFail({ id: gate.id, tenantId: context.tenantId });
    const decided = await cycles.findOneByOrFail({ id: open.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'CodGate', updated.id, updated.versionNo,
      'CodGate.EvidenceReviewed', {
        projectId: updated.projectId, category: updated.category, code: updated.code,
        decision: decided.decision, sequenceNo: decided.sequenceNo, status: updated.status,
        summary: `COD gate ${updated.code} review ${decided.decision}`
      });
    return {
      resourceType: 'CodGate', resourceId: updated.id,
      gate: this.gateView(updated), reviewCycle: this.cycleView(decided)
    };
  }

  /**
   * AC-060 — a waiver is only ever available on a gate that was DEFINED as waivable. The refusal is
   * a domain 422 here and `ck_cod_gate_waiver_allowed` in the database, so a non-waivable gate can
   * never carry status WAIVED even if this service were bypassed.
   */
  private async waiveGate(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: CodTransitionCommandDto
  ) {
    this.require(input.reason, 'REASON_REQUIRED', 'WAIVE_GATE phải kèm lý do');
    const gate = await this.lockGate(manager, context, projectId, input);
    if (!gate.waivable) {
      throw unprocessable('NON_WAIVABLE_GATE', 'Điều kiện COD này không thể được miễn trừ');
    }
    if (!canTransition(COD_GATE_TRANSITIONS, 'WAIVE', gate.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', `Gate đang ${gate.status} không thể được miễn trừ`
      );
    }
    const gates = manager.getRepository(CodGateEntity);
    const waivedAt = new Date();
    await withConstraintMap(
      () => gates.update(
        { id: gate.id, tenantId: context.tenantId },
        {
          status: CodGateStatus.WAIVED, waivedBy: context.userId, waivedAt,
          waiverReason: input.reason!, updatedBy: context.userId, versionNo: gate.versionNo + 1
        }
      ),
      {
        ck_cod_gate_waiver_allowed: () => unprocessable(
          'NON_WAIVABLE_GATE', 'Điều kiện COD này không thể được miễn trừ'
        )
      }
    );
    const updated = await gates.findOneByOrFail({ id: gate.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'CodGate', updated.id, updated.versionNo,
      'CodGate.Waived', {
        projectId: updated.projectId, category: updated.category, code: updated.code,
        waivedBy: updated.waivedBy,
        summary: `COD gate ${updated.code} waived`
      });
    return { resourceType: 'CodGate', resourceId: updated.id, gate: this.gateView(updated) };
  }

  /**
   * FR-113 — submit a COD package. The readiness evaluation at submit time is stored WITH its
   * blocking findings: a submission is allowed to record a No-go picture (AC-060's committee case),
   * it is the signature that is refused while anything blocks.
   */
  private async submitCod(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets,
    input: CodTransitionCommandDto
  ) {
    const evaluation = await this.evaluate(manager, context, projectId, scope, new Date());
    const packages = manager.getRepository(CodPackageEntity);
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(version), 0) + 1)::int AS "next"
      FROM cod_packages WHERE tenant_id = $1 AND project_id = $2`,
      [context.tenantId, projectId]
    );
    const submittedAt = new Date();
    const snapshot = this.snapshotOf(evaluation);
    const id = randomUUID();
    const row = packages.create({
      id, tenantId: context.tenantId, projectId, version: next.next,
      status: CodPackageStatus.SUBMITTED, readinessSnapshot: snapshot,
      snapshotHash: canonicalHash(snapshot),
      signedArtifactRef: null, effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      legalHold: false, submittedBy: context.userId, submittedAt,
      signedBy: null, signedAt: null, signerSnapshot: null,
      createdBy: context.userId, updatedBy: context.userId
    });
    await withConstraintMap(
      () => packages.save(row),
      {
        uq_cod_package_active: () => conflict(
          'COD_PACKAGE_IN_FLIGHT', 'Dự án này đã có một hồ sơ COD chưa hoàn tất'
        ),
        uq_cod_package_version: () => conflict(
          'COD_PACKAGE_VERSION_CONFLICT', 'Phiên bản hồ sơ COD vừa được cấp bởi yêu cầu khác'
        )
      }
    );
    const saved = await packages.findOneByOrFail({ id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'CodPackage', saved.id, saved.versionNo,
      'CodPackage.Submitted', {
        projectId, version: saved.version, snapshotHash: saved.snapshotHash,
        blockingFindings: evaluation.blockingFindings.total,
        mandatoryOutstanding: evaluation.gates.mandatoryOutstanding,
        summary: `COD package v${saved.version} submitted`
      });
    return {
      resourceType: 'CodPackage', resourceId: saved.id,
      package: this.packageView(saved), readiness: evaluation
    };
  }

  /**
   * FR-113 — sign the COD package. Two refusals, both 422:
   * - `SOD_CONFLICT`: the signer is the submitter. Also `ck_cod_package_sod` in the database.
   * - `GATE_BLOCKED`: the readiness evaluation is not clear — either a blocking finding from
   *   API-104 is open, or a mandatory gate is still outstanding. Both are the same wire code
   *   because both mean the same thing to the caller: the COD gate is not clear yet.
   *
   * The signed row stores the readiness it was signed against plus `snapshot_hash`, a canonical
   * SHA-256 from the SHARED `canonicalHash` helper, and an immutable signer snapshot with a stable
   * user id — never a display string. See the class comment for the SEC-102 step-up gap.
   */
  private async signCod(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets,
    input: CodTransitionCommandDto
  ) {
    const target = await this.lockPackage(manager, context, projectId, input);
    if (!canTransition(COD_PACKAGE_TRANSITIONS, 'SIGN_COD', target.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', 'Chỉ hồ sơ COD đã submit mới được ký'
      );
    }
    if (target.submittedBy === context.userId) {
      throw unprocessable('SOD_CONFLICT', 'Người trình hồ sơ COD không được tự ký hồ sơ đó');
    }
    const signedAt = new Date();
    const evaluation = await this.evaluate(manager, context, projectId, scope, signedAt);
    if (!evaluation.readyToSign) {
      throw unprocessable('GATE_BLOCKED', evaluation.blocked
        ? 'Đang có phát hiện chặn COD chưa được xử lý'
        : 'Vẫn còn điều kiện COD bắt buộc chưa được đáp ứng');
    }
    const signer = await manager.getRepository(UserAccountEntity)
      .findOneByOrFail({ id: context.userId, tenantId: context.tenantId });
    const snapshot = this.snapshotOf(evaluation);
    const snapshotHash = canonicalHash(snapshot);
    const packages = manager.getRepository(CodPackageEntity);
    await withConstraintMap(
      () => packages.update(
        { id: target.id, tenantId: context.tenantId },
        {
          status: CodPackageStatus.SIGNED, readinessSnapshot: snapshot, snapshotHash,
          signedArtifactRef: input.signedArtifactRef ?? null,
          effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : target.effectiveAt,
          signedBy: context.userId, signedAt,
          signerSnapshot: {
            userId: signer.id, displayName: signer.displayName, email: signer.email,
            signedAt: signedAt.toISOString(), snapshotHash
          },
          updatedBy: context.userId, versionNo: target.versionNo + 1
        }
      ),
      {
        ck_cod_package_sod: () => unprocessable(
          'SOD_CONFLICT', 'Người trình hồ sơ COD không được tự ký hồ sơ đó'
        )
      }
    );
    const updated = await packages.findOneByOrFail({ id: target.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'CodPackage', updated.id, updated.versionNo,
      'CodPackage.Signed', {
        projectId, version: updated.version, snapshotHash: updated.snapshotHash,
        signedBy: updated.signedBy, submittedBy: updated.submittedBy,
        summary: `COD package v${updated.version} signed`
      });
    return {
      resourceType: 'CodPackage', resourceId: updated.id,
      package: this.packageView(updated), readiness: evaluation
    };
  }

  /** FR-114 — record the recipient's acceptance and hand the signed package over. */
  private async acceptHandover(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: CodTransitionCommandDto
  ) {
    this.require(
      input.recipientPartyId, 'RECIPIENT_REQUIRED', 'ACCEPT_HANDOVER phải khai báo bên nhận'
    );
    this.require(
      input.fromPartyId, 'FROM_PARTY_REQUIRED', 'ACCEPT_HANDOVER phải khai báo bên bàn giao'
    );
    const target = await this.lockPackage(manager, context, projectId, input);
    if (!canTransition(COD_PACKAGE_TRANSITIONS, 'ACCEPT_HANDOVER', target.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', 'Chỉ hồ sơ COD đã ký mới được bàn giao'
      );
    }
    const handovers = manager.getRepository(HandoverEntity);
    const acceptedAt = new Date();
    const id = randomUUID();
    const row = handovers.create({
      id, tenantId: context.tenantId, projectId, codPackageId: target.id,
      fromPartyId: input.fromPartyId!, recipientPartyId: input.recipientPartyId!,
      itemManifest: input.itemManifest ?? [], openItems: input.openItems ?? [],
      acceptedBy: context.userId, acceptedAt,
      createdBy: context.userId, updatedBy: context.userId
    });
    await withConstraintMap(
      () => handovers.save(row),
      {
        uq_handover_package_recipient: () => conflict(
          'HANDOVER_ALREADY_ACCEPTED', 'Bên nhận này đã ký nhận hồ sơ COD'
        ),
        ck_handover_parties: () => unprocessable(
          'HANDOVER_PARTIES_INVALID', 'Bên bàn giao và bên nhận phải khác nhau'
        ),
        fk_handover_from_party: () => unprocessable(
          'PARTY_NOT_FOUND', 'Bên tham gia không thuộc dự án này'
        ),
        fk_handover_recipient_party: () => unprocessable(
          'PARTY_NOT_FOUND', 'Bên tham gia không thuộc dự án này'
        )
      }
    );
    const packages = manager.getRepository(CodPackageEntity);
    await packages.update(
      { id: target.id, tenantId: context.tenantId },
      {
        status: CodPackageStatus.HANDED_OVER,
        updatedBy: context.userId, versionNo: target.versionNo + 1
      }
    );
    const handover = await handovers.findOneByOrFail({ id, tenantId: context.tenantId });
    const updated = await packages.findOneByOrFail({ id: target.id, tenantId: context.tenantId });
    await emit(this.outbox, manager, context, 'Handover', handover.id, handover.versionNo,
      'Handover.Accepted', {
        projectId, codPackageId: target.id, recipientPartyId: handover.recipientPartyId,
        fromPartyId: handover.fromPartyId, openItemCount: handover.openItems.length,
        summary: `COD package v${updated.version} handed over`
      });
    return {
      resourceType: 'Handover', resourceId: handover.id,
      handover: this.handoverView(handover), package: this.packageView(updated)
    };
  }

  /**
   * Loads the gates and the blocking findings through the CALLER'S reach and hands them to the pure
   * evaluator. Nothing here bypasses ABAC: the project gate has already run, NCRs are additionally
   * narrowed by package reach, and the projection carries ids, codes and classification only — no
   * punch description, no NCR narrative, no stop-work reason.
   *
   * `punch_items` and `stop_work_actions` carry no package column: they are project-level registers
   * in the Field/HSE schema, so project reach is the whole of their ABAC dimension — the same rule
   * API-097 already applies to the punch register.
   */
  private async evaluate(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets,
    asOf: Date
  ): Promise<ReadinessEvaluation> {
    const gateRows = await manager.getRepository(CodGateEntity).find({
      where: { tenantId: context.tenantId, projectId },
      order: { category: 'ASC', code: 'ASC' }
    });
    const gates: ReadinessGate[] = gateRows.map((row) => ({
      id: row.id, category: row.category, code: row.code, status: row.status,
      mandatory: row.mandatory, waivable: row.waivable, evidenceExpiry: row.evidenceExpiry
    }));
    const projectReach = scope.tenantWide || scope.projectIds.includes(projectId);
    const findings: BlockingFinding[] = [
      ...await this.blockingPunchItems(manager, context, projectId),
      ...await this.openCriticalNcrs(manager, context, projectId, projectReach, scope.packageIds),
      ...await this.activeStopWorks(manager, context, projectId)
    ];
    return evaluateReadiness({ gates, findings, asOf });
  }

  private async blockingPunchItems(
    manager: EntityManager, context: RequestContext, projectId: string
  ): Promise<BlockingFinding[]> {
    const rows = await manager.query<Array<{ id: string; code: string; category: string; status: string }>>(
      `SELECT punch.id, punch.code, punch.category, punch.status
      FROM punch_items punch
      WHERE punch.tenant_id = $1 AND punch.project_id = $2
        AND punch.cod_blocking = true AND punch.status NOT IN ('CLOSED','WAIVED')
      ORDER BY punch.code`,
      [context.tenantId, projectId]
    );
    return rows.map((row) => ({
      type: 'PUNCH_ITEM' as const, id: row.id, reference: row.code,
      detail: `category ${row.category} punch item is ${row.status}`
    }));
  }

  private async openCriticalNcrs(
    manager: EntityManager, context: RequestContext, projectId: string, projectReach: boolean,
    packageIds: readonly string[]
  ): Promise<BlockingFinding[]> {
    const rows = await manager.query<Array<{ id: string; code: string; status: string }>>(
      `SELECT ncr.id, ncr.code, ncr.status
      FROM ncrs ncr
      WHERE ncr.tenant_id = $1 AND ncr.project_id = $2
        AND ncr.severity = 'CRITICAL' AND ncr.status <> 'CLOSED'
        AND ($3::boolean OR ncr.package_id = ANY($4::uuid[]))
      ORDER BY ncr.code`,
      [context.tenantId, projectId, projectReach, [...packageIds]]
    );
    return rows.map((row) => ({
      type: 'NCR' as const, id: row.id, reference: row.code,
      detail: `critical NCR is ${row.status}`
    }));
  }

  /**
   * SAFETY FAILS CLOSED. An unlifted stop-work anywhere in the project blocks COD — and if the
   * ledger cannot be read, the answer is a synthetic blocking finding, never a shrug. Same rule the
   * Field/HSE workfront release and permit issue already apply.
   */
  private async activeStopWorks(
    manager: EntityManager, context: RequestContext, projectId: string
  ): Promise<BlockingFinding[]> {
    try {
      const rows = await manager.query<Array<{ id: string; targetType: string }>>(
        `SELECT issue.id, issue.target_type AS "targetType"
        FROM stop_work_actions issue
        WHERE issue.tenant_id = $1 AND issue.project_id = $2 AND issue.action = 'ISSUE'
          AND NOT EXISTS (
            SELECT 1 FROM stop_work_actions lift
            WHERE lift.tenant_id = issue.tenant_id AND lift.lifts_action_id = issue.id
          )
        ORDER BY issue.acted_at`,
        [context.tenantId, projectId]
      );
      return rows.map((row) => ({
        type: 'STOP_WORK' as const, id: row.id, reference: row.targetType,
        detail: `unlifted stop-work covering ${row.targetType}`
      }));
    } catch {
      return [{
        type: 'STOP_WORK', id: projectId, reference: 'UNKNOWN',
        detail: 'stop-work ledger unreadable; COD blocked until it can be verified'
      }];
    }
  }

  /** The exact object that gets hashed: evaluation minus the wall-clock instant it was taken. */
  private snapshotOf(evaluation: ReadinessEvaluation) {
    return {
      gates: evaluation.gates,
      categories: evaluation.categories,
      expiredEvidenceGateIds: evaluation.expiredEvidenceGateIds,
      blockingFindings: evaluation.blockingFindings,
      blocked: evaluation.blocked,
      readyToSign: evaluation.readyToSign
    };
  }

  private isExpired(expiry: string | null, asOf: Date): boolean {
    if (expiry === null) return false;
    const parsed = Date.parse(`${expiry}T23:59:59.999Z`);
    return Number.isFinite(parsed) && parsed < asOf.getTime();
  }

  private async lockGate(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: CodTransitionCommandDto
  ): Promise<CodGateEntity> {
    if (!input.codGateId || input.expectedVersion === undefined) {
      throw unprocessable(
        'GATE_REFERENCE_REQUIRED', 'Lệnh này phải khai báo codGateId và expectedVersion'
      );
    }
    const gate = await manager.getRepository(CodGateEntity).createQueryBuilder('gate')
      .setLock('pessimistic_write')
      .where('gate.id = :id AND gate.tenantId = :tenantId AND gate.projectId = :projectId', {
        id: input.codGateId, tenantId: context.tenantId, projectId
      })
      .getOne();
    if (!gate) throw notFound('COD_GATE_NOT_FOUND', 'Không tìm thấy điều kiện COD');
    assertVersion(gate.versionNo, input.expectedVersion);
    return gate;
  }

  private async lockPackage(
    manager: EntityManager, context: RequestContext, projectId: string,
    input: CodTransitionCommandDto
  ): Promise<CodPackageEntity> {
    if (!input.codPackageId || input.expectedVersion === undefined) {
      throw unprocessable(
        'PACKAGE_REFERENCE_REQUIRED', 'Lệnh này phải khai báo codPackageId và expectedVersion'
      );
    }
    const target = await manager.getRepository(CodPackageEntity).createQueryBuilder('package')
      .setLock('pessimistic_write')
      .where(
        'package.id = :id AND package.tenantId = :tenantId AND package.projectId = :projectId',
        { id: input.codPackageId, tenantId: context.tenantId, projectId }
      )
      .getOne();
    if (!target) throw notFound('COD_PACKAGE_NOT_FOUND', 'Không tìm thấy hồ sơ COD');
    assertVersion(target.versionNo, input.expectedVersion);
    return target;
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

  private require(value: unknown, code: string, message: string): void {
    if (value === undefined || value === null || value === '') {
      throw unprocessable(code, message);
    }
  }

  private gateView(row: CodGateEntity) {
    return {
      id: row.id, projectId: row.projectId, category: row.category, code: row.code,
      title: row.title, mandatory: row.mandatory, waivable: row.waivable, ownerId: row.ownerId,
      dueDate: row.dueDate, status: row.status, evidenceRefs: row.evidenceRefs,
      evidenceExpiry: row.evidenceExpiry, acceptedBy: row.acceptedBy,
      acceptedAt: row.acceptedAt === null ? null : row.acceptedAt.toISOString(),
      waivedBy: row.waivedBy,
      waivedAt: row.waivedAt === null ? null : row.waivedAt.toISOString(),
      waiverReason: row.waiverReason, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private cycleView(row: CodGateReviewCycleEntity) {
    return {
      id: row.id, codGateId: row.codGateId, sequenceNo: row.sequenceNo,
      evidenceRefs: row.evidenceRefs, evidenceExpiry: row.evidenceExpiry,
      submissionComment: row.submissionComment, submittedBy: row.submittedBy,
      submittedAt: row.submittedAt.toISOString(), decision: row.decision,
      decisionComment: row.decisionComment, decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString()
    };
  }

  private packageView(row: CodPackageEntity) {
    return {
      id: row.id, projectId: row.projectId, version: row.version, status: row.status,
      readinessSnapshot: row.readinessSnapshot, snapshotHash: row.snapshotHash,
      signedArtifactRef: row.signedArtifactRef,
      effectiveAt: row.effectiveAt === null ? null : row.effectiveAt.toISOString(),
      legalHold: row.legalHold, submittedBy: row.submittedBy,
      submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
      signedBy: row.signedBy,
      signedAt: row.signedAt === null ? null : row.signedAt.toISOString(),
      signerSnapshot: row.signerSnapshot, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private handoverView(row: HandoverEntity) {
    return {
      id: row.id, projectId: row.projectId, codPackageId: row.codPackageId,
      fromPartyId: row.fromPartyId, recipientPartyId: row.recipientPartyId,
      itemManifest: row.itemManifest, openItems: row.openItems, acceptedBy: row.acceptedBy,
      acceptedAt: row.acceptedAt === null ? null : row.acceptedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }
}
