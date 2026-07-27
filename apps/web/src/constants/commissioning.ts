import type {
  BlockingFindingType, CodGateCategory, CodGateReviewDecision, CodGateStatus, CodPackageStatus,
  CommissioningSystemStatus, TestPackStatus, TestRunResult, TestRunStatus, TestRunView
} from '@/types/commissioning.types';
import { RETESTABLE_RESULTS } from '@/types/commissioning.types';

/** API-099/API-100 code bound: `^[A-Z0-9][A-Z0-9_.-]{0,79}$`. */
export const COMMISSIONING_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,79}$/;

/** API-099 system type bound: `^[A-Z][A-Z0-9_]{0,39}$`. */
export const SYSTEM_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;

export const COMMISSIONING_SYSTEM_STATUSES: readonly CommissioningSystemStatus[] =
  ['NOT_READY', 'READY_FOR_TEST', 'TESTING', 'PASSED', 'FAILED'];

export const COMMISSIONING_SYSTEM_STATUS_LABEL: Record<CommissioningSystemStatus, string> = {
  NOT_READY: 'Chưa sẵn sàng',
  READY_FOR_TEST: 'Sẵn sàng thử nghiệm',
  TESTING: 'Đang thử nghiệm',
  PASSED: 'Đạt',
  FAILED: 'Không đạt'
};

export const TEST_PACK_STATUS_LABEL: Record<TestPackStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã phê duyệt',
  SUPERSEDED: 'Đã thay thế'
};

export const TEST_RUN_STATUS_LABEL: Record<TestRunStatus, string> = {
  IN_PROGRESS: 'Đang chạy',
  RECORDED: 'Đã ghi nhận'
};

export const TEST_RUN_RESULTS: readonly TestRunResult[] =
  ['PASSED', 'FAILED', 'ABORTED', 'INCONCLUSIVE'];

export const TEST_RUN_RESULT_LABEL: Record<TestRunResult, string> = {
  PASSED: 'Đạt',
  FAILED: 'Không đạt',
  ABORTED: 'Bị hủy giữa chừng',
  INCONCLUSIVE: 'Không kết luận được'
};

export const COD_GATE_CATEGORIES: readonly CodGateCategory[] = [
  'LEGAL', 'CONTRACTUAL', 'TECHNICAL', 'QUALITY', 'SAFETY', 'DOCUMENTATION', 'COMMERCIAL'
];

export const COD_GATE_CATEGORY_LABEL: Record<CodGateCategory, string> = {
  LEGAL: 'Pháp lý',
  CONTRACTUAL: 'Hợp đồng',
  TECHNICAL: 'Kỹ thuật',
  QUALITY: 'Chất lượng',
  SAFETY: 'An toàn',
  DOCUMENTATION: 'Hồ sơ tài liệu',
  COMMERCIAL: 'Thương mại'
};

export const COD_GATE_STATUS_LABEL: Record<CodGateStatus, string> = {
  PENDING: 'Chờ bằng chứng',
  UNDER_REVIEW: 'Đang thẩm tra',
  ACCEPTED: 'Đã chấp thuận',
  REJECTED: 'Bị từ chối',
  WAIVED: 'Đã miễn trừ'
};

export const COD_GATE_REVIEW_DECISIONS: readonly CodGateReviewDecision[] =
  ['PASS', 'FAIL', 'CONDITIONAL'];

export const COD_GATE_REVIEW_DECISION_LABEL: Record<CodGateReviewDecision, string> = {
  PASS: 'Đạt',
  FAIL: 'Không đạt',
  CONDITIONAL: 'Đạt có điều kiện'
};

export const COD_PACKAGE_STATUS_LABEL: Record<CodPackageStatus, string> = {
  DRAFT: 'Nháp',
  READY: 'Sẵn sàng',
  SUBMITTED: 'Đã trình',
  SIGNED: 'Đã ký',
  HANDED_OVER: 'Đã bàn giao'
};

/**
 * The three registers API-104 reads blocking findings from. Punch items are the `cod_blocking`
 * rows of the project punch register (AC: hạng A chặn COD); NCRs are the CRITICAL ones still open;
 * stop-work is any ISSUE with no matching lift — and if that ledger cannot be read, the server
 * synthesises a finding rather than shrugging, so safety fails closed.
 */
export const BLOCKING_FINDING_LABEL: Record<BlockingFindingType, string> = {
  PUNCH_ITEM: 'Punch item hạng A chặn COD',
  NCR: 'NCR nghiêm trọng còn mở',
  STOP_WORK: 'Lệnh dừng việc chưa được gỡ'
};

export const BLOCKING_FINDING_TYPES: readonly BlockingFindingType[] =
  ['PUNCH_ITEM', 'NCR', 'STOP_WORK'];

/**
 * A run whose result has been written is HISTORY.
 *
 * `trg_test_run_recorded_immutable` freezes the row, so the UI must render it read-only. There is
 * no "sửa thành đạt" path anywhere — not for a FAILED run, not for any other result.
 */
export function isRunFrozen(run: TestRunView): boolean {
  return run.status === 'RECORDED';
}

/**
 * API-103: only a RECORDED run whose result is FAILED or ABORTED may be retested, and the retest
 * is a NEW row. PASSED has nothing to retest; INCONCLUSIVE is excluded because the catalog names
 * the trigger as "failed/aborted" and widening it would be a scope change.
 */
export function canRetest(run: TestRunView): boolean {
  return run.status === 'RECORDED'
    && run.result !== null
    && RETESTABLE_RESULTS.includes(run.result);
}

export { RETESTABLE_RESULTS };
