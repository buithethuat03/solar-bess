import { contractApi } from './contract.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('contract API — API-053…066', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the register filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.listContracts(auth, 'project-id');
    await contractApi.listContracts(auth, 'project-id', {
      cursor: 'opaque', limit: 25, type: 'EPC', status: 'DRAFT'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/contracts');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/projects/project-id/contracts?cursor=opaque&limit=25&type=EPC&status=DRAFT'
    );
  });

  it('sends create-contract with tenant context, idempotency key and money as verbatim text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    // Beyond 2^53 and with 4 decimals: any float round-trip would corrupt this value.
    await contractApi.createContract(auth, 'project-id', {
      contractNo: 'EPC-2026-001', title: 'Gói EPC nhà máy 50MWp', type: 'EPC',
      value: '9007199254740993.0001', currency: 'VND'
    }, 'create-contract-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/contracts');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    // The raw wire body must carry the money as the exact string that was typed.
    expect(String(init.body)).toContain('"value":"9007199254740993.0001"');
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('create-contract-key');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
    expect(headers.get('Authorization')).toBe('Bearer access');
  });

  it('patches a draft contract with the expected version and maps a stale one to 409', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: {} }))
      .mockResolvedValueOnce(response({
        code: 'VERSION_CONFLICT',
        message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
        retryable: false, currentVersion: 4
      }, 409));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.updateContract(auth, 'contract-id', {
      expectedVersion: 3, title: 'Tiêu đề mới'
    }, 'update-contract-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/contracts/contract-id');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ expectedVersion: 3, title: 'Tiêu đề mới' });
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('update-contract-key');

    await expect(contractApi.updateContract(auth, 'contract-id', {
      expectedVersion: 3, title: 'Tiêu đề mới'
    }, 'update-contract-key')).rejects.toMatchObject({
      status: 409, code: 'VERSION_CONFLICT', currentVersion: 4
    });
  });

  it('sends party, appendix and obligation commands to their contract-scoped paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.createContractParty(auth, 'contract-id', {
      companyId: 'company-id', legalEntityId: 'legal-id', partyRole: 'OWNER'
    }, 'create-party-key');
    await contractApi.createContractAppendix(auth, 'contract-id', {
      appendixNo: 'PL-01', type: 'AMENDMENT', valueImpact: '-2500000.5', status: 'EFFECTIVE',
      effectiveDate: '2026-08-01'
    }, 'create-appendix-key');
    await contractApi.createObligation(auth, 'contract-id', {
      clauseRef: '12.3', title: 'Bảo lãnh thực hiện hợp đồng', obligorPartyId: 'party-epc',
      beneficiaryPartyId: 'party-owner', triggerType: 'MILESTONE'
    }, 'create-obligation-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/contracts/contract-id/parties',
      '/v1/contracts/contract-id/appendices',
      '/v1/contracts/contract-id/obligations'
    ]);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/.{8,200}/);
    }
    // The signed appendix impact crosses the wire as the exact text that was typed.
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))
      .toContain('"valueImpact":"-2500000.5"');
  });

  it('uses the colon-suffixed fulfill path and refuses to soften an SoD rejection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: {} }))
      .mockResolvedValueOnce(response({
        code: 'SOD_CONFLICT',
        message: 'Người phụ trách hoặc người tạo không được tự quyết định nghĩa vụ',
        retryable: false
      }, 422));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.fulfillObligation(auth, 'obligation-id', {
      expectedVersion: 1, decisionType: 'WAIVED', reason: 'Điều khoản được miễn theo phụ lục 2',
      evidenceRefs: ['DOCUMENT:uuid-1']
    }, 'fulfill-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/obligations/obligation-id:fulfill');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      expectedVersion: 1, decisionType: 'WAIVED', reason: 'Điều khoản được miễn theo phụ lục 2',
      evidenceRefs: ['DOCUMENT:uuid-1']
    });

    await expect(contractApi.fulfillObligation(auth, 'obligation-id', {
      expectedVersion: 1, decisionType: 'FULFILLED', reason: 'Đã nộp bảo lãnh',
      evidenceRefs: ['DOCUMENT:uuid-1']
    }, 'fulfill-key-2')).rejects.toMatchObject({ status: 422, code: 'SOD_CONFLICT' });
  });

  it('pages obligations with the opaque cursor and no command header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.listObligations(auth, 'contract-id', { cursor: 'opaque', limit: 10 });

    expect(fetchMock.mock.calls[0]?.[0])
      .toBe('/v1/contracts/contract-id/obligations?cursor=opaque&limit=10');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeNull();
  });

  it('reads the cost summary and returns the per-currency groups untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {
        projectId: 'project-id', reportingCurrency: null,
        budget: [], commitments: [
          { currency: 'VND', status: 'ACTIVE', costCodeId: 'cc-1', costCode: 'CAPEX.PV', amount: '120000000000.0001' },
          { currency: 'USD', status: 'ACTIVE', costCodeId: 'cc-1', costCode: 'CAPEX.PV', amount: '350000.25' }
        ],
        payments: []
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const summary = await contractApi.getCostSummary(auth, 'project-id');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/cost-summary');
    expect(summary.data.reportingCurrency).toBeNull();
    // Amounts arrive as text and must still be text after the client — same currency split, no sum.
    expect(summary.data.commitments.map((line) => line.amount))
      .toEqual(['120000000000.0001', '350000.25']);
  });

  it('sends budget and commitment commands to their project-scoped paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.createBudgetVersion(auth, 'project-id', {
      currency: 'VND', totalAmount: '150000000000'
    }, 'budget-key-001');
    await contractApi.createCommitment(auth, 'project-id', {
      contractId: 'contract-id', costCodeId: 'cost-code-id', amount: '120000000000',
      sourceType: 'CONTRACT', sourceId: 'contract-id', sourceVersion: 1
    }, 'commitment-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/projects/project-id/budget-versions',
      '/v1/projects/project-id/commitments'
    ]);
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
      .toContain('"totalAmount":"150000000000"');
  });

  it('nests invoice, components and fx snapshot inside one payment command', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { components: [] } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.createPayment(auth, 'contract-id', {
      invoice: {
        invoiceNo: 'INV-77', invoiceDate: '2026-07-20', supplierCompanyId: 'company-id',
        supplierLegalEntityId: 'legal-id', grossAmount: '110000.0001', vatAmount: '10000',
        netAmount: '100000.0001'
      },
      payerCompanyId: 'payer-company', payerLegalEntityId: 'payer-legal',
      payeeCompanyId: 'payee-company', payeeLegalEntityId: 'payee-legal',
      requestedAmount: '99000.0001',
      components: [
        { sequenceNo: 1, componentType: 'BASE', amount: '110000.0001', ruleVersion: 'v1' },
        { sequenceNo: 2, componentType: 'RETENTION', amount: '-11000', rate: '-10', basisAmount: '110000.0001', ruleVersion: 'v1' }
      ],
      fxSnapshot: {
        baseCurrency: 'USD', quoteCurrency: 'VND', rate: '25401.123456789012',
        rateDate: '2026-07-20', source: 'SBV'
      }
    }, 'payment-key-01');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/contracts/contract-id/payments');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.invoice.netAmount).toBe('100000.0001');
    expect(body.components).toHaveLength(2);
    expect(body.components[1].amount).toBe('-11000');
    expect(body.fxSnapshot.rate).toBe('25401.123456789012');
  });

  it('surfaces a component-sum mismatch as the domain error the server rolled back with', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'COMPONENT_SUM_MISMATCH',
      message: 'Tổng các thành phần phải đúng bằng số tiền yêu cầu của payment',
      retryable: false
    }, 422)));

    await expect(contractApi.createPayment(auth, 'contract-id', {
      payerCompanyId: 'payer-company', payerLegalEntityId: 'payer-legal',
      payeeCompanyId: 'payee-company', payeeLegalEntityId: 'payee-legal',
      requestedAmount: '100', components: [
        { sequenceNo: 1, componentType: 'BASE', amount: '90', ruleVersion: 'v1' }
      ]
    }, 'payment-key-02')).rejects.toMatchObject({
      status: 422, code: 'COMPONENT_SUM_MISMATCH', retryable: false
    });
  });

  it('reads one payment without sending a command header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { components: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await contractApi.getPayment(auth, 'payment-id');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/payments/payment-id');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeNull();
  });

  it('maps a duplicate contract number to the register conflict the server names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'CONTRACT_NUMBER_CONFLICT',
      message: 'Số hợp đồng đã tồn tại trong dự án', retryable: false
    }, 409)));

    await expect(contractApi.createContract(auth, 'project-id', {
      contractNo: 'EPC-2026-001', title: 'Trùng số', type: 'EPC', value: '1', currency: 'VND'
    }, 'duplicate-key')).rejects.toMatchObject({
      status: 409, code: 'CONTRACT_NUMBER_CONFLICT',
      message: 'Số hợp đồng đã tồn tại trong dự án'
    });
  });
});
