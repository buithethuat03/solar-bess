import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = process.env.WORKER_TEST_SECRETS_DIR?.trim()
  || '/tmp/solar-bess-worker-test-secrets';
const secrets: ReadonlyArray<readonly [string, string]> = [
  ['postgres_user', 'solar_bess_test'],
  ['postgres_password', 'solar_bess_test'],
  [
    'database_url',
    'postgresql://solar_bess_test:solar_bess_test@127.0.0.1:5433/solar_bess_test'
  ],
  ['redis_password', 'solar-bess-redis-integration-test-password']
];

mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
for (const [name, value] of secrets) {
  const target = resolve(directory, name);
  const mode = name === 'redis_password' ? 0o640 : 0o600;
  writeFileSync(target, value, { mode });
  chmodSync(target, mode);
}
console.log(`Synthetic worker integration secret files are ready in ${directory}`);
