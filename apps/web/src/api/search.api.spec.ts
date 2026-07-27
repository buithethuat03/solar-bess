import { searchApi } from './search.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('search & reporting API — API-130…134, API-002, API-013', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('posts the search as a read: body semantics, no idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [], meta: { limit: 20 } }));
    vi.stubGlobal('fetch', fetchMock);

    await searchApi.search(auth, { query: 'EPC-2026', types: ['CONTRACT', 'DOCUMENT'], limit: 20 });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/search');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      query: 'EPC-2026', types: ['CONTRACT', 'DOCUMENT'], limit: 20
    });
    // A search has no side effect, so it carries no command header.
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBeNull();
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
  });

  it('returns only register identity columns, never content or snippets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      data: [
        { type: 'RISK', id: 'risk-id', code: 'R-014', title: 'Chậm cấp module', projectId: 'p1' }
      ],
      meta: { limit: 20 }
    })));

    const result = await searchApi.search(auth, { query: 'module' });
    expect(Object.keys(result.data[0]).sort())
      .toEqual(['code', 'id', 'projectId', 'title', 'type']);
  });

  it('never sends a share scope when creating a saved view', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await searchApi.createSavedView(auth, {
      name: 'Rủi ro cao của tôi', targetType: 'RISK',
      filterSnapshot: { severity: 'HIGH' }, columnSnapshot: ['code', 'event']
    }, 'create-saved-view-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/saved-views');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    // V1 has exactly one share scope and the server assigns it; sending one is a 422.
    expect(body).not.toHaveProperty('shareScope');
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
      .get('Idempotency-Key')).toBe('create-saved-view-key');
  });

  it('surfaces the recorded share-scope refusal rather than a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'SHARE_SCOPE_NOT_SUPPORTED',
      message: 'Chỉ hỗ trợ shareScope PRIVATE: chia sẻ view sẽ tái phát hành bộ lọc mà không tái thẩm định quyền',
      retryable: false
    }, 422)));

    await expect(searchApi.createSavedView(auth, {
      name: 'View dùng chung', targetType: 'PROJECT'
    }, 'shared-view-key')).rejects.toMatchObject({
      status: 422, code: 'SHARE_SCOPE_NOT_SUPPORTED'
    });
  });

  it('lists saved views with only the filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { limit: 50, nextCursor: null }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await searchApi.listSavedViews(auth);
    await searchApi.listSavedViews(auth, { targetType: 'DOCUMENT', limit: 25, cursor: 'opaque' });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/saved-views',
      '/v1/saved-views?targetType=DOCUMENT&limit=25&cursor=opaque'
    ]);
  });

  it('creates a report job and reads its status back as an object reference, not a URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: { id: 'job-id', status: 'QUEUED', download: null } }, 201))
      .mockResolvedValueOnce(response({
        data: {
          id: 'job-id', status: 'COMPLETED',
          download: { bucket: 'reports', objectKey: 'tenant/report-jobs/job-id.csv' }
        }
      }));
    vi.stubGlobal('fetch', fetchMock);

    const created = await searchApi.createReportJob(auth, {
      reportType: 'RISK_REGISTER_CSV', projectId: 'project-id'
    }, 'create-report-job-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/report-jobs');
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
      .get('Idempotency-Key')).toBe('create-report-job-key');
    expect(created.data.download).toBeNull();

    const completed = await searchApi.getReportJob(auth, 'job-id');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/v1/report-jobs/job-id');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('GET');
    // No presigner is installed: the client receives a bucket/object pair and nothing URL-shaped.
    expect(completed.data.download).toEqual({
      bucket: 'reports', objectKey: 'tenant/report-jobs/job-id.csv'
    });
    expect(JSON.stringify(completed.data.download)).not.toMatch(/https?:\/\//);
  });

  it("treats another user's report job as missing, exactly as the server does", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'REPORT_JOB_NOT_FOUND', message: 'Không tìm thấy report job', retryable: false
    }, 404)));

    await expect(searchApi.getReportJob(auth, 'someone-elses-job')).rejects.toMatchObject({
      status: 404, code: 'REPORT_JOB_NOT_FOUND'
    });
  });

  it('reads the caller effective permissions and the policy version behind them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {
        userId: 'user-id', tenantId: 'tenant-id', roles: ['PROJECT_MANAGER'],
        permissions: ['project.read', 'search.execute'], scopes: [], policyVersion: 7
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchApi.mePermissions(auth);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/me/permissions');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
    expect(result.data.policyVersion).toBe(7);
  });

  it('serializes only the audit filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { limit: 50, nextCursor: null }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await searchApi.listAuditEvents(auth);
    await searchApi.listAuditEvents(auth, {
      objectType: 'WorkOrder', action: 'WorkOrder.Closed', limit: 25
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/audit-events',
      '/v1/audit-events?objectType=WorkOrder&action=WorkOrder.Closed&limit=25'
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(new Headers((call[1] as RequestInit).headers).get('Idempotency-Key')).toBeNull();
    }
  });
});
