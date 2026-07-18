import { createHash, randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(45_000);

describe('Project Controls migration — DB-012/017…021/101/105', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedProjectMaster();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('runs down and up and restores PACKAGE scope support', async () => {
    await revertThroughMigration('CreateProjectControls1783730000000');
    const [down] = await AppDataSource.query<Array<{
      packages: string | null;
      schedules: string | null;
      scopeDefinition: string;
    }>>(`SELECT
      to_regclass('public.packages')::text AS packages,
      to_regclass('public.project_schedules')::text AS schedules,
      pg_get_constraintdef(oid) AS "scopeDefinition"
      FROM pg_constraint WHERE conname = 'ck_role_assignment_scope'`);
    expect(down.packages).toBeNull();
    expect(down.schedules).toBeNull();
    expect(down.scopeDefinition).not.toContain('PACKAGE');

    await AppDataSource.runMigrations({ transaction: 'all' });
    const [up] = await AppDataSource.query<Array<{
      packages: string;
      schedules: string;
      activities: string;
      baselines: string;
      progress: string;
      notifications: string;
      scopeDefinition: string;
    }>>(`SELECT
      to_regclass('public.packages')::text AS packages,
      to_regclass('public.project_schedules')::text AS schedules,
      to_regclass('public.schedule_activities')::text AS activities,
      to_regclass('public.schedule_baselines')::text AS baselines,
      to_regclass('public.progress_updates')::text AS progress,
      to_regclass('public.notifications')::text AS notifications,
      pg_get_constraintdef(oid) AS "scopeDefinition"
      FROM pg_constraint WHERE conname = 'ck_role_assignment_scope'`);
    expect(up).toMatchObject({
      packages: 'packages',
      schedules: 'project_schedules',
      activities: 'schedule_activities',
      baselines: 'schedule_baselines',
      progress: 'progress_updates',
      notifications: 'notifications'
    });
    expect(up.scopeDefinition).toContain('PACKAGE');
  });

  it('rejects cross-tenant project and PACKAGE assignment references', async () => {
    await expect(AppDataSource.query(
      `INSERT INTO packages
        (id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'CROSS', 'Cross tenant', 'EPC', 'ACTIVE', $4, $4)`,
      [randomUUID(), tenantA, projectB, userA]
    )).rejects.toMatchObject({ code: '23503', constraint: 'fk_packages_tenant_project' });

    const packageB = randomUUID();
    await AppDataSource.query(
      `INSERT INTO packages
        (id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'PKG-B', 'Package B', 'EPC', 'ACTIVE', $4, $4)`,
      [packageB, tenantB, projectB, userB]
    );
    const roleA = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1, $2, 'CONTROLS', 'Controls', '[]'::jsonb, 1, 'ACTIVE')`,
      [roleA, tenantA]
    );
    await expect(AppDataSource.query(
      `INSERT INTO role_assignments
        (id, tenant_id, user_account_id, role_id, scope_type, scope_id, effective_from, status)
       VALUES ($1, $2, $3, $4, 'PACKAGE', $5, now(), 'ACTIVE')`,
      [randomUUID(), tenantA, userA, roleA, packageB]
    )).rejects.toMatchObject({ code: '23503', constraint: 'fk_role_assignment_scope_tenant' });
  });

  it('enforces project/schedule scope for WBS and activity relations', async () => {
    const scopeA = await seedScheduleAggregate();
    const scheduleB = randomUUID();
    await AppDataSource.query(
      `INSERT INTO project_schedules
        (id, tenant_id, project_id, timezone, calendar_code, working_week,
         calendar_exceptions, data_date, status, source_format, source_name,
         created_by, updated_by)
       VALUES ($1, $2, $3, 'Asia/Ho_Chi_Minh', 'STANDARD', '[1,2,3,4,5]'::jsonb,
         '[]'::jsonb, '2026-07-12', 'DRAFT', 'MANUAL', 'Synthetic test', $4, $4)`,
      [scheduleB, tenantB, projectB, userB]
    );

    await expect(AppDataSource.query(
      `INSERT INTO wbs_nodes
        (id, tenant_id, project_id, schedule_id, parent_wbs_id, code, name, weight,
         sort_order, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'CROSS-WBS', 'Cross WBS', 100,
         1, 'ACTIVE', $6, $6)`,
      [randomUUID(), tenantB, projectB, scheduleB, scopeA.wbsId, userB]
    )).rejects.toMatchObject({ code: '23503', constraint: 'fk_wbs_tenant_parent' });

    await expect(AppDataSource.query(
      `INSERT INTO activity_dependencies
        (id, tenant_id, project_id, schedule_id, predecessor_id, successor_id,
         dependency_type, lag_work_days, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $5, 'FS', 0, $6, $6)`,
      [randomUUID(), tenantA, projectA, scopeA.scheduleId, scopeA.activityId, userA]
    )).rejects.toMatchObject({ code: '23514', constraint: 'ck_activity_dependency_not_self' });
  });

  it('keeps approved baseline snapshots immutable and progress append-only', async () => {
    const scope = await seedScheduleAggregate();
    const baselineId = randomUUID();
    const snapshot = { scheduleId: scope.scheduleId, version: 1 };
    const snapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    await AppDataSource.query(
      `INSERT INTO schedule_baselines
        (id, tenant_id, project_id, schedule_id, baseline_number, baseline_type,
         status, data_date, snapshot, snapshot_hash, reason, impact_summary,
         created_by, submitted_by, submitted_at, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, 1, 'INITIAL', 'APPROVED', '2026-07-12', $5::jsonb,
         $6, 'Initial baseline', 'Initial approved plan', $7, $7, now(), $7, now())`,
      [baselineId, tenantA, projectA, scope.scheduleId, JSON.stringify(snapshot), snapshotHash, userA]
    );
    await expect(AppDataSource.query(
      `UPDATE schedule_baselines SET snapshot = '{"changed":true}'::jsonb WHERE id = $1`,
      [baselineId]
    )).rejects.toMatchObject({ code: '55000' });
    await AppDataSource.query(
      `UPDATE schedule_baselines SET status = 'SUPERSEDED', version_no = version_no + 1,
       updated_at = now() WHERE id = $1`,
      [baselineId]
    );
    await expect(AppDataSource.query(
      `UPDATE schedule_baselines SET decision_comment = 'mutated' WHERE id = $1`,
      [baselineId]
    )).rejects.toMatchObject({ code: '55000' });

    const progressId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO progress_updates
        (id, tenant_id, project_id, activity_id, data_date, percent_complete,
         remaining_duration_work_days, evidence_refs, source_key, recorded_by)
       VALUES ($1, $2, $3, $4, '2026-07-12', 25, 8, '[]'::jsonb, $5, $6)`,
      [progressId, tenantA, projectA, scope.activityId, `source-${progressId}`, userA]
    );
    await expect(AppDataSource.query(
      'UPDATE progress_updates SET percent_complete = 30 WHERE id = $1', [progressId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM progress_updates WHERE id = $1', [progressId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('enforces calendar JSON, numeric ranges and notification recipient tenancy', async () => {
    await expect(AppDataSource.query(
      `INSERT INTO project_schedules
        (id, tenant_id, project_id, timezone, calendar_code, working_week,
         calendar_exceptions, data_date, status, source_format, source_name,
         created_by, updated_by)
       VALUES ($1, $2, $3, 'Asia/Ho_Chi_Minh', 'INVALID', '[]'::jsonb,
         '[]'::jsonb, '2026-07-12', 'DRAFT', 'MANUAL', 'Invalid test', $4, $4)`,
      [randomUUID(), tenantA, projectA, userA]
    )).rejects.toMatchObject({
      code: '23514', constraint: 'ck_project_schedule_working_week_array'
    });

    const scope = await seedScheduleAggregate();
    await expect(AppDataSource.query(
      'UPDATE schedule_activities SET percent_complete = 100.01 WHERE id = $1',
      [scope.activityId]
    )).rejects.toMatchObject({
      code: '23514', constraint: 'ck_schedule_activity_percent'
    });
    await expect(AppDataSource.query(
      `INSERT INTO notifications
        (id, tenant_id, recipient_user_id, project_id, package_id, activity_id, source_type,
         source_id, alert_type, priority, object_link, reason, due_at, data_date,
         threshold_version, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, 'ScheduleActivity', $6, 'OVERDUE', 'HIGH',
         $7, 'Synthetic overdue alert', '2026-07-24', '2026-07-12', 'V1', $8)`,
      [randomUUID(), tenantA, userB, projectA, scope.packageId, scope.activityId,
        `/projects/${projectA}/schedule`, `alert-${randomUUID()}`]
    )).rejects.toMatchObject({
      code: '23503', constraint: 'fk_notifications_tenant_recipient'
    });
  });

  async function seedProjectMaster(): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES
        ($1, $2, 'Controls Tenant A', 'ACTIVE'),
        ($3, $4, 'Controls Tenant B', 'ACTIVE')`,
      [tenantA, `controls-a-${tenantA}`, tenantB, `controls-b-${tenantB}`]
    );
    await AppDataSource.query(
      `INSERT INTO user_accounts
        (id, tenant_id, email, normalized_email, display_name, status) VALUES
        ($1, $2, 'planner-a@example.test', 'planner-a@example.test', 'Planner A', 'ACTIVE'),
        ($3, $4, 'planner-b@example.test', 'planner-b@example.test', 'Planner B', 'ACTIVE')`,
      [userA, tenantA, userB, tenantB]
    );
    for (const fixture of [
      { tenantId: tenantA, userId: userA, projectId: projectA, suffix: 'A' },
      { tenantId: tenantB, userId: userB, projectId: projectB, suffix: 'B' }
    ]) {
      const companyId = randomUUID();
      const legalEntityId = randomUUID();
      const portfolioId = randomUUID();
      await AppDataSource.query(
        `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
         VALUES ($1, $2, $3, $4, 'INTERNAL', 'ACTIVE')`,
        [companyId, fixture.tenantId, `COMP-${fixture.suffix}`, `Company ${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO legal_entities
          (id, tenant_id, company_id, legal_name, country, registration_no, status)
         VALUES ($1, $2, $3, $4, 'VN', $5, 'ACTIVE')`,
        [legalEntityId, fixture.tenantId, companyId, `Legal ${fixture.suffix}`, `REG-${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO portfolios (id, tenant_id, code, name, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')`,
        [portfolioId, fixture.tenantId, `PORT-${fixture.suffix}`, `Portfolio ${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO projects
          (id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
           project_manager_id, code, name, type, phase, record_status, contract_model,
           currency, planned_cod)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SOLAR', 'PLANNING', 'ACTIVE',
           'EPC', 'VND', '2027-12-31')`,
        [fixture.projectId, fixture.tenantId, portfolioId, legalEntityId, companyId,
          fixture.userId, `PROJECT-${fixture.suffix}`, `Project ${fixture.suffix}`]
      );
    }
  }

  async function seedScheduleAggregate(): Promise<{
    packageId: string;
    scheduleId: string;
    wbsId: string;
    activityId: string;
  }> {
    const packageId = randomUUID();
    const scheduleId = randomUUID();
    const wbsId = randomUUID();
    const activityId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO packages
        (id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'PKG-A', 'Package A', 'EPC', 'ACTIVE', $4, $4)`,
      [packageId, tenantA, projectA, userA]
    );
    await AppDataSource.query(
      `INSERT INTO project_schedules
        (id, tenant_id, project_id, timezone, calendar_code, working_week,
         calendar_exceptions, data_date, status, source_format, source_name,
         created_by, updated_by)
       VALUES ($1, $2, $3, 'Asia/Ho_Chi_Minh', 'STANDARD', '[1,2,3,4,5]'::jsonb,
         '[]'::jsonb, '2026-07-12', 'DRAFT', 'MANUAL', 'Synthetic test', $4, $4)`,
      [scheduleId, tenantA, projectA, userA]
    );
    await AppDataSource.query(
      `INSERT INTO wbs_nodes
        (id, tenant_id, project_id, schedule_id, package_id, code, name, weight,
         sort_order, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'WBS-A', 'WBS A', 100, 0, 'ACTIVE', $6, $6)`,
      [wbsId, tenantA, projectA, scheduleId, packageId, userA]
    );
    await AppDataSource.query(
      `INSERT INTO schedule_activities
        (id, tenant_id, project_id, schedule_id, wbs_id, package_id, owner_id,
         code, name, activity_type, weight, planned_start, planned_finish,
         duration_work_days, remaining_duration_work_days, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACT-A', 'Activity A', 'TASK', 100,
         '2026-07-13', '2026-07-24', 10, 10, 'READY', $7, $7)`,
      [activityId, tenantA, projectA, scheduleId, wbsId, packageId, userA]
    );
    return { packageId, scheduleId, wbsId, activityId };
  }
});
