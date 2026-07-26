import type { MigrationInterface, QueryRunner } from 'typeorm';

const stateTable = 'role_grant_reconcile_1783743000000';
const policyVersion = 7;

/**
 * Contract & Cost permission codes (API-053…API-066).
 *
 * PMO carries the full commercial authority; PROJECT_MANAGER everything except the two
 * controls-owned codes (`budget.submit`, `commitment.create`); PROJECT_CONTROLS is the
 * budget/commitment recorder with read access to contracts, obligations and payments; EXECUTIVE
 * stays read-only. PACKAGE_OWNER receives nothing — contracts are project-level and a package-only
 * principal has no reach into them — and TENANT_ADMIN receives nothing because financial data is
 * denied by default per docs/09.
 *
 * Every code below has an endpoint behind it; nothing is granted "for later".
 */
const grants: ReadonlyArray<{ codes: readonly string[]; permissions: readonly string[] }> = [
  {
    codes: ['PMO'],
    permissions: [
      'contract.read', 'contract.create', 'contract.update', 'contractParty.create',
      'contractAppendix.create', 'obligation.read', 'obligation.create', 'obligation.fulfill',
      'cost.read', 'budget.submit', 'commitment.create', 'payment.create', 'payment.read'
    ]
  },
  {
    codes: ['PROJECT_MANAGER'],
    permissions: [
      'contract.read', 'contract.create', 'contract.update', 'contractParty.create',
      'contractAppendix.create', 'obligation.read', 'obligation.create', 'obligation.fulfill',
      'cost.read', 'payment.create', 'payment.read'
    ]
  },
  {
    codes: ['PROJECT_CONTROLS'],
    permissions: [
      'contract.read', 'obligation.read', 'cost.read', 'budget.submit', 'commitment.create',
      'payment.read'
    ]
  },
  {
    codes: ['EXECUTIVE'],
    permissions: ['contract.read', 'cost.read']
  }
];

export class GrantContractCostPermissions1783743000000 implements MigrationInterface {
  name = 'GrantContractCostPermissions1783743000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${stateTable} (
      role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      role_code varchar(64) NOT NULL,
      added_permissions jsonb NOT NULL,
      previous_policy_version integer NOT NULL,
      policy_version_changed boolean NOT NULL,
      CONSTRAINT ck_role_grant_contract_cost_permissions CHECK
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
