import { userApi } from './user.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

describe('user API — API-008', () => {
  it('serializes the scoped capability lookup and central auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [], meta: { nextCursor: null, limit: 50 }, correlationId: 'c'
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await userApi.listAssignees(auth, {
      projectId: 'project-id', packageId: 'package-id',
      requiredPermission: 'riskChange.manage', search: 'Nguyễn', limit: 50
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/users?projectId=project-id&packageId=package-id&requiredPermission=riskChange.manage&search=Nguy%E1%BB%85n&limit=50');
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer access');
    expect((options.headers as Headers).get('X-Tenant-Id')).toBe('tenant-id');
  });
});
