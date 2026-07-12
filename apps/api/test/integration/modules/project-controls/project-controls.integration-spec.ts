import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApplication } from 'src/bootstrap';
import {
  AlertType, AssignmentScopeType, CompanyEntity, LegalEntityEntity, LocalCredentialEntity,
  MasterRecordStatus, NotificationPriority, NotificationStatus, OrganizationType,
  PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus, ProjectType,
  RoleAssignmentEntity, RoleEntity, ScheduleNotificationEntity, TenantEntity,
  UserAccountEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const plannerId = randomUUID();
const approverId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const password = 'Controls!Integration2026';

interface DraftPayload {
  mode: 'PREVIEW' | 'COMMIT';
  expectedVersion: number;
  source: { format: 'MANUAL'; sourceName: string };
  calendar: {
    timezone: string;
    calendarCode: string;
    workingWeek: number[];
    exceptions: Array<{ date: string; working: boolean; reason?: string }>;
  };
  wbsUpserts: Array<{
    clientRef: string;
    packageId?: string;
    code: string;
    name: string;
    weight: string;
    sortOrder: number;
  }>;
  activityUpserts: Array<{
    clientRef: string;
    wbsClientRef: string;
    packageId?: string;
    ownerId: string;
    code: string;
    name: string;
    activityType: 'TASK' | 'MILESTONE';
    weight: string;
    plannedStart: string;
    plannedFinish?: string;
    durationWorkDays: number;
  }>;
  dependencyUpserts: Array<{
    predecessorClientRef: string;
    successorClientRef: string;
    dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
    lagWorkDays: number;
  }>;
  archiveWbsIds: string[];
  archiveActivityIds: string[];
  unlinkDependencyIds: string[];
}

jest.setTimeout(60_000);

describe('Project Controls API integration — TEST-010…013/185/193/195', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let plannerToken: string;
  let approverToken: string;
  let contractorCompanyId: string;
  let packageRoleId: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await hash(password);
    app = await createApplication();
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    await seedIdentityAndProjects();
    plannerToken = await login('planner@example.test');
    approverToken = await login('approver@example.test');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('TEST-010/180: creates and lists a package with stable idempotency and atomic evidence', async () => {
    const key = 'controls-package-create-001';
    const payload = {
      code: 'EPC_MAIN', name: 'Gói EPC chính', packageType: 'EPC', contractorCompanyId
    };
    const first = await api(plannerToken).post(`/v1/projects/${projectId}/packages`)
      .set('Idempotency-Key', key).send(payload).expect(201);
    const replay = await api(plannerToken).post(`/v1/projects/${projectId}/packages`)
      .set('Idempotency-Key', key).send(payload).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(first.body.data).toMatchObject({
      projectId, code: 'EPC_MAIN', status: 'ACTIVE', versionNo: 1
    });

    const listed = await api(plannerToken).get(`/v1/projects/${projectId}/packages`).expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(first.body.data.id);

    const conflict = await api(plannerToken).post(`/v1/projects/${projectId}/packages`)
      .set('Idempotency-Key', key)
      .send({ ...payload, code: 'EPC_CHANGED' }).expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');

    const [evidence] = await dataSource.query<Array<{
      packages: string;
      audits: string;
      events: string;
      receipts: string;
    }>>(`SELECT
      (SELECT count(*) FROM packages WHERE tenant_id = $1 AND code = 'EPC_MAIN')::text AS packages,
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'PACKAGE_CREATED' AND object_id = $2)::text AS audits,
      (SELECT count(*) FROM transactional_outbox_events WHERE tenant_id = $1
        AND event_type = 'PACKAGE_CREATED' AND aggregate_id = $2)::text AS events,
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key = $3 AND state = 'COMPLETED')::text AS receipts`,
    [tenantId, first.body.data.id, key]);
    expect(evidence).toEqual({ packages: '1', audits: '1', events: '1', receipts: '1' });
  });

  it('TEST-010: PREVIEW reports cycle/weight/date issues and writes nothing', async () => {
    const packageId = await createPackage('PREVIEW', 'controls-preview-package');
    const key = 'controls-preview-invalid-001';
    const response = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', key)
      .send(invalidDraft(packageId, 'PREVIEW'))
      .expect(200);
    expect(response.body.data).toMatchObject({
      mode: 'PREVIEW', committed: false, scheduleVersion: null
    });
    const codes = response.body.data.validationIssues.map((issue: { code: string }) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      'WEIGHT_TOTAL_EXCEEDS_100', 'DEPENDENCY_CYCLE', 'INVALID_SCHEDULE_DATE'
    ]));
    await expectNoScheduleSideEffects(key);
  });

  it('TEST-010/180: invalid COMMIT is atomic and leaves no receipt, audit or outbox event', async () => {
    const packageId = await createPackage('ATOMIC', 'controls-atomic-package');
    const key = 'controls-invalid-commit-001';
    const denied = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', key)
      .send(invalidDraft(packageId, 'COMMIT'))
      .expect(422);
    expect(denied.body.code).toBe('SCHEDULE_VALIDATION_FAILED');
    await expectNoScheduleSideEffects(key);
  });

  it('TEST-010/013: atomically commits a schedule, exposes CPM and reads alert projection', async () => {
    const packageId = await createPackage('SCHEDULE', 'controls-schedule-package');
    const key = 'controls-valid-schedule-001';
    const payload = validDraft(packageId);
    const committed = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', key).send(payload).expect(200);
    const replay = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', key).send(payload).expect(200);
    expect(committed.body.data).toMatchObject({
      mode: 'COMMIT', committed: true, scheduleVersion: 1,
      formulaVersion: 'CPM_WORKDAY_V1'
    });
    expect(replay.body.data).toEqual(committed.body.data);

    const schedule = await getSchedule(plannerToken);
    expect(schedule.activities).toHaveLength(2);
    expect(schedule.dependencies).toHaveLength(1);
    expect(schedule.activities.map((item: { plannedFinish: string }) => item.plannedFinish))
      .toEqual(['2026-07-17', '2026-07-24']);
    expect(schedule.activities.every((item: { critical: boolean }) => item.critical)).toBe(true);
    expect(schedule.activities.every((item: { totalFloatWorkDays: number }) => (
      item.totalFloatWorkDays === 0
    ))).toBe(true);

    const firstActivity = schedule.activities[0] as { id: string };
    await dataSource.getRepository(ScheduleNotificationEntity).save({
      id: randomUUID(), tenantId, recipientUserId: plannerId, projectId,
      activityId: firstActivity.id, sourceType: 'ScheduleActivity', sourceId: firstActivity.id,
      alertType: AlertType.OVERDUE, priority: NotificationPriority.HIGH,
      objectLink: `/projects/${projectId}/schedule`, reason: 'Synthetic overdue test alert',
      dueAt: '2026-07-17', dataDate: schedule.dataDate,
      thresholdVersion: 'SCHEDULE_THRESHOLDS_V1', dedupKey: `alert-${randomUUID()}`,
      status: NotificationStatus.UNREAD, readAt: null
    });
    const withAlert = await getSchedule(plannerToken);
    expect(withAlert.alerts).toHaveLength(1);
    expect(withAlert.alerts[0]).toMatchObject({
      activityId: firstActivity.id, alertType: 'OVERDUE', priority: 'HIGH'
    });
    const exported = await api(plannerToken)
      .get(`/v1/projects/${projectId}/schedule-look-ahead.csv`)
      .query({ dataDate: '2026-07-12', lookAheadDays: 21 })
      .expect('Content-Type', /text\/csv/).expect(200);
    expect(exported.text.startsWith('\uFEFF')).toBe(true);
    expect(exported.text).toContain('"ACT_A"');

    const [evidence] = await dataSource.query<Array<{
      schedules: string;
      wbs: string;
      activities: string;
      dependencies: string;
      audits: string;
      exportAudits: string;
      events: string;
      receipts: string;
    }>>(`SELECT
      (SELECT count(*) FROM project_schedules WHERE tenant_id = $1 AND project_id = $2)::text AS schedules,
      (SELECT count(*) FROM wbs_nodes WHERE tenant_id = $1 AND project_id = $2)::text AS wbs,
      (SELECT count(*) FROM schedule_activities WHERE tenant_id = $1 AND project_id = $2)::text AS activities,
      (SELECT count(*) FROM activity_dependencies WHERE tenant_id = $1 AND project_id = $2)::text AS dependencies,
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'SCHEDULE_DRAFT_CHANGED')::text AS audits,
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'SCHEDULE_LOOKAHEAD_EXPORTED' AND object_id IN (
          SELECT id FROM project_schedules WHERE tenant_id = $1 AND project_id = $2
        ))::text AS "exportAudits",
      (SELECT count(*) FROM transactional_outbox_events WHERE tenant_id = $1
        AND event_type = 'ScheduleDraftChanged')::text AS events,
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key = $3 AND state = 'COMPLETED')::text AS receipts`,
    [tenantId, projectId, key]);
    expect(evidence).toEqual({
      schedules: '1', wbs: '1', activities: '2', dependencies: '1',
      audits: '1', exportAudits: '1', events: '1', receipts: '1'
    });
  });

  it('TEST-193: enforces tenant isolation and filters package-scoped schedule reads', async () => {
    const packageA = await createPackage('SCOPE_A', 'controls-scope-package-a');
    const packageB = await createPackage('SCOPE_B', 'controls-scope-package-b');
    await api(plannerToken).post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', 'controls-scope-schedule')
      .send(twoPackageDraft(packageA, packageB)).expect(200);
    await dataSource.getRepository(RoleAssignmentEntity).save({
      id: randomUUID(), tenantId, userAccountId: packageUserId, roleId: packageRoleId,
      scopeType: AssignmentScopeType.PACKAGE, scopeId: packageA,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null,
      status: MasterRecordStatus.ACTIVE
    });
    const scopedToken = await login('package-owner@example.test');

    const scoped = await getSchedule(scopedToken);
    expect(scoped.packages.map((item: { id: string }) => item.id)).toEqual([packageA]);
    expect(scoped.wbsNodes).toHaveLength(1);
    expect(scoped.activities).toHaveLength(1);
    expect(scoped.activities[0].packageId).toBe(packageA);

    const ownUpdate = await api(scopedToken)
      .post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', 'controls-scope-own-package')
      .send(packageScopedDraft('A', packageA, 1, 'Package A task updated'))
      .expect(200);
    expect(ownUpdate.body.data.scheduleVersion).toBe(2);
    const afterOwnUpdate = await getSchedule(scopedToken);
    expect(afterOwnUpdate.activities[0].name).toBe('Package A task updated');

    const denied = await api(scopedToken)
      .post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', 'controls-scope-cross-package')
      .send(packageScopedDraft('B', packageB, 2, 'Unauthorized package B update'))
      .expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    const [version] = await dataSource.query<Array<{ version_no: number }>>(
      'SELECT version_no FROM project_schedules WHERE tenant_id = $1 AND project_id = $2',
      [tenantId, projectId]
    );
    expect(version.version_no).toBe(2);

    const hidden = await api(plannerToken)
      .get(`/v1/projects/${otherProjectId}/schedule`).expect(404);
    expect(hidden.body.code).toBe('PROJECT_NOT_FOUND');
    await api(plannerToken, otherTenantId)
      .get(`/v1/projects/${otherProjectId}/schedule`).expect(403);
  });

  it('TEST-011/012/195: validates baseline strictly, denies self-approval and allows independent approval', async () => {
    const packageId = await createPackage('BASELINE', 'controls-baseline-package');
    await api(plannerToken).post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', 'controls-incomplete-schedule')
      .send(singleActivityDraft(packageId, '50', 0)).expect(200);

    const invalidKey = 'controls-invalid-baseline';
    const strictDenied = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule-baselines`)
      .set('Idempotency-Key', invalidKey)
      .send(baselinePayload(1)).expect(422);
    expect(strictDenied.body.code).toBe('SCHEDULE_VALIDATION_FAILED');
    expect(strictDenied.body.issues.map((issue: { code: string }) => issue.code))
      .toContain('WEIGHT_TOTAL_MUST_EQUAL_100');
    const [invalidAtomic] = await dataSource.query<Array<{
      baselines: string;
      receipts: string;
    }>>(`SELECT
      (SELECT count(*) FROM schedule_baselines WHERE tenant_id = $1)::text AS baselines,
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key = $2)::text AS receipts`, [tenantId, invalidKey]);
    expect(invalidAtomic).toEqual({ baselines: '0', receipts: '0' });

    await api(plannerToken).post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', 'controls-complete-schedule')
      .send(singleActivityDraft(packageId, '100', 1)).expect(200);
    const submitted = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule-baselines`)
      .set('Idempotency-Key', 'controls-submit-baseline')
      .send(baselinePayload(2)).expect(201);
    expect(submitted.body.data).toMatchObject({
      baselineNumber: 1, baselineType: 'INITIAL', status: 'SUBMITTED', versionNo: 1
    });
    expect(submitted.body.data.snapshotHash).toMatch(/^[0-9a-f]{64}$/);

    const selfDenied = await api(plannerToken)
      .post(`/v1/schedule-baselines/${submitted.body.data.id}:decision`)
      .set('Idempotency-Key', 'controls-self-approve')
      .send({ decision: 'APPROVE', expectedVersion: 1 }).expect(403);
    expect(selfDenied.body.code).toBe('BASELINE_SELF_APPROVAL_DENIED');

    const approved = await api(approverToken)
      .post(`/v1/schedule-baselines/${submitted.body.data.id}:decision`)
      .set('Idempotency-Key', 'controls-independent-approve')
      .send({ decision: 'APPROVE', expectedVersion: 1 }).expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'APPROVED', approvedBy: approverId, versionNo: 2
    });
    await expect(dataSource.query(
      `UPDATE schedule_baselines SET snapshot = '{"mutated":true}'::jsonb WHERE id = $1`,
      [submitted.body.data.id]
    )).rejects.toMatchObject({ code: '55000' });

    const rebaselineDenied = await api(plannerToken)
      .post(`/v1/projects/${projectId}/schedule-baselines`)
      .set('Idempotency-Key', 'controls-rebaseline-without-us004')
      .send({
        ...baselinePayload(3), baselineType: 'REBASELINE',
        approvedChangeRequestId: randomUUID()
      }).expect(422);
    expect(rebaselineDenied.body.code).toBe('CHANGE_APPROVAL_REQUIRED');

    const [evidence] = await dataSource.query<Array<{
      submittedAudits: string;
      approvedAudits: string;
      submittedEvents: string;
      approvedEvents: string;
      receipts: string;
    }>>(`SELECT
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'BASELINE_SUBMITTED')::text AS "submittedAudits",
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'BASELINE_APPROVED')::text AS "approvedAudits",
      (SELECT count(*) FROM transactional_outbox_events WHERE tenant_id = $1
        AND event_type = 'BaselineSubmitted')::text AS "submittedEvents",
      (SELECT count(*) FROM transactional_outbox_events WHERE tenant_id = $1
        AND event_type = 'BaselineApproved')::text AS "approvedEvents",
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key IN ('controls-submit-baseline','controls-independent-approve')
        AND state = 'COMPLETED')::text AS receipts`, [tenantId]);
    expect(evidence).toEqual({
      submittedAudits: '1', approvedAudits: '1',
      submittedEvents: '1', approvedEvents: '1', receipts: '2'
    });
  });

  it('TEST-011/185: appends progress/corrections, requires evidence and rejects stale version', async () => {
    const packageId = await createPackage('PROGRESS', 'controls-progress-package');
    await api(plannerToken).post(`/v1/projects/${projectId}/schedule:apply-draft`)
      .set('Idempotency-Key', 'controls-progress-schedule')
      .send(validDraft(packageId)).expect(200);
    const initial = await getSchedule(plannerToken);
    const activity = initial.activities[0] as { id: string; versionNo: number };

    const missingEvidenceKey = 'controls-progress-missing-evidence';
    const missingEvidence = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', missingEvidenceKey)
      .send(progressPayload(activity.id, 1, '100', 0, {
        actualStart: '2026-07-13', actualFinish: '2026-07-17'
      })).expect(422);
    expect(missingEvidence.body.code).toBe('PROGRESS_EVIDENCE_REQUIRED');

    const firstKey = 'controls-progress-first';
    const first = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', firstKey)
      .send(progressPayload(activity.id, 1, '40', 3, { actualStart: '2026-07-13' }))
      .expect(201);
    const replay = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', firstKey)
      .send(progressPayload(activity.id, 1, '40', 3, { actualStart: '2026-07-13' }))
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);

    const stale = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', 'controls-progress-stale')
      .send(progressPayload(activity.id, 1, '50', 2)).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const decrease = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', 'controls-progress-decrease')
      .send(progressPayload(activity.id, 2, '30', 4)).expect(422);
    expect(decrease.body.code).toBe('ACTUAL_CORRECTION_REQUIRED');

    const corrected = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', 'controls-progress-correction')
      .send(progressPayload(activity.id, 2, '30', 4, {
        correctionOfId: first.body.data.id, reason: 'Điều chỉnh theo biên bản hiện trường'
      })).expect(201);
    expect(corrected.body.data.correctionOfId).toBe(first.body.data.id);

    const completed = await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', 'controls-progress-complete')
      .send(progressPayload(activity.id, 3, '100', 0, {
        dataDate: '2026-07-28',
        actualStart: '2026-07-13', actualFinish: '2026-07-17',
        evidenceRefs: ['document-revision:synthetic-progress-evidence']
      })).expect(201);
    expect(Number(completed.body.data.percentComplete)).toBe(100);

    await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', 'controls-progress-late-old-correction')
      .send(progressPayload(activity.id, 4, '20', 5, {
        correctionOfId: first.body.data.id,
        reason: 'Sửa record cũ nhưng không rollback projection ngày mới'
      })).expect(201);
    const afterHistoricalCorrection = await getSchedule(plannerToken);
    expect(Number(afterHistoricalCorrection.activities[0].percentComplete)).toBe(100);

    await api(plannerToken)
      .post(`/v1/projects/${projectId}/progress-updates`)
      .set('Idempotency-Key', 'controls-progress-clear-finish')
      .send(progressPayload(activity.id, 5, '90', 1, {
        dataDate: '2026-07-28', correctionOfId: completed.body.data.id,
        actualFinish: null, reason: 'Mở lại activity theo biên bản điều chỉnh'
      })).expect(201);
    const afterReopen = await getSchedule(plannerToken);
    expect(afterReopen.activities[0]).toMatchObject({
      percentComplete: '90.00', actualFinish: null, status: 'IN_PROGRESS'
    });

    const history = await api(plannerToken)
      .get(`/v1/projects/${projectId}/progress-updates`)
      .query({ activityId: activity.id, limit: 2 }).expect(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.meta.nextCursor).toEqual(expect.any(String));
    const historyNext = await api(plannerToken)
      .get(`/v1/projects/${projectId}/progress-updates`)
      .query({ activityId: activity.id, limit: 100, cursor: history.body.meta.nextCursor })
      .expect(200);
    expect(historyNext.body.data).toHaveLength(3);

    await expect(dataSource.query(
      'UPDATE progress_updates SET percent_complete = 99 WHERE id = $1', [first.body.data.id]
    )).rejects.toMatchObject({ code: '55000' });
    const [evidence] = await dataSource.query<Array<{
      progress: string;
      activityPercent: string;
      activityFinish: string | null;
      activityVersion: number;
      audits: string;
      events: string;
      receipts: string;
      failedReceipts: string;
    }>>(`SELECT
      (SELECT count(*) FROM progress_updates WHERE tenant_id = $1 AND activity_id = $2)::text AS progress,
      (SELECT percent_complete::text FROM schedule_activities WHERE id = $2) AS "activityPercent",
      (SELECT actual_finish::text FROM schedule_activities WHERE id = $2) AS "activityFinish",
      (SELECT version_no FROM schedule_activities WHERE id = $2) AS "activityVersion",
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'PROGRESS_RECORDED' AND object_id = $2)::text AS audits,
      (SELECT count(*) FROM transactional_outbox_events WHERE tenant_id = $1
        AND event_type = 'ProgressRecorded' AND aggregate_id = $2)::text AS events,
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key IN ('controls-progress-first','controls-progress-correction',
          'controls-progress-complete','controls-progress-late-old-correction',
          'controls-progress-clear-finish') AND state = 'COMPLETED')::text AS receipts,
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key IN ($3,'controls-progress-stale','controls-progress-decrease'))::text
        AS "failedReceipts"`, [tenantId, activity.id, missingEvidenceKey]);
    expect(evidence).toEqual({
      progress: '5', activityPercent: '90.00', activityFinish: null, activityVersion: 6,
      audits: '5', events: '5', receipts: '5', failedReceipts: '0'
    });
  });

  async function seedIdentityAndProjects(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'controls-test', name: 'Controls Test Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'controls-other', name: 'Controls Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(plannerId, tenantId, 'planner@example.test', 'Planner Test'),
      user(approverId, tenantId, 'approver@example.test', 'Approver Test'),
      user(packageUserId, tenantId, 'package-owner@example.test', 'Package Owner Test'),
      user(otherTenantUserId, otherTenantId, 'other@example.test', 'Other Tenant User')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(plannerId, tenantId), credential(approverId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const plannerRole = await dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId, code: 'PROJECT_CONTROLS', name: 'Project Controls',
      policyVersion: 1, status: MasterRecordStatus.ACTIVE,
      permissions: [
        'package.read', 'package.create', 'schedule.read', 'schedule.manage', 'schedule.import',
        'baseline.submit', 'baseline.approve', 'progress.record', 'progress.correct'
      ]
    });
    const approverRole = await dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId, code: 'PROJECT_MANAGER', name: 'Project Manager',
      policyVersion: 1, status: MasterRecordStatus.ACTIVE,
      permissions: ['schedule.read', 'baseline.approve']
    });
    const packageRole = await dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId, code: 'PACKAGE_OWNER', name: 'Package Owner',
      policyVersion: 1, status: MasterRecordStatus.ACTIVE,
      permissions: ['package.read', 'schedule.read', 'schedule.manage', 'progress.record']
    });
    packageRoleId = packageRole.id;

    const projectFixture = await seedProjectFixture(
      tenantId, projectId, plannerId, 'CONTROLS', 'Controls Project'
    );
    contractorCompanyId = projectFixture.companyId;
    await seedProjectFixture(
      otherTenantId, otherProjectId, otherTenantUserId, 'OTHER', 'Other Project'
    );

    await dataSource.getRepository(RoleAssignmentEntity).save([
      {
        id: randomUUID(), tenantId, userAccountId: plannerId, roleId: plannerRole.id,
        scopeType: AssignmentScopeType.TENANT, scopeId: null,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null,
        status: MasterRecordStatus.ACTIVE
      },
      {
        id: randomUUID(), tenantId, userAccountId: approverId, roleId: approverRole.id,
        scopeType: AssignmentScopeType.PROJECT, scopeId: projectId,
        effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null,
        status: MasterRecordStatus.ACTIVE
      }
    ]);
  }

  async function seedProjectFixture(
    fixtureTenantId: string, fixtureProjectId: string, managerId: string,
    code: string, name: string
  ): Promise<{ companyId: string }> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `COMP-${code}`,
      name: `Company ${code}`, organizationType: OrganizationType.INTERNAL,
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const legalEntity = await dataSource.getRepository(LegalEntityEntity).save({
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
      ownerLegalEntityId: legalEntity.id, customerCompanyId: company.id,
      projectManagerId: managerId, code, name, type: ProjectType.SOLAR,
      phase: ProjectPhase.PLANNING, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31',
      forecastCod: null, idempotencyKey: null
    });
    return { companyId: company.id };
  }

  function user(id: string, fixtureTenantId: string, email: string, displayName: string) {
    return {
      id, tenantId: fixtureTenantId, email, normalizedEmail: email,
      displayName, status: 'ACTIVE', lastLoginAt: null
    };
  }

  function credential(userAccountId: string, fixtureTenantId: string) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId,
      passwordHash, algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    };
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/v1/auth/login').send({
      tenantCode: 'controls-test', email, password
    }).expect(200);
    return response.body.accessToken as string;
  }

  function api(token: string, headerTenantId = tenantId) {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', headerTenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path))
    };
  }

  async function createPackage(code: string, key: string): Promise<string> {
    const response = await api(plannerToken).post(`/v1/projects/${projectId}/packages`)
      .set('Idempotency-Key', key)
      .send({ code, name: `Package ${code}`, packageType: 'EPC' }).expect(201);
    return response.body.data.id as string;
  }

  async function getSchedule(token: string): Promise<Record<string, any>> {
    const response = await api(token).get(`/v1/projects/${projectId}/schedule`).expect(200);
    return response.body.data as Record<string, any>;
  }

  function baseDraft(mode: 'PREVIEW' | 'COMMIT', expectedVersion: number): DraftPayload {
    return {
      mode, expectedVersion,
      source: { format: 'MANUAL', sourceName: 'Synthetic integration schedule' },
      calendar: {
        timezone: 'Asia/Ho_Chi_Minh', calendarCode: 'STANDARD',
        workingWeek: [1, 2, 3, 4, 5], exceptions: []
      },
      wbsUpserts: [], activityUpserts: [], dependencyUpserts: [],
      archiveWbsIds: [], archiveActivityIds: [], unlinkDependencyIds: []
    };
  }

  function validDraft(packageId: string): DraftPayload {
    const payload = baseDraft('COMMIT', 0);
    payload.wbsUpserts = [{
      clientRef: 'ROOT', packageId, code: 'ROOT', name: 'Project root',
      weight: '100', sortOrder: 0
    }];
    payload.activityUpserts = [
      {
        clientRef: 'ACT_A', wbsClientRef: 'ROOT', packageId, ownerId: plannerId,
        code: 'ACT_A', name: 'Engineering', activityType: 'TASK', weight: '50',
        plannedStart: '2026-07-13', durationWorkDays: 5
      },
      {
        clientRef: 'ACT_B', wbsClientRef: 'ROOT', packageId, ownerId: plannerId,
        code: 'ACT_B', name: 'Procurement', activityType: 'TASK', weight: '50',
        plannedStart: '2026-07-20', durationWorkDays: 5
      }
    ];
    payload.dependencyUpserts = [{
      predecessorClientRef: 'ACT_A', successorClientRef: 'ACT_B',
      dependencyType: 'FS', lagWorkDays: 0
    }];
    return payload;
  }

  function invalidDraft(packageId: string, mode: 'PREVIEW' | 'COMMIT'): DraftPayload {
    const payload = baseDraft(mode, 0);
    payload.wbsUpserts = [
      {
        clientRef: 'ROOT_A', packageId, code: 'ROOT_A', name: 'Root A',
        weight: '60', sortOrder: 0
      },
      {
        clientRef: 'ROOT_B', packageId, code: 'ROOT_B', name: 'Root B',
        weight: '60', sortOrder: 1
      }
    ];
    payload.activityUpserts = [
      {
        clientRef: 'ACT_A', wbsClientRef: 'ROOT_A', packageId, ownerId: plannerId,
        code: 'ACT_A', name: 'Invalid A', activityType: 'TASK', weight: '100',
        plannedStart: '2026-07-13', plannedFinish: '2026-07-31', durationWorkDays: 5
      },
      {
        clientRef: 'ACT_B', wbsClientRef: 'ROOT_B', packageId, ownerId: plannerId,
        code: 'ACT_B', name: 'Invalid B', activityType: 'TASK', weight: '100',
        plannedStart: '2026-07-20', durationWorkDays: 5
      }
    ];
    payload.dependencyUpserts = [
      {
        predecessorClientRef: 'ACT_A', successorClientRef: 'ACT_B',
        dependencyType: 'FS', lagWorkDays: 0
      },
      {
        predecessorClientRef: 'ACT_B', successorClientRef: 'ACT_A',
        dependencyType: 'FS', lagWorkDays: 0
      }
    ];
    return payload;
  }

  function twoPackageDraft(packageA: string, packageB: string): DraftPayload {
    const payload = baseDraft('COMMIT', 0);
    payload.wbsUpserts = [
      {
        clientRef: 'WBS_A', packageId: packageA, code: 'WBS_A', name: 'WBS A',
        weight: '50', sortOrder: 0
      },
      {
        clientRef: 'WBS_B', packageId: packageB, code: 'WBS_B', name: 'WBS B',
        weight: '50', sortOrder: 1
      }
    ];
    payload.activityUpserts = [
      {
        clientRef: 'ACT_A', wbsClientRef: 'WBS_A', packageId: packageA, ownerId: packageUserId,
        code: 'ACT_A', name: 'Package A task', activityType: 'TASK', weight: '100',
        plannedStart: '2026-07-13', durationWorkDays: 5
      },
      {
        clientRef: 'ACT_B', wbsClientRef: 'WBS_B', packageId: packageB, ownerId: plannerId,
        code: 'ACT_B', name: 'Package B task', activityType: 'TASK', weight: '100',
        plannedStart: '2026-07-20', durationWorkDays: 5
      }
    ];
    return payload;
  }

  function singleActivityDraft(
    packageId: string, rootWeight: string, expectedVersion: number
  ): DraftPayload {
    const payload = baseDraft('COMMIT', expectedVersion);
    payload.wbsUpserts = [{
      clientRef: 'ROOT', packageId, code: 'ROOT', name: 'Baseline root',
      weight: rootWeight, sortOrder: 0
    }];
    payload.activityUpserts = [{
      clientRef: 'ACT_A', wbsClientRef: 'ROOT', packageId, ownerId: plannerId,
      code: 'ACT_A', name: 'Baseline activity', activityType: 'TASK', weight: '100',
      plannedStart: '2026-07-13', durationWorkDays: 5
    }];
    return payload;
  }

  function packageScopedDraft(
    packageCode: 'A' | 'B', packageId: string, expectedVersion: number, activityName: string
  ): DraftPayload {
    const isPackageA = packageCode === 'A';
    const payload = baseDraft('COMMIT', expectedVersion);
    payload.wbsUpserts = [{
      clientRef: isPackageA ? 'WBS_A' : 'WBS_B', packageId,
      code: isPackageA ? 'WBS_A' : 'WBS_B', name: isPackageA ? 'WBS A' : 'WBS B',
      weight: '50', sortOrder: isPackageA ? 0 : 1
    }];
    payload.activityUpserts = [{
      clientRef: isPackageA ? 'ACT_A' : 'ACT_B',
      wbsClientRef: isPackageA ? 'WBS_A' : 'WBS_B', packageId,
      ownerId: isPackageA ? packageUserId : plannerId,
      code: isPackageA ? 'ACT_A' : 'ACT_B', name: activityName,
      activityType: 'TASK', weight: '100',
      plannedStart: isPackageA ? '2026-07-13' : '2026-07-20', durationWorkDays: 5
    }];
    return payload;
  }

  function baselinePayload(expectedScheduleVersion: number) {
    return {
      baselineType: 'INITIAL', dataDate: '2026-07-17',
      reason: 'Thiết lập baseline tích hợp ban đầu',
      impactSummary: 'Baseline tích hợp dùng dữ liệu synthetic', expectedScheduleVersion
    };
  }

  function progressPayload(
    activityId: string, expectedActivityVersion: number, percentComplete: string,
    remainingDurationWorkDays: number,
    extra: Record<string, unknown> = {}
  ) {
    return {
      activityId, dataDate: '2026-07-27', percentComplete,
      remainingDurationWorkDays, expectedActivityVersion, ...extra
    };
  }

  async function expectNoScheduleSideEffects(idempotencyKey: string): Promise<void> {
    const [counts] = await dataSource.query<Array<{
      schedules: string;
      wbs: string;
      activities: string;
      dependencies: string;
      audits: string;
      events: string;
      receipts: string;
    }>>(`SELECT
      (SELECT count(*) FROM project_schedules WHERE tenant_id = $1 AND project_id = $2)::text AS schedules,
      (SELECT count(*) FROM wbs_nodes WHERE tenant_id = $1 AND project_id = $2)::text AS wbs,
      (SELECT count(*) FROM schedule_activities WHERE tenant_id = $1 AND project_id = $2)::text AS activities,
      (SELECT count(*) FROM activity_dependencies WHERE tenant_id = $1 AND project_id = $2)::text AS dependencies,
      (SELECT count(*) FROM audit_events WHERE tenant_id = $1
        AND action = 'SCHEDULE_DRAFT_CHANGED')::text AS audits,
      (SELECT count(*) FROM transactional_outbox_events WHERE tenant_id = $1
        AND event_type = 'ScheduleDraftChanged')::text AS events,
      (SELECT count(*) FROM command_receipts WHERE tenant_id = $1
        AND idempotency_key = $3)::text AS receipts`, [tenantId, projectId, idempotencyKey]);
    expect(counts).toEqual({
      schedules: '0', wbs: '0', activities: '0', dependencies: '0',
      audits: '0', events: '0', receipts: '0'
    });
  }
});
