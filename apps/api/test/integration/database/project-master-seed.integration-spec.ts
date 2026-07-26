import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { runProjectMasterSeed } from 'src/database/seeds/project-master.seed';
import { runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

/**
 * The two-phase seed contract: phase 1 (role catalog, cost codes, equipment models) reconciles
 * into ANY environment with one ACTIVE tenant; phase 2 (demo project scaffold and demo plants)
 * keeps the exactly-one-ACTIVE-test-user guard and is skipped — cleanly, not fatally — when the
 * guard fails. The skip path is what repairs an already-populated deployment that previously
 * ended up with zero cost codes.
 */
describe('Project Master seed — master-catalog reconciliation vs demo-project guard', () => {
  const tenantId = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES ($1,'seed-test','Seed Tenant','ACTIVE')`,
      [tenantId]
    );
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('applies phase 1 and skips phase 2 cleanly when more than one ACTIVE user exists', async () => {
    await seedUser('seed-user-a@example.test');
    await seedUser('seed-user-b@example.test');

    const outcome = await AppDataSource.transaction(
      async (manager) => runProjectMasterSeed(manager)
    );
    expect(outcome.demoProjectSeeded).toBe(false);
    expect(outcome.skippedReason).toContain('found 2');

    // Phase 1 reconciled the full master catalog. Ten roles: the six operating roles plus the four
    // unassigned safety roles the field-hse grant introduced (HSE_MANAGER, QAQC_MANAGER,
    // PERMIT_ISSUER, CONTRACTOR).
    expect(await count('roles')).toBe(10);
    const [pmo] = await AppDataSource.query<Array<{
      permissions: string[]; policyVersion: number;
    }>>(
      `SELECT permissions, policy_version AS "policyVersion" FROM roles
       WHERE tenant_id = $1 AND code = 'PMO'`, [tenantId]
    );
    // Floor, not equality: the full migration chain runs later grant slices that raise the same
    // role's policy version, so an exact match would break every time a slice lands.
    expect(pmo.policyVersion).toBeGreaterThanOrEqual(8);
    expect(pmo.permissions).toEqual(expect.arrayContaining([
      'equipmentModel.read', 'bom.release', 'solarPlant.configure', 'bessSimulation.run'
    ]));
    expect(await count('cost_codes')).toBe(3);
    const models = await AppDataSource.query<Array<{ status: string }>>(
      'SELECT status FROM equipment_models WHERE tenant_id = $1', [tenantId]
    );
    expect(models.length).toBe(4);
    expect(models.filter((row) => row.status === 'APPROVED')).toHaveLength(3);

    // …and phase 2 wrote nothing that hangs off the demo user.
    expect(await count('projects')).toBe(0);
    expect(await count('sites')).toBe(0);
    expect(await count('role_assignments')).toBe(0);
    expect(await count('solar_plants')).toBe(0);
    expect(await count('bess_plants')).toBe(0);
    expect(await count('equipment')).toBe(0);
    expect(await count('assets')).toBe(0);
  });

  it('runs both phases with exactly one ACTIVE user and stays idempotent on re-run', async () => {
    await seedUser('seed-user-a@example.test');

    const first = await AppDataSource.transaction(
      async (manager) => runProjectMasterSeed(manager)
    );
    expect(first).toEqual({ demoProjectSeeded: true, skippedReason: null });

    expect(await count('projects')).toBe(1);
    expect(await count('sites')).toBe(1);
    expect(await count('cost_codes')).toBe(3);
    expect(await count('equipment_models')).toBe(4);
    // The demo plant scaffold: one root equipment + asset pair per plant kind.
    expect(await count('equipment')).toBe(2);
    expect(await count('assets')).toBe(2);
    const [solar] = await AppDataSource.query<Array<{ status: string; version: number }>>(
      `SELECT status, configuration_version AS version FROM solar_plants WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(solar).toEqual({ status: 'DRAFT', version: 1 });
    const [bess] = await AppDataSource.query<Array<{ status: string; version: number }>>(
      `SELECT status, hierarchy_version AS version FROM bess_plants WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(bess).toEqual({ status: 'DRAFT', version: 1 });

    // Re-running writes nothing new — natural-key idempotency across both phases.
    const tables = [
      'roles', 'cost_codes', 'equipment_models', 'projects', 'sites',
      'equipment', 'assets', 'solar_plants', 'bess_plants'
    ];
    const before = new Map<string, number>();
    for (const table of tables) before.set(table, await count(table));
    const second = await AppDataSource.transaction(
      async (manager) => runProjectMasterSeed(manager)
    );
    expect(second.demoProjectSeeded).toBe(true);
    for (const table of tables) {
      expect(await count(table)).toBe(before.get(table));
    }
  });

  it('reconciles the role catalog even when the tenant has no ACTIVE user at all', async () => {
    const outcome = await AppDataSource.transaction(
      async (manager) => runProjectMasterSeed(manager)
    );
    expect(outcome.demoProjectSeeded).toBe(false);
    expect(await count('roles')).toBe(10);
    // Attributed catalog rows need an author and are skipped without one.
    expect(await count('cost_codes')).toBe(0);
    expect(await count('equipment_models')).toBe(0);
  });

  it('still refuses to run against anything but exactly one ACTIVE tenant', async () => {
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES ($1,'seed-two','Second','ACTIVE')`,
      [randomUUID()]
    );
    await expect(AppDataSource.transaction(
      async (manager) => runProjectMasterSeed(manager)
    )).rejects.toThrow('exactly one ACTIVE test tenant; found 2');
  });

  async function seedUser(email: string): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO user_accounts (id, tenant_id, email, normalized_email, display_name, status)
       VALUES ($1,$2,$3,$3,'Seed Fixture','ACTIVE')`,
      [randomUUID(), tenantId, email]
    );
  }

  async function count(table: string): Promise<number> {
    const [row] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*)::text AS count FROM ${table}`
    );
    return Number(row.count);
  }
});
