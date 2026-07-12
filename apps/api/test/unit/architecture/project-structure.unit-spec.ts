import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const target = join(root, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe('Nest/TypeORM project structure — ADR-001/ADR-004', () => {
  it('centralizes entities and migrations under src/database', () => {
    const source = join(process.cwd(), 'src');
    expect(existsSync(join(source, 'database/entities'))).toBe(true);
    expect(existsSync(join(source, 'database/migrations'))).toBe(true);
    for (const file of files(source).filter((name) => name.endsWith('.ts'))) {
      if (file.includes('/database/entities/')) continue;
      expect(readFileSync(file, 'utf8')).not.toContain('@Entity(');
    }
  });

  it('does not retain the superseded tactical-layer directories', () => {
    const moduleRoot = join(process.cwd(), 'src/modules/identity-access');
    for (const directory of ['application', 'domain', 'infrastructure', 'interfaces']) {
      expect(existsSync(join(moduleRoot, directory))).toBe(false);
    }
  });

  it('separates test config, setup, unit and integration trees', () => {
    const testRoot = join(process.cwd(), 'test');
    for (const directory of ['config', 'setup', 'unit', 'integration']) {
      expect(existsSync(join(testRoot, directory))).toBe(true);
    }
    expect(readdirSync(testRoot).filter((entry) => statSync(join(testRoot, entry)).isFile())).toEqual([]);
  });
});
