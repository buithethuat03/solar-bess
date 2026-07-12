import type { AppConfig } from 'src/config/environment';
import { LoginRateLimitService } from 'src/modules/identity-access/login-rate-limit.service';
import type { RedisService } from 'src/modules/operational-foundation/redis.service';

const config = {
  auth: {
    rateLimitMaxAttempts: 3, rateLimitWindowMs: 2_000,
    rateLimitHashSecret: 'rate-limit-secret-at-least-thirty-two'
  }
} as AppConfig;

function redisDouble() {
  let count = 0;
  return {
    prefixedKey: (suffix: string) => `test:${suffix}`,
    evaluateInteger: jest.fn(async () => {
      count += 1;
      return count;
    }),
    delete: jest.fn(async () => { count = 0; })
  } as unknown as RedisService;
}

describe('LoginRateLimitService — TEST-231', () => {
  it('uses the injected max-attempt setting', async () => {
    const rateLimiter = new LoginRateLimitService(config, redisDouble());
    for (let index = 0; index < 3; index += 1) {
      await expect(rateLimiter.consume('ip', 'identity')).resolves.toBeUndefined();
    }
    await expect(rateLimiter.consume('ip', 'identity')).rejects.toThrow();
  });

  it('passes the configured TTL and supports reset after success', async () => {
    const redis = redisDouble();
    const rateLimiter = new LoginRateLimitService(config, redis);
    await rateLimiter.consume('ip', 'identity');
    expect(redis.evaluateInteger).toHaveBeenCalledWith(
      expect.any(String), [expect.stringMatching(/^test:auth:login:/)], [2_000]
    );
    await rateLimiter.reset('ip', 'identity');
    await expect(rateLimiter.consume('ip', 'identity')).resolves.toBeUndefined();
  });

  it('fails closed when Redis is unavailable', async () => {
    const redis = redisDouble();
    jest.spyOn(redis, 'evaluateInteger').mockRejectedValueOnce(new Error('offline'));
    const rateLimiter = new LoginRateLimitService(config, redis);
    await expect(rateLimiter.consume('ip', 'identity')).rejects.toMatchObject({ status: 503 });
  });
});
