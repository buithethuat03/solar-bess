import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChangeControl1783732000000 implements MigrationInterface {
  name = 'CreateChangeControl1783732000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE change_requests (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      package_id uuid NULL,
      code varchar(80) NOT NULL,
      title varchar(250) NOT NULL,
      reason varchar(4000) NOT NULL,
      options jsonb NOT NULL DEFAULT '[]'::jsonb,
      recommendation varchar(4000) NULL,
      owner_id uuid NOT NULL,
      requester_id uuid NOT NULL,
      source_baseline_id uuid NULL,
      source_type varchar(20) NOT NULL,
      source_risk_id uuid NULL,
      source_issue_id uuid NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_evidence_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
      impact_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
      impact_snapshot jsonb NULL,
      impact_snapshot_hash varchar(64) NULL,
      approval_snapshot jsonb NULL,
      approval_snapshot_hash varchar(64) NULL,
      status varchar(30) NOT NULL,
      submitted_by uuid NULL,
      submitted_at timestamptz NULL,
      decision_version integer NULL,
      decided_by uuid NULL,
      decided_at timestamptz NULL,
      approved_by uuid NULL,
      approved_at timestamptz NULL,
      decision_comment varchar(2000) NULL,
      schedule_impact_approved boolean NOT NULL DEFAULT false,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_change_requests_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_change_requests_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_change_request_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_change_requests_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_source_risk FOREIGN KEY (tenant_id, project_id, source_risk_id)
        REFERENCES risks (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_source_issue FOREIGN KEY (tenant_id, project_id, source_issue_id)
        REFERENCES issues (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_source_baseline FOREIGN KEY (tenant_id, project_id, source_baseline_id)
        REFERENCES schedule_baselines (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_requester FOREIGN KEY (tenant_id, requester_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_submitter FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_decider FOREIGN KEY (tenant_id, decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_approver FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_change_requests_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_change_request_status CHECK
        (status IN ('DRAFT','ASSESSED','SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED')),
      CONSTRAINT ck_change_request_source CHECK (
        (source_type = 'MANUAL' AND source_risk_id IS NULL AND source_issue_id IS NULL)
        OR (source_type = 'RISK' AND source_risk_id IS NOT NULL AND source_issue_id IS NULL)
        OR (source_type = 'ISSUE' AND source_risk_id IS NULL AND source_issue_id IS NOT NULL)),
      CONSTRAINT ck_change_request_options_array CHECK (jsonb_typeof(options) = 'array'),
      CONSTRAINT ck_change_request_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_change_request_source_evidence_array CHECK
        (jsonb_typeof(source_evidence_snapshot) = 'array'),
      CONSTRAINT ck_change_request_impact_draft_object CHECK (jsonb_typeof(impact_draft) = 'object'),
      CONSTRAINT ck_change_request_impact_snapshot_object CHECK
        (impact_snapshot IS NULL OR jsonb_typeof(impact_snapshot) = 'object'),
      CONSTRAINT ck_change_request_approval_snapshot_object CHECK
        (approval_snapshot IS NULL OR jsonb_typeof(approval_snapshot) = 'object'),
      CONSTRAINT ck_change_request_impact_hash_pair CHECK
        ((impact_snapshot IS NULL) = (impact_snapshot_hash IS NULL)),
      CONSTRAINT ck_change_request_approval_hash_pair CHECK
        ((approval_snapshot IS NULL) = (approval_snapshot_hash IS NULL)),
      CONSTRAINT ck_change_request_hash_format CHECK
        ((impact_snapshot_hash IS NULL OR impact_snapshot_hash ~ '^[0-9a-f]{64}$')
         AND (approval_snapshot_hash IS NULL OR approval_snapshot_hash ~ '^[0-9a-f]{64}$')),
      CONSTRAINT ck_change_request_submit_pair CHECK ((submitted_by IS NULL) = (submitted_at IS NULL)),
      CONSTRAINT ck_change_request_decision_facts CHECK ((
        decision_version IS NULL AND decided_by IS NULL AND decided_at IS NULL AND decision_comment IS NULL
      ) OR (
        decision_version >= 1 AND decided_by IS NOT NULL AND decided_at IS NOT NULL
        AND length(trim(decision_comment)) >= 3
      )),
      CONSTRAINT ck_change_request_approval_pair CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
      CONSTRAINT ck_change_request_submitted_snapshot CHECK
        (status IN ('DRAFT','ASSESSED') OR
          (submitted_by IS NOT NULL AND impact_snapshot IS NOT NULL AND approval_snapshot IS NOT NULL)),
      CONSTRAINT ck_change_request_decided_status CHECK
        (status NOT IN ('APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED') OR decided_by IS NOT NULL),
      CONSTRAINT ck_change_request_approved_status CHECK
        (status NOT IN ('APPROVED','IMPLEMENTED','CLOSED') OR approved_by IS NOT NULL),
      CONSTRAINT ck_change_request_approval_status CHECK
        (approved_by IS NULL OR status IN ('APPROVED','IMPLEMENTED','CLOSED')),
      CONSTRAINT ck_change_request_schedule_approval_status CHECK
        (schedule_impact_approved = false OR status IN ('APPROVED','IMPLEMENTED','CLOSED')),
      CONSTRAINT ck_change_request_rebaseline_source CHECK
        (schedule_impact_approved = false OR source_baseline_id IS NOT NULL),
      CONSTRAINT ck_change_request_sod CHECK
        (decided_by IS NULL OR (decided_by <> requester_id AND decided_by IS DISTINCT FROM submitted_by)),
      CONSTRAINT ck_change_request_version CHECK (version_no >= 1))`);
    await queryRunner.query(`CREATE INDEX idx_change_request_register
      ON change_requests (tenant_id, project_id, package_id, status, requester_id, submitted_at)`);

    await queryRunner.query(`CREATE FUNCTION enforce_change_request_source_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE source_package_id uuid;
    BEGIN
      IF NEW.source_type = 'RISK' THEN
        SELECT package_id INTO source_package_id FROM risks
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.source_risk_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_change_requests_tenant_source_risk',
            MESSAGE = 'source Risk does not exist in Change tenant/project scope';
        END IF;
        IF source_package_id IS DISTINCT FROM NEW.package_id THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_change_request_source_package_scope',
            MESSAGE = 'Change package scope must match source Risk';
        END IF;
      ELSIF NEW.source_type = 'ISSUE' THEN
        SELECT package_id INTO source_package_id FROM issues
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.source_issue_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_change_requests_tenant_source_issue',
            MESSAGE = 'source Issue does not exist in Change tenant/project scope';
        END IF;
        IF source_package_id IS DISTINCT FROM NEW.package_id THEN
          RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_change_request_source_package_scope',
            MESSAGE = 'Change package scope must match source Issue';
        END IF;
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_change_request_source_scope
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, package_id, source_type, source_risk_id, source_issue_id
      ON change_requests
      FOR EACH ROW EXECUTE FUNCTION enforce_change_request_source_scope()`);

    await queryRunner.query(`CREATE FUNCTION protect_change_request_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.status IN ('SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change history cannot be deleted';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED','IMPLEMENTED','CLOSED') AND
         (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved Change snapshot is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND (
        (OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED','IMPLEMENTED','CLOSED'))
        OR (OLD.status = 'IMPLEMENTED' AND NEW.status NOT IN ('IMPLEMENTED','CLOSED'))
        OR (OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED')
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved Change status cannot regress';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED' AND
         (to_jsonb(NEW) - ARRAY['status','decision_version','decided_by','decided_at','approved_by','approved_at',
          'decision_comment','schedule_impact_approved','version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['status','decision_version','decided_by','decided_at','approved_by','approved_at',
          'decision_comment','schedule_impact_approved','version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change source/reason/impact snapshot is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED'
         AND NEW.status NOT IN ('APPROVED','RETURNED','REJECTED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change requires an explicit decision';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'REJECTED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'rejected Change decision is immutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_change_request_history
      BEFORE UPDATE OR DELETE ON change_requests
      FOR EACH ROW EXECUTE FUNCTION protect_change_request_history()`);

    await queryRunner.query(`ALTER TABLE schedule_baselines
      ADD CONSTRAINT fk_schedule_baselines_approved_change
      FOREIGN KEY (tenant_id, project_id, approved_change_request_id)
      REFERENCES change_requests (tenant_id, project_id, id) ON DELETE RESTRICT`);

    await queryRunner.query(`CREATE FUNCTION enforce_rebaseline_approved_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.baseline_type = 'REBASELINE' AND NOT EXISTS (
        SELECT 1 FROM change_requests change
        WHERE change.tenant_id = NEW.tenant_id AND change.project_id = NEW.project_id
          AND change.id = NEW.approved_change_request_id
          AND change.status IN ('APPROVED','IMPLEMENTED','CLOSED')
          AND change.schedule_impact_approved = true
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_schedule_baseline_approved_change',
          MESSAGE = 'REBASELINE requires a same-project approved schedule-impact Change';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_schedule_baseline_approved_change
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, baseline_type, approved_change_request_id
      ON schedule_baselines
      FOR EACH ROW EXECUTE FUNCTION enforce_rebaseline_approved_change()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM schedule_baselines WHERE approved_change_request_id IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'cannot revert Change migration while schedule baselines reference approved Changes';
      END IF;
    END $$`);
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_schedule_baseline_approved_change ON schedule_baselines');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_rebaseline_approved_change()');
    await queryRunner.query('ALTER TABLE schedule_baselines DROP CONSTRAINT IF EXISTS fk_schedule_baselines_approved_change');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_change_request_history ON change_requests');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_change_request_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_change_request_source_scope ON change_requests');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_change_request_source_scope()');
    await queryRunner.query('DROP TABLE IF EXISTS change_requests');
  }
}
