import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateFieldHseQuality1783746000000';
const grantMigrationName = 'GrantFieldHseQualityPermissions1783747000000';
const tables = [
  'workfronts', 'daily_logs', 'quantity_progress_records', 'permits_to_work', 'hse_incidents',
  'stop_work_actions', 'inspection_test_plans', 'inspections', 'ncrs', 'ncr_disposition_cycles',
  'punch_items', 'punch_closure_cycles', 'capa_actions'
];
const newRoleCodes = ['HSE_MANAGER', 'QAQC_MANAGER', 'PERMIT_ISSUER', 'CONTRACTOR'];

describe('Field, HSE & Quality migration — DB-055…DB-064, DB-115/116/117', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const authorId = randomUUID();
  const deciderId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const packageId = randomUUID();
  const companyId = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedMasterData();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('creates every table, drops them again on down and restores them on re-up', async () => {
    expect(await regclasses()).toEqual(tables);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
  });

  it('grants the codes at policy 9, creates the 4 unassigned roles and reverts symmetrically', async () => {
    const roleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_CONTROLS','Project Controls',$3::jsonb,1,'ACTIVE')`,
      [roleId, tenantId, JSON.stringify(['package.read', 'workfront.read'])]
    );
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    // Re-running the whole chain also applies the later procurement (1783749) and cross-cutting
    // (1783757) grants, so this asserts the field-hse codes are present and correctly ordered
    // rather than that they are the only ones — an exact list would break on every later slice.
    const granted = await permissionsOf(roleId);
    expect(granted.slice(0, 5)).toEqual([
      'package.read', 'workfront.read', 'dailyLog.create', 'hseIncident.report', 'stopWork.issue'
    ]);
    const [role] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
    );
    expect(role.policyVersion).toBeGreaterThanOrEqual(9);

    // The four new roles exist for EVERY tenant — with zero user assignments anywhere. A role
    // nobody holds fails closed: permit issue / stop-work lift are unassignable-by-default.
    const created = await AppDataSource.query<Array<{
      tenantId: string; code: string; permissions: string[]; assignments: string;
    }>>(
      `SELECT role.tenant_id AS "tenantId", role.code, role.permissions,
        (SELECT count(*) FROM role_assignments assignment
          WHERE assignment.role_id = role.id)::text AS "assignments"
      FROM roles role WHERE role.code = ANY($1::text[]) ORDER BY role.tenant_id, role.code`,
      [newRoleCodes]
    );
    expect(created).toHaveLength(newRoleCodes.length * 2);
    for (const row of created) {
      expect(row.assignments).toBe('0');
    }
    const hseManager = created.find(
      (row) => row.tenantId === tenantId && row.code === 'HSE_MANAGER'
    );
    // The safety authority itself is asserted exactly and in order; the cross-cutting grant
    // (1783757) later adds `permission.read.self` to every role, so the tail is not pinned.
    expect(hseManager?.permissions.slice(0, 5)).toEqual([
      'workfront.read', 'permitToWork.issue', 'hseIncident.report',
      'stopWork.issue', 'stopWork.lift'
    ]);
    expect(hseManager?.permissions).not.toContain('workfront.release');
    const permitIssuer = created.find(
      (row) => row.tenantId === tenantId && row.code === 'PERMIT_ISSUER'
    );
    expect(permitIssuer?.permissions.slice(0, 4)).toEqual([
      'workfront.read', 'permitToWork.issue', 'hseIncident.report', 'stopWork.issue'
    ]);
    expect(permitIssuer?.permissions).not.toContain('stopWork.lift');

    await revertThroughMigration(grantMigrationName);
    // Down removes exactly what up added: the pre-existing codes survive, the created roles go.
    expect(await permissionsOf(roleId)).toEqual(['package.read', 'workfront.read']);
    const [remaining] = await AppDataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM roles WHERE code = ANY($1::text[])', [newRoleCodes]
    );
    expect(remaining.count).toBe('0');

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('enforces the workfront release/suspension gates structurally', async () => {
    await expect(seedWorkfront({ code: 'WF-BAD-RELEASE', status: 'RELEASED' }))
      .rejects.toMatchObject({ constraint: 'ck_workfront_released_requires_gates' });
    await expect(seedWorkfront({
      code: 'WF-BAD-RELEASE', status: 'RELEASED', readiness: 'GATES_CLEARED'
    })).rejects.toMatchObject({ constraint: 'ck_workfront_released_requires_gates' });
    await expect(seedWorkfront({ code: 'WF-BAD-SUSPEND', status: 'SUSPENDED' }))
      .rejects.toMatchObject({ constraint: 'ck_workfront_suspended_reason' });
    await expect(seedWorkfront({
      code: 'WF-OK', status: 'RELEASED', readiness: 'GATES_CLEARED', releasedBy: authorId
    })).resolves.toBeDefined();
  });

  it('freezes SIGNED daily logs, keeps one live log per slot and forces correction rows', async () => {
    const signedId = await seedDailyLog({ revision: 1, status: 'SIGNED' });
    await expect(AppDataSource.query(
      `UPDATE daily_logs SET summary = 'viết lại nhật ký' WHERE id = $1`, [signedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM daily_logs WHERE id = $1', [signedId]
    )).rejects.toMatchObject({ code: '55000' });

    // A second live log in the same slot is structurally impossible.
    await expect(seedDailyLog({ revision: 2, status: 'DRAFT', correctionOfId: signedId }))
      .rejects.toMatchObject({ constraint: 'uq_daily_log_slot_live' });

    // The correction flow: supersede first, then the revision + 1 row is admitted.
    await expect(AppDataSource.query(
      `UPDATE daily_logs SET status = 'SUPERSEDED' WHERE id = $1`, [signedId]
    )).resolves.toBeDefined();
    const correctionId = await seedDailyLog({
      revision: 2, status: 'DRAFT', correctionOfId: signedId
    });
    expect(correctionId).toBeDefined();

    // A superseded log is immutable history.
    await expect(AppDataSource.query(
      `UPDATE daily_logs SET summary = 'viết lại lịch sử' WHERE id = $1`, [signedId]
    )).rejects.toMatchObject({ code: '55000' });

    // A correction without a reason is refused.
    await expect(seedDailyLog({
      revision: 3, status: 'DRAFT', correctionOfId: signedId, reason: null, shift: 'NIGHT'
    })).rejects.toMatchObject({ constraint: 'ck_daily_log_correction' });

    // SIGNED requires the signer snapshot + pair.
    await expect(seedDailyLog({
      revision: 1, status: 'SIGNED', shift: 'NIGHT', signed: false
    })).rejects.toMatchObject({ constraint: 'ck_daily_log_signed_status' });
  });

  it('keeps the quantity ledger append-only with source dedup and single certification', async () => {
    const workfrontId = await seedWorkfront({ code: 'WF-QTY' });
    const recordId = await seedQuantity(workfrontId, { sourceKey: 'offline-qty-1' });
    await expect(AppDataSource.query(
      'UPDATE quantity_progress_records SET quantity = 1 WHERE id = $1', [recordId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM quantity_progress_records WHERE id = $1', [recordId]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(seedQuantity(workfrontId, { sourceKey: 'offline-qty-1' }))
      .rejects.toMatchObject({ constraint: 'uq_qpr_source' });
    await expect(seedQuantity(workfrontId, { sourceKey: 'offline-qty-2', quantity: '0' }))
      .rejects.toMatchObject({ constraint: 'ck_qpr_quantity_positive' });
    await expect(seedQuantity(workfrontId, {
      sourceKey: 'offline-qty-3', correctionOfId: recordId, certificationOfId: recordId,
      reason: 'đính chính'
    })).rejects.toMatchObject({ constraint: 'ck_qpr_single_role' });
    await expect(seedQuantity(workfrontId, {
      sourceKey: 'offline-qty-4', correctionOfId: recordId
    })).rejects.toMatchObject({ constraint: 'ck_qpr_correction' });

    // Certification is its own append row — and it can happen exactly once per record.
    await seedQuantity(workfrontId, { sourceKey: 'offline-qty-5', certificationOfId: recordId });
    await expect(seedQuantity(workfrontId, {
      sourceKey: 'offline-qty-6', certificationOfId: recordId
    })).rejects.toMatchObject({ constraint: 'uq_qpr_single_certification' });
  });

  it('binds permits to issuer independence, isolation evidence and one live permit per type', async () => {
    const workfrontId = await seedWorkfront({ code: 'WF-PTW' });
    await expect(seedPermit(workfrontId, { validTo: '2026-07-01T00:00:00Z' }))
      .rejects.toMatchObject({ constraint: 'ck_permit_window' });
    // Postgres does not promise which CHECK it reports when a row breaks several, so the row must
    // satisfy every other precondition — here the isolation evidence — to pin the issuer rule.
    await expect(seedPermit(workfrontId, {
      status: 'ISSUED', issuerId: authorId, isolation: ['LOTO-01']
    })).rejects.toMatchObject({ constraint: 'ck_permit_issuer_independent' });
    await expect(seedPermit(workfrontId, { status: 'ISSUED', issuerId: deciderId }))
      .rejects.toMatchObject({ constraint: 'ck_permit_isolation' });
    await expect(seedPermit(workfrontId, { status: 'ISSUED', isolation: ['LOTO-01'] }))
      .rejects.toMatchObject({ constraint: 'ck_permit_issued_requires_issuer' });

    await seedPermit(workfrontId, {
      status: 'ISSUED', issuerId: deciderId, isolation: ['point-1']
    });
    await expect(seedPermit(workfrontId, {
      status: 'ISSUED', issuerId: deciderId, isolation: ['point-2']
    })).rejects.toMatchObject({ constraint: 'uq_permit_active_per_type' });
    // A different permit type may be live concurrently.
    await expect(seedPermit(workfrontId, {
      permitType: 'ELECTRICAL', status: 'ISSUED', issuerId: deciderId, isolation: ['point-3']
    })).resolves.toBeDefined();
  });

  it('treats the HSE incident report as a legal record', async () => {
    const incidentId = await seedIncident({});
    for (const statement of [
      `UPDATE hse_incidents SET narrative = 'viết lại tường trình' WHERE id = $1`,
      `UPDATE hse_incidents SET occurred_at = now() - interval '9 days' WHERE id = $1`,
      `UPDATE hse_incidents SET incident_type = 'OTHER' WHERE id = $1`,
      `UPDATE hse_incidents SET actual_severity = 'LOW' WHERE id = $1`,
      `UPDATE hse_incidents SET site_id = NULL WHERE id = $1`,
      'DELETE FROM hse_incidents WHERE id = $1'
    ]) {
      await expect(AppDataSource.query(statement, [incidentId]))
        .rejects.toMatchObject({ code: '55000' });
    }
    // Investigation status may move; the legal hold can be set but never cleared.
    await expect(AppDataSource.query(
      `UPDATE hse_incidents SET status = 'INVESTIGATING' WHERE id = $1`, [incidentId]
    )).resolves.toBeDefined();
    await AppDataSource.query(
      'UPDATE hse_incidents SET legal_hold = true WHERE id = $1', [incidentId]
    );
    await expect(AppDataSource.query(
      'UPDATE hse_incidents SET legal_hold = false WHERE id = $1', [incidentId]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(seedIncident({ occurredAt: new Date(Date.now() + 86_400_000) }))
      .rejects.toMatchObject({ constraint: 'ck_hse_incident_report_order' });
    await expect(seedIncident({ status: 'CLOSED', closedBy: authorId }))
      .rejects.toMatchObject({ constraint: 'ck_hse_incident_closer_independent' });
    await expect(seedIncident({ status: 'CLOSED', closedBy: deciderId }))
      .resolves.toBeDefined();
  });

  it('keeps the stop-work ledger append-only with independent, single lifts', async () => {
    const issueId = await seedStopWork({ action: 'ISSUE' });
    await expect(AppDataSource.query(
      `UPDATE stop_work_actions SET reason = 'viết lại' WHERE id = $1`, [issueId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM stop_work_actions WHERE id = $1', [issueId]
    )).rejects.toMatchObject({ code: '55000' });

    // Whoever issued the stop can never lift it.
    await expect(seedStopWork({
      action: 'LIFT', liftsActionId: issueId, actorId: authorId, controls: ['kiểm tra']
    })).rejects.toMatchObject({ constraint: 'ck_stop_work_lift_independent' });
    // A lift without verified controls is refused.
    await expect(seedStopWork({
      action: 'LIFT', liftsActionId: issueId, actorId: deciderId, controls: []
    })).rejects.toMatchObject({ constraint: 'ck_stop_work_lift_controls' });
    // A lift must reference an ISSUE, and only one lift per issue exists.
    const liftId = await seedStopWork({
      action: 'LIFT', liftsActionId: issueId, actorId: deciderId, controls: ['kiểm tra']
    });
    await expect(seedStopWork({
      action: 'LIFT', liftsActionId: issueId, actorId: deciderId, controls: ['kiểm tra lại']
    })).rejects.toMatchObject({ constraint: 'uq_stop_work_single_lift' });
    await expect(seedStopWork({
      action: 'LIFT', liftsActionId: liftId, actorId: authorId, controls: ['kiểm tra']
    })).rejects.toMatchObject({ constraint: 'ck_stop_work_lift_targets_issue' });

    // The target shape is checked: a SITE stop-work needs exactly the site id.
    await expect(seedStopWork({ action: 'ISSUE', targetType: 'SITE' }))
      .rejects.toMatchObject({ constraint: 'ck_stop_work_target' });
  });

  it('keeps recorded inspections immutable with one open request per hold point', async () => {
    const itpId = await seedItp();
    const requestedId = await seedInspection(itpId, { sequenceNo: 1 });
    await expect(seedInspection(itpId, { sequenceNo: 2 }))
      .rejects.toMatchObject({ constraint: 'uq_inspection_hold_point_open' });

    // RECORDED structurally requires result + recorder pair + evidence.
    await expect(AppDataSource.query(
      `UPDATE inspections SET status = 'RECORDED' WHERE id = $1`, [requestedId]
    )).rejects.toMatchObject({ constraint: 'ck_inspection_recorded' });
    await expect(AppDataSource.query(
      `UPDATE inspections SET status = 'RECORDED', result = 'FAIL', recorded_by = $2,
        recorded_at = now(), evidence_refs = '[]'::jsonb WHERE id = $1`,
      [requestedId, deciderId]
    )).rejects.toMatchObject({ constraint: 'ck_inspection_recorded' });
    await AppDataSource.query(
      `UPDATE inspections SET status = 'RECORDED', result = 'FAIL', recorded_by = $2,
        recorded_at = now(), evidence_refs = '["minio://evidence/1"]'::jsonb WHERE id = $1`,
      [requestedId, deciderId]
    );
    await expect(AppDataSource.query(
      `UPDATE inspections SET result = 'PASS' WHERE id = $1`, [requestedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM inspections WHERE id = $1', [requestedId]
    )).rejects.toMatchObject({ code: '55000' });

    // Re-inspection appends sequence 2; the sequence key refuses a duplicate.
    await seedInspection(itpId, { sequenceNo: 2 });
    await expect(seedInspection(itpId, { sequenceNo: 2 }))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('enforces NCR independence, root cause and closure evidence structurally', async () => {
    await expect(seedNcr({ code: 'NCR-SOD', verifiedBy: authorId }))
      .rejects.toMatchObject({ constraint: 'ck_ncr_verifier_independent' });
    await expect(seedNcr({ code: 'NCR-DISP', status: 'DISPOSITION_PROPOSED' }))
      .rejects.toMatchObject({ constraint: 'ck_ncr_root_cause_required' });
    await expect(seedNcr({
      code: 'NCR-APPR', status: 'DISPOSITION_APPROVED', rootCause: 'lỗi vật liệu',
      disposition: 'REWORK', dispositionApprovedBy: authorId
    })).rejects.toMatchObject({ constraint: 'ck_ncr_disposition_independent' });
    await expect(seedNcr({
      code: 'NCR-CLOSE', status: 'CLOSED', rootCause: 'lỗi vật liệu', disposition: 'REWORK',
      dispositionApprovedBy: deciderId, verifiedBy: deciderId, closureEvidence: []
    })).rejects.toMatchObject({ constraint: 'ck_ncr_closed' });

    const ncrId = await seedNcr({ code: 'NCR-CYCLE', status: 'OPEN' });
    const cycleId = await seedNcrCycle(ncrId, { sequenceNo: 1 });
    await expect(seedNcrCycle(ncrId, { sequenceNo: 2 }))
      .rejects.toMatchObject({ constraint: 'uq_ncr_disposition_cycle_open' });
    // The proposer can never decide their own cycle.
    await expect(AppDataSource.query(
      `UPDATE ncr_disposition_cycles SET decision = 'APPROVE', decision_comment = 'tự duyệt',
        decided_by = $2, decided_at = now() WHERE id = $1`,
      [cycleId, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_ncr_disposition_cycle_sod' });
    await AppDataSource.query(
      `UPDATE ncr_disposition_cycles SET decision = 'APPROVE', decision_comment = 'đồng ý',
        decided_by = $2, decided_at = now() WHERE id = $1`,
      [cycleId, deciderId]
    );
    // Decided cycles are immutable and undeletable.
    await expect(AppDataSource.query(
      `UPDATE ncr_disposition_cycles SET decision_comment = 'viết lại' WHERE id = $1`, [cycleId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM ncr_disposition_cycles WHERE id = $1', [cycleId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('enforces punch category A discipline and mirrored closure cycles', async () => {
    await expect(seedPunch({ code: 'PN-A1', category: 'A', codBlocking: false }))
      .rejects.toMatchObject({ constraint: 'ck_punch_category_a_blocking' });
    await expect(seedPunch({ code: 'PN-A2', category: 'A', waivable: true }))
      .rejects.toMatchObject({ constraint: 'ck_punch_category_a_not_waivable' });
    await expect(seedPunch({
      code: 'PN-W1', category: 'B', waivable: false, status: 'WAIVED', waivedBy: authorId,
      waivedReason: 'không thể waive'
    })).rejects.toMatchObject({ constraint: 'ck_punch_waiver' });
    await expect(seedPunch({ code: 'PN-V1', category: 'B', verifiedBy: authorId }))
      .rejects.toMatchObject({ constraint: 'ck_punch_verifier_independent' });
    await expect(seedPunch({
      code: 'PN-C1', category: 'B', status: 'CLOSED', verifiedBy: deciderId, closureEvidence: []
    })).rejects.toMatchObject({ constraint: 'ck_punch_closed' });

    const punchId = await seedPunch({ code: 'PN-CYCLE', category: 'C' });
    const cycleId = await seedPunchCycle(punchId, { sequenceNo: 1 });
    await expect(seedPunchCycle(punchId, { sequenceNo: 2 }))
      .rejects.toMatchObject({ constraint: 'uq_punch_closure_cycle_open' });
    await expect(AppDataSource.query(
      `UPDATE punch_closure_cycles SET decision = 'APPROVE', decision_comment = 'tự duyệt',
        decided_by = $2, decided_at = now() WHERE id = $1`,
      [cycleId, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_punch_closure_cycle_sod' });
    await AppDataSource.query(
      `UPDATE punch_closure_cycles SET decision = 'RETURN', decision_comment = 'chưa đạt',
        decided_by = $2, decided_at = now() WHERE id = $1`,
      [cycleId, deciderId]
    );
    await expect(AppDataSource.query(
      `UPDATE punch_closure_cycles SET decision_comment = 'viết lại' WHERE id = $1`, [cycleId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('requires exactly one CAPA parent and an independent verifier', async () => {
    const ncrId = await seedNcr({ code: 'NCR-CAPA', status: 'OPEN' });
    const incidentId = await seedIncident({ siteId: null });
    await expect(seedCapa({}))
      .rejects.toMatchObject({ constraint: 'ck_capa_parent' });
    await expect(seedCapa({ ncrId, hseIncidentId: incidentId }))
      .rejects.toMatchObject({ constraint: 'ck_capa_parent' });
    await expect(seedCapa({ ncrId, status: 'VERIFIED', verifiedBy: deciderId }))
      .rejects.toMatchObject({ constraint: 'ck_capa_verified' });
    await expect(seedCapa({
      ncrId, status: 'VERIFIED', verifiedBy: authorId, effectiveness: 'đã hiệu quả'
    })).rejects.toMatchObject({ constraint: 'ck_capa_verifier_independent' });
    await expect(seedCapa({
      ncrId, status: 'VERIFIED', verifiedBy: deciderId, effectiveness: 'đã hiệu quả'
    })).resolves.toBeDefined();
    await expect(seedCapa({ hseIncidentId: incidentId })).resolves.toBeDefined();
  });

  it('cannot reference a project, site or company from another tenant', async () => {
    // Workfront pointing at the other tenant's project.
    await expect(AppDataSource.query(
      `INSERT INTO workfronts (
        id, tenant_id, project_id, site_id, code, name, status, readiness, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'WF-X','Cross tenant','PLANNED','PENDING',$5,$5)`,
      [randomUUID(), tenantId, otherProjectId, otherSiteId, authorId]
    )).rejects.toMatchObject({ code: '23503' });

    // Daily log pointing at the other tenant's site.
    await expect(AppDataSource.query(
      `INSERT INTO daily_logs (
        id, tenant_id, project_id, site_id, contractor_company_id, log_date, shift,
        revision, status, summary, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'2026-07-25','DAY',1,'DRAFT','Nhật ký chéo tenant',$6,$6)`,
      [randomUUID(), tenantId, projectId, otherSiteId, companyId, authorId]
    )).rejects.toMatchObject({ code: '23503' });

    // Stop-work actor from the other tenant.
    await expect(AppDataSource.query(
      `INSERT INTO stop_work_actions (
        id, tenant_id, project_id, action, target_type, reason, actor_id
      ) VALUES ($1,$2,$3,'ISSUE','PROJECT','Dừng chéo tenant',$4)`,
      [randomUUID(), tenantId, projectId, otherTenantUserId]
    )).rejects.toMatchObject({ code: '23503' });
  });

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      tables.map((table) => `to_regclass('public.${table}')::text AS ${table}`).join(', ')
        .replace(/^/, 'SELECT ')
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function seedWorkfront(overrides: {
    code: string;
    status?: string;
    readiness?: string;
    releasedBy?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workfronts (
        id, tenant_id, project_id, site_id, package_id, code, name, status, readiness,
        released_by, released_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'Workfront fixture',$7,$8,$9,$10,$11,$11)`,
      [
        id, tenantId, projectId, siteId, packageId, overrides.code,
        overrides.status ?? 'PLANNED', overrides.readiness ?? 'PENDING',
        overrides.releasedBy ?? null, overrides.releasedBy ? new Date() : null, authorId
      ]
    );
    return id;
  }

  async function seedDailyLog(overrides: {
    revision: number;
    status: string;
    shift?: string;
    correctionOfId?: string;
    reason?: string | null;
    signed?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    const signed = overrides.signed ?? (overrides.status === 'SIGNED');
    await AppDataSource.query(
      `INSERT INTO daily_logs (
        id, tenant_id, project_id, site_id, contractor_company_id, log_date, shift, revision,
        status, summary, correction_of_id, reason, signer_snapshot, signed_by, signed_at,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'2026-07-25',$6,$7,$8,'Nhật ký thi công fixture',$9,$10,
        $11::jsonb,$12,$13,$14,$14)`,
      [
        id, tenantId, projectId, siteId, companyId, overrides.shift ?? 'DAY',
        overrides.revision, overrides.status, overrides.correctionOfId ?? null,
        overrides.reason === null ? null
          : (overrides.reason ?? (overrides.correctionOfId ? 'đính chính số liệu' : null)),
        signed ? JSON.stringify({ userId: authorId }) : null,
        signed ? authorId : null, signed ? new Date() : null, authorId
      ]
    );
    return id;
  }

  async function seedQuantity(workfrontId: string, overrides: {
    sourceKey: string;
    quantity?: string;
    correctionOfId?: string;
    certificationOfId?: string;
    reason?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO quantity_progress_records (
        id, tenant_id, project_id, workfront_id, correction_of_id, certification_of_id,
        record_date, quantity, unit, reason, source_key, recorded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'2026-07-25',$7,'m2',$8,$9,$10)`,
      [
        id, tenantId, projectId, workfrontId, overrides.correctionOfId ?? null,
        overrides.certificationOfId ?? null, overrides.quantity ?? '125.5000',
        overrides.reason ?? null, overrides.sourceKey, authorId
      ]
    );
    return id;
  }

  async function seedPermit(workfrontId: string, overrides: {
    permitType?: string;
    status?: string;
    issuerId?: string;
    isolation?: string[];
    validTo?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO permits_to_work (
        id, tenant_id, project_id, site_id, workfront_id, permit_type, status,
        valid_from, valid_to, requested_by, issuer_id, issued_at, isolation_snapshot,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-07-20T00:00:00Z',$8,$9,$10,$11,$12::jsonb,$9,$9)`,
      [
        id, tenantId, projectId, siteId, workfrontId, overrides.permitType ?? 'HOT_WORK',
        overrides.status ?? 'REQUESTED', overrides.validTo ?? '2026-07-30T00:00:00Z',
        authorId, overrides.issuerId ?? null, overrides.issuerId ? new Date() : null,
        overrides.isolation
          ? JSON.stringify(overrides.isolation.map((point) => ({ point })))
          : null
      ]
    );
    return id;
  }

  async function seedIncident(overrides: {
    occurredAt?: Date;
    status?: string;
    closedBy?: string;
    siteId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO hse_incidents (
        id, tenant_id, project_id, site_id, occurred_at, reported_at, reported_by,
        incident_type, actual_severity, potential_severity, narrative, restricted_facts,
        status, closed_by, closed_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,now(),$6,'NEAR_MISS','MEDIUM','HIGH','Suýt va chạm thiết bị',
        $7::jsonb,$8,$9,$10,$6,$6)`,
      [
        id, tenantId, projectId, overrides.siteId === null ? null : siteId,
        overrides.occurredAt ?? new Date(Date.now() - 3_600_000), authorId,
        JSON.stringify({ privateNote: 'thông tin hạn chế' }),
        overrides.status ?? 'REPORTED', overrides.closedBy ?? null,
        overrides.closedBy ? new Date() : null
      ]
    );
    return id;
  }

  async function seedStopWork(overrides: {
    action: string;
    targetType?: string;
    liftsActionId?: string;
    actorId?: string;
    controls?: string[];
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO stop_work_actions (
        id, tenant_id, project_id, action, target_type, site_id, reason, lifts_action_id,
        verified_controls, actor_id
      ) VALUES ($1,$2,$3,$4,$5,$6,'Phát hiện điều kiện mất an toàn',$7,$8::jsonb,$9)`,
      [
        id, tenantId, projectId, overrides.action, overrides.targetType ?? 'PROJECT',
        null, overrides.liftsActionId ?? null,
        JSON.stringify(overrides.controls ?? []), overrides.actorId ?? authorId
      ]
    );
    return id;
  }

  async function seedItp(): Promise<string> {
    const documentId = randomUUID();
    const revisionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, package_id, document_code, title, discipline, type,
        classification, owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'ITP-DOC-001','Kế hoạch kiểm tra','QA','ITP','INTERNAL',$5,'ACTIVE',$5,$5)`,
      [documentId, tenantId, projectId, packageId, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, released_object_key, content_hash, scan_status, lock_state,
        approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'ISSUED','FOR_CONSTRUCTION','itp.pdf','application/pdf',
        'released/itp.pdf',$5,'CLEAN','LOCKED',$6,now(),$6,now(),$6)`,
      [revisionId, tenantId, documentId, projectId, 'a'.repeat(64), authorId]
    );
    await AppDataSource.query(
      `INSERT INTO inspection_test_plans (
        id, tenant_id, project_id, package_id, document_revision_id, version, created_by
      ) VALUES ($1,$2,$3,$4,$1,1,$5)`,
      [revisionId, tenantId, projectId, packageId, authorId]
    );
    return revisionId;
  }

  async function seedInspection(itpId: string, overrides: { sequenceNo: number }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO inspections (
        id, tenant_id, project_id, itp_id, hold_point_ref, sequence_no, status,
        requested_by, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'HP-01',$5,'REQUESTED',$6,$6,$6)`,
      [id, tenantId, projectId, itpId, overrides.sequenceNo, authorId]
    );
    return id;
  }

  async function seedNcr(overrides: {
    code: string;
    status?: string;
    rootCause?: string;
    disposition?: string;
    dispositionApprovedBy?: string;
    verifiedBy?: string;
    closureEvidence?: string[];
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO ncrs (
        id, tenant_id, project_id, package_id, code, title, description, severity, status,
        raised_by, owner_id, root_cause, disposition, disposition_approved_by, verified_by,
        verified_at, closure_evidence_refs, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'NCR fixture','Không phù hợp fixture','HIGH',$6,$7,$7,$8,$9,$10,
        $11,$12,$13::jsonb,$7,$7)`,
      [
        id, tenantId, projectId, packageId, overrides.code, overrides.status ?? 'OPEN',
        authorId, overrides.rootCause ?? null, overrides.disposition ?? null,
        overrides.dispositionApprovedBy ?? null, overrides.verifiedBy ?? null,
        overrides.verifiedBy ? new Date() : null,
        JSON.stringify(overrides.closureEvidence ?? ['minio://evidence/ncr-1'])
      ]
    );
    return id;
  }

  async function seedNcrCycle(ncrId: string, overrides: { sequenceNo: number }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO ncr_disposition_cycles (
        id, tenant_id, project_id, ncr_id, sequence_no, proposed_disposition, proposal_comment,
        proposed_by, proposed_at
      ) VALUES ($1,$2,$3,$4,$5,'REWORK','Đề xuất làm lại',$6,now())`,
      [id, tenantId, projectId, ncrId, overrides.sequenceNo, authorId]
    );
    return id;
  }

  async function seedPunch(overrides: {
    code: string;
    category: string;
    codBlocking?: boolean;
    waivable?: boolean;
    status?: string;
    waivedBy?: string;
    waivedReason?: string;
    verifiedBy?: string;
    closureEvidence?: string[];
  }): Promise<string> {
    const id = randomUUID();
    const codBlocking = overrides.codBlocking ?? (overrides.category === 'A');
    const waivable = overrides.waivable ?? (overrides.category !== 'A');
    await AppDataSource.query(
      `INSERT INTO punch_items (
        id, tenant_id, project_id, code, title, category, cod_blocking, waivable, status,
        raised_by, owner_id, waived_by, waived_reason, verified_by, verified_at,
        closure_evidence_refs, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Punch fixture',$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14::jsonb,$9,$9)`,
      [
        id, tenantId, projectId, overrides.code, overrides.category, codBlocking, waivable,
        overrides.status ?? 'OPEN', authorId, overrides.waivedBy ?? null,
        overrides.waivedReason ?? null, overrides.verifiedBy ?? null,
        overrides.verifiedBy ? new Date() : null,
        JSON.stringify(overrides.closureEvidence ?? ['minio://evidence/punch-1'])
      ]
    );
    return id;
  }

  async function seedPunchCycle(punchId: string, overrides: { sequenceNo: number }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO punch_closure_cycles (
        id, tenant_id, project_id, punch_item_id, sequence_no, request_comment,
        request_evidence_refs, requested_by, requested_at
      ) VALUES ($1,$2,$3,$4,$5,'Đã khắc phục','["minio://evidence/punch-1"]'::jsonb,$6,now())`,
      [id, tenantId, projectId, punchId, overrides.sequenceNo, authorId]
    );
    return id;
  }

  async function seedCapa(overrides: {
    ncrId?: string;
    hseIncidentId?: string;
    status?: string;
    verifiedBy?: string;
    effectiveness?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO capa_actions (
        id, tenant_id, project_id, hse_incident_id, ncr_id, title, owner_id, status,
        effectiveness_assessment, verified_by, verified_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'CAPA fixture',$6,$7,$8,$9,$10,$6,$6)`,
      [
        id, tenantId, projectId, overrides.hseIncidentId ?? null, overrides.ncrId ?? null,
        authorId, overrides.status ?? 'OPEN', overrides.effectiveness ?? null,
        overrides.verifiedBy ?? null, overrides.verifiedBy ? new Date() : null
      ]
    );
    return id;
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'fhq-mig'], [otherTenantId, 'fhq-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'fhq-mig-author@example.test'],
      [deciderId, tenantId, 'fhq-mig-decider@example.test'],
      [otherTenantUserId, otherTenantId, 'fhq-mig-other@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await seedProject(tenantId, projectId, siteId, 'FHQ-PRJ', authorId, companyId);
    await seedProject(
      otherTenantId, otherProjectId, otherSiteId, 'FHQ-PRJ-2', otherTenantUserId, randomUUID()
    );
    await AppDataSource.query(
      `INSERT INTO packages (
        id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'FHQ-PKG-A','Package A','EPC','ACTIVE',$4,$4)`,
      [packageId, tenantId, projectId, authorId]
    );
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, fixtureSiteId: string, code: string,
    managerId: string, fixtureCompanyId: string
  ): Promise<void> {
    const portfolioId = randomUUID();
    const legalId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,$3,'Company FHQ','CONTRACTOR','ACTIVE')`,
      [fixtureCompanyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal FHQ','VN',$4,'ACTIVE')`,
      [legalId, fixtureTenantId, fixtureCompanyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio FHQ','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Field HSE Project','SOLAR','EXECUTION','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, legalId, fixtureCompanyId, managerId, code]
    );
    await AppDataSource.query(
      `INSERT INTO sites (id, tenant_id, project_id, code, name, timezone, is_primary, status)
       VALUES ($1,$2,$3,'MAIN','Main site','Asia/Ho_Chi_Minh',true,'ACTIVE')`,
      [fixtureSiteId, fixtureTenantId, fixtureProjectId]
    );
  }
});
