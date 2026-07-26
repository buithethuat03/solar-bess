import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateOperationsMaintenance1783760000000';
const grantMigrationName = 'GrantOperationsMaintenancePermissions1783761000000';
const tables = [
  'alarm_cases', 'service_incidents', 'maintenance_plans', 'work_orders',
  'work_order_closure_cycles', 'warranty_claims'
];
const readCodes = [
  'alarmCase.read', 'serviceIncident.read', 'performance.read', 'workOrder.read'
];
const writeCodes = [
  'alarmCase.acknowledge', 'serviceIncident.create', 'workOrder.create', 'workOrder.manage'
];

describe('O&M migration — DB-084…DB-088 and DB-119', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const authorId = randomUUID();
  const technicianId = randomUUID();
  const verifierId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const siteId = randomUUID();
  const secondSiteId = randomUUID();
  const otherSiteId = randomUUID();
  const companyId = randomUUID();

  let assetId: string;
  let secondSiteAssetId: string;
  let otherTenantAssetId: string;

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedMasterData();
  });

  /**
   * A failed expectation inside a test that reverted part of the chain would otherwise leave the
   * SHARED integration database half-migrated and poison every later suite in the run. Re-running
   * the chain after each test makes that impossible: `runMigrations` is a no-op when nothing was
   * reverted and a full repair when something was.
   */
  afterEach(async () => {
    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('creates every table, drops them again on down and restores them on re-up', async () => {
    expect(await regclasses()).toEqual(tables);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);
    expect(await functionNames()).toEqual([]);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
    expect(await functionNames()).toEqual([
      'enforce_alarm_case_local_acknowledge', 'protect_maintenance_plan_published',
      'protect_warranty_claim_resolution', 'protect_work_order_closure_cycle'
    ]);
  });

  it('grants the O&M codes at policy 14 and reverts them symmetrically', async () => {
    const controlsRoleId = randomUUID();
    const executiveRoleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_CONTROLS','Project Controls',$3::jsonb,1,'ACTIVE')`,
      [controlsRoleId, tenantId, JSON.stringify(['package.read'])]
    );
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'EXECUTIVE','Executive',$3::jsonb,1,'ACTIVE')`,
      [executiveRoleId, tenantId, JSON.stringify(['project.read'])]
    );
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    // Read-only roles get exactly the four read codes appended, in order, and no write code.
    expect(await permissionsOf(controlsRoleId)).toEqual(['package.read', ...readCodes]);
    expect(await permissionsOf(executiveRoleId)).toEqual(['project.read', ...readCodes]);
    for (const code of writeCodes) {
      expect(await permissionsOf(controlsRoleId)).not.toContain(code);
      expect(await permissionsOf(executiveRoleId)).not.toContain(code);
    }
    expect(await policyVersionOf(controlsRoleId)).toBe(14);

    // No O&M role is invented: docs/09 names the personas without role codes, so nothing new
    // appears in the catalog.
    const [invented] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM roles
       WHERE code LIKE 'OM\\_%' OR code IN ('OM_DISPATCHER','OM_TECHNICIAN','TECHNICIAN')`
    );
    expect(invented.count).toBe('0');

    await revertThroughMigration(grantMigrationName);
    expect(await permissionsOf(controlsRoleId)).toEqual(['package.read']);
    expect(await permissionsOf(executiveRoleId)).toEqual(['project.read']);
    expect(await policyVersionOf(controlsRoleId)).toBe(1);
    const [state] = await AppDataSource.query<Array<{ tableName: string | null }>>(
      `SELECT to_regclass('public.role_grant_reconcile_1783761000000')::text AS "tableName"`
    );
    expect(state.tableName).toBeNull();

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('keeps the alarm-case acknowledge local and refuses deletion (SEC-127/SEC-128)', async () => {
    const caseId = await seedAlarmCase({});

    // The acknowledge write itself is accepted.
    await expect(AppDataSource.query(
      `UPDATE alarm_cases SET state = 'ACKNOWLEDGED', acknowledged_by = $2,
        acknowledged_at = now(), acknowledgment_note = 'đã tiếp nhận',
        version_no = version_no + 1, updated_by = $2 WHERE id = $1`,
      [caseId, technicianId]
    )).resolves.toBeDefined();

    // The same statement may not also rewrite the source projection.
    const secondCaseId = await seedAlarmCase({});
    await expect(AppDataSource.query(
      `UPDATE alarm_cases SET state = 'ACKNOWLEDGED', acknowledged_by = $2,
        acknowledged_at = now(), source_event_refs = '[]'::jsonb,
        version_no = version_no + 1, updated_by = $2 WHERE id = $1`,
      [secondCaseId, technicianId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE alarm_cases SET state = 'ACKNOWLEDGED', acknowledged_by = $2,
        acknowledged_at = now(), last_seen_at = now(),
        version_no = version_no + 1, updated_by = $2 WHERE id = $1`,
      [secondCaseId, technicianId]
    )).rejects.toMatchObject({ code: '55000' });

    // An acknowledgement is a permanent fact, and a case is never deleted.
    await expect(AppDataSource.query(
      `UPDATE alarm_cases SET acknowledged_by = NULL, acknowledged_at = NULL,
        state = 'OPEN' WHERE id = $1`, [caseId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM alarm_cases WHERE id = $1', [caseId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('binds alarm cases structurally to their site, asset and seen window', async () => {
    await expect(seedAlarmCase({
      firstSeenAt: new Date('2026-07-26T10:00:00Z'), lastSeenAt: new Date('2026-07-26T09:00:00Z')
    })).rejects.toMatchObject({ constraint: 'ck_alarm_case_seen_order' });
    // A non-OPEN case must carry its acknowledger.
    await expect(seedAlarmCase({ state: 'INVESTIGATING' }))
      .rejects.toMatchObject({ constraint: 'ck_alarm_case_ack_required' });
    // An asset on another site can never be attached to this site's case.
    await expect(seedAlarmCase({ assetId: secondSiteAssetId }))
      .rejects.toMatchObject({ constraint: 'fk_alarm_case_asset' });
    // …nor an asset from another tenant.
    await expect(seedAlarmCase({ assetId: otherTenantAssetId }))
      .rejects.toMatchObject({ constraint: 'fk_alarm_case_asset' });
  });

  it('refuses a service incident whose downtime ends before it starts', async () => {
    await expect(seedServiceIncident({
      downtimeStart: new Date('2026-07-26T10:00:00Z'),
      downtimeEnd: new Date('2026-07-26T09:00:00Z')
    })).rejects.toMatchObject({ constraint: 'ck_service_incident_downtime' });
    await expect(seedServiceIncident({ downtimeEnd: new Date('2026-07-26T09:00:00Z') }))
      .rejects.toMatchObject({ constraint: 'ck_service_incident_downtime' });
    await expect(seedServiceIncident({ status: 'RESOLVED' }))
      .rejects.toMatchObject({ constraint: 'ck_service_incident_resolution' });
    await expect(seedServiceIncident({
      downtimeStart: new Date('2026-07-26T09:00:00Z'),
      downtimeEnd: new Date('2026-07-26T10:00:00Z')
    })).resolves.toBeDefined();
  });

  it('rejects every cross-tenant reference into the O&M tables', async () => {
    const foreignCaseId = await seedAlarmCase({ tenantId: otherTenantId });
    await expect(seedServiceIncident({ alarmCaseId: foreignCaseId }))
      .rejects.toMatchObject({ constraint: 'fk_service_incident_alarm_case' });
    await expect(seedWorkOrder({ code: 'WO-FOREIGN-USER', assigneeId: otherTenantUserId }))
      .rejects.toMatchObject({ constraint: 'fk_work_order_assignee' });
    await expect(seedWorkOrder({ code: 'WO-FOREIGN-ASSET', assetId: otherTenantAssetId }))
      .rejects.toMatchObject({ constraint: 'fk_work_order_asset' });
  });

  it('never lets the assignee or the completer verify their own work order', async () => {
    await expect(seedWorkOrder({
      code: 'WO-SELF-VERIFY', status: 'VERIFIED', assigneeId: technicianId,
      completedBy: technicianId, verifiedBy: technicianId
    })).rejects.toMatchObject({ constraint: 'ck_work_order_verifier_independent' });
    // Even when someone else executed it, the person who recorded completion cannot verify.
    await expect(seedWorkOrder({
      code: 'WO-COMPLETER-VERIFY', status: 'VERIFIED', assigneeId: verifierId,
      completedBy: technicianId, verifiedBy: technicianId
    })).rejects.toMatchObject({ constraint: 'ck_work_order_verifier_independent' });
    await expect(seedWorkOrder({
      code: 'WO-INDEPENDENT', status: 'VERIFIED', assigneeId: technicianId,
      completedBy: technicianId, verifiedBy: verifierId
    })).resolves.toBeDefined();
  });

  it('refuses a CLOSED work order without a return-to-service reference', async () => {
    await expect(seedWorkOrder({
      code: 'WO-NO-RTS', status: 'CLOSED', assigneeId: technicianId,
      completedBy: technicianId, verifiedBy: verifierId, closedBy: verifierId
    })).rejects.toMatchObject({ constraint: 'ck_work_order_closed' });
    await expect(seedWorkOrder({
      code: 'WO-NO-CLOSER', status: 'CLOSED', assigneeId: technicianId,
      completedBy: technicianId, verifiedBy: verifierId,
      returnToServiceRef: 'RTS-2026-001'
    })).rejects.toMatchObject({ constraint: 'ck_work_order_closed' });
    await expect(seedWorkOrder({
      code: 'WO-CLOSED-OK', status: 'CLOSED', assigneeId: technicianId,
      completedBy: technicianId, verifiedBy: verifierId, closedBy: verifierId,
      returnToServiceRef: 'RTS-2026-002'
    })).resolves.toBeDefined();
  });

  it('requires a live permit reference once permitted work is in progress', async () => {
    await expect(seedWorkOrder({
      code: 'WO-PTW-MISSING', status: 'IN_PROGRESS', requiresPermit: true,
      assigneeId: technicianId
    })).rejects.toMatchObject({ constraint: 'ck_work_order_permit_required' });
    const permitId = await seedPermit({});
    await expect(seedWorkOrder({
      code: 'WO-PTW-OK', status: 'IN_PROGRESS', requiresPermit: true,
      assigneeId: technicianId, permitToWorkId: permitId
    })).resolves.toBeDefined();
  });

  it('keeps one undecided DB-119 cycle per work order and freezes every decided one', async () => {
    const workOrderId = await seedWorkOrder({ code: 'WO-CYCLE' });
    const firstCycleId = await seedClosureCycle(workOrderId, { sequenceNo: 1 });

    // Only one undecided cycle may exist at a time.
    // Sequence 3, not a duplicate 2: reusing the sequence would break the sequence key as well and
    // Postgres reports whichever index it reaches first. Only the open-cycle rule is under test.
    await expect(seedClosureCycle(workOrderId, { sequenceNo: 3 }))
      .rejects.toMatchObject({ constraint: 'uq_work_order_closure_cycle_open' });
    // The decider can never be the requester.
    await expect(AppDataSource.query(
      `UPDATE work_order_closure_cycles SET decision = 'APPROVE',
        decision_comment = 'tự duyệt', decided_by = $2, decided_at = now() WHERE id = $1`,
      [firstCycleId, technicianId]
    )).rejects.toMatchObject({ constraint: 'ck_work_order_closure_cycle_sod' });

    await AppDataSource.query(
      `UPDATE work_order_closure_cycles SET decision = 'APPROVE',
        decision_comment = 'đạt yêu cầu', decided_by = $2, decided_at = now() WHERE id = $1`,
      [firstCycleId, verifierId]
    );
    // A decided cycle is frozen history — that is what makes VERIFIED → REOPENED safe.
    await expect(AppDataSource.query(
      `UPDATE work_order_closure_cycles SET decision = 'RETURN' WHERE id = $1`, [firstCycleId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM work_order_closure_cycles WHERE id = $1', [firstCycleId]
    )).rejects.toMatchObject({ code: '55000' });

    // With the first cycle decided, the reopen cycle is admitted and the history is preserved.
    const secondCycleId = await seedClosureCycle(workOrderId, { sequenceNo: 2 });
    expect(secondCycleId).toBeDefined();
    // Sequence 3, not a duplicate 2: reusing the sequence would break the sequence key as well and
    // Postgres reports whichever index it reaches first. Only the open-cycle rule is under test.
    await expect(seedClosureCycle(workOrderId, { sequenceNo: 3 }))
      .rejects.toMatchObject({ constraint: 'uq_work_order_closure_cycle_open' });
    const [history] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM work_order_closure_cycles WHERE work_order_id = $1`,
      [workOrderId]
    );
    expect(history.count).toBe('2');
  });

  it('freezes a published maintenance plan version and its retired successor', async () => {
    const draftPlanId = await seedMaintenancePlan({ version: 1, status: 'DRAFT' });
    await expect(AppDataSource.query(
      `UPDATE maintenance_plans SET interval_value = 30 WHERE id = $1`, [draftPlanId]
    )).resolves.toBeDefined();

    const publishedPlanId = await seedMaintenancePlan({
      version: 2, status: 'PUBLISHED', publishedBy: verifierId
    });
    await expect(AppDataSource.query(
      `UPDATE maintenance_plans SET interval_value = 90 WHERE id = $1`, [publishedPlanId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM maintenance_plans WHERE id = $1', [publishedPlanId]
    )).rejects.toMatchObject({ code: '55000' });

    // Retiring is the one legal move, and it is one-way.
    await AppDataSource.query(
      `UPDATE maintenance_plans SET status = 'RETIRED', version_no = version_no + 1,
        updated_by = $2 WHERE id = $1`, [publishedPlanId, verifierId]
    );
    await expect(AppDataSource.query(
      `UPDATE maintenance_plans SET status = 'PUBLISHED' WHERE id = $1`, [publishedPlanId]
    )).rejects.toMatchObject({ code: '55000' });

    // One version per (asset, plan type, version).
    await expect(seedMaintenancePlan({ version: 1, status: 'DRAFT' }))
      .rejects.toMatchObject({ constraint: 'uq_maintenance_plan_version' });
  });

  it('retains a resolved warranty claim forever', async () => {
    const workOrderId = await seedWorkOrder({ code: 'WO-WARRANTY' });
    await expect(seedWarrantyClaim(workOrderId, { code: 'WC-NO-RES', status: 'APPROVED' }))
      .rejects.toMatchObject({ constraint: 'ck_warranty_claim_resolved' });

    const claimId = await seedWarrantyClaim(workOrderId, { code: 'WC-OPEN' });
    await AppDataSource.query(
      `UPDATE warranty_claims SET status = 'APPROVED', resolution = 'nhà cung cấp chấp nhận',
        resolved_by = $2, resolved_at = now(), version_no = version_no + 1, updated_by = $2
       WHERE id = $1`, [claimId, verifierId]
    );
    await expect(AppDataSource.query(
      `UPDATE warranty_claims SET resolution = 'đổi ý' WHERE id = $1`, [claimId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM warranty_claims WHERE id = $1', [claimId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('creates no warranties table and no OT connectivity column anywhere in the slice', async () => {
    // DB-083 is deliberately absent: nothing in the operation catalog can populate it.
    const [warranty] = await AppDataSource.query<Array<{ tableName: string | null }>>(
      `SELECT to_regclass('public.warranties')::text AS "tableName"`
    );
    expect(warranty.tableName).toBeNull();
    const [warrantyColumn] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'warranty_id'`
    );
    expect(warrantyColumn.count).toBe('0');

    // SEC-127/SEC-128 at the live schema level.
    const offenders = await AppDataSource.query<Array<{ table: string; column: string }>>(
      `SELECT table_name AS "table", column_name AS "column" FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         AND column_name ~* 'host|password|secret|token|credential|url|endpoint|username|api_key|apikey'`,
      [tables]
    );
    expect(offenders).toEqual([]);

    // No telemetry or meter table was introduced by this slice either.
    const [store] = await AppDataSource.query<Array<{ telemetry: string | null; meters: string | null }>>(
      `SELECT to_regclass('public.telemetry_samples')::text AS telemetry,
        to_regclass('public.meters')::text AS meters`
    );
    expect(store.telemetry).toBeNull();
    expect(store.meters).toBeNull();
  });

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function policyVersionOf(roleId: string): Promise<number> {
    const [row] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
    );
    return row.policyVersion;
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      tables.map((table) => `to_regclass('public.${table}')::text AS ${table}`).join(', ')
        .replace(/^/, 'SELECT ')
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function functionNames(): Promise<string[]> {
    const rows = await AppDataSource.query<Array<{ name: string }>>(
      `SELECT proname AS name FROM pg_proc
       WHERE proname IN ('enforce_alarm_case_local_acknowledge',
         'protect_maintenance_plan_published', 'protect_warranty_claim_resolution',
         'protect_work_order_closure_cycle')
       ORDER BY proname`
    );
    return rows.map((row) => row.name);
  }

  async function seedAlarmCase(overrides: {
    tenantId?: string;
    assetId?: string | null;
    state?: string;
    firstSeenAt?: Date;
    lastSeenAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    const fixtureTenantId = overrides.tenantId ?? tenantId;
    const foreign = fixtureTenantId !== tenantId;
    await AppDataSource.query(
      `INSERT INTO alarm_cases (
        id, tenant_id, project_id, site_id, asset_id, severity, state, first_seen_at,
        last_seen_at, source_event_refs, source_quality, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'HIGH',$6,$7,$8,$9::jsonb,'GOOD',$10,$10)`,
      [
        id, fixtureTenantId,
        foreign ? otherProjectId : projectId, foreign ? otherSiteId : siteId,
        overrides.assetId === undefined ? null : overrides.assetId,
        overrides.state ?? 'OPEN',
        overrides.firstSeenAt ?? new Date('2026-07-26T08:00:00Z'),
        overrides.lastSeenAt ?? new Date('2026-07-26T09:00:00Z'),
        JSON.stringify(['ot-event-1', 'ot-event-2']),
        foreign ? otherTenantUserId : authorId
      ]
    );
    return id;
  }

  async function seedServiceIncident(overrides: {
    status?: string;
    alarmCaseId?: string;
    downtimeStart?: Date;
    downtimeEnd?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO service_incidents (
        id, tenant_id, project_id, site_id, asset_id, alarm_case_id, severity, status, title,
        detected_at, downtime_start, downtime_end, reported_by, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'HIGH',$7,'Mất sản lượng cụm inverter',$8,$9,$10,$11,$11,$11)`,
      [
        id, tenantId, projectId, siteId, assetId, overrides.alarmCaseId ?? null,
        overrides.status ?? 'OPEN', new Date('2026-07-26T08:00:00Z'),
        overrides.downtimeStart ?? null, overrides.downtimeEnd ?? null, authorId
      ]
    );
    return id;
  }

  async function seedWorkOrder(overrides: {
    code: string;
    status?: string;
    assetId?: string;
    assigneeId?: string;
    completedBy?: string;
    verifiedBy?: string;
    closedBy?: string;
    returnToServiceRef?: string;
    requiresPermit?: boolean;
    permitToWorkId?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO work_orders (
        id, tenant_id, project_id, site_id, asset_id, permit_to_work_id, code, work_type,
        title, priority, status, requires_permit, assignee_id, completed_by, completed_at,
        verified_by, verified_at, return_to_service_ref, closed_by, closed_at,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'CORRECTIVE','Sửa chữa fixture','HIGH',$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$18)`,
      [
        id, tenantId, projectId, siteId, overrides.assetId ?? assetId,
        overrides.permitToWorkId ?? null, overrides.code, overrides.status ?? 'DRAFT',
        overrides.requiresPermit ?? false, overrides.assigneeId ?? null,
        overrides.completedBy ?? null, overrides.completedBy ? new Date() : null,
        overrides.verifiedBy ?? null, overrides.verifiedBy ? new Date() : null,
        overrides.returnToServiceRef ?? null, overrides.closedBy ?? null,
        overrides.closedBy ? new Date() : null, authorId
      ]
    );
    return id;
  }

  async function seedClosureCycle(
    workOrderId: string, overrides: { sequenceNo: number }
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO work_order_closure_cycles (
        id, tenant_id, project_id, work_order_id, sequence_no, request_comment,
        request_evidence_refs, requested_by, requested_at
      ) VALUES ($1,$2,$3,$4,$5,'Đã hoàn tất, đề nghị nghiệm thu',
        '["minio://evidence/wo-1"]'::jsonb,$6,now())`,
      [id, tenantId, projectId, workOrderId, overrides.sequenceNo, technicianId]
    );
    return id;
  }

  async function seedMaintenancePlan(overrides: {
    version: number; status: string; publishedBy?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO maintenance_plans (
        id, tenant_id, project_id, site_id, asset_id, plan_type, version, trigger_type,
        interval_value, interval_unit, status, published_by, published_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'PREVENTIVE',$6,'TIME',60,'DAY',$7,$8,$9,$10,$10)`,
      [
        id, tenantId, projectId, siteId, assetId, overrides.version, overrides.status,
        overrides.publishedBy ?? null, overrides.publishedBy ? new Date() : null, authorId
      ]
    );
    return id;
  }

  async function seedWarrantyClaim(
    workOrderId: string, overrides: { code: string; status?: string }
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO warranty_claims (
        id, tenant_id, project_id, site_id, asset_id, work_order_id, claim_code,
        failure_description, submitted_at, submitted_by, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Inverter hỏng trong thời hạn bảo hành',now(),$8,$9,$8,$8)`,
      [
        id, tenantId, projectId, siteId, assetId, workOrderId, overrides.code, authorId,
        overrides.status ?? 'SUBMITTED'
      ]
    );
    return id;
  }

  /** A permit lives on a workfront (DB-062), so the fixture creates one alongside it. */
  async function seedPermit(overrides: { siteId?: string }): Promise<string> {
    const workfrontId = randomUUID();
    const permitId = randomUUID();
    const fixtureSiteId = overrides.siteId ?? siteId;
    await AppDataSource.query(
      `INSERT INTO workfronts (
        id, tenant_id, project_id, site_id, code, name, status, readiness, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Workfront O&M','PLANNED','PENDING',$6,$6)`,
      [workfrontId, tenantId, projectId, fixtureSiteId, `WF-OM-${permitId.slice(0, 8).toUpperCase()}`, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO permits_to_work (
        id, tenant_id, project_id, site_id, workfront_id, permit_type, status,
        valid_from, valid_to, requested_by, issuer_id, issued_at, isolation_snapshot,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'HOT_WORK','ISSUED',$6,$7,$8,$9,now(),
        '[{"point":"ISO-1"}]'::jsonb,$8,$8)`,
      [
        permitId, tenantId, projectId, fixtureSiteId, workfrontId,
        new Date('2026-07-20T00:00:00Z'), new Date('2026-08-30T00:00:00Z'),
        authorId, verifierId
      ]
    );
    return permitId;
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'om-mig'], [otherTenantId, 'om-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'om-mig-author@example.test'],
      [technicianId, tenantId, 'om-mig-tech@example.test'],
      [verifierId, tenantId, 'om-mig-verifier@example.test'],
      [otherTenantUserId, otherTenantId, 'om-mig-other@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await seedProject(tenantId, projectId, siteId, 'OM-PRJ', authorId, companyId);
    await AppDataSource.query(
      `INSERT INTO sites (id, tenant_id, project_id, code, name, timezone, is_primary, status)
       VALUES ($1,$2,$3,'SECOND','Second site','Asia/Ho_Chi_Minh',false,'ACTIVE')`,
      [secondSiteId, tenantId, projectId]
    );
    await seedProject(
      otherTenantId, otherProjectId, otherSiteId, 'OM-PRJ-2', otherTenantUserId, randomUUID()
    );
    assetId = await seedAsset(tenantId, projectId, siteId, authorId, 'OM-ASSET-1');
    secondSiteAssetId = await seedAsset(
      tenantId, projectId, secondSiteId, authorId, 'OM-ASSET-2'
    );
    otherTenantAssetId = await seedAsset(
      otherTenantId, otherProjectId, otherSiteId, otherTenantUserId, 'OM-ASSET-3'
    );
  }

  async function seedAsset(
    fixtureTenantId: string, fixtureProjectId: string, fixtureSiteId: string,
    fixtureUserId: string, assetCode: string
  ): Promise<string> {
    const modelId = randomUUID();
    const equipmentId = randomUUID();
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO equipment_models (
        id, tenant_id, equipment_class, manufacturer, model, spec_version, status,
        created_by, updated_by
      ) VALUES ($1,$2,'INVERTER','Demo Co',$3,'V1','APPROVED',$4,$4)`,
      [modelId, fixtureTenantId, `MODEL-${assetCode}`, fixtureUserId]
    );
    await AppDataSource.query(
      `INSERT INTO equipment (
        id, tenant_id, project_id, equipment_model_id, equipment_type, site_id,
        lifecycle_status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'INVERTER',$5,'OPERATIONAL',$6,$6)`,
      [equipmentId, fixtureTenantId, fixtureProjectId, modelId, fixtureSiteId, fixtureUserId]
    );
    await AppDataSource.query(
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
    managerId: string, fixtureCompanyId: string
  ): Promise<void> {
    const portfolioId = randomUUID();
    const legalId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,$3,'Company O&M','CONTRACTOR','ACTIVE')`,
      [fixtureCompanyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (
        id, tenant_id, company_id, legal_name, country, registration_no, status
      ) VALUES ($1,$2,$3,'Legal O&M','VN',$4,'ACTIVE')`,
      [legalId, fixtureTenantId, fixtureCompanyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio O&M','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'O&M Project','SOLAR','EXECUTION','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, legalId, fixtureCompanyId, managerId, code]
    );
    await AppDataSource.query(
      `INSERT INTO sites (id, tenant_id, project_id, code, name, timezone, is_primary, status)
       VALUES ($1,$2,$3,'MAIN','Main site','Asia/Ho_Chi_Minh',true,'ACTIVE')`,
      [fixtureSiteId, fixtureTenantId, fixtureProjectId]
    );
  }
});
