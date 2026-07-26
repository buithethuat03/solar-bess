import { createHash, randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const createDelegations = 'CreateDelegations1783754000000';
const createSavedViewsAndReportJobs = 'CreateSavedViewsAndReportJobs1783755000000';
const extendEscalation = 'ExtendWorkflowEscalationNotificationSource1783756000000';
const grantMigration = 'GrantCrossCuttingPermissions1783757000000';
const tables = ['delegations', 'saved_views', 'report_jobs'];

const rules = {
  version: 1,
  steps: [{
    key: 'REVIEW', order: 1, rule: 'ALL',
    approverSelector: { roleCodes: ['PMO'], scope: 'PROJECT' },
    fallbackRoleCodes: ['TENANT_ADMIN']
  }],
  conditions: []
};

describe('Cross-cutting migrations — DB-008/DB-106/DB-107 + escalation vocabulary', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const delegatorId = randomUUID();
  const delegateId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedMasterData();
  });

  // Every test here reverts part of the chain and is expected to hand it back fully applied. A
  // failed expectation aborts the test before its trailing re-up, so without this the next test —
  // and every later suite, because the whole run shares one database — would inherit a
  // half-migrated schema and report a cascade of unrelated failures.
  afterEach(async () => {
    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('up/down/up: creates the new tables and columns, removes them on down, restores on re-up', async () => {
    expect(await regclasses()).toEqual(tables);
    expect(await escalationColumns()).toEqual(['escalation_count', 'last_escalated_at']);
    expect(await sourceTypeCheckIncludesWorkflowInstance()).toBe(true);

    await revertThroughMigration(createDelegations);
    expect(await regclasses()).toEqual([]);
    expect(await escalationColumns()).toEqual([]);
    expect(await sourceTypeCheckIncludesWorkflowInstance()).toBe(false);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
    expect(await escalationColumns()).toEqual(['escalation_count', 'last_escalated_at']);
    expect(await sourceTypeCheckIncludesWorkflowInstance()).toBe(true);
    void createSavedViewsAndReportJobs;
  });

  it('accepts a canonical WorkflowInstance notification and rejects every deviation', async () => {
    const instanceId = await seedInstance(projectId, 'IN_REVIEW');
    await expect(insertEscalationNotification({ sourceId: instanceId }))
      .resolves.toBeDefined();

    // The widened vocabulary admits exactly these six source types and nothing else.
    expect(await sourceTypeVocabulary()).toEqual([
      'ChangeRequest', 'Issue', 'Risk', 'RiskIssueAction', 'ScheduleActivity', 'WorkflowInstance'
    ]);
    // An unknown source type is still refused, but by the 1783733 scope trigger rather than by
    // ck_notification_source_type: PostgreSQL runs BEFORE ROW triggers ahead of table CHECKs, and
    // the trigger has no branch for an unknown type, so its `IF NOT FOUND` guard raises first.
    await expect(insertEscalationNotification({
      sourceId: instanceId, sourceType: 'Telemetry'
    })).rejects.toMatchObject({ code: '23503', constraint: 'fk_notification_source_scope' });
    // Canonical package is NULL: an approval reminder addresses approvers, not a package.
    await expect(insertEscalationNotification({
      sourceId: instanceId, packageId: randomUUID()
    })).rejects.toMatchObject({ constraint: 'ck_notification_source_package_scope' });
    // Canonical priority is HIGH.
    await expect(insertEscalationNotification({
      sourceId: instanceId, priority: 'NORMAL', dedupKey: sha('another')
    })).rejects.toMatchObject({ constraint: 'ck_notification_source_priority' });
    // The source instance must exist in this tenant AND project.
    await expect(insertEscalationNotification({ sourceId: randomUUID() }))
      .rejects.toMatchObject({ constraint: 'fk_notification_source_scope' });
    await expect(insertEscalationNotification({
      sourceId: instanceId, projectId: otherProjectId, dedupKey: sha('cross-project')
    })).rejects.toMatchObject({ constraint: 'fk_notification_source_scope' });
  });

  it('down deletes only WorkflowInstance rows and restores the original trigger/CHECKs', async () => {
    const instanceId = await seedInstance(projectId, 'IN_REVIEW');
    await insertEscalationNotification({ sourceId: instanceId });
    const [before] = await AppDataSource.query<Array<{ count: string }>>(
      'SELECT COUNT(*)::text AS count FROM notifications'
    );
    expect(before.count).toBe('1');

    await revertThroughMigration(extendEscalation);
    const [after] = await AppDataSource.query<Array<{ count: string }>>(
      'SELECT COUNT(*)::text AS count FROM notifications'
    );
    expect(after.count).toBe('0');
    // The CHECK is narrowed back to the pre-escalation vocabulary…
    expect(await sourceTypeCheckIncludesWorkflowInstance()).toBe(false);
    // …and the restored trigger has no WorkflowInstance branch, so it refuses the source outright
    // ahead of that CHECK (BEFORE ROW triggers run before table constraints).
    await expect(AppDataSource.query(
      `INSERT INTO notifications (
        id, tenant_id, recipient_user_id, project_id, package_id, activity_id, source_type,
        source_id, alert_type, priority, object_link, reason, due_at, data_date,
        threshold_version, dedup_key, status
      ) VALUES ($1,$2,$3,$4,NULL,NULL,'WorkflowInstance',$5,'APPROVAL_ESCALATED','HIGH',
        '/approval-tasks','Escalated','2026-07-26','2026-07-26','WORKFLOW_ESCALATION_V1',$6,'UNREAD')`,
      [randomUUID(), tenantId, delegateId, projectId, instanceId, sha('post-down')]
    )).rejects.toMatchObject({ code: '23503', constraint: 'fk_notification_source_scope' });

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('pairs the escalation counter with its timestamp on workflow_instances', async () => {
    const instanceId = await seedInstance(projectId, 'IN_REVIEW');
    await expect(AppDataSource.query(
      'UPDATE workflow_instances SET escalation_count = 1 WHERE id = $1', [instanceId]
    )).rejects.toMatchObject({ constraint: 'ck_workflow_instance_escalation_pair' });
    await expect(AppDataSource.query(
      `UPDATE workflow_instances SET escalation_count = 1, last_escalated_at = now()
       WHERE id = $1`, [instanceId]
    )).resolves.toBeDefined();
    await expect(AppDataSource.query(
      'UPDATE workflow_instances SET escalation_count = -1 WHERE id = $1', [instanceId]
    )).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces the delegation invariants as row constraints', async () => {
    // Bounded window.
    await expect(seedDelegation({
      effectiveFrom: '2026-08-01T00:00:00Z', effectiveTo: '2026-07-01T00:00:00Z'
    })).rejects.toMatchObject({ constraint: 'ck_delegation_window' });
    // Mandatory, non-blank reason.
    await expect(seedDelegation({ reason: '   ' }))
      .rejects.toMatchObject({ constraint: 'ck_delegation_reason' });
    // No self-delegation.
    await expect(seedDelegation({ delegateId: delegatorId }))
      .rejects.toMatchObject({ constraint: 'ck_delegation_no_self' });
    // Cross-tenant principals are structurally impossible.
    await expect(seedDelegation({ delegateId: otherTenantUserId }))
      .rejects.toMatchObject({ code: '23503' });
    // Status vocabulary is closed.
    await expect(seedDelegation({ status: 'PAUSED' }))
      .rejects.toMatchObject({ constraint: 'ck_delegation_status' });
    // A REVOKED row must carry the revocation pair; other statuses must not.
    await expect(seedDelegation({ status: 'REVOKED' }))
      .rejects.toMatchObject({ constraint: 'ck_delegation_revocation_pair' });
    await expect(seedDelegation({ revokedBy: delegatorId, revokedAt: new Date() }))
      .rejects.toMatchObject({ constraint: 'ck_delegation_revocation_pair' });
    await expect(seedDelegation({})).resolves.toBeDefined();
  });

  it('keeps saved views PRIVATE by construction and unique per owner/target/name', async () => {
    await expect(seedSavedView({ shareScope: 'TEAM' }))
      .rejects.toMatchObject({ constraint: 'ck_saved_view_share_scope' });
    await expect(seedSavedView({ name: '  ' }))
      .rejects.toMatchObject({ constraint: 'ck_saved_view_name' });
    await expect(seedSavedView({ targetType: 'TELEMETRY' }))
      .rejects.toMatchObject({ constraint: 'ck_saved_view_target' });
    await seedSavedView({});
    await expect(seedSavedView({}))
      .rejects.toMatchObject({ constraint: 'uq_saved_view_owner_name' });
    // Same name for a different owner is legal.
    await expect(seedSavedView({ ownerUserId: delegateId })).resolves.toBeDefined();
  });

  it('freezes a COMPLETED report job snapshot via CHECK plus trigger', async () => {
    // COMPLETED requires the full snapshot projection.
    await expect(seedReportJob({ status: 'COMPLETED' }))
      .rejects.toMatchObject({ constraint: 'ck_report_job_completed_projection' });
    const completedId = await seedReportJob({
      status: 'COMPLETED', dataAsOf: new Date('2026-07-26T00:00:00Z'),
      outputObjectRef: { bucket: 'release', objectKey: 'reports/x.csv' },
      expiresAt: new Date('2026-07-29T00:00:00Z')
    });
    await expect(AppDataSource.query(
      `UPDATE report_jobs SET output_object_ref = '{"bucket":"other","objectKey":"y.csv"}'::jsonb
       WHERE id = $1`, [completedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE report_jobs SET data_as_of = now() WHERE id = $1`, [completedId]
    )).rejects.toMatchObject({ code: '55000' });
    // The freeze is narrow: non-snapshot columns stay maintainable.
    await expect(AppDataSource.query(
      `UPDATE report_jobs SET expires_at = now() WHERE id = $1`, [completedId]
    )).resolves.toBeDefined();
    // A RUNNING job can still complete normally.
    const runningId = await seedReportJob({ status: 'RUNNING' });
    await expect(AppDataSource.query(
      `UPDATE report_jobs SET status = 'COMPLETED', data_as_of = now(),
        output_object_ref = '{"bucket":"release","objectKey":"reports/z.csv"}'::jsonb,
        expires_at = now() + interval '72 hours'
       WHERE id = $1`, [runningId]
    )).resolves.toBeDefined();
  });

  it('grants policy 11 permissions reversibly, catch-all included', async () => {
    const pmoRoleId = randomUUID();
    const customRoleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PMO','PMO',$3::jsonb,1,'ACTIVE'),
              ($4,$2,'CUSTOM_ROLE','Custom',$5::jsonb,1,'ACTIVE')`,
      [
        pmoRoleId, tenantId, JSON.stringify(['workflow.start', 'savedView.read']),
        customRoleId, JSON.stringify(['notification.read'])
      ]
    );
    await revertThroughMigration(grantMigration);
    await AppDataSource.runMigrations({ transaction: 'all' });

    const pmo = await roleState(pmoRoleId);
    expect(pmo.permissions).toEqual(expect.arrayContaining([
      'permission.read.self', 'delegation.create', 'delegation.revoke', 'workflow.escalate',
      'search.execute', 'savedView.read', 'savedView.create', 'report.create', 'report.read'
    ]));
    expect(pmo.policyVersion).toBeGreaterThanOrEqual(11);
    // The catch-all covers the ten platform catalog roles only. A tenant-defined custom role is
    // that tenant's to govern, and every other grant migration touches only roles it names — a
    // migration that silently rewrote a customer's own role would break that contract.
    const custom = await roleState(customRoleId);
    expect(custom.permissions).toEqual(['notification.read']);
    // Untouched means untouched: a role the migration does not name keeps its own policy version.
    expect(custom.policyVersion).toBe(1);

    await revertThroughMigration(grantMigration);
    const revertedPmo = await roleState(pmoRoleId);
    // Pre-existing codes — including savedView.read, which the migration did NOT add — survive.
    expect(revertedPmo.permissions).toEqual(['workflow.start', 'savedView.read']);
    expect(revertedPmo.policyVersion).toBe(1);
    const revertedCustom = await roleState(customRoleId);
    expect(revertedCustom.permissions).toEqual(['notification.read']);
    expect(revertedCustom.policyVersion).toBe(1);

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      `SELECT ${tables.map((table) => `to_regclass('${table}')::text AS "${table}"`).join(', ')}`
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function escalationColumns(): Promise<string[]> {
    const rows = await AppDataSource.query<Array<{ name: string }>>(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_name = 'workflow_instances'
         AND column_name IN ('escalation_count', 'last_escalated_at')
       ORDER BY column_name`
    );
    return rows.map((row) => row.name);
  }

  /** The source types `ck_notification_source_type` currently admits, sorted. */
  async function sourceTypeVocabulary(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ definition: string }>>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
       WHERE conname = 'ck_notification_source_type'`
    );
    // The rendered definition quotes each accepted literal and nothing else.
    return [...row.definition.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  }

  async function sourceTypeCheckIncludesWorkflowInstance(): Promise<boolean> {
    return (await sourceTypeVocabulary()).includes('WorkflowInstance');
  }

  async function roleState(roleId: string): Promise<{ permissions: string[]; policyVersion: number }> {
    const [row] = await AppDataSource.query<Array<{
      permissions: string[]; policyVersion: number;
    }>>(
      `SELECT permissions, policy_version AS "policyVersion" FROM roles WHERE id = $1`, [roleId]
    );
    return row;
  }

  async function seedInstance(instanceProjectId: string, state: string): Promise<string> {
    const definitionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_definitions (
        id, tenant_id, code, name, object_type, process_owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'Change approval','ChangeRequest',$4,'ACTIVE',$4,$4)`,
      [definitionId, tenantId, `WF-${randomUUID().slice(0, 8).toUpperCase()}`, delegatorId]
    );
    const versionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_versions (
        id, tenant_id, workflow_definition_id, version, status, routing_rules,
        rules_hash, created_by, published_by, published_at
      ) VALUES ($1,$2,$3,1,'PUBLISHED',$4::jsonb,$5,$6,$7,now())`,
      [versionId, tenantId, definitionId, JSON.stringify(rules), sha(JSON.stringify(rules)),
        delegatorId, delegateId]
    );
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO workflow_instances (
        id, tenant_id, workflow_definition_id, workflow_version_id, object_type, object_id,
        object_version, project_id, package_id, state, current_step_key, route_snapshot,
        route_hash, requested_by
      ) VALUES ($1,$2,$3,$4,'ChangeRequest',$5,1,$6,NULL,$7,'REVIEW',$8::jsonb,$9,$10)`,
      [id, tenantId, definitionId, versionId, randomUUID(), instanceProjectId, state,
        JSON.stringify(rules), sha(JSON.stringify(rules)), delegatorId]
    );
    return id;
  }

  async function insertEscalationNotification(overrides: {
    sourceId: string; sourceType?: string; packageId?: string | null;
    priority?: string; projectId?: string; dedupKey?: string;
  }): Promise<unknown> {
    return AppDataSource.query(
      `INSERT INTO notifications (
        id, tenant_id, recipient_user_id, project_id, package_id, activity_id, source_type,
        source_id, alert_type, priority, object_link, reason, due_at, data_date,
        threshold_version, dedup_key, status
      ) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'APPROVAL_ESCALATED',$8,
        '/approval-tasks','Yêu cầu phê duyệt đã được escalate','2026-07-26','2026-07-26',
        'WORKFLOW_ESCALATION_V1',$9,'UNREAD')`,
      [
        randomUUID(), tenantId, delegateId, overrides.projectId ?? projectId,
        overrides.packageId ?? null, overrides.sourceType ?? 'WorkflowInstance',
        overrides.sourceId, overrides.priority ?? 'HIGH',
        overrides.dedupKey ?? sha(`dedup-${overrides.sourceId}`)
      ]
    );
  }

  async function seedDelegation(overrides: {
    delegateId?: string; effectiveFrom?: string; effectiveTo?: string; reason?: string;
    status?: string; revokedBy?: string; revokedAt?: Date;
  }): Promise<unknown> {
    return AppDataSource.query(
      `INSERT INTO delegations (
        id, tenant_id, delegator_id, delegate_id, scope, effective_from, effective_to,
        reason, status, revoked_by, revoked_at
      ) VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,$6,$7,$8,$9,$10)`,
      [
        randomUUID(), tenantId, delegatorId, overrides.delegateId ?? delegateId,
        overrides.effectiveFrom ?? '2026-07-01T00:00:00Z',
        overrides.effectiveTo ?? '2026-08-01T00:00:00Z',
        overrides.reason ?? 'Nghỉ phép, ủy quyền phê duyệt',
        overrides.status ?? 'ACTIVE',
        overrides.revokedBy ?? null, overrides.revokedAt ?? null
      ]
    );
  }

  async function seedSavedView(overrides: {
    ownerUserId?: string; name?: string; targetType?: string; shareScope?: string;
  }): Promise<unknown> {
    return AppDataSource.query(
      `INSERT INTO saved_views (
        id, tenant_id, owner_user_id, name, target_type, filter_snapshot, column_snapshot,
        sort_snapshot, share_scope
      ) VALUES ($1,$2,$3,$4,$5,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,$6)`,
      [
        randomUUID(), tenantId, overrides.ownerUserId ?? delegatorId,
        overrides.name ?? 'Rủi ro CRITICAL của tôi', overrides.targetType ?? 'RISK',
        overrides.shareScope ?? 'PRIVATE'
      ]
    );
  }

  async function seedReportJob(overrides: {
    status: string; dataAsOf?: Date; outputObjectRef?: Record<string, string>; expiresAt?: Date;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO report_jobs (
        id, tenant_id, report_type, filter_snapshot, data_as_of, status, output_object_ref,
        expires_at, requested_by, correlation_id
      ) VALUES ($1,$2,'RISK_REGISTER_CSV',$3::jsonb,$4,$5,$6::jsonb,$7,$8,$9)`,
      [
        id, tenantId, JSON.stringify({ projectId }), overrides.dataAsOf ?? null,
        overrides.status,
        overrides.outputObjectRef === undefined ? null : JSON.stringify(overrides.outputObjectRef),
        overrides.expiresAt ?? null, delegatorId, randomUUID()
      ]
    );
    return id;
  }

  function sha(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'cc-cut'], [otherTenantId, 'cc-cut-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [delegatorId, tenantId, 'cut-delegator@example.test'],
      [delegateId, tenantId, 'cut-delegate@example.test'],
      [otherTenantUserId, otherTenantId, 'cut-other@example.test']
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
       VALUES ($1,$2,'COMP-CUT','Company','INTERNAL','ACTIVE')`, [companyId, tenantId]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal','VN','REG-CUT','ACTIVE')`, [legalId, tenantId, companyId]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,'PORT-CUT','Portfolio','ACTIVE')`, [portfolioId, tenantId]
    );
    for (const [id, code] of [[projectId, 'CUT-PRJ'], [otherProjectId, 'CUT-PRJ-B']] as const) {
      await AppDataSource.query(
        `INSERT INTO projects (
          id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
          project_manager_id, code, name, type, phase, record_status, contract_model,
          currency, planned_cod
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Project','SOLAR','PLANNING','ACTIVE','EPC','VND','2027-12-31')`,
        [id, tenantId, portfolioId, legalId, companyId, delegatorId, code]
      );
    }
  }
});
