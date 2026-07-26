import type { MigrationInterface, QueryRunner } from 'typeorm';

const stateTable = 'role_grant_reconcile_1783759000000';
/**
 * Policy version 13 of the role catalog. A sibling O&M slice takes 14; every write here uses
 * GREATEST so the outcome is the chain maximum regardless of merge order.
 */
const policyVersion = 13;

/**
 * Commissioning & COD permission codes (API-098…API-105).
 *
 * - `commissioning.read` / `cod.read` go to the roles that already read the project registers:
 *   PMO, PROJECT_MANAGER, EXECUTIVE, PROJECT_CONTROLS and QAQC_MANAGER. COD readiness aggregates
 *   punch/NCR/stop-work findings the same roles can already see, so no reader gains reach here.
 * - `commissioningSystem.create` stays with the roles that own the project baseline (PMO,
 *   PROJECT_MANAGER): the systemization tree is a scope statement, not field data.
 * - The test-execution codes (`testPack.create`, `testRun.start`, `testRun.complete`,
 *   `testRun.retest`) go to QAQC_MANAGER — the role that already holds `inspection.manage` and
 *   `ncr.manage` — plus PMO and PROJECT_MANAGER.
 * - `cod.manage` stays with PMO and PROJECT_MANAGER. It is deliberately NOT granted to
 *   QAQC_MANAGER: `SIGN_COD` refuses the submitter, so the SoD rule needs two holders of the code,
 *   and widening it to the role that recorded the test results would undo that separation.
 *
 * No role is created and no role is invented: every code below lands on a role that already exists
 * in the catalog. EXECUTIVE and PROJECT_CONTROLS gain read codes only.
 */
const grants: ReadonlyArray<{ codes: readonly string[]; permissions: readonly string[] }> = [
  {
    codes: ['PMO', 'PROJECT_MANAGER'],
    permissions: [
      'commissioning.read', 'commissioningSystem.create', 'testPack.create', 'testRun.start',
      'testRun.complete', 'testRun.retest', 'cod.read', 'cod.manage'
    ]
  },
  {
    codes: ['EXECUTIVE', 'PROJECT_CONTROLS'],
    permissions: ['commissioning.read', 'cod.read']
  },
  {
    codes: ['QAQC_MANAGER'],
    permissions: [
      'commissioning.read', 'testPack.create', 'testRun.start', 'testRun.complete',
      'testRun.retest', 'cod.read'
    ]
  }
];

export class GrantCommissioningPermissions1783759000000 implements MigrationInterface {
  name = 'GrantCommissioningPermissions1783759000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${stateTable} (
      role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      role_code varchar(64) NOT NULL,
      added_permissions jsonb NOT NULL,
      previous_policy_version integer NOT NULL,
      policy_version_changed boolean NOT NULL,
      CONSTRAINT ck_role_grant_commissioning_permissions CHECK
        (jsonb_typeof(added_permissions) = 'array')
    )`);
    for (const group of grants) {
      for (const code of group.codes) {
        await this.apply(queryRunner, group.permissions, 'role.code = $1', [code]);
      }
    }
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
