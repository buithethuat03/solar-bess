import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateCommissioningCod1783758000000';
const grantMigrationName = 'GrantCommissioningPermissions1783759000000';
const tables = [
  'commissioning_systems', 'test_packs', 'test_runs', 'cod_gates', 'cod_gate_review_cycles',
  'cod_packages', 'handovers'
];

describe('Commissioning & COD migration — DB-073…DB-078, DB-118', () => {
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
  const ownerPartyId = randomUUID();
  const recipientPartyId = randomUUID();
  const otherProjectPartyId = randomUUID();
  const hash = 'a'.repeat(64);

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedMasterData();
  });

  /**
   * A failed expectation in the middle of a revert leaves the SHARED test database half-migrated,
   * which poisons every suite that runs afterwards. Re-running the chain here is idempotent when
   * nothing was reverted and repairs the schema when something was.
   */
  afterEach(async () => {
    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('creates every table, drops them again on down and restores them on re-up', async () => {
    expect(await regclasses()).toEqual(tables);
    // The shared hardening this slice adds for the handover foreign keys.
    expect(await constraintExists('uq_project_parties_tenant_project_id')).toBe(true);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);
    expect(await constraintExists('uq_project_parties_tenant_project_id')).toBe(false);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
    expect(await constraintExists('uq_project_parties_tenant_project_id')).toBe(true);
  });

  it('grants the codes at policy 13 and reverts symmetrically', async () => {
    const controlsId = randomUUID();
    const pmoId = randomUUID();
    const qaqcId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_CONTROLS','Project Controls',$3::jsonb,1,'ACTIVE'),
              ($4,$2,'PMO','PMO',$5::jsonb,1,'ACTIVE'),
              ($6,$2,'QAQC_MANAGER','QA/QC Manager',$7::jsonb,1,'ACTIVE')`,
      [
        controlsId, tenantId, JSON.stringify(['package.read', 'workfront.read']),
        pmoId, JSON.stringify(['project.read']),
        qaqcId, JSON.stringify(['inspection.manage'])
      ]
    );
    // Re-running the chain also applies the later O&M grant (1783761), so this pins the codes this
    // migration adds and their order rather than claiming they are the only ones on the role.
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    expect((await permissionsOf(controlsId)).slice(0, 4)).toEqual([
      'package.read', 'workfront.read', 'commissioning.read', 'cod.read'
    ]);
    expect((await permissionsOf(pmoId)).slice(0, 9)).toEqual([
      'project.read', 'commissioning.read', 'commissioningSystem.create', 'testPack.create',
      'testRun.start', 'testRun.complete', 'testRun.retest', 'cod.read', 'cod.manage'
    ]);
    // QA/QC executes the tests but never signs the COD: `cod.manage` would collapse the
    // SIGN_COD segregation of duties onto the role that recorded the results.
    const qaqc = await permissionsOf(qaqcId);
    expect(qaqc).toEqual([
      'inspection.manage', 'commissioning.read', 'testPack.create', 'testRun.start',
      'testRun.complete', 'testRun.retest', 'cod.read'
    ]);
    expect(qaqc).not.toContain('cod.manage');
    expect(qaqc).not.toContain('commissioningSystem.create');

    for (const roleId of [controlsId, pmoId, qaqcId]) {
      const [role] = await AppDataSource.query<Array<{ policyVersion: number }>>(
        'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
      );
      expect(role.policyVersion).toBeGreaterThanOrEqual(13);
    }

    await revertThroughMigration(grantMigrationName);
    expect(await permissionsOf(controlsId)).toEqual(['package.read', 'workfront.read']);
    expect(await permissionsOf(pmoId)).toEqual(['project.read']);
    expect(await permissionsOf(qaqcId)).toEqual(['inspection.manage']);
    const [reverted] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [controlsId]
    );
    expect(reverted.policyVersion).toBe(1);
    const [state] = await AppDataSource.query<Array<{ tableName: string | null }>>(
      `SELECT to_regclass('public.role_grant_reconcile_1783759000000')::text AS "tableName"`
    );
    expect(state.tableName).toBeNull();
  });

  it('keeps the system tree inside one project and refuses a self-parent', async () => {
    const parentId = await seedSystem({ code: 'SYS-PARENT' });
    await expect(seedSystem({ code: 'SYS-CHILD', parentSystemId: parentId }))
      .resolves.toBeDefined();
    await expect(seedSystem({ code: 'SYS-DUP' })).resolves.toBeDefined();
    await expect(seedSystem({ code: 'SYS-DUP' }))
      .rejects.toMatchObject({ constraint: 'uq_commissioning_system_code' });
    await expect(AppDataSource.query(
      'UPDATE commissioning_systems SET parent_system_id = id WHERE id = $1', [parentId]
    )).rejects.toMatchObject({ constraint: 'ck_commissioning_system_parent' });
    // Both composite keys the downstream slices will hang foreign keys off exist.
    expect(await constraintExists('uq_commissioning_systems_tenant_id')).toBe(true);
    expect(await constraintExists('uq_commissioning_systems_project_id')).toBe(true);
  });

  it('freezes an APPROVED test pack and admits only the supersede move', async () => {
    const systemId = await seedSystem({ code: 'SYS-PACK' });
    const revisionId = await seedProcedureRevision('PROC-A');
    const packId = await seedPack(systemId, revisionId, { code: 'TP-01' });

    await expect(AppDataSource.query(
      `UPDATE test_packs SET title = 'viết lại quy trình' WHERE id = $1`, [packId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query('DELETE FROM test_packs WHERE id = $1', [packId]))
      .rejects.toMatchObject({ code: '55000' });

    // The same code against a NEW procedure revision is a new pack, not an edit.
    const nextRevisionId = await seedProcedureRevision('PROC-B');
    await expect(seedPack(systemId, nextRevisionId, { code: 'TP-01' })).resolves.toBeDefined();
    await expect(seedPack(systemId, revisionId, { code: 'TP-01' }))
      .rejects.toMatchObject({ constraint: 'uq_test_pack_code_revision' });

    // Supersede is the one legal move, and a superseded pack is frozen history.
    await expect(AppDataSource.query(
      `UPDATE test_packs SET status = 'SUPERSEDED' WHERE id = $1`, [packId]
    )).resolves.toBeDefined();
    await expect(AppDataSource.query(
      `UPDATE test_packs SET status = 'APPROVED' WHERE id = $1`, [packId]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(seedPack(systemId, revisionId, { code: 'TP-NA', approved: false }))
      .rejects.toMatchObject({ constraint: 'ck_test_pack_approved' });
  });

  it('freezes a recorded run so a FAILED result can never become PASSED', async () => {
    const { packId } = await seedSystemWithPack('SYS-RUN', 'TP-RUN', 'PROC-RUN');
    const runId = await seedRun(packId, { runNo: 1 });

    // RECORDED structurally requires result + recorder pair + evidence.
    await expect(AppDataSource.query(
      `UPDATE test_runs SET status = 'RECORDED' WHERE id = $1`, [runId]
    )).rejects.toMatchObject({ constraint: 'ck_test_run_recorded' });
    await expect(AppDataSource.query(
      `UPDATE test_runs SET status = 'RECORDED', result = 'FAILED', recorded_by = $2,
        recorded_at = now(), evidence_refs = '[]'::jsonb WHERE id = $1`,
      [runId, deciderId]
    )).rejects.toMatchObject({ constraint: 'ck_test_run_recorded' });

    await AppDataSource.query(
      `UPDATE test_runs SET status = 'RECORDED', result = 'FAILED', recorded_by = $2,
        recorded_at = now(), ended_at = now(),
        evidence_refs = '["minio://evidence/run-1"]'::jsonb WHERE id = $1`,
      [runId, deciderId]
    );
    // THE rule of this slice: a failure is permanent.
    await expect(AppDataSource.query(
      `UPDATE test_runs SET result = 'PASSED' WHERE id = $1`, [runId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE test_runs SET evidence_refs = '[]'::jsonb WHERE id = $1`, [runId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query('DELETE FROM test_runs WHERE id = $1', [runId]))
      .rejects.toMatchObject({ code: '55000' });

    // A retest is a new row that keeps the failure visible, and it happens at most once.
    const retestId = await seedRun(packId, { runNo: 2, previousRunId: runId });
    expect(retestId).toBeDefined();
    await AppDataSource.query(
      `UPDATE test_runs SET status = 'RECORDED', result = 'PASSED', recorded_by = $2,
        recorded_at = now(), evidence_refs = '["minio://evidence/run-2"]'::jsonb WHERE id = $1`,
      [retestId, deciderId]
    );
    await expect(seedRun(packId, { runNo: 3, previousRunId: runId }))
      .rejects.toMatchObject({ constraint: 'uq_test_run_retest_once' });
    await expect(seedRun(packId, { runNo: 4, selfPrevious: true }))
      .rejects.toMatchObject({ constraint: 'ck_test_run_previous' });
  });

  it('allows only one open run per pack and no result while a run is open', async () => {
    const { packId } = await seedSystemWithPack('SYS-OPEN', 'TP-OPEN', 'PROC-OPEN');
    const openId = await seedRun(packId, { runNo: 1 });
    await expect(seedRun(packId, { runNo: 2 }))
      .rejects.toMatchObject({ constraint: 'uq_test_run_open' });
    await expect(AppDataSource.query(
      `UPDATE test_runs SET result = 'PASSED' WHERE id = $1`, [openId]
    )).rejects.toMatchObject({ constraint: 'ck_test_run_open_has_no_result' });
    await expect(seedRun(packId, { runNo: 1, forceRecorded: true }))
      .rejects.toMatchObject({ constraint: 'uq_test_run_pack_run_no' });
  });

  it('freezes a decided COD gate and refuses a waiver on a non-waivable one', async () => {
    await expect(seedGate({ code: 'G-NOWAIVE', waivable: false, status: 'WAIVED' }))
      .rejects.toMatchObject({ constraint: 'ck_cod_gate_waiver_allowed' });
    await expect(seedGate({ code: 'G-NOREASON', waivable: true, status: 'WAIVED', waiverReason: '  ' }))
      .rejects.toMatchObject({ constraint: 'ck_cod_gate_waived' });
    await expect(seedGate({ code: 'G-NOACCEPT', status: 'ACCEPTED', acceptedBy: null }))
      .rejects.toMatchObject({ constraint: 'ck_cod_gate_accepted' });

    const gateId = await seedGate({ code: 'G-ONE' });
    await expect(seedGate({ code: 'G-ONE' }))
      .rejects.toMatchObject({ constraint: 'uq_cod_gate_instance' });
    // The same code in a DIFFERENT category is a different gate instance — the recorded reading
    // of the dictionary's ambiguous "UQ gate definition instance".
    await expect(seedGate({ code: 'G-ONE', category: 'SAFETY' })).resolves.toBeDefined();

    await AppDataSource.query(
      `UPDATE cod_gates SET status = 'ACCEPTED', accepted_by = $2, accepted_at = now()
       WHERE id = $1`, [gateId, deciderId]
    );
    await expect(AppDataSource.query(
      `UPDATE cod_gates SET status = 'PENDING', accepted_by = NULL, accepted_at = NULL
       WHERE id = $1`, [gateId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query('DELETE FROM cod_gates WHERE id = $1', [gateId]))
      .rejects.toMatchObject({ code: '55000' });

    const waivedId = await seedGate({ code: 'G-WAIVE', waivable: true });
    await AppDataSource.query(
      `UPDATE cod_gates SET status = 'WAIVED', waived_by = $2, waived_at = now(),
        waiver_reason = 'Chủ đầu tư chấp nhận rủi ro tồn đọng' WHERE id = $1`,
      [waivedId, deciderId]
    );
    await expect(AppDataSource.query(
      `UPDATE cod_gates SET waiver_reason = 'viết lại' WHERE id = $1`, [waivedId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('mirrors ncr_disposition_cycles in the DB-118 review cycle table', async () => {
    const gateId = await seedGate({ code: 'G-CYCLE' });
    const cycleId = await seedCycle(gateId, { sequenceNo: 1 });
    await expect(seedCycle(gateId, { sequenceNo: 2 }))
      .rejects.toMatchObject({ constraint: 'uq_cod_gate_review_cycle_open' });
    await expect(seedCycle(gateId, { sequenceNo: 1, evidence: [] }))
      .rejects.toMatchObject({ constraint: 'ck_cod_gate_review_cycle_evidence' });

    // The submitter can never review their own evidence.
    await expect(AppDataSource.query(
      `UPDATE cod_gate_review_cycles SET decision = 'PASS', decision_comment = 'tự duyệt',
        decided_by = $2, decided_at = now() WHERE id = $1`, [cycleId, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_cod_gate_review_cycle_sod' });
    await expect(AppDataSource.query(
      `UPDATE cod_gate_review_cycles SET decision = 'MAYBE', decision_comment = 'không rõ',
        decided_by = $2, decided_at = now() WHERE id = $1`, [cycleId, deciderId]
    )).rejects.toMatchObject({ constraint: 'ck_cod_gate_review_cycle_decision' });

    await AppDataSource.query(
      `UPDATE cod_gate_review_cycles SET decision = 'FAIL', decision_comment = 'thiếu hồ sơ',
        decided_by = $2, decided_at = now() WHERE id = $1`, [cycleId, deciderId]
    );
    await expect(AppDataSource.query(
      `UPDATE cod_gate_review_cycles SET decision_comment = 'viết lại' WHERE id = $1`, [cycleId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM cod_gate_review_cycles WHERE id = $1', [cycleId]
    )).rejects.toMatchObject({ code: '55000' });

    // The next round opens only after the previous one is decided.
    await expect(seedCycle(gateId, { sequenceNo: 2 })).resolves.toBeDefined();
    await expect(seedCycle(gateId, { sequenceNo: 2 }))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('keeps one in-flight COD package per project and freezes the signed one', async () => {
    await expect(seedCodPackage({ version: 1, status: 'SUBMITTED', signedBy: authorId }))
      .rejects.toMatchObject({ constraint: 'ck_cod_package_sod' });
    await expect(seedCodPackage({ version: 1, status: 'SIGNED', signedBy: null }))
      .rejects.toMatchObject({ constraint: 'ck_cod_package_signed' });
    await expect(seedCodPackage({ version: 1, snapshotHash: 'not-a-hash' }))
      .rejects.toMatchObject({ constraint: 'ck_cod_package_snapshot_hash' });

    const submittedId = await seedCodPackage({ version: 1, status: 'SUBMITTED' });
    await expect(seedCodPackage({ version: 2, status: 'SUBMITTED' }))
      .rejects.toMatchObject({ constraint: 'uq_cod_package_active' });

    await AppDataSource.query(
      `UPDATE cod_packages SET status = 'SIGNED', signed_by = $2, signed_at = now(),
        signer_snapshot = $3::jsonb, version_no = version_no + 1 WHERE id = $1`,
      [submittedId, deciderId, JSON.stringify({ userId: deciderId, snapshotHash: hash })]
    );
    // A signed package frees the in-flight slot for the next version.
    await expect(seedCodPackage({ version: 2, status: 'SUBMITTED' })).resolves.toBeDefined();

    await expect(AppDataSource.query(
      `UPDATE cod_packages SET snapshot_hash = $2 WHERE id = $1`, [submittedId, 'b'.repeat(64)]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query('DELETE FROM cod_packages WHERE id = $1', [submittedId]))
      .rejects.toMatchObject({ code: '55000' });
    await AppDataSource.query(
      'UPDATE cod_packages SET legal_hold = true WHERE id = $1', [submittedId]
    );
    await expect(AppDataSource.query(
      'UPDATE cod_packages SET legal_hold = false WHERE id = $1', [submittedId]
    )).rejects.toMatchObject({ code: '55000' });

    // The handover is the one move a signed package still admits.
    await expect(AppDataSource.query(
      `UPDATE cod_packages SET status = 'HANDED_OVER', version_no = version_no + 1
       WHERE id = $1`, [submittedId]
    )).resolves.toBeDefined();
    await expect(AppDataSource.query(
      `UPDATE cod_packages SET status = 'SIGNED' WHERE id = $1`, [submittedId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('freezes an accepted handover and keys it by package + recipient', async () => {
    const packageId = await seedCodPackage({ version: 1, status: 'SIGNED', signedBy: deciderId });
    await expect(seedHandover(packageId, { recipient: ownerPartyId, from: ownerPartyId }))
      .rejects.toMatchObject({ constraint: 'ck_handover_parties' });

    const handoverId = await seedHandover(packageId, {});
    // Recorded resolution of the dictionary/ERD contradiction: the key is package + recipient, so
    // a second recipient of the SAME package is admitted and a duplicate recipient is not.
    await expect(seedHandover(packageId, { recipient: ownerPartyId, from: recipientPartyId }))
      .resolves.toBeDefined();
    await expect(seedHandover(packageId, {}))
      .rejects.toMatchObject({ constraint: 'uq_handover_package_recipient' });

    await AppDataSource.query(
      `UPDATE handovers SET accepted_by = $2, accepted_at = now(),
        version_no = version_no + 1 WHERE id = $1`, [handoverId, deciderId]
    );
    await expect(AppDataSource.query(
      `UPDATE handovers SET open_items = '[]'::jsonb WHERE id = $1`, [handoverId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query('DELETE FROM handovers WHERE id = $1', [handoverId]))
      .rejects.toMatchObject({ code: '55000' });
  });

  it('cannot reference a project, revision, party or user from another tenant', async () => {
    await expect(AppDataSource.query(
      `INSERT INTO commissioning_systems (
        id, tenant_id, project_id, code, name, system_type, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'SYS-X','Cross tenant','MV','NOT_READY',$4,$4)`,
      [randomUUID(), tenantId, otherProjectId, authorId]
    )).rejects.toMatchObject({ code: '23503' });

    const systemId = await seedSystem({ code: 'SYS-XT' });
    await expect(AppDataSource.query(
      `INSERT INTO test_packs (
        id, tenant_id, project_id, commissioning_system_id, code, title,
        procedure_revision_id, status, approved_by, approved_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'TP-XT','Cross tenant',$5,'APPROVED',$6,now(),$6,$6)`,
      [randomUUID(), tenantId, projectId, systemId, randomUUID(), authorId]
    )).rejects.toMatchObject({ code: '23503' });

    const codPackageId = await seedCodPackage({
      version: 1, status: 'SIGNED', signedBy: deciderId
    });
    await expect(AppDataSource.query(
      `INSERT INTO handovers (
        id, tenant_id, project_id, cod_package_id, from_party_id, recipient_party_id,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [
        randomUUID(), tenantId, projectId, codPackageId, ownerPartyId, otherProjectPartyId,
        authorId
      ]
    )).rejects.toMatchObject({ code: '23503' });

    await expect(AppDataSource.query(
      `INSERT INTO cod_gates (
        id, tenant_id, project_id, category, code, title, mandatory, waivable, owner_id,
        status, created_by, updated_by
      ) VALUES ($1,$2,$3,'LEGAL','G-XT','Cross tenant',true,false,$4,'PENDING',$5,$5)`,
      [randomUUID(), tenantId, projectId, otherTenantUserId, authorId]
    )).rejects.toMatchObject({ code: '23503' });
  });

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function constraintExists(name: string): Promise<boolean> {
    const [row] = await AppDataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM pg_constraint WHERE conname = $1', [name]
    );
    return row.count !== '0';
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      `SELECT ${tables.map((table) => `to_regclass('public.${table}')::text AS "${table}"`).join(', ')}`
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function seedSystem(overrides: {
    code: string;
    parentSystemId?: string;
    status?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO commissioning_systems (
        id, tenant_id, project_id, parent_system_id, code, name, system_type, status,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'System fixture','MV_SWITCHGEAR',$6,$7,$7)`,
      [
        id, tenantId, projectId, overrides.parentSystemId ?? null, overrides.code,
        overrides.status ?? 'NOT_READY', authorId
      ]
    );
    return id;
  }

  async function seedProcedureRevision(code: string): Promise<string> {
    const documentId = randomUUID();
    const revisionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, package_id, document_code, title, discipline, type,
        classification, owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Quy trình thử nghiệm','ELE','PROCEDURE','INTERNAL',$6,'ACTIVE',$6,$6)`,
      [documentId, tenantId, projectId, packageId, `DOC-${code}`, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, released_object_key, content_hash, scan_status, lock_state,
        approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'ISSUED','FOR_CONSTRUCTION','proc.pdf','application/pdf',
        $5,$6,'CLEAN','LOCKED',$7,now(),$7,now(),$7)`,
      [revisionId, tenantId, documentId, projectId, `released/${code}.pdf`, hash, authorId]
    );
    return revisionId;
  }

  async function seedPack(
    systemId: string, revisionId: string,
    overrides: { code: string; approved?: boolean }
  ): Promise<string> {
    const id = randomUUID();
    const approved = overrides.approved ?? true;
    await AppDataSource.query(
      `INSERT INTO test_packs (
        id, tenant_id, project_id, commissioning_system_id, code, title,
        procedure_revision_id, prerequisites_snapshot, status, approved_by, approved_at,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Test pack fixture',$6,'{"required":["LOTO"]}'::jsonb,
        'APPROVED',$7,$8,$9,$9)`,
      [
        id, tenantId, projectId, systemId, overrides.code, revisionId,
        approved ? authorId : null, approved ? new Date() : null, authorId
      ]
    );
    return id;
  }

  async function seedSystemWithPack(
    systemCode: string, packCode: string, procedureCode: string
  ): Promise<{ systemId: string; packId: string }> {
    const systemId = await seedSystem({ code: systemCode });
    const revisionId = await seedProcedureRevision(procedureCode);
    const packId = await seedPack(systemId, revisionId, { code: packCode });
    return { systemId, packId };
  }

  async function seedRun(packId: string, overrides: {
    runNo: number;
    previousRunId?: string;
    selfPrevious?: boolean;
    forceRecorded?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO test_runs (
        id, tenant_id, project_id, test_pack_id, previous_run_id, run_no, status, result,
        evidence_refs, started_at, ended_at, started_by, recorded_by, recorded_at,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now(),
        CASE WHEN $10::boolean THEN now() ELSE NULL END,
        $11,$12,
        CASE WHEN $10::boolean THEN now() ELSE NULL END,
        $11,$11)`,
      [
        id, tenantId, projectId, packId,
        overrides.selfPrevious ? id : (overrides.previousRunId ?? null),
        overrides.runNo, overrides.forceRecorded ? 'RECORDED' : 'IN_PROGRESS',
        overrides.forceRecorded ? 'PASSED' : null,
        JSON.stringify(overrides.forceRecorded ? ['minio://evidence/x'] : []),
        // Both timestamps must come from the same clock: a JS Date is taken before the statement
        // runs, so `ended_at` would land before Postgres evaluates `now()` for `started_at` and
        // `ck_test_run_window` would fire instead of the constraint under test.
        overrides.forceRecorded === true, authorId,
        overrides.forceRecorded ? deciderId : null
      ]
    );
    return id;
  }

  async function seedGate(overrides: {
    code: string;
    category?: string;
    waivable?: boolean;
    status?: string;
    waiverReason?: string;
    acceptedBy?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    const status = overrides.status ?? 'PENDING';
    const waived = status === 'WAIVED';
    const accepted = status === 'ACCEPTED' && overrides.acceptedBy !== null;
    await AppDataSource.query(
      `INSERT INTO cod_gates (
        id, tenant_id, project_id, category, code, title, mandatory, waivable, owner_id,
        status, evidence_refs, evidence_expiry, accepted_by, accepted_at,
        waived_by, waived_at, waiver_reason, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Điều kiện COD fixture',true,$6,$7,$8,'[]'::jsonb,NULL,
        $9,$10,$11,$12,$13,$7,$7)`,
      [
        id, tenantId, projectId, overrides.category ?? 'LEGAL', overrides.code,
        overrides.waivable ?? false, authorId, status,
        accepted ? deciderId : null, accepted ? new Date() : null,
        waived ? deciderId : null, waived ? new Date() : null,
        waived ? (overrides.waiverReason ?? 'Chấp nhận rủi ro tồn đọng') : null
      ]
    );
    return id;
  }

  async function seedCycle(gateId: string, overrides: {
    sequenceNo: number;
    evidence?: string[];
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO cod_gate_review_cycles (
        id, tenant_id, project_id, cod_gate_id, sequence_no, evidence_refs, evidence_expiry,
        submission_comment, submitted_by, submitted_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,NULL,'Đã nộp hồ sơ pháp lý',$7,now())`,
      [
        id, tenantId, projectId, gateId, overrides.sequenceNo,
        JSON.stringify(overrides.evidence ?? ['minio://evidence/gate-1']), authorId
      ]
    );
    return id;
  }

  async function seedCodPackage(overrides: {
    version: number;
    status?: string;
    signedBy?: string | null;
    snapshotHash?: string;
  }): Promise<string> {
    const id = randomUUID();
    const status = overrides.status ?? 'SUBMITTED';
    const signedBy = overrides.signedBy === undefined
      ? (status === 'SIGNED' || status === 'HANDED_OVER' ? deciderId : null)
      : overrides.signedBy;
    await AppDataSource.query(
      `INSERT INTO cod_packages (
        id, tenant_id, project_id, version, status, readiness_snapshot, snapshot_hash,
        submitted_by, submitted_at, signed_by, signed_at, signer_snapshot,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'{"blocked":false}'::jsonb,$6,$7,now(),$8,$9,$10::jsonb,$7,$7)`,
      [
        id, tenantId, projectId, overrides.version, status,
        overrides.snapshotHash ?? hash, authorId,
        signedBy, signedBy ? new Date() : null,
        signedBy ? JSON.stringify({ userId: signedBy, snapshotHash: hash }) : null
      ]
    );
    return id;
  }

  async function seedHandover(codPackageId: string, overrides: {
    recipient?: string;
    from?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO handovers (
        id, tenant_id, project_id, cod_package_id, from_party_id, recipient_party_id,
        item_manifest, open_items, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'[]'::jsonb,'[{"ref":"PN-002"}]'::jsonb,$7,$7)`,
      [
        id, tenantId, projectId, codPackageId, overrides.from ?? ownerPartyId,
        overrides.recipient ?? recipientPartyId, authorId
      ]
    );
    return id;
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'cod-mig'], [otherTenantId, 'cod-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'cod-mig-author@example.test'],
      [deciderId, tenantId, 'cod-mig-decider@example.test'],
      [otherTenantUserId, otherTenantId, 'cod-mig-other@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await seedProject(tenantId, projectId, siteId, 'COD-PRJ', authorId, companyId);
    await seedProject(
      otherTenantId, otherProjectId, otherSiteId, 'COD-PRJ-2', otherTenantUserId, randomUUID()
    );
    await AppDataSource.query(
      `INSERT INTO packages (
        id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'COD-PKG-A','Package A','EPC','ACTIVE',$4,$4)`,
      [packageId, tenantId, projectId, authorId]
    );
    for (const [id, role] of [
      [ownerPartyId, 'EPC'], [recipientPartyId, 'OWNER']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO project_parties (
          id, tenant_id, project_id, company_id, role_code, raci, effective_from
        ) VALUES ($1,$2,$3,$4,$5,'ACCOUNTABLE','2026-01-01')`,
        [id, tenantId, projectId, companyId, role]
      );
    }
    const [otherCompany] = await AppDataSource.query<Array<{ id: string }>>(
      'SELECT id FROM companies WHERE tenant_id = $1 LIMIT 1', [otherTenantId]
    );
    await AppDataSource.query(
      `INSERT INTO project_parties (
        id, tenant_id, project_id, company_id, role_code, raci, effective_from
      ) VALUES ($1,$2,$3,$4,'OWNER','ACCOUNTABLE','2026-01-01')`,
      [otherProjectPartyId, otherTenantId, otherProjectId, otherCompany.id]
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
       VALUES ($1,$2,$3,'Company COD','CONTRACTOR','ACTIVE')`,
      [fixtureCompanyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (
        id, tenant_id, company_id, legal_name, country, registration_no, status
      ) VALUES ($1,$2,$3,'Legal COD','VN',$4,'ACTIVE')`,
      [legalId, fixtureTenantId, fixtureCompanyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio COD','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Commissioning Project','SOLAR','EXECUTION','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, legalId, fixtureCompanyId, managerId, code]
    );
    await AppDataSource.query(
      `INSERT INTO sites (id, tenant_id, project_id, code, name, timezone, is_primary, status)
       VALUES ($1,$2,$3,'MAIN','Main site','Asia/Ho_Chi_Minh',true,'ACTIVE')`,
      [fixtureSiteId, fixtureTenantId, fixtureProjectId]
    );
  }
});
