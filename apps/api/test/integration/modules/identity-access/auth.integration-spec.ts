import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import { loadAppConfig } from 'src/config/environment';
import { LocalCredentialEntity, TenantEntity, UserAccountEntity } from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';
import { load } from 'js-yaml';
import type { OpenAPIObject } from '@nestjs/swagger';
import { countOpenApiOperations } from 'src/openapi/swagger';

const tenantId = randomUUID();
const userId = randomUUID();
const password = 'Integration!Password2026';

jest.setTimeout(30_000);

function cookieFrom(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Expected Set-Cookie');
  return value.split(';')[0];
}

describe('Auth API integration — TEST-230…233', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    await runTestMigrations();
    app = await createApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE audit_events, authentication_sessions, local_credentials, user_accounts, tenants CASCADE');
    await dataSource.getRepository(TenantEntity).save({ id: tenantId, code: 'demo', name: 'Demo Tenant', status: 'ACTIVE' });
    await dataSource.getRepository(UserAccountEntity).save({
      id: userId, tenantId, email: 'admin@example.test', normalizedEmail: 'admin@example.test',
      displayName: 'Admin Test', status: 'ACTIVE', lastLoginAt: null
    });
    await dataSource.getRepository(LocalCredentialEntity).save({
      id: randomUUID(), tenantId, userAccountId: userId,
      passwordHash: await hash(password), algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('TEST-230: logs in and reads current tenant identity', async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'demo', email: 'admin@example.test', password
    }).expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.refreshToken).toBeUndefined();
    expect(cookieFrom(login)).toContain('refresh_token=');

    const me = await request(app.getHttpServer()).get('/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(200);
    expect(me.body.user.email).toBe('admin@example.test');
    expect(me.body.tenant.id).toBe(tenantId);
    const [event] = await dataSource.query<Array<{ event_type: string; actor_id: string }>>(
      `SELECT event_type, actor_id FROM transactional_outbox_events
       WHERE tenant_id = $1 AND event_type = 'AUTH_LOGIN_SUCCEEDED'`,
      [tenantId]
    );
    expect(event).toEqual({ event_type: 'AUTH_LOGIN_SUCCEEDED', actor_id: userId });
    const [ipEvidence] = await dataSource.query<Array<{
      session_ip: string;
      audit_ip: string;
    }>>(
      `SELECT session.created_ip_hash AS session_ip, audit.ip_hash AS audit_ip
       FROM authentication_sessions session
       JOIN audit_events audit
         ON audit.tenant_id = session.tenant_id AND audit.action = 'AUTH_LOGIN'
        AND audit.result = 'SUCCESS'
       WHERE session.tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    expect(ipEvidence.session_ip).toMatch(/^[0-9a-f]{64}$/);
    expect(ipEvidence.audit_ip).toBe(ipEvidence.session_ip);
    expect(ipEvidence.session_ip).not.toContain('127.0.0.1');
  });

  it('TEST-197/NFR-024: separates implemented Swagger from the complete design contract', async () => {
    const page = await request(app.getHttpServer()).get('/api/docs/').expect(200)
      .expect('Content-Type', /text\/html/);
    expect(page.text).toContain('Solar & BESS Implemented API Documentation');

    await request(app.getHttpServer()).get('/api/docs/swagger-ui.css').expect(200)
      .expect('Content-Type', /text\/css/);
    await request(app.getHttpServer()).get('/api/docs/swagger-ui-init.js').expect(200)
      .expect('Content-Type', /javascript/);
    const specification = await request(app.getHttpServer()).get('/api/docs/openapi.yaml').expect(200)
      .expect('Content-Type', /yaml/);
    const implemented = load(specification.text) as OpenAPIObject;
    expect(implemented.openapi).toBe('3.1.0');
    expect(implemented.paths['/v1/auth/login']).toBeDefined();
    expect(implemented.paths['/v1/me/permissions']).toBeUndefined();
    expect(countOpenApiOperations(implemented)).toBe(51);

    const designPage = await request(app.getHttpServer()).get('/api/design-docs/').expect(200)
      .expect('Content-Type', /text\/html/);
    expect(designPage.text).toContain('Solar & BESS API Design Documentation');
    await request(app.getHttpServer()).get('/api/design-docs/swagger-ui.css').expect(200)
      .expect('Content-Type', /text\/css/);
    await request(app.getHttpServer()).get('/api/design-docs/swagger-ui-init.js').expect(200)
      .expect('Content-Type', /javascript/);
    const designSpecification = await request(app.getHttpServer())
      .get('/api/design-docs/openapi.yaml').expect(200).expect('Content-Type', /yaml/);
    expect(countOpenApiOperations(load(designSpecification.text) as OpenAPIObject)).toBe(164);
  });

  it('TEST-231: returns generic denial and creates no session', async () => {
    const denied = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'demo', email: 'admin@example.test', password: 'wrong-password'
    }).expect(401);
    expect(denied.body.message).toBe('Thông tin đăng nhập không hợp lệ');
    expect(await dataSource.getRepository('authentication_sessions').count()).toBe(0);
  });

  it('TEST-231: enforces the shared Redis TTL attempt limit', async () => {
    const payload = {
      tenantCode: 'demo', email: `unknown-${randomUUID()}@example.test`, password: 'wrong-password'
    };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer()).post('/v1/auth/login').send(payload).expect(401);
    }
    const limited = await request(app.getHttpServer()).post('/v1/auth/login').send(payload).expect(429);
    expect(limited.body.message).toBe('Thử lại sau');
  });

  it('TEST-231/SEC-101: stores an Argon2id hash rather than the raw password', async () => {
    const [result] = await dataSource.query<Array<{ is_argon2id: boolean; is_raw: boolean }>>(
      'SELECT password_hash LIKE $1 AS is_argon2id, password_hash = $2 AS is_raw FROM local_credentials LIMIT 1',
      ['$argon2id$%', password]
    );
    expect(result).toEqual({ is_argon2id: true, is_raw: false });
  });

  it('TEST-232: rotates refresh token and revokes family on predecessor replay', async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'demo', email: 'admin@example.test', password
    }).expect(200);
    const firstCookie = cookieFrom(login);
    const rotated = await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', firstCookie).expect(200);
    const secondCookie = cookieFrom(rotated);
    expect(secondCookie).not.toBe(firstCookie);
    await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', firstCookie).expect(401);
    await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', firstCookie).expect(401);
    await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', secondCookie).expect(401);
    await request(app.getHttpServer()).get('/v1/me')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(401);
  });

  it('TEST-233: logout is idempotent and revokes current session', async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'demo', email: 'admin@example.test', password
    }).expect(200);
    const cookie = cookieFrom(login);
    await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).post('/v1/auth/refresh').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer()).get('/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Tenant-Id', tenantId)
      .expect(401);
  });

  it('denies tenant header mismatch', async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'demo', email: 'admin@example.test', password
    }).expect(200);
    await request(app.getHttpServer()).get('/v1/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Tenant-Id', randomUUID())
      .expect(403);
  });

  it('TEST-200: rejects an expired access JWT', async () => {
    const config = loadAppConfig();
    const expired = await new JwtService().signAsync(
      { sub: userId, tid: tenantId, sid: randomUUID(), jti: randomUUID(), typ: 'access' },
      {
        secret: config.jwt.accessSecret, expiresIn: -1,
        issuer: config.jwt.issuer, audience: config.jwt.audience
      }
    );
    await request(app.getHttpServer()).get('/v1/me')
      .set('Authorization', `Bearer ${expired}`)
      .set('X-Tenant-Id', tenantId)
      .expect(401);
  });
});
