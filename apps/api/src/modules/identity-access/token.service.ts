import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import type { VerifiedTokenClaims } from './auth.types';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  signAccess(userId: string, tenantId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, tid: tenantId, sid: sessionId, jti: randomUUID(), typ: 'access' },
      {
        secret: this.config.jwt.accessSecret,
        expiresIn: this.config.jwt.accessTtlSeconds,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience
      }
    );
  }

  signRefresh(userId: string, tenantId: string, sessionId: string, expiresAt: Date): Promise<string> {
    const seconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return this.jwt.signAsync(
      { sub: userId, tid: tenantId, sid: sessionId, jti: randomUUID(), typ: 'refresh' },
      {
        secret: this.config.jwt.refreshSecret, expiresIn: seconds,
        issuer: this.config.jwt.issuer, audience: this.config.jwt.audience
      }
    );
  }

  verifyAccess(token: string): Promise<VerifiedTokenClaims> {
    return this.jwt.verifyAsync(token, {
      secret: this.config.jwt.accessSecret,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience
    });
  }

  verifyRefresh(token: string, ignoreExpiration = false): Promise<VerifiedTokenClaims> {
    return this.jwt.verifyAsync(token, {
      secret: this.config.jwt.refreshSecret,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
      ignoreExpiration
    });
  }
}
