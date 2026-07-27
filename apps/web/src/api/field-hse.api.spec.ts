import { fieldHseApi } from './field-hse.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('field/HSE/quality API — API-086…097', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the workfront filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.listWorkfronts(auth, 'project-id');
    await fieldHseApi.listWorkfronts(auth, 'project-id', {
      cursor: 'opaque', limit: 25, status: 'READY'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/workfronts');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/projects/project-id/workfronts?cursor=opaque&limit=25&status=READY'
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeNull();
  });

  it('sends every command to its own path with tenant context and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.releaseWorkfront(auth, 'workfront-id', { expectedVersion: 3 }, 'release-key');
    await fieldHseApi.createDailyLog(auth, 'project-id', {
      siteId: 'site-id', contractorCompanyId: 'company-id', logDate: '2026-07-26',
      shift: 'DAY', summary: 'Lắp đặt khung đỡ trục đơn'
    }, 'daily-log-key');
    await fieldHseApi.submitDailyLog(auth, 'daily-log-id', {
      expectedVersion: 1, action: 'SIGN'
    }, 'sign-daily-log-key');
    await fieldHseApi.createPermitToWork(auth, 'workfront-id', {
      permitType: 'HOT_WORK', validFrom: '2026-07-26T01:00:00.000Z',
      validTo: '2026-07-26T09:00:00.000Z'
    }, 'permit-request-key');
    await fieldHseApi.issuePermitToWork(auth, 'permit-id', {
      expectedVersion: 1, isolationSnapshot: [{ point: 'DC-01', state: 'LOCKED' }]
    }, 'permit-issue-key');
    await fieldHseApi.inspectionCommand(auth, 'itp-id', {
      commandType: 'REQUEST', holdPointRef: 'HP-010'
    }, 'inspection-request-key');
    await fieldHseApi.ncrCommand(auth, 'project-id', { commandType: 'RAISE' }, 'ncr-raise-key');
    await fieldHseApi.punchCommand(auth, 'project-id', { commandType: 'CREATE' }, 'punch-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/workfronts/workfront-id:release',
      '/v1/projects/project-id/daily-logs',
      '/v1/daily-logs/daily-log-id:submit',
      '/v1/workfronts/workfront-id/permits-to-work',
      '/v1/permits-to-work/permit-id:issue',
      '/v1/inspection-test-plans/itp-id/inspections',
      '/v1/projects/project-id/ncrs',
      '/v1/projects/project-id/punch-items'
    ]);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe('POST');
      const headers = new Headers(init.headers);
      expect(headers.get('Idempotency-Key')).toMatch(/^.{8,200}$/);
      expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
      expect(headers.get('Authorization')).toBe('Bearer access');
    }
  });

  /** numeric(19,4) text has to reach the wire byte-for-byte; `Number(...)` would round it away. */
  it('keeps the quantity as the exact decimal string it was given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.recordQuantityProgress(auth, 'workfront-id', {
      recordDate: '2026-07-26', quantity: '123456789012.0001', unit: 'm2',
      sourceKey: 'offline-batch-0001', evidenceRefs: ['photo://a']
    }, 'quantity-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/workfronts/workfront-id/quantity-progress');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.quantity).toBe('123456789012.0001');
    expect(typeof body.quantity).toBe('string');
  });

  it('sends a quantity correction as its own append carrying the mandatory reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.recordQuantityProgress(auth, 'workfront-id', {
      recordDate: '2026-07-26', quantity: '10.5000', unit: 'm2',
      sourceKey: 'correction-0001', correctionOfId: 'record-id', reason: 'Đo lại sau nghiệm thu'
    }, 'quantity-correction-key');

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      recordDate: '2026-07-26', quantity: '10.5000', unit: 'm2',
      sourceKey: 'correction-0001', correctionOfId: 'record-id', reason: 'Đo lại sau nghiệm thu'
    });
  });

  it('posts the incident report with no restricted-facts field of its own', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.reportHseIncident(auth, 'project-id', {
      occurredAt: '2026-07-26T02:00:00.000Z', incidentType: 'NEAR_MISS',
      actualSeverity: 'LOW', potentialSeverity: 'HIGH', narrative: 'Vật rơi gần khu lắp đặt'
    }, 'incident-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/hse-incidents');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).not.toHaveProperty('restrictedFacts');
    expect(body.narrative).toBe('Vật rơi gần khu lắp đặt');
  });

  it('sends ISSUE and LIFT to the same ledger endpoint with their own bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.recordStopWorkAction(auth, 'project-id', {
      action: 'ISSUE', targetType: 'WORKFRONT', workfrontId: 'workfront-id',
      reason: 'Giàn giáo mất chốt'
    }, 'stop-work-issue-key');
    await fieldHseApi.recordStopWorkAction(auth, 'project-id', {
      action: 'LIFT', liftsActionId: 'issue-id', reason: 'Đã lắp lại chốt',
      verifiedControls: ['Kiểm tra chốt', 'Ký xác nhận giám sát']
    }, 'stop-work-lift-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/projects/project-id/stop-work-actions',
      '/v1/projects/project-id/stop-work-actions'
    ]);
    const lift = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(lift).toMatchObject({
      action: 'LIFT', liftsActionId: 'issue-id',
      verifiedControls: ['Kiểm tra chốt', 'Ký xác nhận giám sát']
    });
  });

  /** Safety fails closed: a release refused by the ledger must surface as an error, not a success. */
  it('surfaces STOP_WORK_ACTIVE as a rejection instead of a released workfront', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'STOP_WORK_ACTIVE',
      message: 'Đang có lệnh dừng việc chưa được gỡ trong phạm vi này', retryable: false
    }, 422)));

    await expect(fieldHseApi.releaseWorkfront(auth, 'workfront-id', {
      expectedVersion: 2
    }, 'blocked-release-key')).rejects.toMatchObject({
      status: 422, code: 'STOP_WORK_ACTIVE', retryable: false
    });
  });

  it('surfaces the permit SoD refusal with the server code intact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'SOD_CONFLICT', message: 'Người yêu cầu permit không được tự cấp permit',
      retryable: false
    }, 422)));

    await expect(fieldHseApi.issuePermitToWork(auth, 'permit-id', {
      expectedVersion: 1, isolationSnapshot: [{ point: 'DC-01' }]
    }, 'sod-issue-key')).rejects.toMatchObject({ status: 422, code: 'SOD_CONFLICT' });
  });

  it('surfaces a stale expectedVersion as a 409 carrying the current version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'VERSION_CONFLICT', message: 'Bản ghi đã thay đổi', retryable: false,
      currentVersion: 7
    }, 409)));

    await expect(fieldHseApi.inspectionCommand(auth, 'itp-id', {
      commandType: 'RECORD', inspectionId: 'inspection-id', expectedVersion: 1,
      result: 'PASS', evidenceRefs: ['photo://weld']
    }, 'stale-record-key')).rejects.toMatchObject({
      status: 409, code: 'VERSION_CONFLICT', currentVersion: 7
    });
  });

  it('reports an inspection already recorded instead of pretending it can be edited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'INVALID_STATE_TRANSITION',
      message: 'Chỉ inspection REQUESTED mới được ghi kết quả', retryable: false
    }, 422)));

    await expect(fieldHseApi.inspectionCommand(auth, 'itp-id', {
      commandType: 'RECORD', inspectionId: 'inspection-id', expectedVersion: 2,
      result: 'FAIL', evidenceRefs: ['photo://weld']
    }, 'frozen-record-key')).rejects.toMatchObject({
      status: 422, code: 'INVALID_STATE_TRANSITION'
    });
  });

  it('reports the category-A punch rule the database enforces', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'PUNCH_NOT_WAIVABLE', message: 'Punch item này không thể waive', retryable: false
    }, 422)));

    await expect(fieldHseApi.punchCommand(auth, 'project-id', {
      commandType: 'WAIVE', punchItemId: 'punch-id', expectedVersion: 1, reason: 'Chủ đầu tư đồng ý'
    }, 'waive-key')).rejects.toMatchObject({ status: 422, code: 'PUNCH_NOT_WAIVABLE' });
  });

  it('keeps the multiplexed NCR command body exactly as composed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await fieldHseApi.ncrCommand(auth, 'project-id', {
      commandType: 'DECIDE_DISPOSITION', ncrId: 'ncr-id', expectedVersion: 4,
      decision: 'RETURN', reason: 'Chưa đủ căn cứ kỹ thuật'
    }, 'ncr-decide-key');

    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      commandType: 'DECIDE_DISPOSITION', ncrId: 'ncr-id', expectedVersion: 4,
      decision: 'RETURN', reason: 'Chưa đủ căn cứ kỹ thuật'
    });
  });

  it('maps a missing idempotency key refusal back to its API code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key phải có từ 8 đến 200 ký tự', retryable: false
    }, 400)));

    await expect(fieldHseApi.createDailyLog(auth, 'project-id', {
      siteId: 'site-id', contractorCompanyId: 'company-id', logDate: '2026-07-26',
      shift: 'NIGHT', summary: 'Ca đêm không thi công'
    }, 'short')).rejects.toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });
});
