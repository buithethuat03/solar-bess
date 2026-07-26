import type { MigrationInterface, QueryRunner } from 'typeorm';

const stateTable = 'role_grant_reconcile_1783741000000';
const policyVersion = 6;

/**
 * US-005/US-019 permission codes (API-039…API-052).
 *
 * `documentRevision.approve` and `documentRevision.issue` go to PMO and PROJECT_MANAGER only: issuing
 * a revision makes it the current-for-use document, so BR-035 keeps that authority away from the
 * roles that upload and review. PACKAGE_OWNER and EXECUTIVE stay read-only, and TENANT_ADMIN gets
 * read access for administration without any content authority.
 *
 * Every code below has an endpoint behind it; nothing is granted "for later".
 */
const grants: ReadonlyArray<{ codes: readonly string[]; permissions: readonly string[] }> = [
  {
    codes: ['PMO', 'PROJECT_MANAGER'],
    permissions: [
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentRevision.approve', 'documentRevision.issue',
      'documentComment.create', 'transmittal.issue', 'transmittal.respond',
      'documentShare.create', 'documentSignature.start'
    ]
  },
  {
    codes: ['PROJECT_CONTROLS'],
    permissions: [
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentComment.create', 'transmittal.respond'
    ]
  },
  {
    codes: ['PACKAGE_OWNER'],
    permissions: ['document.read', 'documentRevision.read', 'documentComment.create']
  },
  {
    codes: ['EXECUTIVE'],
    permissions: ['document.read', 'documentRevision.read']
  },
  {
    codes: ['TENANT_ADMIN'],
    permissions: ['document.read', 'documentRevision.read']
  }
];

export class GrantDocumentPermissions1783741000000 implements MigrationInterface {
  name = 'GrantDocumentPermissions1783741000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${stateTable} (
      role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      role_code varchar(64) NOT NULL,
      added_permissions jsonb NOT NULL,
      previous_policy_version integer NOT NULL,
      policy_version_changed boolean NOT NULL,
      CONSTRAINT ck_role_grant_document_permissions CHECK
        (jsonb_typeof(added_permissions) = 'array')
    )`);
    for (const group of grants) {
      for (const code of group.codes) {
        const required = JSON.stringify(group.permissions);
        await queryRunner.query(`INSERT INTO ${stateTable} (
          role_id, tenant_id, role_code, added_permissions,
          previous_policy_version, policy_version_changed
        )
        SELECT role.id, role.tenant_id, role.code,
          COALESCE((
            SELECT jsonb_agg(required_permission.value ORDER BY required_permission.ordinality)
            FROM jsonb_array_elements_text($2::jsonb)
              WITH ORDINALITY AS required_permission(value, ordinality)
            WHERE NOT role.permissions ? required_permission.value
          ), '[]'::jsonb),
          role.policy_version, role.policy_version < ${policyVersion}
        FROM roles role
        WHERE role.code = $1
        ON CONFLICT (role_id) DO NOTHING`, [code, required]);
        await queryRunner.query(`UPDATE roles role SET
          permissions = role.permissions || COALESCE((
            SELECT jsonb_agg(required_permission.value ORDER BY required_permission.ordinality)
            FROM jsonb_array_elements_text($2::jsonb)
              WITH ORDINALITY AS required_permission(value, ordinality)
            WHERE NOT role.permissions ? required_permission.value
          ), '[]'::jsonb),
          policy_version = GREATEST(role.policy_version, ${policyVersion}),
          updated_at = now()
        WHERE role.code = $1`, [code, required]);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!await queryRunner.hasTable(stateTable)) return;
    await queryRunner.query(`UPDATE roles role SET
      permissions = COALESCE((
        SELECT jsonb_agg(current_permission.value ORDER BY current_permission.ordinality)
        FROM jsonb_array_elements_text(role.permissions)
          WITH ORDINALITY AS current_permission(value, ordinality)
        WHERE NOT state.added_permissions ? current_permission.value
      ), '[]'::jsonb),
      policy_version = CASE
        WHEN state.policy_version_changed AND role.policy_version = ${policyVersion}
          THEN state.previous_policy_version
        ELSE role.policy_version
      END,
      updated_at = now()
    FROM ${stateTable} state
    WHERE role.id = state.role_id AND role.tenant_id = state.tenant_id`);
    await queryRunner.query(`DROP TABLE ${stateTable}`);
  }
}
