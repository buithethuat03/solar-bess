import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(45_000);

describe('Operational foundation migration — DB-102/103/104 and tenant hardening', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('runs down and up with operational tables, constraints and triggers restored', async () => {
    await revertThroughMigration('CreateOperationalFoundation1783729000000');
    const [down] = await AppDataSource.query<Array<{
      outbox: string | null;
      consumption: string | null;
      receipt: string | null;
      projectSchedule: string | null;
      tenantConstraint: string | null;
      auditTrigger: boolean;
    }>>(`SELECT
      to_regclass('public.transactional_outbox_events')::text AS outbox,
      to_regclass('public.event_consumptions')::text AS consumption,
      to_regclass('public.command_receipts')::text AS receipt,
      to_regclass('public.project_schedules')::text AS "projectSchedule",
      (SELECT conname FROM pg_constraint
       WHERE conname = 'fk_local_credentials_tenant_user') AS "tenantConstraint",
      EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_audit_events_immutable' AND NOT tgisinternal) AS "auditTrigger"`);
    expect(down).toEqual({
      outbox: null,
      consumption: null,
      receipt: null,
      projectSchedule: null,
      tenantConstraint: null,
      auditTrigger: false
    });

    await AppDataSource.runMigrations({ transaction: 'all' });
    const [up] = await AppDataSource.query<Array<{
      outbox: string;
      consumption: string;
      receipt: string;
      projectSchedule: string | null;
      tenantConstraint: string;
      auditTrigger: boolean;
      scopeTrigger: boolean;
    }>>(`SELECT
      to_regclass('public.transactional_outbox_events')::text AS outbox,
      to_regclass('public.event_consumptions')::text AS consumption,
      to_regclass('public.command_receipts')::text AS receipt,
      to_regclass('public.project_schedules')::text AS "projectSchedule",
      (SELECT conname FROM pg_constraint
       WHERE conname = 'fk_local_credentials_tenant_user') AS "tenantConstraint",
      EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_audit_events_immutable' AND NOT tgisinternal) AS "auditTrigger",
      EXISTS (SELECT 1 FROM pg_trigger
       WHERE tgname = 'trg_role_assignment_scope_tenant' AND NOT tgisinternal) AS "scopeTrigger"`);
    expect(up).toEqual({
      outbox: 'transactional_outbox_events',
      consumption: 'event_consumptions',
      receipt: 'command_receipts',
      projectSchedule: 'project_schedules',
      tenantConstraint: 'fk_local_credentials_tenant_user',
      auditTrigger: true,
      scopeTrigger: true
    });
  });

  it('rejects raw SQL cross-tenant references in auth, Project Master and event consumption', async () => {
    await seedTenantsAndUsers();

    await expect(AppDataSource.query(
      `INSERT INTO local_credentials
        (id, tenant_id, user_account_id, password_hash, changed_at)
       VALUES ($1, $2, $3, $4, now())`,
      [randomUUID(), tenantA, userB, 'argon2id-cross-tenant-test']
    )).rejects.toMatchObject({
      code: '23503', constraint: 'fk_local_credentials_tenant_user'
    });

    const companyB = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies
        (id, tenant_id, code, name, organization_type, status)
       VALUES ($1, $2, 'B-COMPANY', 'Tenant B Company', 'CUSTOMER', 'ACTIVE')`,
      [companyB, tenantB]
    );
    await expect(AppDataSource.query(
      `INSERT INTO legal_entities
        (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1, $2, $3, 'Invalid Legal Entity', 'VN', $4, 'ACTIVE')`,
      [randomUUID(), tenantA, companyB, randomUUID()]
    )).rejects.toMatchObject({
      code: '23503', constraint: 'fk_legal_entities_tenant_company'
    });

    const eventId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO transactional_outbox_events
        (id, tenant_id, actor_id, event_key, aggregate_type, aggregate_id,
         aggregate_version, event_type, schema_version, payload, status, correlation_id)
       VALUES ($1, $2, $3, $4, 'Project', $5, 1, 'ProjectCreated', 1,
         '{"projectId":"synthetic"}'::jsonb, 'PENDING', $6)`,
      [eventId, tenantA, userA, `event-${eventId}`, randomUUID(), `corr-${eventId}`]
    );
    await expect(AppDataSource.query(
      `INSERT INTO event_consumptions
        (id, tenant_id, event_id, consumer_name, handler_version, status, correlation_id)
       VALUES ($1, $2, $3, 'test-consumer', 'v1', 'PROCESSING', $4)`,
      [randomUUID(), tenantB, eventId, `corr-${eventId}`]
    )).rejects.toMatchObject({
      code: '23503', constraint: 'fk_event_consumption_tenant_event'
    });
  });

  it('installs and validates every composite tenant foreign key for auth and Project Master', async () => {
    const expected = [
      'fk_audit_events_tenant_actor',
      'fk_authentication_sessions_tenant_user',
      'fk_legal_entities_tenant_company',
      'fk_local_credentials_tenant_user',
      'fk_project_parties_tenant_company',
      'fk_project_parties_tenant_legal_entity',
      'fk_project_parties_tenant_project',
      'fk_projects_tenant_customer_company',
      'fk_projects_tenant_owner_legal_entity',
      'fk_projects_tenant_portfolio',
      'fk_projects_tenant_project_manager',
      'fk_role_assignments_tenant_role',
      'fk_role_assignments_tenant_user',
      'fk_sites_tenant_project'
    ];
    const constraints = await AppDataSource.query<Array<{ name: string; validated: boolean }>>(
      `SELECT conname AS name, convalidated AS validated
       FROM pg_constraint
       WHERE conname = ANY($1::text[])
       ORDER BY conname`,
      [expected]
    );
    expect(constraints).toEqual(expected.map((name) => ({ name, validated: true })));
  });

  it('rejects a role-assignment scope owned by another tenant', async () => {
    await seedTenantsAndUsers();
    const roleA = randomUUID();
    const portfolioB = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1, $2, 'TEST_ROLE', 'Test Role', '[]'::jsonb, 1, 'ACTIVE')`,
      [roleA, tenantA]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1, $2, 'B-PORTFOLIO', 'Tenant B Portfolio', 'ACTIVE')`,
      [portfolioB, tenantB]
    );

    await expect(AppDataSource.query(
      `INSERT INTO role_assignments
        (id, tenant_id, user_account_id, role_id, scope_type, scope_id,
         effective_from, status)
       VALUES ($1, $2, $3, $4, 'PORTFOLIO', $5, now(), 'ACTIVE')`,
      [randomUUID(), tenantA, userA, roleA, portfolioB]
    )).rejects.toMatchObject({
      code: '23503', constraint: 'fk_role_assignment_scope_tenant'
    });
  });

  it('rejects UPDATE and DELETE against audit_events and preserves the row', async () => {
    await seedTenantsAndUsers();
    const auditId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO audit_events
        (id, tenant_id, actor_id, action, result, correlation_id, object_type, object_id, payload)
       VALUES ($1, $2, $3, 'FOUNDATION_TEST', 'SUCCESS', $4, 'TestObject', $5,
         '{"synthetic":true}'::jsonb)`,
      [auditId, tenantA, userA, `corr-${auditId}`, randomUUID()]
    );

    await expect(AppDataSource.query(
      'UPDATE audit_events SET action = $1 WHERE id = $2', ['MUTATED', auditId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM audit_events WHERE id = $1', [auditId]
    )).rejects.toMatchObject({ code: '55000' });

    const [persisted] = await AppDataSource.query<Array<{ action: string }>>(
      'SELECT action FROM audit_events WHERE id = $1', [auditId]
    );
    expect(persisted).toEqual({ action: 'FOUNDATION_TEST' });
  });

  async function seedTenantsAndUsers(): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES
        ($1, 'operational-a', 'Operational Tenant A', 'ACTIVE'),
        ($2, 'operational-b', 'Operational Tenant B', 'ACTIVE')`,
      [tenantA, tenantB]
    );
    await AppDataSource.query(
      `INSERT INTO user_accounts
        (id, tenant_id, email, normalized_email, display_name, status) VALUES
        ($1, $2, 'user-a@example.test', 'user-a@example.test', 'User A', 'ACTIVE'),
        ($3, $4, 'user-b@example.test', 'user-b@example.test', 'User B', 'ACTIVE')`,
      [userA, tenantA, userB, tenantB]
    );
  }
});
