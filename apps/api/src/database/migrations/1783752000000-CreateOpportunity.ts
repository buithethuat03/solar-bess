import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-014 (opportunities), DB-015 (survey_packages), DB-016 (investment_scenarios) for the
 * Opportunity slice (US-025, WF-002, API-026…API-033). The DDL mirrors the entity decorators
 * one-for-one: every `@Check`, `@Unique` and `@Index` appears here under the same name.
 *
 * Also carries two recorded amendments to existing objects:
 * - DB-010 amendment: `projects.source_opportunity_id` (nullable uuid, composite FK, partial
 *   unique) — one project per opportunity; the DB-level idempotency anchor for API-033 convert.
 * - DB-071 vocabulary: `ck_workflow_instance_object_type` widened to accept 'InvestmentScenario'
 *   so the engine can host scenario approvals once it accepts pre-project targets. The engine's
 *   `project_id NOT NULL` is deliberately NOT relaxed here — that would be a DB-071 semantic
 *   change outside this slice's scope (recorded honest stop; API-032 records submission on the
 *   aggregate itself for now).
 *
 * Deliberate absences: no FK on `opportunities.site_id` — sites (DB-011) are project-scoped and no
 * project exists before conversion; no server-side financial computation — DB-016 stores
 * client-supplied figures verbatim with `formula_version` (no approved formula catalog exists).
 *
 * Money/quantities are numeric(19,4) (rates numeric(9,6)); duplicate detection is the partial
 * unique index over the server-computed `duplicate_key` (recorded Assumption: sha256 of the
 * normalized customer + location pair is the V1 duplicate identity).
 */
export class CreateOpportunity1783752000000 implements MigrationInterface {
  name = 'CreateOpportunity1783752000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE opportunities (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      code varchar(64) NOT NULL,
      customer_company_id uuid,
      name varchar(400) NOT NULL,
      stage varchar(30) NOT NULL,
      site_id uuid,
      location_text varchar(500),
      expected_capacity_kwp numeric(19,4),
      duplicate_key varchar(200),
      owner_id uuid NOT NULL,
      converted_project_id uuid,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_opportunities PRIMARY KEY (id),
      CONSTRAINT uq_opportunities_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_opportunity_code UNIQUE (tenant_id, code),
      CONSTRAINT fk_opportunity_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_opportunity_customer_company FOREIGN KEY (tenant_id, customer_company_id)
        REFERENCES companies (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_opportunity_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_opportunity_converted_project FOREIGN KEY (tenant_id, converted_project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_opportunity_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_opportunity_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_opportunity_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_./-]{0,63}$'),
      CONSTRAINT ck_opportunity_stage CHECK (stage IN (
        'LEAD','QUALIFIED','SURVEYED','SCENARIO_READY','SUBMITTED',
        'APPROVED','RETURNED','REJECTED','CONVERTED')),
      CONSTRAINT ck_opportunity_capacity CHECK
        (expected_capacity_kwp IS NULL OR expected_capacity_kwp > 0),
      CONSTRAINT ck_opportunity_duplicate_key_format CHECK
        (duplicate_key IS NULL OR duplicate_key ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_opportunity_converted_pair CHECK
        ((stage = 'CONVERTED') = (converted_project_id IS NOT NULL)),
      CONSTRAINT ck_opportunity_version CHECK (version_no >= 1)
    )`);
    // Structural duplicate control: the same normalized customer + location pair may exist once.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_opportunity_duplicate_key
      ON opportunities (tenant_id, duplicate_key) WHERE duplicate_key IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_opportunity_pipeline
      ON opportunities (tenant_id, stage, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_opportunity_customer
      ON opportunities (tenant_id, customer_company_id)`);

    await queryRunner.query(`CREATE TABLE survey_packages (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      opportunity_id uuid NOT NULL,
      revision integer NOT NULL,
      data_quality varchar(20) NOT NULL,
      document_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      notes varchar(4000),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_survey_packages PRIMARY KEY (id),
      CONSTRAINT uq_survey_packages_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_survey_package_revision UNIQUE (tenant_id, opportunity_id, revision),
      CONSTRAINT fk_survey_package_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_survey_package_opportunity FOREIGN KEY (tenant_id, opportunity_id)
        REFERENCES opportunities (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_survey_package_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_survey_package_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_survey_package_revision CHECK (revision >= 1),
      CONSTRAINT ck_survey_package_quality CHECK
        (data_quality IN ('RAW','VALIDATED','APPROVED')),
      CONSTRAINT ck_survey_package_document_refs CHECK (jsonb_typeof(document_refs) = 'array'),
      CONSTRAINT ck_survey_package_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_survey_package_opportunity
      ON survey_packages (tenant_id, opportunity_id)`);

    await queryRunner.query(`CREATE TABLE investment_scenarios (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      opportunity_id uuid NOT NULL,
      scenario_type varchar(30) NOT NULL,
      version integer NOT NULL,
      status varchar(20) NOT NULL,
      currency char(3) NOT NULL,
      capex_total numeric(19,4),
      npv numeric(19,4),
      irr numeric(9,6),
      payback_months integer,
      input_snapshot jsonb NOT NULL,
      output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      formula_version varchar(40) NOT NULL,
      workflow_instance_id uuid,
      submitted_by uuid,
      submitted_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_investment_scenarios PRIMARY KEY (id),
      CONSTRAINT uq_investment_scenarios_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_investment_scenario_version UNIQUE
        (tenant_id, opportunity_id, scenario_type, version),
      CONSTRAINT fk_investment_scenario_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_investment_scenario_opportunity FOREIGN KEY (tenant_id, opportunity_id)
        REFERENCES opportunities (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_investment_scenario_workflow_instance
        FOREIGN KEY (tenant_id, workflow_instance_id)
        REFERENCES workflow_instances (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_investment_scenario_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_investment_scenario_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_investment_scenario_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_investment_scenario_type CHECK (scenario_type IN ('SOLAR','BESS','HYBRID')),
      CONSTRAINT ck_investment_scenario_status CHECK
        (status IN ('DRAFT','SUBMITTED','APPROVED','RETURNED','REJECTED')),
      CONSTRAINT ck_investment_scenario_version_number CHECK (version >= 1),
      CONSTRAINT ck_investment_scenario_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_investment_scenario_capex CHECK (capex_total IS NULL OR capex_total >= 0),
      CONSTRAINT ck_investment_scenario_payback CHECK
        (payback_months IS NULL OR payback_months >= 0),
      CONSTRAINT ck_investment_scenario_input_object CHECK
        (jsonb_typeof(input_snapshot) = 'object'),
      CONSTRAINT ck_investment_scenario_output_object CHECK
        (jsonb_typeof(output_snapshot) = 'object'),
      CONSTRAINT ck_investment_scenario_submitted_pair CHECK
        ((submitted_by IS NULL) = (submitted_at IS NULL)),
      CONSTRAINT ck_investment_scenario_submitted_status CHECK
        (status = 'DRAFT' OR submitted_by IS NOT NULL),
      CONSTRAINT ck_investment_scenario_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_investment_scenario_opportunity
      ON investment_scenarios (tenant_id, opportunity_id, scenario_type)`);

    // DB-010 amendment: additive column + composite FK + partial unique (one project per
    // opportunity). This is the idempotency anchor API-033 relies on for convert replays.
    await queryRunner.query('ALTER TABLE projects ADD COLUMN source_opportunity_id uuid');
    await queryRunner.query(`ALTER TABLE projects
      ADD CONSTRAINT fk_project_source_opportunity FOREIGN KEY (tenant_id, source_opportunity_id)
      REFERENCES opportunities (tenant_id, id) ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_project_source_opportunity
      ON projects (tenant_id, source_opportunity_id) WHERE source_opportunity_id IS NOT NULL`);

    // DB-071 vocabulary widened (drop/recreate by name) so scenario instances become storable the
    // day the engine accepts pre-project targets. Nothing else about the engine changes.
    await queryRunner.query(`ALTER TABLE workflow_instances
      DROP CONSTRAINT ck_workflow_instance_object_type`);
    await queryRunner.query(`ALTER TABLE workflow_instances
      ADD CONSTRAINT ck_workflow_instance_object_type
      CHECK (object_type IN ('ChangeRequest','InvestmentScenario'))`);

    // FR-002: an APPROVED survey revision is field evidence; corrections are new revisions.
    await queryRunner.query(`CREATE FUNCTION protect_survey_package_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.data_quality = 'APPROVED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'approved survey packages are immutable; create a new revision instead';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_survey_package_history
      BEFORE UPDATE OR DELETE ON survey_packages
      FOR EACH ROW EXECUTE FUNCTION protect_survey_package_history()`);

    // FR-004/FR-008: an APPROVED scenario is the basis of an investment decision; it never changes.
    await queryRunner.query(`CREATE FUNCTION protect_investment_scenario_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status = 'APPROVED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'approved investment scenarios are immutable; create a new version instead';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_investment_scenario_history
      BEFORE UPDATE OR DELETE ON investment_scenarios
      FOR EACH ROW EXECUTE FUNCTION protect_investment_scenario_history()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_investment_scenario_history ON investment_scenarios'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_investment_scenario_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_survey_package_history ON survey_packages');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_survey_package_history()');

    // Restore the DB-071 vocabulary exactly as CreateWorkflowEngine1783738000000 wrote it.
    await queryRunner.query(`ALTER TABLE workflow_instances
      DROP CONSTRAINT ck_workflow_instance_object_type`);
    await queryRunner.query(`ALTER TABLE workflow_instances
      ADD CONSTRAINT ck_workflow_instance_object_type
      CHECK (object_type IN ('ChangeRequest'))`);

    // Undo the DB-010 amendment before the referenced table goes away.
    await queryRunner.query('DROP INDEX IF EXISTS uq_project_source_opportunity');
    await queryRunner.query(
      'ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_project_source_opportunity'
    );
    await queryRunner.query('ALTER TABLE projects DROP COLUMN IF EXISTS source_opportunity_id');

    await queryRunner.query('DROP TABLE IF EXISTS investment_scenarios');
    await queryRunner.query('DROP TABLE IF EXISTS survey_packages');
    await queryRunner.query('DROP TABLE IF EXISTS opportunities');
  }
}
