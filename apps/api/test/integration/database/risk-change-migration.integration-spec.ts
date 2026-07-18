import { createHash, randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(60_000);

const reconciledConstraintNames = [
  'ck_risk_closure_decision_request', 'ck_risk_closure_pending_projection',
  'ck_issue_closure_decision_request', 'ck_issue_closure_pending_projection',
  'ck_change_request_approval_status', 'ck_change_request_schedule_approval_status'
] as const;

describe('Risk/Issue/Change migrations — DB-065/066/067/105/112/113', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const reviewerA = randomUUID();
  const userB = randomUUID();
  const projectA = randomUUID();
  const projectB = randomUUID();
  const packageA = randomUUID();
  const packageB = randomUUID();

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

  it('materializes all aggregates and preserves schedule rows through notification down/up', async () => {
    const schedule = await seedSchedule();
    const notificationId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO notifications (
        id, tenant_id, recipient_user_id, project_id, package_id, activity_id,
        source_type, source_id, alert_type, priority, object_link, reason,
        due_at, data_date, threshold_version, dedup_key
      ) VALUES ($1,$2,$3,$4,$5,$6,'ScheduleActivity',$6,'OVERDUE','HIGH',$7,$8,$9,$10,$11,$12)`,
      [notificationId, tenantA, userA, projectA, packageA, schedule.activityId,
        `/projects/${projectA}/schedule`, 'Synthetic schedule alert', schedule.plannedFinish,
        schedule.dataDate, 'SCHEDULE_THRESHOLDS_V1', `schedule-${notificationId}`]
    );

    const [up] = await AppDataSource.query<Array<Record<string, string>>>(`SELECT
      to_regclass('public.risks')::text AS risks,
      to_regclass('public.issues')::text AS issues,
      to_regclass('public.change_requests')::text AS changes,
      to_regclass('public.risk_issue_actions')::text AS actions,
      to_regclass('public.risk_issue_closure_cycles')::text AS cycles,
      to_regclass('public.notifications')::text AS notifications`);
    expect(up).toEqual({
      risks: 'risks', issues: 'issues', changes: 'change_requests',
      actions: 'risk_issue_actions', cycles: 'risk_issue_closure_cycles',
      notifications: 'notifications'
    });

    await revertThroughMigration('GeneralizeNotifications1783733000000');
    const [down] = await AppDataSource.query<Array<{ generic: string | null; schedule: string; count: string }>>(`SELECT
      to_regclass('public.notifications')::text AS generic,
      to_regclass('public.schedule_notifications')::text AS schedule,
      (SELECT count(*)::text FROM schedule_notifications WHERE id = $1) AS count`, [notificationId]);
    expect(down).toEqual({ generic: null, schedule: 'schedule_notifications', count: '1' });

    await AppDataSource.runMigrations({ transaction: 'all' });
    const [restored] = await AppDataSource.query<Array<{ packageId: string; count: string }>>(
      `SELECT package_id AS "packageId", count(*) OVER ()::text AS count
       FROM notifications WHERE id = $1`, [notificationId]
    );
    expect(restored).toEqual({ packageId: packageA, count: '1' });
  });

  it('transactionally reconciles legacy runtime constraints/functions and restores legacy down state', async () => {
    let invalidRiskId: string | null = null;
    invalidRiskId = await seedRisk();
    await revertThroughMigration('ReconcileRiskChangeRoleGrants1783736000000');
    await revertThroughMigration('ReconcileRiskChangeRuntimeDrift1783735000000');
    try {
      await installLegacyRuntimeDrift();
      await AppDataSource.query(
        `UPDATE risks SET status = 'CLOSURE_PENDING' WHERE id = $1`, [invalidRiskId]
      );
      await expect(
        AppDataSource.runMigrations({ transaction: 'all' })
      ).rejects.toMatchObject({ code: '23514', constraint: 'ck_risk_closure_pending_projection' });
      expect(await reconciliationConstraintCount()).toBe(0);
      const [rolledBack] = await AppDataSource.query<Array<{ source: string }>>(
        `SELECT prosrc AS source FROM pg_proc
         WHERE oid = 'protect_change_request_history()'::regprocedure`
      );
      expect(rolledBack.source).not.toContain('approved Change status cannot regress');

      await AppDataSource.query(
        `UPDATE risks SET status = 'TREATING' WHERE id = $1`, [invalidRiskId]
      );
      await AppDataSource.runMigrations({ transaction: 'all' });
      expect(await reconciliationConstraintCount()).toBe(6);
      const [functions] = await AppDataSource.query<Array<{
        parent: string; history: string;
      }>>(`SELECT
        (SELECT prosrc FROM pg_proc
          WHERE oid = 'enforce_risk_issue_parent_scope()'::regprocedure) AS parent,
        (SELECT prosrc FROM pg_proc
          WHERE oid = 'protect_change_request_history()'::regprocedure) AS history`);
      expect(functions.parent).toContain("IF TG_TABLE_NAME = 'issues' THEN");
      expect(functions.history).toContain('approved Change status cannot regress');
      expect(functions.history).toContain('submitted Change requires an explicit decision');
      expect(functions.history).toContain('rejected Change decision is immutable');

      await expect(AppDataSource.query(
        `UPDATE risks SET status = 'CLOSURE_PENDING' WHERE id = $1`, [invalidRiskId]
      )).rejects.toMatchObject({
        code: '23514', constraint: 'ck_risk_closure_pending_projection'
      });
      await expect(AppDataSource.query(
        `UPDATE risks SET closure_decision = 'REJECT', closure_decided_by = $2,
          closure_decided_at = now(), closure_decision_comment = 'Independent rejection',
          closure_decision_evidence_refs = $3::jsonb WHERE id = $1`,
        [invalidRiskId, reviewerA, evidence('RISK_DECISION')]
      )).rejects.toMatchObject({
        code: '23514', constraint: 'ck_risk_closure_decision_request'
      });

      const issueId = randomUUID();
      await AppDataSource.query(`INSERT INTO issues (
        id, tenant_id, project_id, package_id, code, title, description, occurred_at,
        root_cause, actual_impact, severity, owner_id, target_date, status,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'ISS-RECON','Reconciliation issue','Synthetic issue',now(),
        'Synthetic root cause','Synthetic impact','HIGH',$5,'2026-08-01','IN_PROGRESS',$5,$5)`,
      [issueId, tenantA, projectA, packageA, userA]);
      await expect(AppDataSource.query(`UPDATE issues SET
        status = 'CLOSURE_PENDING', resolution_summary = 'Resolution was completed',
        resolution_evidence_refs = $2::jsonb, resolved_by = $3, resolved_at = now()
        WHERE id = $1`, [issueId, evidence('ISSUE_RESOLUTION'), userA])).rejects.toMatchObject({
        code: '23514', constraint: 'ck_issue_closure_pending_projection'
      });
      await expect(AppDataSource.query(`UPDATE issues SET
        closure_decision = 'REJECT', closure_decided_by = $2, closure_decided_at = now(),
        closure_decision_comment = 'Independent rejection',
        closure_decision_evidence_refs = $3::jsonb WHERE id = $1`,
      [issueId, reviewerA, evidence('ISSUE_DECISION')])).rejects.toMatchObject({
        code: '23514', constraint: 'ck_issue_closure_decision_request'
      });

      await expect(insertDraftChange({
        code: 'CR-RECON-APPROVAL', approvedBy: reviewerA
      })).rejects.toMatchObject({
        code: '23514', constraint: 'ck_change_request_approval_status'
      });
      const sourceBaselineId = await seedApprovedBaseline();
      await expect(insertDraftChange({
        code: 'CR-RECON-SCHEDULE', sourceBaselineId, scheduleImpactApproved: true
      })).rejects.toMatchObject({
        code: '23514', constraint: 'ck_change_request_schedule_approval_status'
      });

      const approvedChangeId = await seedApprovedChange(sourceBaselineId, 'CR-RECON-FROZEN');
      await expect(AppDataSource.query(
        `UPDATE change_requests SET status = 'RETURNED',
          version_no = version_no + 1, updated_at = now() WHERE id = $1`,
        [approvedChangeId]
      )).rejects.toMatchObject({ code: '55000' });

      await revertThroughMigration('ReconcileRiskChangeRoleGrants1783736000000');
      await revertThroughMigration('ReconcileRiskChangeRuntimeDrift1783735000000');
      expect(await reconciliationConstraintCount()).toBe(0);
      const [legacy] = await AppDataSource.query<Array<{ parent: string; history: string }>>(`SELECT
        (SELECT prosrc FROM pg_proc
          WHERE oid = 'enforce_risk_issue_parent_scope()'::regprocedure) AS parent,
        (SELECT prosrc FROM pg_proc
          WHERE oid = 'protect_change_request_history()'::regprocedure) AS history`);
      expect(legacy.parent).toContain(
        "IF TG_TABLE_NAME = 'issues' AND NEW.source_risk_id IS NOT NULL THEN"
      );
      expect(legacy.history).not.toContain('approved Change status cannot regress');
      expect(legacy.history).not.toContain('submitted Change requires an explicit decision');
    } finally {
      if (invalidRiskId) {
        await AppDataSource.query(
          `UPDATE risks SET status = 'TREATING', closure_decision = NULL,
            closure_decided_by = NULL, closure_decided_at = NULL,
            closure_decision_comment = NULL, closure_decision_evidence_refs = '[]'::jsonb
           WHERE id = $1`, [invalidRiskId]
        ).catch(() => undefined);
      }
      await AppDataSource.runMigrations({ transaction: 'all' });
    }
  });

  it('merges RiskChange role grants tenant-locally and rolls back only migration additions', async () => {
    await revertThroughMigration('ReconcileRiskChangeRoleGrants1783736000000');
    const roleFixtures = await seedLegacyRoleCatalog();
    try {
      await AppDataSource.runMigrations({ transaction: 'all' });
      const upgraded = await readRoleCatalog();
      expect(upgraded.get(`${tenantA}:PMO`)).toMatchObject({ policyVersion: 3 });
      expect(upgraded.get(`${tenantA}:PMO`)?.permissions).toEqual(expect.arrayContaining([
        'custom.audit', 'riskChange.read', 'riskChange.create', 'riskChange.manage',
        'riskChange.submit', 'riskChange.approve', 'riskChange.requestClosure',
        'riskChange.close', 'riskChange.closeCritical', 'user.read'
      ]));
      expect(upgraded.get(`${tenantA}:PROJECT_CONTROLS`)?.permissions)
        .toEqual(expect.arrayContaining([
          'custom.controls', 'riskChange.read', 'riskChange.create', 'riskChange.manage',
          'riskChange.requestClosure', 'user.read'
        ]));
      expect(upgraded.get(`${tenantB}:PACKAGE_OWNER`)?.permissions)
        .toEqual(expect.arrayContaining([
          'custom.package', 'riskChange.read', 'riskChange.create', 'riskChange.manage',
          'riskChange.requestClosure', 'user.read'
        ]));
      expect(upgraded.get(`${tenantA}:EXECUTIVE`)?.permissions)
        .toEqual(['custom.executive', 'riskChange.read']);
      expect(upgraded.get(`${tenantA}:TENANT_ADMIN`)).toEqual({
        permissions: ['custom.admin'], policyVersion: 2
      });
      expect(upgraded.get(`${tenantA}:CUSTOM_ROLE`)).toEqual({
        permissions: ['custom.only'], policyVersion: 7
      });
      expect(upgraded.size).toBe(roleFixtures.length);

      await AppDataSource.query(`UPDATE roles SET
        permissions = permissions || '["postMigration.custom"]'::jsonb,
        policy_version = 4 WHERE id = $1`, [roleFixtures[0].id]);
      await revertThroughMigration('ReconcileRiskChangeRoleGrants1783736000000');
      const restored = await readRoleCatalog();
      expect(restored.get(`${tenantA}:PMO`)).toEqual({
        permissions: ['custom.audit', 'riskChange.read', 'postMigration.custom'],
        policyVersion: 4
      });
      expect(restored.get(`${tenantA}:PROJECT_MANAGER`)).toEqual({
        permissions: ['custom.manager'], policyVersion: 2
      });
      expect(restored.get(`${tenantA}:TENANT_ADMIN`)).toEqual({
        permissions: ['custom.admin'], policyVersion: 2
      });
      const [state] = await AppDataSource.query<Array<{ tableName: string | null }>>(
        `SELECT to_regclass('public.role_grant_reconcile_1783736000000')::text AS "tableName"`
      );
      expect(state.tableName).toBeNull();
    } finally {
      await AppDataSource.runMigrations({ transaction: 'all' });
    }
  });

  it('enforces tenant/project/package scope and server-derived Risk scores', async () => {
    const riskId = await seedRisk();
    await expect(AppDataSource.query(
      `UPDATE risks SET inherent_exposure = 24 WHERE id = $1`, [riskId]
    )).rejects.toMatchObject({ code: '23514', constraint: 'ck_risk_inherent_derived' });

    await expect(AppDataSource.query(
      `INSERT INTO issues (
        id, tenant_id, project_id, package_id, code, title, description, occurred_at,
        root_cause, actual_impact, severity, owner_id, target_date, source_risk_id,
        status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'ISS-CROSS','Cross-package issue','Synthetic issue',now(),
        'Synthetic root cause','Synthetic impact','HIGH',$5,'2026-08-01',$6,
        'REPORTED',$5,$5)`,
      [randomUUID(), tenantA, projectA, null, userA, riskId]
    )).rejects.toMatchObject({
      code: '23514', constraint: 'ck_issue_source_risk_package_scope'
    });

    await expect(AppDataSource.query(
      `INSERT INTO risk_issue_actions (
        id, tenant_id, project_id, package_id, risk_id, code, action_type, title,
        owner_id, due_date, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'ACT-CROSS','RESPONSE','Cross-package action',$6,
        '2026-08-01','OPEN',$6,$6)`,
      [randomUUID(), tenantA, projectA, null, riskId, userA]
    )).rejects.toMatchObject({
      code: '23514', constraint: 'ck_risk_issue_action_package_scope'
    });
  });

  it('protects terminal Actions and append-only closure-cycle decisions', async () => {
    const riskId = await seedRisk('MONITORING');
    const actionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO risk_issue_actions (
        id, tenant_id, project_id, package_id, risk_id, code, action_type, title,
        owner_id, due_date, status, evidence_refs, residual_probability,
      residual_cost_impact_rating, residual_schedule_impact_rating,
        residual_hse_impact_rating, residual_rationale, residual_risk_version,
        completed_by, completed_at,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'ACT-001','RESPONSE','Mitigation action',$6,
        '2026-08-01','DONE',$7::jsonb,2,2,2,2,'Verified mitigation rationale',1,
        $6,now(),$6,$6)`,
      [actionId, tenantA, projectA, packageA, riskId, userA, evidence('ACTION_EVIDENCE')]
    );
    await AppDataSource.query(
      `UPDATE risk_issue_actions SET status = 'VERIFIED', verified_by = $2,
        verified_at = now(), version_no = version_no + 1, updated_by = $2, updated_at = now()
       WHERE id = $1`, [actionId, reviewerA]
    );
    await expect(AppDataSource.query(
      `UPDATE risk_issue_actions SET title = 'Mutated terminal action' WHERE id = $1`, [actionId]
    )).rejects.toMatchObject({ code: '55000' });
    const [action] = await AppDataSource.query<Array<{ rationale: string }>>(
      `SELECT residual_rationale AS rationale FROM risk_issue_actions WHERE id = $1`, [actionId]
    );
    expect(action.rationale).toBe('Verified mitigation rationale');
    await expect(
      revertThroughMigration('AddActionResidualRationale1783734000000')
    ).rejects.toMatchObject({ code: '55000' });
    // The helper reaches 4000 by successfully reverting later migrations first.
    // Restore those forward migrations after the expected 4000 rollback rejection.
    await AppDataSource.runMigrations({ transaction: 'all' });

    const cycleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO risk_issue_closure_cycles (
        id, tenant_id, project_id, package_id, risk_id, sequence_no, request_reason,
        request_evidence_refs, requested_by, requested_at
      ) VALUES ($1,$2,$3,$4,$5,1,'Treatment is complete',$6::jsonb,$7,now())`,
      [cycleId, tenantA, projectA, packageA, riskId, evidence('CLOSURE_REQUEST'), userA]
    );
    await expect(AppDataSource.query(
      `INSERT INTO risk_issue_closure_cycles (
        id, tenant_id, project_id, package_id, risk_id, sequence_no, request_reason,
        request_evidence_refs, requested_by, requested_at
      ) VALUES ($1,$2,$3,$4,$5,2,'Duplicate open cycle',$6::jsonb,$7,now())`,
      [randomUUID(), tenantA, projectA, packageA, riskId, evidence('CLOSURE_REQUEST'), userA]
    )).rejects.toMatchObject({ code: '23505', constraint: 'uq_risk_closure_cycle_open' });

    await AppDataSource.query(
      `UPDATE risk_issue_closure_cycles SET decision = 'APPROVE',
        decision_comment = 'Closure independently approved', decision_evidence_refs = $2::jsonb,
        decided_by = $3, decided_at = now(), resulting_status = 'CLOSED'
       WHERE id = $1`, [cycleId, evidence('CLOSURE_DECISION'), reviewerA]
    );
    await expect(AppDataSource.query(
      `UPDATE risk_issue_closure_cycles SET decision_comment = 'Mutated decision' WHERE id = $1`,
      [cycleId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM risk_issue_closure_cycles WHERE id = $1', [cycleId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('freezes approved Changes and wires DB-020 provenance to approved schedule impact', async () => {
    const schedule = await seedSchedule();
    const initialBaselineId = randomUUID();
    const baselineSnapshot = { scheduleId: schedule.scheduleId, version: 1 };
    const baselineHash = hash(baselineSnapshot);
    await AppDataSource.query(
      `INSERT INTO schedule_baselines (
        id, tenant_id, project_id, schedule_id, baseline_number, baseline_type, status,
        data_date, snapshot, snapshot_hash, reason, impact_summary, created_by,
        submitted_by, submitted_at, approved_by, approved_at
      ) VALUES ($1,$2,$3,$4,1,'INITIAL','APPROVED',$5,$6::jsonb,$7,
        'Initial baseline','Initial approved plan',$8,$8,now(),$8,now())`,
      [initialBaselineId, tenantA, projectA, schedule.scheduleId, schedule.dataDate,
        JSON.stringify(baselineSnapshot), baselineHash, userA]
    );

    const changeId = randomUUID();
    const impact = completeImpact();
    const approval = { reason: 'Approved schedule change', impact };
    await AppDataSource.query(
      `INSERT INTO change_requests (
        id, tenant_id, project_id, package_id, code, title, reason, recommendation,
        owner_id, requester_id, source_baseline_id, source_type, impact_draft,
        impact_snapshot, impact_snapshot_hash, approval_snapshot, approval_snapshot_hash,
        status, submitted_by, submitted_at, decision_version, decided_by, decided_at,
        approved_by, approved_at, decision_comment, schedule_impact_approved,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'CR-001','Approved schedule change','Approved schedule change',
        'Proceed with revised plan',$5,$5,$6,'MANUAL',$7::jsonb,$7::jsonb,$8,
        $9::jsonb,$10,'APPROVED',$5,now(),1,$11,now(),$11,now(),
        'Impact independently approved',true,$5,$11)`,
      [changeId, tenantA, projectA, packageA, userA, initialBaselineId,
        JSON.stringify(impact), hash(impact), JSON.stringify(approval), hash(approval), reviewerA]
    );
    await expect(AppDataSource.query(
      `UPDATE change_requests SET reason = 'Mutated approved reason' WHERE id = $1`, [changeId]
    )).rejects.toMatchObject({ code: '55000' });

    await AppDataSource.query(
      `UPDATE schedule_baselines SET status = 'SUPERSEDED', version_no = version_no + 1,
        updated_at = now() WHERE id = $1`, [initialBaselineId]
    );
    await AppDataSource.query(
      `INSERT INTO schedule_baselines (
        id, tenant_id, project_id, schedule_id, baseline_number, baseline_type, status,
        data_date, snapshot, snapshot_hash, reason, impact_summary,
        approved_change_request_id, replaces_baseline_id, created_by,
        submitted_by, submitted_at, approved_by, approved_at
      ) VALUES ($1,$2,$3,$4,2,'REBASELINE','APPROVED',$5,$6::jsonb,$7,
        'Approved Change CR-001','Approved schedule impact',$8,$9,$10,$10,now(),$10,now())`,
      [randomUUID(), tenantA, projectA, schedule.scheduleId, schedule.dataDate,
        JSON.stringify({ scheduleId: schedule.scheduleId, version: 2 }),
        hash({ scheduleId: schedule.scheduleId, version: 2 }), changeId,
        initialBaselineId, reviewerA]
    );

    await expect(AppDataSource.query(
      `INSERT INTO schedule_baselines (
        id, tenant_id, project_id, schedule_id, baseline_number, baseline_type, status,
        data_date, snapshot, snapshot_hash, reason, impact_summary,
        approved_change_request_id, created_by
      ) VALUES ($1,$2,$3,$4,3,'REBASELINE','DRAFT',$5,$6::jsonb,$7,
        'Cross-project Change','Invalid provenance',$8,$9)`,
      [randomUUID(), tenantA, projectA, schedule.scheduleId, schedule.dataDate,
        JSON.stringify({ version: 3 }), hash({ version: 3 }), randomUUID(), userA]
    )).rejects.toMatchObject({ code: '23514', constraint: 'ck_schedule_baseline_approved_change' });
  });

  it('validates generalized notification source, dates, scope and priority', async () => {
    const riskId = await seedRisk();
    const [{ businessDate }] = await AppDataSource.query<Array<{ businessDate: string }>>(
      `SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS "businessDate"`
    );
    await expect(AppDataSource.query(
      `INSERT INTO notifications (
        id, tenant_id, recipient_user_id, project_id, package_id, source_type, source_id,
        alert_type, priority, object_link, reason, due_at, data_date, threshold_version, dedup_key
      ) VALUES ($1,$2,$3,$4,$5,'Risk',$6,'RISK_REVIEW_DUE','NORMAL',$7,$8,
        '2026-08-15',$9,'RISK_CHANGE_THRESHOLDS_V1',$10)`,
      [randomUUID(), tenantA, userA, projectA, packageA, riskId,
        `/projects/${projectA}/risks/${riskId}`, 'Risk review is due', businessDate, randomUUID()]
    )).rejects.toMatchObject({ code: '23514', constraint: 'ck_notification_source_priority' });

    const notificationId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO notifications (
        id, tenant_id, recipient_user_id, project_id, package_id, source_type, source_id,
        alert_type, priority, object_link, reason, due_at, data_date, threshold_version, dedup_key
      ) VALUES ($1,$2,$3,$4,$5,'Risk',$6,'RISK_REVIEW_DUE','HIGH',$7,$8,
        '2026-08-15',$9,'RISK_CHANGE_THRESHOLDS_V1',$10)`,
      [notificationId, tenantA, userA, projectA, packageA, riskId,
        `/projects/${projectA}/risks/${riskId}`, 'Risk review is due', businessDate, randomUUID()]
    );
    const [notification] = await AppDataSource.query<Array<{ sourceType: string; activityId: string | null }>>(
      `SELECT source_type AS "sourceType", activity_id AS "activityId"
       FROM notifications WHERE id = $1`, [notificationId]
    );
    expect(notification).toEqual({ sourceType: 'Risk', activityId: null });
  });

  async function installLegacyRuntimeDrift(): Promise<void> {
    for (const constraint of reconciledConstraintNames) {
      const table = constraint.startsWith('ck_risk_')
        ? 'risks' : constraint.startsWith('ck_issue_') ? 'issues' : 'change_requests';
      await AppDataSource.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
    }
    await AppDataSource.query(`CREATE OR REPLACE FUNCTION enforce_risk_issue_parent_scope()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE parent_package_id uuid;
    DECLARE parent_risk_id uuid;
    BEGIN
      IF TG_TABLE_NAME = 'issues' AND NEW.source_risk_id IS NOT NULL THEN
        SELECT package_id INTO parent_package_id FROM risks
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id
            AND id = NEW.source_risk_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '23503',
            CONSTRAINT = 'fk_issues_tenant_source_risk',
            MESSAGE = 'source Risk does not exist in Issue tenant/project scope';
        END IF;
        IF parent_package_id IS DISTINCT FROM NEW.package_id THEN
          RAISE EXCEPTION USING ERRCODE = '23514',
            CONSTRAINT = 'ck_issue_source_risk_package_scope',
            MESSAGE = 'Issue package scope must match source Risk';
        END IF;
      ELSIF TG_TABLE_NAME = 'risks' AND NEW.occurred_issue_id IS NOT NULL THEN
        SELECT package_id, source_risk_id INTO parent_package_id, parent_risk_id FROM issues
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id
            AND id = NEW.occurred_issue_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '23503',
            CONSTRAINT = 'fk_risks_tenant_occurred_issue',
            MESSAGE = 'occurred Issue does not exist in Risk tenant/project scope';
        END IF;
        IF parent_package_id IS DISTINCT FROM NEW.package_id
          OR parent_risk_id IS DISTINCT FROM NEW.id THEN
          RAISE EXCEPTION USING ERRCODE = '23514',
            CONSTRAINT = 'ck_risk_occurred_issue_scope',
            MESSAGE = 'occurred Issue must link the same Risk and package scope';
        END IF;
      END IF;
      RETURN NEW;
    END $$`);
    await AppDataSource.query(`CREATE OR REPLACE FUNCTION protect_change_request_history()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE'
        AND OLD.status IN ('SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'submitted Change history cannot be deleted';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED','IMPLEMENTED','CLOSED') AND
         (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'approved Change snapshot is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED' AND
         (to_jsonb(NEW) - ARRAY['status','decision_version','decided_by','decided_at',
          'approved_by','approved_at','decision_comment','schedule_impact_approved',
          'version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['status','decision_version','decided_by','decided_at',
          'approved_by','approved_at','decision_comment','schedule_impact_approved',
          'version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'submitted Change source/reason/impact snapshot is immutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
  }

  async function reconciliationConstraintCount(): Promise<number> {
    const [row] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM pg_constraint
       WHERE conname = ANY($1::text[])`, [[...reconciledConstraintNames]]
    );
    return Number(row.count);
  }

  async function insertDraftChange(input: {
    code: string;
    approvedBy?: string;
    sourceBaselineId?: string;
    scheduleImpactApproved?: boolean;
  }): Promise<unknown> {
    return AppDataSource.query(`INSERT INTO change_requests (
      id, tenant_id, project_id, package_id, code, title, reason,
      owner_id, requester_id, source_baseline_id, source_type, status,
      approved_by, approved_at, schedule_impact_approved, created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,'Reconciliation Change','Synthetic reconciliation change',
      $6,$6,$7,'MANUAL','DRAFT',$8,$9,$10,$6,$6)`, [
      randomUUID(), tenantA, projectA, packageA, input.code, userA,
      input.sourceBaselineId ?? null, input.approvedBy ?? null,
      input.approvedBy ? new Date() : null, input.scheduleImpactApproved ?? false
    ]);
  }

  async function seedApprovedBaseline(): Promise<string> {
    const schedule = await seedSchedule();
    const id = randomUUID();
    const snapshot = { scheduleId: schedule.scheduleId, version: 1 };
    await AppDataSource.query(`INSERT INTO schedule_baselines (
      id, tenant_id, project_id, schedule_id, baseline_number, baseline_type, status,
      data_date, snapshot, snapshot_hash, reason, impact_summary, created_by,
      submitted_by, submitted_at, approved_by, approved_at
    ) VALUES ($1,$2,$3,$4,1,'INITIAL','APPROVED',$5,$6::jsonb,$7,
      'Reconciliation baseline','Approved reconciliation baseline',$8,$8,now(),$9,now())`,
    [id, tenantA, projectA, schedule.scheduleId, schedule.dataDate,
      JSON.stringify(snapshot), hash(snapshot), userA, reviewerA]);
    return id;
  }

  async function seedApprovedChange(sourceBaselineId: string, code: string): Promise<string> {
    const id = randomUUID();
    const impact = completeImpact();
    const approval = { reason: 'Reconciliation approved change', impact };
    await AppDataSource.query(`INSERT INTO change_requests (
      id, tenant_id, project_id, package_id, code, title, reason, recommendation,
      owner_id, requester_id, source_baseline_id, source_type, impact_draft,
      impact_snapshot, impact_snapshot_hash, approval_snapshot, approval_snapshot_hash,
      status, submitted_by, submitted_at, decision_version, decided_by, decided_at,
      approved_by, approved_at, decision_comment, schedule_impact_approved,
      created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,'Reconciliation approved Change',
      'Approved reconciliation reason','Proceed with reconciliation',$6,$6,$7,'MANUAL',
      $8::jsonb,$8::jsonb,$9,$10::jsonb,$11,'APPROVED',$6,now(),1,$12,now(),
      $12,now(),'Independent reconciliation approval',true,$6,$12)`, [
      id, tenantA, projectA, packageA, code, userA, sourceBaselineId,
      JSON.stringify(impact), hash(impact), JSON.stringify(approval), hash(approval), reviewerA
    ]);
    return id;
  }

  async function seedLegacyRoleCatalog(): Promise<Array<{
    id: string; tenantId: string; code: string;
  }>> {
    const fixtures = [
      { id: randomUUID(), tenantId: tenantA, code: 'PMO', permissions: ['custom.audit', 'riskChange.read'], policy: 2 },
      { id: randomUUID(), tenantId: tenantA, code: 'PROJECT_MANAGER', permissions: ['custom.manager'], policy: 2 },
      { id: randomUUID(), tenantId: tenantA, code: 'PROJECT_CONTROLS', permissions: ['custom.controls'], policy: 2 },
      { id: randomUUID(), tenantId: tenantB, code: 'PACKAGE_OWNER', permissions: ['custom.package'], policy: 2 },
      { id: randomUUID(), tenantId: tenantA, code: 'EXECUTIVE', permissions: ['custom.executive'], policy: 2 },
      { id: randomUUID(), tenantId: tenantA, code: 'TENANT_ADMIN', permissions: ['custom.admin'], policy: 2 },
      { id: randomUUID(), tenantId: tenantA, code: 'CUSTOM_ROLE', permissions: ['custom.only'], policy: 7 }
    ];
    for (const fixture of fixtures) {
      await AppDataSource.query(`INSERT INTO roles (
        id, tenant_id, code, name, permissions, policy_version, status
      ) VALUES ($1,$2,$3,$3,$4::jsonb,$5,'ACTIVE')`, [
        fixture.id, fixture.tenantId, fixture.code,
        JSON.stringify(fixture.permissions), fixture.policy
      ]);
    }
    return fixtures.map(({ id, tenantId, code }) => ({ id, tenantId, code }));
  }

  async function readRoleCatalog(): Promise<Map<string, {
    permissions: string[]; policyVersion: number;
  }>> {
    const rows = await AppDataSource.query<Array<{
      tenantId: string; code: string; permissions: string[]; policyVersion: number;
    }>>(`SELECT tenant_id AS "tenantId", code, permissions,
      policy_version AS "policyVersion" FROM roles
      WHERE code = ANY($1::text[]) ORDER BY tenant_id, code`, [[
      'PMO', 'PROJECT_MANAGER', 'PROJECT_CONTROLS', 'PACKAGE_OWNER',
      'EXECUTIVE', 'TENANT_ADMIN', 'CUSTOM_ROLE'
    ]]);
    return new Map(rows.map((row) => [
      `${row.tenantId}:${row.code}`,
      { permissions: row.permissions, policyVersion: row.policyVersion }
    ]));
  }

  async function seedMasterData(): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES
        ($1,$2,'Risk Tenant A','ACTIVE'), ($3,$4,'Risk Tenant B','ACTIVE')`,
      [tenantA, `risk-a-${tenantA}`, tenantB, `risk-b-${tenantB}`]
    );
    await AppDataSource.query(
      `INSERT INTO user_accounts (id, tenant_id, email, normalized_email, display_name, status) VALUES
        ($1,$2,'risk-owner@example.test','risk-owner@example.test','Risk Owner','ACTIVE'),
        ($3,$2,'risk-reviewer@example.test','risk-reviewer@example.test','Risk Reviewer','ACTIVE'),
        ($4,$5,'risk-b@example.test','risk-b@example.test','Risk B','ACTIVE')`,
      [userA, tenantA, reviewerA, userB, tenantB]
    );
    for (const fixture of [
      { tenantId: tenantA, userId: userA, projectId: projectA, packageId: packageA, suffix: 'A' },
      { tenantId: tenantB, userId: userB, projectId: projectB, packageId: packageB, suffix: 'B' }
    ]) {
      const companyId = randomUUID();
      const legalEntityId = randomUUID();
      const portfolioId = randomUUID();
      await AppDataSource.query(
        `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
         VALUES ($1,$2,$3,$4,'INTERNAL','ACTIVE')`,
        [companyId, fixture.tenantId, `COMP-${fixture.suffix}`, `Company ${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO legal_entities
          (id, tenant_id, company_id, legal_name, country, registration_no, status)
         VALUES ($1,$2,$3,$4,'VN',$5,'ACTIVE')`,
        [legalEntityId, fixture.tenantId, companyId, `Legal ${fixture.suffix}`, `REG-${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO portfolios (id, tenant_id, code, name, status)
         VALUES ($1,$2,$3,$4,'ACTIVE')`,
        [portfolioId, fixture.tenantId, `PORT-${fixture.suffix}`, `Portfolio ${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO projects (
          id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
          project_manager_id, code, name, type, phase, record_status, contract_model,
          currency, planned_cod
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SOLAR','PLANNING','ACTIVE','EPC','VND','2027-12-31')`,
        [fixture.projectId, fixture.tenantId, portfolioId, legalEntityId, companyId,
          fixture.userId, `PROJECT-${fixture.suffix}`, `Project ${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO sites (id, tenant_id, project_id, code, name, timezone, is_primary, status)
         VALUES ($1,$2,$3,$4,$5,'Asia/Ho_Chi_Minh',true,'ACTIVE')`,
        [randomUUID(), fixture.tenantId, fixture.projectId,
          `SITE-${fixture.suffix}`, `Site ${fixture.suffix}`]
      );
      await AppDataSource.query(
        `INSERT INTO packages (
          id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by
        ) VALUES ($1,$2,$3,$4,$5,'EPC','ACTIVE',$6,$6)`,
        [fixture.packageId, fixture.tenantId, fixture.projectId,
          `PKG-${fixture.suffix}`, `Package ${fixture.suffix}`, fixture.userId]
      );
    }
  }

  async function seedRisk(status = 'TREATING'): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO risks (
        id, tenant_id, project_id, package_id, code, category, cause, event, impact,
        probability, cost_impact_rating, schedule_impact_rating, hse_impact_rating,
        impact_rating, inherent_exposure, inherent_level, scoring_version, threshold_version,
        owner_id, review_date, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Schedule','Late equipment delivery','Delivery misses site need date',
        'Commissioning can slip',4,4,3,2,4,16,'HIGH','RISK_SCORING_V1',
        'RISK_CHANGE_THRESHOLDS_V1',$6,'2026-08-15',$7,$6,$6)`,
      [id, tenantA, projectA, packageA, `RSK-${id.slice(0, 8).toUpperCase()}`, userA, status]
    );
    return id;
  }

  async function seedSchedule(): Promise<{
    scheduleId: string; activityId: string; plannedFinish: string; dataDate: string;
  }> {
    const scheduleId = randomUUID();
    const wbsId = randomUUID();
    const activityId = randomUUID();
    const dataDate = '2026-07-18';
    const plannedFinish = '2026-07-17';
    await AppDataSource.query(
      `INSERT INTO project_schedules (
        id, tenant_id, project_id, timezone, calendar_code, working_week,
        calendar_exceptions, data_date, status, source_format, source_name,
        created_by, updated_by
      ) VALUES ($1,$2,$3,'Asia/Ho_Chi_Minh','STANDARD','[1,2,3,4,5]'::jsonb,
        '[]'::jsonb,$4,'DRAFT','MANUAL','Risk migration test',$5,$5)`,
      [scheduleId, tenantA, projectA, dataDate, userA]
    );
    await AppDataSource.query(
      `INSERT INTO wbs_nodes (
        id, tenant_id, project_id, schedule_id, package_id, code, name, weight,
        sort_order, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'WBS-RISK','Risk WBS',100,0,'ACTIVE',$6,$6)`,
      [wbsId, tenantA, projectA, scheduleId, packageA, userA]
    );
    await AppDataSource.query(
      `INSERT INTO schedule_activities (
        id, tenant_id, project_id, schedule_id, wbs_id, package_id, owner_id,
        code, name, activity_type, weight, planned_start, planned_finish,
        duration_work_days, remaining_duration_work_days, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACT-RISK','Risk activity','TASK',100,
        '2026-07-10',$8,6,6,'READY',$7,$7)`,
      [activityId, tenantA, projectA, scheduleId, wbsId, packageA, userA, plannedFinish]
    );
    return { scheduleId, activityId, plannedFinish, dataDate };
  }

  function evidence(objectType: string): string {
    return JSON.stringify([{ objectType, objectId: randomUUID() }]);
  }

  function hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  function completeImpact(): Record<string, unknown> {
    return {
      scope: { summary: 'No scope reduction' },
      schedule: {
        summary: 'Revised commissioning sequence', durationDeltaDays: 7,
        requiresRebaseline: true, affectedMilestoneIds: []
      },
      cost: { summary: 'No approved cost delta', amountDelta: '0.0000', currency: 'VND' },
      quality: { summary: 'Quality controls retained' },
      hse: { summary: 'HSE controls retained' },
      contract: { summary: 'Contract notice required' }
    };
  }
});
