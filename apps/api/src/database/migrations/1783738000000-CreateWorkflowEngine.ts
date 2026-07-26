import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-069…DB-072 for US-015. Composite `(tenant_id, …)` unique keys exist so every foreign key can
 * carry the tenant, which makes a cross-tenant reference impossible at the database level rather
 * than only in service code.
 */
export class CreateWorkflowEngine1783738000000 implements MigrationInterface {
  name = 'CreateWorkflowEngine1783738000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE workflow_definitions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      code varchar(80) NOT NULL,
      name varchar(200) NOT NULL,
      object_type varchar(80) NOT NULL,
      process_owner_id uuid NOT NULL,
      status varchar(30) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workflow_definitions PRIMARY KEY (id),
      CONSTRAINT uq_workflow_definitions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_workflow_definition_code UNIQUE (tenant_id, code),
      CONSTRAINT fk_workflow_definition_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_workflow_definition_owner FOREIGN KEY (tenant_id, process_owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_workflow_definition_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{1,79}$'),
      CONSTRAINT ck_workflow_definition_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
      CONSTRAINT ck_workflow_definition_object_type CHECK (object_type IN ('ChangeRequest')),
      CONSTRAINT ck_workflow_definition_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_workflow_definition_status
      ON workflow_definitions (tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_workflow_definition_object
      ON workflow_definitions (tenant_id, object_type, status)`);

    await queryRunner.query(`CREATE TABLE workflow_versions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      workflow_definition_id uuid NOT NULL,
      version integer NOT NULL,
      status varchar(20) NOT NULL,
      routing_rules jsonb NOT NULL,
      effective_from timestamptz NOT NULL DEFAULT now(),
      effective_to timestamptz,
      rules_hash varchar(64) NOT NULL,
      created_by uuid NOT NULL,
      published_by uuid,
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workflow_versions PRIMARY KEY (id),
      CONSTRAINT uq_workflow_versions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_workflow_version_number UNIQUE (tenant_id, workflow_definition_id, version),
      CONSTRAINT fk_workflow_version_definition FOREIGN KEY (tenant_id, workflow_definition_id)
        REFERENCES workflow_definitions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workflow_version_author FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_workflow_version_number CHECK (version >= 1),
      CONSTRAINT ck_workflow_version_status CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
      CONSTRAINT ck_workflow_version_rules_object CHECK (jsonb_typeof(routing_rules) = 'object'),
      CONSTRAINT ck_workflow_version_publish_pair CHECK ((published_by IS NULL) = (published_at IS NULL)),
      CONSTRAINT ck_workflow_version_published_status CHECK (status = 'DRAFT' OR published_by IS NOT NULL),
      CONSTRAINT ck_workflow_version_draft_unpublished CHECK (status <> 'DRAFT' OR published_by IS NULL),
      CONSTRAINT ck_workflow_version_maker_checker CHECK (published_by IS NULL OR published_by <> created_by),
      CONSTRAINT ck_workflow_version_hash_format CHECK (rules_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_workflow_version_effective_window CHECK (effective_to IS NULL OR effective_to > effective_from)
    )`);
    await queryRunner.query(`CREATE INDEX idx_workflow_version_status
      ON workflow_versions (tenant_id, workflow_definition_id, status)`);
    // FR-139: at most one version of a definition may be PUBLISHED at a time, so routing is
    // deterministic without the service having to pick between candidates.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_workflow_version_single_published
      ON workflow_versions (tenant_id, workflow_definition_id)
      WHERE status = 'PUBLISHED'`);

    await queryRunner.query(`CREATE TABLE workflow_instances (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      workflow_definition_id uuid NOT NULL,
      workflow_version_id uuid NOT NULL,
      object_type varchar(80) NOT NULL,
      object_id uuid NOT NULL,
      object_version integer NOT NULL,
      project_id uuid NOT NULL,
      package_id uuid,
      state varchar(30) NOT NULL,
      current_step_key varchar(80),
      current_attempt_no integer NOT NULL DEFAULT 1,
      route_snapshot jsonb NOT NULL,
      route_hash varchar(64) NOT NULL,
      sla_due_at timestamptz,
      requested_by uuid NOT NULL,
      closed_by uuid,
      closed_at timestamptz,
      closure_reason varchar(2000),
      version_no integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_workflow_instances PRIMARY KEY (id),
      CONSTRAINT uq_workflow_instances_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_workflow_instance_definition FOREIGN KEY (tenant_id, workflow_definition_id)
        REFERENCES workflow_definitions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workflow_instance_version FOREIGN KEY (tenant_id, workflow_version_id)
        REFERENCES workflow_versions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workflow_instance_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workflow_instance_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_workflow_instance_requester FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_workflow_instance_state CHECK (state IN (
        'SUBMITTED','IN_REVIEW','RETURNED','REJECTED','CONDITIONALLY_APPROVED',
        'APPROVED','CANCELLED','CONFIGURATION_ERROR','EXPIRED')),
      CONSTRAINT ck_workflow_instance_object_type CHECK (object_type IN ('ChangeRequest')),
      CONSTRAINT ck_workflow_instance_route_object CHECK (jsonb_typeof(route_snapshot) = 'object'),
      CONSTRAINT ck_workflow_instance_attempt CHECK (current_attempt_no >= 1),
      CONSTRAINT ck_workflow_instance_version CHECK (version_no >= 1),
      CONSTRAINT ck_workflow_instance_object_version CHECK (object_version >= 1),
      CONSTRAINT ck_workflow_instance_hash_format CHECK (route_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_workflow_instance_closure_pair CHECK ((
        state IN ('APPROVED','REJECTED','CANCELLED','EXPIRED') AND closed_at IS NOT NULL
      ) OR (
        state NOT IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')
        AND closed_at IS NULL AND closed_by IS NULL
      )),
      CONSTRAINT ck_workflow_instance_current_step CHECK (
        state IN ('APPROVED','REJECTED','CANCELLED','EXPIRED','CONFIGURATION_ERROR')
        OR current_step_key IS NOT NULL)
    )`);
    await queryRunner.query(`CREATE INDEX idx_workflow_instance_inbox
      ON workflow_instances (tenant_id, state, created_at DESC, id DESC)`);
    await queryRunner.query(`CREATE INDEX idx_workflow_instance_scope
      ON workflow_instances (tenant_id, project_id, package_id, state)`);
    await queryRunner.query(`CREATE INDEX idx_workflow_instance_object
      ON workflow_instances (tenant_id, object_type, object_id)`);
    // AC-069: one object cannot be in two live approval journeys at once.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_workflow_instance_active_object
      ON workflow_instances (tenant_id, object_type, object_id)
      WHERE state NOT IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')`);
    // Supports the deferred SLA scan without needing a later migration.
    await queryRunner.query(`CREATE INDEX idx_workflow_instance_sla
      ON workflow_instances (tenant_id, sla_due_at)
      WHERE sla_due_at IS NOT NULL
        AND state NOT IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')`);

    await queryRunner.query(`CREATE TABLE approval_decisions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      workflow_instance_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      step_key varchar(80) NOT NULL,
      attempt_no integer NOT NULL,
      decision varchar(30) NOT NULL,
      actor_id uuid NOT NULL,
      effective_actor_id uuid NOT NULL,
      comment varchar(2000) NOT NULL,
      conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
      decided_at timestamptz NOT NULL,
      correlation_id varchar(100) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_approval_decisions PRIMARY KEY (id),
      CONSTRAINT uq_approval_decisions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_approval_decision_sequence UNIQUE (tenant_id, workflow_instance_id, sequence_no),
      CONSTRAINT uq_approval_decision_actor_attempt
        UNIQUE (tenant_id, workflow_instance_id, step_key, attempt_no, actor_id),
      CONSTRAINT fk_approval_decision_instance FOREIGN KEY (tenant_id, workflow_instance_id)
        REFERENCES workflow_instances (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_approval_decision_actor FOREIGN KEY (tenant_id, actor_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_approval_decision_effective_actor FOREIGN KEY (tenant_id, effective_actor_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_approval_decision_value
        CHECK (decision IN ('APPROVE','REJECT','RETURN','CONDITIONAL_APPROVE')),
      CONSTRAINT ck_approval_decision_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_approval_decision_attempt CHECK (attempt_no >= 1),
      CONSTRAINT ck_approval_decision_comment CHECK (length(trim(comment)) >= 3),
      CONSTRAINT ck_approval_decision_conditions_array CHECK (jsonb_typeof(conditions) = 'array'),
      CONSTRAINT ck_approval_decision_conditions_present
        CHECK (decision = 'CONDITIONAL_APPROVE' OR jsonb_array_length(conditions) = 0)
    )`);
    await queryRunner.query(`CREATE INDEX idx_approval_decision_instance
      ON approval_decisions (tenant_id, workflow_instance_id, sequence_no)`);
    await queryRunner.query(`CREATE INDEX idx_approval_decision_actor
      ON approval_decisions (tenant_id, effective_actor_id, decided_at DESC)`);

    // AC-071/SEC-118: the decision ledger is append-only. A trigger, not just convention, so no
    // future code path or manual query can rewrite approval history.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION reject_approval_decision_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'approval_decisions is append-only; update and delete are not permitted';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_approval_decision_append_only
      BEFORE UPDATE OR DELETE ON approval_decisions
      FOR EACH ROW EXECUTE FUNCTION reject_approval_decision_rewrite()`);

    // A published version is immutable: republishing means creating a new version row, never
    // editing the rules somebody already approved against.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION reject_published_workflow_version_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.status <> 'DRAFT' AND (
        NEW.routing_rules IS DISTINCT FROM OLD.routing_rules
        OR NEW.rules_hash IS DISTINCT FROM OLD.rules_hash
        OR NEW.version IS DISTINCT FROM OLD.version
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.published_by IS DISTINCT FROM OLD.published_by
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'published workflow version rules are immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_workflow_version_immutable
      BEFORE UPDATE ON workflow_versions
      FOR EACH ROW EXECUTE FUNCTION reject_published_workflow_version_rewrite()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_workflow_version_immutable ON workflow_versions');
    await queryRunner.query('DROP FUNCTION IF EXISTS reject_published_workflow_version_rewrite()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_approval_decision_append_only ON approval_decisions');
    await queryRunner.query('DROP FUNCTION IF EXISTS reject_approval_decision_rewrite()');
    await queryRunner.query('DROP TABLE IF EXISTS approval_decisions');
    await queryRunner.query('DROP TABLE IF EXISTS workflow_instances');
    await queryRunner.query('DROP TABLE IF EXISTS workflow_versions');
    await queryRunner.query('DROP TABLE IF EXISTS workflow_definitions');
  }
}
