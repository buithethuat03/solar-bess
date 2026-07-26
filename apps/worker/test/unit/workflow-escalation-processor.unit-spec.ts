import type { PoolClient } from 'pg';
import type { DomainEventJob } from '../../src/domain-event';
import type { WorkerLogger } from '../../src/worker-logger';
import {
  currentStepRoleCodes,
  escalationReason,
  WorkflowEscalationProcessor,
  workflowEscalationObjectLink,
  WORKFLOW_ESCALATION_THRESHOLD_VERSION
} from '../../src/workflow-escalation.processor';

const tenantId = '20000000-0000-4000-8000-000000000001';
const instanceId = '40000000-0000-4000-8000-000000000001';
const projectId = '50000000-0000-4000-8000-000000000001';
const requesterId = '70000000-0000-4000-8000-000000000001';
const approverId = '70000000-0000-4000-8000-000000000002';
const revokedApproverId = '70000000-0000-4000-8000-000000000003';

interface RecordedQuery { sql: string; params: unknown[] }

function fakeClient(
  route: (sql: string, params: unknown[]) => { rows?: unknown[]; rowCount?: number } | undefined,
  recorded: RecordedQuery[]
): PoolClient {
  return {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      recorded.push({ sql, params });
      const result = route(sql, params) ?? { rows: [], rowCount: 0 };
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? (result.rows?.length ?? 0) };
    })
  } as unknown as PoolClient;
}

function event(overrides: Partial<DomainEventJob> = {}): DomainEventJob {
  return {
    eventId: '10000000-0000-4000-8000-000000000001',
    tenantId,
    actorId: requesterId,
    eventKey: 'workflow:test',
    aggregateType: 'WorkflowInstance',
    aggregateId: instanceId,
    aggregateVersion: 1,
    eventType: 'WorkflowInstance.EscalationRequested',
    schemaVersion: 1,
    payload: { projectId },
    occurredAt: '2026-07-26T00:00:00.000Z',
    correlationId: '60000000-0000-4000-8000-000000000001',
    ...overrides
  };
}

function instanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: instanceId,
    projectId,
    packageId: null,
    state: 'IN_REVIEW',
    currentStepKey: 'PM_REVIEW',
    requestedBy: requesterId,
    escalationCount: 1,
    lastEscalatedAt: new Date('2026-07-26T02:00:00.000Z'),
    routeSnapshot: {
      steps: [{
        key: 'PM_REVIEW', order: 1, rule: 'ALL',
        approverSelector: { roleCodes: ['PROJECT_MANAGER'], scope: 'PROJECT' },
        fallbackRoleCodes: ['PMO']
      }]
    },
    ...overrides
  };
}

const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('WorkflowEscalationProcessor — API-113 → DB-105 projection', () => {
  const processor = new WorkflowEscalationProcessor(logger);

  it('supports exactly the WorkflowInstance escalation event', () => {
    expect(processor.supports(event())).toBe(true);
    expect(processor.supports(event({ eventType: 'WorkflowInstance.Started' }))).toBe(false);
    expect(processor.supports(event({ aggregateType: 'ChangeRequest' }))).toBe(false);
  });

  it('builds the deep-link and reason deterministically', () => {
    expect(workflowEscalationObjectLink('abc/1')).toBe('/approval-tasks?workflowInstanceId=abc%2F1');
    expect(escalationReason('PM_REVIEW', 2)).toContain('PM_REVIEW');
    expect(escalationReason('PM_REVIEW', 2)).toContain('lần 2');
  });

  it('unions selector and fallback role codes of the current step only', () => {
    const snapshot = instanceRow().routeSnapshot;
    expect(currentStepRoleCodes(snapshot, 'PM_REVIEW')).toEqual(['PROJECT_MANAGER', 'PMO']);
    expect(currentStepRoleCodes(snapshot, 'OTHER_STEP')).toEqual([]);
    expect(currentStepRoleCodes(snapshot, null)).toEqual([]);
    expect(currentStepRoleCodes({}, 'PM_REVIEW')).toEqual([]);
  });

  it('fails the event when the committed instance does not exist', async () => {
    const recorded: RecordedQuery[] = [];
    const client = fakeClient(() => ({ rows: [] }), recorded);
    await expect(processor.process(client, event())).rejects.toThrow('does not exist');
  });

  it('skips with a log when the instance has no project (documented V1 limit)', async () => {
    const recorded: RecordedQuery[] = [];
    const client = fakeClient((sql) => {
      if (sql.includes('FROM workflow_instances')) {
        return { rows: [instanceRow({ projectId: null })] };
      }
      return undefined;
    }, recorded);
    await processor.process(client, event());
    expect(logger.warn).toHaveBeenCalledWith('workflow_escalation_skipped_no_project',
      expect.objectContaining({ workflowInstanceId: instanceId }));
    // Only the instance read ran: no notification write, no reconciliation.
    expect(recorded).toHaveLength(1);
  });

  it('projects HIGH package-less notifications to step-role holders, excluding the requester', async () => {
    const recorded: RecordedQuery[] = [];
    const client = fakeClient((sql, params) => {
      if (sql.includes('FROM workflow_instances') && sql.includes('route_snapshot')) {
        return { rows: [instanceRow()] };
      }
      if (sql.includes('"businessDate"')) return { rows: [{ businessDate: '2026-07-26' }] };
      if (sql.includes('FROM user_accounts account')) {
        // authorizedRecipients: the permission gate already excluded the requester.
        expect(params[5]).toEqual([requesterId]);
        return { rows: [{ userId: approverId }, { userId: revokedApproverId }] };
      }
      if (sql.includes('FROM role_assignments assignment')) {
        // Role filter narrows to live holders of the step's role codes.
        expect(params[2]).toEqual(['PROJECT_MANAGER', 'PMO']);
        return { rows: [{ userId: approverId }] };
      }
      if (sql.includes('INSERT INTO notifications')) {
        return { rows: [{ inserted: true }], rowCount: 1 };
      }
      if (sql.includes('JOIN workflow_instances instance')) return { rows: [] };
      if (sql.startsWith('\n    DELETE FROM notifications')) return { rowCount: 0 };
      return undefined;
    }, recorded);

    await processor.process(client, event());

    const insert = recorded.find((query) => query.sql.includes('INSERT INTO notifications'));
    expect(insert).toBeDefined();
    const [, insertTenant, recipient, project, packageId, activityId,
      sourceType, sourceId, alertType, priority] = insert!.params;
    expect(insertTenant).toBe(tenantId);
    expect(recipient).toBe(approverId);
    expect(project).toBe(projectId);
    expect(packageId).toBeNull();
    expect(activityId).toBeNull();
    expect(sourceType).toBe('WorkflowInstance');
    expect(sourceId).toBe(instanceId);
    expect(alertType).toBe('APPROVAL_ESCALATED');
    expect(priority).toBe('HIGH');
    expect(insert!.params[12]).toBe('2026-07-26');
    expect(insert!.params[14]).toBe(WORKFLOW_ESCALATION_THRESHOLD_VERSION);

    // Exactly one notification: the revoked approver was filtered by the role query.
    expect(recorded.filter((query) => query.sql.includes('INSERT INTO notifications')))
      .toHaveLength(1);
  });

  it('reconciles only WorkflowInstance rows, keeping other live instances intact', async () => {
    const keepKey = 'keep-key-of-other-live-instance';
    const recorded: RecordedQuery[] = [];
    const client = fakeClient((sql) => {
      if (sql.includes('FROM workflow_instances') && sql.includes('route_snapshot')) {
        // Terminal instance: nothing to project, everything of it is stale.
        return { rows: [instanceRow({ state: 'APPROVED', currentStepKey: null })] };
      }
      if (sql.includes('JOIN workflow_instances instance')) {
        return { rows: [{ dedupKey: keepKey }] };
      }
      if (sql.includes('DELETE FROM notifications')) return { rowCount: 3 };
      return undefined;
    }, recorded);

    await processor.process(client, event());

    const removal = recorded.find((query) => query.sql.includes('DELETE FROM notifications'));
    expect(removal).toBeDefined();
    // Source list is narrowed to WorkflowInstance so no other projector's rows can be wiped.
    expect(removal!.params[2]).toEqual(['WorkflowInstance']);
    expect(removal!.params[3]).toEqual([keepKey]);
    expect(recorded.some((query) => query.sql.includes('INSERT INTO notifications'))).toBe(false);
  });
});
