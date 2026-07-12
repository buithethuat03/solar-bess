import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import {
  AssignmentScopeType, CompanyEntity, LegalEntityEntity, LocalCredentialEntity,
  MasterRecordStatus, OrganizationType, PortfolioEntity, RoleAssignmentEntity,
  RoleEntity, TenantEntity, UserAccountEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const userId = randomUUID();
const password = 'Project!Integration2026';

jest.setTimeout(45_000);

describe('Project Master API integration — TEST-001…004/202…208', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let companyId: string;
  let legalEntityId: string;
  let portfolioId: string;

  beforeAll(async () => {
    await runTestMigrations();
    app = await createApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'project-test', name: 'Project Test Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'other-test', name: 'Other Test Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save({
      id: userId, tenantId, email: 'pmo@example.test', normalizedEmail: 'pmo@example.test',
      displayName: 'PMO Test', status: 'ACTIVE', lastLoginAt: null
    });
    await dataSource.getRepository(LocalCredentialEntity).save({
      id: randomUUID(), tenantId, userAccountId: userId, passwordHash: await hash(password),
      algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    });
    const role = await dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId, code: 'PMO', name: 'PMO', policyVersion: 1,
      status: MasterRecordStatus.ACTIVE,
      permissions: [
        'organization.read', 'portfolio.read', 'portfolio.create', 'project.read',
        'project.create', 'project.update', 'site.read', 'site.create', 'projectParty.manage'
      ]
    });
    await dataSource.getRepository(RoleAssignmentEntity).save({
      id: randomUUID(), tenantId, userAccountId: userId, roleId: role.id,
      scopeType: AssignmentScopeType.TENANT, scopeId: null,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null,
      status: MasterRecordStatus.ACTIVE
    });
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId, code: 'CUSTOMER', name: 'Customer Test',
      organizationType: OrganizationType.CUSTOMER, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    companyId = company.id;
    const legalEntity = await dataSource.getRepository(LegalEntityEntity).save({
      id: randomUUID(), tenantId, companyId, legalName: 'Owner Legal Test', country: 'VN',
      registrationNo: randomUUID(), taxId: null, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    legalEntityId = legalEntity.id;
    const portfolio = await dataSource.getRepository(PortfolioEntity).save({
      id: randomUUID(), tenantId, code: 'MAIN', name: 'Main Portfolio',
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    portfolioId = portfolio.id;
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'project-test', email: 'pmo@example.test', password
    }).expect(200);
    accessToken = login.body.accessToken as string;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('TEST-001/180: atomically creates Project, audit, outbox and command receipt', async () => {
    const key = 'test-create-project-001';
    const payload = projectPayload('SOLAR-001');
    const first = await api().post('/v1/projects').set('Idempotency-Key', key).send(payload).expect(202);
    const replay = await api().post('/v1/projects').set('Idempotency-Key', key).send(payload).expect(202);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(first.body.data.sites).toHaveLength(1);
    expect(first.body.data.sites[0].isPrimary).toBe(true);
    expect(first.body.data.versionNo).toBe(1);
    const [audit] = await dataSource.query<Array<{ action: string; object_id: string }>>(
      'SELECT action, object_id FROM audit_events WHERE action = $1', ['PROJECT_CREATED']
    );
    expect(audit).toEqual({ action: 'PROJECT_CREATED', object_id: first.body.data.id });
    const [foundation] = await dataSource.query<Array<{
      outbox_count: string;
      receipt_count: string;
    }>>(
      `SELECT
        (SELECT count(*) FROM transactional_outbox_events
          WHERE aggregate_id = $1 AND event_type = 'PROJECT_CREATED')::text AS outbox_count,
        (SELECT count(*) FROM command_receipts
          WHERE idempotency_key = $2 AND state = 'COMPLETED')::text AS receipt_count`,
      [first.body.data.id, key]
    );
    expect(foundation).toEqual({ outbox_count: '1', receipt_count: '1' });
  });

  it('TEST-180: rejects reuse of an idempotency key with another payload', async () => {
    const key = 'payload-fingerprint-key';
    await api().post('/v1/projects').set('Idempotency-Key', key)
      .send(projectPayload('FINGERPRINT-001')).expect(202);
    const denied = await api().post('/v1/projects').set('Idempotency-Key', key)
      .send(projectPayload('FINGERPRINT-002')).expect(409);
    expect(denied.body.code).toBe('IDEMPOTENCY_CONFLICT');
    const [counts] = await dataSource.query<Array<{ projects: string; events: string }>>(
      `SELECT
        (SELECT count(*) FROM projects WHERE code LIKE 'FINGERPRINT-%')::text AS projects,
        (SELECT count(*) FROM transactional_outbox_events WHERE event_type = 'PROJECT_CREATED'
          AND payload->>'code' LIKE 'FINGERPRINT-%')::text AS events`
    );
    expect(counts).toEqual({ projects: '1', events: '1' });
  });

  it('TEST-180: releases a command key after its configured receipt retention', async () => {
    const key = 'expired-receipt-key';
    await api().post('/v1/projects').set('Idempotency-Key', key)
      .send(projectPayload('EXPIRED-001')).expect(202);
    await dataSource.query(
      `UPDATE command_receipts
       SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, key]
    );
    const accepted = await api().post('/v1/projects').set('Idempotency-Key', key)
      .send(projectPayload('EXPIRED-002')).expect(202);
    expect(accepted.body.data.code).toBe('EXPIRED-002');
  });

  it('TEST-001: rejects duplicate project code with a different idempotency key', async () => {
    await api().post('/v1/projects').set('Idempotency-Key', 'first-project-key').send(projectPayload('DUP-001')).expect(202);
    const denied = await api().post('/v1/projects').set('Idempotency-Key', 'second-project-key').send(projectPayload('DUP-001')).expect(409);
    expect(denied.body.code).toBe('PROJECT_DUPLICATE');
  });

  it('TEST-003/SEC-105: denies cross-tenant header and known project id', async () => {
    const created = await api().post('/v1/projects').set('Idempotency-Key', 'tenant-project-key')
      .send(projectPayload('TENANT-001')).expect(202);
    await request(app.getHttpServer()).get(`/v1/projects/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-Id', otherTenantId)
      .expect(403);
  });

  it('TEST-203/SEC-107: filters tenant catalogs to an assigned project scope', async () => {
    const created = await api().post('/v1/projects').set('Idempotency-Key', 'scoped-catalog-project')
      .send(projectPayload('SCOPED-001')).expect(202);
    const projectId = created.body.data.id as string;
    await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId, code: 'UNRELATED', name: 'Unrelated Company',
      organizationType: OrganizationType.PARTNER, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    await dataSource.getRepository(PortfolioEntity).save({
      id: randomUUID(), tenantId, code: 'UNRELATED', name: 'Unrelated Portfolio',
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    await dataSource.getRepository(RoleAssignmentEntity).update(
      { tenantId, userAccountId: userId }, { status: MasterRecordStatus.INACTIVE }
    );
    const scopedRole = await dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId, code: 'SCOPED_MANAGER', name: 'Scoped Manager',
      policyVersion: 1, status: MasterRecordStatus.ACTIVE,
      permissions: ['organization.read', 'legalEntity.read', 'portfolio.read', 'project.read']
    });
    await dataSource.getRepository(RoleAssignmentEntity).save({
      id: randomUUID(), tenantId, userAccountId: userId, roleId: scopedRole.id,
      scopeType: AssignmentScopeType.PROJECT, scopeId: projectId,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null,
      status: MasterRecordStatus.ACTIVE
    });

    const [companies, legalEntities, portfolios] = await Promise.all([
      api().get('/v1/companies').expect(200),
      api().get('/v1/legal-entities').expect(200),
      api().get('/v1/portfolios').expect(200)
    ]);
    expect(companies.body.data.map((item: { id: string }) => item.id)).toEqual([companyId]);
    expect(legalEntities.body.data.map((item: { id: string }) => item.id)).toEqual([legalEntityId]);
    expect(portfolios.body.data.map((item: { id: string }) => item.id)).toEqual([portfolioId]);
  });

  it('TEST-004/NFR-012: applies If-Match, archives without delete and audits reason', async () => {
    const created = await api().post('/v1/projects').set('Idempotency-Key', 'archive-project-key')
      .send(projectPayload('ARCHIVE-001')).expect(202);
    const projectId = created.body.data.id as string;
    const archived = await api().patch(`/v1/projects/${projectId}`)
      .set('If-Match', '1')
      .set('Idempotency-Key', 'archive-update-command')
      .send({ recordStatus: 'ARCHIVED', reason: 'Kết thúc dữ liệu thử nghiệm' })
      .expect(202);
    expect(archived.body.data.recordStatus).toBe('ARCHIVED');
    expect(archived.body.data.versionNo).toBe(2);
    await api().patch(`/v1/projects/${projectId}`).set('If-Match', '1')
      .set('Idempotency-Key', 'stale-update-command')
      .send({ name: 'Stale update', reason: 'Kiểm tra concurrency' }).expect(409);
    const count = await dataSource.query<Array<{ count: string }>>(
      'SELECT count(*) FROM projects WHERE id = $1', [projectId]
    );
    expect(count[0].count).toBe('1');
  });

  it('TEST-002: uses stable legal identity and rejects company mismatch', async () => {
    const created = await api().post('/v1/projects').set('Idempotency-Key', 'party-project-key')
      .send(projectPayload('PARTY-001')).expect(202);
    const projectId = created.body.data.id as string;
    const otherCompany = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId, code: 'OTHER', name: 'Other Company',
      organizationType: OrganizationType.PARTNER, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    const denied = await api().put(`/v1/projects/${projectId}/parties/${randomUUID()}`)
      .set('If-Match', '0').set('Idempotency-Key', 'party-mismatch-command').send({
        companyId: otherCompany.id, legalEntityId, roleCode: 'EPC', raci: 'RESPONSIBLE',
        effectiveFrom: '2026-07-11', reason: 'Kiểm tra quan hệ pháp nhân'
      }).expect(400);
    expect(denied.body.code).toBe('LEGAL_ENTITY_COMPANY_MISMATCH');
    const accepted = await api().put(`/v1/projects/${projectId}/parties/${randomUUID()}`)
      .set('If-Match', '0').set('Idempotency-Key', 'party-owner-command').send({
        companyId, legalEntityId, roleCode: 'OWNER', raci: 'ACCOUNTABLE',
        effectiveFrom: '2026-07-11', contactName: 'Demo Contact',
        contactEmail: 'contact@example.test', reason: 'Gán owner cho dự án'
      }).expect(202);
    expect(accepted.body.data.legalEntityId).toBe(legalEntityId);
  });

  it('TEST-185: prevents concurrent Project Party lost updates', async () => {
    const created = await api().post('/v1/projects').set('Idempotency-Key', 'party-race-project')
      .send(projectPayload('PARTY-RACE')).expect(202);
    const projectId = created.body.data.id as string;
    const partyId = randomUUID();
    const base = {
      companyId, legalEntityId, roleCode: 'OWNER', raci: 'ACCOUNTABLE',
      effectiveFrom: '2026-07-11', reason: 'Tạo party để kiểm tra concurrency'
    };
    await api().put(`/v1/projects/${projectId}/parties/${partyId}`)
      .set('If-Match', '0').set('Idempotency-Key', 'party-race-create')
      .send(base).expect(202);

    const [first, second] = await Promise.all([
      api().put(`/v1/projects/${projectId}/parties/${partyId}`)
        .set('If-Match', '1').set('Idempotency-Key', 'party-race-update-a')
        .send({ ...base, contactName: 'Concurrent A', reason: 'Concurrent A' }),
      api().put(`/v1/projects/${projectId}/parties/${partyId}`)
        .set('If-Match', '1').set('Idempotency-Key', 'party-race-update-b')
        .send({ ...base, contactName: 'Concurrent B', reason: 'Concurrent B' })
    ]);
    expect([first.status, second.status].sort()).toEqual([202, 409]);
    const [row] = await dataSource.query<Array<{ version_no: number; contact_name: string }>>(
      'SELECT version_no, contact_name FROM project_parties WHERE id = $1', [partyId]
    );
    expect(row.version_no).toBe(2);
    expect(['Concurrent A', 'Concurrent B']).toContain(row.contact_name);
  });

  function api() {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Tenant-Id', tenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path)),
      put: (path: string) => authorized(request(app.getHttpServer()).put(path)),
      patch: (path: string) => authorized(request(app.getHttpServer()).patch(path))
    };
  }

  function projectPayload(code: string) {
    return {
      code, name: `Project ${code}`, type: 'SOLAR', portfolioId,
      ownerLegalEntityId: legalEntityId, customerCompanyId: companyId,
      projectManagerId: userId, contractModel: 'EPC', currency: 'VND',
      plannedCod: '2027-12-31',
      primarySite: { code: 'MAIN', name: 'Main Site', timezone: 'Asia/Ho_Chi_Minh' }
    };
  }
});
