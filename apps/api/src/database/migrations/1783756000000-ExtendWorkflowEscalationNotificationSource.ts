import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * API-113 escalation facts on `workflow_instances` plus the DB-105 notification vocabulary for the
 * worker-projected escalation alert (`WorkflowInstance` / `APPROVAL_ESCALATED`).
 *
 * `escalation_count` never resets and is the outbox `aggregate_version` of
 * `WorkflowInstance.EscalationRequested`: escalation deliberately does not bump the instance's
 * `version_no` (it is a reminder, not a transition), so reusing `version_no` would collide with the
 * start/decision events of the same version under `uq_outbox_aggregate_event`.
 *
 * `project_id` guard: in this repository the column already exists NOT NULL with
 * `fk_workflow_instance_project` since 1783738. A sibling slice widens
 * `ck_workflow_instance_object_type` (INVESTMENT_SCENARIO) and may relax the column, so the ADD is
 * written defensively (add only when missing) to stay order-independent under the merge; this
 * migration never touches `ck_workflow_instance_object_type` itself, and down() leaves
 * `project_id` alone because 1783738 owns it.
 */

/** Shared source-scope branches exactly as 1783733 created them (restored verbatim on down). */
const baseSourceBranches = `
      IF NEW.source_type = 'ScheduleActivity' THEN
        SELECT activity.package_id, activity.planned_finish, schedule.data_date,
          CASE WHEN NEW.alert_type = 'OVERDUE' THEN 'HIGH' ELSE 'NORMAL' END
          INTO source_package_id, expected_due_at, expected_data_date, expected_priority
        FROM schedule_activities activity
        JOIN project_schedules schedule
          ON schedule.tenant_id = activity.tenant_id
          AND schedule.project_id = activity.project_id
          AND schedule.id = activity.schedule_id
        WHERE activity.tenant_id = NEW.tenant_id AND activity.project_id = NEW.project_id
          AND activity.id = NEW.source_id;
      ELSIF NEW.source_type = 'Risk' THEN
        SELECT risk.package_id, risk.review_date,
          (CURRENT_TIMESTAMP AT TIME ZONE site.timezone)::date,
          CASE WHEN COALESCE(risk.residual_level, risk.inherent_level) IN ('HIGH','CRITICAL')
            THEN 'HIGH' ELSE 'NORMAL' END
          INTO source_package_id, expected_due_at, expected_data_date, expected_priority
        FROM risks risk
        JOIN sites site ON site.tenant_id = risk.tenant_id AND site.project_id = risk.project_id
          AND site.is_primary = true
        WHERE risk.tenant_id = NEW.tenant_id AND risk.project_id = NEW.project_id
          AND risk.id = NEW.source_id;
      ELSIF NEW.source_type = 'Issue' THEN
        SELECT issue.package_id, issue.target_date,
          (CURRENT_TIMESTAMP AT TIME ZONE site.timezone)::date,
          CASE WHEN issue.severity IN ('HIGH','CRITICAL') THEN 'HIGH' ELSE 'NORMAL' END
          INTO source_package_id, expected_due_at, expected_data_date, expected_priority
        FROM issues issue
        JOIN sites site ON site.tenant_id = issue.tenant_id AND site.project_id = issue.project_id
          AND site.is_primary = true
        WHERE issue.tenant_id = NEW.tenant_id AND issue.project_id = NEW.project_id
          AND issue.id = NEW.source_id;
      ELSIF NEW.source_type = 'RiskIssueAction' THEN
        SELECT action.package_id, action.due_date,
          (CURRENT_TIMESTAMP AT TIME ZONE site.timezone)::date, 'HIGH'
          INTO source_package_id, expected_due_at, expected_data_date, expected_priority
        FROM risk_issue_actions action
        JOIN sites site ON site.tenant_id = action.tenant_id AND site.project_id = action.project_id
          AND site.is_primary = true
        WHERE action.tenant_id = NEW.tenant_id AND action.project_id = NEW.project_id
          AND action.id = NEW.source_id;
      ELSIF NEW.source_type = 'ChangeRequest' THEN
        SELECT change.package_id,
          (change.submitted_at AT TIME ZONE site.timezone)::date,
          (change.submitted_at AT TIME ZONE site.timezone)::date, 'NORMAL'
          INTO source_package_id, expected_due_at, expected_data_date, expected_priority
        FROM change_requests change
        JOIN sites site ON site.tenant_id = change.tenant_id AND site.project_id = change.project_id
          AND site.is_primary = true
        WHERE change.tenant_id = NEW.tenant_id AND change.project_id = NEW.project_id
          AND change.id = NEW.source_id AND change.submitted_at IS NOT NULL;`;

/**
 * Escalation branch. The escalation business date lives on no source row the trigger could read in
 * a timezone-safe way (last_escalated_at is a timestamptz; the projection date is a site-timezone
 * policy of the worker), so the worker supplies due_at/data_date and the trigger pins everything
 * else that IS canonical here: the source instance must exist in this tenant AND project, the
 * notification carries no package (an approval reminder addresses step approvers, not a package),
 * and the priority is always HIGH.
 */
const workflowInstanceBranch = `
      ELSIF NEW.source_type = 'WorkflowInstance' THEN
        SELECT NULL::uuid, NEW.due_at, NEW.data_date, 'HIGH'
          INTO source_package_id, expected_due_at, expected_data_date, expected_priority
        FROM workflow_instances instance
        WHERE instance.tenant_id = NEW.tenant_id AND instance.id = NEW.source_id
          AND instance.project_id = NEW.project_id;`;

const sharedEpilogue = `
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_notification_source_scope',
          MESSAGE = 'notification source or primary project Site does not exist in tenant/project scope';
      END IF;
      IF source_package_id IS DISTINCT FROM NEW.package_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_notification_source_package_scope',
          MESSAGE = 'notification package scope must match source';
      END IF;
      IF NEW.due_at <> expected_due_at OR NEW.data_date <> expected_data_date THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_notification_source_dates',
          MESSAGE = 'notification due/data dates must use the canonical source policy';
      END IF;
      IF NEW.priority <> expected_priority THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_notification_source_priority',
          MESSAGE = 'notification priority must use the canonical source policy';
      END IF;
      RETURN NEW;
    END $$`;

function sourceScopeFunction(extraBranches: string): string {
  return `CREATE OR REPLACE FUNCTION enforce_notification_source_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE source_package_id uuid;
    DECLARE expected_due_at date;
    DECLARE expected_data_date date;
    DECLARE expected_priority varchar(20);
    BEGIN${baseSourceBranches}${extraBranches}
      END IF;
${sharedEpilogue}`;
}

export class ExtendWorkflowEscalationNotificationSource1783756000000 implements MigrationInterface {
  name = 'ExtendWorkflowEscalationNotificationSource1783756000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workflow_instances
      ADD COLUMN escalation_count integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE workflow_instances
      ADD COLUMN last_escalated_at timestamptz`);
    await queryRunner.query(`ALTER TABLE workflow_instances
      ADD CONSTRAINT ck_workflow_instance_escalation CHECK (escalation_count >= 0)`);
    await queryRunner.query(`ALTER TABLE workflow_instances
      ADD CONSTRAINT ck_workflow_instance_escalation_pair CHECK
        ((escalation_count = 0) = (last_escalated_at IS NULL))`);

    // Merge-order guard: no-ops here (1783738 created the column NOT NULL with its FK), but keeps
    // this migration valid if a sibling relaxes/reshapes the column before this one runs.
    if (!await queryRunner.hasColumn('workflow_instances', 'project_id')) {
      await queryRunner.query('ALTER TABLE workflow_instances ADD COLUMN project_id uuid');
    }
    const [projectFk] = await queryRunner.query(`SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_workflow_instance_project'
        AND conrelid = 'workflow_instances'::regclass`) as unknown[];
    if (!projectFk) {
      await queryRunner.query(`ALTER TABLE workflow_instances
        ADD CONSTRAINT fk_workflow_instance_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT`);
    }

    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_source_type');
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_source_type CHECK
      (source_type IN ('ScheduleActivity','Risk','Issue','RiskIssueAction','ChangeRequest','WorkflowInstance'))`);
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_alert_mapping');
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_alert_mapping CHECK (
      (source_type = 'ScheduleActivity' AND alert_type IN ('OVERDUE','NEAR_CRITICAL'))
      OR (source_type = 'Risk' AND alert_type = 'RISK_REVIEW_DUE')
      OR (source_type = 'Issue' AND alert_type = 'ISSUE_TARGET_DUE')
      OR (source_type = 'RiskIssueAction' AND alert_type = 'ACTION_OVERDUE')
      OR (source_type = 'ChangeRequest' AND alert_type = 'CHANGE_DECISION_PENDING')
      OR (source_type = 'WorkflowInstance' AND alert_type = 'APPROVAL_ESCALATED'))`);
    await queryRunner.query(sourceScopeFunction(workflowInstanceBranch));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // WorkflowInstance notifications are a rebuildable worker projection: the next escalation event
    // reprojects them, so deleting only these rows is a lossless narrowing.
    await queryRunner.query(`DELETE FROM notifications WHERE source_type = 'WorkflowInstance'`);

    await queryRunner.query(sourceScopeFunction(''));
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_alert_mapping');
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_alert_mapping CHECK (
      (source_type = 'ScheduleActivity' AND alert_type IN ('OVERDUE','NEAR_CRITICAL'))
      OR (source_type = 'Risk' AND alert_type = 'RISK_REVIEW_DUE')
      OR (source_type = 'Issue' AND alert_type = 'ISSUE_TARGET_DUE')
      OR (source_type = 'RiskIssueAction' AND alert_type = 'ACTION_OVERDUE')
      OR (source_type = 'ChangeRequest' AND alert_type = 'CHANGE_DECISION_PENDING'))`);
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_source_type');
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_source_type CHECK
      (source_type IN ('ScheduleActivity','Risk','Issue','RiskIssueAction','ChangeRequest'))`);

    // project_id (and its FK) belong to 1783738 in this repository and are never dropped here.
    await queryRunner.query(`ALTER TABLE workflow_instances
      DROP CONSTRAINT ck_workflow_instance_escalation_pair`);
    await queryRunner.query(`ALTER TABLE workflow_instances
      DROP CONSTRAINT ck_workflow_instance_escalation`);
    await queryRunner.query('ALTER TABLE workflow_instances DROP COLUMN last_escalated_at');
    await queryRunner.query('ALTER TABLE workflow_instances DROP COLUMN escalation_count');
  }
}
