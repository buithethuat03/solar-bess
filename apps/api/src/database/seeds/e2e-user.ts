import 'reflect-metadata';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { loadAppConfig } from '../../config/environment';
import AppDataSource from '../data-source';
import {
  AssignmentScopeType, AuthenticationSessionEntity, LocalCredentialEntity,
  MasterRecordStatus, RoleAssignmentEntity, RoleEntity, TenantEntity, UserAccountEntity
} from '../entities';

const fixtures = [
  { email: 'e2e-runner@example.test', displayName: 'E2E Runner' },
  { email: 'e2e-approver@example.test', displayName: 'E2E Independent Approver' }
] as const;

async function stdin(): Promise<string> {
  let value = '';
  for await (const chunk of process.stdin) value += String(chunk);
  return value.trim();
}

async function run(): Promise<void> {
  const action = process.argv[2];
  if (action !== 'create' && action !== 'delete') throw new Error('Expected create or delete action');
  const password = action === 'create' ? await stdin() : '';
  if (action === 'create' && password.length < 16) throw new Error('E2E password must have at least 16 characters');
  const config = loadAppConfig();
  await AppDataSource.initialize();
  await AppDataSource.transaction(async (manager) => {
    const tenants = await manager.getRepository(TenantEntity).findBy({ status: 'ACTIVE' });
    if (tenants.length !== 1) throw new Error(`E2E fixture requires exactly one ACTIVE test tenant; found ${tenants.length}`);
    const users = manager.getRepository(UserAccountEntity);
    if (action === 'delete') {
      for (const fixture of fixtures) {
        const existing = await users.findOneBy({
          tenantId: tenants[0].id, normalizedEmail: fixture.email
        });
        if (!existing) continue;
        await manager.getRepository(AuthenticationSessionEntity).delete({
          tenantId: tenants[0].id, userAccountId: existing.id
        });
        await manager.getRepository(LocalCredentialEntity).delete({
          tenantId: tenants[0].id, userAccountId: existing.id
        });
        await manager.getRepository(RoleAssignmentEntity).delete({
          tenantId: tenants[0].id, userAccountId: existing.id
        });
        await users.delete({ id: existing.id, tenantId: tenants[0].id });
      }
      return;
    }
    const role = await manager.getRepository(RoleEntity).findOneBy({
      tenantId: tenants[0].id, code: 'PMO', status: MasterRecordStatus.ACTIVE
    });
    if (!role) throw new Error('PMO role must be seeded before E2E fixture');
    for (const fixture of fixtures) {
      const existing = await users.findOneBy({
        tenantId: tenants[0].id, normalizedEmail: fixture.email
      });
      const user = await users.save({
        ...(existing ?? { id: randomUUID(), tenantId: tenants[0].id }),
        email: fixture.email, normalizedEmail: fixture.email,
        displayName: fixture.displayName, status: 'ACTIVE', lastLoginAt: null
      });
      const credentials = manager.getRepository(LocalCredentialEntity);
      const credential = await credentials.findOneBy({
        tenantId: tenants[0].id, userAccountId: user.id
      });
      await credentials.save({
        id: credential?.id ?? randomUUID(), tenantId: tenants[0].id,
        userAccountId: user.id,
        passwordHash: await hash(password, {
          type: 2, memoryCost: config.auth.argonMemoryCost,
          timeCost: config.auth.argonTimeCost, parallelism: config.auth.argonParallelism
        }),
        algorithm: 'argon2id',
        credentialVersion: (credential?.credentialVersion ?? 0) + 1,
        changedAt: new Date()
      });
      const assignments = manager.getRepository(RoleAssignmentEntity);
      const assignment = await assignments.findOneBy({
        tenantId: tenants[0].id, userAccountId: user.id, roleId: role.id,
        scopeType: AssignmentScopeType.TENANT
      });
      await assignments.save({
        ...(assignment ?? {
          id: randomUUID(), tenantId: tenants[0].id,
          userAccountId: user.id, roleId: role.id
        }),
        scopeType: AssignmentScopeType.TENANT, scopeId: null,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null,
        status: MasterRecordStatus.ACTIVE
      });
    }
  });
  await AppDataSource.destroy();
  console.log(`E2E fixture ${action} completed; no credential value was logged`);
}

void run().catch(async (error: unknown) => {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  console.error(error instanceof Error ? error.message : 'E2E fixture failed');
  process.exitCode = 1;
});
