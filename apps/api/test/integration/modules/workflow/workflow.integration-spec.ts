import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import {
  ApprovalDecisionEntity, AssignmentScopeType, AuditEventEntity, ChangeRequestEntity,
  ChangeRequestStatus, ChangeSourceType, CompanyEntity, LegalEntityEntity,
  LocalCredentialEntity, MasterRecordStatus, OrganizationType, PackageEntity, PackageStatus,
  PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus, ProjectType,
  RoleAssignmentEntity, RoleEntity, TenantEntity, TransactionalOutboxEventEntity,
  UserAccountEntity, WorkflowDefinitionEntity, WorkflowDefinitionStatus,
  WorkflowInstanceEntity, WorkflowObjectType, WorkflowVersionEntity, WorkflowVersionStatus
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const adminId = randomUUID();
const authorId = randomUUID();
const requesterId = randomUUID();
const approverId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const hiddenProjectId = randomUUID();
const otherProjectId = randomUUID();
const packageId = randomUUID();
const definitionId = randomUUID();
const password = 'Workflow!Integration2026';

const singleStepRules = {
  version: 1,
  steps: [{
    key: 'REVIEW', order: 1, rule: 'ALL',
    approverSelector: { roleCodes: ['WF_APPROVER'], scope: 'PROJECT' },
    fallbackRoleCodes: ['WF_ADMIN']
  }],
  conditions: []
};

const twoStepRules = {
  version: 1,
  steps: [
    {
      key: 'REVIEW', order: 1, rule: 'ALL',
      approverSelector: { roleCodes: ['WF_APPROVER'], scope: 'PROJECT' },
      fallbackRoleCodes: ['WF_ADMIN']
    },
    {
      key: 'ENDORSE', order: 2, rule: 'ALL',
      approverSelector: { roleCodes: ['WF_APPROVER'], scope: 'PROJECT' },
      fallbackRoleCodes: ['WF_ADMIN']
    }
  ],
  conditions: []
};

const invalidRules = { version: 1, steps: [{ key: 'BAD', order: 1 }], conditions: [] };

jest.setTimeout(120_000);

describe('Workflow engine HTTP integration — TEST-068…071 (US-015, API-106…112)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let adminToken: string;
  let authorToken: string;
  let requesterToken: string;
  let approverToken: string;
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
    adminToken = await login('wf-admin@example.test', 'wf-test');
    authorToken = await login('wf-author@example.test', 'wf-test');
    requesterToken = await login('wf-requester@example.test', 'wf-test');
    approverToken = await login('wf-approver@example.test', 'wf-test');
    packageToken = await login('wf-package@example.test', 'wf-test');
    otherTenantToken = await login('wf-other@example.test', 'wf-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-106: lists definitions with their versions', async () => {
    await seedVersion(1, WorkflowVersionStatus.DRAFT, singleStepRules);
    const response = await api(adminToken).get('/v1/workflow-definitions').expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      code: 'WF-CHANGE', objectType: 'ChangeRequest', status: 'ACTIVE'
    });
    expect(response.body.data[0].versions[0]).toMatchObject({ version: 1, status: 'DRAFT' });
    expect(response.body.meta).toEqual({ limit: 50, nextCursor: null });
  });

  it('API-107: publishes a draft, supersedes the previous version and blocks self-publish', async () => {
    const first = await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const second = await seedVersion(2, WorkflowVersionStatus.DRAFT, twoStepRules);

    // BR-034: the author cannot release their own draft.
    const sod = await api(authorToken).post(`/v1/workflow-definitions/${definitionId}:publish`)
      .set('Idempotency-Key', 'wf-publish-sod')
      .send({ workflowVersionId: second, expectedVersion: 2, comment: 'Tự publish' })
      .expect(403);
    expect(sod.body.code).toBe('WORKFLOW_PUBLISH_SOD');

    const published = await api(adminToken).post(`/v1/workflow-definitions/${definitionId}:publish`)
      .set('Idempotency-Key', 'wf-publish-ok')
      .send({ workflowVersionId: second, expectedVersion: 2, comment: 'Phê duyệt cấu hình' })
      .expect(200);
    expect(published.body.data).toMatchObject({ version: 2, status: 'PUBLISHED' });

    const rows = await dataSource.getRepository(WorkflowVersionEntity)
      .find({ where: { tenantId }, order: { version: 'ASC' } });
    expect(rows.map((row) => row.status)).toEqual(['SUPERSEDED', 'PUBLISHED']);
    expect(rows[0].id).toBe(first);
  });

  it('API-107: refuses to publish rules that do not validate, writing nothing', async () => {
    const versionId = await seedVersion(1, WorkflowVersionStatus.DRAFT, invalidRules);
    const response = await api(adminToken).post(`/v1/workflow-definitions/${definitionId}:publish`)
      .set('Idempotency-Key', 'wf-publish-invalid')
      .send({ workflowVersionId: versionId, expectedVersion: 1, comment: 'Thử publish' })
      .expect(400);
    expect(response.body.code).toBe('WORKFLOW_RULES_INVALID');
    expect(response.body.issues.map((issue: { code: string }) => issue.code))
      .toEqual(expect.arrayContaining(['STEP_RULE_INVALID', 'SELECTOR_REQUIRED', 'FALLBACK_REQUIRED']));

    const stored = await dataSource.getRepository(WorkflowVersionEntity)
      .findOneByOrFail({ id: versionId, tenantId });
    expect(stored.status).toBe(WorkflowVersionStatus.DRAFT);
    expect(await countAudit()).toBe(0);
  });

  it('API-108/109: starts an instance from the published route and freezes it', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const changeId = await seedChangeRequest();

    const started = await api(requesterToken).post('/v1/workflow-instances')
      .set('Idempotency-Key', 'wf-start-001')
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: changeId })
      .expect(201);
    expect(started.body.data).toMatchObject({
      objectType: 'ChangeRequest', objectId: changeId, projectId,
      state: 'SUBMITTED', currentStepKey: 'REVIEW', currentAttemptNo: 1, versionNo: 1
    });
    // Scope is taken from the aggregate, never the request body.
    expect(started.body.data.packageId).toBe(packageId);
    expect(started.body.data.requestedBy).toBe(requesterId);

    const replay = await api(requesterToken).post('/v1/workflow-instances')
      .set('Idempotency-Key', 'wf-start-001')
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: changeId })
      .expect(201);
    expect(replay.body.data.id).toBe(started.body.data.id);

    const detail = await api(approverToken)
      .get(`/v1/workflow-instances/${started.body.data.id}`).expect(200);
    expect(detail.body.data.routeHash).toBe(started.body.data.routeHash);
    expect(detail.body.decisions).toEqual([]);
  });

  it('API-108: one object cannot be in two live instances at once', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const changeId = await seedChangeRequest();
    await startInstance(changeId, 'wf-start-dup-1');
    const second = await api(requesterToken).post('/v1/workflow-instances')
      .set('Idempotency-Key', 'wf-start-dup-2')
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: changeId })
      .expect(409);
    expect(second.body.code).toBe('WORKFLOW_INSTANCE_ACTIVE');
  });

  it('API-108: refuses to start when no version is published', async () => {
    await seedVersion(1, WorkflowVersionStatus.DRAFT, singleStepRules);
    const changeId = await seedChangeRequest();
    const response = await api(requesterToken).post('/v1/workflow-instances')
      .set('Idempotency-Key', 'wf-start-nopub')
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: changeId })
      .expect(422);
    expect(response.body.code).toBe('WORKFLOW_VERSION_NOT_PUBLISHED');
  });

  it('API-111: approves through to the end, writing an append-only ledger and audit/outbox', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, twoStepRules, adminId);
    const changeId = await seedChangeRequest();
    const instanceId = await startInstance(changeId, 'wf-start-approve');

    const first = await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Đồng ý bước một'
    });
    expect(first.body.data).toMatchObject({ state: 'IN_REVIEW', currentStepKey: 'ENDORSE' });

    const second = await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'ENDORSE', expectedVersion: first.body.data.versionNo,
      comment: 'Đồng ý bước hai'
    });
    expect(second.body.data).toMatchObject({ state: 'APPROVED', currentStepKey: null });
    expect(second.body.data.closedAt).toEqual(expect.any(String));

    const decisions = await dataSource.getRepository(ApprovalDecisionEntity)
      .find({ where: { tenantId, workflowInstanceId: instanceId }, order: { sequenceNo: 'ASC' } });
    expect(decisions.map((row) => [row.sequenceNo, row.stepKey, row.decision]))
      .toEqual([[1, 'REVIEW', 'APPROVE'], [2, 'ENDORSE', 'APPROVE']]);
    // effective_actor_id exists from day one so delegation can populate it without a migration.
    expect(decisions.every((row) => row.effectiveActorId === row.actorId)).toBe(true);

    const events = await dataSource.getRepository(TransactionalOutboxEventEntity)
      .findBy({ tenantId, aggregateId: instanceId });
    expect(events.map((row) => row.eventType)).toEqual(expect.arrayContaining([
      'WorkflowInstance.Started', 'WorkflowInstance.StepAdvanced', 'WorkflowInstance.Approved'
    ]));
  });

  it('API-111: the decision ledger cannot be rewritten', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-immutable');
    await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Chốt'
    });
    await expect(dataSource.query(
      `UPDATE approval_decisions SET comment = 'sửa lại' WHERE tenant_id = $1`, [tenantId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(dataSource.query(
      'DELETE FROM approval_decisions WHERE tenant_id = $1', [tenantId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('API-111: RETURN reopens the same step under a new attempt so it can be redecided', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-return');

    const returned = await decide(approverToken, instanceId, {
      decision: 'RETURN', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Thiếu đánh giá tác động'
    });
    expect(returned.body.data).toMatchObject({
      state: 'RETURNED', currentStepKey: 'REVIEW', currentAttemptNo: 2
    });

    // Same actor, same step, new attempt: allowed, because this is a legitimate resubmission.
    const approved = await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: returned.body.data.versionNo,
      comment: 'Đã bổ sung, đồng ý'
    });
    expect(approved.body.data.state).toBe('APPROVED');

    const rows = await dataSource.getRepository(ApprovalDecisionEntity)
      .find({ where: { tenantId, workflowInstanceId: instanceId }, order: { sequenceNo: 'ASC' } });
    expect(rows.map((row) => [row.attemptNo, row.decision])).toEqual([[1, 'RETURN'], [2, 'APPROVE']]);
  });

  it('API-111: the same actor cannot decide the same step twice within one attempt', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, twoStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-double');
    const first = await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Lần một'
    });
    // Re-target the step it already left; the guard is the state check, then the unique index.
    const repeat = await api(approverToken)
      .post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', 'wf-decide-repeat')
      .send({
        decision: 'APPROVE', stepKey: 'REVIEW',
        expectedVersion: first.body.data.versionNo, comment: 'Lần hai'
      })
      .expect(422);
    expect(repeat.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('API-111: the requester may never decide their own submission', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-sod');
    const response = await api(requesterToken)
      .post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', 'wf-decide-sod')
      .send({ decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Tự duyệt' })
      .expect(403);
    expect(response.body.code).toBe('SOD_CONFLICT');
    expect(await countDecisions()).toBe(0);
  });

  it('API-111: an actor without the step role is refused', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-role');
    const response = await api(packageToken)
      .post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', 'wf-decide-role')
      .send({ decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Không đủ vai trò' })
      .expect(403);
    // PACKAGE_OWNER-equivalent role has no approval.decide grant at all.
    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(await countDecisions()).toBe(0);
  });

  it('API-111: a stale expectedVersion conflicts and writes nothing', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, twoStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-stale');
    await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Bước một'
    });
    const stale = await api(approverToken)
      .post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', 'wf-decide-stale')
      .send({
        decision: 'APPROVE', stepKey: 'ENDORSE', expectedVersion: 1,
        comment: 'Dùng phiên bản cũ'
      })
      .expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.currentVersion).toBe(2);
    expect(await countDecisions()).toBe(1);
  });

  it('API-111: conditional approve stays disabled until the non-waivable control list exists', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-conditional');
    const response = await api(approverToken)
      .post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', 'wf-decide-conditional')
      .send({
        decision: 'CONDITIONAL_APPROVE', stepKey: 'REVIEW',
        expectedVersion: 1, comment: 'Duyệt kèm điều kiện'
      })
      .expect(422);
    expect(response.body.code).toBe('CONDITIONAL_APPROVE_NOT_ENABLED');
    expect(await countDecisions()).toBe(0);
  });

  it('API-112: cancels per policy and refuses to act on a terminal instance', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-cancel');

    const cancelled = await api(approverToken)
      .post(`/v1/workflow-instances/${instanceId}:cancel`)
      .set('Idempotency-Key', 'wf-cancel-001')
      .send({ expectedVersion: 1, reason: 'Change request đã rút lại' })
      .expect(200);
    expect(cancelled.body.data).toMatchObject({ state: 'CANCELLED', currentStepKey: null });

    const again = await api(approverToken)
      .post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', 'wf-decide-after-cancel')
      .send({
        decision: 'APPROVE', stepKey: 'REVIEW',
        expectedVersion: cancelled.body.data.versionNo, comment: 'Quá muộn'
      })
      .expect(422);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('API-109/110: out-of-scope and cross-tenant readers cannot see an instance', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-scope');

    // Package-scoped actor holds a different package, so the instance is invisible, not forbidden.
    await api(packageToken).get(`/v1/workflow-instances/${instanceId}`).expect(404);
    const inbox = await api(packageToken).get('/v1/approval-tasks').expect(200);
    expect(inbox.body.data).toEqual([]);

    await api(otherTenantToken, otherTenantId)
      .get(`/v1/workflow-instances/${instanceId}`).expect(404);

    const authorized = await api(approverToken).get('/v1/approval-tasks').expect(200);
    expect(authorized.body.data.map((item: { id: string }) => item.id)).toEqual([instanceId]);
  });

  it('API-110: terminal instances leave the inbox', async () => {
    await seedVersion(1, WorkflowVersionStatus.PUBLISHED, singleStepRules, adminId);
    const instanceId = await startInstance(await seedChangeRequest(), 'wf-start-inbox');
    expect((await api(approverToken).get('/v1/approval-tasks').expect(200)).body.data)
      .toHaveLength(1);
    await decide(approverToken, instanceId, {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Xong'
    });
    expect((await api(approverToken).get('/v1/approval-tasks').expect(200)).body.data)
      .toEqual([]);
  });

  it('rejects a malformed cursor and requires an Idempotency-Key on commands', async () => {
    const cursor = await api(adminToken)
      .get('/v1/workflow-definitions?cursor=not-a-cursor').expect(400);
    expect(cursor.body.code).toBe('INVALID_CURSOR');

    const missingKey = await api(requesterToken).post('/v1/workflow-instances')
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: randomUUID() })
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  async function startInstance(changeId: string, key: string): Promise<string> {
    const response = await api(requesterToken).post('/v1/workflow-instances')
      .set('Idempotency-Key', key)
      .send({ workflowDefinitionId: definitionId, objectType: 'ChangeRequest', objectId: changeId })
      .expect(201);
    return response.body.data.id as string;
  }

  function decide(token: string, instanceId: string, body: Record<string, unknown>) {
    return api(token).post(`/v1/workflow-instances/${instanceId}/decisions`)
      .set('Idempotency-Key', `wf-decide-${randomUUID()}`)
      .send(body).expect(200);
  }

  function countDecisions(): Promise<number> {
    return dataSource.getRepository(ApprovalDecisionEntity).countBy({ tenantId });
  }

  function countAudit(): Promise<number> {
    return dataSource.getRepository(AuditEventEntity)
      .countBy({ tenantId, objectType: 'WorkflowVersion' });
  }

  async function seedVersion(
    version: number, status: WorkflowVersionStatus,
    rules: unknown, publishedBy: string | null = null
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(WorkflowVersionEntity).insert({
      id, tenantId, workflowDefinitionId: definitionId, version, status,
      routingRules: rules as never,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: null,
      rulesHash: createHash('sha256').update(JSON.stringify(rules)).digest('hex'),
      createdBy: authorId,
      publishedBy: status === WorkflowVersionStatus.DRAFT ? null : publishedBy,
      publishedAt: status === WorkflowVersionStatus.DRAFT ? null : new Date('2026-02-01T00:00:00.000Z')
    });
    return id;
  }

  async function seedChangeRequest(): Promise<string> {
    const id = randomUUID();
    await dataSource.getRepository(ChangeRequestEntity).insert({
      id, tenantId, projectId, packageId, code: `CHG-${id.slice(0, 8).toUpperCase()}`,
      title: 'Điều chỉnh phạm vi', reason: 'Thay đổi thiết kế',
      options: ['Giữ nguyên', 'Điều chỉnh'], recommendation: 'Điều chỉnh có kiểm soát',
      ownerId: requesterId, requesterId, sourceBaselineId: null,
      sourceType: ChangeSourceType.MANUAL, sourceRiskId: null, sourceIssueId: null,
      evidenceRefs: [], sourceEvidenceSnapshot: [], impactDraft: {},
      impactSnapshot: null, impactSnapshotHash: null, approvalSnapshot: null,
      approvalSnapshotHash: null, status: ChangeRequestStatus.DRAFT,
      submittedBy: null, submittedAt: null, decisionVersion: null, decidedBy: null,
      decidedAt: null, approvedBy: null, approvedAt: null, decisionComment: null,
      scheduleImpactApproved: false, createdBy: requesterId, updatedBy: requesterId
    });
    return id;
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'wf-test', name: 'Workflow Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'wf-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(adminId, tenantId, 'wf-admin@example.test', 'Workflow Admin'),
      user(authorId, tenantId, 'wf-author@example.test', 'Workflow Author'),
      user(requesterId, tenantId, 'wf-requester@example.test', 'Change Requester'),
      user(approverId, tenantId, 'wf-approver@example.test', 'Independent Approver'),
      user(packageUserId, tenantId, 'wf-package@example.test', 'Package Reader'),
      user(otherTenantUserId, otherTenantId, 'wf-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(adminId, tenantId), credential(authorId, tenantId),
      credential(requesterId, tenantId), credential(approverId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const adminRole = await role(tenantId, 'WF_ADMIN', [
      'workflowDefinition.read', 'workflowDefinition.publish', 'workflow.read', 'approvalTask.read'
    ]);
    const authorRole = await role(tenantId, 'WF_AUTHOR', [
      'workflowDefinition.read', 'workflowDefinition.publish', 'workflow.read'
    ]);
    const requesterRole = await role(tenantId, 'WF_REQUESTER', [
      'workflow.start', 'workflow.read', 'approvalTask.read', 'approval.decide'
    ]);
    const approverRole = await role(tenantId, 'WF_APPROVER', [
      'workflow.read', 'approvalTask.read', 'approval.decide', 'workflow.cancel'
    ]);
    // Deliberately has read access but no approval.decide, to prove the guard denies first.
    const packageRole = await role(tenantId, 'WF_PACKAGE', ['workflow.read', 'approvalTask.read']);
    const otherRole = await role(otherTenantId, 'WF_OTHER', [
      'workflow.read', 'approvalTask.read', 'approval.decide'
    ]);

    await seedProject(tenantId, projectId, 'WFP', 'Workflow Project');
    await seedProject(tenantId, hiddenProjectId, 'WFH', 'Hidden Project');
    await seedProject(otherTenantId, otherProjectId, 'WFO', 'Other Tenant Project');
    await dataSource.getRepository(PackageEntity).save({
      id: packageId, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
      code: 'WF-PKG', name: 'Workflow Package', packageType: 'EPC',
      status: PackageStatus.ACTIVE, versionNo: 1, idempotencyKey: null,
      createdBy: requesterId, updatedBy: requesterId
    });

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, adminId, adminRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, authorId, authorRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, requesterId, requesterRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, approverId, approverRole.id, AssignmentScopeType.TENANT, null),
      // Scoped to the hidden project so the workflow project's instance is out of reach.
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PROJECT, hiddenProjectId),
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
      projectManagerId: fixtureTenantId === tenantId ? requesterId : otherTenantUserId,
      code, name, type: ProjectType.SOLAR, phase: ProjectPhase.PLANNING,
      recordStatus: ProjectRecordStatus.ACTIVE, contractModel: 'EPC', currency: 'VND',
      plannedCod: '2027-12-31', forecastCod: null, versionNo: 1, idempotencyKey: null
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

  void WorkflowInstanceEntity;
});
