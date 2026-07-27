import { operationsApi } from './operations.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('operations API — API-114…121', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the register filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { limit: 50, siteId: 'site-id', nextCursor: null }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await operationsApi.listAlarmCases(auth, 'site-id');
    await operationsApi.listAlarmCases(auth, 'site-id', {
      cursor: 'opaque', limit: 25, state: 'OPEN', severity: 'CRITICAL', assetId: 'asset-id'
    });
    await operationsApi.listWorkOrders(auth, 'asset-id', { status: 'IN_PROGRESS' });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/sites/site-id/alarm-cases',
      '/v1/sites/site-id/alarm-cases?cursor=opaque&limit=25&state=OPEN&severity=CRITICAL&assetId=asset-id',
      '/v1/assets/asset-id/work-orders?status=IN_PROGRESS'
    ]);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe('GET');
      expect(new Headers(init.headers).get('Idempotency-Key')).toBeNull();
    }
  });

  it('acknowledges an alarm case on the colon path with tenant context and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { id: 'case-id', acknowledgementApplied: true }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await operationsApi.acknowledgeAlarmCase(auth, 'case-id', {
      expectedVersion: 3, note: 'Đã cử kỹ thuật viên tới hiện trường'
    }, 'ack-alarm-case-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/alarm-cases/case-id:acknowledge');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('ack-alarm-case-key');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
    expect(headers.get('Authorization')).toBe('Bearer access');
  });

  it('sends nothing on the acknowledge body that could reach the source alarm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await operationsApi.acknowledgeAlarmCase(auth, 'case-id', {
      expectedVersion: 1, note: 'Ghi nhận cục bộ'
    }, 'ack-alarm-case-key');

    // SEC-127/SEC-128: local acknowledgement carries the lock version and a note, nothing else.
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(Object.keys(body).sort()).toEqual(['expectedVersion', 'note']);
  });

  it('reports a replayed acknowledgement as a no-op instead of an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      data: { id: 'case-id', state: 'ACKNOWLEDGED', versionNo: 4, acknowledgementApplied: false }
    })));

    const result = await operationsApi.acknowledgeAlarmCase(
      auth, 'case-id', { expectedVersion: 4 }, 'ack-replay-key'
    );
    expect(result.data.acknowledgementApplied).toBe(false);
  });

  it('opens a service incident on the site-scoped path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await operationsApi.createServiceIncident(auth, 'site-id', {
      severity: 'HIGH', title: 'Inverter 3 ngắt kết nối',
      detectedAt: '2026-07-26T02:15:00.000Z'
    }, 'create-incident-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/sites/site-id/service-incidents');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('create-incident-key');
  });

  it('sends every work-order command to the actions path with its own idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { closureCycle: null } }));
    vi.stubGlobal('fetch', fetchMock);

    await operationsApi.workOrderCommand(auth, 'work-order-id', {
      commandType: 'COMPLETE', expectedVersion: 5, workSummary: 'Thay quạt làm mát',
      evidenceRefs: ['DOCUMENT:uuid-1']
    }, 'complete-key-001');
    await operationsApi.workOrderCommand(auth, 'work-order-id', {
      commandType: 'CLOSE', expectedVersion: 7, returnToServiceRef: 'RTS-2026-014'
    }, 'close-key-0001');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/work-orders/work-order-id/actions',
      '/v1/work-orders/work-order-id/actions'
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      commandType: 'CLOSE', expectedVersion: 7, returnToServiceRef: 'RTS-2026-014'
    });
    for (const call of fetchMock.mock.calls) {
      expect(new Headers((call[1] as RequestInit).headers).get('Idempotency-Key'))
        .toMatch(/.{8,200}/);
    }
  });

  it('surfaces the SoD rejection the server rolled back with instead of softening it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'SOD_CONFLICT',
      message: 'Người thực hiện công việc không được tự xác nhận/đóng work order',
      retryable: false
    }, 422)));

    await expect(operationsApi.workOrderCommand(auth, 'work-order-id', {
      commandType: 'VERIFY', expectedVersion: 6, reason: 'Đã kiểm tra lại'
    }, 'verify-key-0001')).rejects.toMatchObject({
      status: 422, code: 'SOD_CONFLICT', retryable: false
    });
  });

  it('maps a missing return-to-service reference to the domain code, not a generic failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'RETURN_TO_SERVICE_REQUIRED',
      message: 'CLOSE phải ghi nhận bằng chứng bàn giao trở lại vận hành', retryable: false
    }, 422)));

    await expect(operationsApi.workOrderCommand(auth, 'work-order-id', {
      commandType: 'CLOSE', expectedVersion: 7
    }, 'close-key-0002')).rejects.toMatchObject({
      status: 422, code: 'RETURN_TO_SERVICE_REQUIRED'
    });
  });

  it('maps a duplicate work-order code to the register conflict the server names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'WORK_ORDER_CODE_CONFLICT', message: 'Mã work order đã tồn tại trong tenant',
      retryable: false
    }, 409)));

    await expect(operationsApi.createWorkOrder(auth, 'asset-id', {
      code: 'WO-2026-001', workType: 'CORRECTIVE', title: 'Trùng mã', priority: 'HIGH'
    }, 'duplicate-wo-key')).rejects.toMatchObject({
      status: 409, code: 'WORK_ORDER_CODE_CONFLICT'
    });
  });

  it('passes the null KPI and telemetry through untouched instead of defaulting them to zero', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {
        asset: {
          id: 'asset-id', projectId: 'project-id', siteId: 'site-id', equipmentId: null,
          assetCode: 'INV-03', operationalStatus: 'IN_SERVICE', activationDate: '2026-01-15'
        },
        workOrderCountsByStatus: { CLOSED: 4 },
        serviceIncidentCountsByStatus: {},
        alarmCaseCountsByState: { OPEN: 2 },
        kpi: null,
        telemetry: null
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await operationsApi.getAssetPerformance(auth, 'asset-id');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/assets/asset-id/performance');
    expect(result.data.kpi).toBeNull();
    expect(result.data.telemetry).toBeNull();
    // "No rows in that status" is absence, never a zero the client invented.
    expect(result.data.serviceIncidentCountsByStatus).toEqual({});
    expect(result.data.workOrderCountsByStatus).toEqual({ CLOSED: 4 });
  });
});
