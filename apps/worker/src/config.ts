import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';

export interface WorkerConfig {
  workerId: string;
  database: {
    url: string;
    poolSize: number;
    connectionTimeoutMs: number;
    queryTimeoutMs: number;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    database: number;
    connectTimeoutMs: number;
  };
  queue: {
    name: string;
    deadLetterName: string;
    prefix: string;
    consumerAttempts: number;
    consumerBackoffMs: number;
    consumerConcurrency: number;
    lockDurationMs: number;
  };
  relay: {
    pollIntervalMs: number;
    batchSize: number;
    leaseMs: number;
    maxAttempts: number;
    retryBackoffMs: number;
    publishTimeoutMs: number;
  };
  consumption: {
    consumerName: string;
    handlerVersion: string;
    leaseMs: number;
  };
  schedule: {
    nearCriticalFloatDays: number;
    alertScanIntervalMs: number;
    thresholdVersion: string;
  };
  riskChange: {
    highExposureThreshold: number;
    criticalExposureThreshold: number;
    alertScanIntervalMs: number;
    thresholdVersion: string;
  };
  health: { host: string; port: number };
  shutdownTimeoutMs: number;
}

type Environment = Record<string, string | undefined>;
type SecretReader = (path: string) => string;

function requiredSecret(
  env: Environment,
  fileVariable: string,
  fallbackPath: string,
  minimumLength: number,
  readSecret: SecretReader
): string {
  const path = env[fileVariable]?.trim() || fallbackPath;
  const value = readSecret(path).replace(/[\r\n]+$/, '');
  if (value.length < minimumLength) throw new Error(`${fileVariable} secret is too short`);
  return value;
}

function integer(
  env: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function safeName(env: Environment, name: string, fallback: string, maximum = 100): string {
  const value = env[name]?.trim() || fallback;
  if (!new RegExp(`^[a-zA-Z0-9._-]{1,${maximum}}$`).test(value)) {
    throw new Error(`${name} must contain only safe name characters`);
  }
  return value;
}

function policyVersion(env: Environment, name: string, fallback: string): string {
  const value = env[name]?.trim() || fallback;
  if (!/^[A-Z][A-Z0-9_]{2,99}$/.test(value)) {
    throw new Error(`${name} must contain 3 to 100 uppercase letters, digits or underscores`);
  }
  return value;
}

function host(env: Environment, name: string, fallback: string): string {
  const value = env[name]?.trim() || fallback;
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) throw new Error(`${name} must be a hostname`);
  return value;
}

function databaseUrl(env: Environment, readSecret: SecretReader): string {
  const raw = requiredSecret(
    env,
    'WORKER_DATABASE_URL_FILE',
    '/run/secrets/database_url',
    12,
    readSecret
  );
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('WORKER_DATABASE_URL_FILE must contain a PostgreSQL URL');
  }
  const hostOverride = env.WORKER_DATABASE_HOST_OVERRIDE?.trim();
  if (hostOverride) parsed.hostname = host(env, 'WORKER_DATABASE_HOST_OVERRIDE', hostOverride);
  const portOverride = env.WORKER_DATABASE_PORT_OVERRIDE?.trim();
  if (portOverride) {
    parsed.port = String(integer(env, 'WORKER_DATABASE_PORT_OVERRIDE', 5432, 1, 65_535));
  }
  const databaseOverride = env.WORKER_DATABASE_NAME_OVERRIDE?.trim();
  if (databaseOverride) {
    if (!/^[a-zA-Z0-9_-]{1,63}$/.test(databaseOverride)) {
      throw new Error('WORKER_DATABASE_NAME_OVERRIDE must be a safe database name');
    }
    parsed.pathname = `/${databaseOverride}`;
  }
  return parsed.toString();
}

export function loadWorkerConfig(
  env: Environment = process.env,
  readSecret: SecretReader = (path) => readFileSync(path, 'utf8')
): WorkerConfig {
  if (env.DATABASE_URL || env.REDIS_PASSWORD) {
    throw new Error('Worker credentials must be mounted as secret files, not environment values');
  }
  const queueName = safeName(env, 'WORKER_QUEUE_NAME', 'domain-events');
  const highExposureThreshold = integer(
    env, 'RISK_HIGH_EXPOSURE_THRESHOLD', 15, 1, 24
  );
  const criticalExposureThreshold = integer(
    env, 'RISK_CRITICAL_EXPOSURE_THRESHOLD', 20, 2, 25
  );
  if (highExposureThreshold >= criticalExposureThreshold) {
    throw new Error(
      'RISK_HIGH_EXPOSURE_THRESHOLD must be lower than RISK_CRITICAL_EXPOSURE_THRESHOLD'
    );
  }
  return {
    workerId: safeName(env, 'WORKER_ID', `${hostname()}-${process.pid}`),
    database: {
      url: databaseUrl(env, readSecret),
      poolSize: integer(env, 'WORKER_DATABASE_POOL_SIZE', 5, 1, 50),
      connectionTimeoutMs: integer(env, 'WORKER_DATABASE_CONNECT_TIMEOUT_MS', 3_000, 100, 30_000),
      queryTimeoutMs: integer(env, 'WORKER_DATABASE_QUERY_TIMEOUT_MS', 10_000, 500, 60_000)
    },
    redis: {
      host: host(env, 'WORKER_REDIS_HOST', 'redis'),
      port: integer(env, 'WORKER_REDIS_PORT', 6379, 1, 65_535),
      password: requiredSecret(
        env,
        'WORKER_REDIS_PASSWORD_FILE',
        '/run/secrets/redis_password',
        32,
        readSecret
      ),
      database: integer(env, 'WORKER_REDIS_DATABASE', 0, 0, 15),
      connectTimeoutMs: integer(env, 'WORKER_REDIS_CONNECT_TIMEOUT_MS', 2_000, 100, 30_000)
    },
    queue: {
      name: queueName,
      deadLetterName: safeName(env, 'WORKER_DLQ_NAME', `${queueName}-dlq`),
      prefix: safeName(env, 'WORKER_QUEUE_PREFIX', 'solar-bess', 64),
      consumerAttempts: integer(env, 'WORKER_CONSUMER_ATTEMPTS', 5, 1, 20),
      consumerBackoffMs: integer(env, 'WORKER_CONSUMER_BACKOFF_MS', 1_000, 100, 300_000),
      consumerConcurrency: integer(env, 'WORKER_CONCURRENCY', 4, 1, 50),
      lockDurationMs: integer(env, 'WORKER_JOB_LOCK_MS', 30_000, 5_000, 600_000)
    },
    relay: {
      pollIntervalMs: integer(env, 'OUTBOX_POLL_INTERVAL_MS', 1_000, 100, 60_000),
      batchSize: integer(env, 'OUTBOX_BATCH_SIZE', 25, 1, 100),
      leaseMs: integer(env, 'OUTBOX_LEASE_MS', 30_000, 1_000, 600_000),
      maxAttempts: integer(env, 'OUTBOX_MAX_ATTEMPTS', 10, 1, 100),
      retryBackoffMs: integer(env, 'OUTBOX_RETRY_BACKOFF_MS', 2_000, 100, 300_000),
      publishTimeoutMs: integer(env, 'OUTBOX_PUBLISH_TIMEOUT_MS', 5_000, 100, 60_000)
    },
    consumption: {
      consumerName: safeName(env, 'WORKER_CONSUMER_NAME', 'foundation-event-ledger-v1', 120),
      handlerVersion: safeName(env, 'WORKER_HANDLER_VERSION', '1.0.0', 64),
      leaseMs: integer(env, 'WORKER_CONSUMPTION_LEASE_MS', 60_000, 1_000, 600_000)
    },
    schedule: {
      nearCriticalFloatDays: integer(env, 'SCHEDULE_NEAR_CRITICAL_FLOAT_DAYS', 5, 0, 30),
      alertScanIntervalMs: integer(env, 'SCHEDULE_ALERT_SCAN_INTERVAL_MS', 60_000, 1_000, 86_400_000),
      thresholdVersion: safeName(env, 'SCHEDULE_THRESHOLD_VERSION', 'SCHEDULE_THRESHOLDS_V1', 100)
    },
    riskChange: {
      highExposureThreshold,
      criticalExposureThreshold,
      alertScanIntervalMs: integer(
        env, 'RISK_CHANGE_ALERT_SCAN_INTERVAL_MS', 60_000, 1_000, 86_400_000
      ),
      thresholdVersion: policyVersion(
        env, 'RISK_CHANGE_THRESHOLD_VERSION', 'RISK_CHANGE_THRESHOLDS_V1'
      )
    },
    health: {
      host: host(env, 'WORKER_HEALTH_HOST', '0.0.0.0'),
      port: integer(env, 'WORKER_HEALTH_PORT', 3001, 1, 65_535)
    },
    shutdownTimeoutMs: integer(env, 'WORKER_SHUTDOWN_TIMEOUT_MS', 30_000, 1_000, 300_000)
  };
}
