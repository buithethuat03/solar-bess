import 'reflect-metadata';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { encryptedEnvironmentValue, loadAppConfig } from '../../config/environment';
import AppDataSource from '../data-source';
import {
  LocalCredentialEntity, TenantEntity, UserAccountEntity
} from '../entities';
import { seedProjectMaster } from './project-master.seed';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function run(): Promise<void> {
  const config = loadAppConfig();
  const tenantCode = required('BOOTSTRAP_TENANT_CODE').toLowerCase();
  const tenantName = required('BOOTSTRAP_TENANT_NAME');
  const email = encryptedEnvironmentValue('BOOTSTRAP_USER_EMAIL').toLowerCase();
  const displayName = required('BOOTSTRAP_USER_NAME');
  const password = encryptedEnvironmentValue('BOOTSTRAP_USER_PASSWORD', 12);

  await AppDataSource.initialize();
  await AppDataSource.transaction(async (manager) => {
    const tenantRepository = manager.getRepository(TenantEntity);
    const userRepository = manager.getRepository(UserAccountEntity);
    const credentialRepository = manager.getRepository(LocalCredentialEntity);
    let tenant = await tenantRepository.findOneBy({ code: tenantCode });
    if (!tenant) {
      tenant = await tenantRepository.save({
        id: randomUUID(), code: tenantCode, name: tenantName, status: 'ACTIVE'
      });
    }
    let user = await userRepository.findOneBy({ tenantId: tenant.id, normalizedEmail: email });
    if (!user) {
      user = await userRepository.save({
        id: randomUUID(), tenantId: tenant.id, email, normalizedEmail: email,
        displayName, status: 'ACTIVE', lastLoginAt: null
      });
    }
    const credential = await credentialRepository.findOneBy({ tenantId: tenant.id, userAccountId: user.id });
    if (!credential || process.env.BOOTSTRAP_ROTATE_PASSWORD === 'true') {
      const passwordHash = await hash(password, {
        type: 2,
        memoryCost: config.auth.argonMemoryCost,
        timeCost: config.auth.argonTimeCost,
        parallelism: config.auth.argonParallelism
      });
      await credentialRepository.save({
        id: credential?.id ?? randomUUID(), tenantId: tenant.id, userAccountId: user.id,
        passwordHash, algorithm: 'argon2id', credentialVersion: (credential?.credentialVersion ?? 0) + 1,
        changedAt: new Date()
      });
    }

    await seedProjectMaster(manager, tenant, user);
  });
  await AppDataSource.destroy();
  console.log('Bootstrap tenant/user is ready; no credential value was logged');
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Bootstrap failed');
  process.exitCode = 1;
});
