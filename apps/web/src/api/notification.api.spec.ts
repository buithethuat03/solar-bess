import { notificationApi } from './notification.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

describe('notification API — API-135/API-136', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50, unreadTotal: 0, unreadHigh: 0, unreadNormal: 0 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await notificationApi.list(auth);
    await notificationApi.list(auth, {
      cursor: 'opaque', limit: 25, status: 'UNREAD', priority: 'HIGH',
      sourceType: 'Risk', alertType: 'RISK_REVIEW_DUE', projectId: 'project-id'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/notifications');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/notifications?cursor=opaque&limit=25&status=UNREAD&priority=HIGH'
      + '&sourceType=Risk&alertType=RISK_REVIEW_DUE&projectId=project-id'
    );
  });

  it('acknowledges with an empty body and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { id: 'notification-id' } }));
    vi.stubGlobal('fetch', fetchMock);

    await notificationApi.acknowledge(auth, 'notification-id', 'ack-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/notifications/notification-id:acknowledge');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('ack-key');
    expect(new Headers(init.headers).get('X-Tenant-Id')).toBe('tenant-id');
  });

  it('propagates an authorization failure instead of returning an empty inbox', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'FORBIDDEN', message: 'Không đủ quyền' }),
      { status: 403, headers: { 'content-type': 'application/json' } }
    )));

    await expect(notificationApi.list(auth)).rejects.toMatchObject({ status: 403 });
  });
});
