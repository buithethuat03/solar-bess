import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AlarmCaseEntity, AssignmentScopeType, CompanyEntity, LegalEntityEntity, LocalCredentialEntity,
  MasterRecordStatus, OrganizationType, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectType, RoleAssignmentEntity, RoleEntity, ServiceIncidentEntity,
  SiteEntity, TenantEntity, UserAccountEntity, WarrantyClaimEntity, WorkOrderClosureCycleEntity,
  WorkOrderEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const verifierId = randomUUID();
const scopedId = randomUUID();
const bareId = randomUUID();
const otherTenantUserId = randomUUID();
const projectAId = randomUUID();
const projectBId = randomUUID();
const otherProjectId = randomUUID();
const siteAId = randomUUID();
const siteBId = randomUUID();
const otherSiteId = randomUUID();
const password = 'OpsMaint!Integration2026';

jest.setTimeout(240_000);

describe('O&M HTTP integration — API-114…API-121', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let managerToken: string;
  let verifierToken: string;
  let scopedToken: string;
  let bareToken: string;
  let otherTenantToken: string;
  let assetAId: string;
  let assetBId: string;
  let otherAssetId: string;

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
    managerToken = await login('om-manager@example.test', 'om-test');
    verifierToken = await login('om-verifier@example.test', 'om-test');
    scopedToken = await login('om-scoped@example.test', 'om-test');
    bareToken = await login('om-bare@example.test', 'om-test');
    otherTenantToken = await login('om-other@example.test', 'om-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-114: lists local alarm cases with filters, keyset paging and 404 outside reach', async () => {
    await seedAlarmCase({ severity: 'HIGH' });
    await seedAlarmCase({ severity: 'LOW' });
    await seedAlarmCase({ severity: 'CRITICAL' });
    await seedAlarmCase({ siteId: siteBId, projectId: projectBId, severity: 'HIGH' });

    const all = await api(managerToken).get(`/v1/sites/${siteAId}/alarm-cases`).expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta).toMatchObject({ limit: 50, siteId: siteAId, nextCursor: null });
    // The projection carries logical source ids only — never a payload, tag or endpoint.
    expect(all.body.data[0].sourceEventRefs).toEqual(['ot-event-1']);
    expect(Object.keys(all.body.data[0])).not.toContain('sourcePayload');

    const filtered = await api(managerToken)
      .get(`/v1/sites/${siteAId}/alarm-cases?severity=CRITICAL`).expect(200);
    expect(filtered.body.data).toHaveLength(1);

    const paged = await api(managerToken)
      .get(`/v1/sites/${siteAId}/alarm-cases?limit=2`).expect(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(managerToken)
      .get(`/v1/sites/${siteAId}/alarm-cases?limit=2&cursor=${paged.body.meta.nextCursor}`)
      .expect(200);
    expect(next.body.data).toHaveLength(1);
    expect(next.body.meta.nextCursor).toBeNull();

    // Project-scoped principal: site B belongs to a project it cannot reach — 404, not 403.
    await api(scopedToken).get(`/v1/sites/${siteBId}/alarm-cases`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/sites/${siteAId}/alarm-cases`).expect(404);
    const denied = await api(bareToken).get(`/v1/sites/${siteAId}/alarm-cases`).expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');

    const badCursor = await api(managerToken)
      .get(`/v1/sites/${siteAId}/alarm-cases?cursor=not-a-cursor`).expect(400);
    expect(badCursor.body.code).toBe('INVALID_CURSOR');
  });

  it('API-115: acknowledges the LOCAL case only, and a replay writes nothing twice', async () => {
    const caseId = await seedAlarmCase({ severity: 'HIGH' });
    const key = `om-ack-${randomUUID()}`;

    const acknowledged = await acknowledge(managerToken, caseId, key, { expectedVersion: 1 })
      .expect(200);
    expect(acknowledged.body.data).toMatchObject({
      state: 'ACKNOWLEDGED', acknowledgedBy: managerId, versionNo: 2,
      acknowledgementApplied: true
    });

    // SEC-127/SEC-128: the ingestion-owned projection is byte-for-byte what it was. Acknowledging
    // says something about the operator, never about the plant.
    const stored = await dataSource.getRepository(AlarmCaseEntity)
      .findOneByOrFail({ id: caseId, tenantId });
    expect(stored.sourceEventRefs).toEqual(['ot-event-1']);
    expect(stored.sourceQuality).toBe('GOOD');
    expect(stored.firstSeenAt.toISOString()).toBe('2026-07-26T08:00:00.000Z');
    expect(stored.lastSeenAt.toISOString()).toBe('2026-07-26T09:00:00.000Z');

    // Replaying the same Idempotency-Key returns the stored receipt and writes no second fact.
    const replay = await acknowledge(managerToken, caseId, key, { expectedVersion: 1 })
      .expect(200);
    expect(replay.body.data).toMatchObject({ versionNo: 2, acknowledgementApplied: true });
    expect(await acknowledgementAuditCount(caseId)).toBe(1);

    // A fresh key on an already-acknowledged case is a no-op: no version bump, no second audit row.
    const again = await acknowledge(managerToken, caseId, `om-ack-${randomUUID()}`, {
      expectedVersion: 2
    }).expect(200);
    expect(again.body.data).toMatchObject({
      versionNo: 2, acknowledgedBy: managerId, acknowledgementApplied: false
    });
    expect(await acknowledgementAuditCount(caseId)).toBe(1);

    // A different body under the same key is a conflict, not a silent overwrite.
    const conflict = await acknowledge(managerToken, caseId, key, {
      expectedVersion: 2, note: 'khác'
    }).expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');

    const stale = await acknowledge(managerToken, caseId, `om-ack-${randomUUID()}`, {
      expectedVersion: 99
    }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    await acknowledge(otherTenantToken, caseId, `om-ack-${randomUUID()}`, {
      expectedVersion: 2
    }, otherTenantId).expect(404);
    await acknowledge(bareToken, caseId, `om-ack-${randomUUID()}`, { expectedVersion: 2 })
      .expect(403);
  });

  it('API-116/117: opens and lists service incidents, refusing an impossible downtime window', async () => {
    const created = await createIncident(managerToken, {}).expect(201);
    expect(created.body.data).toMatchObject({
      status: 'OPEN', severity: 'HIGH', siteId: siteAId, reportedBy: managerId, versionNo: 1
    });

    const linkedCase = await seedAlarmCase({ severity: 'HIGH' });
    const linked = await createIncident(managerToken, { alarmCaseId: linkedCase }).expect(201);
    expect(linked.body.data.alarmCaseId).toBe(linkedCase);

    const before = await count(ServiceIncidentEntity);
    const badWindow = await createIncident(managerToken, {
      downtimeStart: '2026-07-26T10:00:00.000Z', downtimeEnd: '2026-07-26T09:00:00.000Z'
    }).expect(422);
    expect(badWindow.body.code).toBe('DOWNTIME_WINDOW_INVALID');
    const foreignCase = await seedAlarmCase({ siteId: siteBId, projectId: projectBId });
    const wrongSite = await createIncident(managerToken, { alarmCaseId: foreignCase }).expect(422);
    expect(wrongSite.body.code).toBe('ALARM_CASE_NOT_FOUND');
    const wrongAsset = await createIncident(managerToken, { assetId: assetBId }).expect(422);
    expect(wrongAsset.body.code).toBe('ASSET_NOT_FOUND');
    // Every 4xx above rolled its transaction back.
    expect(await count(ServiceIncidentEntity)).toBe(before);

    const listed = await api(managerToken)
      .get(`/v1/sites/${siteAId}/service-incidents?status=OPEN`).expect(200);
    expect(listed.body.data).toHaveLength(2);
    expect(listed.body.meta).toMatchObject({ limit: 50, siteId: siteAId });

    await api(scopedToken).get(`/v1/sites/${siteBId}/service-incidents`).expect(404);
    await createIncident(otherTenantToken, {}, otherTenantId).expect(404);
    await api(bareToken).get(`/v1/sites/${siteAId}/service-incidents`).expect(403);
  });

  it('API-118/119: creates work orders and refuses permitted work without a valid permit', async () => {
    const created = await createWorkOrder(managerToken, { code: 'WO-001' }).expect(201);
    expect(created.body.data).toMatchObject({
      code: 'WO-001', status: 'DRAFT', assetId: assetAId, siteId: siteAId,
      requiresPermit: false, versionNo: 1
    });

    const scheduled = await createWorkOrder(managerToken, {
      code: 'WO-002', scheduledAt: '2026-08-01T02:00:00.000Z'
    }).expect(201);
    expect(scheduled.body.data.status).toBe('SCHEDULED');

    const before = await count(WorkOrderEntity);
    const noPermit = await createWorkOrder(managerToken, {
      code: 'WO-003', requiresPermit: true
    }).expect(422);
    expect(noPermit.body.code).toBe('PTW_REQUIRED');

    // A permit issued for another site never authorizes work here.
    const foreignPermit = await seedPermit({ siteId: siteBId, projectId: projectBId });
    const wrongSitePermit = await createWorkOrder(managerToken, {
      code: 'WO-004', requiresPermit: true, permitToWorkId: foreignPermit
    }).expect(422);
    expect(wrongSitePermit.body.code).toBe('PTW_REQUIRED');
    expect(await count(WorkOrderEntity)).toBe(before);

    const permitId = await seedPermit({});
    const permitted = await createWorkOrder(managerToken, {
      code: 'WO-005', requiresPermit: true, permitToWorkId: permitId
    }).expect(201);
    expect(permitted.body.data.permitToWorkId).toBe(permitId);

    const duplicate = await createWorkOrder(managerToken, { code: 'WO-001' }).expect(409);
    expect(duplicate.body.code).toBe('WORK_ORDER_CODE_CONFLICT');

    const listed = await api(managerToken)
      .get(`/v1/assets/${assetAId}/work-orders?status=DRAFT`).expect(200);
    expect(listed.body.data.map((row: { code: string }) => row.code).sort())
      .toEqual(['WO-001', 'WO-005']);
    expect(listed.body.data[0]).toMatchObject({ maintenancePlan: null, warrantyClaimCount: 0 });

    await api(scopedToken).get(`/v1/assets/${assetBId}/work-orders`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/assets/${assetAId}/work-orders`).expect(404);
    // A tenant-wide principal still cannot see another tenant's asset: it simply does not exist.
    await api(managerToken).get(`/v1/assets/${otherAssetId}/work-orders`).expect(404);
    await api(bareToken).get(`/v1/assets/${assetAId}/work-orders`).expect(403);
  });

  it('API-120: runs the WF-024 lifecycle and refuses self-verification and closure gaps', async () => {
    const workOrderId = await createdWorkOrderId(managerToken, { code: 'WO-LIFE' });

    const dispatched = await command(managerToken, workOrderId, {
      commandType: 'DISPATCH', expectedVersion: 1, assigneeUserId: managerId
    }).expect(200);
    expect(dispatched.body.data).toMatchObject({
      status: 'DISPATCHED', assigneeId: managerId, dispatchedBy: managerId, versionNo: 2
    });

    const started = await command(managerToken, workOrderId, {
      commandType: 'START', expectedVersion: 2
    }).expect(200);
    expect(started.body.data.status).toBe('IN_PROGRESS');

    const held = await command(managerToken, workOrderId, {
      commandType: 'HOLD', expectedVersion: 3, reason: 'Chờ vật tư thay thế'
    }).expect(200);
    expect(held.body.data).toMatchObject({ status: 'ON_HOLD', holdReason: 'Chờ vật tư thay thế' });
    await command(managerToken, workOrderId, {
      commandType: 'RESUME', expectedVersion: 4
    }).expect(200);

    const completed = await command(managerToken, workOrderId, {
      commandType: 'COMPLETE', expectedVersion: 5, workSummary: 'Đã thay quạt làm mát',
      evidenceRefs: ['minio://evidence/wo-life-1']
    }).expect(200);
    expect(completed.body.data).toMatchObject({ status: 'COMPLETE', completedBy: managerId });
    expect(completed.body.data.closureCycle).toMatchObject({
      sequenceNo: 1, requestedBy: managerId, decision: null
    });

    // The person who completed the work can never verify it — 422, and nothing changes.
    const selfVerify = await command(managerToken, workOrderId, {
      commandType: 'VERIFY', expectedVersion: 6, reason: 'tự nghiệm thu'
    }).expect(422);
    expect(selfVerify.body.code).toBe('SOD_CONFLICT');
    expect(await workOrderStatus(workOrderId)).toBe('COMPLETE');
    expect(await cycleCount(workOrderId)).toBe(1);

    const verified = await command(verifierToken, workOrderId, {
      commandType: 'VERIFY', expectedVersion: 6, reason: 'Kiểm tra đạt yêu cầu'
    }).expect(200);
    expect(verified.body.data).toMatchObject({ status: 'VERIFIED', verifiedBy: verifierId });
    expect(verified.body.data.closureCycle).toMatchObject({
      sequenceNo: 1, decision: 'APPROVE', decidedBy: verifierId
    });

    // Closing without the return-to-service evidence is refused and writes nothing.
    const noReturn = await command(verifierToken, workOrderId, {
      commandType: 'CLOSE', expectedVersion: 7
    }).expect(422);
    expect(noReturn.body.code).toBe('RETURN_TO_SERVICE_REQUIRED');
    expect(await workOrderStatus(workOrderId)).toBe('VERIFIED');

    const closed = await command(verifierToken, workOrderId, {
      commandType: 'CLOSE', expectedVersion: 7, returnToServiceRef: 'RTS-2026-0007'
    }).expect(200);
    expect(closed.body.data).toMatchObject({
      status: 'CLOSED', closedBy: verifierId, returnToServiceRef: 'RTS-2026-0007'
    });

    // REOPEN appends the NEXT cycle; the previous verification decision stays frozen.
    const reopened = await command(verifierToken, workOrderId, {
      commandType: 'REOPEN', expectedVersion: 8, reason: 'Sự cố tái diễn sau 2 ngày'
    }).expect(200);
    expect(reopened.body.data).toMatchObject({
      status: 'REOPENED', verifiedBy: null, closedBy: null, returnToServiceRef: null
    });
    expect(reopened.body.data.closureCycle).toMatchObject({ sequenceNo: 2, decision: null });
    expect(await cycleCount(workOrderId)).toBe(2);
    const cycles = await dataSource.getRepository(WorkOrderClosureCycleEntity)
      .find({ where: { tenantId, workOrderId }, order: { sequenceNo: 'ASC' } });
    expect(cycles[0]).toMatchObject({ decision: 'APPROVE', decidedBy: verifierId });
    expect(cycles[1]).toMatchObject({ decision: null, requestedBy: verifierId });

    // A reopened work order re-enters execution instead of dying in a terminal state.
    await command(managerToken, workOrderId, {
      commandType: 'START', expectedVersion: 9
    }).expect(200);

    const illegal = await command(managerToken, workOrderId, {
      commandType: 'CLOSE', expectedVersion: 10, returnToServiceRef: 'RTS-X'
    }).expect(422);
    expect(illegal.body.code).toBe('INVALID_STATE_TRANSITION');

    await command(otherTenantToken, workOrderId, {
      commandType: 'DISPATCH', expectedVersion: 10
    }, otherTenantId).expect(404);
    await command(bareToken, workOrderId, {
      commandType: 'DISPATCH', expectedVersion: 10
    }).expect(403);
  });

  it('API-120: refuses START when the permit is no longer valid, and raises warranty claims', async () => {
    const permitId = await seedPermit({});
    const workOrderId = await createdWorkOrderId(managerToken, {
      code: 'WO-PTW', requiresPermit: true, permitToWorkId: permitId
    });
    await command(managerToken, workOrderId, {
      commandType: 'DISPATCH', expectedVersion: 1, assigneeUserId: managerId
    }).expect(200);

    // The permit expires between dispatch and start — exactly the window the gate exists for.
    await dataSource.query(
      `UPDATE permits_to_work SET status = 'EXPIRED' WHERE id = $1 AND tenant_id = $2`,
      [permitId, tenantId]
    );
    const refused = await command(managerToken, workOrderId, {
      commandType: 'START', expectedVersion: 2
    }).expect(422);
    expect(refused.body.code).toBe('PTW_NOT_VALID');
    expect(await workOrderStatus(workOrderId)).toBe('DISPATCHED');

    await dataSource.query(
      `UPDATE permits_to_work SET status = 'ACTIVE' WHERE id = $1 AND tenant_id = $2`,
      [permitId, tenantId]
    );
    await command(managerToken, workOrderId, {
      commandType: 'START', expectedVersion: 2
    }).expect(200);

    const claim = await command(managerToken, workOrderId, {
      commandType: 'RAISE_WARRANTY_CLAIM', expectedVersion: 3, claimCode: 'WC-001',
      failureDescription: 'Quạt làm mát hỏng trong thời hạn bảo hành',
      evidenceRefs: ['minio://evidence/claim-1']
    }).expect(200);
    expect(claim.body.data.warrantyClaim).toMatchObject({
      claimCode: 'WC-001', status: 'SUBMITTED', workOrderId, assetId: assetAId
    });
    // DB-083 is not part of the schema, so a claim never carries a warranty reference.
    expect(Object.keys(claim.body.data.warrantyClaim)).not.toContain('warrantyId');
    expect(await count(WarrantyClaimEntity)).toBe(1);

    const listed = await api(managerToken).get(`/v1/assets/${assetAId}/work-orders`).expect(200);
    expect(listed.body.data[0].warrantyClaimCount).toBe(1);
  });

  it('API-121: reports countable facts and explicitly unknown KPI/telemetry', async () => {
    await createWorkOrder(managerToken, { code: 'WO-PERF-1' }).expect(201);
    await createWorkOrder(managerToken, { code: 'WO-PERF-2' }).expect(201);
    await createIncident(managerToken, { assetId: assetAId }).expect(201);
    await seedAlarmCase({ severity: 'HIGH', assetId: assetAId });

    const response = await api(managerToken)
      .get(`/v1/assets/${assetAId}/performance`).expect(200);
    expect(response.body.data.asset).toMatchObject({
      id: assetAId, siteId: siteAId, projectId: projectAId, assetCode: 'OM-ASSET-A'
    });
    expect(response.body.data.workOrderCountsByStatus).toEqual({ DRAFT: 2 });
    expect(response.body.data.serviceIncidentCountsByStatus).toEqual({ OPEN: 1 });
    expect(response.body.data.alarmCaseCountsByState).toEqual({ OPEN: 1 });

    // The honest answer for something PM Web cannot measure is null — never 0, never {}.
    expect(response.body.data.kpi).toBeNull();
    expect(response.body.data.telemetry).toBeNull();
    expect(response.body.data).not.toHaveProperty('availability');
    expect(response.body.data).not.toHaveProperty('performanceRatio');

    // An asset with nothing recorded reports empty maps, and STILL reports unknown KPIs as null.
    const empty = await api(managerToken).get(`/v1/assets/${assetBId}/performance`).expect(200);
    expect(empty.body.data.workOrderCountsByStatus).toEqual({});
    expect(empty.body.data.kpi).toBeNull();
    expect(empty.body.data.telemetry).toBeNull();

    await api(scopedToken).get(`/v1/assets/${assetBId}/performance`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/assets/${assetAId}/performance`).expect(404);
    await api(bareToken).get(`/v1/assets/${assetAId}/performance`).expect(403);
  });

  it('rejects every command without a usable Idempotency-Key', async () => {
    const caseId = await seedAlarmCase({});
    const missing = await api(managerToken)
      .post(`/v1/alarm-cases/${caseId}:acknowledge`)
      .send({ expectedVersion: 1 })
      .expect(400);
    expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const tooShort = await api(managerToken)
      .post(`/v1/alarm-cases/${caseId}:acknowledge`)
      .set('Idempotency-Key', 'short')
      .send({ expectedVersion: 1 })
      .expect(400);
    expect(tooShort.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const tooLong = await api(managerToken)
      .post(`/v1/alarm-cases/${caseId}:acknowledge`)
      .set('Idempotency-Key', 'k'.repeat(201))
      .send({ expectedVersion: 1 })
      .expect(400);
    expect(tooLong.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await acknowledgementAuditCount(caseId)).toBe(0);
  });

  function acknowledge(
    token: string, alarmCaseId: string, key: string, body: Record<string, unknown>,
    headerTenantId = tenantId
  ) {
    return api(token, headerTenantId).post(`/v1/alarm-cases/${alarmCaseId}:acknowledge`)
      .set('Idempotency-Key', key).send(body);
  }

  function createIncident(
    token: string, overrides: Record<string, unknown>, headerTenantId = tenantId
  ) {
    return api(token, headerTenantId).post(`/v1/sites/${siteAId}/service-incidents`)
      .set('Idempotency-Key', `om-inc-${randomUUID()}`)
      .send({
        severity: 'HIGH', title: 'Mất sản lượng cụm inverter 3',
        description: 'Cụm inverter 3 ngừng phát từ 08:00',
        detectedAt: '2026-07-26T08:00:00.000Z', ...overrides
      });
  }

  function createWorkOrder(
    token: string, overrides: Record<string, unknown>, headerTenantId = tenantId
  ) {
    return api(token, headerTenantId).post(`/v1/assets/${assetAId}/work-orders`)
      .set('Idempotency-Key', `om-wo-${randomUUID()}`)
      .send({
        workType: 'CORRECTIVE', title: 'Sửa chữa cụm inverter', priority: 'HIGH', ...overrides
      });
  }

  async function createdWorkOrderId(
    token: string, overrides: Record<string, unknown>
  ): Promise<string> {
    const response = await createWorkOrder(token, overrides).expect(201);
    return response.body.data.id as string;
  }

  function command(
    token: string, workOrderId: string, body: Record<string, unknown>,
    headerTenantId = tenantId
  ) {
    return api(token, headerTenantId).post(`/v1/work-orders/${workOrderId}/actions`)
      .set('Idempotency-Key', `om-cmd-${randomUUID()}`).send(body);
  }

  async function workOrderStatus(workOrderId: string): Promise<string> {
    const row = await dataSource.getRepository(WorkOrderEntity)
      .findOneByOrFail({ id: workOrderId, tenantId });
    return row.status;
  }

  function cycleCount(workOrderId: string): Promise<number> {
    return dataSource.getRepository(WorkOrderClosureCycleEntity)
      .countBy({ tenantId, workOrderId });
  }

  async function acknowledgementAuditCount(alarmCaseId: string): Promise<number> {
    const [row] = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE tenant_id = $1 AND action = 'AlarmCase.Acknowledged' AND object_id = $2`,
      [tenantId, alarmCaseId]
    );
    return Number(row.count);
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedAlarmCase(overrides: {
    severity?: string; siteId?: string; projectId?: string; assetId?: string;
  }): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO alarm_cases (
        id, tenant_id, project_id, site_id, asset_id, severity, state, first_seen_at,
        last_seen_at, source_event_refs, source_quality, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'OPEN','2026-07-26T08:00:00Z','2026-07-26T09:00:00Z',
        '["ot-event-1"]'::jsonb,'GOOD',$7,$7)`,
      [
        id, tenantId, overrides.projectId ?? projectAId, overrides.siteId ?? siteAId,
        overrides.assetId ?? null, overrides.severity ?? 'MEDIUM', managerId
      ]
    );
    return id;
  }

  async function seedPermit(overrides: { siteId?: string; projectId?: string }): Promise<string> {
    const workfrontId = randomUUID();
    const permitId = randomUUID();
    const fixtureSiteId = overrides.siteId ?? siteAId;
    const fixtureProjectId = overrides.projectId ?? projectAId;
    await dataSource.query(
      `INSERT INTO workfronts (
        id, tenant_id, project_id, site_id, code, name, status, readiness, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Workfront O&M','PLANNED','PENDING',$6,$6)`,
      [
        workfrontId, tenantId, fixtureProjectId, fixtureSiteId,
        `WF-${permitId.slice(0, 8).toUpperCase()}`, managerId
      ]
    );
    await dataSource.query(
      `INSERT INTO permits_to_work (
        id, tenant_id, project_id, site_id, workfront_id, permit_type, status, valid_from,
        valid_to, requested_by, issuer_id, issued_at, isolation_snapshot, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'HOT_WORK','ISSUED','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',
        $6,$7,now(),'[{"point":"ISO-1"}]'::jsonb,$6,$6)`,
      [permitId, tenantId, fixtureProjectId, fixtureSiteId, workfrontId, managerId, verifierId]
    );
    return permitId;
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'om-test', name: 'O&M Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'om-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'om-manager@example.test', 'O&M Manager'),
      user(verifierId, tenantId, 'om-verifier@example.test', 'O&M Verifier'),
      user(scopedId, tenantId, 'om-scoped@example.test', 'Project A Only'),
      user(bareId, tenantId, 'om-bare@example.test', 'No O&M Access'),
      user(otherTenantUserId, otherTenantId, 'om-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(verifierId, tenantId),
      credential(scopedId, tenantId), credential(bareId, tenantId),
      credential(otherTenantUserId, otherTenantId)
    ]);

    const allCodes = [
      'alarmCase.read', 'serviceIncident.read', 'performance.read', 'workOrder.read',
      'alarmCase.acknowledge', 'serviceIncident.create', 'workOrder.create', 'workOrder.manage'
    ];
    const managerRole = await role(tenantId, 'OM_MANAGER_FIXTURE', allCodes);
    const verifierRole = await role(tenantId, 'OM_VERIFIER_FIXTURE', allCodes);
    const scopedRole = await role(tenantId, 'OM_SCOPED_FIXTURE', allCodes);
    const bareRole = await role(tenantId, 'OM_NONE_FIXTURE', ['notification.read']);
    const otherRole = await role(otherTenantId, 'OM_OTHER_FIXTURE', allCodes);

    await seedProject(tenantId, projectAId, siteAId, 'OM-PRJ-A', managerId, randomUUID());
    await seedProject(tenantId, projectBId, siteBId, 'OM-PRJ-B', managerId, randomUUID());
    await seedProject(
      otherTenantId, otherProjectId, otherSiteId, 'OM-PRJ-C', otherTenantUserId, randomUUID()
    );
    assetAId = await seedAsset(tenantId, projectAId, siteAId, managerId, 'OM-ASSET-A');
    assetBId = await seedAsset(tenantId, projectBId, siteBId, managerId, 'OM-ASSET-B');
    otherAssetId = await seedAsset(
      otherTenantId, otherProjectId, otherSiteId, otherTenantUserId, 'OM-ASSET-C'
    );

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, verifierId, verifierRole.id, AssignmentScopeType.TENANT, null),
      // Project-scoped: reaches project A's site and asset only — project B answers 404.
      assignment(tenantId, scopedId, scopedRole.id, AssignmentScopeType.PROJECT, projectAId),
      assignment(tenantId, bareId, bareRole.id, AssignmentScopeType.TENANT, null),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  async function seedAsset(
    fixtureTenantId: string, fixtureProjectId: string, fixtureSiteId: string,
    fixtureUserId: string, assetCode: string
  ): Promise<string> {
    const modelId = randomUUID();
    const equipmentId = randomUUID();
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO equipment_models (
        id, tenant_id, equipment_class, manufacturer, model, spec_version, status,
        created_by, updated_by
      ) VALUES ($1,$2,'INVERTER','Demo Co',$3,'V1','APPROVED',$4,$4)`,
      [modelId, fixtureTenantId, `MODEL-${assetCode}`, fixtureUserId]
    );
    await dataSource.query(
      `INSERT INTO equipment (
        id, tenant_id, project_id, equipment_model_id, equipment_type, site_id,
        lifecycle_status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'INVERTER',$5,'OPERATIONAL',$6,$6)`,
      [equipmentId, fixtureTenantId, fixtureProjectId, modelId, fixtureSiteId, fixtureUserId]
    );
    await dataSource.query(
      `INSERT INTO assets (
        id, tenant_id, equipment_id, project_id, site_id, asset_code, operational_status,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$7)`,
      [id, fixtureTenantId, equipmentId, fixtureProjectId, fixtureSiteId, assetCode, fixtureUserId]
    );
    return id;
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
      phase: ProjectPhase.O_AND_M, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2026-12-31', forecastCod: null,
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
      permissions, policyVersion: 14, status: MasterRecordStatus.ACTIVE
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
