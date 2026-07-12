import AppDataSource from 'src/database/data-source';

export async function runTestMigrations(): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await AppDataSource.runMigrations({ transaction: 'all' });
  await AppDataSource.destroy();
}
