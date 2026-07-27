import type {
  AlarmCaseSeverity, AlarmCaseState, ServiceIncidentSeverity, ServiceIncidentStatus,
  WorkOrderCommandType, WorkOrderPriority, WorkOrderStatus, WorkOrderView
} from '@/types/operations.types';

/** API-119 `code` bound: `^[A-Z0-9][A-Z0-9_.-]{0,79}$` (also the warranty claim code). */
export const OPERATIONS_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;

/** API-119 `workType` bound: `^[A-Z][A-Z0-9_]{0,39}$`. No approved code list exists for it. */
export const WORK_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;

export const WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  'DRAFT', 'APPROVED', 'SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'ON_HOLD',
  'COMPLETE', 'VERIFIED', 'CLOSED', 'REOPENED', 'CANCELLED'
];

/**
 * The full WF-024 vocabulary is named even though V1 writes no APPROVED row: the register has to
 * read data produced by migrations or by any future approve/schedule operation.
 */
export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã phê duyệt',
  SCHEDULED: 'Đã lên lịch',
  DISPATCHED: 'Đã điều phối',
  IN_PROGRESS: 'Đang thực hiện',
  ON_HOLD: 'Tạm dừng',
  COMPLETE: 'Đã hoàn thành',
  VERIFIED: 'Đã nghiệm thu',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại',
  CANCELLED: 'Đã hủy'
};

export const WORK_ORDER_PRIORITIES: readonly WorkOrderPriority[] =
  ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng'
};

export const ALARM_CASE_STATES: readonly AlarmCaseState[] = [
  'OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'REOPENED'
];

/** Every label says LOCAL, because none of these states describes the plant (SEC-127/SEC-128). */
export const ALARM_CASE_STATE_LABEL: Record<AlarmCaseState, string> = {
  OPEN: 'Mở (cục bộ)',
  ACKNOWLEDGED: 'Đã ghi nhận (cục bộ)',
  INVESTIGATING: 'Đang điều tra',
  RESOLVED: 'Đã xử lý (cục bộ)',
  CLOSED: 'Đã đóng (cục bộ)',
  REOPENED: 'Đã mở lại'
};

export const SEVERITIES: readonly AlarmCaseSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const SEVERITY_LABEL: Record<AlarmCaseSeverity | ServiceIncidentSeverity, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng'
};

export const SERVICE_INCIDENT_STATUSES: readonly ServiceIncidentStatus[] =
  ['OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED'];

export const SERVICE_INCIDENT_STATUS_LABEL: Record<ServiceIncidentStatus, string> = {
  OPEN: 'Đang mở',
  INVESTIGATING: 'Đang điều tra',
  MITIGATED: 'Đã giảm thiểu',
  RESOLVED: 'Đã khắc phục',
  CLOSED: 'Đã đóng'
};

export const WORK_ORDER_COMMAND_LABEL: Record<WorkOrderCommandType, string> = {
  DISPATCH: 'Điều phối',
  START: 'Bắt đầu',
  HOLD: 'Tạm dừng',
  RESUME: 'Tiếp tục',
  COMPLETE: 'Hoàn thành',
  VERIFY: 'Nghiệm thu',
  CLOSE: 'Đóng',
  REOPEN: 'Mở lại',
  CANCEL: 'Hủy',
  RAISE_WARRANTY_CLAIM: 'Lập yêu cầu bảo hành'
};

/**
 * WF-024 legal from-states, mirrored 1:1 from `domain/work-order-policy.ts`. Duplicating the map
 * on the client is what lets the panel hide a command the server would refuse; the server remains
 * the only thing that decides, and disagreement surfaces as INVALID_STATE_TRANSITION rather than a
 * silent wrong answer.
 */
export const WORK_ORDER_TRANSITION_FROM:
Record<Exclude<WorkOrderCommandType, 'RAISE_WARRANTY_CLAIM'>, readonly WorkOrderStatus[]> = {
  DISPATCH: ['DRAFT', 'APPROVED', 'SCHEDULED'],
  START: ['DISPATCHED', 'REOPENED'],
  HOLD: ['IN_PROGRESS'],
  RESUME: ['ON_HOLD'],
  COMPLETE: ['IN_PROGRESS'],
  VERIFY: ['COMPLETE'],
  CLOSE: ['VERIFIED'],
  REOPEN: ['VERIFIED', 'CLOSED'],
  CANCEL: ['DRAFT', 'VERIFIED']
};

/** A claim records a failure found on the asset — never from a draft nobody ran, never a cancel. */
export const WARRANTY_CLAIM_STATES: readonly WorkOrderStatus[] = [
  'DISPATCHED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETE', 'VERIFIED', 'CLOSED', 'REOPENED'
];

/** Ordered so the panel renders the lifecycle left to right, with the claim append last. */
export const WORK_ORDER_COMMANDS: readonly WorkOrderCommandType[] = [
  'DISPATCH', 'START', 'HOLD', 'RESUME', 'COMPLETE', 'VERIFY', 'CLOSE', 'REOPEN', 'CANCEL',
  'RAISE_WARRANTY_CLAIM'
];

/**
 * SEC-108/SEC-109 — the verifier must be independent of the work.
 *
 * The service refuses VERIFY and CLOSE when the caller is the assignee or the completer, and
 * `ck_work_order_verifier_independent` refuses the same write in SQL. Returning `true` here is
 * what keeps those two buttons off the screen entirely: rendering an action the server is
 * guaranteed to reject teaches people to ignore errors.
 *
 * `null` (no known caller) is treated as blocked — an unknown identity cannot be proven
 * independent.
 */
export function verifierBlocked(workOrder: WorkOrderView, actorId: string | null): boolean {
  if (actorId === null) return true;
  return actorId === workOrder.assigneeId || actorId === workOrder.completedBy;
}

/** True when `command` may be offered for this work order to this caller. */
export function commandAvailable(
  command: WorkOrderCommandType, workOrder: WorkOrderView, actorId: string | null
): boolean {
  if (command === 'RAISE_WARRANTY_CLAIM') {
    return WARRANTY_CLAIM_STATES.includes(workOrder.status);
  }
  if (!WORK_ORDER_TRANSITION_FROM[command].includes(workOrder.status)) return false;
  if (command === 'VERIFY' || command === 'CLOSE') return !verifierBlocked(workOrder, actorId);
  return true;
}
