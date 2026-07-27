import { sumMoney } from '@/constants/contracts';
import type {
  EvaluationType, GoodsReceiptCondition, GoodsReceiptStatus, InventoryTransactionType,
  PurchaseOrderStatus, RequisitionStatus, RfqStatus, SealedBidView, ShipmentMilestoneSource,
  ShipmentMilestoneType, ShipmentStatus, SupplierQualificationStatus, SupplierView
} from '@/types/procurement.types';

/** API-077/078/082/085 business number bound: `^[A-Z0-9][A-Z0-9_./-]{1,79}$`. */
export const BUSINESS_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9_./-]{1,79}$/;

/** API-076 category bound: `^[A-Z0-9][A-Z0-9_.-]{0,79}$`. */
export const SUPPLIER_CATEGORY_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;

/** API-085 serial alphabet: printable ASCII only, so JS and Postgres normalize identically. */
export const SERIAL_PATTERN = /^[\x20-\x7E]{1,120}$/;

export const SUPPLIER_QUALIFICATION_STATUSES: readonly SupplierQualificationStatus[] =
  ['PENDING', 'QUALIFIED', 'SUSPENDED', 'EXPIRED'];

export const SUPPLIER_QUALIFICATION_LABEL: Record<SupplierQualificationStatus, string> = {
  PENDING: 'Chờ đánh giá',
  QUALIFIED: 'Đạt sơ tuyển',
  SUSPENDED: 'Tạm đình chỉ',
  EXPIRED: 'Hết hiệu lực'
};

export const REQUISITION_STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: 'Nháp',
  TECHNICAL_CHECK: 'Kiểm tra kỹ thuật',
  COST_CHECK: 'Kiểm tra chi phí',
  SUBMITTED: 'Đã trình',
  APPROVED: 'Đã phê duyệt',
  RETURNED: 'Trả lại',
  REJECTED: 'Bị từ chối',
  SOURCING: 'Đang tìm nguồn'
};

export const RFQ_STATUS_LABEL: Record<RfqStatus, string> = {
  RFQ_DRAFT: 'Nháp',
  ISSUED: 'Đã phát hành',
  BID_OPEN: 'Đang mở thầu',
  CLOSED: 'Đã đóng thầu',
  TECHNICAL_EVALUATION: 'Đánh giá kỹ thuật',
  COMMERCIAL_EVALUATION: 'Đánh giá thương mại',
  AWARD_SUBMITTED: 'Đã trình kết quả',
  AWARD_APPROVED: 'Kết quả đã duyệt',
  REJECTED: 'Bị từ chối'
};

export const EVALUATION_TYPES: readonly EvaluationType[] = ['TECHNICAL', 'COMMERCIAL'];

export const EVALUATION_TYPE_LABEL: Record<EvaluationType, string> = {
  TECHNICAL: 'Kỹ thuật',
  COMMERCIAL: 'Thương mại'
};

export const PURCHASE_ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Nháp',
  REVIEW: 'Đang review',
  SUBMITTED: 'Đã trình',
  APPROVED: 'Đã phê duyệt',
  ISSUED: 'Đã phát hành',
  ACKNOWLEDGED: 'Nhà cung cấp xác nhận',
  AMENDED: 'Đã điều chỉnh',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy'
};

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PLANNED: 'Đã lên kế hoạch',
  BOOKED: 'Đã đặt chỗ',
  IN_TRANSIT: 'Đang vận chuyển',
  CUSTOMS: 'Thông quan',
  DELIVERED: 'Đã giao',
  EXCEPTION: 'Sự cố',
  CLOSED: 'Đã đóng'
};

/**
 * FR-070 ranked sequence. EXCEPTION is deliberately last and unranked: a carrier may report it at
 * any point, and the timeline renders it off the rank axis instead of pretending it has a place in
 * the journey.
 */
export const SHIPMENT_MILESTONE_SEQUENCE: readonly ShipmentMilestoneType[] = [
  'BOOKED', 'DEPARTED', 'ARRIVED', 'CUSTOMS_CLEARED', 'DELIVERED'
];

export const SHIPMENT_MILESTONE_TYPES: readonly ShipmentMilestoneType[] = [
  ...SHIPMENT_MILESTONE_SEQUENCE, 'EXCEPTION'
];

export const SHIPMENT_MILESTONE_LABEL: Record<ShipmentMilestoneType, string> = {
  BOOKED: 'Đã đặt chỗ',
  DEPARTED: 'Đã rời cảng đi',
  ARRIVED: 'Đã đến cảng đích',
  CUSTOMS_CLEARED: 'Đã thông quan',
  DELIVERED: 'Đã giao hàng',
  EXCEPTION: 'Sự cố vận chuyển'
};

export const SHIPMENT_MILESTONE_SOURCES: readonly ShipmentMilestoneSource[] = ['MANUAL', 'CARRIER'];

export const SHIPMENT_MILESTONE_SOURCE_LABEL: Record<ShipmentMilestoneSource, string> = {
  MANUAL: 'Nhập tay',
  CARRIER: 'Hãng vận chuyển'
};

export const GOODS_RECEIPT_CONDITIONS: readonly GoodsReceiptCondition[] =
  ['GOOD', 'DAMAGED', 'SHORTAGE', 'WRONG_ITEM'];

export const GOODS_RECEIPT_CONDITION_LABEL: Record<GoodsReceiptCondition, string> = {
  GOOD: 'Nguyên vẹn',
  DAMAGED: 'Hư hỏng',
  SHORTAGE: 'Thiếu hàng',
  WRONG_ITEM: 'Sai chủng loại'
};

export const GOODS_RECEIPT_STATUS_LABEL: Record<GoodsReceiptStatus, string> = {
  RECEIVING: 'Đang nhận',
  ACCEPTED: 'Đã chấp nhận',
  PARTIAL: 'Nhận một phần',
  QUARANTINED: 'Cách ly kiểm tra',
  REJECTED: 'Từ chối',
  CLOSED: 'Đã đóng'
};

export const INVENTORY_TRANSACTION_LABEL: Record<InventoryTransactionType, string> = {
  RECEIPT: 'Nhập kho',
  ISSUE: 'Xuất kho',
  RETURN: 'Trả lại',
  ADJUSTMENT: 'Điều chỉnh',
  QUARANTINE_IN: 'Đưa vào cách ly',
  QUARANTINE_RELEASE: 'Giải phóng cách ly'
};

/** Nhãn duy nhất cho một giá trị bị niêm phong — không bao giờ là '—', '0' hay 'undefined'. */
export const SEALED_BID_LABEL = 'Niêm phong';

/**
 * A bid is sealed when the API did not serialize its commercial fields AT ALL.
 *
 * The test is key presence, not truthiness: before the RFQ reaches CLOSED the server omits `total`,
 * `currency` and `payloadRef` from the payload entirely. Treating a missing key as `undefined` and
 * printing a dash would assert "there is no price", which is false and is exactly the leak-adjacent
 * lie the sealing rule exists to prevent.
 */
export function isBidSealed(bid: SealedBidView): boolean {
  return !('total' in bid) || bid.total === undefined;
}

/**
 * FR-061 eligibility for an RFQ invitation, as API-078 decides it: QUALIFIED **and** a `validTo`
 * that is not in the past. `asOf` is a yyyy-mm-dd string compared lexicographically, which is exact
 * for ISO dates and avoids dragging a timezone into a pure date rule.
 */
export function isSupplierInvitable(supplier: SupplierView, asOf: string): boolean {
  if (supplier.qualificationStatus !== 'QUALIFIED') return false;
  return supplier.validTo === null || supplier.validTo >= asOf;
}

/** True when the qualification window has lapsed, whatever the stored status still claims. */
export function isQualificationExpired(supplier: SupplierView, asOf: string): boolean {
  return supplier.qualificationStatus === 'EXPIRED'
    || (supplier.validTo !== null && supplier.validTo < asOf);
}

/**
 * DTO scale for quantity and unit price: `numeric(...,4)` on both sides, so an exact extension
 * carries at most 8 fraction digits.
 */
const DECIMAL_SCALE = 4;
const EXTENSION_SCALE = DECIMAL_SCALE * 2;
const DECIMAL_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

function toScaled(value: string): bigint | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const [integer, fraction = ''] = trimmed.split('.');
  return BigInt(integer + fraction.padEnd(DECIMAL_SCALE, '0'));
}

function fromScaled(scaled: bigint, scale: number): string {
  const digits = scaled.toString().padStart(scale + 1, '0');
  const integer = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${integer}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Exact `quantity * unitPrice` for one purchase-order line, kept entirely in BigInt.
 *
 * `sumMoney` in `@/constants/contracts` is reused wherever a plain addition is needed (see
 * `remainingQuantity` below), but it cannot express this: it has no multiplication and its
 * signed-money pattern caps at 4 fraction digits, while an exact extension of two 4-dp factors
 * needs 8. Returns null the moment either factor is not valid decimal text — a partial product
 * would only mislead. The BINDING identity is still `ck_purchase_order_line_sum` in Postgres.
 */
export function lineExtension(quantity: string, unitPrice: string): string | null {
  const scaledQuantity = toScaled(quantity);
  const scaledPrice = toScaled(unitPrice);
  if (scaledQuantity === null || scaledPrice === null) return null;
  return fromScaled(scaledQuantity * scaledPrice, EXTENSION_SCALE);
}

/**
 * Exact `SUM(quantity * unit_price)` over the whole breakdown — the same expression the deferred
 * trigger evaluates before it will accept the header `totalValue`. Reference only; the server is
 * the arbiter and answers 422 PO_LINE_SUM_MISMATCH when the two disagree.
 */
export function purchaseOrderLineTotal(
  lines: ReadonlyArray<{ quantity: string; unitPrice: string }>
): string | null {
  let total = 0n;
  for (const line of lines) {
    const scaledQuantity = toScaled(line.quantity);
    const scaledPrice = toScaled(line.unitPrice);
    if (scaledQuantity === null || scaledPrice === null) return null;
    total += scaledQuantity * scaledPrice;
  }
  return fromScaled(total, EXTENSION_SCALE);
}

/**
 * Ordered quantity minus everything already received against the line, as exact decimal text.
 *
 * Plain addition, so it reuses `sumMoney` with the received amounts negated — no second summing
 * implementation exists in the web app. Over-receipt is refused by Postgres (422 OVER_RECEIPT)
 * counting every receipt that is not REJECTED, quarantined stock included, because it physically
 * arrived; this figure exists so the user sees the limit BEFORE submitting, not to enforce it.
 */
export function remainingQuantity(
  ordered: string, received: readonly string[]
): string | null {
  return sumMoney([ordered, ...received.map((value) => `-${value.trim()}`)]);
}
