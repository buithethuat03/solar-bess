import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssignmentScopeType, CompanyEntity, DailyLogEntity, HseIncidentEntity, LegalEntityEntity,
  LocalCredentialEntity, MasterRecordStatus, NcrEntity, OrganizationType, PackageEntity,
  PackageStatus, PermitToWorkEntity, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectType, PunchItemEntity, QuantityProgressRecordEntity,
  RoleAssignmentEntity, RoleEntity, SiteEntity, StopWorkActionEntity, TenantEntity,
  UserAccountEntity, WorkfrontEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const hseManagerId = randomUUID();
const issuerId = randomUUID();
const qaqcId = randomUUID();
const packageUserId = randomUUID();
const bareUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const packageAId = randomUUID();
const packageBId = randomUUID();
const companyId = randomUUID();
const password = 'FieldHse!Integration2026';

jest.setTimeout(240_000);

describe('Field, HSE & Quality HTTP integration — API-086…API-097', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let managerToken: string;
  let hseToken: string;
  let issuerToken: string;
  let qaqcToken: string;
  let packageToken: string;
  let bareToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true
    }));
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    await seedFixture();
    managerToken = await login('fhq-manager@example.test', 'fhq-test');
    hseToken = await login('fhq-hse@example.test', 'fhq-test');
    issuerToken = await login('fhq-issuer@example.test', 'fhq-test');
    qaqcToken = await login('fhq-qaqc@example.test', 'fhq-test');
    packageToken = await login('fhq-package@example.test', 'fhq-test');
    bareToken = await login('fhq-bare@example.test', 'fhq-test');
    otherTenantToken = await login('fhq-other@example.test', 'fhq-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-086: lists workfronts with SQL-scoped ABAC, filters and keyset pagination', async () => {
    await seedWorkfront({ code: 'WF-A1', packageId: packageAId });
    await seedWorkfront({ code: 'WF-A2', packageId: packageAId, status: 'READY' });
    await seedWorkfront({ code: 'WF-B1', packageId: packageBId });

    const all = await api(managerToken).get(`/v1/projects/${projectId}/workfronts`).expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta).toEqual({ limit: 50, nextCursor: null });

    const filtered = await api(managerToken)
      .get(`/v1/projects/${projectId}/workfronts?status=READY`).expect(200);
    expect(filtered.body.data.map((row: { code: string }) => row.code)).toEqual(['WF-A2']);

    const paged = await api(managerToken)
      .get(`/v1/projects/${projectId}/workfronts?limit=2`).expect(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(managerToken)
      .get(`/v1/projects/${projectId}/workfronts?limit=2&cursor=${paged.body.meta.nextCursor}`)
      .expect(200);
    expect(next.body.data).toHaveLength(1);

    // Package-scoped principal: the ABAC filter is applied in SQL, not post-pagination.
    const scoped = await api(packageToken)
      .get(`/v1/projects/${projectId}/workfronts`).expect(200);
    expect(scoped.body.data.map((row: { code: string }) => row.code).sort())
      .toEqual(['WF-A1', 'WF-A2']);

    await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/workfronts`).expect(404);
    const denied = await api(bareToken).get(`/v1/projects/${projectId}/workfronts`).expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
  });

  it('API-087: releases only READY+GATES_CLEARED workfronts and defers to the stop-work ledger', async () => {
    const blockedId = await seedWorkfront({
      code: 'WF-REL', packageId: packageAId, status: 'READY', readiness: 'GATES_CLEARED'
    });
    const pendingId = await seedWorkfront({ code: 'WF-PEND', status: 'READY' });

    const notCleared = await release(pendingId, 1).expect(422);
    expect(notCleared.body.code).toBe('READINESS_GATES_NOT_CLEARED');

    // An unlifted project stop-work refuses the release; nothing changes.
    const stopWork = await issueStopWork(managerToken, { targetType: 'PROJECT' });
    const refused = await release(blockedId, 1).expect(422);
    expect(refused.body.code).toBe('STOP_WORK_ACTIVE');
    const untouched = await dataSource.getRepository(WorkfrontEntity)
      .findOneByOrFail({ id: blockedId, tenantId });
    expect(untouched.status).toBe('READY');
    expect(untouched.releasedBy).toBeNull();

    await liftStopWork(hseToken, stopWork.id).expect(201);
    const released = await release(blockedId, 1).expect(200);
    expect(released.body.data).toMatchObject({
      status: 'RELEASED', releasedBy: managerId, versionNo: 2
    });

    const stale = await release(blockedId, 1).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/workfronts/${blockedId}:release`)
      .set('Idempotency-Key', `fhq-rel-${randomUUID()}`)
      .send({ expectedVersion: 2 })
      .expect(404);
  });

  it('API-088/089: daily log slot discipline, sign snapshot and correction supersedes atomically', async () => {
    const created = await createDailyLog({}).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'DRAFT', revision: 1, shift: 'DAY', versionNo: 1
    });
    const logId = created.body.data.id as string;

    const duplicate = await createDailyLog({}).expect(409);
    expect(duplicate.body.code).toBe('DAILY_LOG_SLOT_CONFLICT');
    expect(await count(DailyLogEntity)).toBe(1);

    const wrongSite = await createDailyLog({ siteId: otherSiteId }).expect(422);
    expect(wrongSite.body.code).toBe('SITE_NOT_FOUND');

    // Sign before submit is refused; SUBMIT then SIGN write the legal snapshot.
    const early = await submitDailyLog(logId, { expectedVersion: 1, action: 'SIGN' }).expect(422);
    expect(early.body.code).toBe('INVALID_STATE_TRANSITION');
    await submitDailyLog(logId, { expectedVersion: 1, action: 'SUBMIT' }).expect(200);
    const signed = await submitDailyLog(logId, { expectedVersion: 2, action: 'SIGN' }).expect(200);
    expect(signed.body.data.status).toBe('SIGNED');
    expect(signed.body.data.signedBy).toBe(managerId);
    expect(signed.body.data.signerSnapshot).toMatchObject({
      userId: managerId, email: 'fhq-manager@example.test'
    });
    expect(signed.body.data.signerSnapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Correction without a reason is refused and writes nothing.
    const noReason = await createDailyLog({ correctionOfId: logId }).expect(422);
    expect(noReason.body.code).toBe('CORRECTION_REASON_REQUIRED');
    expect(await count(DailyLogEntity)).toBe(1);

    const corrected = await createDailyLog({
      correctionOfId: logId, reason: 'Sai số liệu nhân lực', summary: 'Nhật ký đã đính chính'
    }).expect(201);
    expect(corrected.body.data).toMatchObject({
      status: 'DRAFT', revision: 2, correctionOfId: logId
    });
    const original = await dataSource.getRepository(DailyLogEntity)
      .findOneByOrFail({ id: logId, tenantId });
    expect(original.status).toBe('SUPERSEDED');

    // Correcting a non-signed log is refused.
    const correctionId = corrected.body.data.id as string;
    const notSigned = await createDailyLog({
      correctionOfId: correctionId, reason: 'Đính chính bản nháp'
    }).expect(422);
    expect(notSigned.body.code).toBe('INVALID_STATE_TRANSITION');

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/daily-logs/${correctionId}:submit`)
      .set('Idempotency-Key', `fhq-sub-${randomUUID()}`)
      .send({ expectedVersion: 1, action: 'SUBMIT' })
      .expect(404);
  });

  it('API-090: quantity ledger appends with dedup, correction and single certification', async () => {
    const workfrontId = await seedWorkfront({ code: 'WF-QTY' });
    const recorded = await recordQuantity(workfrontId, { sourceKey: 'offline-1' }).expect(201);
    expect(recorded.body.data).toMatchObject({
      quantity: '125.5000', unit: 'm2', recordedBy: managerId
    });
    const recordId = recorded.body.data.id as string;

    const replayed = await recordQuantity(workfrontId, { sourceKey: 'offline-1' }).expect(409);
    expect(replayed.body.code).toBe('QUANTITY_SOURCE_CONFLICT');

    const bothRoles = await recordQuantity(workfrontId, {
      sourceKey: 'offline-2', correctionOfId: recordId, certificationOfId: recordId,
      reason: 'đính chính'
    }).expect(422);
    expect(bothRoles.body.code).toBe('QUANTITY_ROLE_CONFLICT');

    const noReason = await recordQuantity(workfrontId, {
      sourceKey: 'offline-3', correctionOfId: recordId
    }).expect(422);
    expect(noReason.body.code).toBe('CORRECTION_REASON_REQUIRED');
    expect(await count(QuantityProgressRecordEntity)).toBe(1);

    const correction = await recordQuantity(workfrontId, {
      sourceKey: 'offline-4', correctionOfId: recordId, reason: 'Sai đơn vị đo',
      quantity: '130.25'
    }).expect(201);
    expect(correction.body.data).toMatchObject({
      correctionOfId: recordId, quantity: '130.2500'
    });

    const certified = await recordQuantity(workfrontId, {
      sourceKey: 'offline-5', certificationOfId: recordId
    }).expect(201);
    expect(certified.body.data.certificationOfId).toBe(recordId);
    const again = await recordQuantity(workfrontId, {
      sourceKey: 'offline-6', certificationOfId: recordId
    }).expect(409);
    expect(again.body.code).toBe('QUANTITY_ALREADY_CERTIFIED');
    expect(await count(QuantityProgressRecordEntity)).toBe(3);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/workfronts/${workfrontId}/quantity-progress`)
      .set('Idempotency-Key', `fhq-qty-${randomUUID()}`)
      .send(quantityPayload({ sourceKey: 'offline-7' }))
      .expect(404);
  });

  it('API-091/092: permit issue is SoD-guarded, single-per-type and stop-work-gated', async () => {
    const workfrontId = await seedWorkfront({ code: 'WF-PTW' });
    const requested = await requestPermit(managerToken, workfrontId, {}).expect(201);
    expect(requested.body.data).toMatchObject({
      status: 'REQUESTED', requestedBy: managerId, siteId
    });
    const permitId = requested.body.data.id as string;

    const badWindow = await requestPermit(managerToken, workfrontId, {
      validTo: '2026-07-01T00:00:00.000Z'
    }).expect(422);
    expect(badWindow.body.code).toBe('PERMIT_WINDOW_INVALID');

    // The requester holds no issue permission at all: 403, not SoD.
    const forbidden = await issuePermit(managerToken, permitId, 1).expect(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');

    // An issuer who requested the permit themselves hits the SoD wall instead.
    const own = await requestPermit(issuerToken, workfrontId, { permitType: 'ELECTRICAL' })
      .expect(201);
    const selfIssue = await issuePermit(issuerToken, own.body.data.id as string, 1).expect(422);
    expect(selfIssue.body.code).toBe('SOD_CONFLICT');

    // A stop-work covering the site refuses the issue — and the permit stays REQUESTED.
    const stopWork = await issueStopWork(managerToken, { targetType: 'SITE', siteId });
    const blocked = await issuePermit(issuerToken, permitId, 1).expect(422);
    expect(blocked.body.code).toBe('STOP_WORK_ACTIVE');
    const untouched = await dataSource.getRepository(PermitToWorkEntity)
      .findOneByOrFail({ id: permitId, tenantId });
    expect(untouched.status).toBe('REQUESTED');
    await liftStopWork(hseToken, stopWork.id).expect(201);

    const issued = await issuePermit(issuerToken, permitId, 1).expect(200);
    expect(issued.body.data).toMatchObject({
      status: 'ISSUED', issuerId, versionNo: 2
    });
    expect(issued.body.data.isolationSnapshot).toHaveLength(1);

    // One live permit per (workfront, type): a duplicate HOT_WORK issue conflicts.
    const second = await requestPermit(managerToken, workfrontId, {}).expect(201);
    const duplicate = await issuePermit(hseToken, second.body.data.id as string, 1).expect(409);
    expect(duplicate.body.code).toBe('PERMIT_ALREADY_ACTIVE');

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/permits-to-work/${permitId}:issue`)
      .set('Idempotency-Key', `fhq-iss-${randomUUID()}`)
      .send({ expectedVersion: 2, isolationSnapshot: [{ point: 'ISO-1' }] })
      .expect(404);
  });

  it('API-093: incident reporting is never gated and never leaks restricted facts', async () => {
    // Reporting stays open under an active stop-work AND an already-open incident.
    await issueStopWork(managerToken, { targetType: 'PROJECT' });
    const first = await reportIncident(managerToken, {}).expect(201);
    expect(first.body.data).toMatchObject({
      status: 'REPORTED', reportedBy: managerId, incidentType: 'NEAR_MISS'
    });
    // The response never carries restricted facts.
    expect(first.body.data).not.toHaveProperty('restrictedFacts');

    // Every role — including the package-scoped principal — may report.
    await reportIncident(packageToken, { incidentType: 'FIRST_AID' }).expect(201);
    await reportIncident(hseToken, { incidentType: 'ENVIRONMENTAL' }).expect(201);
    expect(await count(HseIncidentEntity)).toBe(3);

    // The stored row keeps the restricted facts; audit and outbox payloads never do.
    const stored = await dataSource.getRepository(HseIncidentEntity)
      .findOneByOrFail({ id: first.body.data.id as string, tenantId });
    expect(stored.restrictedFacts).toEqual({ injuredParty: 'không công bố' });
    const auditRows = await dataSource.query<Array<{ payload: Record<string, unknown> }>>(
      `SELECT payload FROM audit_events WHERE tenant_id = $1 AND object_type = 'HseIncident'`,
      [tenantId]
    );
    const outboxRows = await dataSource.query<Array<{ payload: Record<string, unknown> }>>(
      `SELECT payload FROM transactional_outbox_events
       WHERE tenant_id = $1 AND aggregate_type = 'HseIncident'`,
      [tenantId]
    );
    expect(auditRows.length).toBeGreaterThanOrEqual(3);
    expect(outboxRows.length).toBeGreaterThanOrEqual(3);
    for (const row of [...auditRows, ...outboxRows]) {
      expect(row.payload).not.toHaveProperty('restrictedFacts');
      expect(row.payload).not.toHaveProperty('narrative');
      expect(row.payload).not.toHaveProperty('immediateAction');
      expect(JSON.stringify(row.payload)).not.toContain('không công bố');
    }

    // The only failures: validation 400s and the invisible project 404.
    const future = await reportIncident(managerToken, {
      occurredAt: new Date(Date.now() + 86_400_000).toISOString()
    }).expect(400);
    expect(future.body.code).toBe('OCCURRED_AT_IN_FUTURE');
    const badSite = await reportIncident(managerToken, { siteId: otherSiteId }).expect(400);
    expect(badSite.body.code).toBe('SITE_NOT_FOUND');
    await api(managerToken).post(`/v1/projects/${otherProjectId}/hse-incidents`)
      .set('Idempotency-Key', `fhq-inc-${randomUUID()}`)
      .send(incidentPayload({}))
      .expect(404);
    expect(await count(HseIncidentEntity)).toBe(3);
  });

  it('API-094: the split stop-work authority — anyone issues, only HSE_MANAGER lifts, never the issuer', async () => {
    // A package-scoped principal may stop work project-wide.
    const issued = await api(packageToken).post(`/v1/projects/${projectId}/stop-work-actions`)
      .set('Idempotency-Key', `fhq-sw-${randomUUID()}`)
      .send({ action: 'ISSUE', targetType: 'PROJECT', reason: 'Phát hiện nguy cơ điện giật' })
      .expect(201);
    expect(issued.body.data).toMatchObject({ action: 'ISSUE', actorId: packageUserId });
    const issueId = issued.body.data.id as string;

    // Lifting without the lift permission is a 403 — for the issuer role too.
    const noLift = await api(issuerToken).post(`/v1/projects/${projectId}/stop-work-actions`)
      .set('Idempotency-Key', `fhq-sw-${randomUUID()}`)
      .send({
        action: 'LIFT', liftsActionId: issueId,
        reason: 'Đã kiểm tra', verifiedControls: ['cách ly nguồn']
      })
      .expect(403);
    expect(noLift.body.code).toBe('PERMISSION_DENIED');

    // The HSE manager lifts it — with verified controls.
    const lifted = await liftStopWork(hseToken, issueId).expect(201);
    expect(lifted.body.data).toMatchObject({
      action: 'LIFT', liftsActionId: issueId, actorId: hseManagerId
    });
    const secondLift = await liftStopWork(hseToken, issueId).expect(409);
    expect(secondLift.body.code).toBe('STOP_WORK_ALREADY_LIFTED');

    // Whoever issued a stop can never lift it, even holding the permission.
    const hseIssued = await issueStopWork(hseToken, { targetType: 'PROJECT' });
    const selfLift = await liftStopWork(hseToken, hseIssued.id).expect(422);
    expect(selfLift.body.code).toBe('SOD_CONFLICT');

    const badTarget = await api(managerToken).post(`/v1/projects/${projectId}/stop-work-actions`)
      .set('Idempotency-Key', `fhq-sw-${randomUUID()}`)
      .send({ action: 'ISSUE', targetType: 'SITE', reason: 'Thiếu định danh site' })
      .expect(422);
    expect(badTarget.body.code).toBe('STOP_WORK_TARGET_INVALID');
    const noControls = await api(hseToken).post(`/v1/projects/${projectId}/stop-work-actions`)
      .set('Idempotency-Key', `fhq-sw-${randomUUID()}`)
      .send({ action: 'LIFT', liftsActionId: hseIssued.id, reason: 'Gỡ không kiểm chứng' })
      .expect(422);
    expect(noControls.body.code).toBe('VERIFIED_CONTROLS_REQUIRED');
    expect(await count(StopWorkActionEntity)).toBe(3);
  });

  it('API-095: materializes the ITP from an ISSUED+CLEAN revision and runs the inspection cycle', async () => {
    const { revisionId, draftRevisionId } = await seedItpSource();

    // A DRAFT revision can never become an ITP.
    const draft = await inspectionCommand(managerToken, draftRevisionId, {
      commandType: 'REQUEST', holdPointRef: 'HP-01'
    }).expect(422);
    expect(draft.body.code).toBe('ITP_SOURCE_NOT_ISSUED');
    // An unknown id is indistinguishable from an invisible one.
    await inspectionCommand(managerToken, randomUUID(), {
      commandType: 'REQUEST', holdPointRef: 'HP-01'
    }).expect(404);

    // First REQUEST materializes the approved ITP (id = revision id) and opens sequence 1.
    const first = await inspectionCommand(managerToken, revisionId, {
      commandType: 'REQUEST', holdPointRef: 'HP-01'
    }).expect(200);
    expect(first.body.data).toMatchObject({
      status: 'REQUESTED', sequenceNo: 1, holdPointRef: 'HP-01',
      itp: { id: revisionId, documentRevisionId: revisionId, version: 1, packageId: packageAId }
    });
    const inspectionId = first.body.data.id as string;

    const open = await inspectionCommand(managerToken, revisionId, {
      commandType: 'REQUEST', holdPointRef: 'HP-01'
    }).expect(409);
    expect(open.body.code).toBe('INSPECTION_ALREADY_REQUESTED');

    const noEvidence = await inspectionCommand(qaqcToken, revisionId, {
      commandType: 'RECORD', inspectionId, expectedVersion: 1, result: 'FAIL'
    }).expect(422);
    expect(noEvidence.body.code).toBe('EVIDENCE_REQUIRED');

    const failed = await inspectionCommand(qaqcToken, revisionId, {
      commandType: 'RECORD', inspectionId, expectedVersion: 1, result: 'FAIL',
      evidenceRefs: ['minio://evidence/insp-1'],
      witnesses: [{ name: 'Giám sát A', organization: 'EPC' }]
    }).expect(200);
    expect(failed.body.data).toMatchObject({
      status: 'RECORDED', result: 'FAIL', recordedBy: qaqcId, versionNo: 2
    });
    expect(failed.body.data.witnessSnapshot.witnesses).toHaveLength(1);

    // A recorded inspection can never be re-recorded.
    const again = await inspectionCommand(qaqcToken, revisionId, {
      commandType: 'RECORD', inspectionId, expectedVersion: 2, result: 'PASS',
      evidenceRefs: ['minio://evidence/insp-2']
    }).expect(422);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');

    // Re-inspection appends sequence 2; after PASS the hold point refuses new requests.
    const reinspection = await inspectionCommand(managerToken, revisionId, {
      commandType: 'REQUEST', holdPointRef: 'HP-01'
    }).expect(200);
    expect(reinspection.body.data.sequenceNo).toBe(2);
    await inspectionCommand(qaqcToken, revisionId, {
      commandType: 'RECORD', inspectionId: reinspection.body.data.id as string,
      expectedVersion: 1, result: 'PASS', evidenceRefs: ['minio://evidence/insp-3']
    }).expect(200);
    const passed = await inspectionCommand(managerToken, revisionId, {
      commandType: 'REQUEST', holdPointRef: 'HP-01'
    }).expect(422);
    expect(passed.body.code).toBe('HOLD_POINT_ALREADY_PASSED');

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/inspection-test-plans/${revisionId}/inspections`)
      .set('Idempotency-Key', `fhq-insp-${randomUUID()}`)
      .send({ commandType: 'REQUEST', holdPointRef: 'HP-02' })
      .expect(404);
  });

  it('API-096: the NCR lifecycle with independent disposition and closure', async () => {
    const raised = await ncrCommand(managerToken, {
      commandType: 'RAISE', code: 'NCR-001', title: 'Mối hàn không đạt',
      description: 'Mối hàn tại trụ T12 không đạt tiêu chuẩn', severity: 'HIGH',
      packageId: packageAId
    }).expect(200);
    expect(raised.body.data).toMatchObject({ status: 'OPEN', code: 'NCR-001', versionNo: 1 });
    const ncrId = raised.body.data.id as string;

    const duplicate = await ncrCommand(managerToken, {
      commandType: 'RAISE', code: 'NCR-001', title: 'Trùng mã', description: 'Trùng mã NCR',
      severity: 'LOW'
    }).expect(409);
    expect(duplicate.body.code).toBe('NCR_CODE_CONFLICT');
    expect(await count(NcrEntity)).toBe(1);

    // Skipping steps is refused by the state map.
    const skip = await ncrCommand(managerToken, {
      commandType: 'PROPOSE_DISPOSITION', ncrId, expectedVersion: 1,
      disposition: 'REWORK', reason: 'Đề xuất sớm'
    }).expect(422);
    expect(skip.body.code).toBe('INVALID_STATE_TRANSITION');

    await ncrCommand(managerToken, {
      commandType: 'CONTAIN', ncrId, expectedVersion: 1,
      containmentAction: 'Cách ly khu vực trụ T12'
    }).expect(200);
    await ncrCommand(managerToken, {
      commandType: 'RECORD_ROOT_CAUSE', ncrId, expectedVersion: 2,
      rootCause: 'Que hàn sai chủng loại'
    }).expect(200);
    const proposed = await ncrCommand(managerToken, {
      commandType: 'PROPOSE_DISPOSITION', ncrId, expectedVersion: 3,
      disposition: 'REWORK', reason: 'Hàn lại toàn bộ mối nối'
    }).expect(200);
    expect(proposed.body.data.status).toBe('DISPOSITION_PROPOSED');
    expect(proposed.body.data.dispositionCycle).toMatchObject({
      sequenceNo: 1, proposedDisposition: 'REWORK', decision: null
    });

    // The proposer cannot decide their own cycle.
    const selfDecide = await ncrCommand(managerToken, {
      commandType: 'DECIDE_DISPOSITION', ncrId, expectedVersion: 4,
      decision: 'APPROVE', reason: 'Tự phê duyệt'
    }).expect(422);
    expect(selfDecide.body.code).toBe('SOD_CONFLICT');

    // RETURN reopens the proposal loop with cycle 2.
    const returned = await ncrCommand(qaqcToken, {
      commandType: 'DECIDE_DISPOSITION', ncrId, expectedVersion: 4,
      decision: 'RETURN', reason: 'Cần đánh giá thêm phạm vi'
    }).expect(200);
    expect(returned.body.data.status).toBe('RETURNED');
    const reproposed = await ncrCommand(managerToken, {
      commandType: 'PROPOSE_DISPOSITION', ncrId, expectedVersion: 5,
      disposition: 'REPAIR', reason: 'Sửa cục bộ theo đánh giá mới'
    }).expect(200);
    expect(reproposed.body.data.dispositionCycle.sequenceNo).toBe(2);
    const approved = await ncrCommand(qaqcToken, {
      commandType: 'DECIDE_DISPOSITION', ncrId, expectedVersion: 6,
      decision: 'APPROVE', reason: 'Chấp thuận phương án sửa'
    }).expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'DISPOSITION_APPROVED', disposition: 'REPAIR', dispositionApprovedBy: qaqcId
    });

    await ncrCommand(managerToken, {
      commandType: 'START_RECTIFICATION', ncrId, expectedVersion: 7
    }).expect(200);
    await ncrCommand(managerToken, {
      commandType: 'REQUEST_VERIFICATION', ncrId, expectedVersion: 8
    }).expect(200);

    // The owner (the manager) can never verify their own closure.
    const ownerClose = await ncrCommand(managerToken, {
      commandType: 'VERIFY_CLOSE', ncrId, expectedVersion: 9,
      evidenceRefs: ['minio://evidence/ncr-1']
    }).expect(422);
    expect(ownerClose.body.code).toBe('SOD_CONFLICT');
    const closed = await ncrCommand(qaqcToken, {
      commandType: 'VERIFY_CLOSE', ncrId, expectedVersion: 9,
      evidenceRefs: ['minio://evidence/ncr-1']
    }).expect(200);
    expect(closed.body.data).toMatchObject({ status: 'CLOSED', verifiedBy: qaqcId });

    await ncrCommand(managerToken, {
      commandType: 'REOPEN', ncrId, expectedVersion: 10, reason: 'Phát hiện lại lỗi'
    }).expect(200);

    // CAPA: recorded under the NCR; the owner cannot verify their own action.
    const capa = await ncrCommand(managerToken, {
      commandType: 'RECORD_CAPA', ncrId, expectedVersion: 11,
      capaTitle: 'Đào tạo lại quy trình hàn'
    }).expect(200);
    expect(capa.body.data).toMatchObject({ status: 'OPEN', ncrId, ownerId: managerId });
    const capaId = capa.body.data.id as string;
    const selfVerify = await ncrCommand(managerToken, {
      commandType: 'VERIFY_CAPA', capaActionId: capaId, expectedVersion: 1,
      effectivenessAssessment: 'Tự đánh giá'
    }).expect(422);
    expect(selfVerify.body.code).toBe('SOD_CONFLICT');
    const verified = await ncrCommand(qaqcToken, {
      commandType: 'VERIFY_CAPA', capaActionId: capaId, expectedVersion: 1,
      effectivenessAssessment: 'Không tái diễn sau 30 ngày'
    }).expect(200);
    expect(verified.body.data).toMatchObject({ status: 'VERIFIED', verifiedBy: qaqcId });

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/projects/${projectId}/ncrs`)
      .set('Idempotency-Key', `fhq-ncr-${randomUUID()}`)
      .send({
        commandType: 'CONTAIN', ncrId, expectedVersion: 12,
        containmentAction: 'Chéo tenant'
      })
      .expect(404);
  });

  it('API-097: punch category A discipline, waiver and independent closure', async () => {
    const categoryA = await punchCommand(managerToken, {
      commandType: 'CREATE', code: 'PN-A-001', title: 'Thiếu tiếp địa tủ điện', category: 'A'
    }).expect(200);
    expect(categoryA.body.data).toMatchObject({
      category: 'A', codBlocking: true, waivable: false, status: 'OPEN'
    });
    const punchAId = categoryA.body.data.id as string;

    const contradiction = await punchCommand(managerToken, {
      commandType: 'CREATE', code: 'PN-A-002', title: 'Category A không chặn COD',
      category: 'A', codBlocking: false
    }).expect(422);
    expect(contradiction.body.code).toBe('PUNCH_CATEGORY_A_INVALID');

    const waiveA = await punchCommand(managerToken, {
      commandType: 'WAIVE', punchItemId: punchAId, expectedVersion: 1,
      reason: 'Muốn bỏ qua hạng mục an toàn'
    }).expect(422);
    expect(waiveA.body.code).toBe('PUNCH_NOT_WAIVABLE');

    const categoryC = await punchCommand(managerToken, {
      commandType: 'CREATE', code: 'PN-C-001', title: 'Sơn dặm hoàn thiện', category: 'C'
    }).expect(200);
    const punchCId = categoryC.body.data.id as string;
    const waived = await punchCommand(managerToken, {
      commandType: 'WAIVE', punchItemId: punchCId, expectedVersion: 1,
      reason: 'Không ảnh hưởng vận hành, chấp nhận tồn tại'
    }).expect(200);
    expect(waived.body.data).toMatchObject({ status: 'WAIVED', waivedBy: managerId });

    // Closure runs through a cycle with SoD on both sides.
    const categoryB = await punchCommand(managerToken, {
      commandType: 'CREATE', code: 'PN-B-001', title: 'Xiết lại bulong giá đỡ', category: 'B'
    }).expect(200);
    const punchBId = categoryB.body.data.id as string;
    const requestedClosure = await punchCommand(managerToken, {
      commandType: 'REQUEST_CLOSURE', punchItemId: punchBId, expectedVersion: 1,
      reason: 'Đã xiết đủ lực', evidenceRefs: ['minio://evidence/punch-1']
    }).expect(200);
    expect(requestedClosure.body.data).toMatchObject({ status: 'READY_FOR_VERIFICATION' });
    expect(requestedClosure.body.data.closureCycle).toMatchObject({
      sequenceNo: 1, decision: null
    });

    const selfDecide = await punchCommand(managerToken, {
      commandType: 'DECIDE_CLOSURE', punchItemId: punchBId, expectedVersion: 2,
      decision: 'APPROVE', reason: 'Tự nghiệm thu'
    }).expect(422);
    expect(selfDecide.body.code).toBe('SOD_CONFLICT');

    const returned = await punchCommand(qaqcToken, {
      commandType: 'DECIDE_CLOSURE', punchItemId: punchBId, expectedVersion: 2,
      decision: 'RETURN', reason: 'Thiếu ảnh nghiệm thu'
    }).expect(200);
    expect(returned.body.data.status).toBe('OPEN');
    await punchCommand(managerToken, {
      commandType: 'REQUEST_CLOSURE', punchItemId: punchBId, expectedVersion: 3,
      reason: 'Bổ sung ảnh nghiệm thu', evidenceRefs: ['minio://evidence/punch-2']
    }).expect(200);
    const closed = await punchCommand(qaqcToken, {
      commandType: 'DECIDE_CLOSURE', punchItemId: punchBId, expectedVersion: 4,
      decision: 'APPROVE', reason: 'Đạt yêu cầu'
    }).expect(200);
    expect(closed.body.data).toMatchObject({
      status: 'CLOSED', verifiedBy: qaqcId,
      closureEvidenceRefs: ['minio://evidence/punch-2']
    });

    expect(await count(PunchItemEntity)).toBe(3);
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/projects/${projectId}/punch-items`)
      .set('Idempotency-Key', `fhq-pn-${randomUUID()}`)
      .send({
        commandType: 'WAIVE', punchItemId: punchCId, expectedVersion: 2,
        reason: 'Chéo tenant'
      })
      .expect(404);
  });

  it('replays an identical command, conflicts on key reuse and requires the key at all', async () => {
    const key = `fhq-replay-${randomUUID()}`;
    const first = await api(managerToken).post(`/v1/projects/${projectId}/daily-logs`)
      .set('Idempotency-Key', key).send(dailyLogPayload({})).expect(201);
    const replay = await api(managerToken).post(`/v1/projects/${projectId}/daily-logs`)
      .set('Idempotency-Key', key).send(dailyLogPayload({})).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await count(DailyLogEntity)).toBe(1);

    const conflict = await api(managerToken).post(`/v1/projects/${projectId}/daily-logs`)
      .set('Idempotency-Key', key).send(dailyLogPayload({ shift: 'NIGHT' })).expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await count(DailyLogEntity)).toBe(1);

    const missing = await api(managerToken).post(`/v1/projects/${projectId}/daily-logs`)
      .send(dailyLogPayload({ shift: 'NIGHT' })).expect(400);
    expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await count(DailyLogEntity)).toBe(1);
  });

  function release(workfrontId: string, expectedVersion: number) {
    return api(managerToken).post(`/v1/workfronts/${workfrontId}:release`)
      .set('Idempotency-Key', `fhq-rel-${randomUUID()}`)
      .send({ expectedVersion });
  }

  function dailyLogPayload(overrides: Partial<{
    siteId: string; shift: string; correctionOfId: string; reason: string; summary: string;
  }>) {
    return {
      siteId: overrides.siteId ?? siteId, contractorCompanyId: companyId,
      logDate: '2026-07-25', shift: overrides.shift ?? 'DAY',
      summary: overrides.summary ?? 'Thi công lắp đặt giá đỡ khu A',
      ...(overrides.correctionOfId ? { correctionOfId: overrides.correctionOfId } : {}),
      ...(overrides.reason ? { reason: overrides.reason } : {})
    };
  }

  function createDailyLog(overrides: Parameters<typeof dailyLogPayload>[0]) {
    return api(managerToken).post(`/v1/projects/${projectId}/daily-logs`)
      .set('Idempotency-Key', `fhq-log-${randomUUID()}`)
      .send(dailyLogPayload(overrides));
  }

  function submitDailyLog(dailyLogId: string, body: Record<string, unknown>) {
    return api(managerToken).post(`/v1/daily-logs/${dailyLogId}:submit`)
      .set('Idempotency-Key', `fhq-sub-${randomUUID()}`)
      .send(body);
  }

  function quantityPayload(overrides: Partial<{
    sourceKey: string; quantity: string; correctionOfId: string;
    certificationOfId: string; reason: string;
  }>) {
    return {
      recordDate: '2026-07-25', quantity: overrides.quantity ?? '125.5', unit: 'm2',
      sourceKey: overrides.sourceKey ?? `offline-${randomUUID()}`,
      evidenceRefs: ['minio://evidence/qty-1'],
      ...(overrides.correctionOfId ? { correctionOfId: overrides.correctionOfId } : {}),
      ...(overrides.certificationOfId ? { certificationOfId: overrides.certificationOfId } : {}),
      ...(overrides.reason ? { reason: overrides.reason } : {})
    };
  }

  function recordQuantity(workfrontId: string, overrides: Parameters<typeof quantityPayload>[0]) {
    return api(managerToken).post(`/v1/workfronts/${workfrontId}/quantity-progress`)
      .set('Idempotency-Key', `fhq-qty-${randomUUID()}`)
      .send(quantityPayload(overrides));
  }

  function requestPermit(token: string, workfrontId: string, overrides: Partial<{
    permitType: string; validTo: string;
  }>) {
    return api(token).post(`/v1/workfronts/${workfrontId}/permits-to-work`)
      .set('Idempotency-Key', `fhq-ptw-${randomUUID()}`)
      .send({
        permitType: overrides.permitType ?? 'HOT_WORK',
        description: 'Hàn cắt tại khu vực A',
        validFrom: '2026-07-20T00:00:00.000Z',
        validTo: overrides.validTo ?? '2026-07-30T00:00:00.000Z'
      });
  }

  function issuePermit(token: string, permitId: string, expectedVersion: number) {
    return api(token).post(`/v1/permits-to-work/${permitId}:issue`)
      .set('Idempotency-Key', `fhq-iss-${randomUUID()}`)
      .send({
        expectedVersion,
        isolationSnapshot: [{ point: 'ISO-1', method: 'khóa và treo thẻ' }]
      });
  }

  function incidentPayload(overrides: Partial<{
    occurredAt: string; siteId: string; incidentType: string;
  }>) {
    return {
      siteId: overrides.siteId ?? siteId,
      occurredAt: overrides.occurredAt ?? new Date(Date.now() - 3_600_000).toISOString(),
      incidentType: overrides.incidentType ?? 'NEAR_MISS',
      actualSeverity: 'MEDIUM', potentialSeverity: 'HIGH',
      narrative: 'Suýt va chạm giữa xe nâng và giàn giáo',
      immediateAction: 'Dừng xe nâng, cảnh báo khu vực',
      restrictedFacts: { injuredParty: 'không công bố' }
    };
  }

  function reportIncident(token: string, overrides: Parameters<typeof incidentPayload>[0]) {
    return api(token).post(`/v1/projects/${projectId}/hse-incidents`)
      .set('Idempotency-Key', `fhq-inc-${randomUUID()}`)
      .send(incidentPayload(overrides));
  }

  async function issueStopWork(token: string, overrides: Partial<{
    targetType: string; siteId: string; workfrontId: string; permitId: string;
  }>): Promise<{ id: string }> {
    const response = await api(token).post(`/v1/projects/${projectId}/stop-work-actions`)
      .set('Idempotency-Key', `fhq-sw-${randomUUID()}`)
      .send({
        action: 'ISSUE', targetType: overrides.targetType ?? 'PROJECT',
        reason: 'Phát hiện điều kiện mất an toàn',
        ...(overrides.siteId ? { siteId: overrides.siteId } : {}),
        ...(overrides.workfrontId ? { workfrontId: overrides.workfrontId } : {}),
        ...(overrides.permitId ? { permitId: overrides.permitId } : {})
      })
      .expect(201);
    return { id: response.body.data.id as string };
  }

  function liftStopWork(token: string, liftsActionId: string) {
    return api(token).post(`/v1/projects/${projectId}/stop-work-actions`)
      .set('Idempotency-Key', `fhq-sw-${randomUUID()}`)
      .send({
        action: 'LIFT', liftsActionId,
        reason: 'Điều kiện an toàn đã được khôi phục',
        verifiedControls: ['cách ly nguồn điện', 'rào chắn khu vực']
      });
  }

  function inspectionCommand(token: string, itpId: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/inspection-test-plans/${itpId}/inspections`)
      .set('Idempotency-Key', `fhq-insp-${randomUUID()}`)
      .send(body);
  }

  function ncrCommand(token: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/projects/${projectId}/ncrs`)
      .set('Idempotency-Key', `fhq-ncr-${randomUUID()}`)
      .send(body);
  }

  function punchCommand(token: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/projects/${projectId}/punch-items`)
      .set('Idempotency-Key', `fhq-pn-${randomUUID()}`)
      .send(body);
  }

  async function seedWorkfront(overrides: {
    code: string;
    packageId?: string;
    status?: string;
    readiness?: string;
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO workfronts (
        id, tenant_id, project_id, site_id, package_id, code, name, status, readiness,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'Workfront fixture',$7,$8,$9,$9)`,
      [
        id, tenantId, projectId, siteId, overrides.packageId ?? null, overrides.code,
        overrides.status ?? 'PLANNED', overrides.readiness ?? 'PENDING', managerId
      ]
    );
    return id;
  }

  async function seedItpSource(): Promise<{ revisionId: string; draftRevisionId: string }> {
    const documentId = randomUUID();
    const revisionId = randomUUID();
    const draftRevisionId = randomUUID();
    await dataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, package_id, document_code, title, discipline, type,
        classification, owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'ITP-DOC-001','Kế hoạch kiểm tra','QA','ITP','INTERNAL',$5,'ACTIVE',$5,$5)`,
      [documentId, tenantId, projectId, packageAId, managerId]
    );
    await dataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, released_object_key, content_hash, scan_status, lock_state,
        approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'ISSUED','FOR_CONSTRUCTION','itp.pdf','application/pdf',
        'released/itp.pdf',$5,'CLEAN','LOCKED',$6,now(),$6,now(),$6)`,
      [revisionId, tenantId, documentId, projectId, 'a'.repeat(64), managerId]
    );
    await dataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, scan_status, lock_state, uploaded_by
      ) VALUES ($1,$2,$3,$4,'B',1,'DRAFT','FOR_REVIEW','itp-draft.pdf','application/pdf',
        'SCANNING','UNLOCKED',$5)`,
      [draftRevisionId, tenantId, documentId, projectId, managerId]
    );
    return { revisionId, draftRevisionId };
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'fhq-test', name: 'Field Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'fhq-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'fhq-manager@example.test', 'Field Manager'),
      user(hseManagerId, tenantId, 'fhq-hse@example.test', 'HSE Manager'),
      user(issuerId, tenantId, 'fhq-issuer@example.test', 'Permit Issuer'),
      user(qaqcId, tenantId, 'fhq-qaqc@example.test', 'QAQC Manager'),
      user(packageUserId, tenantId, 'fhq-package@example.test', 'Package Contractor'),
      user(bareUserId, tenantId, 'fhq-bare@example.test', 'No Field Access'),
      user(otherTenantUserId, otherTenantId, 'fhq-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(hseManagerId, tenantId),
      credential(issuerId, tenantId), credential(qaqcId, tenantId),
      credential(packageUserId, tenantId), credential(bareUserId, tenantId),
      credential(otherTenantUserId, otherTenantId)
    ]);

    const managerRole = await role(tenantId, 'FHQ_MANAGER', [
      'workfront.read', 'workfront.release', 'dailyLog.create', 'dailyLog.submit',
      'progress.record', 'permitToWork.request', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage'
    ]);
    // The catalog HSE_MANAGER role ships with NO assignment; the fixture assigns it to a test
    // user precisely to exercise the lift happy path.
    const hseRole = await role(tenantId, 'HSE_MANAGER', [
      'workfront.read', 'permitToWork.issue', 'hseIncident.report',
      'stopWork.issue', 'stopWork.lift'
    ]);
    // Requester + issuer codes together, deliberately WITHOUT stopWork.lift.
    const issuerRole = await role(tenantId, 'FHQ_ISSUER', [
      'workfront.read', 'permitToWork.request', 'permitToWork.issue',
      'hseIncident.report', 'stopWork.issue'
    ]);
    const qaqcRole = await role(tenantId, 'QAQC_MANAGER', [
      'workfront.read', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage'
    ]);
    const packageRole = await role(tenantId, 'FHQ_CONTRACTOR', [
      'workfront.read', 'dailyLog.create', 'hseIncident.report', 'stopWork.issue'
    ]);
    const bareRole = await role(tenantId, 'FHQ_NONE', ['notification.read']);
    const otherRole = await role(otherTenantId, 'FHQ_OTHER', [
      'workfront.read', 'workfront.release', 'dailyLog.create', 'dailyLog.submit',
      'progress.record', 'permitToWork.request', 'permitToWork.issue', 'hseIncident.report',
      'stopWork.issue', 'stopWork.lift', 'inspection.manage', 'ncr.manage', 'punch.manage'
    ]);

    await seedProject(tenantId, projectId, siteId, 'FHQ-PRJ', managerId, companyId);
    await seedProject(
      otherTenantId, otherProjectId, otherSiteId, 'FHQ-OTH', otherTenantUserId, randomUUID()
    );
    await dataSource.getRepository(PackageEntity).save([
      packageRow(packageAId, 'FHQ-PKG-A'), packageRow(packageBId, 'FHQ-PKG-B')
    ]);

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, hseManagerId, hseRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, issuerId, issuerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, qaqcId, qaqcRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageAId),
      assignment(tenantId, bareUserId, bareRole.id, AssignmentScopeType.TENANT, null),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  function packageRow(id: string, code: string) {
    return {
      id, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
      code, name: code, packageType: 'EPC', status: PackageStatus.ACTIVE,
      versionNo: 1, idempotencyKey: null, createdBy: managerId, updatedBy: managerId
    };
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, fixtureSiteId: string, code: string,
    managerUserId: string, fixtureCompanyId: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: fixtureCompanyId, tenantId: fixtureTenantId, code: `COMP-${code}`,
      name: `Company ${code}`, organizationType: OrganizationType.CONTRACTOR,
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
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
      projectManagerId: managerUserId, code, name: `Project ${code}`, type: ProjectType.SOLAR,
      phase: ProjectPhase.EXECUTION, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31', forecastCod: null,
      versionNo: 1, idempotencyKey: null
    });
    await dataSource.getRepository(SiteEntity).save({
      id: fixtureSiteId, tenantId: fixtureTenantId, projectId: fixtureProjectId,
      code: 'MAIN', name: 'Main site', location: null, timezone: 'Asia/Ho_Chi_Minh',
      isPrimary: true, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 9, status: MasterRecordStatus.ACTIVE
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
      post: (path: string) => authorized(request(app.getHttpServer()).post(path))
    };
  }
});
