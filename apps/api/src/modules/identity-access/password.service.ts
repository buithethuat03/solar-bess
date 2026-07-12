import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomUUID());
  }

  hash(password: string): Promise<string> {
    return hash(password, {
      type: 2,
      memoryCost: this.config.auth.argonMemoryCost,
      timeCost: this.config.auth.argonTimeCost,
      parallelism: this.config.auth.argonParallelism
    });
  }

  verify(password: string, storedHash: string | null): Promise<boolean> {
    return verify(storedHash ?? this.dummyHash, password).catch(() => false);
  }
}
