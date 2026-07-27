/**
 * Opportunity pipeline (API-026…API-033) wire types.
 *
 * MONEY AND QUANTITY ARE TEXT. `expectedCapacityKwp`, `capexTotal`, `npv` and `irr` cross the wire
 * as decimal strings straight out of Postgres `numeric`; nothing here may run them through
 * `Number()` or `parseFloat`. `paybackMonths` is the single exception and is deliberately typed as
 * a number: DB-016 stores it as an integer month count, not a decimal, and the DTO validates it
 * with `@IsInt()`.
 *
 * SCENARIO FINANCIALS ARE EVIDENCE, NOT A CALCULATION. The server computes no financial figure;
 * DB-016 stores whatever the client supplied together with the `formulaVersion` that produced it.
 * The UI therefore displays the stored strings beside their formula version and never recomputes
 * NPV or IRR in the browser.
 */

/**
 * WF-002 stages. `APPROVED`, `REJECTED` and `RETURNED` are storable but unreachable through the
 * V1 API: submit records on the aggregate (API-032) and the DB-071 engine structurally cannot host
 * a pre-project workflow instance, so no operation approves an opportunity. The UI names them so
 * rows written outside the API surface still read correctly — and offers no approve control.
 */
export type OpportunityStage =
  | 'LEAD' | 'QUALIFIED' | 'SURVEYED' | 'SCENARIO_READY' | 'SUBMITTED'
  | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'CONVERTED';

export type SurveyDataQuality = 'RAW' | 'VALIDATED' | 'APPROVED';

export type InvestmentScenarioType = 'SOLAR' | 'BESS' | 'HYBRID';

export type InvestmentScenarioStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED';

export type ProjectType = 'SOLAR' | 'BESS' | 'HYBRID';

export interface OpportunityView {
  id: string;
  code: string;
  name: string;
  stage: OpportunityStage;
  customerCompanyId: string | null;
  siteId: string | null;
  locationText: string | null;
  /** numeric(...,4) as text — never a JS number. */
  expectedCapacityKwp: string | null;
  duplicateKey: string | null;
  ownerId: string;
  convertedProjectId: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyPackageView {
  id: string;
  opportunityId: string;
  revision: number;
  dataQuality: SurveyDataQuality;
  /** Opaque document references only — the opportunity module never carries bytes. */
  documentRefs: string[];
  notes: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** API-030 also reports the stage the opportunity is on after the revision landed. */
export interface SurveyPackageCommandView extends SurveyPackageView {
  opportunityStage: OpportunityStage;
}

export interface InvestmentScenarioView {
  id: string;
  opportunityId: string;
  scenarioType: InvestmentScenarioType;
  version: number;
  status: InvestmentScenarioStatus;
  currency: string;
  /** Client-supplied evidence, stored verbatim as text. Display, never recompute. */
  capexTotal: string | null;
  npv: string | null;
  irr: string | null;
  paybackMonths: number | null;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  /** The version of the formula the CLIENT used. Meaningless without it, so always shown. */
  formulaVersion: string;
  workflowInstanceId: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API-028 read-time projection: `status` is the engine state projected over `storedStatus` when a
 * DB-071 instance exists. In V1 no instance is ever attached, so the two are always equal and
 * `workflowInstanceState` is always null — the fields stay in the type because the projection is
 * what convert eligibility is decided against.
 */
export interface InvestmentScenarioProjection extends InvestmentScenarioView {
  storedStatus: InvestmentScenarioStatus;
  workflowInstanceState: string | null;
}

export interface InvestmentScenarioCommandView extends InvestmentScenarioView {
  opportunityStage: OpportunityStage;
}

export interface ConvertedProjectView {
  id: string;
  code: string;
  name: string;
  type: ProjectType;
  phase: string;
  recordStatus: string;
  portfolioId: string;
  ownerLegalEntityId: string;
  customerCompanyId: string;
  projectManagerId: string | null;
  contractModel: string;
  currency: string;
  plannedCod: string;
  forecastCod: string | null;
  sourceOpportunityId: string | null;
  versionNo: number;
}

export interface ConvertedSiteView {
  id: string;
  projectId: string;
  code: string;
  name: string;
  location: string | null;
  timezone: string;
  isPrimary: boolean;
  status: string;
}

/**
 * API-033 result. `alreadyConverted` is the documented replay semantics: calling convert twice
 * returns the project the opportunity already became. That is a success, not an error.
 */
export interface ConvertOpportunityView extends ConvertedProjectView {
  sites: ConvertedSiteView[];
  opportunityId: string;
  alreadyConverted: boolean;
}

export interface OpportunityPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface OpportunityListQuery {
  cursor?: string;
  limit?: number;
  stage?: OpportunityStage;
  customerCompanyId?: string;
}

export interface CreateOpportunityRequest {
  code: string;
  name: string;
  customerCompanyId?: string;
  siteId?: string;
  locationText?: string;
  expectedCapacityKwp?: string;
  ownerId?: string;
}

/** API-029 — only forward adjacent WF-002 moves; command-owned stages answer 422. */
export interface UpdateOpportunityRequest {
  expectedVersion: number;
  stage?: OpportunityStage;
  name?: string;
  ownerId?: string;
  customerCompanyId?: string;
  siteId?: string;
  locationText?: string;
  expectedCapacityKwp?: string;
}

export interface CreateSurveyPackageRequest {
  dataQuality?: SurveyDataQuality;
  documentRefs?: string[];
  notes?: string;
}

export interface CreateInvestmentScenarioRequest {
  scenarioType: InvestmentScenarioType;
  currency: string;
  capexTotal?: string;
  npv?: string;
  irr?: string;
  paybackMonths?: number;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
  formulaVersion: string;
}

export interface SubmitInvestmentScenarioRequest {
  expectedVersion: number;
  comment?: string;
}

export interface ConvertPrimarySiteRequest {
  code: string;
  name: string;
  location?: string;
  timezone: string;
}

export interface ConvertOpportunityRequest {
  portfolioId: string;
  ownerLegalEntityId: string;
  customerCompanyId?: string;
  projectManagerId?: string;
  projectCode?: string;
  projectName?: string;
  projectType: ProjectType;
  contractModel: string;
  currency: string;
  plannedCod: string;
  primarySite: ConvertPrimarySiteRequest;
}

export interface OpportunityListResponse {
  data: OpportunityView[];
  meta: OpportunityPageMeta;
  correlationId: string;
}

export interface OpportunityCommandResponse {
  data: OpportunityView;
  correlationId: string;
}

export interface OpportunityDetailResponse {
  data: OpportunityView;
  surveys: SurveyPackageView[];
  scenarios: InvestmentScenarioProjection[];
  correlationId: string;
}

export interface SurveyPackageResponse {
  data: SurveyPackageCommandView;
  correlationId: string;
}

export interface InvestmentScenarioResponse {
  data: InvestmentScenarioCommandView;
  correlationId: string;
}

export interface ConvertOpportunityResponse {
  data: ConvertOpportunityView;
  correlationId: string;
}
