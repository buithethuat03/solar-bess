import { workflowApi } from './workflow.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

describe('workflow API — API-106…112', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the approval-task filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await workflowApi.listApprovalTasks(auth);
    await workflowApi.listApprovalTasks(auth, {
      cursor: 'opaque', limit: 25, state: 'IN_REVIEW',
      objectType: 'ChangeRequest', projectId: 'project-id'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/approval-tasks');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/approval-tasks?cursor=opaque&limit=25&state=IN_REVIEW'
      + '&objectType=ChangeRequest&projectId=project-id'
    );
  });

  it('sends a decision with its expected version and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await workflowApi.recordDecision(auth, 'instance-id', {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 3, comment: 'Đồng ý'
    }, 'decide-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/workflow-instances/instance-id/decisions');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 3, comment: 'Đồng ý'
    });
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('decide-key');
  });

  it('uses the colon-suffixed cancel path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await workflowApi.cancelInstance(auth, 'instance-id', {
      expectedVersion: 2, reason: 'Đã rút lại'
    }, 'cancel-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/workflow-instances/instance-id:cancel');
  });

  it('surfaces a version conflict rather than silently succeeding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        code: 'VERSION_CONFLICT', message: 'Resource đã thay đổi', currentVersion: 4
      }),
      { status: 409, headers: { 'content-type': 'application/json' } }
    )));

    await expect(workflowApi.recordDecision(auth, 'instance-id', {
      decision: 'APPROVE', stepKey: 'REVIEW', expectedVersion: 1, comment: 'Cũ rồi'
    }, 'stale-key')).rejects.toMatchObject({
      status: 409, code: 'VERSION_CONFLICT', currentVersion: 4
    });
  });
});
