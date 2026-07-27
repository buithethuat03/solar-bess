import {
  isBidSealed, isQualificationExpired, isSupplierInvitable, lineExtension,
  purchaseOrderLineTotal, remainingQuantity
} from './procurement';
import type { SealedBidView, SupplierView } from '@/types/procurement.types';

function supplier(overrides: Partial<SupplierView> = {}): SupplierView {
  return {
    id: 'supplier-1', companyId: 'company-1', legalEntityId: 'legal-1', category: 'PV_MODULE',
    qualificationStatus: 'QUALIFIED', validFrom: '2026-01-01', validTo: '2026-12-31',
    versionNo: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('procurement constants — sealed bids, qualification and exact decimals', () => {
  it('treats an omitted total as sealed and a present total as disclosed', () => {
    const sealed: SealedBidView = {
      id: 'bid-1', rfqId: 'rfq-1', supplierProfileId: 'supplier-1', revision: 1,
      sealedStatus: 'SEALED', submittedAt: '2026-07-20T10:00:00.000Z',
      createdAt: '2026-07-20T10:00:00.000Z'
    };
    expect(isBidSealed(sealed)).toBe(true);
    // Zero is a real price and must NOT read as sealed — only the missing key does.
    expect(isBidSealed({ ...sealed, total: '0', currency: 'VND' })).toBe(false);
    expect(isBidSealed({ ...sealed, total: '9007199254740993.0001', currency: 'VND' })).toBe(false);
  });

  it('invites only qualified suppliers whose validity has not lapsed', () => {
    expect(isSupplierInvitable(supplier(), '2026-07-26')).toBe(true);
    expect(isSupplierInvitable(supplier({ validTo: null }), '2030-01-01')).toBe(true);
    // The window closes at the end of validTo, so the boundary day is still valid.
    expect(isSupplierInvitable(supplier({ validTo: '2026-07-26' }), '2026-07-26')).toBe(true);
    expect(isSupplierInvitable(supplier({ validTo: '2026-07-25' }), '2026-07-26')).toBe(false);
    expect(isSupplierInvitable(supplier({ qualificationStatus: 'PENDING' }), '2026-07-26')).toBe(false);
    expect(isSupplierInvitable(supplier({ qualificationStatus: 'SUSPENDED' }), '2026-07-26')).toBe(false);
  });

  it('flags a lapsed window as expired even while the stored status still says QUALIFIED', () => {
    expect(isQualificationExpired(supplier({ validTo: '2026-07-25' }), '2026-07-26')).toBe(true);
    expect(isQualificationExpired(supplier({ qualificationStatus: 'EXPIRED', validTo: null }), '2026-07-26')).toBe(true);
    expect(isQualificationExpired(supplier(), '2026-07-26')).toBe(false);
  });

  it('multiplies a line exactly at full 8-digit scale without touching a float', () => {
    expect(lineExtension('2.5', '400000.2')).toBe('1000000.5');
    // 0.1 * 0.3 is 0.03 exactly; the float answer 0.030000000000000006 never appears.
    expect(lineExtension('0.1', '0.3')).toBe('0.03');
    expect(lineExtension('0.0001', '0.0001')).toBe('0.00000001');
    expect(lineExtension('999999999999999', '1')).toBe('999999999999999');
    expect(lineExtension('abc', '1')).toBeNull();
    expect(lineExtension('1', '')).toBeNull();
  });

  it('sums the whole breakdown exactly, mirroring SUM(quantity * unit_price)', () => {
    expect(purchaseOrderLineTotal([
      { quantity: '2.5', unitPrice: '400000.2' },
      { quantity: '1', unitPrice: '0.5' }
    ])).toBe('1000001');
    expect(purchaseOrderLineTotal([
      { quantity: '0.1', unitPrice: '0.2' },
      { quantity: '0.2', unitPrice: '0.1' }
    ])).toBe('0.04');
    expect(purchaseOrderLineTotal([])).toBe('0');
    // One bad entry withdraws the whole reference sum instead of quietly reporting a partial.
    expect(purchaseOrderLineTotal([
      { quantity: '1', unitPrice: '1' }, { quantity: 'x', unitPrice: '1' }
    ])).toBeNull();
  });

  it('derives the remaining quantity of a PO line as exact decimal text', () => {
    expect(remainingQuantity('10', [])).toBe('10');
    expect(remainingQuantity('10', ['2.5', '3.25'])).toBe('4.25');
    expect(remainingQuantity('10', ['10'])).toBe('0');
    // Already over-received: the figure goes negative rather than clamping to a soothing zero.
    expect(remainingQuantity('10', ['11'])).toBe('-1');
    expect(remainingQuantity('10', ['abc'])).toBeNull();
  });
});
