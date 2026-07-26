import type {
  BudgetVersionStatus, CommitmentSourceType, CommitmentStatus, ContractAppendixStatus,
  ContractAppendixType, ContractPartyRole, ContractStatus, ContractType, ObligationDecisionType,
  ObligationStatus, PaymentComponentType, PaymentStatus
} from '@/types/contract.types';

/** API-054/API-058 bounds: `^[A-Z0-9][A-Z0-9_./-]{1,79}$` for contract and appendix numbers. */
export const CONTRACT_NO_PATTERN = /^[A-Z0-9][A-Z0-9_./-]{1,79}$/;

/** Mirrors the API MONEY DTO pattern — decimal text, up to 4 fraction digits, never a JS number. */
export const MONEY_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/** Signed variant for fields where negatives are legal (appendix impact, deduction components). */
export const SIGNED_MONEY_PATTERN = /^-?\d{1,15}(\.\d{1,4})?$/;

export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** numeric(9,6) component rate as text. */
export const COMPONENT_RATE_PATTERN = /^-?\d{1,3}(\.\d{1,6})?$/;

/** numeric(28,12) FX rate as text. */
export const FX_RATE_PATTERN = /^\d{1,16}(\.\d{1,12})?$/;

/** API-060 trigger taxonomy code: `^[A-Z][A-Z0-9_]{0,29}$`. */
export const TRIGGER_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,29}$/;

export const CONTRACT_TYPES: readonly ContractType[] = [
  'EPC', 'EQUIPMENT_LEASE', 'PPA', 'ESCO', 'SUBCONTRACT', 'EQUIPMENT_PURCHASE'
];

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  EPC: 'Tổng thầu EPC',
  EQUIPMENT_LEASE: 'Thuê thiết bị',
  PPA: 'Mua bán điện (PPA)',
  ESCO: 'ESCO',
  SUBCONTRACT: 'Thầu phụ',
  EQUIPMENT_PURCHASE: 'Mua sắm thiết bị'
};

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'DRAFT', 'REVIEW', 'APPROVED', 'SIGNED', 'EFFECTIVE', 'SUSPENDED', 'EXPIRED', 'CLOSED'
];

/**
 * Đủ từ vựng FR-036 dù V1 chưa có thao tác nào đưa hợp đồng rời DRAFT: bộ lọc và chip vẫn phải
 * đọc được dữ liệu do migration/hệ thống khác tạo ra.
 */
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Nháp',
  REVIEW: 'Đang review',
  APPROVED: 'Đã phê duyệt',
  SIGNED: 'Đã ký',
  EFFECTIVE: 'Đang hiệu lực',
  SUSPENDED: 'Tạm dừng',
  EXPIRED: 'Hết hạn',
  CLOSED: 'Đã đóng'
};

export const CONTRACT_PARTY_ROLES: readonly ContractPartyRole[] = [
  'OWNER', 'EPC', 'VENDOR', 'LENDER', 'SUBCONTRACTOR', 'OFFTAKER'
];

export const PARTY_ROLE_LABEL: Record<ContractPartyRole, string> = {
  OWNER: 'Chủ đầu tư',
  EPC: 'Tổng thầu EPC',
  VENDOR: 'Nhà cung cấp',
  LENDER: 'Bên cho vay',
  SUBCONTRACTOR: 'Thầu phụ',
  OFFTAKER: 'Bên mua điện'
};

export const APPENDIX_TYPES: readonly ContractAppendixType[] = ['AMENDMENT', 'ADDENDUM'];

export const APPENDIX_TYPE_LABEL: Record<ContractAppendixType, string> = {
  AMENDMENT: 'Phụ lục sửa đổi',
  ADDENDUM: 'Phụ lục bổ sung'
};

export const APPENDIX_STATUS_LABEL: Record<ContractAppendixStatus, string> = {
  DRAFT: 'Nháp',
  EFFECTIVE: 'Đang hiệu lực',
  SUPERSEDED: 'Đã thay thế',
  CANCELLED: 'Đã hủy'
};

/** API-058 chỉ nhận DRAFT hoặc EFFECTIVE khi tạo; hai trạng thái còn lại là kết quả hệ thống. */
export const APPENDIX_CREATABLE_STATUSES: ReadonlyArray<'DRAFT' | 'EFFECTIVE'> =
  ['DRAFT', 'EFFECTIVE'];

/**
 * Từ vựng nghĩa vụ. DUE/OVERDUE là projection theo ngày đáo hạn — hàng lưu trữ vẫn là OPEN, nên
 * một nghĩa vụ "Quá hạn" vẫn quyết định được.
 */
export const OBLIGATION_STATUS_LABEL: Record<ObligationStatus, string> = {
  OPEN: 'Đang mở',
  DUE: 'Đến hạn',
  OVERDUE: 'Quá hạn',
  FULFILLED: 'Đã hoàn thành',
  WAIVED: 'Đã miễn trừ',
  CANCELLED: 'Đã hủy'
};

export const OBLIGATION_DECISION_TYPES: readonly ObligationDecisionType[] =
  ['FULFILLED', 'WAIVED'];

export const OBLIGATION_DECISION_LABEL: Record<ObligationDecisionType, string> = {
  FULFILLED: 'Xác nhận hoàn thành',
  WAIVED: 'Miễn trừ'
};

export const BUDGET_STATUS_LABEL: Record<BudgetVersionStatus, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã trình',
  APPROVED: 'Đã phê duyệt',
  SUPERSEDED: 'Đã thay thế'
};

export const COMMITMENT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  ACTIVE: 'Đang hiệu lực',
  REVERSED: 'Đã đảo',
  CLOSED: 'Đã đóng'
};

export const COMMITMENT_SOURCE_TYPES: readonly CommitmentSourceType[] =
  ['CONTRACT', 'CONTRACT_APPENDIX'];

export const COMMITMENT_SOURCE_LABEL: Record<CommitmentSourceType, string> = {
  CONTRACT: 'Hợp đồng',
  CONTRACT_APPENDIX: 'Phụ lục hợp đồng'
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã trình',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Bị từ chối',
  SENT: 'Đã gửi ngân hàng',
  PAID: 'Đã thanh toán',
  RECONCILED: 'Đã đối soát',
  CANCELLED: 'Đã hủy'
};

export const PAYMENT_COMPONENT_TYPES: readonly PaymentComponentType[] = [
  'BASE', 'VAT', 'RETENTION', 'RETENTION_RELEASE', 'WITHHOLDING',
  'ADVANCE_RECOVERY', 'OTHER_DEDUCTION'
];

/** DB-039: các loại khấu trừ phải mang số âm hoặc 0; các loại cộng phải dương hoặc 0. */
export const PAYMENT_COMPONENT_LABEL: Record<PaymentComponentType, string> = {
  BASE: 'Giá trị gốc',
  VAT: 'Thuế GTGT',
  RETENTION: 'Giữ lại',
  RETENTION_RELEASE: 'Hoàn trả giữ lại',
  WITHHOLDING: 'Khấu trừ tại nguồn',
  ADVANCE_RECOVERY: 'Thu hồi tạm ứng',
  OTHER_DEDUCTION: 'Khấu trừ khác'
};

/** DTO money scale — numeric(...,4); the exact-sum helper scales by this many fraction digits. */
const MONEY_SCALE = 4;

/**
 * Group integer digits for display without ever leaving the string domain. A narrow no-break
 * space separator keeps the result unambiguous next to the '.' decimal point the API uses.
 * NEVER replace this with `Number(...).toLocaleString()` — that would round 4-dp amounts and
 * corrupt anything past 2^53.
 */
export function formatMoney(value: string | null): string {
  if (value === null || value === '') return '—';
  const negative = value.startsWith('-');
  const [integer, fraction] = (negative ? value.slice(1) : value).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return `${negative ? '-' : ''}${grouped}${fraction !== undefined ? `.${fraction}` : ''}`;
}

/**
 * Exact decimal sum for the reference total under the payment-component editor. Amounts are
 * scaled to integers (10^4) and added with BigInt, so the arithmetic is exact at any magnitude;
 * the binding COMPONENT_SUM identity is still decided by Postgres. Returns null as soon as one
 * entry is not valid signed-money text — a partial sum would only mislead.
 */
export function sumMoney(values: readonly string[]): string | null {
  let total = 0n;
  for (const raw of values) {
    const value = raw.trim();
    if (!SIGNED_MONEY_PATTERN.test(value)) return null;
    const negative = value.startsWith('-');
    const [integer, fraction = ''] = (negative ? value.slice(1) : value).split('.');
    const scaled = BigInt(integer + fraction.padEnd(MONEY_SCALE, '0'));
    total += negative ? -scaled : scaled;
  }
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(MONEY_SCALE + 1, '0');
  const integer = digits.slice(0, -MONEY_SCALE);
  const fraction = digits.slice(-MONEY_SCALE).replace(/0+$/, '');
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`;
}
