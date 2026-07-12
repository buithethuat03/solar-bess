import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { APP_CONFIG } from '../../config/configuration.module';
import type { AppConfig } from '../../config/environment';
import {
  AuditEventEntity, AuthenticationSessionEntity, LocalCredentialEntity,
  TenantEntity, UserAccountEntity
} from '../../database/entities';
import type { LoginDto } from './dto/login.dto';
import {
  type AuthContext, type AuthProfile, type ClientMetadata, InvalidAuthenticationError
} from './auth.types';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { PermissionService } from './permission.service';
import { OutboxService } from '../operational-foundation/outbox.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(TenantEntity) private readonly tenants: Repository<TenantEntity>,
    @InjectRepository(UserAccountEntity) private readonly users: Repository<UserAccountEntity>,
    @InjectRepository(LocalCredentialEntity) private readonly credentials: Repository<LocalCredentialEntity>,
    @InjectRepository(AuthenticationSessionEntity)
    private readonly sessions: Repository<AuthenticationSessionEntity>,
    @InjectRepository(AuditEventEntity) private readonly audits: Repository<AuditEventEntity>,
    private readonly dataSource: DataSource,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly rateLimiter: LoginRateLimitService,
    private readonly permissions: PermissionService,
    private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async login(input: LoginDto, metadata: ClientMetadata): Promise<AuthProfile> {
    const tenantCode = input.tenantCode.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();
    const identity = `${tenantCode}|${email}`;
    await this.rateLimiter.consume(metadata.ip, identity);

    const tenant = await this.tenants.findOneBy({ code: tenantCode });
    const user = tenant
      ? await this.users.findOneBy({ tenantId: tenant.id, normalizedEmail: email })
      : null;
    const credential = user
      ? await this.credentials.createQueryBuilder('credential')
        .addSelect('credential.passwordHash')
        .where('credential.tenantId = :tenantId', { tenantId: tenant!.id })
        .andWhere('credential.userAccountId = :userId', { userId: user.id })
        .getOne()
      : null;
    const validPassword = await this.passwords.verify(input.password, credential?.passwordHash ?? null);
    if (tenant?.status !== 'ACTIVE' || user?.status !== 'ACTIVE' || !credential || !validPassword) {
      await this.recordAudit(this.audits, {
        tenantId: tenant?.id ?? null, actorId: user?.id ?? null,
        action: 'AUTH_LOGIN', result: 'DENIED', reasonCode: 'INVALID_CREDENTIALS'
      }, metadata);
      throw new InvalidAuthenticationError();
    }

    const profile = await this.dataSource.transaction(async (manager) => {
      const now = new Date();
      const sessionId = randomUUID();
      const familyId = randomUUID();
      const expiresAt = new Date(now.getTime() + this.config.jwt.refreshTtlSeconds * 1_000);
      const refreshToken = await this.tokens.signRefresh(user.id, tenant.id, sessionId, expiresAt);
      const accessToken = await this.tokens.signAccess(user.id, tenant.id, sessionId);
      await manager.getRepository(AuthenticationSessionEntity).save({
        id: sessionId, tenantId: tenant.id, userAccountId: user.id, familyId,
        refreshTokenHash: this.digestToken(refreshToken), expiresAt, revokedAt: null,
        revokeReason: null, lastUsedAt: null, createdIpHash: this.hashIp(metadata.ip),
        userAgent: metadata.userAgent.slice(0, 500)
      });
      user.lastLoginAt = now;
      await manager.getRepository(UserAccountEntity).save(user);
      await this.recordAudit(manager.getRepository(AuditEventEntity), {
        tenantId: tenant.id, actorId: user.id,
        action: 'AUTH_LOGIN', result: 'SUCCESS', reasonCode: null
      }, metadata);
      await this.outbox.append(manager, {
        tenantId: tenant.id, userId: user.id, correlationId: metadata.correlationId
      }, {
        aggregateType: 'AuthenticationSession', aggregateId: sessionId,
        aggregateVersion: 1, eventType: 'AUTH_LOGIN_SUCCEEDED',
        payload: { userId: user.id, sessionId }
      });
      return this.profile(accessToken, refreshToken, user, tenant, metadata.correlationId);
    });
    await this.rateLimiter.reset(metadata.ip, identity);
    return profile;
  }

  async refresh(refreshToken: string | undefined, metadata: ClientMetadata): Promise<AuthProfile> {
    if (!refreshToken) throw new InvalidAuthenticationError();
    const claims = await this.tokens.verifyRefresh(refreshToken).catch(() => null);
    if (!claims || claims.typ !== 'refresh') throw new InvalidAuthenticationError();

    const profile = await this.dataSource.transaction(async (manager) => {
      const sessions = manager.getRepository(AuthenticationSessionEntity);
      const session = await sessions.createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :id', { id: claims.sid })
        .andWhere('session.tenantId = :tenantId', { tenantId: claims.tid })
        .andWhere('session.userAccountId = :userId', { userId: claims.sub })
        .getOne();
      const now = new Date();
      const canRotate = session
        && session.refreshTokenHash === this.digestToken(refreshToken)
        && !session.revokedAt
        && session.expiresAt > now;
      if (!canRotate) {
        if (session) {
          const revokedFamily = await sessions.createQueryBuilder().update()
            .set({ revokedAt: now, revokeReason: 'REPLAY_DETECTED' })
            .where('tenant_id = :tenantId AND family_id = :familyId AND revoked_at IS NULL', {
              tenantId: session.tenantId, familyId: session.familyId
            }).execute();
          await this.recordAudit(manager.getRepository(AuditEventEntity), {
            tenantId: session.tenantId, actorId: session.userAccountId,
            action: 'AUTH_REFRESH', result: 'DENIED', reasonCode: 'REPLAY_OR_REVOKED'
          }, metadata);
          if ((revokedFamily.affected ?? 0) > 0) {
            await this.outbox.append(manager, {
              tenantId: session.tenantId, userId: session.userAccountId,
              correlationId: metadata.correlationId
            }, {
              aggregateType: 'AuthenticationSession', aggregateId: session.id,
              aggregateVersion: 1, eventType: 'AUTH_REFRESH_REPLAY_DETECTED',
              payload: { sessionId: session.id, familyId: session.familyId }
            });
          }
        }
        return null;
      }

      const [user, tenant] = await Promise.all([
        manager.getRepository(UserAccountEntity).findOneBy({ id: claims.sub, tenantId: claims.tid }),
        manager.getRepository(TenantEntity).findOneBy({ id: claims.tid })
      ]);
      if (user?.status !== 'ACTIVE' || tenant?.status !== 'ACTIVE') {
        session.revokedAt = now;
        session.revokeReason = 'IDENTITY_DISABLED';
        await sessions.save(session);
        await this.recordAudit(manager.getRepository(AuditEventEntity), {
          tenantId: session.tenantId, actorId: session.userAccountId,
          action: 'AUTH_REFRESH', result: 'DENIED', reasonCode: 'IDENTITY_DISABLED'
        }, metadata);
        await this.outbox.append(manager, {
          tenantId: session.tenantId, userId: session.userAccountId,
          correlationId: metadata.correlationId
        }, {
          aggregateType: 'AuthenticationSession', aggregateId: session.id,
          aggregateVersion: 1, eventType: 'AUTH_SESSION_REVOKED',
          payload: { sessionId: session.id, reason: 'IDENTITY_DISABLED' }
        });
        return null;
      }

      session.revokedAt = now;
      session.revokeReason = 'ROTATED';
      session.lastUsedAt = now;
      await sessions.save(session);

      const replacementId = randomUUID();
      const replacementRefresh = await this.tokens.signRefresh(user.id, tenant.id, replacementId, session.expiresAt);
      const replacementAccess = await this.tokens.signAccess(user.id, tenant.id, replacementId);
      await sessions.save({
        id: replacementId, tenantId: tenant.id, userAccountId: user.id, familyId: session.familyId,
        refreshTokenHash: this.digestToken(replacementRefresh), expiresAt: session.expiresAt,
        revokedAt: null, revokeReason: null, lastUsedAt: null,
        createdIpHash: this.hashIp(metadata.ip), userAgent: metadata.userAgent.slice(0, 500)
      });
      await this.recordAudit(manager.getRepository(AuditEventEntity), {
        tenantId: tenant.id, actorId: user.id,
        action: 'AUTH_REFRESH', result: 'SUCCESS', reasonCode: null
      }, metadata);
      await this.outbox.append(manager, {
        tenantId: tenant.id, userId: user.id, correlationId: metadata.correlationId
      }, {
        aggregateType: 'AuthenticationSession', aggregateId: replacementId,
        aggregateVersion: 1, eventType: 'AUTH_SESSION_ROTATED',
        payload: { previousSessionId: session.id, sessionId: replacementId, familyId: session.familyId }
      });
      return this.profile(replacementAccess, replacementRefresh, user, tenant, metadata.correlationId);
    });
    if (!profile) throw new InvalidAuthenticationError();
    return profile;
  }

  async logout(refreshToken: string | undefined, metadata: ClientMetadata): Promise<void> {
    if (!refreshToken) return;
    const claims = await this.tokens.verifyRefresh(refreshToken, true).catch(() => null);
    if (!claims || claims.typ !== 'refresh') return;
    await this.dataSource.transaction(async (manager) => {
      const sessions = manager.getRepository(AuthenticationSessionEntity);
      const session = await sessions.createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :id', { id: claims.sid })
        .andWhere('session.tenantId = :tenantId', { tenantId: claims.tid })
        .andWhere('session.userAccountId = :userId', { userId: claims.sub })
        .getOne();
      if (session && session.refreshTokenHash === this.digestToken(refreshToken) && !session.revokedAt) {
        session.revokedAt = new Date();
        session.revokeReason = 'LOGOUT';
        await sessions.save(session);
        await this.recordAudit(manager.getRepository(AuditEventEntity), {
          tenantId: claims.tid, actorId: claims.sub,
          action: 'AUTH_LOGOUT', result: 'SUCCESS', reasonCode: null
        }, metadata);
        await this.outbox.append(manager, {
          tenantId: claims.tid, userId: claims.sub, correlationId: metadata.correlationId
        }, {
          aggregateType: 'AuthenticationSession', aggregateId: session.id,
          aggregateVersion: 1, eventType: 'AUTH_SESSION_LOGGED_OUT',
          payload: { sessionId: session.id }
        });
      }
    });
  }

  async validateAccess(token: string): Promise<AuthContext> {
    const claims = await this.tokens.verifyAccess(token).catch(() => null);
    if (!claims || claims.typ !== 'access') throw new InvalidAuthenticationError();
    const [user, tenant, session] = await Promise.all([
      this.users.findOneBy({ id: claims.sub, tenantId: claims.tid }),
      this.tenants.findOneBy({ id: claims.tid }),
      this.sessions.findOneBy({
        id: claims.sid, tenantId: claims.tid, userAccountId: claims.sub
      })
    ]);
    if (
      user?.status !== 'ACTIVE'
      || tenant?.status !== 'ACTIVE'
      || !session
      || session.revokedAt !== null
      || session.expiresAt <= new Date()
    ) throw new InvalidAuthenticationError();
    return { userId: claims.sub, tenantId: claims.tid, sessionId: claims.sid };
  }

  async currentIdentity(context: AuthContext, correlationId: string) {
    const [user, tenant] = await Promise.all([
      this.users.findOneBy({ id: context.userId, tenantId: context.tenantId }),
      this.tenants.findOneBy({ id: context.tenantId })
    ]);
    if (!user || !tenant) throw new InvalidAuthenticationError();
    const access = await this.permissions.identityPermissions(context);
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      ...access, correlationId
    };
  }

  private profile(
    accessToken: string, refreshToken: string, user: UserAccountEntity,
    tenant: TenantEntity, correlationId: string
  ): AuthProfile {
    return {
      accessToken, refreshToken, tokenType: 'Bearer', expiresIn: this.config.jwt.accessTtlSeconds,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name }, correlationId
    };
  }

  private digestToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private hashIp(value: string): string {
    return createHmac('sha256', this.config.auth.rateLimitHashSecret).update(value).digest('hex');
  }

  private async recordAudit(
    repository: Repository<AuditEventEntity>,
    event: Pick<AuditEventEntity, 'tenantId' | 'actorId' | 'action' | 'result' | 'reasonCode'>,
    metadata: ClientMetadata
  ): Promise<void> {
    await repository.save({
      id: randomUUID(), ...event,
      correlationId: metadata.correlationId,
      ipHash: this.hashIp(metadata.ip)
    });
  }
}
