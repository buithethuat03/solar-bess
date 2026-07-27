import { commissioningApi } from './commissioning.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('commissioning API — API-098…105', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the system filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await commissioningApi.listCommissioningSystems(auth, 'project-id');
    await commissioningApi.listCommissioningSystems(auth, 'project-id', {
      cursor: 'opaque', limit: 10, status: 'READY_FOR_TEST', systemType: 'PV_ARRAY'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/commissioning-systems');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/projects/project-id/commissioning-systems?cursor=opaque&limit=10&status=READY_FOR_TEST&systemType=PV_ARRAY'
    );
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
      .get('Idempotency-Key')).toBeNull();
  });

  it('creates a system with tenant context and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await commissioningApi.createCommissioningSystem(auth, 'project-id', {
      code: 'PV-01', name: 'Dãy PV khu A', systemType: 'PV_ARRAY'
    }, 'create-system-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/commissioning-systems');
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('Idempotency-Key')).toBe('create-system-key');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
  });

  it('refuses a locked procedure revision with the code the server sent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'PROCEDURE_REVISION_LOCKED',
      message: 'Test pack chỉ được tạo từ revision quy trình đã ISSUED và quét sạch mã độc',
      retryable: false
    }, 422)));

    await expect(commissioningApi.createTestPack(auth, 'system-1', {
      code: 'TP-01', title: 'Thử nghiệm chuỗi PV', procedureRevisionId: 'revision-draft'
    }, 'create-pack-key')).rejects.toMatchObject({
      status: 422, code: 'PROCEDURE_REVISION_LOCKED', retryable: false
    });
  });

  it('uses the colon-suffixed complete path with the expected version', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: {} }, 201))
      .mockResolvedValueOnce(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await commissioningApi.startTestRun(auth, 'pack-1', {
      satisfiedPrerequisites: ['ISOLATION_CONFIRMED']
    }, 'start-run-key');
    await commissioningApi.completeTestRun(auth, 'run-1', {
      expectedVersion: 1, result: 'FAILED', evidenceRefs: ['DOCUMENT:uuid-1']
    }, 'complete-run-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/test-packs/pack-1/test-runs',
      '/v1/test-runs/run-1:complete'
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      expectedVersion: 1, result: 'FAILED', evidenceRefs: ['DOCUMENT:uuid-1']
    });
  });

  it('surfaces a second result write as the conflict the server answers with', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'RESULT_ALREADY_RECORDED',
      message: 'Kết quả của lần chạy này đã được ghi nhận', retryable: false
    }, 409)));

    await expect(commissioningApi.completeTestRun(auth, 'run-1', {
      expectedVersion: 2, result: 'PASSED', evidenceRefs: ['DOCUMENT:uuid-2']
    }, 'complete-run-key-2')).rejects.toMatchObject({
      status: 409, code: 'RESULT_ALREADY_RECORDED'
    });
  });

  it('creates a retest through its own colon-suffixed path with a reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await commissioningApi.createRetest(auth, 'run-1', {
      reason: 'Đã thay biến tần lỗi và hiệu chuẩn lại thiết bị đo'
    }, 'create-retest-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/test-runs/run-1:create-retest');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      reason: 'Đã thay biến tần lỗi và hiệu chuẩn lại thiết bị đo'
    });
  });

  it('reads COD readiness with an optional as-of instant and no command header', async () => {
    // A `Response` body may only be read once, so each call needs its own instance.
    const fetchMock = vi.fn().mockImplementation(async () => response({
      data: {
        projectId: 'project-id',
        readiness: {
          asOf: '2026-07-26T10:00:00.000Z',
          gates: {
            total: 3, accepted: 1, waived: 0, pending: 2, underReview: 0, rejected: 0,
            mandatoryTotal: 3, mandatoryOutstanding: 2
          },
          categories: [{ category: 'LEGAL', total: 2, satisfied: 1, outstanding: 1 }],
          expiredEvidenceGateIds: [],
          blockingFindings: { punchItems: 1, criticalNcrs: 0, stopWorks: 0, total: 1, items: [] },
          blocked: true, readyToSign: false
        },
        packages: []
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await commissioningApi.readCodReadiness(auth, 'project-id');
    const result = await commissioningApi.readCodReadiness(auth, 'project-id', {
      asOf: '2026-07-26T10:00:00.000Z'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/cod-readiness');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/projects/project-id/cod-readiness?asOf=2026-07-26T10%3A00%3A00.000Z'
    );
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
      .get('Idempotency-Key')).toBeNull();
    expect(result.data.readiness.readyToSign).toBe(false);
  });

  it('multiplexes every COD verb through the single transition endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { resourceType: 'CodGate', resourceId: 'gate-1' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await commissioningApi.codTransitionCommand(auth, 'project-id', {
      commandType: 'DEFINE_GATE', category: 'LEGAL', code: 'COD-LEGAL-01',
      title: 'Giấy phép vận hành', mandatory: true, waivable: false
    }, 'define-gate-key');
    await commissioningApi.codTransitionCommand(auth, 'project-id', {
      commandType: 'SIGN_COD', codPackageId: 'package-1', expectedVersion: 1
    }, 'sign-cod-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/projects/project-id/cod-transition-commands',
      '/v1/projects/project-id/cod-transition-commands'
    ]);
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      commandType: 'SIGN_COD', codPackageId: 'package-1', expectedVersion: 1
    });
  });

  it('reports a blocked or self-signed COD refusal exactly as the server named it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        code: 'GATE_BLOCKED', message: 'Đang có phát hiện chặn COD chưa được xử lý',
        retryable: false
      }, 422))
      .mockResolvedValueOnce(response({
        code: 'SOD_CONFLICT', message: 'Người trình hồ sơ COD không được tự ký hồ sơ đó',
        retryable: false
      }, 422));
    vi.stubGlobal('fetch', fetchMock);

    await expect(commissioningApi.codTransitionCommand(auth, 'project-id', {
      commandType: 'SIGN_COD', codPackageId: 'package-1', expectedVersion: 1
    }, 'sign-cod-key-1')).rejects.toMatchObject({ status: 422, code: 'GATE_BLOCKED' });

    await expect(commissioningApi.codTransitionCommand(auth, 'project-id', {
      commandType: 'SIGN_COD', codPackageId: 'package-1', expectedVersion: 1
    }, 'sign-cod-key-2')).rejects.toMatchObject({ status: 422, code: 'SOD_CONFLICT' });
  });

  it('exposes no function that could rewrite a recorded test run', () => {
    // API-102 writes the result once and the row is frozen; a mutation helper cannot exist.
    expect(Object.keys(commissioningApi).sort()).toEqual([
      'codTransitionCommand', 'completeTestRun', 'createCommissioningSystem', 'createRetest',
      'createTestPack', 'listCommissioningSystems', 'readCodReadiness', 'startTestRun'
    ]);
  });
});
