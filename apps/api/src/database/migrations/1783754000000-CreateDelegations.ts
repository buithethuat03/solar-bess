import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-008 — delegations (FR-150, SEC-108/SEC-110, API-011/API-012).
 *
 * The DDL mirrors `delegation.entity.ts` one-for-one. Both principal columns are composite
 * `(tenant_id, …)` foreign keys into `user_accounts`, so a cross-tenant delegation is structurally
 * impossible. `ck_delegation_no_self` removes the trivial self-loop; the one-level "no chain" rule
 * spans rows and is enforced at API-011 (a delegator who is currently someone's delegate is
 * refused with DELEGATION_CHAIN_FORBIDDEN).
 *
 * Deliberate absence: no `value_limit` column. docs/07 lists it for DB-008, but nothing in V1 can
 * enforce a monetary cap on an approval, and a stored-but-unenforced cap is a fake control —
 * API-011 refuses the field with 422 VALUE_LIMIT_NOT_SUPPORTED instead.
 */
export class CreateDelegations1783754000000 implements MigrationInterface {
  name = 'CreateDelegations1783754000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE delegations (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      delegator_id uuid NOT NULL,
      delegate_id uuid NOT NULL,
      scope jsonb NOT NULL DEFAULT '{}',
      effective_from timestamptz NOT NULL,
      effective_to timestamptz NOT NULL,
      reason varchar(2000) NOT NULL,
      status varchar(20) NOT NULL,
      revoked_by uuid,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_delegations PRIMARY KEY (id),
      CONSTRAINT uq_delegations_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_delegation_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_delegation_delegator FOREIGN KEY (tenant_id, delegator_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_delegation_delegate FOREIGN KEY (tenant_id, delegate_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_delegation_revoked_by FOREIGN KEY (tenant_id, revoked_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_delegation_scope_object CHECK (jsonb_typeof(scope) = 'object'),
      CONSTRAINT ck_delegation_window CHECK (effective_from < effective_to),
      CONSTRAINT ck_delegation_reason CHECK (length(trim(reason)) > 0),
      CONSTRAINT ck_delegation_status CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
      CONSTRAINT ck_delegation_no_self CHECK (delegator_id <> delegate_id),
      CONSTRAINT ck_delegation_revocation_pair CHECK (
        (status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)
        OR (status <> 'REVOKED' AND revoked_by IS NULL AND revoked_at IS NULL))
    )`);
    await queryRunner.query(`CREATE INDEX idx_delegation_delegate
      ON delegations (tenant_id, delegate_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_delegation_delegator
      ON delegations (tenant_id, delegator_id, status)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE delegations');
  }
}
