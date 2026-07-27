import type {
  ReportJobStatus, ReportType, SavedViewTargetType, SearchResultType
} from '@/types/search.types';

/** API-130 lower bound: a one-character query is refused with 400 before it reaches the SQL. */
export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 200;

export const SEARCH_RESULT_TYPES: readonly SearchResultType[] = [
  'PROJECT', 'DOCUMENT', 'RISK', 'ISSUE', 'CHANGE_REQUEST', 'CONTRACT'
];

export const SEARCH_RESULT_TYPE_LABEL: Record<SearchResultType, string> = {
  PROJECT: 'Dự án',
  DOCUMENT: 'Tài liệu',
  RISK: 'Rủi ro',
  ISSUE: 'Vấn đề',
  CHANGE_REQUEST: 'Yêu cầu thay đổi',
  CONTRACT: 'Hợp đồng'
};

/** The module read permission that decides whether a branch contributes rows at all. */
export const SEARCH_RESULT_TYPE_PERMISSION: Record<SearchResultType, string> = {
  PROJECT: 'project.read',
  DOCUMENT: 'document.read',
  RISK: 'riskChange.read',
  ISSUE: 'riskChange.read',
  CHANGE_REQUEST: 'riskChange.read',
  CONTRACT: 'contract.read'
};

export const SAVED_VIEW_TARGET_TYPES: readonly SavedViewTargetType[] = SEARCH_RESULT_TYPES;

export const SAVED_VIEW_TARGET_LABEL: Record<SavedViewTargetType, string> =
  SEARCH_RESULT_TYPE_LABEL;

export const REPORT_TYPES: readonly ReportType[] = ['RISK_REGISTER_CSV', 'DOCUMENT_REGISTER_CSV'];

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  RISK_REGISTER_CSV: 'Sổ rủi ro (CSV)',
  DOCUMENT_REGISTER_CSV: 'Sổ tài liệu (CSV)'
};

/** API-133 checks THIS permission against the target project before queueing the job. */
export const REPORT_TYPE_PERMISSION: Record<ReportType, string> = {
  RISK_REGISTER_CSV: 'riskChange.read',
  DOCUMENT_REGISTER_CSV: 'document.read'
};

export const REPORT_JOB_STATUS_LABEL: Record<ReportJobStatus, string> = {
  QUEUED: 'Đang xếp hàng',
  RUNNING: 'Đang chạy',
  COMPLETED: 'Đã hoàn thành',
  FAILED: 'Thất bại'
};

/** QUEUED and RUNNING are the only states worth polling; the other two are terminal. */
export const REPORT_JOB_PENDING_STATUSES: readonly ReportJobStatus[] = ['QUEUED', 'RUNNING'];

export function reportJobPending(status: ReportJobStatus): boolean {
  return REPORT_JOB_PENDING_STATUSES.includes(status);
}
