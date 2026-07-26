import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import {
  AlertType, AssignmentScopeType, AuditEventEntity, CompanyEntity, ExposureLevel,
  IssueEntity, IssueSeverity, IssueStatus, LegalEntityEntity, LocalCredentialEntity,
  MasterRecordStatus, NotificationEntity, NotificationPriority, NotificationSourceType,
  NotificationStatus, OrganizationType, PackageEntity, PackageStatus, PortfolioEntity,
  ProjectEntity, ProjectPhase, ProjectRecordStatus, ProjectType, RiskEntity, RiskStatus,
  RoleAssignmentEntity, RoleEntity, SiteEntity, TenantEntity,
  TransactionalOutboxEventEntity, UserAccountEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const tenantWideUserId = randomUUID();
const packageUserId = randomUUID();
const strangerUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const hiddenProjectId = randomUUID();
const otherProjectId = randomUUID();
const visiblePackageId = randomUUID();
const hiddenPackageId = randomUUID();
const password = 'Notification!Integration2026';
const siteTimezone = 'Asia/Ho_Chi_Minh';
// The trigger derives data_date from now() in the primary Site timezone, so the fixture must use
// the same clock rather than a frozen literal.
const siteToday = new Intl.DateTimeFormat('en-CA', { timeZone: siteTimezone }).format(new Date());
const sourceDueDate = '2026-12-31';

jest.setTimeout(90_000);

describe('Notification inbox HTTP integration — TEST-103…107 (US-022, API-135/API-136)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let tenantWideToken: string;
  let packageToken: string;
  let strangerToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    app = await createApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    await seedIdentityAndProjects();
    tenantWideToken = await login('notify-tenant@example.test', 'notify-test');
    packageToken = await login('notify-package@example.test', 'notify-test');
    strangerToken = await login('notify-stranger@example.test', 'notify-test');
    otherTenantToken = await login('notify-other@example.test', 'notify-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-135: returns only the caller own notifications, newest first', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') }),
      row({ id: idAt(2), recipient: tenantWideUserId, createdAt: at('T12:00:00Z') }),
      // Same tenant and project, but addressed to somebody else.
      row({ id: idAt(3), recipient: strangerUserId, createdAt: at('T13:00:00Z') })
    ]);

    const response = await api(tenantWideToken).get('/v1/notifications').expect(200);
    expect(response.body.data.map((item: { id: string }) => item.id))
      .toEqual([idAt(2), idAt(1)]);
    expect(response.body.meta).toEqual({
      limit: 50, nextCursor: null, unreadTotal: 2, unreadHigh: 2, unreadNormal: 0
    });
    expect(response.body.data[0]).toMatchObject({
      projectId, status: 'UNREAD', priority: 'HIGH', alertType: 'RISK_REVIEW_DUE', readAt: null
    });
  });

  it('API-135: re-evaluates project and package scope instead of trusting the projection', async () => {
    await seedNotifications([
      // Addressed to the package user and inside the package they hold.
      row({
        id: idAt(1), recipient: packageUserId, packageId: visiblePackageId,
        createdAt: at('T10:00:00Z')
      }),
      // Addressed to the same user but in a package they do not hold: the worker may have written
      // it while the assignment still existed.
      row({
        id: idAt(2), recipient: packageUserId, packageId: hiddenPackageId,
        createdAt: at('T11:00:00Z')
      }),
      // Addressed to the same user in an entirely different project.
      row({
        id: idAt(3), recipient: packageUserId, projectId: hiddenProjectId,
        createdAt: at('T12:00:00Z')
      })
    ]);

    const response = await api(packageToken).get('/v1/notifications').expect(200);
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([idAt(1)]);
  });

  it('API-135: paginates by opaque cursor without duplicate or gap', async () => {
    await seedNotifications(Array.from({ length: 5 }, (_, index) => row({
      id: idAt(index + 1),
      recipient: tenantWideUserId,
      createdAt: at(`T1${index}:00:00Z`)
    })));

    const first = await api(tenantWideToken).get('/v1/notifications?limit=2').expect(200);
    expect(first.body.data.map((item: { id: string }) => item.id)).toEqual([idAt(5), idAt(4)]);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));

    const second = await api(tenantWideToken)
      .get(`/v1/notifications?limit=2&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`)
      .expect(200);
    expect(second.body.data.map((item: { id: string }) => item.id)).toEqual([idAt(3), idAt(2)]);

    const third = await api(tenantWideToken)
      .get(`/v1/notifications?limit=2&cursor=${encodeURIComponent(second.body.meta.nextCursor)}`)
      .expect(200);
    expect(third.body.data.map((item: { id: string }) => item.id)).toEqual([idAt(1)]);
    expect(third.body.meta.nextCursor).toBeNull();
  });

  it('API-135: rejects a malformed cursor rather than silently restarting the page', async () => {
    const response = await api(tenantWideToken)
      .get('/v1/notifications?cursor=not-a-cursor').expect(400);
    expect(response.body.code).toBe('INVALID_CURSOR');
  });

  it('API-135: filters by status, priority, source type and project', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') }),
      row({
        id: idAt(2), recipient: tenantWideUserId, createdAt: at('T11:00:00Z'),
        status: NotificationStatus.READ, readAt: new Date(at('T11:30:00Z'))
      }),
      row({
        id: idAt(3), recipient: tenantWideUserId, createdAt: at('T12:00:00Z'),
        priority: NotificationPriority.NORMAL, sourceType: NotificationSourceType.ISSUE,
        alertType: AlertType.ISSUE_TARGET_DUE
      }),
      row({ id: idAt(4), recipient: tenantWideUserId, createdAt: at('T13:00:00Z'), projectId: hiddenProjectId })
    ]);

    const unread = await api(tenantWideToken).get('/v1/notifications?status=UNREAD').expect(200);
    expect(unread.body.data.map((item: { id: string }) => item.id))
      .toEqual([idAt(4), idAt(3), idAt(1)]);

    const high = await api(tenantWideToken).get('/v1/notifications?priority=HIGH').expect(200);
    expect(high.body.data.map((item: { id: string }) => item.id))
      .toEqual([idAt(4), idAt(2), idAt(1)]);

    const issues = await api(tenantWideToken).get('/v1/notifications?sourceType=Issue').expect(200);
    expect(issues.body.data.map((item: { id: string }) => item.id)).toEqual([idAt(3)]);

    const scoped = await api(tenantWideToken)
      .get(`/v1/notifications?projectId=${projectId}`).expect(200);
    expect(scoped.body.data.map((item: { id: string }) => item.id))
      .toEqual([idAt(3), idAt(2), idAt(1)]);
  });

  it('meta carries unread counters that survive filtering and leak no hidden work', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') }),
      row({
        id: idAt(2), recipient: tenantWideUserId, createdAt: at('T11:00:00Z'),
        priority: NotificationPriority.NORMAL
      }),
      row({
        id: idAt(3), recipient: tenantWideUserId, createdAt: at('T12:00:00Z'),
        status: NotificationStatus.READ, readAt: new Date(at('T12:30:00Z'))
      }),
      row({ id: idAt(4), recipient: strangerUserId, createdAt: at('T13:00:00Z') })
    ]);

    const all = await api(tenantWideToken).get('/v1/notifications').expect(200);
    expect(all.body.meta).toMatchObject({ unreadTotal: 2, unreadHigh: 1, unreadNormal: 1 });

    // Narrowing the view must not shrink the badge.
    const filtered = await api(tenantWideToken)
      .get('/v1/notifications?priority=HIGH&limit=1').expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.meta).toMatchObject({ unreadTotal: 2, unreadHigh: 1, unreadNormal: 1 });

    // The package user must not learn that unreachable work exists.
    const scoped = await api(packageToken).get('/v1/notifications').expect(200);
    expect(scoped.body.meta).toMatchObject({ unreadTotal: 0, unreadHigh: 0, unreadNormal: 0 });
  });

  it('acknowledging decrements the unread counters in meta', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') }),
      row({
        id: idAt(2), recipient: tenantWideUserId, createdAt: at('T11:00:00Z'),
        priority: NotificationPriority.NORMAL
      })
    ]);

    await api(tenantWideToken).post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-counter').send({}).expect(200);

    const after = await api(tenantWideToken).get('/v1/notifications').expect(200);
    expect(after.body.meta).toMatchObject({ unreadTotal: 1, unreadHigh: 0, unreadNormal: 1 });
  });

  it('API-136: acknowledges once, replays idempotently and writes audit plus outbox', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') })
    ]);

    const key = 'notification-ack-001';
    const first = await api(tenantWideToken)
      .post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', key).send({}).expect(200);
    expect(first.body.data).toMatchObject({ id: idAt(1), status: 'READ' });
    expect(first.body.data.readAt).toEqual(expect.any(String));

    const replay = await api(tenantWideToken)
      .post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', key).send({}).expect(200);
    expect(replay.body.data).toEqual(first.body.data);

    const stored = await dataSource.getRepository(NotificationEntity)
      .findOneByOrFail({ id: idAt(1), tenantId });
    expect(stored.status).toBe(NotificationStatus.READ);
    expect(stored.readAt).not.toBeNull();

    const audits = await dataSource.getRepository(AuditEventEntity)
      .findBy({ tenantId, objectId: idAt(1) });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'Notification.Acknowledged', objectType: 'Notification', result: 'SUCCEEDED'
    });

    const events = await dataSource.getRepository(TransactionalOutboxEventEntity)
      .findBy({ tenantId, aggregateId: idAt(1) });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('Notification.Acknowledged');
  });

  it('API-136: a second acknowledge under a new key stays a no-op, not a conflict', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') })
    ]);

    await api(tenantWideToken).post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-first').send({}).expect(200);
    const second = await api(tenantWideToken).post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-second').send({}).expect(200);
    expect(second.body.data.status).toBe('READ');

    // The no-op must not append a second audit or outbox fact.
    expect(await dataSource.getRepository(AuditEventEntity)
      .countBy({ tenantId, objectId: idAt(1) })).toBe(1);
    expect(await dataSource.getRepository(TransactionalOutboxEventEntity)
      .countBy({ tenantId, aggregateId: idAt(1) })).toBe(1);
  });

  it('API-136: another recipient, an out-of-scope package and another tenant all get 404', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: strangerUserId, createdAt: at('T10:00:00Z') }),
      row({
        id: idAt(2), recipient: packageUserId, packageId: hiddenPackageId,
        createdAt: at('T11:00:00Z')
      })
    ]);

    await api(tenantWideToken).post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-foreign').send({}).expect(404);
    await api(packageToken).post(`/v1/notifications/${idAt(2)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-hidden').send({}).expect(404);
    await api(otherTenantToken, otherTenantId).post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-tenant').send({}).expect(404);

    const untouched = await dataSource.getRepository(NotificationEntity)
      .findBy({ tenantId });
    expect(untouched.every((item) => item.status === NotificationStatus.UNREAD)).toBe(true);
    // Authentication writes its own audit trail, so assert on the Notification object type only.
    expect(await dataSource.getRepository(AuditEventEntity)
      .countBy({ tenantId, objectType: 'Notification' })).toBe(0);
  });

  it('API-136: requires an Idempotency-Key', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') })
    ]);
    const response = await api(tenantWideToken)
      .post(`/v1/notifications/${idAt(1)}:acknowledge`).send({}).expect(400);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('denies a caller whose role carries no notification permission', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: strangerUserId, createdAt: at('T10:00:00Z') })
    ]);
    await api(strangerToken).get('/v1/notifications').expect(403);
    await api(strangerToken).post(`/v1/notifications/${idAt(1)}:acknowledge`)
      .set('Idempotency-Key', 'notification-ack-denied').send({}).expect(403);
  });

  it('cross-tenant readers see nothing even with a valid token', async () => {
    await seedNotifications([
      row({ id: idAt(1), recipient: tenantWideUserId, createdAt: at('T10:00:00Z') })
    ]);
    const response = await api(otherTenantToken, otherTenantId)
      .get('/v1/notifications').expect(200);
    expect(response.body.data).toEqual([]);
  });

  function at(time: string): string {
    return `2026-07-20${time}`;
  }

  function idAt(index: number): string {
    return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
  }

  /**
   * `trg_notification_source_scope` refuses any row whose package, due date, data date and priority
   * do not match the canonical policy derived from a real source record, so every fixture row seeds
   * a matching Risk or Issue first. `dataDate` must be today in the primary Site timezone.
   */
  function row(overrides: {
    id: string;
    recipient: string;
    createdAt: string;
    projectId?: string;
    packageId?: string | null;
    status?: NotificationStatus;
    readAt?: Date | null;
    priority?: NotificationPriority;
    sourceType?: NotificationSourceType;
    alertType?: AlertType;
  }) {
    const rowProjectId = overrides.projectId ?? projectId;
    const sourceType = overrides.sourceType ?? NotificationSourceType.RISK;
    const priority = overrides.priority ?? NotificationPriority.HIGH;
    return {
      id: overrides.id,
      tenantId,
      recipientUserId: overrides.recipient,
      projectId: rowProjectId,
      packageId: overrides.packageId ?? null,
      activityId: null,
      sourceType,
      sourceId: overrides.id,
      alertType: overrides.alertType
        ?? (sourceType === NotificationSourceType.RISK
          ? AlertType.RISK_REVIEW_DUE
          : AlertType.ISSUE_TARGET_DUE),
      priority,
      objectLink: `/projects/${rowProjectId}/risk-change`,
      reason: 'Review date reached',
      dueAt: sourceDueDate,
      dataDate: siteToday,
      thresholdVersion: 'threshold-v1',
      dedupKey: `dedup-${overrides.id}`,
      status: overrides.status ?? NotificationStatus.UNREAD,
      readAt: overrides.readAt ?? null,
      createdAt: new Date(overrides.createdAt)
    };
  }

  /**
   * Seeds the source record each notification points at, then the notification itself. The source
   * reuses the notification id so a fixture stays readable, and its severity is chosen so the
   * trigger derives exactly the priority the fixture asked for.
   */
  async function seedNotifications(rows: ReturnType<typeof row>[]): Promise<void> {
    for (const item of rows) {
      if (item.sourceType === NotificationSourceType.RISK) {
        const high = item.priority === NotificationPriority.HIGH;
        await dataSource.getRepository(RiskEntity).insert({
          id: item.sourceId, tenantId, projectId: item.projectId, packageId: item.packageId,
          code: `RSK-${item.id.slice(-6)}`, category: 'Schedule',
          cause: 'Fixture cause', event: 'Fixture event', impact: 'Fixture impact',
          probability: high ? 4 : 1, costImpactRating: high ? 4 : 1,
          scheduleImpactRating: high ? 4 : 1, hseImpactRating: 1,
          impactRating: high ? 4 : 1,
          inherentExposure: high ? 16 : 1,
          inherentLevel: high ? ExposureLevel.CRITICAL : ExposureLevel.LOW,
          residualProbability: null, residualCostImpactRating: null,
          residualScheduleImpactRating: null, residualHseImpactRating: null,
          residualImpactRating: null, residualExposure: null, residualLevel: null,
          scoringVersion: 'scoring-v1', thresholdVersion: 'threshold-v1',
          ownerId: item.recipientUserId, reviewDate: sourceDueDate,
          responseStrategy: null, responsePlan: null, trigger: null, contingencyPlan: null,
          evidenceRefs: [], status: RiskStatus.IDENTIFIED, occurredIssueId: null,
          closureRequestedBy: null, closureRequestedAt: null, closureReason: null,
          closureRequestEvidenceRefs: [], closureDecision: null,
          closureDecisionEvidenceRefs: [], closureDecidedBy: null, closureDecidedAt: null,
          closureDecisionComment: null, versionNo: 1,
          createdBy: item.recipientUserId, updatedBy: item.recipientUserId
        });
      } else {
        await dataSource.getRepository(IssueEntity).insert({
          id: item.sourceId, tenantId, projectId: item.projectId, packageId: item.packageId,
          code: `ISS-${item.id.slice(-6)}`, title: 'Fixture issue',
          description: 'Fixture description', rootCause: 'Fixture root cause',
          actualImpact: 'Fixture actual impact',
          severity: item.priority === NotificationPriority.HIGH
            ? IssueSeverity.CRITICAL
            : IssueSeverity.LOW,
          ownerId: item.recipientUserId, occurredAt: new Date(at('T00:00:00Z')),
          targetDate: sourceDueDate, sourceRiskId: null, evidenceRefs: [],
          status: IssueStatus.REPORTED, closureRequestedBy: null, closureRequestedAt: null,
          closureReason: null, closureRequestEvidenceRefs: [], closureDecision: null,
          closureDecisionEvidenceRefs: [], closureDecidedBy: null, closureDecidedAt: null,
          closureDecisionComment: null, versionNo: 1,
          createdBy: item.recipientUserId, updatedBy: item.recipientUserId
        });
      }
      await dataSource.getRepository(NotificationEntity).insert(item);
    }
  }

  async function seedIdentityAndProjects(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'notify-test', name: 'Notification Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'notify-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(tenantWideUserId, tenantId, 'notify-tenant@example.test', 'Tenant Wide Reader'),
      user(packageUserId, tenantId, 'notify-package@example.test', 'Package Reader'),
      user(strangerUserId, tenantId, 'notify-stranger@example.test', 'No Notification Grant'),
      user(otherTenantUserId, otherTenantId, 'notify-other@example.test', 'Other Tenant Reader')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(tenantWideUserId, tenantId), credential(packageUserId, tenantId),
      credential(strangerUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);
    const tenantWideRole = await role(tenantId, 'NOTIFY_TENANT', [
      'notification.read', 'notification.acknowledge'
    ]);
    const packageRole = await role(tenantId, 'NOTIFY_PACKAGE', [
      'notification.read', 'notification.acknowledge'
    ]);
    const strangerRole = await role(tenantId, 'NOTIFY_NONE', ['project.read']);
    const otherRole = await role(otherTenantId, 'NOTIFY_OTHER', [
      'notification.read', 'notification.acknowledge'
    ]);

    await seedProject(tenantId, projectId, tenantWideUserId, 'NOTIF', 'Notification Project');
    await seedProject(tenantId, hiddenProjectId, tenantWideUserId, 'NHIDE', 'Hidden Project');
    await seedProject(
      otherTenantId, otherProjectId, otherTenantUserId, 'NOTHER', 'Other Tenant Project'
    );
    await dataSource.getRepository(PackageEntity).save([
      packageRow(visiblePackageId, projectId, tenantWideUserId, 'NOTIF-A'),
      packageRow(hiddenPackageId, projectId, tenantWideUserId, 'NOTIF-B')
    ]);
    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, tenantWideUserId, tenantWideRole.id, AssignmentScopeType.TENANT, null),
      assignment(
        tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, visiblePackageId
      ),
      assignment(tenantId, strangerUserId, strangerRole.id, AssignmentScopeType.TENANT, null),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, projectManagerId: string,
    code: string, name: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `COMP-${code}`, name: `Company ${code}`,
      organizationType: OrganizationType.INTERNAL, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    const legal = await dataSource.getRepository(LegalEntityEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, companyId: company.id,
      legalName: `Legal ${code}`, country: 'VN', registrationNo: `REG-${code}`,
      taxId: null, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const portfolio = await dataSource.getRepository(PortfolioEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `PORT-${code}`,
      name: `Portfolio ${code}`, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    await dataSource.getRepository(ProjectEntity).save({
      id: fixtureProjectId, tenantId: fixtureTenantId, portfolioId: portfolio.id,
      ownerLegalEntityId: legal.id, customerCompanyId: company.id,
      projectManagerId, code, name, type: ProjectType.SOLAR,
      phase: ProjectPhase.PLANNING, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31',
      forecastCod: null, versionNo: 1, idempotencyKey: null
    });
    // The notification trigger resolves data_date through the primary Site timezone, so every
    // fixture project needs one.
    await dataSource.getRepository(SiteEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, projectId: fixtureProjectId,
      code: `SITE-${code}`, name: `Site ${code}`, location: 'Synthetic integration fixture',
      timezone: siteTimezone, isPrimary: true, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 1, status: MasterRecordStatus.ACTIVE
    });
  }

  function assignment(
    fixtureTenantId: string, userAccountId: string, roleId: string,
    scopeType: AssignmentScopeType, scopeId: string | null
  ) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId, roleId,
      scopeType, scopeId, effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null, status: MasterRecordStatus.ACTIVE
    };
  }

  function packageRow(
    id: string, fixtureProjectId: string, actorId: string, code: string
  ) {
    return {
      id, tenantId, projectId: fixtureProjectId,
      parentPackageId: null, contractorCompanyId: null, code, name: `Package ${code}`,
      packageType: 'EPC', status: PackageStatus.ACTIVE, versionNo: 1,
      idempotencyKey: null, createdBy: actorId, updatedBy: actorId
    };
  }

  function user(id: string, fixtureTenantId: string, email: string, displayName: string) {
    return {
      id, tenantId: fixtureTenantId, email, normalizedEmail: email,
      displayName, status: MasterRecordStatus.ACTIVE, lastLoginAt: null
    };
  }

  function credential(userAccountId: string, fixtureTenantId: string) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId,
      passwordHash, algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    };
  }

  async function login(email: string, tenantCode: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/v1/auth/login')
      .send({ tenantCode, email, password }).expect(200);
    return response.body.accessToken as string;
  }

  function api(token: string, headerTenantId = tenantId) {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', headerTenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path))
    };
  }
});
