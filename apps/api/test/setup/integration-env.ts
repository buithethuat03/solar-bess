import { randomBytes } from 'node:crypto';
import { CipherService } from 'src/modules/cipher/cipher.service';

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://solar_bess_test:solar_bess_test@127.0.0.1:5433/solar_bess_test';
const key = randomBytes(32);
const cipher = new CipherService(key);
process.env.CIPHER_KEY = key.toString('base64');
process.env.DATABASE_URL = cipher.encrypt(databaseUrl);
process.env.JWT_ACCESS_SECRET = cipher.encrypt('test-access-secret-at-least-thirty-two-characters');
process.env.JWT_REFRESH_SECRET = cipher.encrypt('test-refresh-secret-at-least-thirty-two-characters');
process.env.REDIS_PASSWORD = cipher.encrypt(
  process.env.TEST_REDIS_PASSWORD ?? 'solar-bess-redis-integration-test-password'
);
process.env.RATE_LIMIT_HASH_SECRET = cipher.encrypt('test-rate-limit-hash-secret-at-least-thirty-two');
// The ADR-005 document adapters are constructed whenever the application module boots, so the
// integration environment has to configure them even for the suites that never touch a document.
// The HTTP suites bind in-memory fakes to the two ports; only the live-adapter suite talks to the
// containers, and it relies on these credentials matching `minio-test` in docker-compose.test.yml.
process.env.MINIO_ACCESS_KEY = cipher.encrypt('solar-bess-test-minio-access-key');
process.env.MINIO_SECRET_KEY = cipher.encrypt('solar-bess-test-minio-secret-key-thirty-two-chars');
process.env.MINIO_ENDPOINT ??= `http://127.0.0.1:${process.env.TEST_MINIO_HOST_PORT ?? '9002'}`;
process.env.CLAMAV_HOST ??= '127.0.0.1';
process.env.CLAMAV_PORT ??= process.env.TEST_CLAMAV_HOST_PORT ?? '3311';
process.env.REDIS_HOST ??= '127.0.0.1';
process.env.REDIS_PORT ??= '6380';
process.env.REDIS_DATABASE ??= '0';
process.env.REDIS_KEY_PREFIX ??= 'solar-bess-test';
process.env.JWT_ISSUER ??= 'solar-bess-api-test';
process.env.JWT_AUDIENCE ??= 'solar-bess-web-test';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '5';
process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '60';
process.env.SWAGGER_ENABLED = 'true';
