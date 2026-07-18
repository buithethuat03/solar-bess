import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GeneralizeNotifications1783733000000 implements MigrationInterface {
  name = 'GeneralizeNotifications1783733000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM schedule_notifications notification
        LEFT JOIN schedule_activities activity
          ON activity.tenant_id = notification.tenant_id
          AND activity.project_id = notification.project_id
          AND activity.id = notification.activity_id
        WHERE notification.source_type <> 'ScheduleActivity'
          OR notification.source_id <> notification.activity_id
          OR notification.alert_type NOT IN ('OVERDUE','NEAR_CRITICAL')
          OR activity.id IS NULL
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'existing schedule notification violates DB-105 schedule source invariants';
      END IF;
    END $$`);

    await queryRunner.query('ALTER TABLE schedule_notifications RENAME TO notifications');
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT uq_schedule_notifications_tenant_id TO uq_notifications_tenant_id`);
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT uq_schedule_notification_dedup TO uq_notification_dedup`);
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT fk_schedule_notifications_tenant_recipient TO fk_notifications_tenant_recipient`);
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT fk_schedule_notifications_tenant_project TO fk_notifications_tenant_project`);
    await queryRunner.query('ALTER INDEX idx_schedule_notification_inbox RENAME TO idx_notification_inbox');

    await queryRunner.query('ALTER TABLE notifications ADD COLUMN package_id uuid NULL');
    await queryRunner.query(`UPDATE notifications notification SET package_id = activity.package_id
      FROM schedule_activities activity
      WHERE notification.source_type = 'ScheduleActivity'
        AND activity.tenant_id = notification.tenant_id
        AND activity.project_id = notification.project_id
        AND activity.id = notification.activity_id`);

    await queryRunner.query(`ALTER TABLE notifications
      DROP CONSTRAINT fk_schedule_notifications_tenant_activity`);
    await queryRunner.query(`ALTER TABLE notifications
      DROP CONSTRAINT IF EXISTS ck_schedule_notification_source`);
    await queryRunner.query('ALTER TABLE notifications ALTER COLUMN activity_id DROP NOT NULL');
    await queryRunner.query(`ALTER TABLE notifications
      ADD CONSTRAINT fk_notifications_tenant_package
      FOREIGN KEY (tenant_id, project_id, package_id)
      REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE notifications
      ADD CONSTRAINT fk_notifications_tenant_activity
      FOREIGN KEY (tenant_id, project_id, activity_id)
      REFERENCES schedule_activities (tenant_id, project_id, id) ON DELETE RESTRICT`);

    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_schedule_notification_alert_type');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_schedule_notification_priority');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_schedule_notification_status');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_schedule_notification_read');
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_source_type CHECK
      (source_type IN ('ScheduleActivity','Risk','Issue','RiskIssueAction','ChangeRequest'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_source_activity CHECK (
      (source_type = 'ScheduleActivity' AND activity_id = source_id)
      OR (source_type <> 'ScheduleActivity' AND activity_id IS NULL))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_alert_mapping CHECK (
      (source_type = 'ScheduleActivity' AND alert_type IN ('OVERDUE','NEAR_CRITICAL'))
      OR (source_type = 'Risk' AND alert_type = 'RISK_REVIEW_DUE')
      OR (source_type = 'Issue' AND alert_type = 'ISSUE_TARGET_DUE')
      OR (source_type = 'RiskIssueAction' AND alert_type = 'ACTION_OVERDUE')
      OR (source_type = 'ChangeRequest' AND alert_type = 'CHANGE_DECISION_PENDING'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_priority CHECK
      (priority IN ('NORMAL','HIGH'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_status CHECK
      (status IN ('UNREAD','READ'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_read CHECK
      (status <> 'READ' OR read_at IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_notification_threshold_version CHECK
      (length(trim(threshold_version)) > 0)`);

    await queryRunner.query('DROP INDEX idx_schedule_notification_activity');
    await queryRunner.query(`CREATE INDEX idx_notification_source
      ON notifications (tenant_id, project_id, package_id, source_type, source_id)`);
    await queryRunner.query(`CREATE INDEX idx_notification_schedule_activity
      ON notifications (tenant_id, project_id, activity_id, data_date)
      WHERE source_type = 'ScheduleActivity'`);

    await queryRunner.query(`CREATE FUNCTION enforce_notification_source_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE source_package_id uuid;
    DECLARE expected_due_at date;
    DECLARE expected_data_date date;
    DECLARE expected_priority varchar(20);
    BEGIN
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
          AND change.id = NEW.source_id AND change.submitted_at IS NOT NULL;
      END IF;

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
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_notification_source_scope
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, package_id, activity_id, source_type,
        source_id, alert_type, priority, due_at, data_date, threshold_version
      ON notifications
      FOR EACH ROW EXECUTE FUNCTION enforce_notification_source_scope()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM notifications WHERE source_type <> 'ScheduleActivity'`);
    await queryRunner.query(`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM notifications notification
        LEFT JOIN schedule_activities activity
          ON activity.tenant_id = notification.tenant_id
          AND activity.project_id = notification.project_id
          AND activity.id = notification.activity_id
        WHERE notification.source_type <> 'ScheduleActivity'
          OR notification.activity_id IS NULL
          OR notification.source_id <> notification.activity_id
          OR notification.alert_type NOT IN ('OVERDUE','NEAR_CRITICAL')
          OR activity.id IS NULL
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = 'cannot restore schedule_notifications because schedule rows violate old invariants';
      END IF;
    END $$`);

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_notification_source_scope ON notifications');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_notification_source_scope()');
    await queryRunner.query('DROP INDEX IF EXISTS idx_notification_schedule_activity');
    await queryRunner.query('DROP INDEX IF EXISTS idx_notification_source');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_threshold_version');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_read');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_status');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_priority');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_alert_mapping');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_source_activity');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT ck_notification_source_type');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT fk_notifications_tenant_activity');
    await queryRunner.query('ALTER TABLE notifications DROP CONSTRAINT fk_notifications_tenant_package');
    await queryRunner.query('ALTER TABLE notifications DROP COLUMN package_id');
    await queryRunner.query('ALTER TABLE notifications ALTER COLUMN activity_id SET NOT NULL');
    await queryRunner.query(`ALTER TABLE notifications
      ADD CONSTRAINT fk_schedule_notifications_tenant_activity
      FOREIGN KEY (tenant_id, project_id, activity_id)
      REFERENCES schedule_activities (tenant_id, project_id, id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_schedule_notification_source CHECK
      (source_type = 'ScheduleActivity' AND source_id = activity_id)`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_schedule_notification_alert_type CHECK
      (alert_type IN ('OVERDUE','NEAR_CRITICAL'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_schedule_notification_priority CHECK
      (priority IN ('NORMAL','HIGH'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_schedule_notification_status CHECK
      (status IN ('UNREAD','READ'))`);
    await queryRunner.query(`ALTER TABLE notifications ADD CONSTRAINT ck_schedule_notification_read CHECK
      (status <> 'READ' OR read_at IS NOT NULL)`);
    await queryRunner.query(`CREATE INDEX idx_schedule_notification_activity
      ON notifications (tenant_id, project_id, activity_id, data_date)`);

    await queryRunner.query('ALTER INDEX idx_notification_inbox RENAME TO idx_schedule_notification_inbox');
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT fk_notifications_tenant_project TO fk_schedule_notifications_tenant_project`);
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT fk_notifications_tenant_recipient TO fk_schedule_notifications_tenant_recipient`);
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT uq_notification_dedup TO uq_schedule_notification_dedup`);
    await queryRunner.query(`ALTER TABLE notifications
      RENAME CONSTRAINT uq_notifications_tenant_id TO uq_schedule_notifications_tenant_id`);
    await queryRunner.query('ALTER TABLE notifications RENAME TO schedule_notifications');
  }
}
