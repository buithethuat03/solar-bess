import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(30_000);

describe('Project Master migration — DB-002/003/006/007/009…011/013', () => {
  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('runs down and up without leaving a partial schema', async () => {
    await revertThroughMigration('CreateProjectMaster1783728000000');
    const [down] = await AppDataSource.query<Array<{ roles: string | null; audit_column: string | null }>>(
      `SELECT to_regclass('public.roles')::text AS roles,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_events' AND column_name = 'object_type') AS audit_column`
    );
    expect(down).toEqual({ roles: null, audit_column: null });

    await AppDataSource.runMigrations({ transaction: 'all' });
    const [up] = await AppDataSource.query<Array<{ roles: string; audit_column: string }>>(
      `SELECT to_regclass('public.roles')::text AS roles,
       (SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'audit_events' AND column_name = 'object_type') AS audit_column`
    );
    expect(up).toEqual({ roles: 'roles', audit_column: 'object_type' });
  });
});
