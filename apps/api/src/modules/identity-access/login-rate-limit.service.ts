import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import { RedisService } from '../operational-foundation/redis.service';
import { AuthenticationRateLimitedError } from './auth.types';

const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
elseif redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`;

@Injectable()
export class LoginRateLimitService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly redis: RedisService
  ) {}

  private key(ip: string, identity: string): string {
    const digest = createHmac('sha256', this.config.auth.rateLimitHashSecret)
      .update(`${ip}|${identity}`).digest('hex');
    return this.redis.prefixedKey(`auth:login:${digest}`);
  }

  async consume(ip: string, identity: string): Promise<void> {
    const key = this.key(ip, identity);
    const count = await this.redis.evaluateInteger(
      CONSUME_SCRIPT, [key], [this.config.auth.rateLimitWindowMs]
    ).catch(() => {
      throw new ServiceUnavailableException({
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        message: 'Dịch vụ bảo vệ đăng nhập tạm thời không sẵn sàng',
        retryable: true
      });
    });
    if (count > this.config.auth.rateLimitMaxAttempts) {
      throw new AuthenticationRateLimitedError();
    }
  }

  async reset(ip: string, identity: string): Promise<void> {
    await this.redis.delete(this.key(ip, identity)).catch(() => undefined);
  }
}
