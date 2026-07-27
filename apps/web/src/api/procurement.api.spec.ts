import { procurementApi } from './procurement.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('procurement API — API-076…085', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the supplier filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.listSuppliers(auth);
    await procurementApi.listSuppliers(auth, {
      cursor: 'opaque', limit: 25, category: 'PV_MODULE', qualificationStatus: 'QUALIFIED'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/suppliers');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/suppliers?cursor=opaque&limit=25&category=PV_MODULE&qualificationStatus=QUALIFIED'
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeNull();
  });

  it('sends the requisition command with tenant context and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.createRequisition(auth, 'project-id', {
      number: 'PR-2026-001', title: 'Mua module PV 580Wp', packageId: 'package-id',
      costCodeId: 'cost-code-id', needByDate: '2026-09-30'
    }, 'create-requisition-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/requisitions');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('create-requisition-key');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
    expect(headers.get('Authorization')).toBe('Bearer access');
  });

  it('issues an RFQ under its requisition and surfaces an ineligible invitee verbatim', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: {} }, 201))
      .mockResolvedValueOnce(response({
        code: 'SUPPLIER_INELIGIBLE',
        message: 'Mọi supplier được mời phải đang QUALIFIED và còn hiệu lực qualification',
        retryable: false
      }, 422));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.createRfq(auth, 'requisition-id', {
      number: 'RFQ-2026-001', dueDate: '2026-08-15T09:00:00.000Z',
      invitedSupplierIds: ['supplier-1', 'supplier-2']
    }, 'create-rfq-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/requisitions/requisition-id/rfqs');

    await expect(procurementApi.createRfq(auth, 'requisition-id', {
      number: 'RFQ-2026-002', dueDate: '2026-08-15T09:00:00.000Z',
      invitedSupplierIds: ['supplier-expired']
    }, 'create-rfq-key-2')).rejects.toMatchObject({
      status: 422, code: 'SUPPLIER_INELIGIBLE', retryable: false
    });
  });

  it('posts an evaluation under its bid and returns the embedded bid untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {
        id: 'evaluation-1', bidId: 'bid-1', evaluationType: 'COMMERCIAL', version: 1,
        evaluatorId: 'user-1', normalizedTotal: '9007199254740993.0001', currency: 'VND',
        normalizationBasis: null, overrideReason: null, notes: null,
        createdBy: 'user-1', createdAt: '2026-07-26T10:00:00.000Z',
        bid: {
          id: 'bid-1', rfqId: 'rfq-1', supplierProfileId: 'supplier-1', revision: 1,
          sealedStatus: 'OPENED', submittedAt: '2026-07-20T10:00:00.000Z',
          createdAt: '2026-07-20T10:00:00.000Z',
          total: '9007199254740993.0001', currency: 'VND', payloadRef: null
        }
      }
    }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const result = await procurementApi.createEvaluation(auth, 'bid-1', {
      evaluationType: 'COMMERCIAL', normalizedTotal: '9007199254740993.0001', currency: 'VND'
    }, 'create-evaluation-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/bids/bid-1/evaluations');
    // Beyond 2^53 with 4 decimals: a float round-trip anywhere would corrupt this.
    expect(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
      .toContain('"normalizedTotal":"9007199254740993.0001"');
    expect(result.data.bid.total).toBe('9007199254740993.0001');
    expect(result.data.normalizedTotal).toBe('9007199254740993.0001');
  });

  it('preserves a sealed bid payload without inventing the omitted commercial keys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      data: {
        id: 'evaluation-1', bidId: 'bid-1', evaluationType: 'TECHNICAL', version: 1,
        evaluatorId: 'user-1', normalizedTotal: null, currency: null,
        normalizationBasis: null, overrideReason: null, notes: null,
        createdBy: 'user-1', createdAt: '2026-07-26T10:00:00.000Z',
        bid: {
          id: 'bid-1', rfqId: 'rfq-1', supplierProfileId: 'supplier-1', revision: 1,
          sealedStatus: 'SEALED', submittedAt: '2026-07-20T10:00:00.000Z',
          createdAt: '2026-07-20T10:00:00.000Z'
        }
      }
    }, 201)));

    const result = await procurementApi.createEvaluation(auth, 'bid-1', {
      evaluationType: 'TECHNICAL'
    }, 'create-evaluation-key');

    // The keys must stay ABSENT, not appear as null — the client never fills them in.
    expect('total' in result.data.bid).toBe(false);
    expect('currency' in result.data.bid).toBe(false);
    expect('payloadRef' in result.data.bid).toBe(false);
  });

  it('uses the colon-suffixed award path and refuses to soften an SoD rejection', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: {} }))
      .mockResolvedValueOnce(response({
        code: 'AWARD_SOD_CONFLICT',
        message: 'Người đánh giá hồ sơ thầu không được tự trình kết quả', retryable: false
      }, 422));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.submitAward(auth, 'rfq-1', {
      awardedBidId: 'bid-1', reason: 'Giá thấp nhất và đạt kỹ thuật'
    }, 'submit-award-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/rfqs/rfq-1:submit-award');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      awardedBidId: 'bid-1', reason: 'Giá thấp nhất và đạt kỹ thuật'
    });

    await expect(procurementApi.submitAward(auth, 'rfq-1', {
      awardedBidId: 'bid-1'
    }, 'submit-award-key-2')).rejects.toMatchObject({
      status: 422, code: 'AWARD_SOD_CONFLICT'
    });
  });

  it('sends the purchase order with quantities and prices as verbatim text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { lines: [] } }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.createPurchaseOrder(auth, 'project-id', {
      poNo: 'PO-2026-001', title: 'Cung cấp module PV', supplierProfileId: 'supplier-1',
      totalValue: '1000000.5000', currency: 'VND', approvedBy: 'approver-id',
      costCodeId: 'cost-code-id',
      lines: [
        { lineNo: 1, description: 'Module 580Wp', quantity: '2.5', uom: 'EA', unitPrice: '400000.2' }
      ]
    }, 'create-po-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/purchase-orders');
    const body = String((fetchMock.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).toContain('"totalValue":"1000000.5000"');
    expect(body).toContain('"quantity":"2.5"');
    expect(body).toContain('"unitPrice":"400000.2"');
  });

  it('maps a line-sum mismatch to the domain error the server rolled back with', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'PO_LINE_SUM_MISMATCH',
      message: 'Tổng các dòng phải đúng bằng tổng giá trị của purchase order', retryable: false
    }, 422)));

    await expect(procurementApi.createPurchaseOrder(auth, 'project-id', {
      poNo: 'PO-2026-002', title: 'Sai breakdown', supplierProfileId: 'supplier-1',
      totalValue: '100', currency: 'VND', approvedBy: 'approver-id', costCodeId: 'cost-code-id',
      lines: [{ lineNo: 1, description: 'X', quantity: '1', uom: 'EA', unitPrice: '90' }]
    }, 'create-po-key-2')).rejects.toMatchObject({
      status: 422, code: 'PO_LINE_SUM_MISMATCH', retryable: false
    });
  });

  it('routes shipment and milestone commands to their object-scoped paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.createShipment(auth, 'po-1', {
      committedDate: '2026-09-01', carrier: 'ONE'
    }, 'create-shipment-key');
    await procurementApi.createShipmentMilestone(auth, 'shipment-1', {
      milestoneType: 'DEPARTED', eventTime: '2026-09-03T02:00:00.000Z', source: 'CARRIER'
    }, 'create-milestone-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/purchase-orders/po-1/shipments',
      '/v1/shipments/shipment-1/milestones'
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(new Headers((call[1] as RequestInit).headers).get('Idempotency-Key'))
        .toMatch(/.{8,200}/);
    }
  });

  it('surfaces an out-of-order milestone instead of retrying it silently', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'MILESTONE_OUT_OF_ORDER',
      message: 'Milestone không đúng trình tự vận chuyển đã ghi nhận', retryable: false
    }, 422)));

    await expect(procurementApi.createShipmentMilestone(auth, 'shipment-1', {
      milestoneType: 'BOOKED', eventTime: '2026-09-05T02:00:00.000Z', source: 'MANUAL'
    }, 'create-milestone-key-2')).rejects.toMatchObject({
      status: 422, code: 'MILESTONE_OUT_OF_ORDER', retryable: false
    });
  });

  it('sends the goods receipt with its serials and maps over-receipt to 422', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        data: { inventoryTransactions: [], serials: [] }
      }, 201))
      .mockResolvedValueOnce(response({
        code: 'OVER_RECEIPT',
        message: 'Tổng lượng đã nhận vượt quá số lượng đặt của dòng PO', retryable: false
      }, 422));
    vi.stubGlobal('fetch', fetchMock);

    await procurementApi.createGoodsReceipt(auth, 'po-1', {
      purchaseOrderLineId: 'line-1', siteId: 'site-1', receiptNo: 'GRN-2026-001',
      quantity: '2.5', condition: 'GOOD',
      serials: [{ serialNo: 'SN-0001', equipmentModelId: 'model-1' }]
    }, 'create-receipt-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/purchase-orders/po-1/goods-receipts');
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.quantity).toBe('2.5');
    expect(body.serials).toEqual([{ serialNo: 'SN-0001', equipmentModelId: 'model-1' }]);

    await expect(procurementApi.createGoodsReceipt(auth, 'po-1', {
      purchaseOrderLineId: 'line-1', siteId: 'site-1', receiptNo: 'GRN-2026-002',
      quantity: '99999', condition: 'GOOD'
    }, 'create-receipt-key-2')).rejects.toMatchObject({
      status: 422, code: 'OVER_RECEIPT'
    });
  });

  it('exposes no bid-submission function while API-079 is deferred', () => {
    // A stub here would be a promise the server cannot keep; its absence is the design.
    expect(Object.keys(procurementApi).sort()).toEqual([
      'createEvaluation', 'createGoodsReceipt', 'createPurchaseOrder', 'createRequisition',
      'createRfq', 'createShipment', 'createShipmentMilestone', 'listSuppliers', 'submitAward'
    ]);
  });
});
