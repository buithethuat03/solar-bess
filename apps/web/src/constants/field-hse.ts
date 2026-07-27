import { formatMoney } from './contracts';
import type {
  DailyLogShift, DailyLogStatus, HseIncidentType, HseSeverity, InspectionResult, InspectionStatus,
  NcrCommandType, NcrDisposition, NcrStatus, PermitToWorkStatus, PunchCategory, PunchCommandType,
  PunchItemStatus, QualityCycleDecision, StopWorkTargetType, WorkfrontReadiness, WorkfrontStatus
} from '@/types/field-hse.types';

/** API-090 quantity DTO: `^\d{1,15}(\.\d{1,4})?$` — decimal text, strictly positive server-side. */
export const QUANTITY_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/** Shared `CODE` bound of API-096/API-097: `^[A-Z0-9][A-Z0-9_.-]{0,79}$`. */
export const QUALITY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;

/** API-091 `permitType`: `^[A-Z][A-Z0-9_]{0,39}$`. */
export const PERMIT_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;

/** API-095 `holdPointRef`: `^[A-Z0-9][A-Z0-9_.-]{0,79}$`. */
export const HOLD_POINT_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;

/** API-090 `sourceKey` is the offline/system dedup key behind `uq_qpr_source`; 8–200 characters. */
export const SOURCE_KEY_MIN_LENGTH = 8;
export const SOURCE_KEY_MAX_LENGTH = 200;

export const WORKFRONT_STATUSES: readonly WorkfrontStatus[] = [
  'PLANNED', 'READY', 'RELEASED', 'SUSPENDED', 'CLOSED'
];

export const WORKFRONT_STATUS_LABEL: Record<WorkfrontStatus, string> = {
  PLANNED: 'Đã lập kế hoạch',
  READY: 'Sẵn sàng',
  RELEASED: 'Đã cho phép thi công',
  SUSPENDED: 'Đang tạm dừng',
  CLOSED: 'Đã đóng'
};

export const WORKFRONT_READINESS_LABEL: Record<WorkfrontReadiness, string> = {
  PENDING: 'Chưa thông cổng',
  GATES_CLEARED: 'Đã thông cổng'
};

export const DAILY_LOG_STATUS_LABEL: Record<DailyLogStatus, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã trình',
  SIGNED: 'Đã ký',
  SUPERSEDED: 'Đã bị thay thế'
};

export const DAILY_LOG_SHIFTS: readonly DailyLogShift[] = ['DAY', 'NIGHT'];

export const DAILY_LOG_SHIFT_LABEL: Record<DailyLogShift, string> = {
  DAY: 'Ca ngày',
  NIGHT: 'Ca đêm'
};

export const PERMIT_STATUS_LABEL: Record<PermitToWorkStatus, string> = {
  DRAFT: 'Nháp',
  REQUESTED: 'Đã yêu cầu',
  VERIFIED: 'Đã kiểm chứng',
  ISSUED: 'Đã cấp',
  ACTIVE: 'Đang hiệu lực',
  SUSPENDED: 'Tạm dừng',
  EXPIRED: 'Hết hạn',
  CLOSED: 'Đã đóng'
};

export const HSE_INCIDENT_TYPES: readonly HseIncidentType[] = [
  'NEAR_MISS', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'FATALITY',
  'ENVIRONMENTAL', 'PROPERTY_DAMAGE', 'SECURITY', 'OTHER'
];

export const HSE_INCIDENT_TYPE_LABEL: Record<HseIncidentType, string> = {
  NEAR_MISS: 'Suýt xảy ra',
  FIRST_AID: 'Sơ cứu',
  MEDICAL_TREATMENT: 'Điều trị y tế',
  LOST_TIME: 'Mất ngày công',
  FATALITY: 'Tử vong',
  ENVIRONMENTAL: 'Sự cố môi trường',
  PROPERTY_DAMAGE: 'Hư hỏng tài sản',
  SECURITY: 'An ninh',
  OTHER: 'Khác'
};

export const HSE_SEVERITIES: readonly HseSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const HSE_SEVERITY_LABEL: Record<HseSeverity, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng'
};

export const STOP_WORK_TARGET_TYPES: readonly StopWorkTargetType[] = [
  'PROJECT', 'SITE', 'WORKFRONT', 'PERMIT'
];

export const STOP_WORK_TARGET_LABEL: Record<StopWorkTargetType, string> = {
  PROJECT: 'Toàn dự án',
  SITE: 'Công trường',
  WORKFRONT: 'Workfront',
  PERMIT: 'Giấy phép làm việc'
};

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  REQUESTED: 'Đang chờ kiểm tra',
  RECORDED: 'Đã ghi kết quả (đóng băng)'
};

/**
 * API-095 chỉ nhận PASS/FAIL — `InspectionResult` và `ck_inspection_result` không có
 * CONDITIONAL_PASS, nên UI không được tạo ra lựa chọn đó.
 */
export const INSPECTION_RESULTS: readonly InspectionResult[] = ['PASS', 'FAIL'];

export const INSPECTION_RESULT_LABEL: Record<InspectionResult, string> = {
  PASS: 'Đạt',
  FAIL: 'Không đạt'
};

export const NCR_STATUS_LABEL: Record<NcrStatus, string> = {
  OPEN: 'Mới mở',
  CONTAINED: 'Đã cô lập',
  ROOT_CAUSE: 'Đã có nguyên nhân gốc',
  DISPOSITION_PROPOSED: 'Đã đề xuất xử lý',
  RETURNED: 'Bị trả lại',
  DISPOSITION_APPROVED: 'Đã duyệt phương án xử lý',
  RECTIFICATION: 'Đang khắc phục',
  READY_FOR_VERIFICATION: 'Chờ xác nhận',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại'
};

export const NCR_DISPOSITIONS: readonly NcrDisposition[] = [
  'REWORK', 'REPAIR', 'USE_AS_IS', 'SCRAP', 'REJECT'
];

export const NCR_DISPOSITION_LABEL: Record<NcrDisposition, string> = {
  REWORK: 'Làm lại',
  REPAIR: 'Sửa chữa',
  USE_AS_IS: 'Chấp nhận nguyên trạng',
  SCRAP: 'Loại bỏ',
  REJECT: 'Từ chối'
};

export const CYCLE_DECISIONS: readonly QualityCycleDecision[] = ['APPROVE', 'RETURN'];

export const CYCLE_DECISION_LABEL: Record<QualityCycleDecision, string> = {
  APPROVE: 'Phê duyệt',
  RETURN: 'Trả lại'
};

export const PUNCH_CATEGORIES: readonly PunchCategory[] = ['A', 'B', 'C', 'D'];

export const PUNCH_CATEGORY_LABEL: Record<PunchCategory, string> = {
  A: 'A · Chặn COD, không được miễn trừ',
  B: 'B · Phải xử lý trước bàn giao',
  C: 'C · Xử lý trong bảo hành',
  D: 'D · Ghi nhận, không ảnh hưởng vận hành'
};

export const PUNCH_STATUS_LABEL: Record<PunchItemStatus, string> = {
  OPEN: 'Đang mở',
  READY_FOR_VERIFICATION: 'Chờ xác nhận đóng',
  CLOSED: 'Đã đóng',
  WAIVED: 'Đã miễn trừ'
};

export const NCR_COMMAND_LABEL: Record<NcrCommandType, string> = {
  RAISE: 'Lập NCR',
  CONTAIN: 'Ghi biện pháp cô lập',
  RECORD_ROOT_CAUSE: 'Ghi nguyên nhân gốc',
  PROPOSE_DISPOSITION: 'Đề xuất phương án xử lý',
  DECIDE_DISPOSITION: 'Quyết định phương án xử lý',
  START_RECTIFICATION: 'Bắt đầu khắc phục',
  REQUEST_VERIFICATION: 'Đề nghị xác nhận',
  VERIFY_CLOSE: 'Xác nhận và đóng',
  REOPEN: 'Mở lại',
  RECORD_CAPA: 'Ghi hành động CAPA',
  VERIFY_CAPA: 'Xác nhận hiệu quả CAPA'
};

/**
 * Client mirror of `NCR_TRANSITIONS` in the API's `domain/state-policy.ts`. It exists so the UI
 * offers only the commands the server can accept from the current status; the server re-validates
 * every one of them and remains the only authority.
 */
export const NCR_COMMANDS_BY_STATUS: Record<NcrStatus, readonly NcrCommandType[]> = {
  OPEN: ['CONTAIN'],
  CONTAINED: ['RECORD_ROOT_CAUSE'],
  ROOT_CAUSE: ['PROPOSE_DISPOSITION'],
  RETURNED: ['PROPOSE_DISPOSITION'],
  DISPOSITION_PROPOSED: ['DECIDE_DISPOSITION'],
  DISPOSITION_APPROVED: ['START_RECTIFICATION'],
  REOPENED: ['START_RECTIFICATION'],
  RECTIFICATION: ['REQUEST_VERIFICATION'],
  READY_FOR_VERIFICATION: ['VERIFY_CLOSE'],
  CLOSED: ['REOPEN']
};

export const PUNCH_COMMAND_LABEL: Record<PunchCommandType, string> = {
  CREATE: 'Tạo punch item',
  REQUEST_CLOSURE: 'Đề nghị đóng',
  DECIDE_CLOSURE: 'Quyết định đóng',
  WAIVE: 'Miễn trừ'
};

/** Client mirror of `PUNCH_TRANSITIONS`; WAIVE is filtered again by the row's `waivable` flag. */
export const PUNCH_COMMANDS_BY_STATUS: Record<PunchItemStatus, readonly PunchCommandType[]> = {
  OPEN: ['REQUEST_CLOSURE', 'WAIVE'],
  READY_FOR_VERIFICATION: ['DECIDE_CLOSURE'],
  CLOSED: [],
  WAIVED: []
};

/**
 * Quantities are `numeric(19,4)` text exactly like the money fields of the Contract slice, so the
 * digit-grouping rule is identical — and just as forbidden to route through `Number(...)`.
 */
export function formatQuantity(value: string | null): string {
  return formatMoney(value);
}

/** Free-text reference lists (evidence, verified controls) are one reference per line. */
export function parseReferenceLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}
