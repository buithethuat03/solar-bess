import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthBase1720699200000 implements MigrationInterface {
  name = 'CreateAuthBase1720699200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`CREATE TABLE tenants (
      id uuid PRIMARY KEY, code varchar(64) NOT NULL UNIQUE, name varchar(200) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query(`CREATE TABLE user_accounts (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      email varchar(254) NOT NULL, normalized_email varchar(254) NOT NULL, display_name varchar(200) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'ACTIVE', last_login_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_user_tenant_email UNIQUE (tenant_id, normalized_email))`);
    await queryRunner.query(`CREATE TABLE local_credentials (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
      password_hash text NOT NULL, algorithm varchar(20) NOT NULL DEFAULT 'argon2id',
      credential_version integer NOT NULL DEFAULT 1, changed_at timestamptz NOT NULL,
      CONSTRAINT uq_credential_tenant_user UNIQUE (tenant_id, user_account_id))`);
    await queryRunner.query(`CREATE TABLE authentication_sessions (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE, family_id uuid NOT NULL,
      refresh_jti_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
      revoked_at timestamptz NULL, revoke_reason varchar(40) NULL, last_used_at timestamptz NULL,
      created_ip_hash varchar(64) NOT NULL, user_agent varchar(500) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query('CREATE INDEX idx_session_tenant_user ON authentication_sessions (tenant_id, user_account_id)');
    await queryRunner.query('CREATE INDEX idx_session_family ON authentication_sessions (tenant_id, family_id)');
    await queryRunner.query(`CREATE TABLE audit_events (
      id uuid PRIMARY KEY, tenant_id uuid NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      actor_id uuid NULL REFERENCES user_accounts(id) ON DELETE SET NULL, action varchar(80) NOT NULL,
      result varchar(20) NOT NULL, reason_code varchar(80) NULL, correlation_id varchar(100) NOT NULL,
      ip_hash varchar(64) NULL, occurred_at timestamptz NOT NULL DEFAULT now())`);
    await queryRunner.query('CREATE INDEX idx_audit_tenant_time ON audit_events (tenant_id, occurred_at)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS audit_events');
    await queryRunner.query('DROP TABLE IF EXISTS authentication_sessions');
    await queryRunner.query('DROP TABLE IF EXISTS local_credentials');
    await queryRunner.query('DROP TABLE IF EXISTS user_accounts');
    await queryRunner.query('DROP TABLE IF EXISTS tenants');
  }
}
