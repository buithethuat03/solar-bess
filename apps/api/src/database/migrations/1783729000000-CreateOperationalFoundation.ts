import type { MigrationInterface, QueryRunner } from 'typeorm';

interface NamedConstraint {
  table: string;
  name: string;
}

const tenantCandidateKeys: NamedConstraint[] = [
  { table: 'user_accounts', name: 'uq_user_accounts_tenant_id' },
  { table: 'local_credentials', name: 'uq_local_credentials_tenant_id' },
  { table: 'authentication_sessions', name: 'uq_authentication_sessions_tenant_id' },
  { table: 'audit_events', name: 'uq_audit_events_tenant_id' },
  { table: 'companies', name: 'uq_companies_tenant_id' },
  { table: 'legal_entities', name: 'uq_legal_entities_tenant_id' },
  { table: 'roles', name: 'uq_roles_tenant_id' },
  { table: 'role_assignments', name: 'uq_role_assignments_tenant_id' },
  { table: 'portfolios', name: 'uq_portfolios_tenant_id' },
  { table: 'projects', name: 'uq_projects_tenant_id' },
  { table: 'sites', name: 'uq_sites_tenant_id' },
  { table: 'project_parties', name: 'uq_project_parties_tenant_id' }
];

const compositeForeignKeys: Array<NamedConstraint & { definition: string }> = [
  {
    table: 'local_credentials', name: 'fk_local_credentials_tenant_user',
    definition: `FOREIGN KEY (tenant_id, user_account_id)
      REFERENCES user_accounts (tenant_id, id) ON DELETE CASCADE`
  },
  {
    table: 'authentication_sessions', name: 'fk_authentication_sessions_tenant_user',
    definition: `FOREIGN KEY (tenant_id, user_account_id)
      REFERENCES user_accounts (tenant_id, id) ON DELETE CASCADE`
  },
  {
    table: 'audit_events', name: 'fk_audit_events_tenant_actor',
    definition: `FOREIGN KEY (tenant_id, actor_id)
      REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'legal_entities', name: 'fk_legal_entities_tenant_company',
    definition: `FOREIGN KEY (tenant_id, company_id)
      REFERENCES companies (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'role_assignments', name: 'fk_role_assignments_tenant_user',
    definition: `FOREIGN KEY (tenant_id, user_account_id)
      REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'role_assignments', name: 'fk_role_assignments_tenant_role',
    definition: `FOREIGN KEY (tenant_id, role_id)
      REFERENCES roles (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'projects', name: 'fk_projects_tenant_portfolio',
    definition: `FOREIGN KEY (tenant_id, portfolio_id)
      REFERENCES portfolios (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'projects', name: 'fk_projects_tenant_owner_legal_entity',
    definition: `FOREIGN KEY (tenant_id, owner_legal_entity_id)
      REFERENCES legal_entities (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'projects', name: 'fk_projects_tenant_customer_company',
    definition: `FOREIGN KEY (tenant_id, customer_company_id)
      REFERENCES companies (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'projects', name: 'fk_projects_tenant_project_manager',
    definition: `FOREIGN KEY (tenant_id, project_manager_id)
      REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'sites', name: 'fk_sites_tenant_project',
    definition: `FOREIGN KEY (tenant_id, project_id)
      REFERENCES projects (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'project_parties', name: 'fk_project_parties_tenant_project',
    definition: `FOREIGN KEY (tenant_id, project_id)
      REFERENCES projects (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'project_parties', name: 'fk_project_parties_tenant_company',
    definition: `FOREIGN KEY (tenant_id, company_id)
      REFERENCES companies (tenant_id, id) ON DELETE RESTRICT`
  },
  {
    table: 'project_parties', name: 'fk_project_parties_tenant_legal_entity',
    definition: `FOREIGN KEY (tenant_id, company_id, legal_entity_id)
      REFERENCES legal_entities (tenant_id, company_id, id) ON DELETE RESTRICT`
  }
];

export class CreateOperationalFoundation1783729000000 implements MigrationInterface {
  name = 'CreateOperationalFoundation1783729000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey`);
    for (const constraint of tenantCandidateKeys) {
      await queryRunner.query(`ALTER TABLE ${constraint.table}
        ADD CONSTRAINT ${constraint.name} UNIQUE (tenant_id, id)`);
    }
    await queryRunner.query(`ALTER TABLE legal_entities
      ADD CONSTRAINT uq_legal_entities_tenant_company_id
      UNIQUE (tenant_id, company_id, id)`);

    await queryRunner.query(`ALTER TABLE audit_events
      ADD CONSTRAINT ck_audit_actor_tenant
      CHECK (actor_id IS NULL OR tenant_id IS NOT NULL) NOT VALID`);

    for (const constraint of compositeForeignKeys) {
      await queryRunner.query(`ALTER TABLE ${constraint.table}
        ADD CONSTRAINT ${constraint.name} ${constraint.definition} NOT VALID`);
    }

    await queryRunner.query('ALTER TABLE audit_events VALIDATE CONSTRAINT ck_audit_actor_tenant');
    for (const constraint of compositeForeignKeys) {
      await queryRunner.query(`ALTER TABLE ${constraint.table} VALIDATE CONSTRAINT ${constraint.name}`);
    }

    await queryRunner.query(`DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM role_assignments assignment
        LEFT JOIN portfolios portfolio
          ON assignment.scope_type = 'PORTFOLIO'
         AND portfolio.id = assignment.scope_id
         AND portfolio.tenant_id = assignment.tenant_id
        LEFT JOIN projects project
          ON assignment.scope_type = 'PROJECT'
         AND project.id = assignment.scope_id
         AND project.tenant_id = assignment.tenant_id
        WHERE (assignment.scope_type = 'PORTFOLIO' AND portfolio.id IS NULL)
           OR (assignment.scope_type = 'PROJECT' AND project.id IS NULL)
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23503',
          CONSTRAINT = 'fk_role_assignment_scope_tenant',
          MESSAGE = 'Existing role assignment scope does not belong to its tenant';
      END IF;
    END $$`);

    await queryRunner.query(`CREATE FUNCTION enforce_role_assignment_scope_tenant()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.scope_type = 'TENANT' THEN
        IF NEW.scope_id IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'ck_role_assignment_scope',
            MESSAGE = 'TENANT role assignment cannot have scope_id';
        END IF;
      ELSIF NEW.scope_type = 'PORTFOLIO' THEN
        IF NOT EXISTS (
          SELECT 1 FROM portfolios
          WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Portfolio scope does not belong to role assignment tenant';
        END IF;
      ELSIF NEW.scope_type = 'PROJECT' THEN
        IF NOT EXISTS (
          SELECT 1 FROM projects
          WHERE id = NEW.scope_id AND tenant_id = NEW.tenant_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23503',
            CONSTRAINT = 'fk_role_assignment_scope_tenant',
            MESSAGE = 'Project scope does not belong to role assignment tenant';
        END IF;
      ELSE
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'ck_role_assignment_scope',
          MESSAGE = 'Unsupported role assignment scope type';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_role_assignment_scope_tenant
      BEFORE INSERT OR UPDATE OF tenant_id, scope_type, scope_id ON role_assignments
      FOR EACH ROW EXECUTE FUNCTION enforce_role_assignment_scope_tenant()`);

    await queryRunner.query(`CREATE FUNCTION prevent_audit_event_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'audit_events are immutable';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_audit_events_immutable
      BEFORE UPDATE OR DELETE ON audit_events
      FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation()`);

    await queryRunner.query(`CREATE TABLE transactional_outbox_events (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      actor_id uuid NULL,
      event_key varchar(200) NOT NULL,
      aggregate_type varchar(80) NOT NULL,
      aggregate_id uuid NOT NULL,
      aggregate_version integer NULL,
      event_type varchar(120) NOT NULL,
      schema_version integer NOT NULL,
      payload jsonb NOT NULL,
      status varchar(20) NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      available_at timestamptz NOT NULL DEFAULT now(),
      locked_at timestamptz NULL,
      locked_by varchar(100) NULL,
      published_at timestamptz NULL,
      attempt_count integer NOT NULL DEFAULT 0,
      last_error varchar(2000) NULL,
      correlation_id varchar(100) NOT NULL,
      CONSTRAINT uq_outbox_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_outbox_tenant_event_key UNIQUE (tenant_id, event_key),
      CONSTRAINT uq_outbox_aggregate_event UNIQUE NULLS NOT DISTINCT
        (tenant_id, aggregate_type, aggregate_id, aggregate_version, event_type),
      CONSTRAINT fk_outbox_tenant_actor FOREIGN KEY (tenant_id, actor_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_outbox_status CHECK (status IN ('PENDING','PROCESSING','ENQUEUED','FAILED')),
      CONSTRAINT ck_outbox_schema_version CHECK (schema_version >= 1),
      CONSTRAINT ck_outbox_aggregate_version CHECK
        (aggregate_version IS NULL OR aggregate_version >= 0),
      CONSTRAINT ck_outbox_attempt_count CHECK (attempt_count >= 0),
      CONSTRAINT ck_outbox_lock_pair CHECK ((locked_at IS NULL) = (locked_by IS NULL)),
      CONSTRAINT ck_outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'))`);
    await queryRunner.query(`CREATE INDEX idx_outbox_publishable
      ON transactional_outbox_events (tenant_id, status, available_at)`);
    await queryRunner.query(`CREATE INDEX idx_outbox_lock
      ON transactional_outbox_events (tenant_id, status, locked_at)`);
    await queryRunner.query(`CREATE INDEX idx_outbox_relay
      ON transactional_outbox_events (status, available_at, occurred_at)`);

    await queryRunner.query(`CREATE TABLE event_consumptions (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      event_id uuid NOT NULL,
      consumer_name varchar(120) NOT NULL,
      handler_version varchar(64) NOT NULL,
      status varchar(20) NOT NULL,
      lease_until timestamptz NULL,
      attempt_count integer NOT NULL DEFAULT 0,
      last_error_hash varchar(64) NULL,
      processed_at timestamptz NULL,
      correlation_id varchar(100) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_event_consumption_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_event_consumption_dedupe UNIQUE (tenant_id, consumer_name, event_id),
      CONSTRAINT fk_event_consumption_tenant_event FOREIGN KEY (tenant_id, event_id)
        REFERENCES transactional_outbox_events (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_event_consumption_status CHECK
        (status IN ('PROCESSING','PROCESSED','FAILED')),
      CONSTRAINT ck_event_consumption_attempt_count CHECK (attempt_count >= 0))`);
    await queryRunner.query(`CREATE INDEX idx_event_consumption_claim
      ON event_consumptions (tenant_id, consumer_name, status, lease_until)`);

    await queryRunner.query(`CREATE TABLE command_receipts (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      actor_type varchar(40) NOT NULL,
      actor_id uuid NOT NULL,
      operation varchar(120) NOT NULL,
      idempotency_key varchar(200) NOT NULL,
      request_hash varchar(64) NOT NULL,
      state varchar(20) NOT NULL,
      response_status integer NULL,
      response_body jsonb NULL,
      resource_type varchar(80) NULL,
      resource_id uuid NULL,
      correlation_id varchar(100) NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_command_receipt_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_command_receipt_scope UNIQUE
        (tenant_id, actor_type, actor_id, operation, idempotency_key),
      CONSTRAINT ck_command_receipt_state CHECK (state IN ('IN_PROGRESS','COMPLETED')),
      CONSTRAINT ck_command_receipt_request_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_command_receipt_response_status CHECK
        (response_status IS NULL OR (response_status >= 100 AND response_status <= 599)),
      CONSTRAINT ck_command_receipt_expiry CHECK (expires_at > created_at))`);
    await queryRunner.query(`CREATE INDEX idx_command_receipt_expiry
      ON command_receipts (tenant_id, state, expires_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS event_consumptions');
    await queryRunner.query('DROP TABLE IF EXISTS command_receipts');
    await queryRunner.query('DROP TABLE IF EXISTS transactional_outbox_events');

    await queryRunner.query('DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events');
    await queryRunner.query('DROP FUNCTION IF EXISTS prevent_audit_event_mutation()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_role_assignment_scope_tenant ON role_assignments');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_role_assignment_scope_tenant()');

    for (const constraint of [...compositeForeignKeys].reverse()) {
      await queryRunner.query(`ALTER TABLE ${constraint.table}
        DROP CONSTRAINT IF EXISTS ${constraint.name}`);
    }
    await queryRunner.query(`ALTER TABLE audit_events
      DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey`);
    await queryRunner.query(`ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES user_accounts(id) ON DELETE SET NULL`);
    await queryRunner.query('ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS ck_audit_actor_tenant');
    await queryRunner.query(`ALTER TABLE legal_entities
      DROP CONSTRAINT IF EXISTS uq_legal_entities_tenant_company_id`);

    for (const constraint of [...tenantCandidateKeys].reverse()) {
      await queryRunner.query(`ALTER TABLE ${constraint.table}
        DROP CONSTRAINT IF EXISTS ${constraint.name}`);
    }
  }
}
