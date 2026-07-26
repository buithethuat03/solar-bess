import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commissioning & COD slice (API-098…API-105): DB-073…DB-078 plus DB-118 (CodGateReviewCycle) —
 * the one new id allocated under the Product Owner's blanket delegation for this slice, following
 * the DB-114/DB-115/DB-116/DB-117 precedent (DocumentExternalShare, StopWorkAction,
 * NcrDispositionCycle and PunchClosureCycle). The DDL mirrors the entity decorators one-for-one so
 * every constraint can be traced from TypeScript to the database and back.
 *
 * Cross-slice keys this migration RELIES ON but does not create: `projects (tenant_id, id)`,
 * `user_accounts (tenant_id, id)` and `document_revisions (tenant_id, id)`.
 *
 * Shared hardening this migration DOES create: `uq_project_parties_tenant_project_id` on
 * `project_parties`, so `handovers` can point at a party with a tenant+project-scoped composite
 * foreign key instead of a bare id. Same idiom as migration 1783744000000, which added
 * `uq_sites_tenant_project_id` and `uq_wbs_nodes_tenant_project_id` for later slices. The ADD is
 * guarded by a catalog lookup and the DROP by IF EXISTS so a sibling slice adding the same key
 * cannot collide.
 */
export class CreateCommissioningCod1783758000000 implements MigrationInterface {
  name = 'CreateCommissioningCod1783758000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_parties_tenant_project_id'
      ) THEN
        ALTER TABLE project_parties
          ADD CONSTRAINT uq_project_parties_tenant_project_id
          UNIQUE (tenant_id, project_id, id);
      END IF;
    END $$`);

    await queryRunner.query(`CREATE TABLE commissioning_systems (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      parent_system_id uuid,
      code varchar(80) NOT NULL,
      name varchar(250) NOT NULL,
      system_type varchar(40) NOT NULL,
      boundary jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_commissioning_systems PRIMARY KEY (id),
      CONSTRAINT uq_commissioning_systems_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_commissioning_systems_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_commissioning_system_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_commissioning_system_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_commissioning_system_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commissioning_system_parent
        FOREIGN KEY (tenant_id, project_id, parent_system_id)
        REFERENCES commissioning_systems (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commissioning_system_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commissioning_system_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_commissioning_system_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_commissioning_system_type CHECK (system_type ~ '^[A-Z][A-Z0-9_]{0,39}$'),
      CONSTRAINT ck_commissioning_system_status CHECK
        (status IN ('NOT_READY','READY_FOR_TEST','TESTING','PASSED','FAILED')),
      CONSTRAINT ck_commissioning_system_parent CHECK
        (parent_system_id IS NULL OR parent_system_id <> id),
      CONSTRAINT ck_commissioning_system_boundary CHECK (jsonb_typeof(boundary) = 'object'),
      CONSTRAINT ck_commissioning_system_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_commissioning_system_register
      ON commissioning_systems (tenant_id, project_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_commissioning_system_parent
      ON commissioning_systems (tenant_id, project_id, parent_system_id)`);

    await queryRunner.query(`CREATE TABLE test_packs (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      commissioning_system_id uuid NOT NULL,
      code varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      procedure_revision_id uuid NOT NULL,
      prerequisites_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(20) NOT NULL,
      approved_by uuid,
      approved_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_test_packs PRIMARY KEY (id),
      CONSTRAINT uq_test_packs_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_test_packs_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_test_packs_system_id UNIQUE (tenant_id, commissioning_system_id, id),
      CONSTRAINT uq_test_pack_code_revision UNIQUE
        (tenant_id, commissioning_system_id, code, procedure_revision_id),
      CONSTRAINT fk_test_pack_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_pack_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_pack_system FOREIGN KEY (tenant_id, project_id, commissioning_system_id)
        REFERENCES commissioning_systems (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_pack_procedure_revision FOREIGN KEY (tenant_id, procedure_revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_pack_approved_by FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_pack_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_pack_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_test_pack_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_test_pack_status CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
      CONSTRAINT ck_test_pack_prerequisites CHECK
        (jsonb_typeof(prerequisites_snapshot) = 'object'),
      CONSTRAINT ck_test_pack_approved_pair CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
      CONSTRAINT ck_test_pack_approved CHECK
        (status NOT IN ('APPROVED','SUPERSEDED') OR approved_by IS NOT NULL),
      CONSTRAINT ck_test_pack_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_test_pack_register
      ON test_packs (tenant_id, project_id, status)`);

    await queryRunner.query(`CREATE TABLE test_runs (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      test_pack_id uuid NOT NULL,
      previous_run_id uuid,
      run_no integer NOT NULL,
      status varchar(20) NOT NULL,
      result varchar(20),
      raw_data_ref varchar(500),
      instrument_snapshot jsonb,
      witness_snapshot jsonb,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      started_by uuid NOT NULL,
      recorded_by uuid,
      recorded_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_test_runs PRIMARY KEY (id),
      CONSTRAINT uq_test_runs_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_test_runs_pack_id UNIQUE (tenant_id, test_pack_id, id),
      CONSTRAINT uq_test_run_pack_run_no UNIQUE (tenant_id, test_pack_id, run_no),
      CONSTRAINT fk_test_run_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_pack FOREIGN KEY (tenant_id, project_id, test_pack_id)
        REFERENCES test_packs (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_previous FOREIGN KEY (tenant_id, test_pack_id, previous_run_id)
        REFERENCES test_runs (tenant_id, test_pack_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_started_by FOREIGN KEY (tenant_id, started_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_recorded_by FOREIGN KEY (tenant_id, recorded_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_test_run_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_test_run_status CHECK (status IN ('IN_PROGRESS','RECORDED')),
      CONSTRAINT ck_test_run_result CHECK
        (result IS NULL OR result IN ('PASSED','FAILED','ABORTED','INCONCLUSIVE')),
      CONSTRAINT ck_test_run_run_no CHECK (run_no >= 1),
      CONSTRAINT ck_test_run_previous CHECK (previous_run_id IS NULL OR previous_run_id <> id),
      CONSTRAINT ck_test_run_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_test_run_recorded CHECK (status <> 'RECORDED'
        OR (result IS NOT NULL AND recorded_by IS NOT NULL AND recorded_at IS NOT NULL
          AND jsonb_array_length(evidence_refs) >= 1)),
      CONSTRAINT ck_test_run_open_has_no_result CHECK (status = 'RECORDED' OR result IS NULL),
      CONSTRAINT ck_test_run_recorded_pair CHECK ((recorded_by IS NULL) = (recorded_at IS NULL)),
      CONSTRAINT ck_test_run_window CHECK (ended_at IS NULL OR ended_at >= started_at),
      CONSTRAINT ck_test_run_version CHECK (version_no >= 1)
    )`);
    // One open run per test pack: a second concurrent run is API-101's RUN_IN_PROGRESS conflict.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_test_run_open
      ON test_runs (tenant_id, test_pack_id) WHERE status = 'IN_PROGRESS'`);
    // A failed run is retested at most once; the retest chain never forks.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_test_run_retest_once
      ON test_runs (tenant_id, previous_run_id) WHERE previous_run_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_test_run_register
      ON test_runs (tenant_id, project_id, result)`);

    await queryRunner.query(`CREATE TABLE cod_gates (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      category varchar(20) NOT NULL,
      code varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      mandatory boolean NOT NULL,
      waivable boolean NOT NULL,
      owner_id uuid NOT NULL,
      due_date date,
      status varchar(20) NOT NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      evidence_expiry date,
      accepted_by uuid,
      accepted_at timestamptz,
      waived_by uuid,
      waived_at timestamptz,
      waiver_reason varchar(2000),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_cod_gates PRIMARY KEY (id),
      CONSTRAINT uq_cod_gates_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_cod_gates_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_cod_gate_instance UNIQUE (tenant_id, project_id, category, code),
      CONSTRAINT fk_cod_gate_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_accepted_by FOREIGN KEY (tenant_id, accepted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_waived_by FOREIGN KEY (tenant_id, waived_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_cod_gate_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_cod_gate_category CHECK (category IN ('LEGAL','CONTRACTUAL','TECHNICAL',
        'QUALITY','SAFETY','DOCUMENTATION','COMMERCIAL')),
      CONSTRAINT ck_cod_gate_status CHECK
        (status IN ('PENDING','UNDER_REVIEW','ACCEPTED','REJECTED','WAIVED')),
      CONSTRAINT ck_cod_gate_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_cod_gate_waiver_allowed CHECK (NOT (status = 'WAIVED' AND waivable = false)),
      CONSTRAINT ck_cod_gate_waived CHECK (status <> 'WAIVED'
        OR (waived_by IS NOT NULL AND waived_at IS NOT NULL
          AND coalesce(length(trim(waiver_reason)), 0) > 0)),
      CONSTRAINT ck_cod_gate_waived_pair CHECK ((waived_by IS NULL) = (waived_at IS NULL)),
      CONSTRAINT ck_cod_gate_accepted CHECK (status <> 'ACCEPTED'
        OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)),
      CONSTRAINT ck_cod_gate_accepted_pair CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
      CONSTRAINT ck_cod_gate_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_cod_gate_register
      ON cod_gates (tenant_id, project_id, category, status)`);

    await queryRunner.query(`CREATE TABLE cod_gate_review_cycles (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      cod_gate_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      evidence_refs jsonb NOT NULL,
      evidence_expiry date,
      submission_comment varchar(2000) NOT NULL,
      submitted_by uuid NOT NULL,
      submitted_at timestamptz NOT NULL,
      decision varchar(20),
      decision_comment varchar(2000),
      decided_by uuid,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_cod_gate_review_cycles PRIMARY KEY (id),
      CONSTRAINT uq_cod_gate_review_cycles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_cod_gate_review_cycle_sequence UNIQUE (tenant_id, cod_gate_id, sequence_no),
      CONSTRAINT fk_cod_gate_review_cycle_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_review_cycle_gate FOREIGN KEY (tenant_id, project_id, cod_gate_id)
        REFERENCES cod_gates (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_review_cycle_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_gate_review_cycle_decided_by FOREIGN KEY (tenant_id, decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_cod_gate_review_cycle_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_cod_gate_review_cycle_evidence CHECK
        (jsonb_typeof(evidence_refs) = 'array' AND jsonb_array_length(evidence_refs) >= 1),
      CONSTRAINT ck_cod_gate_review_cycle_comment CHECK
        (coalesce(length(trim(submission_comment)), 0) >= 3),
      CONSTRAINT ck_cod_gate_review_cycle_decision CHECK ((
        decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
      ) OR (
        decision IN ('PASS','FAIL','CONDITIONAL')
        AND coalesce(length(trim(decision_comment)), 0) >= 3
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      )),
      CONSTRAINT ck_cod_gate_review_cycle_sod CHECK
        (decided_by IS NULL OR decided_by <> submitted_by)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_cod_gate_review_cycle_open
      ON cod_gate_review_cycles (tenant_id, cod_gate_id) WHERE decision IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_cod_gate_review_cycle_history
      ON cod_gate_review_cycles (tenant_id, project_id, cod_gate_id, sequence_no)`);

    await queryRunner.query(`CREATE TABLE cod_packages (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      version integer NOT NULL,
      status varchar(20) NOT NULL,
      readiness_snapshot jsonb NOT NULL,
      snapshot_hash char(64) NOT NULL,
      signed_artifact_ref varchar(500),
      effective_at timestamptz,
      legal_hold boolean NOT NULL DEFAULT false,
      submitted_by uuid,
      submitted_at timestamptz,
      signed_by uuid,
      signed_at timestamptz,
      signer_snapshot jsonb,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_cod_packages PRIMARY KEY (id),
      CONSTRAINT uq_cod_packages_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_cod_packages_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_cod_package_version UNIQUE (tenant_id, project_id, version),
      CONSTRAINT fk_cod_package_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_package_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_package_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_package_signed_by FOREIGN KEY (tenant_id, signed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_package_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cod_package_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_cod_package_status CHECK
        (status IN ('DRAFT','READY','SUBMITTED','SIGNED','HANDED_OVER')),
      CONSTRAINT ck_cod_package_version_no CHECK (version >= 1),
      CONSTRAINT ck_cod_package_snapshot CHECK (jsonb_typeof(readiness_snapshot) = 'object'),
      CONSTRAINT ck_cod_package_snapshot_hash CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_cod_package_submitted_pair CHECK
        ((submitted_by IS NULL) = (submitted_at IS NULL)),
      CONSTRAINT ck_cod_package_submitted CHECK
        (status NOT IN ('SUBMITTED','SIGNED','HANDED_OVER') OR submitted_by IS NOT NULL),
      CONSTRAINT ck_cod_package_signed_pair CHECK (((signed_by IS NULL) = (signed_at IS NULL))
        AND ((signed_by IS NULL) = (signer_snapshot IS NULL))),
      CONSTRAINT ck_cod_package_signed CHECK
        (status NOT IN ('SIGNED','HANDED_OVER') OR signed_by IS NOT NULL),
      CONSTRAINT ck_cod_package_sod CHECK (signed_by IS NULL OR signed_by <> submitted_by),
      CONSTRAINT ck_cod_package_row_version CHECK (version_no >= 1)
    )`);
    // One non-terminal COD package per project: a project never has two submissions in flight.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_cod_package_active
      ON cod_packages (tenant_id, project_id) WHERE status IN ('DRAFT','READY','SUBMITTED')`);
    await queryRunner.query(`CREATE INDEX idx_cod_package_register
      ON cod_packages (tenant_id, project_id, status)`);

    await queryRunner.query(`CREATE TABLE handovers (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      cod_package_id uuid NOT NULL,
      from_party_id uuid NOT NULL,
      recipient_party_id uuid NOT NULL,
      item_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
      open_items jsonb NOT NULL DEFAULT '[]'::jsonb,
      accepted_by uuid,
      accepted_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_handovers PRIMARY KEY (id),
      CONSTRAINT uq_handovers_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_handovers_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_handover_package_recipient UNIQUE
        (tenant_id, cod_package_id, recipient_party_id),
      CONSTRAINT fk_handover_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_package FOREIGN KEY (tenant_id, project_id, cod_package_id)
        REFERENCES cod_packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_from_party FOREIGN KEY (tenant_id, project_id, from_party_id)
        REFERENCES project_parties (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_recipient_party
        FOREIGN KEY (tenant_id, project_id, recipient_party_id)
        REFERENCES project_parties (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_accepted_by FOREIGN KEY (tenant_id, accepted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_handover_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_handover_parties CHECK (from_party_id <> recipient_party_id),
      CONSTRAINT ck_handover_manifest CHECK (jsonb_typeof(item_manifest) = 'array'),
      CONSTRAINT ck_handover_open_items CHECK (jsonb_typeof(open_items) = 'array'),
      CONSTRAINT ck_handover_accepted_pair CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
      CONSTRAINT ck_handover_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_handover_register
      ON handovers (tenant_id, project_id, accepted_at)`);

    // FR-107: an APPROVED test pack is the approved procedure baseline the runs are traced to.
    // Copied from the signed-daily-log idiom: every business column is frozen, the only legal move
    // is status → SUPERSEDED, and a SUPERSEDED pack never changes again. A revised procedure is a
    // NEW pack row under `uq_test_pack_code_revision`, never an edit of the approved one.
    await queryRunner.query(`CREATE FUNCTION protect_test_pack_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status = 'SUPERSEDED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'superseded test packs are immutable history';
      END IF;
      IF OLD.status = 'APPROVED' THEN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'approved test packs cannot be deleted';
        END IF;
        IF NEW.status <> 'SUPERSEDED'
          OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
          <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'approved test pack columns are immutable; issue a new pack revision';
        END IF;
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_test_pack_approved_immutable
      BEFORE UPDATE OR DELETE ON test_packs
      FOR EACH ROW EXECUTE FUNCTION protect_test_pack_history()`);

    // FR-109/FR-111: a recorded test result is a permanent commissioning fact. Once the result is
    // written the row is frozen — which is exactly what makes "a FAILED run can never become
    // PASSED" a database guarantee rather than a service convention. A retest is a new row.
    await queryRunner.query(`CREATE FUNCTION protect_test_run_result()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status = 'RECORDED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'recorded test run results are immutable; create a retest instead';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_test_run_result_immutable
      BEFORE UPDATE OR DELETE ON test_runs
      FOR EACH ROW EXECUTE FUNCTION protect_test_run_result()`);

    // FR-113: a gate acceptance or waiver is a recorded decision with a named decider. Once the
    // gate reaches ACCEPTED or WAIVED nothing about it may change and it can never be deleted.
    await queryRunner.query(`CREATE FUNCTION protect_cod_gate_decision()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status IN ('ACCEPTED','WAIVED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'a decided COD gate is immutable; the acceptance or waiver stands';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_cod_gate_decision_immutable
      BEFORE UPDATE OR DELETE ON cod_gates
      FOR EACH ROW EXECUTE FUNCTION protect_cod_gate_decision()`);

    // DB-118 mirrors ncr_disposition_cycles: an undecided review round may only be completed with
    // its decision, a decided round is immutable, and no round is ever deleted.
    await queryRunner.query(`CREATE FUNCTION protect_cod_gate_review_cycle()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'COD gate review cycles cannot be deleted';
      END IF;
      IF OLD.decision IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'decided COD gate review cycles are immutable';
      END IF;
      IF NEW.decision IS NULL OR
        (to_jsonb(NEW) - ARRAY['decision','decision_comment','decided_by','decided_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['decision','decision_comment','decided_by','decided_at']::text[])
      THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'a COD gate review cycle update may only complete its decision';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_cod_gate_review_cycle_protect
      BEFORE UPDATE OR DELETE ON cod_gate_review_cycles
      FOR EACH ROW EXECUTE FUNCTION protect_cod_gate_review_cycle()`);

    // FR-113: the SIGNED COD package is the legal artefact. Its columns are frozen; the only legal
    // move is status → HANDED_OVER when the handover is accepted, and a HANDED_OVER package never
    // changes again. A legal hold may be set but never cleared.
    await queryRunner.query(`CREATE FUNCTION protect_cod_package_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'COD packages cannot be deleted';
      END IF;
      IF OLD.legal_hold AND NOT NEW.legal_hold THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'COD package legal hold cannot be cleared';
      END IF;
      IF OLD.status = 'HANDED_OVER' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'a handed-over COD package is immutable history';
      END IF;
      IF OLD.status = 'SIGNED' THEN
        -- Two moves a signed package still admits: the handover advancing it, and asserting a legal
        -- hold. A hold is placed precisely on completed records, so refusing it here would make the
        -- control unusable on the only packages it exists to protect. Clearing one is refused above.
        IF (NEW.status <> 'HANDED_OVER' AND NEW.status <> OLD.status)
          OR (to_jsonb(NEW)
            - ARRAY['status','legal_hold','version_no','updated_by','updated_at']::text[])
          <> (to_jsonb(OLD)
            - ARRAY['status','legal_hold','version_no','updated_by','updated_at']::text[]) THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'a signed COD package is immutable; only the handover may advance it';
        END IF;
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_cod_package_signed_immutable
      BEFORE UPDATE OR DELETE ON cod_packages
      FOR EACH ROW EXECUTE FUNCTION protect_cod_package_history()`);

    // FR-114: an accepted handover is the recipient's receipt. It is frozen and undeletable.
    await queryRunner.query(`CREATE FUNCTION protect_handover_acceptance()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'handovers cannot be deleted';
      END IF;
      IF OLD.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'an accepted handover is immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_handover_accepted_immutable
      BEFORE UPDATE OR DELETE ON handovers
      FOR EACH ROW EXECUTE FUNCTION protect_handover_acceptance()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_handover_accepted_immutable ON handovers');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_handover_acceptance()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_cod_package_signed_immutable ON cod_packages'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_cod_package_history()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_cod_gate_review_cycle_protect ON cod_gate_review_cycles'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_cod_gate_review_cycle()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_cod_gate_decision_immutable ON cod_gates'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_cod_gate_decision()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_test_run_result_immutable ON test_runs');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_test_run_result()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_test_pack_approved_immutable ON test_packs'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_test_pack_history()');

    await queryRunner.query('DROP TABLE IF EXISTS handovers');
    await queryRunner.query('DROP TABLE IF EXISTS cod_packages');
    await queryRunner.query('DROP TABLE IF EXISTS cod_gate_review_cycles');
    await queryRunner.query('DROP TABLE IF EXISTS cod_gates');
    await queryRunner.query('DROP TABLE IF EXISTS test_runs');
    await queryRunner.query('DROP TABLE IF EXISTS test_packs');
    await queryRunner.query('DROP TABLE IF EXISTS commissioning_systems');

    await queryRunner.query(`ALTER TABLE project_parties
      DROP CONSTRAINT IF EXISTS uq_project_parties_tenant_project_id`);
  }
}
