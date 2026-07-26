import type { MigrationInterface, QueryRunner } from 'typeorm';

const stateTable = 'role_grant_reconcile_1783761000000';
/**
 * Policy version 14 of the role catalog — the chain maximum. Versions 8…13 belong to sibling
 * slices (13 is the Commissioning slice); every write here uses GREATEST so the outcome is the
 * chain maximum regardless of merge order, and the state table lets down() restore the exact
 * previous version per role.
 */
const policyVersion = 14;

/**
 * O&M permission codes (API-114…API-121).
 *
 * Read codes (`alarmCase.read`, `serviceIncident.read`, `workOrder.read`, `performance.read`) go to
 * the four register-reading roles; the four write codes (`alarmCase.acknowledge`,
 * `serviceIncident.create`, `workOrder.create`, `workOrder.manage`) stay with PMO and
 * PROJECT_MANAGER.
 *
 * NO new role is created. docs/09 §"Roles" describes the O&M personas — **O&M Dispatcher**,
 * **Technician**, **O&M Engineer** — as authority profiles, but the approved role catalog assigns
 * them NO role codes, and inventing `OM_DISPATCHER`/`OM_TECHNICIAN` here would be inventing
 * authority that no approved artefact grants. Their authority is therefore approximated by
 * PM/PMO for now, which is narrower than the personas (a dispatcher cannot be given dispatch
 * rights without also holding project-management rights). `Open Question` for the Product Owner
 * and HSE: do the O&M personas get their own role codes, and does `workOrder.manage` then split
 * into dispatch / execute / verify halves so a technician can never hold the verify half?
 *
 * `permitToWork.*` is NOT re-granted: API-119/API-120 only READ a permit that the Field/HSE slice
 * issued, and reading it is part of the work-order permission, not a permit permission.
 */
const grants: ReadonlyArray<{ codes: readonly string[]; permissions: readonly string[] }> = [
  {
    codes: ['PMO', 'PROJECT_MANAGER'],
    permissions: [
      'alarmCase.read', 'serviceIncident.read', 'performance.read', 'workOrder.read',
      'alarmCase.acknowledge', 'serviceIncident.create', 'workOrder.create', 'workOrder.manage'
    ]
  },
  {
    codes: ['EXECUTIVE', 'PROJECT_CONTROLS'],
    permissions: [
      'alarmCase.read', 'serviceIncident.read', 'performance.read', 'workOrder.read'
    ]
  }
];

export class GrantOperationsMaintenancePermissions1783761000000 implements MigrationInterface {
  name = 'GrantOperationsMaintenancePermissions1783761000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${stateTable} (
      role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      role_code varchar(64) NOT NULL,
      added_permissions jsonb NOT NULL,
      previous_policy_version integer NOT NULL,
      policy_version_changed boolean NOT NULL,
      CONSTRAINT ck_role_grant_operations_maintenance_permissions CHECK
        (jsonb_typeof(added_permissions) = 'array')
    )`);
    for (const group of grants) {
      for (const code of group.codes) {
        await this.apply(queryRunner, group.permissions, code);
      }
    }
  }

  private async apply(
    queryRunner: QueryRunner, permissions: readonly string[], code: string
  ): Promise<void> {
    const required = JSON.stringify(permissions);
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
