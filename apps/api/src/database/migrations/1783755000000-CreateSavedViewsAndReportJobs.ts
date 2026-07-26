import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-106 `saved_views` and DB-107 `report_jobs` (FR-171…FR-173, US-023, API-131…API-134).
 *
 * saved_views: `ck_saved_view_share_scope` is deliberately single-valued ('PRIVATE') so sharing a
 * view is impossible by construction in V1 — widening that CHECK is the future approval gate, not
 * a code path. A view stores presentation state only; permissions are re-evaluated on every use.
 *
 * report_jobs: the API inserts QUEUED rows, the worker owns every transition. A COMPLETED row is a
 * published snapshot: `ck_report_job_completed_projection` requires the output facts, and
 * `trg_report_job_completed_immutable` freezes `output_object_ref`/`data_as_of` forever after.
 */
export class CreateSavedViewsAndReportJobs1783755000000 implements MigrationInterface {
  name = 'CreateSavedViewsAndReportJobs1783755000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE saved_views (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      owner_user_id uuid NOT NULL,
      name varchar(200) NOT NULL,
      target_type varchar(40) NOT NULL,
      filter_snapshot jsonb NOT NULL DEFAULT '{}',
      column_snapshot jsonb NOT NULL DEFAULT '[]',
      sort_snapshot jsonb NOT NULL DEFAULT '[]',
      share_scope varchar(20) NOT NULL DEFAULT 'PRIVATE',
      version_no integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_saved_views PRIMARY KEY (id),
      CONSTRAINT uq_saved_views_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_saved_view_owner_name UNIQUE (tenant_id, owner_user_id, target_type, name),
      CONSTRAINT fk_saved_view_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_saved_view_owner FOREIGN KEY (tenant_id, owner_user_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_saved_view_name CHECK (length(trim(name)) > 0),
      CONSTRAINT ck_saved_view_target CHECK (target_type IN
        ('PROJECT','DOCUMENT','RISK','ISSUE','CHANGE_REQUEST','CONTRACT')),
      CONSTRAINT ck_saved_view_share_scope CHECK (share_scope IN ('PRIVATE')),
      CONSTRAINT ck_saved_view_filter_object CHECK (jsonb_typeof(filter_snapshot) = 'object'),
      CONSTRAINT ck_saved_view_columns_array CHECK (jsonb_typeof(column_snapshot) = 'array'),
      CONSTRAINT ck_saved_view_sort_array CHECK (jsonb_typeof(sort_snapshot) = 'array'),
      CONSTRAINT ck_saved_view_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_saved_view_owner
      ON saved_views (tenant_id, owner_user_id, target_type, created_at)`);

    await queryRunner.query(`CREATE TABLE report_jobs (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      report_type varchar(40) NOT NULL,
      filter_snapshot jsonb NOT NULL DEFAULT '{}',
      data_as_of timestamptz,
      status varchar(20) NOT NULL,
      output_object_ref jsonb,
      error_code varchar(80),
      expires_at timestamptz,
      requested_by uuid NOT NULL,
      correlation_id varchar(100) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_report_jobs PRIMARY KEY (id),
      CONSTRAINT uq_report_jobs_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_report_job_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_report_job_requester FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_report_job_type CHECK
        (report_type IN ('RISK_REGISTER_CSV','DOCUMENT_REGISTER_CSV')),
      CONSTRAINT ck_report_job_status CHECK
        (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
      CONSTRAINT ck_report_job_filter_object CHECK (jsonb_typeof(filter_snapshot) = 'object'),
      CONSTRAINT ck_report_job_output_object CHECK
        (output_object_ref IS NULL OR jsonb_typeof(output_object_ref) = 'object'),
      CONSTRAINT ck_report_job_completed_projection CHECK (status <> 'COMPLETED' OR (
        output_object_ref IS NOT NULL AND data_as_of IS NOT NULL AND expires_at IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE INDEX idx_report_job_requester
      ON report_jobs (tenant_id, requested_by, status, created_at)`);

    // A COMPLETED report is a published snapshot: its object reference and data-as-of moment may
    // never be rewritten, otherwise a reader could be handed different bytes under the same job id.
    await queryRunner.query(`CREATE FUNCTION prevent_completed_report_job_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status = 'COMPLETED' AND (
        NEW.output_object_ref IS DISTINCT FROM OLD.output_object_ref
        OR NEW.data_as_of IS DISTINCT FROM OLD.data_as_of
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'completed report job output snapshot is immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_report_job_completed_immutable
      BEFORE UPDATE ON report_jobs
      FOR EACH ROW EXECUTE FUNCTION prevent_completed_report_job_mutation()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_report_job_completed_immutable ON report_jobs'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS prevent_completed_report_job_mutation()');
    await queryRunner.query('DROP TABLE report_jobs');
    await queryRunner.query('DROP TABLE saved_views');
  }
}
