import type {
  InvestmentScenarioProjection, InvestmentScenarioStatus, InvestmentScenarioType, OpportunityStage,
  OpportunityView, ProjectType, SurveyDataQuality
} from '@/types/opportunity.types';

/** API-027 `code` bound: `^[A-Z0-9][A-Z0-9_./-]{0,63}$`. */
export const OPPORTUNITY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_./-]{0,63}$/;

/** Mirrors the API MONEY DTO pattern — decimal text, never a JS number. */
export const OPPORTUNITY_MONEY_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/** NPV may legitimately be negative. */
export const OPPORTUNITY_SIGNED_MONEY_PATTERN = /^-?\d{1,15}(\.\d{1,4})?$/;

/** numeric(9,6) rate as text; IRR may be negative. */
export const OPPORTUNITY_RATE_PATTERN = /^-?\d{1,3}(\.\d{1,6})?$/;

export const OPPORTUNITY_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** DB-016 stores the payback as an integer month count, not a decimal. */
export const PAYBACK_MONTHS_PATTERN = /^\d{1,4}$/;

/** Pipeline order — the lanes are rendered in exactly this sequence. */
export const OPPORTUNITY_STAGES: readonly OpportunityStage[] = [
  'LEAD', 'QUALIFIED', 'SURVEYED', 'SCENARIO_READY', 'SUBMITTED',
  'APPROVED', 'RETURNED', 'REJECTED', 'CONVERTED'
];

export const OPPORTUNITY_STAGE_LABEL: Record<OpportunityStage, string> = {
  LEAD: 'Cơ hội mới',
  QUALIFIED: 'Đã sàng lọc',
  SURVEYED: 'Đã khảo sát',
  SCENARIO_READY: 'Sẵn kịch bản',
  SUBMITTED: 'Đã trình',
  APPROVED: 'Đã phê duyệt',
  RETURNED: 'Trả lại chỉnh sửa',
  REJECTED: 'Bị từ chối',
  CONVERTED: 'Đã chuyển đổi'
};

/**
 * WF-002 as seen by API-029: only forward adjacent qualification moves plus the rework edge.
 * Every other stage is command-owned — SUBMITTED by API-032, CONVERTED by API-033, and
 * APPROVED/RETURNED/REJECTED by an approval decision that the V1 API cannot make at all.
 */
export const OPPORTUNITY_STAGE_TRANSITIONS: Record<OpportunityStage, readonly OpportunityStage[]> = {
  LEAD: ['QUALIFIED'],
  QUALIFIED: ['SURVEYED'],
  SURVEYED: ['SCENARIO_READY'],
  SCENARIO_READY: [],
  SUBMITTED: [],
  APPROVED: [],
  RETURNED: ['SCENARIO_READY'],
  REJECTED: [],
  CONVERTED: []
};

/** API-031 accepts a new scenario version only in these stages; each lands on SCENARIO_READY. */
export const SCENARIO_CREATABLE_STAGES: readonly OpportunityStage[] =
  ['SURVEYED', 'SCENARIO_READY', 'RETURNED'];

/** API-032 submits only from these two stages; both land on SUBMITTED. */
export const SUBMIT_ELIGIBLE_STAGES: readonly OpportunityStage[] =
  ['SCENARIO_READY', 'RETURNED'];

/** API-032 accepts only these stored scenario statuses. */
export const SCENARIO_SUBMITTABLE_STATUSES: readonly InvestmentScenarioStatus[] =
  ['DRAFT', 'RETURNED'];

export const SURVEY_DATA_QUALITIES: readonly SurveyDataQuality[] =
  ['RAW', 'VALIDATED', 'APPROVED'];

export const SURVEY_DATA_QUALITY_LABEL: Record<SurveyDataQuality, string> = {
  RAW: 'Dữ liệu thô',
  VALIDATED: 'Đã kiểm tra',
  APPROVED: 'Đã phê duyệt (bất biến)'
};

export const SCENARIO_TYPES: readonly InvestmentScenarioType[] = ['SOLAR', 'BESS', 'HYBRID'];

export const SCENARIO_TYPE_LABEL: Record<InvestmentScenarioType, string> = {
  SOLAR: 'Điện mặt trời',
  BESS: 'Lưu trữ BESS',
  HYBRID: 'Kết hợp'
};

export const SCENARIO_STATUS_LABEL: Record<InvestmentScenarioStatus, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã trình',
  APPROVED: 'Đã phê duyệt',
  RETURNED: 'Trả lại',
  REJECTED: 'Bị từ chối'
};

export const PROJECT_TYPES: readonly ProjectType[] = ['SOLAR', 'BESS', 'HYBRID'];

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  SOLAR: 'Điện mặt trời',
  BESS: 'Lưu trữ BESS',
  HYBRID: 'Kết hợp'
};

/**
 * API-033 eligibility, mirrored from `assertConvertEligible`: stage APPROVED, or at least one
 * scenario whose PROJECTED status is APPROVED. Neither is reachable through the V1 API — recorded
 * in `opportunity.service.ts` — so the convert control simply does not appear until a decision
 * recorded outside the API surface makes it appear. The UI never guesses eligibility.
 */
export function convertEligible(
  opportunity: OpportunityView, scenarios: readonly InvestmentScenarioProjection[]
): boolean {
  if (opportunity.stage === 'APPROVED') return true;
  return scenarios.some((scenario) => scenario.status === 'APPROVED');
}

/** Legal adjacent PATCH moves out of the opportunity's current stage; may be empty. */
export function nextStages(opportunity: OpportunityView): readonly OpportunityStage[] {
  return OPPORTUNITY_STAGE_TRANSITIONS[opportunity.stage];
}
