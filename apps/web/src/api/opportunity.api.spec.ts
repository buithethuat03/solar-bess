import { opportunityApi } from './opportunity.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('opportunity API — API-026…033', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the pipeline filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { limit: 50, nextCursor: null }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await opportunityApi.listOpportunities(auth);
    await opportunityApi.listOpportunities(auth, {
      cursor: 'opaque', limit: 25, stage: 'SCENARIO_READY', customerCompanyId: 'company-id'
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/opportunities',
      '/v1/opportunities?cursor=opaque&limit=25&stage=SCENARIO_READY&customerCompanyId=company-id'
    ]);
  });

  it('sends the expected capacity as the exact text that was typed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    // 19 significant digits at the DTO's 15-integer-digit ceiling: more than a double can hold,
    // so any float round-trip would corrupt it.
    await opportunityApi.createOpportunity(auth, {
      code: 'OPP-2026-001', name: 'Nhà máy 50MWp Ninh Thuận',
      expectedCapacityKwp: '900719925474099.0001'
    }, 'create-opportunity-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/opportunities');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('"expectedCapacityKwp":"900719925474099.0001"');
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('create-opportunity-key');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
  });

  it('patches a stage move with the expected version and maps a stale one to 409', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: {} }))
      .mockResolvedValueOnce(response({
        code: 'VERSION_CONFLICT', message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
        retryable: false, currentVersion: 5
      }, 409));
    vi.stubGlobal('fetch', fetchMock);

    await opportunityApi.updateOpportunity(auth, 'opportunity-id', {
      expectedVersion: 4, stage: 'QUALIFIED'
    }, 'update-opportunity-key');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/opportunities/opportunity-id');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ expectedVersion: 4, stage: 'QUALIFIED' });

    await expect(opportunityApi.updateOpportunity(auth, 'opportunity-id', {
      expectedVersion: 4, stage: 'QUALIFIED'
    }, 'update-opportunity-key')).rejects.toMatchObject({
      status: 409, code: 'VERSION_CONFLICT', currentVersion: 5
    });
  });

  it('sends scenario financials verbatim beside their formula version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await opportunityApi.createInvestmentScenario(auth, 'opportunity-id', {
      scenarioType: 'HYBRID', currency: 'VND', capexTotal: '900719925474099.2500',
      npv: '-1250000.5001', irr: '12.457891', paybackMonths: 84,
      inputSnapshot: { tariff: '1250.75', years: 20 }, formulaVersion: 'fin-model-v3'
    }, 'create-scenario-key');

    expect(fetchMock.mock.calls[0]?.[0])
      .toBe('/v1/opportunities/opportunity-id/investment-scenarios');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    // Stored evidence: every decimal stays the exact string, and the formula version rides along.
    expect(body.capexTotal).toBe('900719925474099.2500');
    expect(body.npv).toBe('-1250000.5001');
    expect(body.irr).toBe('12.457891');
    expect(body.formulaVersion).toBe('fin-model-v3');
    expect(body.inputSnapshot).toEqual({ tariff: '1250.75', years: 20 });
  });

  it('submits a scenario on the colon path and never offers an approve operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await opportunityApi.submitInvestmentScenario(auth, 'scenario-id', {
      expectedVersion: 1, comment: 'Trình hội đồng đầu tư'
    }, 'submit-scenario-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/investment-scenarios/scenario-id:submit');
    // The V1 catalog has no approve/reject operation for a pre-project scenario, so the client
    // must not have one either — a method here would imply a decision nothing can make.
    expect(Object.keys(opportunityApi)).not.toContain('approveInvestmentScenario');
    expect(Object.keys(opportunityApi)).not.toContain('approveOpportunity');
  });

  it('reports a replayed convert as the existing project rather than an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {
        id: 'project-id', code: 'OPP-2026-001', name: 'Nhà máy 50MWp', type: 'SOLAR',
        phase: 'INITIATION', recordStatus: 'DRAFT', sites: [{ id: 'site-id', code: 'S-01' }],
        opportunityId: 'opportunity-id', alreadyConverted: true
      }
    }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await opportunityApi.convertOpportunity(auth, 'opportunity-id', {
      portfolioId: 'portfolio-id', ownerLegalEntityId: 'legal-id', projectType: 'SOLAR',
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-06-30',
      primarySite: { code: 'S-01', name: 'Site chính', timezone: 'Asia/Ho_Chi_Minh' }
    }, 'convert-key-0001');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/opportunities/opportunity-id:convert');
    expect(result.data.alreadyConverted).toBe(true);
    expect(result.data.id).toBe('project-id');
  });

  it('maps a convert refused by stage to the domain code the server named', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'INVALID_STAGE_TRANSITION',
      message: 'Chỉ opportunity APPROVED (hoặc có scenario APPROVED) mới được chuyển thành dự án',
      retryable: false
    }, 422)));

    await expect(opportunityApi.convertOpportunity(auth, 'opportunity-id', {
      portfolioId: 'portfolio-id', ownerLegalEntityId: 'legal-id', projectType: 'BESS',
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-06-30',
      primarySite: { code: 'S-01', name: 'Site chính', timezone: 'Asia/Ho_Chi_Minh' }
    }, 'convert-key-0002')).rejects.toMatchObject({
      status: 422, code: 'INVALID_STAGE_TRANSITION'
    });
  });

  it('maps a duplicate opportunity to the server duplicate check', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'DUPLICATE_OPPORTUNITY',
      message: 'Đã có opportunity cùng khách hàng và địa điểm (duplicate check)', retryable: false
    }, 409)));

    await expect(opportunityApi.createOpportunity(auth, {
      code: 'OPP-2026-002', name: 'Trùng khách hàng và địa điểm',
      customerCompanyId: 'company-id', locationText: 'Ninh Thuận'
    }, 'duplicate-opportunity-key')).rejects.toMatchObject({
      status: 409, code: 'DUPLICATE_OPPORTUNITY'
    });
  });

  it('reads detail and survey/scenario embeds without a command header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {}, surveys: [], scenarios: []
    }));
    vi.stubGlobal('fetch', fetchMock);

    await opportunityApi.getOpportunity(auth, 'opportunity-id');
    await opportunityApi.createSurveyPackage(auth, 'opportunity-id', {
      dataQuality: 'VALIDATED', documentRefs: ['DOCUMENT:uuid-1']
    }, 'create-survey-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/opportunities/opportunity-id');
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers)
      .get('Idempotency-Key')).toBeNull();
    expect(fetchMock.mock.calls[1]?.[0])
      .toBe('/v1/opportunities/opportunity-id/survey-packages');
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers)
      .get('Idempotency-Key')).toBe('create-survey-key');
  });
});
