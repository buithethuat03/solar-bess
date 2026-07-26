import { randomUUID } from 'node:crypto';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const stateTable = 'role_grant_reconcile_1783747000000';
const policyVersion = 9;

/**
 * Four NEW catalog roles for the Field, HSE & Quality slice — a deliberate, recorded decision:
 * `HSE_MANAGER`, `QAQC_MANAGER`, `PERMIT_ISSUER`, `CONTRACTOR` are created for every existing
 * tenant WITH NO USERS ASSIGNED ANYWHERE. A role nobody holds fails closed; safety authority
 * (permit issuing, stop-work lifting, quality management) becomes assignable without ever letting
 * an existing role self-approve its way into it.
 */
const newRoles: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'HSE_MANAGER', name: 'HSE Manager' },
  { code: 'QAQC_MANAGER', name: 'QA/QC Manager' },
  { code: 'PERMIT_ISSUER', name: 'Permit Issuer' },
  { code: 'CONTRACTOR', name: 'Contractor' }
];

/**
 * Field, HSE & Quality permission codes (API-086…API-097).
 *
 * Recorded deviation from the YAML's single `stopWork.manage` on API-094: the operation is split
 * into `stopWork.issue` (anyone may stop unsafe work — ALL roles) and `stopWork.lift`
 * (HSE_MANAGER only) so lifting authority is never implied by issuing authority.
 * `permitToWork.issue` goes to PERMIT_ISSUER and HSE_MANAGER only (SEC-102), and API-090 reuses
 * the EXISTING `progress.record` code — deliberately NOT re-granted here.
 */
const grants: ReadonlyArray<{ codes: readonly string[]; permissions: readonly string[] }> = [
  {
    codes: ['PMO', 'PROJECT_MANAGER'],
    permissions: [
      'workfront.read', 'workfront.release', 'dailyLog.create', 'dailyLog.submit',
      'permitToWork.request', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage'
    ]
  },
  {
    codes: ['PROJECT_CONTROLS'],
    permissions: ['workfront.read', 'dailyLog.create', 'hseIncident.report', 'stopWork.issue']
  },
  {
    codes: ['PACKAGE_OWNER'],
    permissions: [
      'workfront.read', 'dailyLog.create', 'permitToWork.request',
      'hseIncident.report', 'stopWork.issue'
    ]
  },
  {
    codes: ['EXECUTIVE', 'TENANT_ADMIN'],
    permissions: ['workfront.read', 'hseIncident.report', 'stopWork.issue']
  },
  {
    codes: ['HSE_MANAGER'],
    permissions: [
      'workfront.read', 'permitToWork.issue', 'hseIncident.report',
      'stopWork.issue', 'stopWork.lift'
    ]
  },
  {
    codes: ['QAQC_MANAGER'],
    permissions: [
      'workfront.read', 'hseIncident.report', 'stopWork.issue',
      'inspection.manage', 'ncr.manage', 'punch.manage'
    ]
  },
  {
    codes: ['PERMIT_ISSUER'],
    permissions: ['workfront.read', 'permitToWork.issue', 'hseIncident.report', 'stopWork.issue']
  },
  {
    codes: ['CONTRACTOR'],
    permissions: [
      'workfront.read', 'dailyLog.create', 'permitToWork.request',
      'hseIncident.report', 'stopWork.issue'
    ]
  }
];

export class GrantFieldHseQualityPermissions1783747000000 implements MigrationInterface {
  name = 'GrantFieldHseQualityPermissions1783747000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS ${stateTable} (
      role_id uuid PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL,
      role_code varchar(64) NOT NULL,
      added_permissions jsonb NOT NULL,
      previous_policy_version integer NOT NULL,
      policy_version_changed boolean NOT NULL,
      created_role boolean NOT NULL DEFAULT false,
      CONSTRAINT ck_role_grant_field_hse_quality_permissions CHECK
        (jsonb_typeof(added_permissions) = 'array')
    )`);

    // Materialize the four new catalog roles for every tenant that lacks them. Each created role
    // is flagged in the state table so down() removes exactly the rows this migration invented —
    // and, deliberately, NO role_assignments row is ever written for them.
    for (const role of newRoles) {
      const missing = await queryRunner.query(
        `SELECT tenant.id AS "tenantId" FROM tenants tenant
        WHERE NOT EXISTS (
          SELECT 1 FROM roles existing
          WHERE existing.tenant_id = tenant.id AND existing.code = $1
        )`, [role.code]
      ) as Array<{ tenantId: string }>;
      for (const row of missing) {
        const roleId = randomUUID();
        await queryRunner.query(
          `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
          VALUES ($1, $2, $3, $4, '[]'::jsonb, ${policyVersion}, 'ACTIVE')`,
          [roleId, row.tenantId, role.code, role.name]
        );
        await queryRunner.query(
          `INSERT INTO ${stateTable} (
            role_id, tenant_id, role_code, added_permissions,
            previous_policy_version, policy_version_changed, created_role
          ) VALUES ($1, $2, $3, '[]'::jsonb, ${policyVersion}, false, true)`,
          [roleId, row.tenantId, role.code]
        );
      }
    }

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
    WHERE role.id = state.role_id AND role.tenant_id = state.tenant_id
      AND NOT state.created_role`);
    await queryRunner.query(`DELETE FROM roles role
      USING ${stateTable} state
      WHERE role.id = state.role_id AND role.tenant_id = state.tenant_id
        AND state.created_role`);
    await queryRunner.query(`DROP TABLE ${stateTable}`);
  }
}
