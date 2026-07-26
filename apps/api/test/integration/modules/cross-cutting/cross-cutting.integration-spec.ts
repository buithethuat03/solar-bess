import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import {
  ApprovalDecisionEntity, AssignmentScopeType, AuditEventEntity, ChangeRequestEntity,
  ChangeRequestStatus, ChangeSourceType, CompanyEntity, ContractEntity, DelegationEntity,
  DocumentClassification, DocumentEntity, DocumentRecordStatus, IssueEntity, LegalEntityEntity,
  LocalCredentialEntity, MasterRecordStatus, OrganizationType, PackageEntity, PackageStatus,
  PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus, ProjectType,
  ReportJobEntity, RoleAssignmentEntity, RoleEntity, SavedViewEntity, TenantEntity,
  TransactionalOutboxEventEntity, UserAccountEntity, WorkflowDefinitionEntity,
  WorkflowDefinitionStatus, WorkflowInstanceEntity, WorkflowObjectType, WorkflowVersionEntity,
  WorkflowVersionStatus
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';
import type { DomainEventJob } from '../../../../../worker/src/domain-event';
import { ReportJobProcessor } from '../../../../../worker/src/report-job.processor';
import type { ReportStorage, StoredReportRef } from '../../../../../worker/src/report-storage';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const adminId = randomUUID();
const pmId = randomUUID();
const secondPmId = randomUUID();
const delegateId = randomUUID();
const requesterId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const hiddenProjectId = randomUUID();
const otherProjectId = randomUUID();
const packageAId = randomUUID();
const packageBId = randomUUID();
const definitionId = randomUUID();
const password = 'CrossCut!Integration2026';

/** Single-step route: only PROJECT_MANAGER decides; the fallback role is assigned to nobody. */
const singleStepRules = {
  version: 1,
  steps: [{
    key: 'REVIEW', order: 1, rule: 'ALL',
    approverSelector: { roleCodes: ['PROJECT_MANAGER'], scope: 'PROJECT' },
    fallbackRoleCodes: ['CC_NOBODY']
  }],
  conditions: []
};

/** Quorum-2 route so a person and their delegate can both try to count in the same step. */
const quorumRules = {
  version: 1,
  steps: [{
    key: 'REVIEW', order: 1, rule: 'QUORUM', quorum: 2,
    approverSelector: { roleCodes: ['PROJECT_MANAGER'], scope: 'PROJECT' },
    fallbackRoleCodes: ['CC_NOBODY']
  }],
  conditions: []
};

jest.setTimeout(180_000);

class CapturingReportStorage implements ReportStorage {
  puts: Array<{ objectKey: string; body: string }> = [];
  async put(objectKey: string, body: Buffer): Promise<StoredReportRef> {
    this.puts.push({ objectKey, body: body.toString('utf8') });
    return { bucket: 'it-release-bucket', objectKey };
  }
}

describe('Cross-cutting HTTP integration — API-002/003/009…013, API-113, API-130…134', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let adminToken: string;
  let pmToken: string;
  let secondPmToken: string;
  let delegateToken: string;
  let requesterToken: string;
  let packageToken: string;
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
    await seedFixture();
    adminToken = await login('cut-admin@example.test', 'cut-test');
    pmToken = await login('cut-pm@example.test', 'cut-test');
    secondPmToken = await login('cut-pm2@example.test', 'cut-test');
    delegateToken = await login('cut-delegate@example.test', 'cut-test');
    requesterToken = await login('cut-requester@example.test', 'cut-test');
    packageToken = await login('cut-package@example.test', 'cut-test');
    otherTenantToken = await login('cut-other@example.test', 'cut-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-002: explains the caller through the single evaluator, with the max policy version', async () => {
    const response = await api(pmToken).get('/v1/me/permissions').expect(200);
    expect(response.body.data.userId).toBe(pmId);
    expect(response.body.data.tenantId).toBe(tenantId);
    expect(response.body.data.roles).toEqual(['PROJECT_MANAGER']);
    expect(response.body.data.permissions).toEqual(expect.arrayContaining([
      'permission.read.self', 'workflow.escalate', 'delegation.create'
    ]));
    expect(response.body.data.scopes).toEqual([expect.objectContaining({
      roleCode: 'PROJECT_MANAGER', scopeType: 'TENANT', scopeId: null
    })]);
    expect(response.body.data.policyVersion).toBe(11);

    // requester deliberately lacks permission.read.self — the guard denies, no service touch.
    await api(requesterToken).get('/v1/me/permissions').expect(403);
  });

  it('API-003: reads only the caller tenant; any other id is indistinguishable from missing', async () => {
    const own = await api(adminToken).get(`/v1/tenants/${tenantId}`).expect(200);
    expect(own.body.data).toMatchObject({ id: tenantId, code: 'cut-test', status: 'ACTIVE' });

    const foreign = await api(adminToken).get(`/v1/tenants/${otherTenantId}`).expect(404);
    expect(foreign.body.code).toBe('TENANT_NOT_FOUND');
    await api(adminToken).get(`/v1/tenants/${randomUUID()}`).expect(404);
    // pm holds no tenant.read.
    await api(pmToken).get(`/v1/tenants/${tenantId}`).expect(403);
  });

  it('API-009: grants scoped assignments, refuses invalid references, conflicts on the active tuple', async () => {
    const roleId = await roleIdOf('CC_DELEGATE');
    const granted = await api(adminToken).post('/v1/role-assignments')
      .set('Idempotency-Key', `cut-grant-${randomUUID()}`)
      .send({
        userAccountId: requesterId, roleId, scopeType: 'PROJECT', scopeId: projectId
      })
      .expect(201);
    expect(granted.body.data).toMatchObject({
      userAccountId: requesterId, roleId, scopeType: 'PROJECT', scopeId: projectId,
      status: 'ACTIVE'
    });

    const before = await assignmentCount();
    const duplicate = await api(adminToken).post('/v1/role-assignments')
      .set('Idempotency-Key', `cut-grant-${randomUUID()}`)
      .send({ userAccountId: requesterId, roleId, scopeType: 'PROJECT', scopeId: projectId })
      .expect(409);
    expect(duplicate.body.code).toBe('ROLE_ASSIGNMENT_EXISTS');
    expect(await assignmentCount()).toBe(before);

    for (const [payload, code] of [
      [{ userAccountId: requesterId, roleId: randomUUID(), scopeType: 'TENANT' }, 'ROLE_NOT_FOUND'],
      [{ userAccountId: randomUUID(), roleId, scopeType: 'TENANT' }, 'USER_NOT_FOUND'],
      [{ userAccountId: requesterId, roleId, scopeType: 'TENANT', scopeId: projectId }, 'SCOPE_INVALID'],
      [{ userAccountId: requesterId, roleId, scopeType: 'PROJECT' }, 'SCOPE_INVALID'],
      [{ userAccountId: requesterId, roleId, scopeType: 'PACKAGE', scopeId: randomUUID() }, 'PACKAGE_NOT_FOUND'],
      [{
        userAccountId: requesterId, roleId, scopeType: 'PROJECT', scopeId: hiddenProjectId,
        effectiveFrom: '2026-08-01T00:00:00.000Z', effectiveTo: '2026-07-01T00:00:00.000Z'
      }, 'EFFECTIVE_WINDOW_INVALID']
    ] as const) {
      const refused = await api(adminToken).post('/v1/role-assignments')
        .set('Idempotency-Key', `cut-grant-${randomUUID()}`)
        .send(payload).expect(422);
      expect(refused.body.code).toBe(code);
    }
    expect(await assignmentCount()).toBe(before);
    // pm holds no roleAssignment.grant.
    await api(pmToken).post('/v1/role-assignments')
      .set('Idempotency-Key', `cut-grant-${randomUUID()}`)
      .send({ userAccountId: requesterId, roleId, scopeType: 'TENANT' })
      .expect(403);
  });

  it('API-010: revokes to INACTIVE, keeps the row, replays silently, hides foreign rows', async () => {
    const roleId = await roleIdOf('CC_DELEGATE');
    const granted = await api(adminToken).post('/v1/role-assignments')
      .set('Idempotency-Key', `cut-grant-${randomUUID()}`)
      .send({ userAccountId: requesterId, roleId, scopeType: 'TENANT' })
      .expect(201);
    const assignmentId = granted.body.data.id as string;

    await api(adminToken).delete(`/v1/role-assignments/${assignmentId}`).expect(204);
    const stored = await dataSource.getRepository(RoleAssignmentEntity)
      .findOneByOrFail({ id: assignmentId, tenantId });
    expect(stored.status).toBe(MasterRecordStatus.INACTIVE);

    // Idempotent replay: still 204, and no second Revoked event is emitted.
    await api(adminToken).delete(`/v1/role-assignments/${assignmentId}`).expect(204);
    expect(await outboxCount('RoleAssignment', 'RoleAssignment.Revoked')).toBe(1);

    await api(adminToken).delete(`/v1/role-assignments/${randomUUID()}`).expect(404);
    // A cross-tenant admin sees nothing.
    await api(otherTenantToken, otherTenantId)
      .delete(`/v1/role-assignments/${assignmentId}`).expect(404);
  });

  it('API-011: bounded delegation with chain, overlap, self and valueLimit refusals', async () => {
    const created = await createDelegation(pmToken, {});
    expect(created).toMatchObject({
      delegatorId: pmId, delegateId, status: 'ACTIVE', revokedBy: null
    });

    const before = await delegationCount();
    const withLimit = await api(pmToken).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload({ valueLimit: '1000000' }))
      .expect(422);
    expect(withLimit.body.code).toBe('VALUE_LIMIT_NOT_SUPPORTED');

    const self = await api(pmToken).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload({ delegateId: pmId }))
      .expect(422);
    expect(self.body.code).toBe('DELEGATION_SELF_FORBIDDEN');

    const unknownDelegate = await api(pmToken).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload({ delegateId: randomUUID() }))
      .expect(422);
    expect(unknownDelegate.body.code).toBe('DELEGATE_NOT_FOUND');

    const inverted = await api(pmToken).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload({
        effectiveFrom: '2026-08-01T00:00:00.000Z', effectiveTo: '2026-07-01T00:00:00.000Z'
      }))
      .expect(422);
    expect(inverted.body.code).toBe('DELEGATION_WINDOW_INVALID');

    const overlap = await api(pmToken).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload({}))
      .expect(409);
    expect(overlap.body.code).toBe('DELEGATION_OVERLAP');

    // No chains: the delegate of an ACTIVE delegation cannot delegate onwards.
    const chain = await api(delegateToken).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload({ delegateId: requesterId }))
      .expect(422);
    expect(chain.body.code).toBe('DELEGATION_CHAIN_FORBIDDEN');

    expect(await delegationCount()).toBe(before);
  });

  it('API-012: delegator self-service or TENANT_ADMIN; anyone else sees nothing', async () => {
    const created = await createDelegation(pmToken, {});

    // Another permission holder who is neither the delegator nor TENANT_ADMIN: invisible.
    const stranger = await api(secondPmToken)
      .post(`/v1/delegations/${created.id}:revoke`)
      .set('Idempotency-Key', `cut-revoke-${randomUUID()}`)
      .send({}).expect(404);
    expect(stranger.body.code).toBe('DELEGATION_NOT_FOUND');

    const revoked = await api(pmToken)
      .post(`/v1/delegations/${created.id}:revoke`)
      .set('Idempotency-Key', `cut-revoke-${randomUUID()}`)
      .send({ reason: 'Quay lại làm việc' }).expect(200);
    expect(revoked.body.data).toMatchObject({ status: 'REVOKED', revokedBy: pmId });
    expect(revoked.body.data.revokedAt).toEqual(expect.any(String));

    // Converges on replay with a fresh key.
    const again = await api(pmToken)
      .post(`/v1/delegations/${created.id}:revoke`)
      .set('Idempotency-Key', `cut-revoke-${randomUUID()}`)
      .send({}).expect(200);
    expect(again.body.data.status).toBe('REVOKED');

    // TENANT_ADMIN is the administrative kill switch for someone else's delegation.
    const second = await createDelegation(pmToken, {});
    const adminRevoked = await api(adminToken)
      .post(`/v1/delegations/${second.id}:revoke`)
      .set('Idempotency-Key', `cut-revoke-${randomUUID()}`)
      .send({}).expect(200);
    expect(adminRevoked.body.data).toMatchObject({ status: 'REVOKED', revokedBy: adminId });
  });

  it('US-018: a delegated decision records both identities and SoD covers both', async () => {
    await seedVersion(1, singleStepRules);
    const instanceId = await startInstance(await seedChangeRequest(requesterId));

    // Without a delegation the delegate is simply not an approver.
    const ineligible = await decide(delegateToken, instanceId, 1).expect(422);
    expect(ineligible.body.code).toBe('APPROVER_NOT_FOUND');
    expect(await decisionCount()).toBe(0);

    // Scope-restricted delegation that covers this definition and project.
    await createDelegation(pmToken, {
      scope: { workflowDefinitionCodes: ['WF-CHANGE'], projectIds: [projectId] }
    });
    const decided = await decide(delegateToken, instanceId, 1).expect(200);
    expect(decided.body.data.effectiveActorId).toBe(pmId);
    expect(decided.body.data.state).toBe('APPROVED');
    const decision = await dataSource.getRepository(ApprovalDecisionEntity)
      .findOneByOrFail({ tenantId, workflowInstanceId: instanceId });
    expect(decision.actorId).toBe(delegateId);
    expect(decision.effectiveActorId).toBe(pmId);

    // SoD against the effective identity: when the delegator requested the change, their
    // delegate cannot decide it for them.
    const pmInstance = await startInstance(await seedChangeRequest(pmId));
    const laundered = await decide(delegateToken, pmInstance, 1).expect(403);
    expect(laundered.body.code).toBe('SOD_CONFLICT');
    expect(await dataSource.getRepository(ApprovalDecisionEntity)
      .countBy({ tenantId, workflowInstanceId: pmInstance })).toBe(0);
  });

  it('US-018: one authority cannot count twice in a step, directly and via delegation', async () => {
    await seedVersion(1, quorumRules);
    const instanceId = await startInstance(await seedChangeRequest(requesterId));
    await createDelegation(pmToken, {});

    await decide(pmToken, instanceId, 1).expect(200);
    // The delegate would act as pm again: the effective identity already decided this step.
    const duplicate = await decide(delegateToken, instanceId, 2).expect(409);
    expect(duplicate.body.code).toBe('DECISION_ALREADY_RECORDED');
    expect(await decisionCount()).toBe(1);

    // A second PROJECT_MANAGER completes the quorum personally.
    await decide(secondPmToken, instanceId, 2).expect(200);
  });

  it('US-018: a revoked delegation confers nothing', async () => {
    await seedVersion(1, singleStepRules);
    const instanceId = await startInstance(await seedChangeRequest(requesterId));
    const delegation = await createDelegation(pmToken, {});
    await api(pmToken).post(`/v1/delegations/${delegation.id}:revoke`)
      .set('Idempotency-Key', `cut-revoke-${randomUUID()}`)
      .send({}).expect(200);

    const refused = await decide(delegateToken, instanceId, 1).expect(422);
    expect(refused.body.code).toBe('APPROVER_NOT_FOUND');
    expect(await decisionCount()).toBe(0);
  });

  it('API-113: escalates without transitioning, counts monotonically, refuses terminal instances', async () => {
    await seedVersion(1, singleStepRules);
    const instanceId = await startInstance(await seedChangeRequest(requesterId));

    const first = await api(pmToken).post(`/v1/workflow-instances/${instanceId}:escalate`)
      .set('Idempotency-Key', 'cut-escalate-001')
      .send({ reason: 'Quá hạn phản hồi lần một' }).expect(200);
    expect(first.body.data).toMatchObject({
      escalationCount: 1, state: 'SUBMITTED', currentStepKey: 'REVIEW', versionNo: 1
    });
    expect(first.body.data.lastEscalatedAt).toEqual(expect.any(String));

    const second = await api(pmToken).post(`/v1/workflow-instances/${instanceId}:escalate`)
      .set('Idempotency-Key', 'cut-escalate-002')
      .send({ reason: 'Quá hạn phản hồi lần hai' }).expect(200);
    expect(second.body.data.escalationCount).toBe(2);
    // The optimistic version never moved: escalation is a reminder, not a transition.
    expect(second.body.data.versionNo).toBe(1);

    const events = await dataSource.getRepository(TransactionalOutboxEventEntity).find({
      where: { tenantId, aggregateType: 'WorkflowInstance', eventType: 'WorkflowInstance.EscalationRequested' },
      order: { aggregateVersion: 'ASC' }
    });
    expect(events.map((event) => event.aggregateVersion)).toEqual([1, 2]);
    expect(events[1].payload).toMatchObject({ escalationCount: 2, requestedBy: requesterId });

    // Idempotent replay of the same command returns the recorded answer without a third event.
    const replay = await api(pmToken).post(`/v1/workflow-instances/${instanceId}:escalate`)
      .set('Idempotency-Key', 'cut-escalate-002')
      .send({ reason: 'Quá hạn phản hồi lần hai' }).expect(200);
    expect(replay.body.data.escalationCount).toBe(2);
    expect(await outboxCount('WorkflowInstance', 'WorkflowInstance.EscalationRequested')).toBe(2);

    // Terminal instances cannot be reminded, and the counter does not move.
    await api(pmToken).post(`/v1/workflow-instances/${instanceId}:cancel`)
      .set('Idempotency-Key', 'cut-cancel-001')
      .send({ expectedVersion: 1, reason: 'Rút yêu cầu' }).expect(200);
    const terminal = await api(pmToken).post(`/v1/workflow-instances/${instanceId}:escalate`)
      .set('Idempotency-Key', 'cut-escalate-003')
      .send({ reason: 'Muộn rồi' }).expect(422);
    expect(terminal.body.code).toBe('INVALID_STATE_TRANSITION');
    const stored = await dataSource.getRepository(WorkflowInstanceEntity)
      .findOneByOrFail({ id: instanceId, tenantId });
    expect(stored.escalationCount).toBe(2);

    // No workflow.escalate permission → guard 403.
    await api(requesterToken).post(`/v1/workflow-instances/${instanceId}:escalate`)
      .set('Idempotency-Key', 'cut-escalate-004')
      .send({ reason: 'Không đủ quyền' }).expect(403);
  });

  it('API-130: searches every register under per-branch scope; package reach stays exact', async () => {
    await seedSearchCorpus();

    const wide = await api(pmToken).post('/v1/search')
      .send({ query: 'ALPHA' }).expect(200);
    const byType = new Map<string, string[]>();
    for (const row of wide.body.data as Array<{ type: string; code: string }>) {
      byType.set(row.type, [...(byType.get(row.type) ?? []), row.code]);
    }
    expect(byType.get('PROJECT')).toEqual(['ALPHA-PRJ']);
    expect(byType.get('DOCUMENT')).toEqual(['ALPHA-DOC-001', 'ALPHA-DOC-002']);
    expect(byType.get('RISK')).toEqual(['ALPHA-RSK-001', 'ALPHA-RSK-002']);
    expect(byType.get('ISSUE')).toEqual(['ALPHA-ISS-001']);
    expect(byType.get('CHANGE_REQUEST')).toEqual(['ALPHA-CHG-001']);
    expect(byType.get('CONTRACT')).toEqual(['ALPHA-CT-001']);

    // The package-scoped reader sees only their package's rows; project-level and other-package
    // rows do not exist for them, contracts and projects yield nothing at all.
    const scoped = await api(packageToken).post('/v1/search')
      .send({ query: 'ALPHA' }).expect(200);
    expect((scoped.body.data as Array<{ type: string; code: string }>).map((row) => row.code).sort())
      .toEqual(['ALPHA-DOC-001', 'ALPHA-RSK-001']);

    // Type subset narrows the statement.
    const subset = await api(pmToken).post('/v1/search')
      .send({ query: 'ALPHA', types: ['RISK'] }).expect(200);
    expect((subset.body.data as Array<{ type: string }>).every((row) => row.type === 'RISK'))
      .toBe(true);

    // Requester holds no search.execute.
    await api(requesterToken).post('/v1/search').send({ query: 'ALPHA' }).expect(403);
    // Query shorter than 2 characters is a validation failure.
    await api(pmToken).post('/v1/search').send({ query: 'A' }).expect(400);
  });

  it('API-131/132: private saved views, share-scope refusal, per-owner uniqueness', async () => {
    const created = await api(pmToken).post('/v1/saved-views')
      .set('Idempotency-Key', `cut-view-${randomUUID()}`)
      .send({
        name: 'Rủi ro CRITICAL', targetType: 'RISK',
        filterSnapshot: { status: 'ASSESSED' }, columnSnapshot: ['code', 'status'],
        sortSnapshot: [{ field: 'code', direction: 'ASC' }]
      })
      .expect(201);
    expect(created.body.data).toMatchObject({ shareScope: 'PRIVATE', targetType: 'RISK' });

    const before = await savedViewCount();
    const shared = await api(pmToken).post('/v1/saved-views')
      .set('Idempotency-Key', `cut-view-${randomUUID()}`)
      .send({ name: 'Chia sẻ nhóm', targetType: 'RISK', shareScope: 'TEAM' })
      .expect(422);
    expect(shared.body.code).toBe('SHARE_SCOPE_NOT_SUPPORTED');
    expect(await savedViewCount()).toBe(before);

    const duplicate = await api(pmToken).post('/v1/saved-views')
      .set('Idempotency-Key', `cut-view-${randomUUID()}`)
      .send({ name: 'Rủi ro CRITICAL', targetType: 'RISK' })
      .expect(409);
    expect(duplicate.body.code).toBe('SAVED_VIEW_EXISTS');
    expect(await savedViewCount()).toBe(before);

    // Another owner may reuse the name — and never sees the pm's views in their list.
    await api(packageToken).post('/v1/saved-views')
      .set('Idempotency-Key', `cut-view-${randomUUID()}`)
      .send({ name: 'Rủi ro CRITICAL', targetType: 'RISK' })
      .expect(201);
    const packageList = await api(packageToken).get('/v1/saved-views').expect(200);
    expect(packageList.body.data).toHaveLength(1);

    await api(pmToken).post('/v1/saved-views')
      .set('Idempotency-Key', `cut-view-${randomUUID()}`)
      .send({ name: 'Tài liệu của tôi', targetType: 'DOCUMENT' })
      .expect(201);
    const filtered = await api(pmToken).get('/v1/saved-views?targetType=RISK').expect(200);
    expect(filtered.body.data.map((row: { name: string }) => row.name))
      .toEqual(['Rủi ro CRITICAL']);
    const paged = await api(pmToken).get('/v1/saved-views?limit=1').expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(pmToken)
      .get(`/v1/saved-views?limit=1&cursor=${paged.body.meta.nextCursor}`).expect(200);
    expect(next.body.data[0].id).not.toBe(paged.body.data[0].id);
    await api(pmToken).get('/v1/saved-views?cursor=not-a-cursor').expect(400);
  });

  it('API-133/134: queue → worker → COMPLETED with scoped CSV; requester-only and live re-check', async () => {
    await seedSearchCorpus();

    const created = await api(pmToken).post('/v1/report-jobs')
      .set('Idempotency-Key', `cut-report-${randomUUID()}`)
      .send({ reportType: 'RISK_REGISTER_CSV', projectId })
      .expect(201);
    const jobId = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ status: 'QUEUED', download: null });
    expect(await outboxCount('ReportJob', 'ReportJob.Requested')).toBe(1);

    // A project outside the module scope is a missing project, and nothing is written.
    const jobsBefore = await reportJobCount();
    const invisible = await api(packageToken).post('/v1/report-jobs')
      .set('Idempotency-Key', `cut-report-${randomUUID()}`)
      .send({ reportType: 'RISK_REGISTER_CSV', projectId: hiddenProjectId })
      .expect(404);
    expect(invisible.body.code).toBe('PROJECT_NOT_FOUND');
    expect(await reportJobCount()).toBe(jobsBefore);

    // Simulate the worker inline against the test database.
    const storage = new CapturingReportStorage();
    await runReportProcessor(storage, jobId);

    const completed = await api(pmToken).get(`/v1/report-jobs/${jobId}`).expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(completed.body.data.dataAsOf).toEqual(expect.any(String));
    expect(completed.body.data.expiresAt).toEqual(expect.any(String));
    expect(completed.body.data.download).toEqual({
      bucket: 'it-release-bucket', objectKey: `reports/${tenantId}/${jobId}.csv`
    });
    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0].body).toContain('ALPHA-RSK-001');
    expect(storage.puts[0].body).toContain('ALPHA-RSK-002');

    // The worker re-resolves scope: a package-scoped requester exports only their package's rows.
    const scopedJob = await api(packageToken).post('/v1/report-jobs')
      .set('Idempotency-Key', `cut-report-${randomUUID()}`)
      .send({ reportType: 'RISK_REGISTER_CSV', projectId })
      .expect(201);
    const scopedStorage = new CapturingReportStorage();
    await runReportProcessor(scopedStorage, scopedJob.body.data.id as string);
    expect(scopedStorage.puts[0].body).toContain('ALPHA-RSK-001');
    expect(scopedStorage.puts[0].body).not.toContain('ALPHA-RSK-002');

    // Requester-only: even a report.read holder cannot see someone else's job.
    await api(delegateToken).get(`/v1/report-jobs/${jobId}`).expect(404);
    await api(otherTenantToken, otherTenantId).get(`/v1/report-jobs/${jobId}`).expect(404);

    // Revoking the module permission NOW hides the produced download, not the job status.
    await dataSource.query(
      `UPDATE roles SET permissions = permissions - 'riskChange.read' WHERE tenant_id = $1 AND code = 'PROJECT_MANAGER'`,
      [tenantId]
    );
    const withheld = await api(pmToken).get(`/v1/report-jobs/${jobId}`).expect(200);
    expect(withheld.body.data.status).toBe('COMPLETED');
    expect(withheld.body.data.download).toBeNull();
  });

  it('API-013: audits under a hard tenant mandate with filters and keyset paging', async () => {
    // A platform row (tenant NULL) and a foreign-tenant row must both stay invisible.
    await dataSource.getRepository(AuditEventEntity).insert([
      {
        id: randomUUID(), tenantId: null, actorId: null, action: 'Platform.Maintenance',
        result: 'SUCCEEDED', reasonCode: null, correlationId: randomUUID(), ipHash: null,
        objectType: 'Platform', objectId: null, payload: null
      },
      {
        id: randomUUID(), tenantId: otherTenantId, actorId: otherTenantUserId,
        action: 'Foreign.Action', result: 'SUCCEEDED', reasonCode: null,
        correlationId: randomUUID(), ipHash: null, objectType: 'Foreign', objectId: null,
        payload: null
      }
    ]);
    await createDelegation(pmToken, {});

    const listed = await api(adminToken).get('/v1/audit-events').expect(200);
    const actions = (listed.body.data as Array<{ action: string }>).map((row) => row.action);
    expect(actions).toContain('Delegation.Created');
    expect(actions).not.toContain('Platform.Maintenance');
    expect(actions).not.toContain('Foreign.Action');

    const filtered = await api(adminToken)
      .get('/v1/audit-events?objectType=Delegation&action=Delegation.Created').expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0]).toMatchObject({
      action: 'Delegation.Created', actorId: pmId, objectType: 'Delegation'
    });

    const empty = await api(adminToken)
      .get('/v1/audit-events?occurredTo=2000-01-01T00:00:00.000Z').expect(200);
    expect(empty.body.data).toEqual([]);

    const paged = await api(adminToken).get('/v1/audit-events?limit=1').expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(adminToken)
      .get(`/v1/audit-events?limit=1&cursor=${paged.body.meta.nextCursor}`).expect(200);
    expect(next.body.data[0].id).not.toBe(paged.body.data[0].id);

    await api(adminToken).get('/v1/audit-events?cursor=not-a-cursor').expect(400);
    // pm holds no audit.read.
    await api(pmToken).get('/v1/audit-events').expect(403);
  });

  /** Drives the worker's report processor directly against the test database. */
  async function runReportProcessor(storage: CapturingReportStorage, jobId: string): Promise<void> {
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        const rows: unknown = await dataSource.query(sql, params as never[]);
        const list = Array.isArray(rows) ? rows : [];
        return { rows: list, rowCount: list.length };
      }
    } as unknown as PoolClient;
    const outbox = await dataSource.getRepository(TransactionalOutboxEventEntity)
      .findOneByOrFail({ tenantId, aggregateId: jobId, eventType: 'ReportJob.Requested' });
    const event: DomainEventJob = {
      eventId: outbox.id, tenantId, actorId: outbox.actorId, eventKey: outbox.eventKey,
      aggregateType: outbox.aggregateType, aggregateId: outbox.aggregateId,
      aggregateVersion: outbox.aggregateVersion, eventType: outbox.eventType,
      schemaVersion: outbox.schemaVersion, payload: outbox.payload,
      occurredAt: outbox.occurredAt.toISOString(), correlationId: outbox.correlationId
    };
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
    await new ReportJobProcessor(storage, logger).process(client, event);
  }

  function delegationPayload(overrides: Record<string, unknown>) {
    return {
      delegateId,
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      effectiveTo: '2026-12-31T00:00:00.000Z',
      reason: 'Nghỉ phép dài ngày, ủy quyền phê duyệt',
      ...overrides
    };
  }

  async function createDelegation(token: string, overrides: Record<string, unknown>) {
    const response = await api(token).post('/v1/delegations')
      .set('Idempotency-Key', `cut-delegation-${randomUUID()}`)
      .send(delegationPayload(overrides))
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  async function startInstance(changeId: string): Promise<string> {
    const response = await api(requesterToken).post('/v1/workflow-instances')
      .set('Idempotency-Key', `cut-start-${randomUUID()}`)
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: changeId })
      .expect(201);
    return response.body.data.id as string;
  }

  function decide(token: string, instanceId: string, expectedVersion: number) {
    return api(token).post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', `cut-decide-${randomUUID()}`)
      .send({
        decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion, comment: 'Đồng ý phê duyệt'
      });
  }

  function assignmentCount(): Promise<number> {
    return dataSource.getRepository(RoleAssignmentEntity).countBy({ tenantId });
  }

  function delegationCount(): Promise<number> {
    return dataSource.getRepository(DelegationEntity).countBy({ tenantId });
  }

  function decisionCount(): Promise<number> {
    return dataSource.getRepository(ApprovalDecisionEntity).countBy({ tenantId });
  }

  function savedViewCount(): Promise<number> {
    return dataSource.getRepository(SavedViewEntity).countBy({ tenantId });
  }

  function reportJobCount(): Promise<number> {
    return dataSource.getRepository(ReportJobEntity).countBy({ tenantId });
  }

  function outboxCount(aggregateType: string, eventType: string): Promise<number> {
    return dataSource.getRepository(TransactionalOutboxEventEntity)
      .countBy({ tenantId, aggregateType, eventType });
  }

  async function roleIdOf(code: string): Promise<string> {
    const role = await dataSource.getRepository(RoleEntity).findOneByOrFail({ tenantId, code });
    return role.id;
  }

  async function seedVersion(version: number, rules: unknown): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(WorkflowVersionEntity).insert({
      id, tenantId, workflowDefinitionId: definitionId, version,
      status: WorkflowVersionStatus.PUBLISHED,
      routingRules: rules as never,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null,
      rulesHash: createHash('sha256').update(JSON.stringify(rules)).digest('hex'),
      createdBy: adminId, publishedBy: pmId, publishedAt: new Date('2026-02-01T00:00:00.000Z')
    });
    return id;
  }

  async function seedChangeRequest(changeRequesterId: string): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(ChangeRequestEntity).insert({
      id, tenantId, projectId, packageId: null, code: `CHG-${id.slice(0, 8).toUpperCase()}`,
      title: 'Điều chỉnh phạm vi', reason: 'Thay đổi thiết kế',
      options: ['Giữ nguyên', 'Điều chỉnh'], recommendation: 'Điều chỉnh có kiểm soát',
      ownerId: changeRequesterId, requesterId: changeRequesterId, sourceBaselineId: null,
      sourceType: ChangeSourceType.MANUAL, sourceRiskId: null, sourceIssueId: null,
      evidenceRefs: [], sourceEvidenceSnapshot: [], impactDraft: {},
      impactSnapshot: null, impactSnapshotHash: null, approvalSnapshot: null,
      approvalSnapshotHash: null, status: ChangeRequestStatus.DRAFT,
      submittedBy: null, submittedAt: null, decisionVersion: null, decidedBy: null,
      decidedAt: null, approvedBy: null, approvedAt: null, decisionComment: null,
      scheduleImpactApproved: false, createdBy: changeRequesterId, updatedBy: changeRequesterId
    });
    return id;
  }

  /** Register rows named ALPHA-* so one query exercises every search branch. */
  async function seedSearchCorpus(): Promise<void> {
    await dataSource.query(`INSERT INTO risks (
      id, tenant_id, project_id, package_id, code, category, cause, event, impact,
      probability, cost_impact_rating, schedule_impact_rating, hse_impact_rating,
      impact_rating, inherent_exposure, inherent_level, scoring_version,
      threshold_version, owner_id, review_date, status, created_by, updated_by
    ) VALUES
      ($1, $3, $4, $5, 'ALPHA-RSK-001', 'DELIVERY', 'Nguyên nhân', 'Ngập hố móng khu ALPHA',
        'Ảnh hưởng tiến độ', 4, 4, 2, 1, 4, 16, 'HIGH', 'RISK_SCORING_V1',
        'RISK_CHANGE_THRESHOLDS_V1', $6, '2026-08-01', 'ASSESSED', $6, $6),
      ($2, $3, $4, NULL, 'ALPHA-RSK-002', 'DELIVERY', 'Nguyên nhân', 'Chậm vật tư khu ALPHA',
        'Ảnh hưởng tiến độ', 4, 4, 2, 1, 4, 16, 'HIGH', 'RISK_SCORING_V1',
        'RISK_CHANGE_THRESHOLDS_V1', $6, '2026-08-01', 'ASSESSED', $6, $6)
    `, [randomUUID(), randomUUID(), tenantId, projectId, packageAId, pmId]);
    await dataSource.getRepository(IssueEntity).query(`INSERT INTO issues (
      id, tenant_id, project_id, package_id, code, title, description, occurred_at,
      root_cause, actual_impact, severity, owner_id, target_date, status, created_by, updated_by
    ) VALUES ($1, $2, $3, NULL, 'ALPHA-ISS-001', 'Sự cố ALPHA', 'Mô tả', '2026-07-01T00:00:00Z',
      'Gốc rễ', 'Ảnh hưởng', 'MEDIUM', $4, '2026-08-02', 'IN_PROGRESS', $4, $4)
    `, [randomUUID(), tenantId, projectId, pmId]);
    await dataSource.getRepository(ChangeRequestEntity).insert({
      id: randomUUID(), tenantId, projectId, packageId: null, code: 'ALPHA-CHG-001',
      title: 'Thay đổi ALPHA', reason: 'Lý do', options: ['A'], recommendation: 'A',
      ownerId: pmId, requesterId: pmId, sourceBaselineId: null,
      sourceType: ChangeSourceType.MANUAL, sourceRiskId: null, sourceIssueId: null,
      evidenceRefs: [], sourceEvidenceSnapshot: [], impactDraft: {},
      impactSnapshot: null, impactSnapshotHash: null, approvalSnapshot: null,
      approvalSnapshotHash: null, status: ChangeRequestStatus.DRAFT,
      submittedBy: null, submittedAt: null, decisionVersion: null, decidedBy: null,
      decidedAt: null, approvedBy: null, approvedAt: null, decisionComment: null,
      scheduleImpactApproved: false, createdBy: pmId, updatedBy: pmId
    });
    await dataSource.getRepository(DocumentEntity).save([
      {
        id: randomUUID(), tenantId, projectId, packageId: packageAId,
        documentCode: 'ALPHA-DOC-001', title: 'Bản vẽ ALPHA gói A', discipline: 'CIVIL',
        type: 'DRAWING', classification: DocumentClassification.INTERNAL,
        ownerId: pmId, currentRevisionId: null, legalHold: false,
        status: DocumentRecordStatus.ACTIVE, createdBy: pmId, updatedBy: pmId
      },
      {
        id: randomUUID(), tenantId, projectId, packageId: null,
        documentCode: 'ALPHA-DOC-002', title: 'Bản vẽ ALPHA toàn dự án', discipline: 'CIVIL',
        type: 'DRAWING', classification: DocumentClassification.INTERNAL,
        ownerId: pmId, currentRevisionId: null, legalHold: false,
        status: DocumentRecordStatus.ACTIVE, createdBy: pmId, updatedBy: pmId
      }
    ]);
    await dataSource.getRepository(ContractEntity).query(`INSERT INTO contracts (
      id, tenant_id, project_id, contract_no, title, type, status, value, currency,
      created_by, updated_by
    ) VALUES ($1, $2, $3, 'ALPHA-CT-001', 'Hợp đồng ALPHA', 'EPC', 'DRAFT', 1000, 'VND', $4, $4)
    `, [randomUUID(), tenantId, projectId, pmId]);
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'cut-test', name: 'Cross-cutting Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'cut-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(adminId, tenantId, 'cut-admin@example.test', 'Tenant Admin'),
      user(pmId, tenantId, 'cut-pm@example.test', 'Project Manager'),
      user(secondPmId, tenantId, 'cut-pm2@example.test', 'Second Project Manager'),
      user(delegateId, tenantId, 'cut-delegate@example.test', 'Delegate'),
      user(requesterId, tenantId, 'cut-requester@example.test', 'Requester'),
      user(packageUserId, tenantId, 'cut-package@example.test', 'Package Reader'),
      user(otherTenantUserId, otherTenantId, 'cut-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(adminId, tenantId), credential(pmId, tenantId),
      credential(secondPmId, tenantId), credential(delegateId, tenantId),
      credential(requesterId, tenantId), credential(packageUserId, tenantId),
      credential(otherTenantUserId, otherTenantId)
    ]);

    const adminRole = await role(tenantId, 'TENANT_ADMIN', [
      'permission.read.self', 'tenant.read', 'roleAssignment.grant', 'roleAssignment.revoke',
      'audit.read', 'delegation.revoke', 'workflow.read'
    ], 5);
    const pmRole = await role(tenantId, 'PROJECT_MANAGER', [
      'permission.read.self', 'workflow.start', 'workflow.read', 'approvalTask.read',
      'approval.decide', 'workflow.escalate', 'workflow.cancel',
      'delegation.create', 'delegation.revoke',
      'search.execute', 'savedView.read', 'savedView.create', 'report.create', 'report.read',
      'project.read', 'riskChange.read', 'document.read', 'contract.read'
    ], 11);
    // Holds approval.decide (so the guard passes) but NOT the step role: only a delegation makes
    // this account count. report.read proves API-134 requester-only is not a permission test.
    const delegateRole = await role(tenantId, 'CC_DELEGATE', [
      'permission.read.self', 'approval.decide', 'workflow.read', 'delegation.create',
      'report.read'
    ], 3);
    // Deliberately without permission.read.self / search.execute / audit.read.
    const requesterRole = await role(tenantId, 'CC_REQUESTER', [
      'workflow.start', 'workflow.read'
    ], 3);
    const packageRole = await role(tenantId, 'CC_PKG', [
      'permission.read.self', 'search.execute', 'savedView.read', 'savedView.create',
      'riskChange.read', 'document.read', 'contract.read', 'report.create', 'report.read'
    ], 3);
    const otherRole = await role(otherTenantId, 'CC_OTHER', [
      'permission.read.self', 'roleAssignment.revoke', 'report.read'
    ], 3);

    await seedProject(tenantId, projectId, 'ALPHA-PRJ', 'Dự án ALPHA');
    await seedProject(tenantId, hiddenProjectId, 'BETA-PRJ', 'Dự án BETA');
    await seedProject(otherTenantId, otherProjectId, 'OTHER-PRJ', 'Dự án tenant khác');
    await dataSource.getRepository(PackageEntity).save([
      {
        id: packageAId, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
        code: 'ALPHA-PKG-A', name: 'Gói A', packageType: 'EPC', status: PackageStatus.ACTIVE,
        versionNo: 1, idempotencyKey: null, createdBy: pmId, updatedBy: pmId
      },
      {
        id: packageBId, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
        code: 'ALPHA-PKG-B', name: 'Gói B', packageType: 'EPC', status: PackageStatus.ACTIVE,
        versionNo: 1, idempotencyKey: null, createdBy: pmId, updatedBy: pmId
      }
    ]);

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, adminId, adminRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, pmId, pmRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, secondPmId, pmRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, delegateId, delegateRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, requesterId, requesterRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageAId),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);

    await dataSource.getRepository(WorkflowDefinitionEntity).insert({
      id: definitionId, tenantId, code: 'WF-CHANGE', name: 'Change approval',
      objectType: WorkflowObjectType.CHANGE_REQUEST, processOwnerId: adminId,
      status: WorkflowDefinitionStatus.ACTIVE, createdBy: adminId, updatedBy: adminId
    });
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, name: string
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
      projectManagerId: fixtureTenantId === tenantId ? pmId : otherTenantUserId,
      code, name, type: ProjectType.SOLAR, phase: ProjectPhase.PLANNING,
      recordStatus: ProjectRecordStatus.ACTIVE, contractModel: 'EPC', currency: 'VND',
      plannedCod: '2027-12-31', forecastCod: null, versionNo: 1, idempotencyKey: null
    });
  }

  async function role(
    fixtureTenantId: string, code: string, permissions: string[], policyVersion: number
  ) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion, status: MasterRecordStatus.ACTIVE
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
      post: (path: string) => authorized(request(app.getHttpServer()).post(path)),
      delete: (path: string) => authorized(request(app.getHttpServer()).delete(path))
    };
  }
});
