import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { encryptedEnvironmentValue } from '../../config/environment';
import { CipherService, parseCipherKey } from './cipher.service';

const SENSITIVE_ENV_KEYS = new Set([
  'POSTGRES_USER', 'POSTGRES_PASSWORD', 'DATABASE_URL',
  'REDIS_PASSWORD', 'RATE_LIMIT_HASH_SECRET',
  'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'BOOTSTRAP_USER_EMAIL', 'BOOTSTRAP_USER_PASSWORD'
]);

const MINIMUM_SECRET_LENGTH: Readonly<Record<string, number>> = {
  REDIS_PASSWORD: 32,
  RATE_LIMIT_HASH_SECRET: 32
};

const DEFAULT_ENV_VALUES: Record<string, string> = {
  RUNTIME_SECRETS_DIR: '/tmp/solar-bess-secrets',
  JWT_ACCESS_TTL_SECONDS: '900',
  JWT_REFRESH_TTL_SECONDS: '604800',
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: '5',
  AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6379',
  REDIS_DATABASE: '0',
  REDIS_CONNECT_TIMEOUT_MS: '2000',
  REDIS_KEY_PREFIX: 'solar-bess',
  TRUST_PROXY_HOPS: '1',
  COMMAND_RECEIPT_RETENTION_HOURS: '24',
  OUTBOX_PUBLISH_TIMEOUT_MS: '5000',
  SCHEDULE_NEAR_CRITICAL_FLOAT_DAYS: '5',
  SCHEDULE_DEFAULT_LOOKAHEAD_DAYS: '21',
  SCHEDULE_IMPORT_MAX_ROWS: '5000',
  SCHEDULE_MAX_ABS_LAG_DAYS: '3650',
  SCHEDULE_ALERT_SCAN_INTERVAL_MS: '60000',
  SCHEDULE_THRESHOLD_VERSION: 'SCHEDULE_THRESHOLDS_V1',
  ARGON2_MEMORY_COST: '19456',
  ARGON2_TIME_COST: '2',
  ARGON2_PARALLELISM: '1',
  COOKIE_NAME: 'refresh_token',
  COOKIE_PATH: '/v1/auth',
  COOKIE_SAME_SITE: 'lax'
};

function envPath(): string {
  const local = resolve(process.cwd(), '.env');
  if (existsSync(local)) return local;
  const workspace = resolve(process.cwd(), '../../.env');
  if (existsSync(workspace)) return workspace;
  throw new Error('.env was not found');
}

async function readSecret(): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
  }
  process.stderr.write('Plaintext (input hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolveSecret, reject) => {
    let value = '';
    const finish = (): void => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
      resolveSecret(value);
    };
    process.stdin.on('data', (character: string) => {
      if (character === '\r' || character === '\n') return finish();
      if (character === '\u0003') {
        process.stdin.setRawMode(false);
        reject(new Error('Cancelled'));
        return;
      }
      if (character === '\u007f') value = value.slice(0, -1);
      else value += character;
    });
  });
}

function migrateEnvironment(): void {
  const path = envPath();
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const existingKeyLine = lines.find((line) => line.startsWith('CIPHER_KEY='));
  const keyValue = existingKeyLine?.slice('CIPHER_KEY='.length) || randomBytes(32).toString('base64');
  const cipher = new CipherService(parseCipherKey(keyValue));
  let keyFound = Boolean(existingKeyLine);
  const names = new Set<string>();
  const encryptedNames: string[] = [];
  const migrated = lines.map((line) => {
    if (!line || line.startsWith('#') || !line.includes('=')) return line;
    const separator = line.indexOf('=');
    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    names.add(name);
    if (name === 'CIPHER_KEY') {
      keyFound = true;
      return `CIPHER_KEY=${keyValue}`;
    }
    if (!SENSITIVE_ENV_KEYS.has(name) || !value) return line;
    if (cipher.isEncrypted(value)) {
      const plaintext = cipher.decrypt(value);
      const minimum = MINIMUM_SECRET_LENGTH[name];
      if (minimum && plaintext.length < minimum) {
        throw new Error(`${name} decrypted value must contain at least ${minimum} characters`);
      }
      return line;
    }
    const minimum = MINIMUM_SECRET_LENGTH[name];
    if (minimum && value.length < minimum) {
      throw new Error(`${name} must contain at least ${minimum} characters before encryption`);
    }
    encryptedNames.push(name);
    return `${name}=${cipher.encrypt(value)}`;
  });
  if (!keyFound) migrated.unshift(`CIPHER_KEY=${keyValue}`);
  for (const name of ['REDIS_PASSWORD', 'RATE_LIMIT_HASH_SECRET']) {
    if (names.has(name)) continue;
    const generated = randomBytes(32).toString('base64url');
    migrated.push(`${name}=${cipher.encrypt(generated)}`);
    names.add(name);
    encryptedNames.push(name);
  }
  for (const [name, value] of Object.entries(DEFAULT_ENV_VALUES)) {
    if (!names.has(name)) migrated.push(`${name}=${value}`);
  }
  writeFileSync(path, `${migrated.join('\n').replace(/\n+$/, '')}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  console.log(`Encrypted ${encryptedNames.length} environment value(s): ${encryptedNames.join(', ') || 'none'}`);
}

function materializeRuntimeSecrets(): void {
  const directory = process.env.RUNTIME_SECRETS_DIR?.trim() || '/tmp/solar-bess-secrets';
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const secrets: ReadonlyArray<readonly [string, string]> = [
    ['postgres_user', encryptedEnvironmentValue('POSTGRES_USER')],
    ['postgres_password', encryptedEnvironmentValue('POSTGRES_PASSWORD')],
    ['database_url', encryptedEnvironmentValue('DATABASE_URL')],
    ['redis_password', encryptedEnvironmentValue('REDIS_PASSWORD', 32)]
  ];
  for (const [name, value] of secrets) {
    const target = resolve(directory, name);
    // Redis runs as a non-owner UID with the deployment group. Its secret is
    // group-readable inside the bind-mounted Docker secret, never world-readable.
    const mode = name === 'redis_password' ? 0o640 : 0o600;
    writeFileSync(target, value, { mode });
    chmodSync(target, mode);
  }
  chmodSync(directory, 0o700);
  console.log(`PostgreSQL and Redis runtime secret files are ready in ${directory}`);
}

async function run(): Promise<void> {
  const command = process.argv[2];
  if (command === 'encrypt') {
    const cipher = new CipherService(parseCipherKey(process.env.CIPHER_KEY));
    const secret = await readSecret();
    if (!secret) throw new Error('Plaintext must not be empty');
    process.stdout.write(`${cipher.encrypt(secret)}\n`);
    return;
  }
  if (command === 'migrate-env') return migrateEnvironment();
  if (command === 'materialize-runtime' || command === 'materialize-postgres') {
    return materializeRuntimeSecrets();
  }
  throw new Error('Usage: cipher.cli.ts encrypt|migrate-env|materialize-runtime');
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Cipher command failed');
  process.exitCode = 1;
});
