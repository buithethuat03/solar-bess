import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectMaster1783728000000 implements MigrationInterface {
  name = 'CreateProjectMaster1783728000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE companies (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL, name varchar(200) NOT NULL, organization_type varchar(30) NOT NULL,
      status varchar(20) NOT NULL, idempotency_key varchar(200) NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_company_tenant_code UNIQUE (tenant_id, code),
      CONSTRAINT ck_company_type CHECK (organization_type IN ('INTERNAL','CUSTOMER','PARTNER','CONTRACTOR','VENDOR','LENDER')),
      CONSTRAINT ck_company_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')))`);
    await queryRunner.query('CREATE UNIQUE INDEX uq_company_tenant_idempotency ON companies (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

    await queryRunner.query(`CREATE TABLE legal_entities (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
      legal_name varchar(250) NOT NULL, country varchar(2) NOT NULL,
      registration_no varchar(100) NOT NULL, tax_id varchar(100) NULL, status varchar(20) NOT NULL,
      idempotency_key varchar(200) NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_legal_entity_registration UNIQUE (tenant_id, country, registration_no),
      CONSTRAINT ck_legal_entity_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')))`);
    await queryRunner.query('CREATE INDEX idx_legal_entity_company ON legal_entities (tenant_id, company_id, status)');
    await queryRunner.query('CREATE UNIQUE INDEX uq_legal_entity_tenant_idempotency ON legal_entities (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

    await queryRunner.query(`CREATE TABLE roles (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL, name varchar(120) NOT NULL, permissions jsonb NOT NULL,
      policy_version integer NOT NULL, status varchar(20) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_role_tenant_code UNIQUE (tenant_id, code),
      CONSTRAINT ck_role_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
      CONSTRAINT ck_role_permissions_array CHECK (jsonb_typeof(permissions) = 'array'))`);

    await queryRunner.query(`CREATE TABLE role_assignments (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      scope_type varchar(30) NOT NULL, scope_id uuid NULL,
      effective_from timestamptz NOT NULL, effective_to timestamptz NULL, status varchar(20) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_role_assignment_scope CHECK (
        (scope_type = 'TENANT' AND scope_id IS NULL) OR
        (scope_type IN ('PORTFOLIO','PROJECT') AND scope_id IS NOT NULL)),
      CONSTRAINT ck_role_assignment_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
      CONSTRAINT ck_role_assignment_period CHECK (effective_to IS NULL OR effective_to > effective_from))`);
    await queryRunner.query('CREATE INDEX idx_role_assignment_effective ON role_assignments (tenant_id, user_account_id, status, effective_from, effective_to)');
    await queryRunner.query(`CREATE UNIQUE INDEX uq_role_assignment_active_tuple ON role_assignments
      (tenant_id, user_account_id, role_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
      WHERE status = 'ACTIVE'`);

    await queryRunner.query(`CREATE TABLE portfolios (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL, name varchar(200) NOT NULL, status varchar(20) NOT NULL,
      idempotency_key varchar(200) NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_portfolio_tenant_code UNIQUE (tenant_id, code),
      CONSTRAINT ck_portfolio_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')))`);
    await queryRunner.query('CREATE UNIQUE INDEX uq_portfolio_tenant_idempotency ON portfolios (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

    await queryRunner.query(`CREATE TABLE projects (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE RESTRICT,
      owner_legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
      customer_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
      project_manager_id uuid NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL, name varchar(250) NOT NULL, type varchar(20) NOT NULL,
      phase varchar(30) NOT NULL, record_status varchar(20) NOT NULL,
      contract_model varchar(80) NOT NULL, currency varchar(3) NOT NULL,
      planned_cod date NOT NULL, forecast_cod date NULL, version_no integer NOT NULL DEFAULT 1,
      idempotency_key varchar(200) NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_project_tenant_code UNIQUE (tenant_id, code),
      CONSTRAINT ck_project_type CHECK (type IN ('SOLAR','BESS','HYBRID')),
      CONSTRAINT ck_project_phase CHECK (phase IN ('INITIATION','PLANNING','EXECUTION','COMMISSIONING','COD','HANDOVER','O_AND_M')),
      CONSTRAINT ck_project_status CHECK (record_status IN ('DRAFT','ACTIVE','ON_HOLD','CLOSED','CANCELLED','ARCHIVED')),
      CONSTRAINT ck_project_currency CHECK (currency ~ '^[A-Z]{3}$'))`);
    await queryRunner.query('CREATE INDEX idx_project_filters ON projects (tenant_id, portfolio_id, phase, record_status)');
    await queryRunner.query('CREATE INDEX idx_project_parties_filter ON projects (tenant_id, owner_legal_entity_id, customer_company_id, project_manager_id)');
    await queryRunner.query('CREATE UNIQUE INDEX uq_project_tenant_idempotency ON projects (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

    await queryRunner.query(`CREATE TABLE sites (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL, name varchar(200) NOT NULL, location varchar(500) NULL,
      timezone varchar(100) NOT NULL, is_primary boolean NOT NULL DEFAULT false,
      status varchar(20) NOT NULL, idempotency_key varchar(200) NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_site_project_code UNIQUE (tenant_id, project_id, code),
      CONSTRAINT ck_site_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')))`);
    await queryRunner.query('CREATE UNIQUE INDEX uq_site_project_primary ON sites (tenant_id, project_id) WHERE is_primary = true');
    await queryRunner.query('CREATE UNIQUE INDEX uq_site_tenant_idempotency ON sites (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL');

    await queryRunner.query(`CREATE TABLE project_parties (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
      legal_entity_id uuid NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
      role_code varchar(30) NOT NULL, raci varchar(20) NOT NULL,
      effective_from date NOT NULL, effective_to date NULL,
      contact_name varchar(200) NULL, contact_email varchar(254) NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_project_party_role CHECK (role_code IN ('OWNER','EPC','VENDOR','LENDER')),
      CONSTRAINT ck_project_party_raci CHECK (raci IN ('ACCOUNTABLE','RESPONSIBLE','CONSULTED','INFORMED')),
      CONSTRAINT ck_project_party_period CHECK (effective_to IS NULL OR effective_to >= effective_from))`);
    await queryRunner.query('CREATE INDEX idx_project_party_effective ON project_parties (tenant_id, project_id, role_code, effective_from, effective_to)');

    await queryRunner.query('ALTER TABLE audit_events ADD COLUMN object_type varchar(80) NULL');
    await queryRunner.query('ALTER TABLE audit_events ADD COLUMN object_id uuid NULL');
    await queryRunner.query('ALTER TABLE audit_events ADD COLUMN payload jsonb NULL');
    await queryRunner.query('CREATE INDEX idx_audit_object ON audit_events (tenant_id, object_type, object_id, occurred_at)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_audit_object');
    await queryRunner.query('ALTER TABLE audit_events DROP COLUMN IF EXISTS payload');
    await queryRunner.query('ALTER TABLE audit_events DROP COLUMN IF EXISTS object_id');
    await queryRunner.query('ALTER TABLE audit_events DROP COLUMN IF EXISTS object_type');
    await queryRunner.query('DROP TABLE IF EXISTS project_parties');
    await queryRunner.query('DROP TABLE IF EXISTS sites');
    await queryRunner.query('DROP TABLE IF EXISTS projects');
    await queryRunner.query('DROP TABLE IF EXISTS portfolios');
    await queryRunner.query('DROP TABLE IF EXISTS role_assignments');
    await queryRunner.query('DROP TABLE IF EXISTS roles');
    await queryRunner.query('DROP TABLE IF EXISTS legal_entities');
    await queryRunner.query('DROP TABLE IF EXISTS companies');
  }
}
