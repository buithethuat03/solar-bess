import AppDataSource from 'src/database/data-source';

export async function runTestMigrations(): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  await AppDataSource.runMigrations({ transaction: 'all' });
  await AppDataSource.destroy();
}

export async function revertThroughMigration(migrationName: string): Promise<void> {
  const existing = await AppDataSource.query<Array<{ name: string }>>(
    'SELECT name FROM migrations ORDER BY id DESC'
  );
  if (!existing.some((migration) => migration.name === migrationName)) {
    throw new Error(`Migration ${migrationName} is not currently applied`);
  }
  for (;;) {
    const [latest] = await AppDataSource.query<Array<{ name: string }>>(
      'SELECT name FROM migrations ORDER BY id DESC LIMIT 1'
    );
    if (!latest) throw new Error(`Migration ${migrationName} could not be reached`);
    await AppDataSource.undoLastMigration({ transaction: 'all' });
    if (latest.name === migrationName) return;
  }
}
