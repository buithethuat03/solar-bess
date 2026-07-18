import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRiskIssueControl1783731000000 implements MigrationInterface {
  name = 'CreateRiskIssueControl1783731000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE risks (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      package_id uuid NULL,
      code varchar(80) NOT NULL,
      category varchar(100) NOT NULL,
      cause varchar(2000) NOT NULL,
      event varchar(2000) NOT NULL,
      impact varchar(4000) NOT NULL,
      probability smallint NOT NULL,
      cost_impact_rating smallint NOT NULL,
      schedule_impact_rating smallint NOT NULL,
      hse_impact_rating smallint NOT NULL,
      impact_rating smallint NOT NULL,
      inherent_exposure smallint NOT NULL,
      inherent_level varchar(20) NOT NULL,
      residual_probability smallint NULL,
      residual_cost_impact_rating smallint NULL,
      residual_schedule_impact_rating smallint NULL,
      residual_hse_impact_rating smallint NULL,
      residual_impact_rating smallint NULL,
      residual_exposure smallint NULL,
      residual_level varchar(20) NULL,
      scoring_version varchar(100) NOT NULL,
      threshold_version varchar(100) NOT NULL,
      owner_id uuid NOT NULL,
      review_date date NOT NULL,
      response_strategy varchar(20) NULL,
      response_plan varchar(4000) NULL,
      trigger varchar(2000) NULL,
      contingency_plan varchar(4000) NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      status varchar(30) NOT NULL,
      occurred_issue_id uuid NULL,
      closure_requested_by uuid NULL,
      closure_requested_at timestamptz NULL,
      closure_reason varchar(2000) NULL,
      closure_request_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      closure_decision varchar(20) NULL,
      closure_decision_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      closure_decided_by uuid NULL,
      closure_decided_at timestamptz NULL,
      closure_decision_comment varchar(2000) NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_risks_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_risks_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_risk_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_risks_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risks_tenant_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risks_tenant_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risks_tenant_closure_requester FOREIGN KEY (tenant_id, closure_requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risks_tenant_closure_decider FOREIGN KEY (tenant_id, closure_decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risks_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risks_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_risk_status CHECK
        (status IN ('IDENTIFIED','ASSESSED','TREATING','MONITORING','CLOSURE_PENDING','CLOSED','OCCURRED')),
      CONSTRAINT ck_risk_response_strategy CHECK
        (response_strategy IS NULL OR response_strategy IN ('AVOID','MITIGATE','TRANSFER','ACCEPT')),
      CONSTRAINT ck_risk_inherent_ratings CHECK
        (probability BETWEEN 1 AND 5 AND cost_impact_rating BETWEEN 1 AND 5
         AND schedule_impact_rating BETWEEN 1 AND 5 AND hse_impact_rating BETWEEN 1 AND 5),
      CONSTRAINT ck_risk_inherent_derived CHECK
        (impact_rating = GREATEST(cost_impact_rating, schedule_impact_rating, hse_impact_rating)
         AND inherent_exposure = probability * impact_rating),
      CONSTRAINT ck_risk_inherent_level CHECK
        (inherent_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_risk_residual_complete CHECK ((
        residual_probability IS NULL AND residual_cost_impact_rating IS NULL
        AND residual_schedule_impact_rating IS NULL AND residual_hse_impact_rating IS NULL
        AND residual_impact_rating IS NULL AND residual_exposure IS NULL AND residual_level IS NULL
      ) OR (
        residual_probability BETWEEN 1 AND 5 AND residual_cost_impact_rating BETWEEN 1 AND 5
        AND residual_schedule_impact_rating BETWEEN 1 AND 5 AND residual_hse_impact_rating BETWEEN 1 AND 5
        AND residual_impact_rating = GREATEST(residual_cost_impact_rating, residual_schedule_impact_rating, residual_hse_impact_rating)
        AND residual_exposure = residual_probability * residual_impact_rating
        AND residual_level IN ('LOW','MEDIUM','HIGH','CRITICAL')
      )),
      CONSTRAINT ck_risk_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_risk_closure_request_evidence_array CHECK
        (jsonb_typeof(closure_request_evidence_refs) = 'array'),
      CONSTRAINT ck_risk_closure_decision_evidence_array CHECK
        (jsonb_typeof(closure_decision_evidence_refs) = 'array'),
      CONSTRAINT ck_risk_closure_request_projection CHECK ((
        closure_requested_by IS NULL AND closure_requested_at IS NULL AND closure_reason IS NULL
        AND jsonb_array_length(closure_request_evidence_refs) = 0
      ) OR (
        closure_requested_by IS NOT NULL AND closure_requested_at IS NOT NULL
        AND length(trim(closure_reason)) >= 3 AND jsonb_array_length(closure_request_evidence_refs) > 0
      )),
      CONSTRAINT ck_risk_closure_decision_projection CHECK ((
        closure_decision IS NULL AND closure_decided_by IS NULL AND closure_decided_at IS NULL
        AND closure_decision_comment IS NULL AND jsonb_array_length(closure_decision_evidence_refs) = 0
      ) OR (
        closure_decision IN ('APPROVE','RETURN','REJECT') AND closure_decided_by IS NOT NULL
        AND closure_decided_at IS NOT NULL AND length(trim(closure_decision_comment)) >= 3
        AND jsonb_array_length(closure_decision_evidence_refs) > 0
      )),
      CONSTRAINT ck_risk_closure_sod CHECK
        (closure_decided_by IS NULL OR closure_decided_by <> closure_requested_by),
      CONSTRAINT ck_risk_closure_decision_request CHECK
        (closure_decision IS NULL OR closure_requested_by IS NOT NULL),
      CONSTRAINT ck_risk_closure_pending_projection CHECK
        (status <> 'CLOSURE_PENDING' OR (closure_requested_by IS NOT NULL AND closure_decision IS NULL)),
      CONSTRAINT ck_risk_closed_projection CHECK (status <> 'CLOSED' OR closure_decision = 'APPROVE'),
      CONSTRAINT ck_risk_occurred_issue CHECK (status <> 'OCCURRED' OR occurred_issue_id IS NOT NULL),
      CONSTRAINT ck_risk_version CHECK (version_no >= 1))`);
    await queryRunner.query(`CREATE INDEX idx_risk_register
      ON risks (tenant_id, project_id, package_id, status, owner_id, residual_exposure, review_date)`);

    await queryRunner.query(`CREATE TABLE issues (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      package_id uuid NULL,
      code varchar(80) NOT NULL,
      title varchar(250) NOT NULL,
      description varchar(4000) NOT NULL,
      occurred_at timestamptz NOT NULL,
      root_cause varchar(4000) NOT NULL,
      actual_impact varchar(4000) NOT NULL,
      severity varchar(20) NOT NULL,
      decision_summary varchar(4000) NULL,
      owner_id uuid NOT NULL,
      target_date date NOT NULL,
      source_risk_id uuid NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      status varchar(30) NOT NULL,
      resolution_summary varchar(4000) NULL,
      resolution_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      resolved_by uuid NULL,
      resolved_at timestamptz NULL,
      closure_requested_by uuid NULL,
      closure_requested_at timestamptz NULL,
      closure_reason varchar(2000) NULL,
      closure_request_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      closure_decision varchar(20) NULL,
      closure_decision_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      closure_decided_by uuid NULL,
      closure_decided_at timestamptz NULL,
      closure_decision_comment varchar(2000) NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_issues_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_issues_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_issue_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_issues_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_source_risk FOREIGN KEY (tenant_id, project_id, source_risk_id)
        REFERENCES risks (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_resolved_by FOREIGN KEY (tenant_id, resolved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_closure_requester FOREIGN KEY (tenant_id, closure_requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_closure_decider FOREIGN KEY (tenant_id, closure_decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_issues_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_issue_status CHECK
        (status IN ('REPORTED','TRIAGED','IN_PROGRESS','RESOLVED','CLOSURE_PENDING','CLOSED','REOPENED')),
      CONSTRAINT ck_issue_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_issue_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_issue_resolution_evidence_array CHECK
        (jsonb_typeof(resolution_evidence_refs) = 'array'),
      CONSTRAINT ck_issue_resolution_pair CHECK ((resolved_by IS NULL) = (resolved_at IS NULL)),
      CONSTRAINT ck_issue_resolution_facts CHECK
        (status NOT IN ('RESOLVED','CLOSURE_PENDING','CLOSED') OR
          (length(trim(resolution_summary)) >= 3 AND resolved_by IS NOT NULL
           AND jsonb_array_length(resolution_evidence_refs) > 0)),
      CONSTRAINT ck_issue_closure_request_evidence_array CHECK
        (jsonb_typeof(closure_request_evidence_refs) = 'array'),
      CONSTRAINT ck_issue_closure_decision_evidence_array CHECK
        (jsonb_typeof(closure_decision_evidence_refs) = 'array'),
      CONSTRAINT ck_issue_closure_request_projection CHECK ((
        closure_requested_by IS NULL AND closure_requested_at IS NULL AND closure_reason IS NULL
        AND jsonb_array_length(closure_request_evidence_refs) = 0
      ) OR (
        closure_requested_by IS NOT NULL AND closure_requested_at IS NOT NULL
        AND length(trim(closure_reason)) >= 3 AND jsonb_array_length(closure_request_evidence_refs) > 0
      )),
      CONSTRAINT ck_issue_closure_decision_projection CHECK ((
        closure_decision IS NULL AND closure_decided_by IS NULL AND closure_decided_at IS NULL
        AND closure_decision_comment IS NULL AND jsonb_array_length(closure_decision_evidence_refs) = 0
      ) OR (
        closure_decision IN ('APPROVE','RETURN','REJECT') AND closure_decided_by IS NOT NULL
        AND closure_decided_at IS NOT NULL AND length(trim(closure_decision_comment)) >= 3
        AND jsonb_array_length(closure_decision_evidence_refs) > 0
      )),
      CONSTRAINT ck_issue_closure_sod CHECK
        (closure_decided_by IS NULL OR closure_decided_by <> closure_requested_by),
      CONSTRAINT ck_issue_closure_decision_request CHECK
        (closure_decision IS NULL OR closure_requested_by IS NOT NULL),
      CONSTRAINT ck_issue_closure_pending_projection CHECK
        (status <> 'CLOSURE_PENDING' OR (closure_requested_by IS NOT NULL AND closure_decision IS NULL)),
      CONSTRAINT ck_issue_closed_projection CHECK (status <> 'CLOSED' OR closure_decision = 'APPROVE'),
      CONSTRAINT ck_issue_version CHECK (version_no >= 1))`);
    await queryRunner.query(`CREATE INDEX idx_issue_register
      ON issues (tenant_id, project_id, package_id, status, severity, owner_id, target_date)`);

    await queryRunner.query(`ALTER TABLE risks ADD CONSTRAINT fk_risks_tenant_occurred_issue
      FOREIGN KEY (tenant_id, project_id, occurred_issue_id)
      REFERENCES issues (tenant_id, project_id, id) ON DELETE RESTRICT`);

    await queryRunner.query(`CREATE FUNCTION enforce_risk_issue_parent_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE parent_package_id uuid;
    DECLARE parent_risk_id uuid;
    BEGIN
      IF TG_TABLE_NAME = 'issues' THEN
        IF NEW.source_risk_id IS NOT NULL THEN
          SELECT package_id INTO parent_package_id FROM risks
            WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.source_risk_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_issues_tenant_source_risk',
              MESSAGE = 'source Risk does not exist in Issue tenant/project scope';
          END IF;
          IF parent_package_id IS DISTINCT FROM NEW.package_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_issue_source_risk_package_scope',
              MESSAGE = 'Issue package scope must match source Risk';
          END IF;
        END IF;
      ELSIF TG_TABLE_NAME = 'risks' THEN
        IF NEW.occurred_issue_id IS NOT NULL THEN
          SELECT package_id, source_risk_id INTO parent_package_id, parent_risk_id FROM issues
            WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.occurred_issue_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_risks_tenant_occurred_issue',
              MESSAGE = 'occurred Issue does not exist in Risk tenant/project scope';
          END IF;
          IF parent_package_id IS DISTINCT FROM NEW.package_id OR parent_risk_id IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_risk_occurred_issue_scope',
              MESSAGE = 'occurred Issue must link the same Risk and package scope';
          END IF;
        END IF;
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_issue_source_risk_scope
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, package_id, source_risk_id ON issues
      FOR EACH ROW EXECUTE FUNCTION enforce_risk_issue_parent_scope()`);
    await queryRunner.query(`CREATE TRIGGER trg_risk_occurred_issue_scope
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, package_id, occurred_issue_id ON risks
      FOR EACH ROW EXECUTE FUNCTION enforce_risk_issue_parent_scope()`);

    await queryRunner.query(`CREATE TABLE risk_issue_actions (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      package_id uuid NULL,
      risk_id uuid NULL,
      issue_id uuid NULL,
      code varchar(80) NOT NULL,
      action_type varchar(30) NOT NULL,
      title varchar(250) NOT NULL,
      description varchar(4000) NULL,
      owner_id uuid NOT NULL,
      due_date date NOT NULL,
      status varchar(30) NOT NULL,
      status_reason varchar(2000) NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      residual_probability smallint NULL,
      residual_cost_impact_rating smallint NULL,
      residual_schedule_impact_rating smallint NULL,
      residual_hse_impact_rating smallint NULL,
      residual_risk_version integer NULL,
      completed_by uuid NULL,
      completed_at timestamptz NULL,
      verified_by uuid NULL,
      verified_at timestamptz NULL,
      cancelled_by uuid NULL,
      cancelled_at timestamptz NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_risk_issue_actions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_risk_issue_actions_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_risk_issue_action_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT fk_risk_issue_actions_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_risk FOREIGN KEY (tenant_id, project_id, risk_id)
        REFERENCES risks (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_issue FOREIGN KEY (tenant_id, project_id, issue_id)
        REFERENCES issues (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_completed_by FOREIGN KEY (tenant_id, completed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_verified_by FOREIGN KEY (tenant_id, verified_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_cancelled_by FOREIGN KEY (tenant_id, cancelled_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_actions_tenant_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_risk_issue_action_parent CHECK ((risk_id IS NULL) <> (issue_id IS NULL)),
      CONSTRAINT ck_risk_issue_action_type CHECK
        (action_type IN ('RESPONSE','CONTINGENCY','CORRECTIVE','DECISION')),
      CONSTRAINT ck_risk_issue_action_status CHECK
        (status IN ('OPEN','IN_PROGRESS','BLOCKED','DONE','VERIFIED','CANCELLED')),
      CONSTRAINT ck_risk_issue_action_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_risk_issue_action_residual_complete CHECK ((
        residual_probability IS NULL AND residual_cost_impact_rating IS NULL
        AND residual_schedule_impact_rating IS NULL AND residual_hse_impact_rating IS NULL
        AND residual_risk_version IS NULL
      ) OR (
        risk_id IS NOT NULL AND residual_probability BETWEEN 1 AND 5
        AND residual_cost_impact_rating BETWEEN 1 AND 5
        AND residual_schedule_impact_rating BETWEEN 1 AND 5
        AND residual_hse_impact_rating BETWEEN 1 AND 5 AND residual_risk_version >= 1
      )),
      CONSTRAINT ck_risk_issue_action_completion_pair CHECK ((completed_by IS NULL) = (completed_at IS NULL)),
      CONSTRAINT ck_risk_issue_action_verification_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
      CONSTRAINT ck_risk_issue_action_cancellation_pair CHECK ((cancelled_by IS NULL) = (cancelled_at IS NULL)),
      CONSTRAINT ck_risk_issue_action_terminal_facts CHECK (
        (status IN ('OPEN','IN_PROGRESS','BLOCKED')
          AND completed_by IS NULL AND verified_by IS NULL AND cancelled_by IS NULL)
        OR (status = 'DONE' AND completed_by IS NOT NULL
          AND verified_by IS NULL AND cancelled_by IS NULL AND jsonb_array_length(evidence_refs) > 0)
        OR (status = 'VERIFIED' AND completed_by IS NOT NULL
          AND verified_by IS NOT NULL AND cancelled_by IS NULL AND jsonb_array_length(evidence_refs) > 0)
        OR (status = 'CANCELLED' AND verified_by IS NULL AND cancelled_by IS NOT NULL
          AND length(trim(status_reason)) >= 3 AND jsonb_array_length(evidence_refs) > 0)),
      CONSTRAINT ck_risk_issue_action_verification_sod CHECK
        (verified_by IS NULL OR (verified_by <> owner_id AND verified_by IS DISTINCT FROM completed_by)),
      CONSTRAINT ck_risk_issue_action_cancellation_sod CHECK
        (cancelled_by IS NULL OR (cancelled_by <> owner_id AND cancelled_by IS DISTINCT FROM completed_by)),
      CONSTRAINT ck_risk_issue_action_version CHECK (version_no >= 1))`);
    await queryRunner.query(`CREATE INDEX idx_risk_issue_action_register
      ON risk_issue_actions (tenant_id, project_id, package_id, owner_id, status, due_date)`);
    await queryRunner.query(`CREATE INDEX idx_risk_issue_action_risk
      ON risk_issue_actions (tenant_id, project_id, risk_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_risk_issue_action_issue
      ON risk_issue_actions (tenant_id, project_id, issue_id, status)`);

    await queryRunner.query(`CREATE FUNCTION enforce_risk_issue_action_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE parent_package_id uuid;
    BEGIN
      IF NEW.risk_id IS NOT NULL THEN
        SELECT package_id INTO parent_package_id FROM risks
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.risk_id;
      ELSE
        SELECT package_id INTO parent_package_id FROM issues
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.issue_id;
      END IF;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_risk_issue_action_parent_scope',
          MESSAGE = 'Risk/Issue Action parent does not exist in tenant/project scope';
      END IF;
      IF parent_package_id IS DISTINCT FROM NEW.package_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_risk_issue_action_package_scope',
          MESSAGE = 'Risk/Issue Action package scope must match parent';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_risk_issue_action_scope
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, package_id, risk_id, issue_id ON risk_issue_actions
      FOR EACH ROW EXECUTE FUNCTION enforce_risk_issue_action_scope()`);

    await queryRunner.query(`CREATE FUNCTION protect_risk_issue_action_terminal()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND OLD.status IN ('VERIFIED','CANCELLED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal Risk/Issue Action is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status IN ('VERIFIED','CANCELLED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal Risk/Issue Action is immutable';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.status = 'DONE' AND
         (to_jsonb(NEW) - ARRAY['status','status_reason','evidence_refs','verified_by','verified_at',
          'cancelled_by','cancelled_at','version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['status','status_reason','evidence_refs','verified_by','verified_at',
          'cancelled_by','cancelled_at','version_no','updated_by','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'completed Action facts and residual proposal are immutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_risk_issue_action_terminal
      BEFORE UPDATE OR DELETE ON risk_issue_actions
      FOR EACH ROW EXECUTE FUNCTION protect_risk_issue_action_terminal()`);

    await queryRunner.query(`CREATE TABLE risk_issue_closure_cycles (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL,
      package_id uuid NULL,
      risk_id uuid NULL,
      issue_id uuid NULL,
      sequence_no integer NOT NULL,
      request_reason varchar(2000) NOT NULL,
      request_evidence_refs jsonb NOT NULL,
      requested_by uuid NOT NULL,
      requested_at timestamptz NOT NULL,
      decision varchar(20) NULL,
      decision_comment varchar(2000) NULL,
      decision_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      decided_by uuid NULL,
      decided_at timestamptz NULL,
      resulting_status varchar(30) NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_risk_issue_closure_cycles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_risk_issue_closure_cycles_tenant_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_closure_cycles_tenant_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_closure_cycles_tenant_risk FOREIGN KEY (tenant_id, project_id, risk_id)
        REFERENCES risks (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_closure_cycles_tenant_issue FOREIGN KEY (tenant_id, project_id, issue_id)
        REFERENCES issues (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_closure_cycles_tenant_requested_by FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_risk_issue_closure_cycles_tenant_decided_by FOREIGN KEY (tenant_id, decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_risk_issue_closure_cycle_parent CHECK ((risk_id IS NULL) <> (issue_id IS NULL)),
      CONSTRAINT ck_risk_issue_closure_cycle_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_risk_issue_closure_cycle_request_evidence CHECK
        (jsonb_typeof(request_evidence_refs) = 'array' AND jsonb_array_length(request_evidence_refs) > 0),
      CONSTRAINT ck_risk_issue_closure_cycle_decision_evidence CHECK
        (jsonb_typeof(decision_evidence_refs) = 'array'),
      CONSTRAINT ck_risk_issue_closure_cycle_decision CHECK ((
        decision IS NULL AND decision_comment IS NULL AND jsonb_array_length(decision_evidence_refs) = 0
        AND decided_by IS NULL AND decided_at IS NULL AND resulting_status IS NULL
      ) OR (
        decision IN ('APPROVE','RETURN','REJECT') AND length(trim(decision_comment)) >= 3
        AND jsonb_array_length(decision_evidence_refs) > 0 AND decided_by IS NOT NULL
        AND decided_at IS NOT NULL AND resulting_status IS NOT NULL
      )),
      CONSTRAINT ck_risk_issue_closure_cycle_result CHECK (decision IS NULL OR (
        (risk_id IS NOT NULL AND resulting_status = CASE WHEN decision = 'APPROVE' THEN 'CLOSED' ELSE 'MONITORING' END)
        OR (issue_id IS NOT NULL AND resulting_status = CASE WHEN decision = 'APPROVE' THEN 'CLOSED' ELSE 'RESOLVED' END)
      )),
      CONSTRAINT ck_risk_issue_closure_cycle_sod CHECK
        (decided_by IS NULL OR decided_by <> requested_by))`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_risk_closure_cycle_sequence
      ON risk_issue_closure_cycles (tenant_id, risk_id, sequence_no) WHERE risk_id IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_issue_closure_cycle_sequence
      ON risk_issue_closure_cycles (tenant_id, issue_id, sequence_no) WHERE issue_id IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_risk_closure_cycle_open
      ON risk_issue_closure_cycles (tenant_id, risk_id) WHERE risk_id IS NOT NULL AND decision IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_issue_closure_cycle_open
      ON risk_issue_closure_cycles (tenant_id, issue_id) WHERE issue_id IS NOT NULL AND decision IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_risk_closure_cycle_history
      ON risk_issue_closure_cycles (tenant_id, project_id, risk_id, sequence_no, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_issue_closure_cycle_history
      ON risk_issue_closure_cycles (tenant_id, project_id, issue_id, sequence_no, created_at)`);

    await queryRunner.query(`CREATE FUNCTION enforce_risk_issue_closure_cycle_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE parent_package_id uuid;
    BEGIN
      IF NEW.risk_id IS NOT NULL THEN
        SELECT package_id INTO parent_package_id FROM risks
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.risk_id;
      ELSE
        SELECT package_id INTO parent_package_id FROM issues
          WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.issue_id;
      END IF;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_risk_issue_closure_cycle_parent_scope',
          MESSAGE = 'closure cycle parent does not exist in tenant/project scope';
      END IF;
      IF parent_package_id IS DISTINCT FROM NEW.package_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_risk_issue_closure_cycle_package_scope',
          MESSAGE = 'closure cycle package scope must match parent';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_risk_issue_closure_cycle_scope
      BEFORE INSERT OR UPDATE OF tenant_id, project_id, package_id, risk_id, issue_id
      ON risk_issue_closure_cycles
      FOR EACH ROW EXECUTE FUNCTION enforce_risk_issue_closure_cycle_scope()`);

    await queryRunner.query(`CREATE FUNCTION protect_risk_issue_closure_cycle()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Risk/Issue closure cycle cannot be deleted';
      END IF;
      IF OLD.decision IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'completed Risk/Issue closure cycle is immutable';
      END IF;
      IF NEW.decision IS NULL OR
         (to_jsonb(NEW) - ARRAY['decision','decision_comment','decision_evidence_refs',
          'decided_by','decided_at','resulting_status']::text[])
         <> (to_jsonb(OLD) - ARRAY['decision','decision_comment','decision_evidence_refs',
          'decided_by','decided_at','resulting_status']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'closure cycle update may only complete its decision';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_risk_issue_closure_cycle_immutable
      BEFORE UPDATE OR DELETE ON risk_issue_closure_cycles
      FOR EACH ROW EXECUTE FUNCTION protect_risk_issue_closure_cycle()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_risk_issue_closure_cycle_immutable ON risk_issue_closure_cycles');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_risk_issue_closure_cycle()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_risk_issue_closure_cycle_scope ON risk_issue_closure_cycles');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_risk_issue_closure_cycle_scope()');
    await queryRunner.query('DROP TABLE IF EXISTS risk_issue_closure_cycles');

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_risk_issue_action_terminal ON risk_issue_actions');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_risk_issue_action_terminal()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_risk_issue_action_scope ON risk_issue_actions');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_risk_issue_action_scope()');
    await queryRunner.query('DROP TABLE IF EXISTS risk_issue_actions');

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_risk_occurred_issue_scope ON risks');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_issue_source_risk_scope ON issues');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_risk_issue_parent_scope()');
    await queryRunner.query('ALTER TABLE risks DROP CONSTRAINT IF EXISTS fk_risks_tenant_occurred_issue');
    await queryRunner.query('DROP TABLE IF EXISTS issues');
    await queryRunner.query('DROP TABLE IF EXISTS risks');
  }
}
