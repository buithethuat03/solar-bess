/**
 * Field Operations, HSE & Quality (API-086…API-097).
 *
 * Every vocabulary below mirrors `field-hse-quality.enums.ts` 1:1 — the API values are also database
 * CHECK constraints, so inventing a client-side value here would only produce a 400 at the edge.
 * Quantities are `numeric(19,4)` text and stay `string` end to end; no JS number touches them.
 */

export type WorkfrontStatus = 'PLANNED' | 'READY' | 'RELEASED' | 'SUSPENDED' | 'CLOSED';
export type WorkfrontReadiness = 'PENDING' | 'GATES_CLEARED';
export type DailyLogStatus = 'DRAFT' | 'SUBMITTED' | 'SIGNED' | 'SUPERSEDED';
export type DailyLogShift = 'DAY' | 'NIGHT';
export type DailyLogAction = 'SUBMIT' | 'SIGN';
export type PermitToWorkStatus =
  'DRAFT' | 'REQUESTED' | 'VERIFIED' | 'ISSUED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CLOSED';
export type HseIncidentStatus = 'REPORTED' | 'INVESTIGATING' | 'CLOSED';
export type HseIncidentType =
  | 'NEAR_MISS' | 'FIRST_AID' | 'MEDICAL_TREATMENT' | 'LOST_TIME' | 'FATALITY'
  | 'ENVIRONMENTAL' | 'PROPERTY_DAMAGE' | 'SECURITY' | 'OTHER';
export type HseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type StopWorkActionType = 'ISSUE' | 'LIFT';
export type StopWorkTargetType = 'PROJECT' | 'SITE' | 'WORKFRONT' | 'PERMIT';
export type InspectionStatus = 'REQUESTED' | 'RECORDED';
/**
 * API-095 accepts exactly these two. There is no CONDITIONAL_PASS in the enum nor in the
 * `ck_inspection_result` CHECK, so the UI must not offer one.
 */
export type InspectionResult = 'PASS' | 'FAIL';
export type NcrStatus =
  | 'OPEN' | 'CONTAINED' | 'ROOT_CAUSE' | 'DISPOSITION_PROPOSED' | 'RETURNED'
  | 'DISPOSITION_APPROVED' | 'RECTIFICATION' | 'READY_FOR_VERIFICATION' | 'CLOSED' | 'REOPENED';
export type NcrDisposition = 'REWORK' | 'REPAIR' | 'USE_AS_IS' | 'SCRAP' | 'REJECT';
export type QualityCycleDecision = 'APPROVE' | 'RETURN';
export type PunchCategory = 'A' | 'B' | 'C' | 'D';
export type PunchItemStatus = 'OPEN' | 'READY_FOR_VERIFICATION' | 'CLOSED' | 'WAIVED';
export type CapaActionStatus = 'OPEN' | 'VERIFIED';

export type NcrCommandType =
  | 'RAISE' | 'CONTAIN' | 'RECORD_ROOT_CAUSE' | 'PROPOSE_DISPOSITION' | 'DECIDE_DISPOSITION'
  | 'START_RECTIFICATION' | 'REQUEST_VERIFICATION' | 'VERIFY_CLOSE' | 'REOPEN'
  | 'RECORD_CAPA' | 'VERIFY_CAPA';
export type PunchCommandType = 'CREATE' | 'REQUEST_CLOSURE' | 'DECIDE_CLOSURE' | 'WAIVE';
export type InspectionCommandType = 'REQUEST' | 'RECORD';

export interface FieldPageMeta {
  nextCursor: string | null;
  limit: number;
}

export interface WorkfrontView {
  id: string;
  projectId: string;
  siteId: string;
  packageId: string | null;
  code: string;
  name: string;
  status: WorkfrontStatus;
  readiness: WorkfrontReadiness;
  releasedBy: string | null;
  releasedAt: string | null;
  suspendedReason: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyLogView {
  id: string;
  projectId: string;
  siteId: string;
  contractorCompanyId: string;
  logDate: string;
  shift: DailyLogShift;
  revision: number;
  status: DailyLogStatus;
  summary: string;
  details: Record<string, unknown>;
  /** Non-null on a correction row; the superseded original keeps its own frozen row. */
  correctionOfId: string | null;
  reason: string | null;
  /** The legal snapshot written at SIGN: stable id + identity + canonical content hash. */
  signerSnapshot: Record<string, unknown> | null;
  signedBy: string | null;
  signedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** DB-057 is append-only: a correction and a certification are new rows, never edits. */
export interface QuantityProgressView {
  id: string;
  projectId: string;
  workfrontId: string;
  wbsNodeId: string | null;
  correctionOfId: string | null;
  certificationOfId: string | null;
  recordDate: string;
  /** numeric(19,4) text — never parsed into a JS number. */
  quantity: string;
  unit: string;
  evidenceRefs: string[];
  reason: string | null;
  sourceKey: string;
  recordedBy: string;
  recordedAt: string;
}

export interface PermitToWorkView {
  id: string;
  projectId: string;
  siteId: string;
  workfrontId: string;
  permitType: string;
  description: string | null;
  status: PermitToWorkStatus;
  validFrom: string;
  validTo: string;
  requestedBy: string;
  issuerId: string | null;
  issuedAt: string | null;
  isolationSnapshot: Array<Record<string, unknown>> | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API-093's response NEVER carries `restrictedFacts` (SEC-130) — the column exists but is not
 * serialized. This interface deliberately has no such field so nothing can render one.
 */
export interface HseIncidentView {
  id: string;
  projectId: string;
  siteId: string | null;
  occurredAt: string;
  reportedAt: string;
  reportedBy: string;
  incidentType: HseIncidentType;
  actualSeverity: HseSeverity;
  potentialSeverity: HseSeverity;
  narrative: string;
  immediateAction: string | null;
  legalHold: boolean;
  status: HseIncidentStatus;
  closedBy: string | null;
  closedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** DB-115 — one append of the stop-work ledger. A LIFT points at the ISSUE it releases. */
export interface StopWorkActionView {
  id: string;
  projectId: string;
  action: StopWorkActionType;
  targetType: StopWorkTargetType;
  siteId: string | null;
  workfrontId: string | null;
  permitId: string | null;
  hseIncidentId: string | null;
  reason: string;
  liftsActionId: string | null;
  verifiedControls: string[];
  actorId: string;
  actedAt: string;
}

export interface InspectionTestPlanView {
  id: string;
  projectId: string;
  packageId: string;
  documentRevisionId: string;
  version: number;
}

export interface InspectionView {
  id: string;
  projectId: string;
  itpId: string;
  itp: InspectionTestPlanView;
  holdPointRef: string;
  /** A re-inspection is a NEW row at sequenceNo + 1; a RECORDED row is frozen forever. */
  sequenceNo: number;
  status: InspectionStatus;
  result: InspectionResult | null;
  evidenceRefs: string[];
  witnessSnapshot: Record<string, unknown> | null;
  requestedBy: string;
  recordedBy: string | null;
  recordedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NcrDispositionCycleView {
  id: string;
  ncrId: string;
  sequenceNo: number;
  proposedDisposition: NcrDisposition;
  proposalComment: string;
  proposedBy: string;
  proposedAt: string;
  decision: QualityCycleDecision | null;
  decisionComment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface NcrView {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  title: string;
  description: string;
  severity: HseSeverity;
  status: NcrStatus;
  raisedBy: string;
  ownerId: string;
  containmentAction: string | null;
  rootCause: string | null;
  disposition: NcrDisposition | null;
  dispositionApprovedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  closureEvidenceRefs: string[];
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Transitions echo the cycle they opened or decided; RAISE does not. */
export interface NcrCommandResultView extends NcrView {
  dispositionCycle?: NcrDispositionCycleView | null;
}

export interface CapaActionView {
  id: string;
  projectId: string;
  hseIncidentId: string | null;
  ncrId: string | null;
  title: string;
  ownerId: string;
  dueDate: string | null;
  status: CapaActionStatus;
  effectivenessAssessment: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** RECORD_CAPA/VERIFY_CAPA answer with the CAPA row; every other command answers with the NCR. */
export type NcrCommandData = NcrCommandResultView | CapaActionView;

export interface PunchClosureCycleView {
  id: string;
  punchItemId: string;
  sequenceNo: number;
  requestComment: string;
  requestEvidenceRefs: string[];
  requestedBy: string;
  requestedAt: string;
  decision: QualityCycleDecision | null;
  decisionComment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface PunchItemView {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  category: PunchCategory;
  /** Category A is structurally COD-blocking and never waivable — the database enforces both. */
  codBlocking: boolean;
  waivable: boolean;
  status: PunchItemStatus;
  raisedBy: string;
  ownerId: string;
  waivedBy: string | null;
  waivedReason: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  closureEvidenceRefs: string[];
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PunchCommandResultView extends PunchItemView {
  closureCycle?: PunchClosureCycleView | null;
}

export interface WorkfrontListQuery {
  cursor?: string;
  limit?: number;
  status?: WorkfrontStatus;
}

export interface ReleaseWorkfrontRequest {
  expectedVersion: number;
}

export interface CreateDailyLogRequest {
  siteId: string;
  contractorCompanyId: string;
  logDate: string;
  shift: DailyLogShift;
  summary: string;
  details?: Record<string, unknown>;
  /** Correction flow: the slot columns are copied from the SIGNED original and `reason` is required. */
  correctionOfId?: string;
  reason?: string;
}

export interface SubmitDailyLogRequest {
  expectedVersion: number;
  action: DailyLogAction;
}

export interface RecordQuantityProgressRequest {
  wbsNodeId?: string;
  recordDate: string;
  /** Decimal text, up to 4 fraction digits. Never a number. */
  quantity: string;
  unit: string;
  evidenceRefs?: string[];
  sourceKey: string;
  correctionOfId?: string;
  certificationOfId?: string;
  reason?: string;
}

export interface CreatePermitToWorkRequest {
  permitType: string;
  description?: string;
  validFrom: string;
  validTo: string;
}

export interface IssuePermitToWorkRequest {
  expectedVersion: number;
  isolationSnapshot: Array<Record<string, unknown>>;
}

/**
 * API-093 has no state fields on purpose: reporting is never gated on anything. `restrictedFacts`
 * is deliberately absent here too — nothing in this client may collect or display it.
 */
export interface ReportHseIncidentRequest {
  siteId?: string;
  occurredAt: string;
  incidentType: HseIncidentType;
  actualSeverity: HseSeverity;
  potentialSeverity: HseSeverity;
  narrative: string;
  immediateAction?: string;
}

export interface StopWorkActionRequest {
  action: StopWorkActionType;
  targetType?: StopWorkTargetType;
  siteId?: string;
  workfrontId?: string;
  permitId?: string;
  hseIncidentId?: string;
  reason: string;
  liftsActionId?: string;
  verifiedControls?: string[];
}

export interface InspectionCommandRequest {
  commandType: InspectionCommandType;
  holdPointRef?: string;
  inspectionId?: string;
  expectedVersion?: number;
  result?: InspectionResult;
  evidenceRefs?: string[];
  witnesses?: Array<Record<string, unknown>>;
}

export interface NcrCommandRequest {
  commandType: NcrCommandType;
  ncrId?: string;
  expectedVersion?: number;
  code?: string;
  title?: string;
  description?: string;
  severity?: HseSeverity;
  packageId?: string;
  ownerUserId?: string;
  containmentAction?: string;
  rootCause?: string;
  disposition?: NcrDisposition;
  decision?: QualityCycleDecision;
  reason?: string;
  evidenceRefs?: string[];
  capaActionId?: string;
  capaTitle?: string;
  capaOwnerUserId?: string;
  capaDueDate?: string;
  effectivenessAssessment?: string;
}

export interface PunchCommandRequest {
  commandType: PunchCommandType;
  punchItemId?: string;
  expectedVersion?: number;
  code?: string;
  title?: string;
  description?: string;
  category?: PunchCategory;
  codBlocking?: boolean;
  waivable?: boolean;
  ownerUserId?: string;
  reason?: string;
  decision?: QualityCycleDecision;
  evidenceRefs?: string[];
}

export interface WorkfrontListResponse {
  data: WorkfrontView[];
  meta: FieldPageMeta;
  correlationId: string;
}

export interface WorkfrontCommandResponse {
  data: WorkfrontView;
  correlationId: string;
}

export interface DailyLogCommandResponse {
  data: DailyLogView;
  correlationId: string;
}

export interface QuantityProgressResponse {
  data: QuantityProgressView;
  correlationId: string;
}

export interface PermitToWorkResponse {
  data: PermitToWorkView;
  correlationId: string;
}

export interface HseIncidentResponse {
  data: HseIncidentView;
  correlationId: string;
}

export interface StopWorkActionResponse {
  data: StopWorkActionView;
  correlationId: string;
}

export interface InspectionCommandResponse {
  data: InspectionView;
  correlationId: string;
}

export interface NcrCommandResponse {
  data: NcrCommandData;
  correlationId: string;
}

export interface PunchCommandResponse {
  data: PunchCommandResultView;
  correlationId: string;
}

/**
 * One unlifted stop-work as the banner renders it. `pending` marks the entry the client raised
 * because a command came back `STOP_WORK_ACTIVE`: the ledger has no read operation, so a refusal is
 * the only evidence the browser gets that a stop-work it never saw is standing.
 */
export interface ActiveStopWork {
  id: string | null;
  targetType: StopWorkTargetType;
  targetLabel: string;
  reason: string;
  actorId: string | null;
  actedAt: string | null;
  pending: boolean;
}
