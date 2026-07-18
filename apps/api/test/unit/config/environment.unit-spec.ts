import { randomBytes } from 'node:crypto';
import { loadAppConfig } from 'src/config/environment';
import { CipherService } from 'src/modules/cipher/cipher.service';

const names = [
  'CIPHER_KEY', 'DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'REDIS_PASSWORD', 'RATE_LIMIT_HASH_SECRET', 'REDIS_HOST', 'REDIS_PORT',
  'AUTH_RATE_LIMIT_MAX_ATTEMPTS', 'AUTH_RATE_LIMIT_WINDOW_SECONDS', 'DATABASE_HOST_OVERRIDE',
  'SCHEDULE_NEAR_CRITICAL_FLOAT_DAYS', 'SCHEDULE_DEFAULT_LOOKAHEAD_DAYS',
  'SCHEDULE_IMPORT_MAX_ROWS', 'SCHEDULE_MAX_ABS_LAG_DAYS',
  'RISK_HIGH_EXPOSURE_THRESHOLD', 'RISK_CRITICAL_EXPOSURE_THRESHOLD',
  'RISK_CHANGE_ALERT_SCAN_INTERVAL_MS', 'RISK_CHANGE_THRESHOLD_VERSION', 'SWAGGER_ENABLED'
] as const;
const original = new Map(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configure(): void {
  const key = randomBytes(32);
  const cipher = new CipherService(key);
  process.env.CIPHER_KEY = key.toString('base64');
  process.env.DATABASE_URL = cipher.encrypt('postgresql://user:password@localhost/database');
  process.env.JWT_ACCESS_SECRET = cipher.encrypt('a'.repeat(32));
  process.env.JWT_REFRESH_SECRET = cipher.encrypt('b'.repeat(32));
  process.env.REDIS_PASSWORD = cipher.encrypt('redis-test-password-at-least-thirty-two');
  process.env.RATE_LIMIT_HASH_SECRET = cipher.encrypt('r'.repeat(32));
  process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '7';
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '42';
  process.env.SCHEDULE_IMPORT_MAX_ROWS = '5000';
  process.env.RISK_HIGH_EXPOSURE_THRESHOLD = '15';
  process.env.RISK_CRITICAL_EXPOSURE_THRESHOLD = '20';
  process.env.RISK_CHANGE_ALERT_SCAN_INTERVAL_MS = '60000';
  process.env.RISK_CHANGE_THRESHOLD_VERSION = 'RISK_CHANGE_THRESHOLDS_V1';
}

describe('typed encrypted environment — SEC-117/SEC-118', () => {
  it('decrypts credentials and injects validated rate-limit settings', () => {
    configure();
    const config = loadAppConfig();
    expect(config.database.url).toContain('postgresql://');
    expect(config.jwt.accessSecret).toBe('a'.repeat(32));
    expect(config.redis.password).toBe('redis-test-password-at-least-thirty-two');
    expect(config.auth.rateLimitHashSecret).toBe('r'.repeat(32));
    expect(config.auth.rateLimitMaxAttempts).toBe(7);
    expect(config.auth.rateLimitWindowMs).toBe(42_000);
    expect(config.app.swaggerEnabled).toBe(false);
    expect(config.schedule).toMatchObject({
      nearCriticalFloatDays: 5,
      defaultLookAheadDays: 21,
      importMaxRows: 5_000,
      maxAbsoluteLagDays: 3_650,
      calculationVersion: 'SPI_WEIGHTED_LINEAR_V1'
    });
    expect(config.riskChange).toEqual({
      highExposureThreshold: 15,
      criticalExposureThreshold: 20,
      alertScanIntervalMs: 60_000,
      scoringVersion: 'RISK_SCORING_5X5_MAX_V1',
      thresholdVersion: 'RISK_CHANGE_THRESHOLDS_V1'
    });
  });

  it('fails closed for plaintext credentials and out-of-range settings', () => {
    configure();
    process.env.JWT_ACCESS_SECRET = 'plaintext-is-forbidden';
    expect(() => loadAppConfig()).toThrow('JWT_ACCESS_SECRET must be encrypted');
    configure();
    process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '0';
    expect(() => loadAppConfig()).toThrow('AUTH_RATE_LIMIT_MAX_ATTEMPTS must be an integer');
    configure();
    process.env.SCHEDULE_IMPORT_MAX_ROWS = '20001';
    expect(() => loadAppConfig()).toThrow('SCHEDULE_IMPORT_MAX_ROWS must be an integer');
    configure();
    process.env.RISK_HIGH_EXPOSURE_THRESHOLD = '20';
    process.env.RISK_CRITICAL_EXPOSURE_THRESHOLD = '20';
    expect(() => loadAppConfig()).toThrow('RISK_HIGH_EXPOSURE_THRESHOLD must be lower');
    configure();
    process.env.RISK_CHANGE_THRESHOLD_VERSION = 'unsafe-version';
    expect(() => loadAppConfig()).toThrow('RISK_CHANGE_THRESHOLD_VERSION must contain');
    configure();
    process.env.SWAGGER_ENABLED = 'yes';
    expect(() => loadAppConfig()).toThrow('SWAGGER_ENABLED must be true or false');
  });

  it('allows a validated non-secret host override for container topology', () => {
    configure();
    process.env.DATABASE_HOST_OVERRIDE = 'postgres';
    expect(new URL(loadAppConfig().database.url).hostname).toBe('postgres');
    process.env.DATABASE_HOST_OVERRIDE = 'postgres/unsafe';
    expect(() => loadAppConfig()).toThrow('DATABASE_HOST_OVERRIDE must be a hostname');
  });
});
