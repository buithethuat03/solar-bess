import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: Redis;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.database,
      lazyConnect: true,
      connectTimeout: config.redis.connectTimeoutMs,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt: number) => Math.min(attempt * 250, 5_000)
    });
    this.client.on('error', () => undefined);
  }

  onModuleInit(): void {
    if (this.client.status === 'wait') {
      void this.client.connect().catch(() => undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === 'end') return;
    await this.client.quit().catch(() => this.client.disconnect());
  }

  prefixedKey(suffix: string): string {
    return `${this.config.redis.keyPrefix}:${suffix}`;
  }

  async evaluateInteger(script: string, keys: string[], arguments_: Array<string | number>): Promise<number> {
    const result = await this.client.eval(
      script, keys.length, ...keys, ...arguments_.map((value) => String(value))
    );
    const parsed = Number(result);
    if (!Number.isFinite(parsed)) throw new Error('Redis script returned a non-numeric result');
    return parsed;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<'PONG'> {
    return this.client.ping() as Promise<'PONG'>;
  }
}
