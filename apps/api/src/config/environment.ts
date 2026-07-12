import { config as loadDotEnvironment } from 'dotenv';
import { resolve } from 'node:path';
import { CipherService, parseCipherKey } from '../modules/cipher/cipher.service';

loadDotEnvironment({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true
});

export interface AppConfig {
  app: { port: number; trustProxyHops: number };
  database: { url: string };
  redis: {
    host: string;
    port: number;
    password: string;
    database: number;
    connectTimeoutMs: number;
    keyPrefix: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    issuer: string;
    audience: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  };
  auth: {
    rateLimitMaxAttempts: number;
    rateLimitWindowMs: number;
    rateLimitHashSecret: string;
    argonMemoryCost: number;
    argonTimeCost: number;
    argonParallelism: number;
  };
  cookie: {
    name: string;
    path: string;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
  };
  operational: {
    commandReceiptRetentionMs: number;
  };
  schedule: {
    nearCriticalFloatDays: number;
    defaultLookAheadDays: number;
    importMaxRows: number;
    maxAbsoluteLagDays: number;
    calculationVersion: string;
    thresholdVersion: string;
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integer(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function sameSite(): 'lax' | 'strict' | 'none' {
  const value = process.env.COOKIE_SAME_SITE?.trim() ?? 'lax';
  if (value === 'lax' || value === 'strict' || value === 'none') return value;
  throw new Error('COOKIE_SAME_SITE must be lax, strict or none');
}

function hostname(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) {
    throw new Error(`${name} must be a hostname without credentials or path`);
  }
  return value;
}

function keyPrefix(): string {
  const value = process.env.REDIS_KEY_PREFIX?.trim() || 'solar-bess';
  if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(value)) {
    throw new Error('REDIS_KEY_PREFIX must contain 1 to 64 safe characters');
  }
  return value;
}

function environmentCipher(): CipherService {
  return new CipherService(parseCipherKey(process.env.CIPHER_KEY));
}

export function encryptedEnvironmentValue(name: string, minimumLength = 1): string {
  const encrypted = required(name);
  const cipher = environmentCipher();
  if (!cipher.isEncrypted(encrypted)) throw new Error(`${name} must be encrypted with enc:v1 envelope`);
  const value = cipher.decrypt(encrypted);
  if (value.length < minimumLength) throw new Error(`${name} decrypted value is too short`);
  return value;
}

export function loadDatabaseConfig(): AppConfig['database'] {
  const decrypted = encryptedEnvironmentValue('DATABASE_URL');
  const hostOverride = process.env.DATABASE_HOST_OVERRIDE?.trim();
  if (!hostOverride) return { url: decrypted };
  if (!/^[a-zA-Z0-9.-]+$/.test(hostOverride)) {
    throw new Error('DATABASE_HOST_OVERRIDE must be a hostname without credentials or path');
  }
  const url = new URL(decrypted);
  url.hostname = hostOverride;
  return { url: url.toString() };
}

export function loadAppConfig(): AppConfig {
  const accessTtlSeconds = integer('JWT_ACCESS_TTL_SECONDS', 900, 60, 86_400);
  const refreshTtlSeconds = integer('JWT_REFRESH_TTL_SECONDS', 604_800, 300, 31_536_000);
  return {
    app: {
      port: integer('APP_PORT', 3000, 1, 65_535),
      trustProxyHops: integer('TRUST_PROXY_HOPS', 1, 0, 10)
    },
    database: loadDatabaseConfig(),
    redis: {
      host: hostname('REDIS_HOST', '127.0.0.1'),
      port: integer('REDIS_PORT', 6379, 1, 65_535),
      password: encryptedEnvironmentValue('REDIS_PASSWORD', 32),
      database: integer('REDIS_DATABASE', 0, 0, 15),
      connectTimeoutMs: integer('REDIS_CONNECT_TIMEOUT_MS', 2_000, 100, 30_000),
      keyPrefix: keyPrefix()
    },
    jwt: {
      accessSecret: encryptedEnvironmentValue('JWT_ACCESS_SECRET', 32),
      refreshSecret: encryptedEnvironmentValue('JWT_REFRESH_SECRET', 32),
      issuer: process.env.JWT_ISSUER?.trim() || 'solar-bess-api',
      audience: process.env.JWT_AUDIENCE?.trim() || 'solar-bess-web',
      accessTtlSeconds,
      refreshTtlSeconds
    },
    auth: {
      rateLimitMaxAttempts: integer('AUTH_RATE_LIMIT_MAX_ATTEMPTS', 5, 1, 1_000),
      rateLimitWindowMs: integer('AUTH_RATE_LIMIT_WINDOW_SECONDS', 60, 1, 86_400) * 1_000,
      rateLimitHashSecret: encryptedEnvironmentValue('RATE_LIMIT_HASH_SECRET', 32),
      argonMemoryCost: integer('ARGON2_MEMORY_COST', 19_456, 8 * 1_024, 1_048_576),
      argonTimeCost: integer('ARGON2_TIME_COST', 2, 1, 10),
      argonParallelism: integer('ARGON2_PARALLELISM', 1, 1, 16)
    },
    cookie: {
      name: process.env.COOKIE_NAME?.trim() || 'refresh_token',
      path: process.env.COOKIE_PATH?.trim() || '/v1/auth',
      secure: boolean('COOKIE_SECURE', false),
      sameSite: sameSite()
    },
    operational: {
      commandReceiptRetentionMs: integer(
        'COMMAND_RECEIPT_RETENTION_HOURS', 24, 1, 24 * 90
      ) * 60 * 60 * 1_000
    },
    schedule: {
      nearCriticalFloatDays: integer('SCHEDULE_NEAR_CRITICAL_FLOAT_DAYS', 5, 0, 30),
      defaultLookAheadDays: integer('SCHEDULE_DEFAULT_LOOKAHEAD_DAYS', 21, 1, 180),
      importMaxRows: integer('SCHEDULE_IMPORT_MAX_ROWS', 5_000, 1, 20_000),
      maxAbsoluteLagDays: integer('SCHEDULE_MAX_ABS_LAG_DAYS', 3_650, 0, 3_650),
      calculationVersion: 'SPI_WEIGHTED_LINEAR_V1',
      thresholdVersion: 'SCHEDULE_THRESHOLDS_V1'
    }
  };
}
