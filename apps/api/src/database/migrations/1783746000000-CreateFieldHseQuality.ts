import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Field, HSE & Quality slice (API-086…API-097): DB-055…DB-064 plus DB-115 (StopWorkAction),
 * DB-116 (NcrDispositionCycle) and DB-117 (PunchClosureCycle) — the three new ids allocated under
 * the Product Owner's blanket delegation for this slice. The DDL mirrors the entity decorators
 * one-for-one so every constraint can be traced from TypeScript to the database and back.
 *
 * Cross-slice keys this migration RELIES ON but does not create: migration 1783744000000
 * (Engineering slice) adds `uq_sites_tenant_project_id UNIQUE (tenant_id, project_id, id)` on
 * `sites` and `uq_wbs_nodes_tenant_project_id` on `wbs_nodes`; this migration runs later and its
 * composite site/WBS foreign keys target those keys.
 *
 * Deliberate absences (recorded): no equipment/asset/serial/commissioning columns or tables — that
 * scope is deferred and omitted entirely; no ITP-create table flow — the approved ITP row is
 * materialized by the first API-095 call from an ISSUED+CLEAN document revision (its id IS the
 * revision id); CAPA rows for HSE-incident parents have the column but no V1 write path.
 */
export class CreateFieldHseQuality1783746000000 implements MigrationInterface {
  name = 'CreateFieldHseQuality1783746000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE workfronts (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      package_id uuid,
      code varchar(80) NOT NULL,
      name varchar(250) NOT NULL,
      status varchar(20) NOT NULL,
      readiness varchar(20) NOT NULL,
      released_by uuid,
      released_at timestamptz,
      suspended_reason varchar(2000),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workfronts PRIMARY KEY (id),
      CONSTRAINT uq_workfronts_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_workfronts_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_workfront_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_workfront_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_workfront_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workfront_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workfront_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workfront_released_by FOREIGN KEY (tenant_id, released_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workfront_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workfront_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_workfront_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_workfront_status CHECK
        (status IN ('PLANNED','READY','RELEASED','SUSPENDED','CLOSED')),
      CONSTRAINT ck_workfront_readiness CHECK (readiness IN ('PENDING','GATES_CLEARED')),
      CONSTRAINT ck_workfront_released_requires_gates CHECK (status <> 'RELEASED'
        OR (readiness = 'GATES_CLEARED' AND released_by IS NOT NULL)),
      CONSTRAINT ck_workfront_release_pair CHECK ((released_by IS NULL) = (released_at IS NULL)),
      CONSTRAINT ck_workfront_suspended_reason CHECK (status <> 'SUSPENDED'
        OR (suspended_reason IS NOT NULL AND length(trim(suspended_reason)) > 0)),
      CONSTRAINT ck_workfront_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_workfront_register
      ON workfronts (tenant_id, project_id, status, readiness)`);

    await queryRunner.query(`CREATE TABLE daily_logs (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      contractor_company_id uuid NOT NULL,
      log_date date NOT NULL,
      shift varchar(10) NOT NULL,
      revision integer NOT NULL DEFAULT 1,
      status varchar(20) NOT NULL,
      summary varchar(4000) NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      correction_of_id uuid,
      reason varchar(2000),
      signer_snapshot jsonb,
      signed_by uuid,
      signed_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_daily_logs PRIMARY KEY (id),
      CONSTRAINT uq_daily_logs_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_daily_logs_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_daily_log_slot_revision UNIQUE
        (tenant_id, site_id, contractor_company_id, log_date, shift, revision),
      CONSTRAINT fk_daily_log_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_contractor FOREIGN KEY (tenant_id, contractor_company_id)
        REFERENCES companies (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_correction FOREIGN KEY (tenant_id, correction_of_id)
        REFERENCES daily_logs (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_signed_by FOREIGN KEY (tenant_id, signed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_daily_log_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_daily_log_status CHECK (status IN ('DRAFT','SUBMITTED','SIGNED','SUPERSEDED')),
      CONSTRAINT ck_daily_log_shift CHECK (shift IN ('DAY','NIGHT')),
      CONSTRAINT ck_daily_log_revision CHECK (revision >= 1),
      CONSTRAINT ck_daily_log_signed_pair CHECK (((signed_by IS NULL) = (signed_at IS NULL))
        AND ((signed_by IS NULL) = (signer_snapshot IS NULL))),
      CONSTRAINT ck_daily_log_signed_status CHECK (status <> 'SIGNED' OR signed_by IS NOT NULL),
      CONSTRAINT ck_daily_log_correction CHECK (correction_of_id IS NULL
        OR (correction_of_id <> id AND revision >= 2 AND coalesce(length(trim(reason)), 0) > 0))
    )`);
    // One live (non-superseded) log per slot; corrections replace, never coexist.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_daily_log_slot_live
      ON daily_logs (tenant_id, site_id, contractor_company_id, log_date, shift)
      WHERE status <> 'SUPERSEDED'`);
    await queryRunner.query(`CREATE INDEX idx_daily_log_register
      ON daily_logs (tenant_id, project_id, log_date, status)`);

    await queryRunner.query(`CREATE TABLE quantity_progress_records (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      workfront_id uuid NOT NULL,
      wbs_node_id uuid,
      correction_of_id uuid,
      certification_of_id uuid,
      record_date date NOT NULL,
      quantity numeric(19,4) NOT NULL,
      unit varchar(40) NOT NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      reason varchar(2000),
      source_key varchar(200) NOT NULL,
      recorded_by uuid NOT NULL,
      recorded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT pk_quantity_progress_records PRIMARY KEY (id),
      CONSTRAINT uq_qpr_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_qpr_workfront_id UNIQUE (tenant_id, workfront_id, id),
      CONSTRAINT uq_qpr_source UNIQUE (tenant_id, source_key),
      CONSTRAINT fk_qpr_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_qpr_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_qpr_workfront FOREIGN KEY (tenant_id, project_id, workfront_id)
        REFERENCES workfronts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_qpr_wbs_node FOREIGN KEY (tenant_id, project_id, wbs_node_id)
        REFERENCES wbs_nodes (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_qpr_correction FOREIGN KEY (tenant_id, workfront_id, correction_of_id)
        REFERENCES quantity_progress_records (tenant_id, workfront_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_qpr_certification FOREIGN KEY (tenant_id, workfront_id, certification_of_id)
        REFERENCES quantity_progress_records (tenant_id, workfront_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_qpr_recorded_by FOREIGN KEY (tenant_id, recorded_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_qpr_quantity_positive CHECK (quantity > 0),
      CONSTRAINT ck_qpr_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_qpr_correction CHECK (correction_of_id IS NULL
        OR (correction_of_id <> id AND coalesce(length(trim(reason)), 0) > 0)),
      CONSTRAINT ck_qpr_certification CHECK
        (certification_of_id IS NULL OR certification_of_id <> id),
      CONSTRAINT ck_qpr_single_role CHECK (num_nonnulls(correction_of_id, certification_of_id) <= 1)
    )`);
    // A record is certified at most once; the certification is its own append row.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_qpr_single_certification
      ON quantity_progress_records (tenant_id, certification_of_id)
      WHERE certification_of_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_qpr_workfront_date
      ON quantity_progress_records (tenant_id, workfront_id, record_date, recorded_at)`);

    await queryRunner.query(`CREATE TABLE permits_to_work (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      workfront_id uuid NOT NULL,
      permit_type varchar(40) NOT NULL,
      description varchar(2000),
      status varchar(20) NOT NULL,
      valid_from timestamptz NOT NULL,
      valid_to timestamptz NOT NULL,
      requested_by uuid NOT NULL,
      issuer_id uuid,
      issued_at timestamptz,
      isolation_snapshot jsonb,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_permits_to_work PRIMARY KEY (id),
      CONSTRAINT uq_permits_to_work_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_permits_to_work_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_permits_to_work_tenant_site_id UNIQUE (tenant_id, site_id, id),
      CONSTRAINT fk_permit_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_workfront FOREIGN KEY (tenant_id, project_id, workfront_id)
        REFERENCES workfronts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_requested_by FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_issuer FOREIGN KEY (tenant_id, issuer_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_permit_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_permit_status CHECK (status IN
        ('DRAFT','REQUESTED','VERIFIED','ISSUED','ACTIVE','SUSPENDED','EXPIRED','CLOSED')),
      CONSTRAINT ck_permit_type CHECK (permit_type ~ '^[A-Z][A-Z0-9_]{0,39}$'),
      CONSTRAINT ck_permit_window CHECK (valid_to > valid_from),
      CONSTRAINT ck_permit_issuer_independent CHECK
        (issuer_id IS NULL OR issuer_id <> requested_by),
      CONSTRAINT ck_permit_issued_requires_issuer CHECK (status NOT IN
        ('ISSUED','ACTIVE','SUSPENDED','EXPIRED','CLOSED') OR issuer_id IS NOT NULL),
      CONSTRAINT ck_permit_issued_pair CHECK ((issuer_id IS NULL) = (issued_at IS NULL)),
      CONSTRAINT ck_permit_isolation CHECK (status NOT IN ('ISSUED','ACTIVE')
        OR (isolation_snapshot IS NOT NULL AND jsonb_typeof(isolation_snapshot) = 'array'
          AND jsonb_array_length(isolation_snapshot) >= 1)),
      CONSTRAINT ck_permit_version CHECK (version_no >= 1)
    )`);
    // One live (issued/active) permit per workfront and permit type.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_permit_active_per_type
      ON permits_to_work (tenant_id, workfront_id, permit_type)
      WHERE status IN ('ISSUED','ACTIVE')`);
    await queryRunner.query(`CREATE INDEX idx_permit_register
      ON permits_to_work (tenant_id, project_id, status)`);

    await queryRunner.query(`CREATE TABLE hse_incidents (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid,
      occurred_at timestamptz NOT NULL,
      reported_at timestamptz NOT NULL,
      reported_by uuid NOT NULL,
      incident_type varchar(30) NOT NULL,
      actual_severity varchar(10) NOT NULL,
      potential_severity varchar(10) NOT NULL,
      narrative varchar(4000) NOT NULL,
      immediate_action varchar(4000),
      restricted_facts jsonb,
      legal_hold boolean NOT NULL DEFAULT false,
      status varchar(20) NOT NULL,
      closed_by uuid,
      closed_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_hse_incidents PRIMARY KEY (id),
      CONSTRAINT uq_hse_incidents_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_hse_incidents_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT fk_hse_incident_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_hse_incident_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_hse_incident_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_hse_incident_reported_by FOREIGN KEY (tenant_id, reported_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_hse_incident_closed_by FOREIGN KEY (tenant_id, closed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_hse_incident_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_hse_incident_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_hse_incident_status CHECK (status IN ('REPORTED','INVESTIGATING','CLOSED')),
      CONSTRAINT ck_hse_incident_type CHECK (incident_type IN ('NEAR_MISS','FIRST_AID',
        'MEDICAL_TREATMENT','LOST_TIME','FATALITY','ENVIRONMENTAL','PROPERTY_DAMAGE',
        'SECURITY','OTHER')),
      CONSTRAINT ck_hse_incident_actual_severity CHECK
        (actual_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_hse_incident_potential_severity CHECK
        (potential_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_hse_incident_report_order CHECK (occurred_at <= reported_at),
      CONSTRAINT ck_hse_incident_closed_pair CHECK ((closed_by IS NULL) = (closed_at IS NULL)),
      CONSTRAINT ck_hse_incident_closed_status CHECK (status <> 'CLOSED' OR closed_by IS NOT NULL),
      CONSTRAINT ck_hse_incident_closer_independent CHECK
        (closed_by IS NULL OR closed_by <> reported_by),
      CONSTRAINT ck_hse_incident_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_hse_incident_register
      ON hse_incidents (tenant_id, project_id, status, occurred_at)`);

    await queryRunner.query(`CREATE TABLE stop_work_actions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      action varchar(10) NOT NULL,
      target_type varchar(20) NOT NULL,
      site_id uuid,
      workfront_id uuid,
      permit_id uuid,
      hse_incident_id uuid,
      reason varchar(2000) NOT NULL,
      lifts_action_id uuid,
      verified_controls jsonb NOT NULL DEFAULT '[]'::jsonb,
      actor_id uuid NOT NULL,
      acted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT pk_stop_work_actions PRIMARY KEY (id),
      CONSTRAINT uq_stop_work_actions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_stop_work_actions_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT fk_stop_work_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_workfront FOREIGN KEY (tenant_id, project_id, workfront_id)
        REFERENCES workfronts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_permit FOREIGN KEY (tenant_id, project_id, permit_id)
        REFERENCES permits_to_work (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_hse_incident FOREIGN KEY (tenant_id, project_id, hse_incident_id)
        REFERENCES hse_incidents (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_lifts FOREIGN KEY (tenant_id, lifts_action_id)
        REFERENCES stop_work_actions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_stop_work_actor FOREIGN KEY (tenant_id, actor_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_stop_work_action CHECK (action IN ('ISSUE','LIFT')),
      CONSTRAINT ck_stop_work_target_type CHECK
        (target_type IN ('PROJECT','SITE','WORKFRONT','PERMIT')),
      CONSTRAINT ck_stop_work_target CHECK (
        (target_type = 'PROJECT' AND site_id IS NULL
          AND workfront_id IS NULL AND permit_id IS NULL)
        OR (target_type = 'SITE' AND site_id IS NOT NULL
          AND workfront_id IS NULL AND permit_id IS NULL)
        OR (target_type = 'WORKFRONT' AND workfront_id IS NOT NULL
          AND site_id IS NULL AND permit_id IS NULL)
        OR (target_type = 'PERMIT' AND permit_id IS NOT NULL
          AND site_id IS NULL AND workfront_id IS NULL)),
      CONSTRAINT ck_stop_work_lift_reference CHECK ((action = 'LIFT') = (lifts_action_id IS NOT NULL)),
      CONSTRAINT ck_stop_work_lift_controls CHECK (action <> 'LIFT'
        OR (jsonb_typeof(verified_controls) = 'array'
          AND jsonb_array_length(verified_controls) >= 1)),
      CONSTRAINT ck_stop_work_reason CHECK (coalesce(length(trim(reason)), 0) > 0)
    )`);
    // Exactly one LIFT per ISSUE — a second lift of the same stop conflicts structurally.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_stop_work_single_lift
      ON stop_work_actions (tenant_id, lifts_action_id) WHERE lifts_action_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_stop_work_coverage
      ON stop_work_actions (tenant_id, project_id, action, target_type)`);

    await queryRunner.query(`CREATE TABLE inspection_test_plans (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      package_id uuid NOT NULL,
      document_revision_id uuid NOT NULL,
      version integer NOT NULL,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_inspection_test_plans PRIMARY KEY (id),
      CONSTRAINT uq_itp_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_itp_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_itp_document_revision UNIQUE (tenant_id, document_revision_id),
      CONSTRAINT uq_itp_package_version UNIQUE (tenant_id, package_id, version),
      CONSTRAINT fk_itp_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_itp_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_itp_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_itp_document_revision FOREIGN KEY (tenant_id, document_revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_itp_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_itp_version CHECK (version >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE inspections (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      itp_id uuid NOT NULL,
      hold_point_ref varchar(80) NOT NULL,
      sequence_no integer NOT NULL,
      status varchar(20) NOT NULL,
      result varchar(10),
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      witness_snapshot jsonb,
      requested_by uuid NOT NULL,
      recorded_by uuid,
      recorded_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_inspections PRIMARY KEY (id),
      CONSTRAINT uq_inspections_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_inspections_itp_id UNIQUE (tenant_id, itp_id, id),
      CONSTRAINT uq_inspection_hold_point_sequence UNIQUE
        (tenant_id, itp_id, hold_point_ref, sequence_no),
      CONSTRAINT fk_inspection_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_inspection_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inspection_itp FOREIGN KEY (tenant_id, project_id, itp_id)
        REFERENCES inspection_test_plans (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inspection_requested_by FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inspection_recorded_by FOREIGN KEY (tenant_id, recorded_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inspection_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inspection_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_inspection_status CHECK (status IN ('REQUESTED','RECORDED')),
      CONSTRAINT ck_inspection_result CHECK (result IS NULL OR result IN ('PASS','FAIL')),
      CONSTRAINT ck_inspection_hold_point CHECK (hold_point_ref ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_inspection_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_inspection_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_inspection_recorded CHECK (status <> 'RECORDED'
        OR (result IS NOT NULL AND recorded_by IS NOT NULL AND recorded_at IS NOT NULL
          AND jsonb_array_length(evidence_refs) >= 1)),
      CONSTRAINT ck_inspection_recorded_pair CHECK ((recorded_by IS NULL) = (recorded_at IS NULL)),
      CONSTRAINT ck_inspection_version CHECK (version_no >= 1)
    )`);
    // One open request per hold point; the next sequence only opens after the last is recorded.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_inspection_hold_point_open
      ON inspections (tenant_id, itp_id, hold_point_ref) WHERE status = 'REQUESTED'`);
    await queryRunner.query(`CREATE INDEX idx_inspection_register
      ON inspections (tenant_id, project_id, status)`);

    await queryRunner.query(`CREATE TABLE ncrs (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      package_id uuid,
      code varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      description varchar(4000) NOT NULL,
      severity varchar(10) NOT NULL,
      status varchar(30) NOT NULL,
      raised_by uuid NOT NULL,
      owner_id uuid NOT NULL,
      containment_action varchar(2000),
      root_cause varchar(4000),
      disposition varchar(20),
      disposition_approved_by uuid,
      verified_by uuid,
      verified_at timestamptz,
      closure_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_ncrs PRIMARY KEY (id),
      CONSTRAINT uq_ncrs_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_ncrs_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_ncr_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_ncr_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_raised_by FOREIGN KEY (tenant_id, raised_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_disposition_approved_by FOREIGN KEY (tenant_id, disposition_approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_verified_by FOREIGN KEY (tenant_id, verified_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_ncr_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_ncr_status CHECK (status IN ('OPEN','CONTAINED','ROOT_CAUSE',
        'DISPOSITION_PROPOSED','RETURNED','DISPOSITION_APPROVED','RECTIFICATION',
        'READY_FOR_VERIFICATION','CLOSED','REOPENED')),
      CONSTRAINT ck_ncr_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_ncr_disposition CHECK (disposition IS NULL
        OR disposition IN ('REWORK','REPAIR','USE_AS_IS','SCRAP','REJECT')),
      CONSTRAINT ck_ncr_root_cause_required CHECK (status NOT IN ('DISPOSITION_PROPOSED',
        'RETURNED','DISPOSITION_APPROVED','RECTIFICATION','READY_FOR_VERIFICATION',
        'CLOSED','REOPENED') OR root_cause IS NOT NULL),
      CONSTRAINT ck_ncr_disposition_approved CHECK (status NOT IN ('DISPOSITION_APPROVED',
        'RECTIFICATION','READY_FOR_VERIFICATION','CLOSED','REOPENED')
        OR (disposition IS NOT NULL AND disposition_approved_by IS NOT NULL)),
      CONSTRAINT ck_ncr_disposition_independent CHECK
        (disposition_approved_by IS NULL OR disposition_approved_by <> raised_by),
      CONSTRAINT ck_ncr_verifier_independent CHECK (verified_by IS NULL OR verified_by <> owner_id),
      CONSTRAINT ck_ncr_verified_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
      CONSTRAINT ck_ncr_closure_evidence_array CHECK (jsonb_typeof(closure_evidence_refs) = 'array'),
      CONSTRAINT ck_ncr_closed CHECK (status <> 'CLOSED'
        OR (verified_by IS NOT NULL AND jsonb_array_length(closure_evidence_refs) >= 1)),
      CONSTRAINT ck_ncr_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_ncr_register
      ON ncrs (tenant_id, project_id, status, severity)`);

    await queryRunner.query(`CREATE TABLE ncr_disposition_cycles (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      ncr_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      proposed_disposition varchar(20) NOT NULL,
      proposal_comment varchar(2000) NOT NULL,
      proposed_by uuid NOT NULL,
      proposed_at timestamptz NOT NULL,
      decision varchar(20),
      decision_comment varchar(2000),
      decided_by uuid,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_ncr_disposition_cycles PRIMARY KEY (id),
      CONSTRAINT uq_ncr_disposition_cycles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_ncr_disposition_cycle_sequence UNIQUE (tenant_id, ncr_id, sequence_no),
      CONSTRAINT fk_ncr_disposition_cycle_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_disposition_cycle_ncr FOREIGN KEY (tenant_id, project_id, ncr_id)
        REFERENCES ncrs (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_disposition_cycle_proposed_by FOREIGN KEY (tenant_id, proposed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_ncr_disposition_cycle_decided_by FOREIGN KEY (tenant_id, decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_ncr_disposition_cycle_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_ncr_disposition_cycle_proposed CHECK (proposed_disposition IN
        ('REWORK','REPAIR','USE_AS_IS','SCRAP','REJECT')),
      CONSTRAINT ck_ncr_disposition_cycle_proposal_comment CHECK
        (coalesce(length(trim(proposal_comment)), 0) >= 3),
      CONSTRAINT ck_ncr_disposition_cycle_decision CHECK ((
        decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
      ) OR (
        decision IN ('APPROVE','RETURN') AND coalesce(length(trim(decision_comment)), 0) >= 3
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      )),
      CONSTRAINT ck_ncr_disposition_cycle_sod CHECK (decided_by IS NULL OR decided_by <> proposed_by)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_ncr_disposition_cycle_open
      ON ncr_disposition_cycles (tenant_id, ncr_id) WHERE decision IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_ncr_disposition_cycle_history
      ON ncr_disposition_cycles (tenant_id, project_id, ncr_id, sequence_no)`);

    await queryRunner.query(`CREATE TABLE punch_items (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      code varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      description varchar(4000),
      category char(1) NOT NULL,
      cod_blocking boolean NOT NULL,
      waivable boolean NOT NULL,
      status varchar(30) NOT NULL,
      raised_by uuid NOT NULL,
      owner_id uuid NOT NULL,
      waived_by uuid,
      waived_reason varchar(2000),
      verified_by uuid,
      verified_at timestamptz,
      closure_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_punch_items PRIMARY KEY (id),
      CONSTRAINT uq_punch_items_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_punch_items_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_punch_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_punch_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_raised_by FOREIGN KEY (tenant_id, raised_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_waived_by FOREIGN KEY (tenant_id, waived_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_verified_by FOREIGN KEY (tenant_id, verified_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_punch_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_punch_status CHECK
        (status IN ('OPEN','READY_FOR_VERIFICATION','CLOSED','WAIVED')),
      CONSTRAINT ck_punch_category CHECK (category IN ('A','B','C','D')),
      CONSTRAINT ck_punch_category_a_blocking CHECK (category <> 'A' OR cod_blocking = true),
      CONSTRAINT ck_punch_category_a_not_waivable CHECK (category <> 'A' OR waivable = false),
      CONSTRAINT ck_punch_waiver CHECK (status <> 'WAIVED' OR (waivable = true
        AND waived_by IS NOT NULL AND waived_reason IS NOT NULL
        AND coalesce(length(trim(waived_reason)), 0) > 0)),
      CONSTRAINT ck_punch_verifier_independent CHECK
        (verified_by IS NULL OR verified_by <> owner_id),
      CONSTRAINT ck_punch_verified_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
      CONSTRAINT ck_punch_closure_evidence_array CHECK
        (jsonb_typeof(closure_evidence_refs) = 'array'),
      CONSTRAINT ck_punch_closed CHECK (status <> 'CLOSED'
        OR (verified_by IS NOT NULL AND jsonb_array_length(closure_evidence_refs) >= 1)),
      CONSTRAINT ck_punch_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_punch_register
      ON punch_items (tenant_id, project_id, status, category)`);

    await queryRunner.query(`CREATE TABLE punch_closure_cycles (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      punch_item_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      request_comment varchar(2000) NOT NULL,
      request_evidence_refs jsonb NOT NULL,
      requested_by uuid NOT NULL,
      requested_at timestamptz NOT NULL,
      decision varchar(20),
      decision_comment varchar(2000),
      decided_by uuid,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_punch_closure_cycles PRIMARY KEY (id),
      CONSTRAINT uq_punch_closure_cycles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_punch_closure_cycle_sequence UNIQUE (tenant_id, punch_item_id, sequence_no),
      CONSTRAINT fk_punch_closure_cycle_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_closure_cycle_punch FOREIGN KEY (tenant_id, project_id, punch_item_id)
        REFERENCES punch_items (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_closure_cycle_requested_by FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_closure_cycle_decided_by FOREIGN KEY (tenant_id, decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_punch_closure_cycle_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_punch_closure_cycle_request_comment CHECK (coalesce(length(trim(request_comment)), 0) >= 3),
      CONSTRAINT ck_punch_closure_cycle_request_evidence CHECK
        (jsonb_typeof(request_evidence_refs) = 'array'
          AND jsonb_array_length(request_evidence_refs) >= 1),
      CONSTRAINT ck_punch_closure_cycle_decision CHECK ((
        decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
      ) OR (
        decision IN ('APPROVE','RETURN') AND coalesce(length(trim(decision_comment)), 0) >= 3
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      )),
      CONSTRAINT ck_punch_closure_cycle_sod CHECK
        (decided_by IS NULL OR decided_by <> requested_by)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_punch_closure_cycle_open
      ON punch_closure_cycles (tenant_id, punch_item_id) WHERE decision IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_punch_closure_cycle_history
      ON punch_closure_cycles (tenant_id, project_id, punch_item_id, sequence_no)`);

    await queryRunner.query(`CREATE TABLE capa_actions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      hse_incident_id uuid,
      ncr_id uuid,
      title varchar(400) NOT NULL,
      owner_id uuid NOT NULL,
      due_date date,
      status varchar(20) NOT NULL,
      effectiveness_assessment varchar(2000),
      verified_by uuid,
      verified_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_capa_actions PRIMARY KEY (id),
      CONSTRAINT uq_capa_actions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_capa_actions_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT fk_capa_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_hse_incident FOREIGN KEY (tenant_id, project_id, hse_incident_id)
        REFERENCES hse_incidents (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_ncr FOREIGN KEY (tenant_id, project_id, ncr_id)
        REFERENCES ncrs (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_verified_by FOREIGN KEY (tenant_id, verified_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_capa_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_capa_parent CHECK (num_nonnulls(hse_incident_id, ncr_id) = 1),
      CONSTRAINT ck_capa_status CHECK (status IN ('OPEN','VERIFIED')),
      CONSTRAINT ck_capa_verified CHECK (status <> 'VERIFIED' OR (verified_by IS NOT NULL
        AND effectiveness_assessment IS NOT NULL
        AND coalesce(length(trim(effectiveness_assessment)), 0) > 0)),
      CONSTRAINT ck_capa_verifier_independent CHECK
        (verified_by IS NULL OR verified_by <> owner_id),
      CONSTRAINT ck_capa_verified_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
      CONSTRAINT ck_capa_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_capa_register
      ON capa_actions (tenant_id, project_id, status)`);

    // FR-080: a SIGNED daily log is a signed record. Copied from document-control's
    // issued-immutable idiom: every business column is frozen; the only legal move is
    // status → SUPERSEDED (the correction flow), and SUPERSEDED rows never change again.
    await queryRunner.query(`CREATE FUNCTION protect_daily_log_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status = 'SUPERSEDED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'superseded daily logs are immutable history';
      END IF;
      IF OLD.status = 'SIGNED' THEN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'signed daily logs cannot be deleted';
        END IF;
        IF NEW.status <> 'SUPERSEDED'
          OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
          <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'signed daily log business columns are immutable; correct via a new revision';
        END IF;
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_daily_log_signed_immutable
      BEFORE UPDATE OR DELETE ON daily_logs
      FOR EACH ROW EXECUTE FUNCTION protect_daily_log_history()`);

    // FR-077: the quantity ledger is append-only; corrections and certifications are new rows.
    await queryRunner.query(`CREATE FUNCTION protect_quantity_progress_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'quantity progress records are append-only; write a correction or certification row';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_quantity_progress_append_only
      BEFORE UPDATE OR DELETE ON quantity_progress_records
      FOR EACH ROW EXECUTE FUNCTION protect_quantity_progress_history()`);

    // FR-087/SEC-130: the initial incident report is a legal record. Its reporting columns can
    // never change, the row can never be deleted, and a legal hold can be set but never cleared.
    await queryRunner.query(`CREATE FUNCTION protect_hse_incident_report()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'HSE incidents cannot be deleted';
      END IF;
      IF OLD.legal_hold AND NOT NEW.legal_hold THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'HSE incident legal hold cannot be cleared';
      END IF;
      IF NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
        OR NEW.reported_at IS DISTINCT FROM OLD.reported_at
        OR NEW.reported_by IS DISTINCT FROM OLD.reported_by
        OR NEW.incident_type IS DISTINCT FROM OLD.incident_type
        OR NEW.actual_severity IS DISTINCT FROM OLD.actual_severity
        OR NEW.potential_severity IS DISTINCT FROM OLD.potential_severity
        OR NEW.narrative IS DISTINCT FROM OLD.narrative
        OR NEW.immediate_action IS DISTINCT FROM OLD.immediate_action
        OR NEW.site_id IS DISTINCT FROM OLD.site_id THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'the initial HSE incident report is immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_hse_incident_report_immutable
      BEFORE UPDATE OR DELETE ON hse_incidents
      FOR EACH ROW EXECUTE FUNCTION protect_hse_incident_report()`);

    // FR-088: the stop-work ledger is append-only — ISSUE and LIFT are permanent facts.
    await queryRunner.query(`CREATE FUNCTION protect_stop_work_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'stop-work actions are append-only; record a LIFT instead';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_stop_work_append_only
      BEFORE UPDATE OR DELETE ON stop_work_actions
      FOR EACH ROW EXECUTE FUNCTION protect_stop_work_history()`);

    // SEC-102: whoever stopped the work can never be the one who declares it safe again, and a
    // LIFT must reference an actual ISSUE row. Raised with constraint-style error codes so the
    // service maps them onto domain errors like any declarative constraint.
    await queryRunner.query(`CREATE FUNCTION enforce_stop_work_lift_independence()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      issue_action varchar(10);
      issue_actor uuid;
    BEGIN
      IF NEW.action <> 'LIFT' THEN RETURN NEW; END IF;
      SELECT action, actor_id INTO issue_action, issue_actor FROM stop_work_actions
        WHERE tenant_id = NEW.tenant_id AND id = NEW.lifts_action_id;
      IF issue_action IS NULL OR issue_action <> 'ISSUE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_stop_work_lift_targets_issue',
          MESSAGE = 'a LIFT must reference an ISSUE stop-work action';
      END IF;
      IF issue_actor = NEW.actor_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_stop_work_lift_independent',
          MESSAGE = 'the actor who issued a stop-work cannot lift it';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_stop_work_lift_independence
      BEFORE INSERT ON stop_work_actions
      FOR EACH ROW EXECUTE FUNCTION enforce_stop_work_lift_independence()`);

    // FR-092: a recorded inspection is quality evidence; re-inspection appends sequence_no + 1.
    await queryRunner.query(`CREATE FUNCTION protect_inspection_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status = 'RECORDED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'recorded inspections are immutable; append a re-inspection instead';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_inspection_recorded_immutable
      BEFORE UPDATE OR DELETE ON inspections
      FOR EACH ROW EXECUTE FUNCTION protect_inspection_history()`);

    // DB-116/DB-117 mirror risk_issue_closure_cycles: an undecided cycle may only be completed
    // with its decision, a decided cycle is immutable, and no cycle row is ever deleted.
    await queryRunner.query(`CREATE FUNCTION protect_quality_cycle_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'quality cycles cannot be deleted';
      END IF;
      IF OLD.decision IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'decided quality cycles are immutable';
      END IF;
      IF NEW.decision IS NULL OR
        (to_jsonb(NEW) - ARRAY['decision','decision_comment','decided_by','decided_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['decision','decision_comment','decided_by','decided_at']::text[])
      THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'a quality cycle update may only complete its decision';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_ncr_disposition_cycle_protect
      BEFORE UPDATE OR DELETE ON ncr_disposition_cycles
      FOR EACH ROW EXECUTE FUNCTION protect_quality_cycle_history()`);
    await queryRunner.query(`CREATE TRIGGER trg_punch_closure_cycle_protect
      BEFORE UPDATE OR DELETE ON punch_closure_cycles
      FOR EACH ROW EXECUTE FUNCTION protect_quality_cycle_history()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_punch_closure_cycle_protect ON punch_closure_cycles'
    );
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_ncr_disposition_cycle_protect ON ncr_disposition_cycles'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_quality_cycle_history()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_inspection_recorded_immutable ON inspections'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_inspection_history()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_stop_work_lift_independence ON stop_work_actions'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_stop_work_lift_independence()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_stop_work_append_only ON stop_work_actions');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_stop_work_history()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_hse_incident_report_immutable ON hse_incidents'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_hse_incident_report()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_quantity_progress_append_only ON quantity_progress_records'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_quantity_progress_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_daily_log_signed_immutable ON daily_logs');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_daily_log_history()');

    await queryRunner.query('DROP TABLE IF EXISTS capa_actions');
    await queryRunner.query('DROP TABLE IF EXISTS punch_closure_cycles');
    await queryRunner.query('DROP TABLE IF EXISTS punch_items');
    await queryRunner.query('DROP TABLE IF EXISTS ncr_disposition_cycles');
    await queryRunner.query('DROP TABLE IF EXISTS ncrs');
    await queryRunner.query('DROP TABLE IF EXISTS inspections');
    await queryRunner.query('DROP TABLE IF EXISTS inspection_test_plans');
    await queryRunner.query('DROP TABLE IF EXISTS stop_work_actions');
    await queryRunner.query('DROP TABLE IF EXISTS hse_incidents');
    await queryRunner.query('DROP TABLE IF EXISTS permits_to_work');
    await queryRunner.query('DROP TABLE IF EXISTS quantity_progress_records');
    await queryRunner.query('DROP TABLE IF EXISTS daily_logs');
    await queryRunner.query('DROP TABLE IF EXISTS workfronts');
  }
}
