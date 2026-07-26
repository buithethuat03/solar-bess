import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssignmentScopeType, CodGateEntity, CodGateReviewCycleEntity, CodPackageEntity,
  CommissioningSystemEntity, CompanyEntity, HandoverEntity, LegalEntityEntity,
  LocalCredentialEntity, MasterRecordStatus, OrganizationType, PackageEntity, PackageStatus,
  PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus, ProjectType,
  RoleAssignmentEntity, RoleEntity, SiteEntity, TenantEntity, TestPackEntity, TestRunEntity,
  UserAccountEntity
} from 'src/database/entities';
import { canonicalHash } from 'src/modules/risk-change/domain/canonical-hash';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const signerId = randomUUID();
const qaqcUserId = randomUUID();
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
const epcPartyId = randomUUID();
const ownerPartyId = randomUUID();
const password = 'Commissioning!Integration2026';

jest.setTimeout(240_000);

describe('Commissioning & COD HTTP integration — API-098…API-105', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let managerToken: string;
  let signerToken: string;
  let qaqcToken: string;
  let packageToken: string;
  let bareToken: string;
  let otherTenantToken: string;
  let issuedRevisionId: string;
  let draftRevisionId: string;

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
    const revisions = await seedProcedureRevisions();
    issuedRevisionId = revisions.issuedRevisionId;
    draftRevisionId = revisions.draftRevisionId;
    managerToken = await login('cod-manager@example.test', 'cod-test');
    signerToken = await login('cod-signer@example.test', 'cod-test');
    qaqcToken = await login('cod-qaqc@example.test', 'cod-test');
    packageToken = await login('cod-package@example.test', 'cod-test');
    bareToken = await login('cod-bare@example.test', 'cod-test');
    otherTenantToken = await login('cod-other@example.test', 'cod-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-098/099: creates systems and lists them with SQL-scoped ABAC and keyset paging', async () => {
    const parent = await createSystem(managerToken, { code: 'SYS-A', name: 'Trạm 110kV' })
      .expect(201);
    expect(parent.body.data).toMatchObject({
      code: 'SYS-A', status: 'NOT_READY', parentSystemId: null, versionNo: 1
    });
    const parentId = parent.body.data.id as string;
    await createSystem(managerToken, {
      code: 'SYS-B', name: 'Ngăn lộ 1', parentSystemId: parentId
    }).expect(201);
    await createSystem(managerToken, {
      code: 'SYS-C', name: 'BESS block', systemType: 'BESS_BLOCK'
    }).expect(201);

    const duplicate = await createSystem(managerToken, { code: 'SYS-A', name: 'Trùng mã' })
      .expect(409);
    expect(duplicate.body.code).toBe('COMMISSIONING_SYSTEM_CODE_CONFLICT');
    expect(await count(CommissioningSystemEntity)).toBe(3);

    const unknownParent = await createSystem(managerToken, {
      code: 'SYS-D', name: 'Mồ côi', parentSystemId: randomUUID()
    }).expect(422);
    expect(unknownParent.body.code).toBe('PARENT_SYSTEM_NOT_FOUND');
    expect(await count(CommissioningSystemEntity)).toBe(3);

    const all = await api(managerToken)
      .get(`/v1/projects/${projectId}/commissioning-systems`).expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta).toEqual({ limit: 50, nextCursor: null });

    const filtered = await api(managerToken)
      .get(`/v1/projects/${projectId}/commissioning-systems?systemType=BESS_BLOCK`).expect(200);
    expect(filtered.body.data.map((row: { code: string }) => row.code)).toEqual(['SYS-C']);

    const children = await api(managerToken)
      .get(`/v1/projects/${projectId}/commissioning-systems?parentSystemId=${parentId}`)
      .expect(200);
    expect(children.body.data.map((row: { code: string }) => row.code)).toEqual(['SYS-B']);

    const paged = await api(managerToken)
      .get(`/v1/projects/${projectId}/commissioning-systems?limit=2`).expect(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(managerToken)
      .get(`/v1/projects/${projectId}/commissioning-systems?limit=2&cursor=${paged.body.meta.nextCursor}`)
      .expect(200);
    expect(next.body.data).toHaveLength(1);
    // Every row appears exactly once across the two pages — the boundary is compared row-wise.
    const codes = [
      ...paged.body.data.map((row: { code: string }) => row.code),
      ...next.body.data.map((row: { code: string }) => row.code)
    ];
    expect([...codes].sort()).toEqual(['SYS-A', 'SYS-B', 'SYS-C']);

    const badCursor = await api(managerToken)
      .get(`/v1/projects/${projectId}/commissioning-systems?cursor=not-a-cursor`).expect(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');

    // Package-scoped principal: reach into the project is decided in SQL before pagination.
    const scoped = await api(packageToken)
      .get(`/v1/projects/${projectId}/commissioning-systems`).expect(200);
    expect(scoped.body.data).toHaveLength(3);

    await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/commissioning-systems`).expect(404);
    const denied = await api(bareToken)
      .get(`/v1/projects/${projectId}/commissioning-systems`).expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    await api(qaqcToken).post(`/v1/projects/${projectId}/commissioning-systems`)
      .set('Idempotency-Key', `cod-sys-${randomUUID()}`)
      .send({ code: 'SYS-QA', name: 'QA không được tạo', systemType: 'MV_SWITCHGEAR' })
      .expect(403);
  });

  it('API-100: only an ISSUED + CLEAN procedure revision may back a test pack', async () => {
    const systemId = await createSystemId();

    const locked = await createTestPack(managerToken, systemId, {
      procedureRevisionId: draftRevisionId
    }).expect(422);
    expect(locked.body.code).toBe('PROCEDURE_REVISION_LOCKED');
    expect(await count(TestPackEntity)).toBe(0);

    const missing = await createTestPack(managerToken, systemId, {
      procedureRevisionId: randomUUID()
    }).expect(422);
    expect(missing.body.code).toBe('PROCEDURE_REVISION_LOCKED');
    expect(await count(TestPackEntity)).toBe(0);

    const created = await createTestPack(managerToken, systemId, {}).expect(201);
    expect(created.body.data).toMatchObject({
      code: 'TP-01', status: 'APPROVED', procedureRevisionId: issuedRevisionId,
      approvedBy: managerId, versionNo: 1
    });
    expect(created.body.data.approvedAt).toEqual(expect.any(String));

    const duplicate = await createTestPack(managerToken, systemId, {}).expect(409);
    expect(duplicate.body.code).toBe('TEST_PACK_CONFLICT');
    expect(await count(TestPackEntity)).toBe(1);

    // QA/QC holds testPack.create; a caller from another tenant cannot see the system at all.
    await createTestPack(qaqcToken, systemId, { code: 'TP-02' }).expect(201);
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/commissioning-systems/${systemId}/test-packs`)
      .set('Idempotency-Key', `cod-tp-${randomUUID()}`)
      .send({
        code: 'TP-X', title: 'Cross tenant', procedureRevisionId: issuedRevisionId
      })
      .expect(404);
    expect(await count(TestPackEntity)).toBe(2);
  });

  it('API-101/102: one open run per pack, prerequisites enforced, result recorded once', async () => {
    const packId = await createPackId();

    const unmet = await startRun(qaqcToken, packId, { satisfiedPrerequisites: [] }).expect(422);
    expect(unmet.body.code).toBe('PREREQUISITES_NOT_MET');
    expect(await count(TestRunEntity)).toBe(0);

    const started = await startRun(qaqcToken, packId, {}).expect(201);
    expect(started.body.data).toMatchObject({
      runNo: 1, status: 'IN_PROGRESS', result: null, previousRunId: null, startedBy: qaqcUserId
    });
    const runId = started.body.data.id as string;

    const second = await startRun(qaqcToken, packId, {}).expect(409);
    expect(second.body.code).toBe('RUN_IN_PROGRESS');
    expect(await count(TestRunEntity)).toBe(1);

    // Evidence is mandatory: the DTO refuses an empty list before the row is ever touched.
    await completeRun(qaqcToken, runId, { expectedVersion: 1, result: 'PASSED', evidenceRefs: [] })
      .expect(400);
    const stale = await completeRun(qaqcToken, runId, { expectedVersion: 9 }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const completed = await completeRun(qaqcToken, runId, {
      expectedVersion: 1, result: 'FAILED'
    }).expect(200);
    expect(completed.body.data).toMatchObject({
      status: 'RECORDED', result: 'FAILED', recordedBy: qaqcUserId, versionNo: 2
    });
    expect(completed.body.data.witnessSnapshot).toMatchObject({ recordedBy: qaqcUserId });
    expect(completed.body.data.endedAt).toEqual(expect.any(String));

    const again = await completeRun(qaqcToken, runId, {
      expectedVersion: 2, result: 'PASSED'
    }).expect(409);
    expect(again.body.code).toBe('RESULT_ALREADY_RECORDED');
    const stored = await dataSource.getRepository(TestRunEntity)
      .findOneByOrFail({ id: runId, tenantId });
    // A FAILED run never becomes PASSED, whatever the second call asked for.
    expect(stored.result).toBe('FAILED');

    await api(otherTenantToken, otherTenantId).post(`/v1/test-runs/${runId}:complete`)
      .set('Idempotency-Key', `cod-run-${randomUUID()}`)
      .send({ expectedVersion: 2, result: 'PASSED', evidenceRefs: ['minio://x'] })
      .expect(404);
  });

  it('API-103: a retest follows only a FAILED or ABORTED run and links back to it', async () => {
    const packId = await createPackId();
    const first = await startRun(qaqcToken, packId, {}).expect(201);
    const firstId = first.body.data.id as string;

    const tooEarly = await createRetest(qaqcToken, firstId).expect(422);
    expect(tooEarly.body.code).toBe('RETEST_NOT_ALLOWED');
    expect(await count(TestRunEntity)).toBe(1);

    await completeRun(qaqcToken, firstId, { expectedVersion: 1, result: 'PASSED' }).expect(200);
    const passed = await createRetest(qaqcToken, firstId).expect(422);
    expect(passed.body.code).toBe('RETEST_NOT_ALLOWED');
    expect(await count(TestRunEntity)).toBe(1);

    const second = await startRun(qaqcToken, packId, {}).expect(201);
    const secondId = second.body.data.id as string;
    await completeRun(qaqcToken, secondId, { expectedVersion: 1, result: 'ABORTED' }).expect(200);

    const retest = await createRetest(qaqcToken, secondId).expect(201);
    expect(retest.body.data).toMatchObject({
      runNo: 3, status: 'IN_PROGRESS', previousRunId: secondId, result: null
    });
    // The aborted run is untouched: the retest is a new row, never an edit.
    const aborted = await dataSource.getRepository(TestRunEntity)
      .findOneByOrFail({ id: secondId, tenantId });
    expect(aborted.result).toBe('ABORTED');
    expect(await count(TestRunEntity)).toBe(3);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/test-runs/${secondId}:create-retest`)
      .set('Idempotency-Key', `cod-rt-${randomUUID()}`)
      .send({ reason: 'Chạy lại sau khi khắc phục' })
      .expect(404);
  });

  it('API-104: aggregates gate status and the blocking findings the caller may see', async () => {
    const empty = await api(managerToken)
      .get(`/v1/projects/${projectId}/cod-readiness`).expect(200);
    expect(empty.body.data.readiness).toMatchObject({
      blocked: false, readyToSign: true, categories: []
    });
    expect(empty.body.data.packages).toEqual([]);

    await defineGate(managerToken, { code: 'LEG-1', category: 'LEGAL' }).expect(200);
    await defineGate(managerToken, {
      code: 'SAF-1', category: 'SAFETY', mandatory: false
    }).expect(200);

    const punchId = await seedPunchItem({ code: 'PN-A1', category: 'A' });
    const ncrId = await seedNcr({ code: 'NCR-C1', severity: 'CRITICAL' });
    const stopWorkId = await seedStopWorkIssue();

    const blocked = await api(managerToken)
      .get(`/v1/projects/${projectId}/cod-readiness`).expect(200);
    expect(blocked.body.data.readiness).toMatchObject({
      blocked: true, readyToSign: false,
      gates: { total: 2, pending: 2, mandatoryTotal: 1, mandatoryOutstanding: 1 },
      blockingFindings: { punchItems: 1, criticalNcrs: 1, stopWorks: 1, failedTestRuns: 0, total: 3 }
    });
    const references = blocked.body.data.readiness.blockingFindings.items
      .map((item: { id: string }) => item.id);
    expect(references).toEqual(expect.arrayContaining([punchId, ncrId, stopWorkId]));
    expect(blocked.body.data.readiness.categories).toEqual([
      { category: 'LEGAL', total: 1, satisfied: 0, outstanding: 1 },
      { category: 'SAFETY', total: 1, satisfied: 0, outstanding: 1 }
    ]);
    // The projection carries ids and classification only — no punch description, no NCR narrative.
    for (const item of blocked.body.data.readiness.blockingFindings.items) {
      expect(Object.keys(item).sort()).toEqual(['detail', 'id', 'reference', 'type']);
      expect(JSON.stringify(item)).not.toContain('Mô tả nội bộ');
    }

    // A closed punch and a closed NCR stop blocking; the unlifted stop-work still does.
    await dataSource.query(
      `UPDATE punch_items SET status = 'WAIVED', waivable = true, waived_by = $2,
        waived_reason = 'Chấp nhận', category = 'B', cod_blocking = false WHERE id = $1`,
      [punchId, signerId]
    );
    await dataSource.query(`UPDATE ncrs SET severity = 'LOW' WHERE id = $1`, [ncrId]);
    const partly = await api(managerToken)
      .get(`/v1/projects/${projectId}/cod-readiness`).expect(200);
    expect(partly.body.data.readiness.blockingFindings).toMatchObject({
      punchItems: 0, criticalNcrs: 0, stopWorks: 1, total: 1
    });

    await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/cod-readiness`).expect(404);
    await api(bareToken).get(`/v1/projects/${projectId}/cod-readiness`).expect(403);
  });

  it('API-105: gate review, waiver limits, SoD on the signature and the handover receipt', async () => {
    // AC-058: a gate is defined once per (category, code).
    const gate = await defineGate(managerToken, { code: 'LEG-1', category: 'LEGAL' }).expect(200);
    expect(gate.body.data.gate).toMatchObject({
      category: 'LEGAL', code: 'LEG-1', status: 'PENDING', mandatory: true, waivable: false,
      versionNo: 1
    });
    const gateId = gate.body.data.gate.id as string;
    const duplicate = await defineGate(managerToken, { code: 'LEG-1', category: 'LEGAL' })
      .expect(409);
    expect(duplicate.body.code).toBe('COD_GATE_CONFLICT');
    expect(await count(CodGateEntity)).toBe(1);

    // AC-060: a gate defined as non-waivable can never be waived.
    const nonWaivable = await command(managerToken, {
      commandType: 'WAIVE_GATE', codGateId: gateId, expectedVersion: 1,
      reason: 'Muốn bỏ qua điều kiện pháp lý'
    }).expect(422);
    expect(nonWaivable.body.code).toBe('NON_WAIVABLE_GATE');
    expect((await dataSource.getRepository(CodGateEntity)
      .findOneByOrFail({ id: gateId, tenantId })).status).toBe('PENDING');

    // AC-059: the submitter of the evidence can never be the reviewer of that evidence.
    const submitted = await command(managerToken, {
      commandType: 'REVIEW_EVIDENCE', reviewAction: 'SUBMIT', codGateId: gateId,
      expectedVersion: 1, evidenceRefs: ['minio://evidence/legal-1'],
      reason: 'Nộp giấy phép vận hành'
    }).expect(200);
    expect(submitted.body.data.gate).toMatchObject({ status: 'UNDER_REVIEW', versionNo: 2 });
    expect(submitted.body.data.reviewCycle).toMatchObject({
      sequenceNo: 1, submittedBy: managerId, decision: null
    });

    const selfReview = await command(managerToken, {
      commandType: 'REVIEW_EVIDENCE', reviewAction: 'DECIDE', codGateId: gateId,
      expectedVersion: 2, decision: 'PASS', reason: 'Tự duyệt hồ sơ mình nộp'
    }).expect(422);
    expect(selfReview.body.code).toBe('SOD_CONFLICT');
    expect((await dataSource.getRepository(CodGateReviewCycleEntity)
      .findOneByOrFail({ codGateId: gateId, tenantId })).decision).toBeNull();

    const decided = await command(signerToken, {
      commandType: 'REVIEW_EVIDENCE', reviewAction: 'DECIDE', codGateId: gateId,
      expectedVersion: 2, decision: 'PASS', reason: 'Hồ sơ pháp lý đầy đủ'
    }).expect(200);
    expect(decided.body.data.gate).toMatchObject({
      status: 'ACCEPTED', acceptedBy: signerId, versionNo: 3
    });
    expect(decided.body.data.reviewCycle).toMatchObject({
      decision: 'PASS', decidedBy: signerId
    });

    // A decided gate is frozen: nothing else may touch it.
    const frozen = await command(signerToken, {
      commandType: 'REVIEW_EVIDENCE', reviewAction: 'SUBMIT', codGateId: gateId,
      expectedVersion: 3, evidenceRefs: ['minio://evidence/legal-2'], reason: 'Nộp bổ sung'
    }).expect(422);
    expect(frozen.body.code).toBe('INVALID_STATE_TRANSITION');

    // A waivable gate takes the waiver path.
    const waivable = await defineGate(managerToken, {
      code: 'DOC-1', category: 'DOCUMENTATION', waivable: true
    }).expect(200);
    const waived = await command(signerToken, {
      commandType: 'WAIVE_GATE', codGateId: waivable.body.data.gate.id, expectedVersion: 1,
      reason: 'Hồ sơ as-built sẽ nộp sau COD theo thoả thuận'
    }).expect(200);
    expect(waived.body.data.gate).toMatchObject({ status: 'WAIVED', waivedBy: signerId });

    // FR-113: submit, then the blocking-finding refusal, then the SoD refusal, then the signature.
    const submittedPackage = await command(managerToken, { commandType: 'SUBMIT_COD' })
      .expect(200);
    expect(submittedPackage.body.data.package).toMatchObject({
      version: 1, status: 'SUBMITTED', submittedBy: managerId, signedBy: null, versionNo: 1
    });
    expect(submittedPackage.body.data.package.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    const packageId = submittedPackage.body.data.package.id as string;

    const inFlight = await command(managerToken, { commandType: 'SUBMIT_COD' }).expect(409);
    expect(inFlight.body.code).toBe('COD_PACKAGE_IN_FLIGHT');
    expect(await count(CodPackageEntity)).toBe(1);

    const punchId = await seedPunchItem({ code: 'PN-A1', category: 'A' });
    const blocked = await command(signerToken, {
      commandType: 'SIGN_COD', codPackageId: packageId, expectedVersion: 1
    }).expect(422);
    expect(blocked.body.code).toBe('GATE_BLOCKED');
    expect((await dataSource.getRepository(CodPackageEntity)
      .findOneByOrFail({ id: packageId, tenantId })).status).toBe('SUBMITTED');

    await dataSource.query(
      `UPDATE punch_items SET status = 'CLOSED', verified_by = $2, verified_at = now(),
        closure_evidence_refs = '["minio://evidence/punch"]'::jsonb WHERE id = $1`,
      [punchId, signerId]
    );

    const selfSigned = await command(managerToken, {
      commandType: 'SIGN_COD', codPackageId: packageId, expectedVersion: 1
    }).expect(422);
    expect(selfSigned.body.code).toBe('SOD_CONFLICT');
    expect((await dataSource.getRepository(CodPackageEntity)
      .findOneByOrFail({ id: packageId, tenantId })).signedBy).toBeNull();

    const signed = await command(signerToken, {
      commandType: 'SIGN_COD', codPackageId: packageId, expectedVersion: 1,
      signedArtifactRef: 'minio://cod/v1.pdf'
    }).expect(200);
    expect(signed.body.data.package).toMatchObject({
      status: 'SIGNED', signedBy: signerId, submittedBy: managerId, versionNo: 2
    });
    // The signer snapshot is a stable id plus the hash of exactly what was signed (AGENTS.md §9).
    expect(signed.body.data.package.signerSnapshot).toMatchObject({
      userId: signerId, email: 'cod-signer@example.test'
    });
    const stored = await dataSource.getRepository(CodPackageEntity)
      .findOneByOrFail({ id: packageId, tenantId });
    expect(stored.snapshotHash).toBe(canonicalHash(stored.readinessSnapshot));
    expect(stored.signerSnapshot).toMatchObject({ snapshotHash: stored.snapshotHash });

    // FR-114: the recipient's receipt hands the package over exactly once per recipient.
    const handed = await command(signerToken, {
      commandType: 'ACCEPT_HANDOVER', codPackageId: packageId, expectedVersion: 2,
      fromPartyId: epcPartyId, recipientPartyId: ownerPartyId,
      itemManifest: [{ ref: 'SYS-A' }], openItems: [{ ref: 'PN-B1' }]
    }).expect(200);
    expect(handed.body.data.handover).toMatchObject({
      recipientPartyId: ownerPartyId, fromPartyId: epcPartyId, acceptedBy: signerId
    });
    expect(handed.body.data.package.status).toBe('HANDED_OVER');

    const twice = await command(signerToken, {
      commandType: 'ACCEPT_HANDOVER', codPackageId: packageId, expectedVersion: 3,
      fromPartyId: epcPartyId, recipientPartyId: ownerPartyId
    }).expect(422);
    expect(twice.body.code).toBe('INVALID_STATE_TRANSITION');
    expect(await count(HandoverEntity)).toBe(1);

    const readiness = await api(managerToken)
      .get(`/v1/projects/${projectId}/cod-readiness`).expect(200);
    expect(readiness.body.data.packages).toHaveLength(1);
    expect(readiness.body.data.packages[0].status).toBe('HANDED_OVER');
  });

  it('API-105: refuses the command family to a caller without cod.manage and across tenants', async () => {
    await api(qaqcToken).post(`/v1/projects/${projectId}/cod-transition-commands`)
      .set('Idempotency-Key', `cod-cmd-${randomUUID()}`)
      .send({ commandType: 'SUBMIT_COD' })
      .expect(403);
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/projects/${projectId}/cod-transition-commands`)
      .set('Idempotency-Key', `cod-cmd-${randomUUID()}`)
      .send({ commandType: 'SUBMIT_COD' })
      .expect(404);
    // The union is closed: an unlisted commandType never reaches the service.
    await api(managerToken).post(`/v1/projects/${projectId}/cod-transition-commands`)
      .set('Idempotency-Key', `cod-cmd-${randomUUID()}`)
      .send({ commandType: 'CANCEL_COD' })
      .expect(400);
    expect(await count(CodPackageEntity)).toBe(0);
  });

  it('replays an idempotent command and refuses a reused key with a different body', async () => {
    const key = `cod-idem-${randomUUID()}`;
    const first = await api(managerToken).post(`/v1/projects/${projectId}/commissioning-systems`)
      .set('Idempotency-Key', key)
      .send({ code: 'SYS-IDEM', name: 'Hệ thống idempotent', systemType: 'MV_SWITCHGEAR' })
      .expect(201);
    const replay = await api(managerToken).post(`/v1/projects/${projectId}/commissioning-systems`)
      .set('Idempotency-Key', key)
      .send({ code: 'SYS-IDEM', name: 'Hệ thống idempotent', systemType: 'MV_SWITCHGEAR' })
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await count(CommissioningSystemEntity)).toBe(1);

    const conflict = await api(managerToken)
      .post(`/v1/projects/${projectId}/commissioning-systems`)
      .set('Idempotency-Key', key)
      .send({ code: 'SYS-OTHER', name: 'Nội dung khác', systemType: 'MV_SWITCHGEAR' })
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await count(CommissioningSystemEntity)).toBe(1);

    const short = await api(managerToken).post(`/v1/projects/${projectId}/commissioning-systems`)
      .set('Idempotency-Key', 'short')
      .send({ code: 'SYS-SHORT', name: 'Khoá quá ngắn', systemType: 'MV_SWITCHGEAR' })
      .expect(400);
    expect(short.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await count(CommissioningSystemEntity)).toBe(1);
  });

  function api(token: string, headerTenantId = tenantId) {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', headerTenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path))
    };
  }

  function createSystem(token: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/projects/${projectId}/commissioning-systems`)
      .set('Idempotency-Key', `cod-sys-${randomUUID()}`)
      .send({ systemType: 'MV_SWITCHGEAR', ...body });
  }

  async function createSystemId(): Promise<string> {
    const response = await createSystem(managerToken, { code: 'SYS-A', name: 'Trạm 110kV' })
      .expect(201);
    return response.body.data.id as string;
  }

  function createTestPack(token: string, systemId: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/commissioning-systems/${systemId}/test-packs`)
      .set('Idempotency-Key', `cod-tp-${randomUUID()}`)
      .send({
        code: 'TP-01', title: 'Thử nghiệm cách điện',
        procedureRevisionId: issuedRevisionId,
        prerequisitesSnapshot: { required: ['LOTO'] },
        ...body
      });
  }

  async function createPackId(): Promise<string> {
    const systemId = await createSystemId();
    const pack = await createTestPack(managerToken, systemId, {}).expect(201);
    return pack.body.data.id as string;
  }

  function startRun(token: string, packId: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/test-packs/${packId}/test-runs`)
      .set('Idempotency-Key', `cod-run-${randomUUID()}`)
      .send({ satisfiedPrerequisites: ['LOTO'], ...body });
  }

  function completeRun(token: string, runId: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/test-runs/${runId}:complete`)
      .set('Idempotency-Key', `cod-done-${randomUUID()}`)
      .send({
        expectedVersion: 1, result: 'PASSED', evidenceRefs: ['minio://evidence/run'], ...body
      });
  }

  function createRetest(token: string, runId: string) {
    return api(token).post(`/v1/test-runs/${runId}:create-retest`)
      .set('Idempotency-Key', `cod-rt-${randomUUID()}`)
      .send({ satisfiedPrerequisites: ['LOTO'], reason: 'Chạy lại sau khi khắc phục' });
  }

  function command(token: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/projects/${projectId}/cod-transition-commands`)
      .set('Idempotency-Key', `cod-cmd-${randomUUID()}`)
      .send(body);
  }

  function defineGate(token: string, body: Record<string, unknown>) {
    return command(token, {
      commandType: 'DEFINE_GATE', title: 'Điều kiện COD', mandatory: true, waivable: false,
      ...body
    });
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedPunchItem(overrides: { code: string; category: string }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO punch_items (
        id, tenant_id, project_id, code, title, description, category, cod_blocking, waivable,
        status, raised_by, owner_id, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Tồn đọng chặn COD','Mô tả nội bộ',$5,true,false,'OPEN',$6,$6,$6,$6)`,
      [id, tenantId, projectId, overrides.code, overrides.category, managerId]
    );
    return id;
  }

  async function seedNcr(overrides: { code: string; severity: string }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO ncrs (
        id, tenant_id, project_id, code, title, description, severity, status,
        raised_by, owner_id, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Không phù hợp nghiêm trọng','Mô tả nội bộ',$5,'OPEN',$6,$6,$6,$6)`,
      [id, tenantId, projectId, overrides.code, overrides.severity, managerId]
    );
    return id;
  }

  async function seedStopWorkIssue(): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO stop_work_actions (
        id, tenant_id, project_id, action, target_type, reason, actor_id
      ) VALUES ($1,$2,$3,'ISSUE','PROJECT','Điều kiện mất an toàn',$4)`,
      [id, tenantId, projectId, managerId]
    );
    return id;
  }

  async function seedProcedureRevisions(): Promise<{
    issuedRevisionId: string; draftRevisionId: string;
  }> {
    const documentId = randomUUID();
    const issued = randomUUID();
    const draft = randomUUID();
    await dataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, package_id, document_code, title, discipline, type,
        classification, owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'PROC-DOC-001','Quy trình thử nghiệm','ELE','PROCEDURE','INTERNAL',
        $5,'ACTIVE',$5,$5)`,
      [documentId, tenantId, projectId, packageAId, managerId]
    );
    await dataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, released_object_key, content_hash, scan_status, lock_state,
        approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'ISSUED','FOR_CONSTRUCTION','proc.pdf','application/pdf',
        'released/proc.pdf',$5,'CLEAN','LOCKED',$6,now(),$6,now(),$6)`,
      [issued, tenantId, documentId, projectId, 'a'.repeat(64), managerId]
    );
    await dataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, scan_status, lock_state, uploaded_by
      ) VALUES ($1,$2,$3,$4,'B',1,'DRAFT','FOR_REVIEW','proc-draft.pdf','application/pdf',
        'SCANNING','UNLOCKED',$5)`,
      [draft, tenantId, documentId, projectId, managerId]
    );
    return { issuedRevisionId: issued, draftRevisionId: draft };
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'cod-test', name: 'COD Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'cod-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'cod-manager@example.test', 'COD Manager'),
      user(signerId, tenantId, 'cod-signer@example.test', 'COD Signer'),
      user(qaqcUserId, tenantId, 'cod-qaqc@example.test', 'QAQC Manager'),
      user(packageUserId, tenantId, 'cod-package@example.test', 'Package Contractor'),
      user(bareUserId, tenantId, 'cod-bare@example.test', 'No COD Access'),
      user(otherTenantUserId, otherTenantId, 'cod-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(signerId, tenantId),
      credential(qaqcUserId, tenantId), credential(packageUserId, tenantId),
      credential(bareUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const managerRole = await role(tenantId, 'COD_MANAGER', [
      'commissioning.read', 'commissioningSystem.create', 'testPack.create', 'testRun.start',
      'testRun.complete', 'testRun.retest', 'cod.read', 'cod.manage'
    ]);
    // A second cod.manage holder: SIGN_COD refuses the submitter, so the rule needs two.
    const signerRole = await role(tenantId, 'COD_SIGNER', [
      'commissioning.read', 'cod.read', 'cod.manage'
    ]);
    const qaqcRole = await role(tenantId, 'QAQC_MANAGER', [
      'commissioning.read', 'testPack.create', 'testRun.start', 'testRun.complete',
      'testRun.retest', 'cod.read'
    ]);
    const packageRole = await role(tenantId, 'COD_CONTRACTOR', ['commissioning.read']);
    const bareRole = await role(tenantId, 'COD_NONE', ['notification.read']);
    const otherRole = await role(otherTenantId, 'COD_OTHER', [
      'commissioning.read', 'commissioningSystem.create', 'testPack.create', 'testRun.start',
      'testRun.complete', 'testRun.retest', 'cod.read', 'cod.manage'
    ]);

    await seedProject(tenantId, projectId, siteId, 'COD-PRJ', managerId, companyId);
    await seedProject(
      otherTenantId, otherProjectId, otherSiteId, 'COD-OTH', otherTenantUserId, randomUUID()
    );
    await dataSource.getRepository(PackageEntity).save([
      packageRow(packageAId, 'COD-PKG-A'), packageRow(packageBId, 'COD-PKG-B')
    ]);
    for (const [id, roleCode] of [[epcPartyId, 'EPC'], [ownerPartyId, 'OWNER']] as const) {
      await dataSource.query(
        `INSERT INTO project_parties (
          id, tenant_id, project_id, company_id, role_code, raci, effective_from
        ) VALUES ($1,$2,$3,$4,$5,'ACCOUNTABLE','2026-01-01')`,
        [id, tenantId, projectId, companyId, roleCode]
      );
    }

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, signerId, signerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, qaqcUserId, qaqcRole.id, AssignmentScopeType.TENANT, null),
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
      permissions, policyVersion: 13, status: MasterRecordStatus.ACTIVE
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
});
