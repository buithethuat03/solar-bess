import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(60_000);

const migrationName = 'GrantNotificationPermissions1783737000000';
const notificationPermissions = ['notification.read', 'notification.acknowledge'] as const;

describe('Notification permission grant migration — US-022 role policy', () => {
  const tenantId = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await AppDataSource.query(
      `INSERT INTO tenants (id, code, name, status) VALUES ($1, 'grant-test', 'Grant Tenant', 'ACTIVE')`,
      [tenantId]
    );
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('adds both codes to every catalog role and removes exactly those on down', async () => {
    const pmo = await seedRole('PMO', ['project.read'], 3);
    const admin = await seedRole('TENANT_ADMIN', ['roleAssignment.manage'], 3);

    await rerunGrant();

    for (const roleId of [pmo, admin]) {
      const role = await readRole(roleId);
      expect(role.permissions).toEqual(expect.arrayContaining([...notificationPermissions]));
      // Later grant migrations in the same chain raise this further; assert the floor this
      // migration guarantees rather than pinning it to whatever currently ends the chain.
      expect(role.policy_version).toBeGreaterThanOrEqual(4);
    }

    await revertThroughMigration(migrationName);

    for (const roleId of [pmo, admin]) {
      const role = await readRole(roleId);
      for (const permission of notificationPermissions) {
        expect(role.permissions).not.toContain(permission);
      }
      // Each down() in the chain restores the version it captured, unwinding to the seeded value.
      expect(role.policy_version).toBe(3);
    }
    expect(await readRole(pmo).then((role) => role.permissions)).toContain('project.read');

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await readRole(pmo).then((role) => role.permissions))
      .toEqual(expect.arrayContaining([...notificationPermissions]));
  });

  it('leaves a permission the role already held in place after down', async () => {
    // A role that already carried notification.read must keep it, because this migration never
    // recorded itself as the grantor of that code.
    const role = await seedRole('EXECUTIVE', ['project.read', 'notification.read'], 4);

    await rerunGrant();
    expect(await readRole(role).then((item) => item.permissions))
      .toEqual(expect.arrayContaining([...notificationPermissions]));

    await revertThroughMigration(migrationName);
    const reverted = await readRole(role);
    expect(reverted.permissions).toContain('notification.read');
    expect(reverted.permissions).not.toContain('notification.acknowledge');

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('does not invent roles that the tenant never seeded', async () => {
    await seedRole('PMO', ['project.read'], 1);
    await rerunGrant();
    const rows = await AppDataSource.query<Array<{ code: string }>>(
      'SELECT code FROM roles WHERE tenant_id = $1', [tenantId]
    );
    expect(rows.map((row) => row.code)).toEqual(['PMO']);
  });

  /**
   * The migration already ran during setup, before this suite seeded any role, so the assertions
   * need it applied again against the fresh fixture rows.
   */
  async function rerunGrant(): Promise<void> {
    await revertThroughMigration(migrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });
  }

  async function seedRole(
    code: string, permissions: string[], policyVersion: number
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1, $2, $3, $3, $4::jsonb, $5, 'ACTIVE')`,
      [id, tenantId, code, JSON.stringify(permissions), policyVersion]
    );
    return id;
  }

  async function readRole(id: string): Promise<{ permissions: string[]; policy_version: number }> {
    const [row] = await AppDataSource.query<Array<{
      permissions: string[]; policy_version: number;
    }>>('SELECT permissions, policy_version FROM roles WHERE id = $1', [id]);
    return row;
  }
});
