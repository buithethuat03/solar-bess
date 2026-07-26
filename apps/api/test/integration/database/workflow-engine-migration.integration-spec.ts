import { createHash, randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(90_000);

const migrationName = 'CreateWorkflowEngine1783738000000';
const tables = ['workflow_definitions', 'workflow_versions', 'workflow_instances', 'approval_decisions'];

const rules = {
  version: 1,
  steps: [{
    key: 'REVIEW', order: 1, rule: 'ALL',
    approverSelector: { roleCodes: ['PMO'], scope: 'PROJECT' },
    fallbackRoleCodes: ['TENANT_ADMIN']
  }],
  conditions: []
};

describe('Workflow engine migration — DB-069…DB-072', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const authorId = randomUUID();
  const publisherId = randomUUID();
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

  it('creates every table and drops them again on down, then restores on re-up', async () => {
    const present = await regclasses();
    expect(present).toEqual(tables);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
  });

  it('allows only one PUBLISHED version per definition', async () => {
    const definitionId = await seedDefinition();
    await seedVersion(definitionId, 1, 'PUBLISHED');
    await expect(seedVersion(definitionId, 2, 'PUBLISHED'))
      .rejects.toMatchObject({ code: '23505' });
    // A superseded one alongside the published one is fine.
    await expect(seedVersion(definitionId, 3, 'SUPERSEDED')).resolves.toBeDefined();
  });

  it('refuses a version published by its own author', async () => {
    const definitionId = await seedDefinition();
    await expect(AppDataSource.query(
      `INSERT INTO workflow_versions (
        id, tenant_id, workflow_definition_id, version, status, routing_rules,
        rules_hash, created_by, published_by, published_at
      ) VALUES ($1,$2,$3,1,'PUBLISHED',$4::jsonb,$5,$6,$6,now())`,
      [randomUUID(), tenantId, definitionId, JSON.stringify(rules), hashOf(rules), authorId]
    )).rejects.toMatchObject({ constraint: 'ck_workflow_version_maker_checker' });
  });

  it('refuses to rewrite the rules of a published version', async () => {
    const definitionId = await seedDefinition();
    const versionId = await seedVersion(definitionId, 1, 'PUBLISHED');
    await expect(AppDataSource.query(
      `UPDATE workflow_versions SET routing_rules = '{"version":1,"steps":[],"conditions":[]}'::jsonb
       WHERE id = $1`, [versionId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('allows only one live instance per target object', async () => {
    const definitionId = await seedDefinition();
    const versionId = await seedVersion(definitionId, 1, 'PUBLISHED');
    const objectId = randomUUID();
    await seedInstance(definitionId, versionId, objectId, 'SUBMITTED');
    await expect(seedInstance(definitionId, versionId, objectId, 'IN_REVIEW'))
      .rejects.toMatchObject({ code: '23505' });

    // Once the first instance reaches a terminal state the object may enter a new journey.
    await AppDataSource.query(
      `UPDATE workflow_instances SET state = 'CANCELLED', current_step_key = NULL,
        closed_by = $1, closed_at = now() WHERE tenant_id = $2 AND object_id = $3`,
      [publisherId, tenantId, objectId]
    );
    await expect(seedInstance(definitionId, versionId, objectId, 'SUBMITTED')).resolves.toBeDefined();
  });

  it('keeps terminal state and closure facts consistent', async () => {
    const definitionId = await seedDefinition();
    const versionId = await seedVersion(definitionId, 1, 'PUBLISHED');
    // APPROVED without closure facts must be impossible.
    await expect(seedInstance(definitionId, versionId, randomUUID(), 'APPROVED'))
      .rejects.toMatchObject({ constraint: 'ck_workflow_instance_closure_pair' });
  });

  it('makes the decision ledger append-only and unique per actor, step and attempt', async () => {
    const definitionId = await seedDefinition();
    const versionId = await seedVersion(definitionId, 1, 'PUBLISHED');
    const instanceId = await seedInstance(definitionId, versionId, randomUUID(), 'IN_REVIEW');

    await seedDecision(instanceId, 1, 'REVIEW', 1, publisherId);
    await expect(seedDecision(instanceId, 2, 'REVIEW', 1, publisherId))
      .rejects.toMatchObject({ code: '23505' });
    // A new attempt after a RETURN legitimately lets the same actor decide again.
    await expect(seedDecision(instanceId, 2, 'REVIEW', 2, publisherId)).resolves.toBeDefined();
    // Sequence numbers are unique per instance.
    await expect(seedDecision(instanceId, 2, 'ENDORSE', 1, publisherId))
      .rejects.toMatchObject({ code: '23505' });

    await expect(AppDataSource.query(
      `UPDATE approval_decisions SET comment = 'đổi ý' WHERE tenant_id = $1`, [tenantId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM approval_decisions WHERE tenant_id = $1', [tenantId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('requires a justification on every decision', async () => {
    const definitionId = await seedDefinition();
    const versionId = await seedVersion(definitionId, 1, 'PUBLISHED');
    const instanceId = await seedInstance(definitionId, versionId, randomUUID(), 'IN_REVIEW');
    await expect(AppDataSource.query(
      `INSERT INTO approval_decisions (
        id, tenant_id, workflow_instance_id, sequence_no, step_key, attempt_no,
        decision, actor_id, effective_actor_id, comment, decided_at, correlation_id
      ) VALUES ($1,$2,$3,1,'REVIEW',1,'APPROVE',$4,$4,'  ',now(),$5)`,
      [randomUUID(), tenantId, instanceId, publisherId, randomUUID()]
    )).rejects.toMatchObject({ constraint: 'ck_approval_decision_comment' });
  });

  it('cannot reference a definition from another tenant', async () => {
    const definitionId = await seedDefinition();
    await expect(AppDataSource.query(
      `INSERT INTO workflow_versions (
        id, tenant_id, workflow_definition_id, version, status, routing_rules,
        rules_hash, created_by
      ) VALUES ($1,$2,$3,1,'DRAFT',$4::jsonb,$5,$6)`,
      [randomUUID(), otherTenantId, definitionId, JSON.stringify(rules), hashOf(rules), authorId]
    )).rejects.toMatchObject({ code: '23503' });
  });

  function hashOf(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      tables.map((table) => `to_regclass('public.${table}')::text AS ${table}`).join(', ')
        .replace(/^/, 'SELECT ')
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function seedDefinition(): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_definitions (
        id, tenant_id, code, name, object_type, process_owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,'WF-A','Change approval','ChangeRequest',$3,'ACTIVE',$3,$3)`,
      [id, tenantId, authorId]
    );
    return id;
  }

  async function seedVersion(definitionId: string, version: number, status: string): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_versions (
        id, tenant_id, workflow_definition_id, version, status, routing_rules,
        rules_hash, created_by, published_by, published_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
      [
        id, tenantId, definitionId, version, status, JSON.stringify(rules), hashOf(rules),
        authorId,
        status === 'DRAFT' ? null : publisherId,
        status === 'DRAFT' ? null : new Date()
      ]
    );
    return id;
  }

  async function seedInstance(
    definitionId: string, versionId: string, objectId: string, state: string
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_instances (
        id, tenant_id, workflow_definition_id, workflow_version_id, object_type, object_id,
        object_version, project_id, package_id, state, current_step_key, route_snapshot,
        route_hash, requested_by
      ) VALUES ($1,$2,$3,$4,'ChangeRequest',$5,1,$6,NULL,$7,'REVIEW',$8::jsonb,$9,$10)`,
      [id, tenantId, definitionId, versionId, objectId, projectId, state,
        JSON.stringify(rules), hashOf(rules), authorId]
    );
    return id;
  }

  async function seedDecision(
    instanceId: string, sequenceNo: number, stepKey: string, attemptNo: number, actorId: string
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO approval_decisions (
        id, tenant_id, workflow_instance_id, sequence_no, step_key, attempt_no,
        decision, actor_id, effective_actor_id, comment, decided_at, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,'APPROVE',$7,$7,'Đồng ý phê duyệt',now(),$8)`,
      [id, tenantId, instanceId, sequenceNo, stepKey, attemptNo, actorId, randomUUID()]
    );
    return id;
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'wf-mig'], [otherTenantId, 'wf-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'wf-mig-author@example.test'],
      [publisherId, tenantId, 'wf-mig-publisher@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    const companyId = randomUUID();
    const legalId = randomUUID();
    const portfolioId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,'COMP-WF','Company WF','INTERNAL','ACTIVE')`, [companyId, tenantId]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal WF','VN','REG-WF','ACTIVE')`, [legalId, tenantId, companyId]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,'PORT-WF','Portfolio WF','ACTIVE')`, [portfolioId, tenantId]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,'WF-PRJ','Workflow Project','SOLAR','PLANNING','ACTIVE','EPC','VND','2027-12-31')`,
      [projectId, tenantId, portfolioId, legalId, companyId, authorId]
    );
  }
});
