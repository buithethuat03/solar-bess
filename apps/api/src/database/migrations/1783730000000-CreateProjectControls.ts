import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectControls1783730000000 implements MigrationInterface {
  name = 'CreateProjectControls1783730000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE packages (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      parent_package_id uuid NULL,
      contractor_company_id uuid NULL,
      code varchar(64) NOT NULL,
      name varchar(200) NOT NULL,
      package_type varchar(80) NOT NULL,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      idempotency_key varchar(200) NULL,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_packages_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_packages_tenant_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_package_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_packages_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_packages_tenant_parent FOREIGN KEY (tenant_id, project_id, parent_package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_packages_tenant_contractor FOREIGN KEY (tenant_id, contractor_company_id)
        REFERENCES companies (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_packages_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_packages_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_package_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
      CONSTRAINT ck_package_version CHECK (version_no >= 1),
      CONSTRAINT ck_package_parent_not_self CHECK (parent_package_id IS NULL OR parent_package_id <> id))`);
    await queryRunner.query(`CREATE INDEX idx_package_filters
      ON packages (tenant_id, project_id, parent_package_id, status)`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_package_tenant_idempotency
      ON packages (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);

    await queryRunner.query('ALTER TABLE role_assignments DROP CONSTRAINT ck_role_assignment_scope');
    await queryRunner.query(`ALTER TABLE role_assignments ADD CONSTRAINT ck_role_assignment_scope CHECK (
      (scope_type = 'TENANT' AND scope_id IS NULL) OR
      (scope_type IN ('PORTFOLIO','PROJECT','PACKAGE') AND scope_id IS NOT NULL))`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_role_assignment_scope_tenant()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.scope_type = 'TENANT' THEN
        IF NEW.scope_id IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514', CONSTRAINT = 'ck_role_assignment_scope',
            MESSAGE = 'TENANT role assignment cannot have scope_id';
        END IF;
      ELSIF NEW.scope_type = 'PORTFOLIO' THEN
        IF NOT EXISTS (
          SELECT 1 FROM portfolios WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503', CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Portfolio scope does not belong to role assignment tenant';
        END IF;
      ELSIF NEW.scope_type = 'PROJECT' THEN
        IF NOT EXISTS (
          SELECT 1 FROM projects WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503', CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Project scope does not belong to role assignment tenant';
        END IF;
      ELSIF NEW.scope_type = 'PACKAGE' THEN
        IF NOT EXISTS (
          SELECT 1 FROM packages WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503', CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Package scope does not belong to role assignment tenant';
        END IF;
      ELSE
        RAISE EXCEPTION USING
          ERRCODE = '23514', CONSTRAINT = 'ck_role_assignment_scope',
          MESSAGE = 'Unsupported role assignment scope type';
      END IF;
      RETURN NEW;
    END $$`);

    await queryRunner.query(`CREATE TABLE project_schedules (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      timezone varchar(100) NOT NULL,
      calendar_code varchar(64) NOT NULL,
      working_week jsonb NOT NULL,
      calendar_exceptions jsonb NOT NULL,
      data_date date NOT NULL,
      status varchar(20) NOT NULL,
      source_format varchar(30) NOT NULL,
      source_name varchar(250) NOT NULL,
      source_hash varchar(128) NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_project_schedules_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_project_schedules_scope_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_project_schedule_project UNIQUE (tenant_id, project_id),
      CONSTRAINT fk_project_schedules_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_project_schedules_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_project_schedules_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_project_schedule_status CHECK
        (status IN ('DRAFT','VALIDATED','SUBMITTED','APPROVED','RETURNED','REJECTED')),
      CONSTRAINT ck_project_schedule_source CHECK
        (source_format IN ('MANUAL','CANONICAL_CSV','CANONICAL_JSON')),
      CONSTRAINT ck_project_schedule_version CHECK (version_no >= 1),
      CONSTRAINT ck_project_schedule_working_week_array CHECK
        (jsonb_typeof(working_week) = 'array' AND jsonb_array_length(working_week) BETWEEN 1 AND 7),
      CONSTRAINT ck_project_schedule_exceptions_array CHECK
        (jsonb_typeof(calendar_exceptions) = 'array'))`);
    await queryRunner.query(`CREATE INDEX idx_project_schedule_status_date
      ON project_schedules (tenant_id, project_id, status, data_date)`);

    await queryRunner.query(`CREATE TABLE wbs_nodes (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      schedule_id uuid NOT NULL,
      package_id uuid NULL,
      parent_wbs_id uuid NULL,
      owner_id uuid NULL,
      code varchar(80) NOT NULL,
      name varchar(250) NOT NULL,
      description varchar(2000) NULL,
      weight numeric(7,4) NOT NULL,
      sort_order integer NOT NULL,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_wbs_nodes_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_wbs_nodes_scope_id UNIQUE (tenant_id, project_id, schedule_id, id),
      CONSTRAINT uq_wbs_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_wbs_tenant_schedule FOREIGN KEY (tenant_id, project_id, schedule_id)
        REFERENCES project_schedules (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_wbs_tenant_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_wbs_tenant_parent FOREIGN KEY (tenant_id, project_id, schedule_id, parent_wbs_id)
        REFERENCES wbs_nodes (tenant_id, project_id, schedule_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_wbs_tenant_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_wbs_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_wbs_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_wbs_status CHECK (status IN ('ACTIVE','ARCHIVED')),
      CONSTRAINT ck_wbs_weight CHECK (weight > 0 AND weight <= 100),
      CONSTRAINT ck_wbs_sort_order CHECK (sort_order >= 0),
      CONSTRAINT ck_wbs_version CHECK (version_no >= 1),
      CONSTRAINT ck_wbs_parent_not_self CHECK (parent_wbs_id IS NULL OR parent_wbs_id <> id))`);
    await queryRunner.query(`CREATE INDEX idx_wbs_hierarchy
      ON wbs_nodes (tenant_id, schedule_id, parent_wbs_id, sort_order)`);
    await queryRunner.query(`CREATE INDEX idx_wbs_scope_filters
      ON wbs_nodes (tenant_id, project_id, package_id, owner_id, status)`);

    await queryRunner.query(`CREATE TABLE schedule_activities (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      schedule_id uuid NOT NULL,
      wbs_id uuid NOT NULL,
      package_id uuid NULL,
      owner_id uuid NOT NULL,
      code varchar(80) NOT NULL,
      name varchar(250) NOT NULL,
      activity_type varchar(20) NOT NULL,
      weight numeric(7,4) NOT NULL,
      planned_start date NOT NULL,
      planned_finish date NOT NULL,
      forecast_start date NULL,
      forecast_finish date NULL,
      actual_start date NULL,
      actual_finish date NULL,
      duration_work_days integer NOT NULL,
      remaining_duration_work_days integer NOT NULL,
      percent_complete numeric(5,2) NOT NULL DEFAULT 0,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_schedule_activities_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_schedule_activities_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_schedule_activities_scope_id UNIQUE (tenant_id, project_id, schedule_id, id),
      CONSTRAINT uq_schedule_activity_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_schedule_activities_tenant_schedule
        FOREIGN KEY (tenant_id, project_id, schedule_id)
        REFERENCES project_schedules (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_activities_tenant_wbs
        FOREIGN KEY (tenant_id, project_id, schedule_id, wbs_id)
        REFERENCES wbs_nodes (tenant_id, project_id, schedule_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_activities_tenant_package
        FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_activities_tenant_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_activities_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_activities_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_schedule_activity_type CHECK (activity_type IN ('TASK','MILESTONE')),
      CONSTRAINT ck_schedule_activity_status CHECK
        (status IN ('DRAFT','READY','IN_PROGRESS','BLOCKED','COMPLETE','CANCELLED')),
      CONSTRAINT ck_schedule_activity_weight CHECK (weight > 0 AND weight <= 100),
      CONSTRAINT ck_schedule_activity_duration CHECK
        (duration_work_days >= 0 AND remaining_duration_work_days >= 0),
      CONSTRAINT ck_schedule_activity_percent CHECK
        (percent_complete >= 0 AND percent_complete <= 100),
      CONSTRAINT ck_schedule_activity_type_duration CHECK (
        (activity_type = 'MILESTONE' AND duration_work_days = 0 AND planned_start = planned_finish) OR
        (activity_type = 'TASK' AND duration_work_days > 0 AND planned_finish >= planned_start)),
      CONSTRAINT ck_schedule_activity_forecast_dates CHECK
        (forecast_finish IS NULL OR (forecast_start IS NOT NULL AND forecast_finish >= forecast_start)),
      CONSTRAINT ck_schedule_activity_actual_dates CHECK
        (actual_finish IS NULL OR (actual_start IS NOT NULL AND actual_finish >= actual_start)),
      CONSTRAINT ck_schedule_activity_actual_finish_progress CHECK
        (actual_finish IS NULL OR percent_complete = 100),
      CONSTRAINT ck_schedule_activity_version CHECK (version_no >= 1))`);
    await queryRunner.query(`CREATE INDEX idx_schedule_activity_status_dates
      ON schedule_activities (tenant_id, project_id, status, planned_start, planned_finish)`);
    await queryRunner.query(`CREATE INDEX idx_schedule_activity_scope
      ON schedule_activities (tenant_id, project_id, wbs_id, package_id, owner_id)`);

    await queryRunner.query(`CREATE TABLE activity_dependencies (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      schedule_id uuid NOT NULL,
      predecessor_id uuid NOT NULL,
      successor_id uuid NOT NULL,
      dependency_type varchar(2) NOT NULL,
      lag_work_days integer NOT NULL DEFAULT 0,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_activity_dependencies_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_activity_dependency_edge UNIQUE
        (tenant_id, predecessor_id, successor_id, dependency_type),
      CONSTRAINT fk_activity_dependencies_tenant_schedule
        FOREIGN KEY (tenant_id, project_id, schedule_id)
        REFERENCES project_schedules (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_activity_dependencies_tenant_predecessor
        FOREIGN KEY (tenant_id, project_id, schedule_id, predecessor_id)
        REFERENCES schedule_activities (tenant_id, project_id, schedule_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_activity_dependencies_tenant_successor
        FOREIGN KEY (tenant_id, project_id, schedule_id, successor_id)
        REFERENCES schedule_activities (tenant_id, project_id, schedule_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_activity_dependencies_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_activity_dependencies_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_activity_dependency_type CHECK (dependency_type IN ('FS','SS','FF','SF')),
      CONSTRAINT ck_activity_dependency_not_self CHECK (predecessor_id <> successor_id),
      CONSTRAINT ck_activity_dependency_lag CHECK (lag_work_days BETWEEN -3650 AND 3650))`);
    await queryRunner.query(`CREATE INDEX idx_activity_dependency_successor
      ON activity_dependencies (tenant_id, schedule_id, successor_id)`);
    await queryRunner.query(`CREATE INDEX idx_activity_dependency_predecessor
      ON activity_dependencies (tenant_id, schedule_id, predecessor_id)`);

    await queryRunner.query(`CREATE TABLE schedule_baselines (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      schedule_id uuid NOT NULL,
      baseline_number integer NOT NULL,
      baseline_type varchar(20) NOT NULL,
      status varchar(20) NOT NULL,
      data_date date NOT NULL,
      snapshot jsonb NOT NULL,
      snapshot_hash varchar(64) NOT NULL,
      reason varchar(2000) NOT NULL,
      impact_summary varchar(4000) NOT NULL,
      approved_change_request_id uuid NULL,
      replaces_baseline_id uuid NULL,
      created_by uuid NOT NULL,
      submitted_by uuid NULL,
      submitted_at timestamptz NULL,
      approved_by uuid NULL,
      approved_at timestamptz NULL,
      decision_comment varchar(2000) NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_schedule_baselines_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_schedule_baselines_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_schedule_baselines_scope_id UNIQUE (tenant_id, project_id, schedule_id, id),
      CONSTRAINT uq_schedule_baseline_number UNIQUE (tenant_id, project_id, baseline_number),
      CONSTRAINT fk_schedule_baselines_tenant_schedule
        FOREIGN KEY (tenant_id, project_id, schedule_id)
        REFERENCES project_schedules (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_baselines_tenant_replaces
        FOREIGN KEY (tenant_id, project_id, schedule_id, replaces_baseline_id)
        REFERENCES schedule_baselines (tenant_id, project_id, schedule_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_baselines_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_baselines_tenant_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_baselines_tenant_approved_by FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_schedule_baseline_type CHECK (baseline_type IN ('INITIAL','REBASELINE')),
      CONSTRAINT ck_schedule_baseline_status CHECK
        (status IN ('DRAFT','SUBMITTED','RETURNED','REJECTED','APPROVED','SUPERSEDED')),
      CONSTRAINT ck_schedule_baseline_number CHECK (baseline_number >= 1),
      CONSTRAINT ck_schedule_baseline_version CHECK (version_no >= 1),
      CONSTRAINT ck_schedule_baseline_snapshot_object CHECK (jsonb_typeof(snapshot) = 'object'),
      CONSTRAINT ck_schedule_baseline_snapshot_hash CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_schedule_baseline_rebaseline_change CHECK
        (baseline_type <> 'REBASELINE' OR approved_change_request_id IS NOT NULL),
      CONSTRAINT ck_schedule_baseline_submit_pair CHECK
        ((submitted_by IS NULL) = (submitted_at IS NULL)),
      CONSTRAINT ck_schedule_baseline_approval_pair CHECK
        ((approved_by IS NULL) = (approved_at IS NULL)),
      CONSTRAINT ck_schedule_baseline_approved_actor CHECK
        (status NOT IN ('APPROVED','SUPERSEDED') OR approved_by IS NOT NULL))`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_schedule_baseline_current
      ON schedule_baselines (tenant_id, project_id) WHERE status = 'APPROVED'`);
    await queryRunner.query(`CREATE INDEX idx_schedule_baseline_history
      ON schedule_baselines (tenant_id, project_id, status, baseline_number)`);

    await queryRunner.query(`CREATE FUNCTION protect_schedule_baseline_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.status IN ('APPROVED','SUPERSEDED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved schedule baseline is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'SUPERSEDED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'superseded schedule baseline is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'APPROVED' THEN
        IF NEW.status = 'SUPERSEDED'
           AND (to_jsonb(NEW) - ARRAY['status','version_no','updated_at']::text[])
             = (to_jsonb(OLD) - ARRAY['status','version_no','updated_at']::text[]) THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved schedule baseline is immutable';
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_schedule_baseline_immutable
      BEFORE UPDATE OR DELETE ON schedule_baselines
      FOR EACH ROW EXECUTE FUNCTION protect_schedule_baseline_history()`);

    await queryRunner.query(`CREATE TABLE progress_updates (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      activity_id uuid NOT NULL,
      correction_of_id uuid NULL,
      data_date date NOT NULL,
      percent_complete numeric(5,2) NOT NULL,
      remaining_duration_work_days integer NOT NULL,
      quantity numeric(19,4) NULL,
      unit varchar(40) NULL,
      actual_start date NULL,
      actual_finish date NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      note varchar(2000) NULL,
      reason varchar(2000) NULL,
      source_key varchar(200) NOT NULL,
      recorded_by uuid NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_progress_updates_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_progress_updates_scope_id UNIQUE (tenant_id, project_id, activity_id, id),
      CONSTRAINT uq_progress_update_source UNIQUE (tenant_id, source_key),
      CONSTRAINT fk_progress_updates_tenant_activity
        FOREIGN KEY (tenant_id, project_id, activity_id)
        REFERENCES schedule_activities (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_progress_updates_tenant_correction
        FOREIGN KEY (tenant_id, project_id, activity_id, correction_of_id)
        REFERENCES progress_updates (tenant_id, project_id, activity_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_progress_updates_tenant_recorded_by FOREIGN KEY (tenant_id, recorded_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_progress_update_percent CHECK (percent_complete >= 0 AND percent_complete <= 100),
      CONSTRAINT ck_progress_update_remaining CHECK (remaining_duration_work_days >= 0),
      CONSTRAINT ck_progress_update_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_progress_update_correction CHECK
        (correction_of_id IS NULL OR (correction_of_id <> id AND length(trim(reason)) > 0)),
      CONSTRAINT ck_progress_update_actual_dates CHECK
        (actual_finish IS NULL OR (actual_start IS NOT NULL AND actual_finish >= actual_start)),
      CONSTRAINT ck_progress_update_actual_finish CHECK
        (actual_finish IS NULL OR (percent_complete = 100 AND jsonb_array_length(evidence_refs) > 0)))`);
    await queryRunner.query(`CREATE INDEX idx_progress_update_activity_date
      ON progress_updates (tenant_id, activity_id, data_date, recorded_at)`);

    await queryRunner.query(`CREATE FUNCTION prevent_progress_update_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'progress_updates are append-only';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_progress_updates_append_only
      BEFORE UPDATE OR DELETE ON progress_updates
      FOR EACH ROW EXECUTE FUNCTION prevent_progress_update_mutation()`);

    await queryRunner.query(`CREATE TABLE schedule_notifications (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      recipient_user_id uuid NOT NULL,
      project_id uuid NOT NULL,
      activity_id uuid NOT NULL,
      source_type varchar(80) NOT NULL,
      source_id uuid NOT NULL,
      alert_type varchar(30) NOT NULL,
      priority varchar(20) NOT NULL,
      object_link varchar(500) NOT NULL,
      reason varchar(2000) NOT NULL,
      due_at date NOT NULL,
      data_date date NOT NULL,
      threshold_version varchar(100) NOT NULL,
      dedup_key varchar(200) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'UNREAD',
      read_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_schedule_notifications_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_schedule_notification_dedup UNIQUE (tenant_id, dedup_key),
      CONSTRAINT fk_schedule_notifications_tenant_recipient
        FOREIGN KEY (tenant_id, recipient_user_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_notifications_tenant_project
        FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_schedule_notifications_tenant_activity
        FOREIGN KEY (tenant_id, project_id, activity_id)
        REFERENCES schedule_activities (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_schedule_notification_alert_type CHECK
        (alert_type IN ('OVERDUE','NEAR_CRITICAL')),
      CONSTRAINT ck_schedule_notification_priority CHECK (priority IN ('NORMAL','HIGH')),
      CONSTRAINT ck_schedule_notification_status CHECK (status IN ('UNREAD','READ')),
      CONSTRAINT ck_schedule_notification_read CHECK (status <> 'READ' OR read_at IS NOT NULL))`);
    await queryRunner.query(`CREATE INDEX idx_schedule_notification_inbox
      ON schedule_notifications (tenant_id, recipient_user_id, status, due_at)`);
    await queryRunner.query(`CREATE INDEX idx_schedule_notification_activity
      ON schedule_notifications (tenant_id, project_id, activity_id, data_date)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS schedule_notifications');

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_progress_updates_append_only ON progress_updates');
    await queryRunner.query('DROP FUNCTION IF EXISTS prevent_progress_update_mutation()');
    await queryRunner.query('DROP TABLE IF EXISTS progress_updates');

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_schedule_baseline_immutable ON schedule_baselines');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_schedule_baseline_history()');
    await queryRunner.query('DROP TABLE IF EXISTS schedule_baselines');
    await queryRunner.query('DROP TABLE IF EXISTS activity_dependencies');
    await queryRunner.query('DROP TABLE IF EXISTS schedule_activities');
    await queryRunner.query('DROP TABLE IF EXISTS wbs_nodes');
    await queryRunner.query('DROP TABLE IF EXISTS project_schedules');

    await queryRunner.query('ALTER TABLE role_assignments DROP CONSTRAINT ck_role_assignment_scope');
    await queryRunner.query(`ALTER TABLE role_assignments ADD CONSTRAINT ck_role_assignment_scope CHECK (
      (scope_type = 'TENANT' AND scope_id IS NULL) OR
      (scope_type IN ('PORTFOLIO','PROJECT') AND scope_id IS NOT NULL))`);
    await queryRunner.query(`CREATE OR REPLACE FUNCTION enforce_role_assignment_scope_tenant()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.scope_type = 'TENANT' THEN
        IF NEW.scope_id IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514', CONSTRAINT = 'ck_role_assignment_scope',
            MESSAGE = 'TENANT role assignment cannot have scope_id';
        END IF;
      ELSIF NEW.scope_type = 'PORTFOLIO' THEN
        IF NOT EXISTS (
          SELECT 1 FROM portfolios WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503', CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Portfolio scope does not belong to role assignment tenant';
        END IF;
      ELSIF NEW.scope_type = 'PROJECT' THEN
        IF NOT EXISTS (
          SELECT 1 FROM projects WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503', CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Project scope does not belong to role assignment tenant';
        END IF;
      ELSE
        RAISE EXCEPTION USING
          ERRCODE = '23514', CONSTRAINT = 'ck_role_assignment_scope',
          MESSAGE = 'Unsupported role assignment scope type';
      END IF;
      RETURN NEW;
    END $$`);

    await queryRunner.query('DROP TABLE IF EXISTS packages');
  }
}
