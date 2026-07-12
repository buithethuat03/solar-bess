import 'reflect-metadata';
import AppDataSource from '../data-source';
import { TenantEntity, UserAccountEntity } from '../entities';
import { seedProjectMaster } from './project-master.seed';

async function run(): Promise<void> {
  await AppDataSource.initialize();
  await AppDataSource.transaction(async (manager) => {
    const tenants = await manager.getRepository(TenantEntity).findBy({ status: 'ACTIVE' });
    if (tenants.length !== 1) {
      throw new Error(`Project seed requires exactly one ACTIVE test tenant; found ${tenants.length}`);
    }
    const users = await manager.getRepository(UserAccountEntity).findBy({
      tenantId: tenants[0].id, status: 'ACTIVE'
    });
    if (users.length !== 1) {
      throw new Error(`Project seed requires exactly one ACTIVE test user; found ${users.length}`);
    }
    await seedProjectMaster(manager, tenants[0], users[0]);
  });
  await AppDataSource.destroy();
  console.log('Project Master demo seed is ready; no credential was read or changed');
}

void run().catch(async (error: unknown) => {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  console.error(error instanceof Error ? error.message : 'Project Master seed failed');
  process.exitCode = 1;
});
