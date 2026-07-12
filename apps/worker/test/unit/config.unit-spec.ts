import { loadWorkerConfig } from '../../src/config';

const databaseUrl = 'postgresql://worker:password@127.0.0.1:5432/solar_bess';
const redisPassword = 'r'.repeat(32);

function readSecret(path: string): string {
  if (path === '/secrets/database_url') return databaseUrl;
  if (path === '/secrets/redis_password') return redisPassword;
  throw new Error(`Unexpected secret path ${path}`);
}

describe('worker secret-file configuration', () => {
  it('loads credentials only from mounted files and applies non-sensitive host overrides', () => {
    const config = loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: '/secrets/database_url',
      WORKER_DATABASE_HOST_OVERRIDE: 'postgres',
      WORKER_REDIS_PASSWORD_FILE: '/secrets/redis_password',
      WORKER_REDIS_HOST: 'redis',
      WORKER_ID: 'worker-test'
    }, readSecret);

    expect(new URL(config.database.url).hostname).toBe('postgres');
    expect(config.redis.host).toBe('redis');
    expect(config.redis.password).toBe(redisPassword);
    expect(config.workerId).toBe('worker-test');
  });

  it.each(['DATABASE_URL', 'REDIS_PASSWORD'])('rejects plaintext credential env %s', (name) => {
    expect(() => loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: '/secrets/database_url',
      WORKER_REDIS_PASSWORD_FILE: '/secrets/redis_password',
      [name]: 'plaintext'
    }, readSecret)).toThrow('secret files');
  });

  it('requires a Redis secret of at least 32 characters', () => {
    expect(() => loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: '/secrets/database_url',
      WORKER_REDIS_PASSWORD_FILE: '/secrets/short'
    }, (path) => path.endsWith('database_url') ? databaseUrl : 'too-short')).toThrow('too short');
  });

  it('validates bounded concurrency and polling settings', () => {
    expect(() => loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: '/secrets/database_url',
      WORKER_REDIS_PASSWORD_FILE: '/secrets/redis_password',
      WORKER_CONCURRENCY: '0'
    }, readSecret)).toThrow('WORKER_CONCURRENCY');
  });
});
