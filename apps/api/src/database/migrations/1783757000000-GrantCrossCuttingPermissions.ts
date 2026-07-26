import type { MigrationInterface, QueryRunner } from 'typeorm';

const stateTable = 'role_grant_reconcile_1783757000000';
/**
 * Policy version 11 of the role catalog. Versions 8/9/10/12 belong to sibling slices; every write
 * here uses GREATEST so the outcome is the chain maximum regardless of merge order.
 */
const policyVersion = 11;

/**
 * Cross-cutting permission codes (API-002/003/009…013, API-113, API-130…134).
 *
 * - `permission.read.self` goes to EVERY role: reading one's own effective permissions is the
 *   feature that lets a UI honestly hide what the caller cannot do.
 * - Tenant administration codes (`tenant.read`, `roleAssignment.grant/revoke`, `audit.read`) stay
 *   with TENANT_ADMIN only, which still holds no business-data permission.
 * - Delegation is created by the approval-carrying roles (PMO, PROJECT_MANAGER); TENANT_ADMIN can
 *   additionally revoke as the administrative kill switch.
 * - Search/saved-view go to every business-reading role; a searcher without a module's read
 *   permission simply gets no rows from that module (never a 403).
 * - Reports stay with the register-owning roles; PACKAGE_OWNER gets none because both V1 report
 *   types are project registers.
 *
 * Deliberately NOT granted: `roleAssignment.manage` — a legacy seeded code with no endpoint behind
 * it. It is left untouched on TENANT_ADMIN (removing seeded codes is not this migration's job) and
 * nothing new references it; API-009/API-010 use `roleAssignment.grant`/`roleAssignment.revoke`.
 */
const grants: ReadonlyArray<{ codes: readonly string[]; permissions: readonly string[] }> = [
  {
    codes: ['PMO', 'PROJECT_MANAGER'],
    permissions: [
      'permission.read.self', 'delegation.create', 'delegation.revoke', 'workflow.escalate',
      'search.execute', 'savedView.read', 'savedView.create', 'report.create', 'report.read'
    ]
  },
  {
    codes: ['EXECUTIVE', 'PROJECT_CONTROLS'],
    permissions: [
      'permission.read.self', 'search.execute', 'savedView.read', 'savedView.create',
      'report.create', 'report.read'
    ]
  },
  {
    codes: ['PACKAGE_OWNER'],
    permissions: ['permission.read.self', 'search.execute', 'savedView.read', 'savedView.create']
  },
  {
    codes: ['TENANT_ADMIN'],
    permissions: [
      'permission.read.self', 'tenant.read', 'roleAssignment.grant', 'roleAssignment.revoke',
      'audit.read', 'delegation.revoke'
    ]
  }
];

/**
 * Reading one's own effective permissions is safe for any catalog role, but this is scoped to the
 * ten roles the platform ships rather than applied with a `TRUE` predicate. A tenant-defined custom
 * role is that tenant's to govern; every other grant migration touches only roles it names, and a
 * migration that silently rewrites a customer's own role would break that contract — and did break
 * the assertion protecting it.
 */
const catchAllPermissions: readonly string[] = ['permission.read.self'];
const catalogRoleCodes: readonly string[] = [
  'PMO', 'PROJECT_MANAGER', 'EXECUTIVE', 'PROJECT_CONTROLS', 'PACKAGE_OWNER', 'TENANT_ADMIN',
  'HSE_MANAGER', 'QAQC_MANAGER', 'PERMIT_ISSUER', 'CONTRACTOR'
];

export class GrantCrossCuttingPermissions1783757000000 implements MigrationInterface {
  name = 'GrantCrossCuttingPermissions1783757000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${stateTable} (
      role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      role_code varchar(64) NOT NULL,
      added_permissions jsonb NOT NULL,
      previous_policy_version integer NOT NULL,
      policy_version_changed boolean NOT NULL,
      CONSTRAINT ck_role_grant_cross_cutting_permissions CHECK
        (jsonb_typeof(added_permissions) = 'array')
    )`);
    for (const group of grants) {
      for (const code of group.codes) {
        await this.apply(queryRunner, group.permissions, 'role.code = $1', [code]);
      }
    }
    // Catch-all AFTER the named groups: ON CONFLICT keeps each named role's original state row, and
    // re-adding an already-added permission is filtered out by the `NOT role.permissions ?` guard.
    await this.apply(
      queryRunner, catchAllPermissions, 'role.code = ANY($1::text[])', [catalogRoleCodes]
    );
  }

  private async apply(
    queryRunner: QueryRunner, permissions: readonly string[],
    rolePredicate: string, predicateParameters: unknown[]
  ): Promise<void> {
    const required = JSON.stringify(permissions);
    const requiredIndex = `$${predicateParameters.length + 1}`;
    await queryRunner.query(`INSERT INTO ${stateTable} (
      role_id, tenant_id, role_code, added_permissions,
      previous_policy_version, policy_version_changed
    )
    SELECT role.id, role.tenant_id, role.code,
      COALESCE((
        SELECT jsonb_agg(required_permission.value ORDER BY required_permission.ordinality)
        FROM jsonb_array_elements_text(${requiredIndex}::jsonb)
          WITH ORDINALITY AS required_permission(value, ordinality)
        WHERE NOT role.permissions ? required_permission.value
      ), '[]'::jsonb),
      role.policy_version, role.policy_version < ${policyVersion}
    FROM roles role
    WHERE ${rolePredicate}
    ON CONFLICT (role_id) DO NOTHING`, [...predicateParameters, required]);
    await queryRunner.query(`UPDATE roles role SET
      permissions = role.permissions || COALESCE((
        SELECT jsonb_agg(required_permission.value ORDER BY required_permission.ordinality)
        FROM jsonb_array_elements_text(${requiredIndex}::jsonb)
          WITH ORDINALITY AS required_permission(value, ordinality)
        WHERE NOT role.permissions ? required_permission.value
      ), '[]'::jsonb),
      policy_version = GREATEST(role.policy_version, ${policyVersion}),
      updated_at = now()
    WHERE ${rolePredicate}`, [...predicateParameters, required]);
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
