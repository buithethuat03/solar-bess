import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateOpportunity1783752000000';
const grantMigrationName = 'GrantOpportunityPermissions1783753000000';
const tables = ['opportunities', 'survey_packages', 'investment_scenarios'];
const RULES_HASH = 'a'.repeat(64);

/**
 * DB-014/DB-015/DB-016 plus the two recorded amendments: the DB-010 projects column
 * (source_opportunity_id + partial unique — the convert idempotency anchor) and the widened DB-071
 * `ck_workflow_instance_object_type`. TEST-025 family (US-025).
 */
describe('Opportunity migration — DB-014…DB-016, DB-010/DB-071 amendments', () => {
  const tenantId = randomUUID();
  const authorId = randomUUID();
  const portfolioId = randomUUID();
  const companyId = randomUUID();
  const legalEntityId = randomUUID();
  const projectId = randomUUID();

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

  it('creates the tables, round-trips the projects ALTER and the workflow CHECK on down/up', async () => {
    expect(await regclasses()).toEqual(tables);
    expect(await projectsHasSourceColumn()).toBe(true);
    expect(await indexExists('uq_project_source_opportunity')).toBe(true);
    expect(await indexExists('uq_opportunity_duplicate_key')).toBe(true);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);
    // The DB-010 amendment is fully unwound…
    expect(await projectsHasSourceColumn()).toBe(false);
    expect(await indexExists('uq_project_source_opportunity')).toBe(false);
    // …and the DB-071 vocabulary is back to exactly what CreateWorkflowEngine wrote.
    await expect(seedWorkflowInstance('InvestmentScenario'))
      .rejects.toMatchObject({ code: '23514', constraint: 'ck_workflow_instance_object_type' });

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
    expect(await projectsHasSourceColumn()).toBe(true);
    expect(await indexExists('uq_project_source_opportunity')).toBe(true);
  });

  it('widens the workflow instance object-type CHECK to InvestmentScenario and nothing else', async () => {
    await expect(seedWorkflowInstance('InvestmentScenario')).resolves.toBeDefined();
    await expect(seedWorkflowInstance('ChangeRequest')).resolves.toBeDefined();
    await expect(seedWorkflowInstance('SomethingElse'))
      .rejects.toMatchObject({ code: '23514', constraint: 'ck_workflow_instance_object_type' });
  });

  it('grants the opportunity permissions at policy 12 and takes back exactly what it added', async () => {
    const roleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_MANAGER','Project Manager',$3::jsonb,1,'ACTIVE')`,
      [roleId, tenantId, JSON.stringify(['project.read', 'scenario.create'])]
    );
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    const granted = await permissionsOf(roleId);
    expect(granted).toEqual(expect.arrayContaining([
      'opportunity.read', 'survey.create', 'scenario.create', 'scenario.submit'
    ]));
    // PROJECT_MANAGER never gets the PMO-only pipeline codes.
    expect(granted).not.toContain('opportunity.create');
    expect(granted).not.toContain('opportunity.update');
    expect(granted).not.toContain('opportunity.convert');
    const [role] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
    );
    // Floor, not equality: the full migration chain runs later grant slices that raise the same
    // role's policy version, so an exact match would break every time a slice lands.
    expect(role.policyVersion).toBeGreaterThanOrEqual(12);

    await revertThroughMigration(grantMigrationName);
    const reverted = await permissionsOf(roleId);
    // The pre-existing `scenario.create` was not added by this migration, so it must survive.
    expect(reverted).toEqual(['project.read', 'scenario.create']);
    const [state] = await AppDataSource.query<Array<{ tableName: string | null }>>(
      `SELECT to_regclass('public.role_grant_reconcile_1783753000000')::text AS "tableName"`
    );
    expect(state.tableName).toBeNull();

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('enforces the opportunity duplicate identity and stage/convert integrity', async () => {
    const duplicateKey = 'b'.repeat(64);
    await seedOpportunity({ code: 'OPP-001', duplicateKey });
    // NULL duplicate keys never collide (partial index).
    await seedOpportunity({ code: 'OPP-002' });
    await seedOpportunity({ code: 'OPP-003' });
    await expect(seedOpportunity({ code: 'OPP-004', duplicateKey }))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_opportunity_duplicate_key' });
    await expect(seedOpportunity({ code: 'OPP-001' }))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_opportunity_code' });
    // Malformed duplicate key (server computes sha256 hex) is refused structurally.
    await expect(seedOpportunity({ code: 'OPP-005', duplicateKey: 'not-a-hash' }))
      .rejects.toMatchObject({ code: '23514', constraint: 'ck_opportunity_duplicate_key_format' });
    // CONVERTED and the project pointer only exist together.
    await expect(seedOpportunity({ code: 'OPP-006', stage: 'CONVERTED' }))
      .rejects.toMatchObject({ code: '23514', constraint: 'ck_opportunity_converted_pair' });
    const opportunityId = await seedOpportunity({ code: 'OPP-007' });
    await expect(AppDataSource.query(
      `UPDATE opportunities SET stage = 'PIPELINE' WHERE id = $1`, [opportunityId]
    )).rejects.toMatchObject({ code: '23514', constraint: 'ck_opportunity_stage' });
  });

  it('anchors one project per opportunity in the DB-010 partial unique', async () => {
    const opportunityId = await seedOpportunity({ code: 'OPP-CONVERT' });
    await seedProject(randomUUID(), 'PRJ-FROM-OPP-1', opportunityId);
    await expect(seedProject(randomUUID(), 'PRJ-FROM-OPP-2', opportunityId))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_project_source_opportunity' });
    // Projects without a source opportunity stay unconstrained.
    await seedProject(randomUUID(), 'PRJ-PLAIN-1', null);
    await seedProject(randomUUID(), 'PRJ-PLAIN-2', null);
  });

  it('keeps APPROVED survey packages immutable and revisions unique', async () => {
    const opportunityId = await seedOpportunity({ code: 'OPP-SURVEY' });
    const rawId = await seedSurveyPackage(opportunityId, 1, 'RAW');
    await expect(AppDataSource.query(
      `UPDATE survey_packages SET notes = 'chỉnh sửa' WHERE id = $1`, [rawId]
    )).resolves.toBeDefined();

    const approvedId = await seedSurveyPackage(opportunityId, 2, 'APPROVED');
    await expect(AppDataSource.query(
      `UPDATE survey_packages SET notes = 'viết lại' WHERE id = $1`, [approvedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM survey_packages WHERE id = $1', [approvedId]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(seedSurveyPackage(opportunityId, 2, 'RAW'))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_survey_package_revision' });
  });

  it('keeps APPROVED scenarios immutable and submission integrity structural', async () => {
    const opportunityId = await seedOpportunity({ code: 'OPP-SCENARIO' });
    // Any state beyond DRAFT without the submitted pair is structurally impossible.
    await expect(seedScenario(opportunityId, { version: 1, status: 'SUBMITTED' }))
      .rejects.toMatchObject({
        code: '23514', constraint: 'ck_investment_scenario_submitted_status'
      });

    const draftId = await seedScenario(opportunityId, { version: 1 });
    await expect(AppDataSource.query(
      `UPDATE investment_scenarios SET npv = 42 WHERE id = $1`, [draftId]
    )).resolves.toBeDefined();

    const approvedId = await seedScenario(opportunityId, {
      version: 2, status: 'APPROVED', submittedBy: authorId
    });
    await expect(AppDataSource.query(
      `UPDATE investment_scenarios SET npv = 1 WHERE id = $1`, [approvedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM investment_scenarios WHERE id = $1', [approvedId]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(seedScenario(opportunityId, { version: 2 }))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_investment_scenario_version' });
  });

  async function regclasses(): Promise<string[]> {
    const rows = await AppDataSource.query<Array<{ name: string | null }>>(
      `SELECT to_regclass('public.' || table_name)::text AS name
       FROM (SELECT unnest($1::text[]) AS table_name) candidates`,
      [tables]
    );
    return rows.map((row) => row.name).filter((name): name is string => name !== null);
  }

  async function projectsHasSourceColumn(): Promise<boolean> {
    const [row] = await AppDataSource.query<Array<{ present: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects'
          AND column_name = 'source_opportunity_id'
      ) AS "present"`
    );
    return row.present;
  }

  async function indexExists(name: string): Promise<boolean> {
    const [row] = await AppDataSource.query<Array<{ present: boolean }>>(
      `SELECT to_regclass('public.' || $1) IS NOT NULL AS "present"`, [name]
    );
    return row.present;
  }

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function seedMasterData(): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES ($1,'opp-mig','Opportunity Tenant','ACTIVE')`,
      [tenantId]
    );
    await AppDataSource.query(
      `INSERT INTO user_accounts (id, tenant_id, email, normalized_email, display_name, status)
       VALUES ($1,$2,'opp-mig@example.test','opp-mig@example.test','Opportunity Author','ACTIVE')`,
      [authorId, tenantId]
    );
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,'OPP-CO','Opportunity Company','CUSTOMER','ACTIVE')`,
      [companyId, tenantId]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Opportunity Legal','VN','REG-OPP-MIG','ACTIVE')`,
      [legalEntityId, tenantId, companyId]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,'OPP-PORT','Opportunity Portfolio','ACTIVE')`,
      [portfolioId, tenantId]
    );
    await seedProject(projectId, 'OPP-PRJ', null);
  }

  async function seedProject(
    id: string, code: string, sourceOpportunityId: string | null
  ): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id, code, name,
        type, phase, record_status, contract_model, currency, planned_cod, source_opportunity_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$6,'SOLAR','INITIATION','DRAFT','EPC','VND','2027-12-31',$7)`,
      [id, tenantId, portfolioId, legalEntityId, companyId, code, sourceOpportunityId]
    );
  }

  async function seedOpportunity(overrides: {
    code: string; stage?: string; duplicateKey?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO opportunities (
        id, tenant_id, code, customer_company_id, name, stage, location_text,
        expected_capacity_kwp, duplicate_key, owner_id, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Cơ hội điện mặt trời',$5,'Khu CN Long Thành',1250.5,$6,$7,$7,$7)`,
      [
        id, tenantId, overrides.code, companyId, overrides.stage ?? 'LEAD',
        overrides.duplicateKey ?? null, authorId
      ]
    );
    return id;
  }

  async function seedSurveyPackage(
    opportunityId: string, revision: number, dataQuality: string
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO survey_packages (
        id, tenant_id, opportunity_id, revision, data_quality, document_refs, notes,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'["minio://survey/1"]'::jsonb,'Ghi chú khảo sát',$6,$6)`,
      [id, tenantId, opportunityId, revision, dataQuality, authorId]
    );
    return id;
  }

  async function seedScenario(opportunityId: string, overrides: {
    version: number; status?: string; submittedBy?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO investment_scenarios (
        id, tenant_id, opportunity_id, scenario_type, version, status, currency, capex_total,
        npv, irr, payback_months, input_snapshot, output_snapshot, formula_version,
        submitted_by, submitted_at, created_by, updated_by
      ) VALUES ($1,$2,$3,'SOLAR',$4,$5,'VND',1000000.5,25000.25,0.1234,96,
        '{"tariff":"demo"}'::jsonb,'{}'::jsonb,'client-v1',$6,
        CASE WHEN $6::uuid IS NULL THEN NULL ELSE now() END,$7,$7)`,
      [
        id, tenantId, opportunityId, overrides.version, overrides.status ?? 'DRAFT',
        overrides.submittedBy ?? null, authorId
      ]
    );
    return id;
  }

  async function seedWorkflowInstance(objectType: string): Promise<string> {
    const definitionId = randomUUID();
    const versionId = randomUUID();
    const instanceId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_definitions (
        id, tenant_id, code, name, object_type, process_owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'Demo route','ChangeRequest',$4,'ACTIVE',$4,$4)`,
      [definitionId, tenantId, `WF-${instanceId.slice(0, 8).toUpperCase()}`, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO workflow_versions (
        id, tenant_id, workflow_definition_id, version, status, routing_rules, rules_hash, created_by
      ) VALUES ($1,$2,$3,1,'DRAFT','{"steps":[]}'::jsonb,$4,$5)`,
      [versionId, tenantId, definitionId, RULES_HASH, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO workflow_instances (
        id, tenant_id, workflow_definition_id, workflow_version_id, object_type, object_id,
        object_version, project_id, state, current_step_key, route_snapshot, route_hash,
        requested_by
      ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,'SUBMITTED','step-1','{"steps":[]}'::jsonb,$8,$9)`,
      [
        instanceId, tenantId, definitionId, versionId, objectType, randomUUID(),
        projectId, RULES_HASH, authorId
      ]
    );
    return instanceId;
  }
});
