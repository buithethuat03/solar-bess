import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import {
  AssignmentScopeType, BaselineStatus, BaselineType, CompanyEntity,
  LegalEntityEntity, LocalCredentialEntity, MasterRecordStatus, OrganizationType,
  PackageEntity, PackageStatus, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectScheduleEntity, ProjectScheduleStatus, ProjectType,
  RoleAssignmentEntity, RoleEntity, ScheduleBaselineEntity, ScheduleSourceFormat,
  TenantEntity, UserAccountEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const approverId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const packageA = randomUUID();
const packageB = randomUUID();
const baselineId = randomUUID();
const password = 'RiskChange!Integration2026';

jest.setTimeout(90_000);

describe('Risk/Issue/Action/Change HTTP integration — TEST-014…017', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let managerToken: string;
  let approverToken: string;
  let packageToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    app = await createApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    await seedIdentityProjectsAndBaseline();
    managerToken = await login('risk-manager@example.test', 'risk-http-test');
    approverToken = await login('risk-approver@example.test', 'risk-http-test');
    packageToken = await login('risk-package@example.test', 'risk-http-test');
    otherTenantToken = await login('risk-other@example.test', 'risk-http-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-038/143/160: creates, replays, reads and isolates exact package/tenant scope', async () => {
    const key = 'risk-http-create-replay-001';
    const payload = riskPayload(packageA, 'RSK-HTTP-A');
    const first = await api(managerToken).post(`/v1/projects/${projectId}/risks`)
      .set('Idempotency-Key', key).send(payload).expect(201);
    const replay = await api(managerToken).post(`/v1/projects/${projectId}/risks`)
      .set('Idempotency-Key', key).send(payload).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(first.body.data).toMatchObject({
      projectId, packageId: packageA, code: 'RSK-HTTP-A', status: 'IDENTIFIED',
      impactRating: 3, inherentExposure: 6, versionNo: 1
    });

    const second = await createRisk(packageB, 'RSK-HTTP-B', 'risk-http-create-b-001');
    const scopedList = await api(packageToken)
      .get(`/v1/projects/${projectId}/risks`).expect(200);
    expect(scopedList.body.data.map((row: { id: string }) => row.id)).toEqual([first.body.data.id]);
    await api(packageToken).get(`/v1/projects/${projectId}/risks/${second.id}`).expect(404);
    const detail = await api(managerToken)
      .get(`/v1/projects/${projectId}/risks/${first.body.data.id}`).expect(200);
    expect(detail.body).toMatchObject({
      data: { id: first.body.data.id },
      closureCycles: [], closureCycleMeta: { nextCursor: null, limit: 50 }
    });

    const crossTenant = await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/risks`).expect(403);
    expect(crossTenant.body.code).toBe('PROJECT_SCOPE_DENIED');

    const invalidKey = 'risk-http-invalid-owner-001';
    const invalid = await api(managerToken).post(`/v1/projects/${projectId}/risks`)
      .set('Idempotency-Key', invalidKey)
      .send({ ...riskPayload(packageA, 'RSK-BAD-OWNER'), ownerId: otherTenantUserId })
      .expect(422);
    expect(invalid.body.code).toBe('OWNER_NOT_ASSIGNABLE');
    const [atomic] = await dataSource.query<Array<{
      risks: string; receipts: string; audits: string; events: string;
    }>>(`SELECT
      (SELECT count(*) FROM risks WHERE code = 'RSK-BAD-OWNER')::text AS risks,
      (SELECT count(*) FROM command_receipts WHERE idempotency_key = $1)::text AS receipts,
      (SELECT count(*) FROM audit_events WHERE payload ->> 'code' = 'RSK-BAD-OWNER')::text AS audits,
      (SELECT count(*) FROM transactional_outbox_events
        WHERE payload ->> 'code' = 'RSK-BAD-OWNER')::text AS events`, [invalidKey]);
    expect(atomic).toEqual({ risks: '0', receipts: '0', audits: '0', events: '0' });
  });

  it('API-144/154: enforces closure-only payload, no-op, SoD and immutable cycles', async () => {
    let risk = await createRisk(packageA, 'RSK-CLOSE', 'risk-http-close-create');
    for (const [status, key] of [
      ['ASSESSED', 'risk-http-close-assess'],
      ['TREATING', 'risk-http-close-treat'],
      ['MONITORING', 'risk-http-close-monitor']
    ] as const) {
      risk = (await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: risk.versionNo, status }).expect(200)).body.data;
    }

    const noOpKey = 'risk-http-close-noop-001';
    const noOp = await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', noOpKey).send({ expectedVersion: risk.versionNo }).expect(400);
    expect(noOp.body.code).toBe('UPDATE_FIELDS_REQUIRED');
    const mixedKey = 'risk-http-close-mixed-001';
    const mixed = await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', mixedKey).send({
        expectedVersion: risk.versionNo, status: 'CLOSURE_PENDING',
        closureReason: 'Treatment completed with accepted residual exposure',
        closureEvidenceRefs: [evidence('CLOSE_REQUEST')], category: 'Mixed field is forbidden'
      }).expect(400);
    expect(mixed.body.code).toBe('RISK_CLOSURE_COMMAND_INVALID');

    risk = (await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', 'risk-http-close-request-001').send({
        expectedVersion: risk.versionNo, status: 'CLOSURE_PENDING',
        closureReason: 'Treatment completed with accepted residual exposure',
        closureEvidenceRefs: [evidence('CLOSE_REQUEST')]
      }).expect(200)).body.data;
    const selfDecisionKey = 'risk-http-close-self-001';
    const selfDecision = await api(managerToken)
      .post(`/v1/projects/${projectId}/risks/${risk.id}:closure-decision`)
      .set('Idempotency-Key', selfDecisionKey).send({
        expectedVersion: risk.versionNo, decision: 'APPROVE',
        comment: 'Creator must not self approve closure',
        evidenceRefs: [evidence('CLOSE_DECISION')]
      }).expect(403);
    expect(selfDecision.body.code).toBe('CLOSURE_DECISION_SOD');

    const closed = await api(approverToken)
      .post(`/v1/projects/${projectId}/risks/${risk.id}:closure-decision`)
      .set('Idempotency-Key', 'risk-http-close-independent-001').send({
        expectedVersion: risk.versionNo, decision: 'APPROVE',
        comment: 'Independent evidence confirms closure',
        evidenceRefs: [evidence('CLOSE_DECISION')]
      }).expect(200);
    expect(closed.body.data.status).toBe('CLOSED');
    risk = closed.body.data;
    const firstClosureDetail = await api(managerToken)
      .get(`/v1/projects/${projectId}/risks/${risk.id}`).expect(200);
    expect(firstClosureDetail.body.closureCycles).toHaveLength(1);
    expect(firstClosureDetail.body.closureCycles[0]).toMatchObject({
      sequenceNo: 1, decision: 'APPROVE', resultingStatus: 'CLOSED'
    });
    await expect(dataSource.query(
      `UPDATE risk_issue_closure_cycles SET decision_comment = 'Mutated immutable decision'
       WHERE id = $1`, [firstClosureDetail.body.closureCycles[0].id]
    )).rejects.toMatchObject({ code: '55000' });

    const missingReopenEvidenceKey = 'risk-http-reopen-missing-evidence-001';
    const readReopenState = async () => {
      const [state] = await dataSource.query<Array<{
        status: string; versionNo: string; cycles: string;
        receipts: string; audits: string; events: string;
      }>>(`SELECT
        (SELECT status::text FROM risks WHERE id = $1) AS status,
        (SELECT version_no::text FROM risks WHERE id = $1) AS "versionNo",
        (SELECT count(*)::text FROM risk_issue_closure_cycles WHERE risk_id = $1) AS cycles,
        (SELECT count(*)::text FROM command_receipts WHERE idempotency_key = $2) AS receipts,
        (SELECT count(*)::text FROM audit_events WHERE object_id = $1) AS audits,
        (SELECT count(*)::text FROM transactional_outbox_events
          WHERE aggregate_id = $1) AS events`, [risk.id, missingReopenEvidenceKey]);
      return state;
    };
    const beforeMissingEvidence = await readReopenState();
    const missingEvidence = await api(managerToken)
      .patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', missingReopenEvidenceKey)
      .send({ expectedVersion: risk.versionNo, status: 'MONITORING' }).expect(422);
    expect(missingEvidence.body.code).toBe('REOPEN_EVIDENCE_REQUIRED');
    expect(await readReopenState()).toEqual(beforeMissingEvidence);
    expect(beforeMissingEvidence).toMatchObject({
      status: 'CLOSED', versionNo: String(risk.versionNo), cycles: '1', receipts: '0'
    });

    const reopenEvidence = evidence('RISK_REOPEN');
    risk = (await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', 'risk-http-reopen-001').send({
        expectedVersion: risk.versionNo, status: 'MONITORING', evidenceRefs: [reopenEvidence]
      }).expect(200)).body.data;
    expect(risk).toMatchObject({ status: 'MONITORING', evidenceRefs: [reopenEvidence] });

    risk = (await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', 'risk-http-reclose-request-002').send({
        expectedVersion: risk.versionNo, status: 'CLOSURE_PENDING',
        closureReason: 'Reopened Risk was monitored and is ready for closure again',
        closureEvidenceRefs: [evidence('RECLOSE_REQUEST')]
      }).expect(200)).body.data;
    const reclosed = await api(approverToken)
      .post(`/v1/projects/${projectId}/risks/${risk.id}:closure-decision`)
      .set('Idempotency-Key', 'risk-http-reclose-independent-002').send({
        expectedVersion: risk.versionNo, decision: 'APPROVE',
        comment: 'Independent evidence confirms the second closure',
        evidenceRefs: [evidence('RECLOSE_DECISION')]
      }).expect(200);
    expect(reclosed.body.data.status).toBe('CLOSED');
    const secondClosureDetail = await api(managerToken)
      .get(`/v1/projects/${projectId}/risks/${risk.id}`).expect(200);
    expect(secondClosureDetail.body.closureCycles.map((cycle: Record<string, unknown>) => ({
      sequenceNo: cycle.sequenceNo, decision: cycle.decision,
      resultingStatus: cycle.resultingStatus
    }))).toEqual([
      { sequenceNo: 2, decision: 'APPROVE', resultingStatus: 'CLOSED' },
      { sequenceNo: 1, decision: 'APPROVE', resultingStatus: 'CLOSED' }
    ]);
    await expect(dataSource.query(
      `UPDATE risk_issue_closure_cycles SET decision_comment = 'Mutated second decision'
       WHERE id = $1`, [secondClosureDetail.body.closureCycles[0].id]
    )).rejects.toMatchObject({ code: '55000' });

    const [failedReceipts] = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM command_receipts
       WHERE idempotency_key IN ($1,$2,$3,$4)`,
      [noOpKey, mixedKey, selfDecisionKey, missingReopenEvidenceKey]
    );
    expect(failedReceipts.count).toBe('0');
  });

  it('API-145/146/147/155/161: links occurred Risk and closes Issue independently', async () => {
    const risk = await createRisk(packageA, 'RSK-OCCUR', 'risk-http-issue-source-risk');
    let issue = (await api(managerToken).post(`/v1/projects/${projectId}/issues`)
      .set('Idempotency-Key', 'risk-http-issue-create-001').send({
        sourceRiskId: risk.id, markSourceRiskOccurred: true, code: 'ISS-HTTP-001',
        title: 'Equipment delivery missed the required date',
        description: 'The late delivery is now an active project issue',
        occurredAt: '2026-07-18T04:00:00.000Z',
        rootCause: 'Supplier production and transport delay',
        actualImpact: 'Commissioning preparation sequence is constrained',
        severity: 'HIGH', ownerId: managerId, targetDate: '2026-08-20',
        evidenceRefs: [evidence('ISSUE_SOURCE')]
      }).expect(201)).body.data;
    expect(issue).toMatchObject({
      packageId: packageA, sourceRiskId: risk.id, status: 'REPORTED', versionNo: 1
    });
    const occurredRisk = await api(managerToken)
      .get(`/v1/projects/${projectId}/risks/${risk.id}`).expect(200);
    expect(occurredRisk.body.data).toMatchObject({
      status: 'OCCURRED', occurredIssueId: issue.id, versionNo: 2
    });
    const scoped = await api(packageToken)
      .get(`/v1/projects/${projectId}/issues`).expect(200);
    expect(scoped.body.data.map((row: { id: string }) => row.id)).toEqual([issue.id]);

    for (const [status, key, extra] of [
      ['TRIAGED', 'risk-http-issue-triage', {}],
      ['IN_PROGRESS', 'risk-http-issue-progress', {}],
      ['RESOLVED', 'risk-http-issue-resolve', {
        resolutionSummary: 'Supplier recovery delivery was received and inspected',
        resolutionEvidenceRefs: [evidence('ISSUE_RESOLUTION')]
      }]
    ] as const) {
      issue = (await api(managerToken).patch(`/v1/projects/${projectId}/issues/${issue.id}`)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: issue.versionNo, status, ...extra }).expect(200)).body.data;
    }
    issue = (await api(managerToken).patch(`/v1/projects/${projectId}/issues/${issue.id}`)
      .set('Idempotency-Key', 'risk-http-issue-close-request').send({
        expectedVersion: issue.versionNo, status: 'CLOSURE_PENDING',
        closureReason: 'Resolution evidence confirms the issue can close',
        closureEvidenceRefs: [evidence('ISSUE_CLOSE_REQUEST')]
      }).expect(200)).body.data;
    const self = await api(managerToken)
      .post(`/v1/projects/${projectId}/issues/${issue.id}:closure-decision`)
      .set('Idempotency-Key', 'risk-http-issue-self-close').send({
        expectedVersion: issue.versionNo, decision: 'APPROVE',
        comment: 'Owner cannot decide own Issue closure',
        evidenceRefs: [evidence('ISSUE_CLOSE_DECISION')]
      }).expect(403);
    expect(self.body.code).toBe('CLOSURE_DECISION_SOD');
    const closed = await api(approverToken)
      .post(`/v1/projects/${projectId}/issues/${issue.id}:closure-decision`)
      .set('Idempotency-Key', 'risk-http-issue-independent-close').send({
        expectedVersion: issue.versionNo, decision: 'APPROVE',
        comment: 'Independent reviewer confirms Issue closure',
        evidenceRefs: [evidence('ISSUE_CLOSE_DECISION')]
      }).expect(200);
    expect(closed.body.data.status).toBe('CLOSED');
    const detail = await api(managerToken)
      .get(`/v1/projects/${projectId}/issues/${issue.id}`).expect(200);
    expect(detail.body.closureCycles).toEqual([
      expect.objectContaining({ sequenceNo: 1, decision: 'APPROVE', resultingStatus: 'CLOSED' })
    ]);
  });

  it('API-148/149: completes then independently verifies residual and rolls stale verify back', async () => {
    let risk = await createRisk(packageA, 'RSK-ACTION', 'risk-http-action-risk');
    let action = await createAction(risk.id, 'ACT-VERIFY', 'risk-http-action-create');
    action = (await api(managerToken)
      .patch(`/v1/projects/${projectId}/risk-issue-actions/${action.id}`)
      .set('Idempotency-Key', 'risk-http-action-done-001').send({
        expectedVersion: action.versionNo, status: 'DONE',
        evidenceRefs: [evidence('ACTION_DONE')], residualRiskVersion: risk.versionNo,
        residualAssessment: {
          probability: 2, costImpactRating: 2, scheduleImpactRating: 2,
          hseImpactRating: 1, rationale: 'Mitigation evidence reduced probability and impact'
        }
      }).expect(200)).body.data;
    expect(action.residualAssessment.rationale)
      .toBe('Mitigation evidence reduced probability and impact');

    const selfVerifyKey = 'risk-http-action-self-verify';
    const selfVerify = await api(managerToken)
      .patch(`/v1/projects/${projectId}/risk-issue-actions/${action.id}`)
      .set('Idempotency-Key', selfVerifyKey).send({
        expectedVersion: action.versionNo, status: 'VERIFIED',
        evidenceRefs: [evidence('ACTION_VERIFY')]
      }).expect(403);
    expect(selfVerify.body.code).toBe('ACTION_TERMINAL_SOD');
    action = (await api(approverToken)
      .patch(`/v1/projects/${projectId}/risk-issue-actions/${action.id}`)
      .set('Idempotency-Key', 'risk-http-action-independent-verify').send({
        expectedVersion: action.versionNo, status: 'VERIFIED',
        evidenceRefs: [evidence('ACTION_VERIFY')]
      }).expect(200)).body.data;
    expect(action.status).toBe('VERIFIED');
    risk = (await api(managerToken)
      .get(`/v1/projects/${projectId}/risks/${risk.id}`).expect(200)).body.data;
    expect(risk).toMatchObject({ residualProbability: 2, residualExposure: 4 });

    let staleAction = await createAction(
      risk.id, 'ACT-STALE', 'risk-http-action-stale-create'
    );
    staleAction = (await api(managerToken)
      .patch(`/v1/projects/${projectId}/risk-issue-actions/${staleAction.id}`)
      .set('Idempotency-Key', 'risk-http-action-stale-done').send({
        expectedVersion: staleAction.versionNo, status: 'DONE',
        evidenceRefs: [evidence('ACTION_DONE')], residualRiskVersion: risk.versionNo,
        residualAssessment: {
          probability: 1, costImpactRating: 1, scheduleImpactRating: 1,
          hseImpactRating: 1, rationale: 'Second residual proposal becomes stale'
        }
      }).expect(200)).body.data;
    risk = (await api(managerToken).patch(`/v1/projects/${projectId}/risks/${risk.id}`)
      .set('Idempotency-Key', 'risk-http-action-bump-risk').send({
        expectedVersion: risk.versionNo, category: 'Updated after stale proposal'
      }).expect(200)).body.data;

    const mixedKey = 'risk-http-action-mixed-verify';
    const mixed = await api(approverToken)
      .patch(`/v1/projects/${projectId}/risk-issue-actions/${staleAction.id}`)
      .set('Idempotency-Key', mixedKey).send({
        expectedVersion: staleAction.versionNo, status: 'VERIFIED',
        title: 'Forbidden mixed mutation', evidenceRefs: [evidence('ACTION_VERIFY')]
      }).expect(400);
    expect(mixed.body.code).toBe('ACTION_COMMAND_SHAPE_INVALID');
    const staleKey = 'risk-http-action-stale-verify';
    const stale = await api(approverToken)
      .patch(`/v1/projects/${projectId}/risk-issue-actions/${staleAction.id}`)
      .set('Idempotency-Key', staleKey).send({
        expectedVersion: staleAction.versionNo, status: 'VERIFIED',
        evidenceRefs: [evidence('ACTION_VERIFY')]
      }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    const staleDetail = await api(managerToken)
      .get(`/v1/projects/${projectId}/risk-issue-actions/${staleAction.id}`).expect(200);
    expect(staleDetail.body.data.status).toBe('DONE');
    const unchangedRisk = await api(managerToken)
      .get(`/v1/projects/${projectId}/risks/${risk.id}`).expect(200);
    expect(unchangedRisk.body.data).toMatchObject({
      versionNo: risk.versionNo, residualProbability: 2, residualExposure: 4
    });
    const [failed] = await dataSource.query<Array<{ receipts: string; events: string }>>(`SELECT
      (SELECT count(*) FROM command_receipts WHERE idempotency_key IN ($1,$2,$3))::text AS receipts,
      (SELECT count(*) FROM transactional_outbox_events
        WHERE correlation_id IN (
          SELECT correlation_id FROM command_receipts WHERE idempotency_key IN ($1,$2,$3)
        ))::text AS events`, [selfVerifyKey, mixedKey, staleKey]);
    expect(failed).toEqual({ receipts: '0', events: '0' });
  });

  it('API-150/152/153/156: freezes complete six-dimension Change and enforces approval SoD', async () => {
    let change = await createChange(
      'CR-APPROVE', completeImpact(), 'risk-http-change-create-001'
    );
    change = (await api(managerToken)
      .patch(`/v1/projects/${projectId}/change-requests/${change.id}`)
      .set('Idempotency-Key', 'risk-http-change-assess-001')
      .send({ expectedVersion: change.versionNo, status: 'ASSESSED' }).expect(200)).body.data;
    change = (await api(managerToken)
      .post(`/v1/projects/${projectId}/change-requests/${change.id}:submit`)
      .set('Idempotency-Key', 'risk-http-change-submit-001')
      .send({ expectedVersion: change.versionNo }).expect(200)).body.data;
    expect(change).toMatchObject({
      status: 'SUBMITTED', sourceBaselineId: baselineId,
      impactSnapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      approvalSnapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });

    const selfKey = 'risk-http-change-self-decision';
    const self = await api(managerToken)
      .post(`/v1/projects/${projectId}/change-requests/${change.id}:decision`)
      .set('Idempotency-Key', selfKey).send({
        expectedVersion: change.versionNo, decision: 'APPROVE',
        comment: 'Requester cannot approve own Change'
      }).expect(403);
    expect(self.body.code).toBe('CHANGE_APPROVAL_SOD');
    const approved = await api(approverToken)
      .post(`/v1/projects/${projectId}/change-requests/${change.id}:decision`)
      .set('Idempotency-Key', 'risk-http-change-independent-decision').send({
        expectedVersion: change.versionNo, decision: 'APPROVE',
        comment: 'Independent approval of complete impact snapshot'
      }).expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'APPROVED', scheduleImpactApproved: true, approvedBy: approverId
    });
    await expect(dataSource.query(
      `UPDATE change_requests SET reason = 'Mutated immutable approval' WHERE id = $1`,
      [change.id]
    )).rejects.toMatchObject({ code: '55000' });

    let incomplete = await createChange(
      'CR-INCOMPLETE', { ...completeImpact(), contract: undefined },
      'risk-http-change-incomplete-create'
    );
    incomplete = (await api(managerToken)
      .patch(`/v1/projects/${projectId}/change-requests/${incomplete.id}`)
      .set('Idempotency-Key', 'risk-http-change-incomplete-assess')
      .send({ expectedVersion: incomplete.versionNo, status: 'ASSESSED' }).expect(200)).body.data;
    const incompleteKey = 'risk-http-change-incomplete-submit';
    const denied = await api(managerToken)
      .post(`/v1/projects/${projectId}/change-requests/${incomplete.id}:submit`)
      .set('Idempotency-Key', incompleteKey)
      .send({ expectedVersion: incomplete.versionNo }).expect(422);
    expect(denied.body.code).toBe('IMPACT_INCOMPLETE');
    const [facts] = await dataSource.query<Array<{
      status: string; receipts: string; selfReceipts: string;
    }>>(`SELECT status,
      (SELECT count(*) FROM command_receipts WHERE idempotency_key = $2)::text AS receipts,
      (SELECT count(*) FROM command_receipts WHERE idempotency_key = $3)::text AS "selfReceipts"
      FROM change_requests WHERE id = $1`, [incomplete.id, incompleteKey, selfKey]);
    expect(facts).toEqual({ status: 'ASSESSED', receipts: '0', selfReceipts: '0' });
  });

  it('API-157/158: returns full authorized 25+25 heatmaps and redacted scoped history', async () => {
    const riskA1 = await createRisk(packageA, 'RSK-SUM-A1', 'risk-http-summary-a1');
    const riskA2 = await createRisk(packageA, 'RSK-SUM-A2', 'risk-http-summary-a2', {
      probability: 5, costImpactRating: 5, scheduleImpactRating: 4, hseImpactRating: 4
    });
    await createRisk(packageB, 'RSK-SUM-B', 'risk-http-summary-b');
    await dataSource.query(
      `UPDATE risks SET scoring_version = 'RISK_SCORING_LEGACY_V1',
        threshold_version = 'RISK_THRESHOLDS_LEGACY_V1' WHERE id = $1`, [riskA2.id]
    );
    await api(managerToken).patch(`/v1/projects/${projectId}/risks/${riskA1.id}`)
      .set('Idempotency-Key', 'risk-http-direct-residual-reason').send({
        expectedVersion: riskA1.versionNo,
        residualAssessment: {
          probability: 1, costImpactRating: 1, scheduleImpactRating: 2, hseImpactRating: 1
        },
        residualAssessmentReason: 'Independent evidence supports direct reassessment',
        evidenceRefs: [evidence('RISK_REASSESSMENT')]
      }).expect(200);

    const scoped = await api(packageToken)
      .get(`/v1/projects/${projectId}/risk-change-summary`).expect(200);
    expect(scoped.body.data.riskTotal).toBe(2);
    expect(scoped.body.data.riskHeatmap.filteredRiskCount).toBe(2);
    expect(scoped.body.data.riskHeatmap.versionGroups).toHaveLength(2);
    for (const group of scoped.body.data.riskHeatmap.versionGroups as Array<{
      inherentCells: unknown[]; residualCells: unknown[];
    }>) {
      expect(group.inherentCells).toHaveLength(25);
      expect(group.residualCells).toHaveLength(25);
    }
    const full = await api(managerToken)
      .get(`/v1/projects/${projectId}/risk-change-summary`).expect(200);
    expect(full.body.data.riskTotal).toBe(3);

    const history = await api(packageToken)
      .get(`/v1/projects/${projectId}/risk-change-history`)
      .query({ sourceType: 'RISK', limit: 100 }).expect(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(3);
    expect(new Set(history.body.data.map((item: { sourceId: string }) => item.sourceId)))
      .toEqual(new Set([riskA1.id, riskA2.id]));
    expect(history.body.data.every((item: Record<string, unknown>) => (
      !Object.hasOwn(item, 'payload') && typeof item.summary === 'string'
    ))).toBe(true);
    const [reasonEvidence] = await dataSource.query<Array<{
      auditReason: string; eventReason: string;
    }>>(`SELECT
      (SELECT payload ->> 'residualAssessmentReason' FROM audit_events
        WHERE object_id = $1 AND action = 'RiskChanged' ORDER BY occurred_at DESC LIMIT 1)
        AS "auditReason",
      (SELECT payload ->> 'residualAssessmentReason' FROM transactional_outbox_events
        WHERE aggregate_id = $1 AND event_type = 'RiskChanged'
        ORDER BY occurred_at DESC LIMIT 1) AS "eventReason"`, [riskA1.id]);
    expect(reasonEvidence).toEqual({
      auditReason: 'Independent evidence supports direct reassessment',
      eventReason: 'Independent evidence supports direct reassessment'
    });
  });

  async function seedIdentityProjectsAndBaseline(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'risk-http-test', name: 'Risk HTTP Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'risk-http-other', name: 'Other HTTP Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'risk-manager@example.test', 'Risk Manager'),
      user(approverId, tenantId, 'risk-approver@example.test', 'Risk Approver'),
      user(packageUserId, tenantId, 'risk-package@example.test', 'Risk Package Owner'),
      user(otherTenantUserId, otherTenantId, 'risk-other@example.test', 'Risk Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(approverId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);
    const managerRole = await role(tenantId, 'RISK_MANAGER', [
      'riskChange.read', 'riskChange.create', 'riskChange.manage',
      'riskChange.requestClosure', 'riskChange.close', 'riskChange.closeCritical',
      'riskChange.submit', 'riskChange.approve', 'user.read'
    ]);
    const approverRole = await role(tenantId, 'RISK_APPROVER', [
      'riskChange.read', 'riskChange.manage', 'riskChange.close',
      'riskChange.closeCritical', 'riskChange.approve'
    ]);
    const packageRole = await role(tenantId, 'RISK_PACKAGE', [
      'riskChange.read', 'riskChange.create', 'riskChange.manage',
      'riskChange.requestClosure', 'user.read'
    ]);
    const otherRole = await role(otherTenantId, 'RISK_OTHER', [
      'riskChange.read', 'riskChange.create', 'riskChange.manage'
    ]);
    await seedProject(tenantId, projectId, managerId, 'RHTTP', 'Risk HTTP Project');
    await seedProject(
      otherTenantId, otherProjectId, otherTenantUserId, 'ROTHER', 'Other Risk Project'
    );
    await dataSource.getRepository(PackageEntity).save([
      packageRow(packageA, tenantId, projectId, managerId, 'RISK-A'),
      packageRow(packageB, tenantId, projectId, managerId, 'RISK-B')
    ]);
    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, approverId, approverRole.id, AssignmentScopeType.PROJECT, projectId),
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageA),
      assignment(
        otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null
      )
    ]);
    const schedule = await dataSource.getRepository(ProjectScheduleEntity).save({
      id: randomUUID(), tenantId, projectId, timezone: 'Asia/Ho_Chi_Minh',
      calendarCode: 'STANDARD', workingWeek: [1, 2, 3, 4, 5], calendarExceptions: [],
      dataDate: '2026-07-18', status: ProjectScheduleStatus.APPROVED,
      sourceFormat: ScheduleSourceFormat.MANUAL, sourceName: 'Risk HTTP baseline fixture',
      sourceHash: null, versionNo: 1, createdBy: managerId, updatedBy: managerId
    });
    const snapshot = { scheduleId: schedule.id, version: 1 };
    await dataSource.getRepository(ScheduleBaselineEntity).save({
      id: baselineId, tenantId, projectId, scheduleId: schedule.id, baselineNumber: 1,
      baselineType: BaselineType.INITIAL, status: BaselineStatus.APPROVED,
      dataDate: '2026-07-18', snapshot, snapshotHash: jsonHash(snapshot),
      reason: 'Initial approved baseline', impactSummary: 'Initial approved plan',
      approvedChangeRequestId: null, replacesBaselineId: null, createdBy: managerId,
      submittedBy: managerId, submittedAt: new Date(), approvedBy: approverId,
      approvedAt: new Date(), decisionComment: 'Approved fixture', versionNo: 1
    });
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, projectManagerId: string,
    code: string, name: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `COMP-${code}`, name: `Company ${code}`,
      organizationType: OrganizationType.INTERNAL, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    const legal = await dataSource.getRepository(LegalEntityEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, companyId: company.id,
      legalName: `Legal ${code}`, country: 'VN', registrationNo: `REG-${code}`,
      taxId: null, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const portfolio = await dataSource.getRepository(PortfolioEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `PORT-${code}`,
      name: `Portfolio ${code}`, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    await dataSource.getRepository(ProjectEntity).save({
      id: fixtureProjectId, tenantId: fixtureTenantId, portfolioId: portfolio.id,
      ownerLegalEntityId: legal.id, customerCompanyId: company.id,
      projectManagerId, code, name, type: ProjectType.SOLAR,
      phase: ProjectPhase.PLANNING, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31',
      forecastCod: null, versionNo: 1, idempotencyKey: null
    });
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 1, status: MasterRecordStatus.ACTIVE
    });
  }

  function assignment(
    fixtureTenantId: string, userAccountId: string, roleId: string,
    scopeType: AssignmentScopeType, scopeId: string | null
  ) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId, roleId,
      scopeType, scopeId, effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null, status: MasterRecordStatus.ACTIVE
    };
  }

  function packageRow(
    id: string, fixtureTenantId: string, fixtureProjectId: string,
    actorId: string, code: string
  ) {
    return {
      id, tenantId: fixtureTenantId, projectId: fixtureProjectId,
      parentPackageId: null, contractorCompanyId: null, code, name: `Package ${code}`,
      packageType: 'EPC', status: PackageStatus.ACTIVE, versionNo: 1,
      idempotencyKey: null, createdBy: actorId, updatedBy: actorId
    };
  }

  function user(id: string, fixtureTenantId: string, email: string, displayName: string) {
    return {
      id, tenantId: fixtureTenantId, email, normalizedEmail: email,
      displayName, status: MasterRecordStatus.ACTIVE, lastLoginAt: null
    };
  }

  function credential(userAccountId: string, fixtureTenantId: string) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId,
      passwordHash, algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    };
  }

  async function login(email: string, tenantCode: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/v1/auth/login')
      .send({ tenantCode, email, password }).expect(200);
    return response.body.accessToken as string;
  }

  function api(token: string, headerTenantId = tenantId) {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', headerTenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path)),
      patch: (path: string) => authorized(request(app.getHttpServer()).patch(path))
    };
  }

  async function createRisk(
    packageId: string, code: string, key: string, overrides: Record<string, unknown> = {}
  ) {
    const response = await api(managerToken).post(`/v1/projects/${projectId}/risks`)
      .set('Idempotency-Key', key).send({ ...riskPayload(packageId, code), ...overrides })
      .expect(201);
    return response.body.data;
  }

  function riskPayload(packageId: string, code: string) {
    return {
      packageId, code, category: 'Schedule', cause: 'Late equipment delivery',
      event: 'Delivery misses the site need date', impact: 'Commissioning sequence may slip',
      probability: 2, costImpactRating: 2, scheduleImpactRating: 3,
      hseImpactRating: 1, ownerId: managerId, reviewDate: '2026-08-15',
      responseStrategy: 'MITIGATE', responsePlan: 'Expedite supplier delivery',
      evidenceRefs: [evidence('RISK_SOURCE')]
    };
  }

  async function createAction(riskId: string, code: string, key: string) {
    const response = await api(managerToken)
      .post(`/v1/projects/${projectId}/risk-issue-actions`)
      .set('Idempotency-Key', key).send({
        riskId, code, actionType: 'RESPONSE', title: `Action ${code}`,
        description: 'Implement and verify mitigation', ownerId: managerId,
        dueDate: '2026-08-10', evidenceRefs: [evidence('ACTION_SOURCE')]
      }).expect(201);
    return response.body.data;
  }

  async function createChange(
    code: string, impact: Record<string, unknown>, key: string
  ) {
    const response = await api(managerToken)
      .post(`/v1/projects/${projectId}/change-requests`)
      .set('Idempotency-Key', key).send({
        packageId: packageA, code, title: `Change ${code}`,
        reason: 'Approved project conditions require controlled change',
        options: ['Retain current plan', 'Proceed with controlled rebaseline'],
        recommendation: 'Proceed with independently approved rebaseline',
        ownerId: managerId, sourceBaselineId: baselineId,
        source: { type: 'MANUAL' }, impact,
        evidenceRefs: [evidence('CHANGE_SOURCE')]
      }).expect(201);
    return response.body.data;
  }

  function completeImpact(): Record<string, unknown> {
    return {
      scope: { summary: 'No scope reduction' },
      schedule: {
        summary: 'Commissioning sequence moves seven days', durationDeltaDays: 7,
        requiresRebaseline: true, affectedMilestoneIds: []
      },
      cost: { summary: 'No approved cost delta', amountDelta: '0.0000', currency: 'VND' },
      quality: { summary: 'Quality controls remain unchanged' },
      hse: { summary: 'HSE controls remain unchanged' },
      contract: { summary: 'Contract notice is required' }
    };
  }

  function evidence(objectType: string) {
    return { objectType, objectId: randomUUID() };
  }

  function jsonHash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
});
