/**
 * Commissioning & COD (API-098…API-105) wire types.
 *
 * Two invariants the shapes below exist to protect:
 * - A RECORDED TEST RUN IS PERMANENT. `TestRunView.result` is written once (API-102) and the row
 *   is frozen by trigger; the forward move from a FAILED run is a NEW run row carrying
 *   `previousRunId`. There is no "edit result" request type anywhere in this file, deliberately.
 * - A SIGNED COD PACKAGE IS THE LEGAL ARTEFACT. `CodPackageView` is read-only from SIGNED onwards
 *   except for the handover advancing it and a legal hold being asserted; `legalHold` can never
 *   go back to false (`protect_cod_package_history`).
 */

/** DB-073 — commissioning system lifecycle. */
export type CommissioningSystemStatus =
  'NOT_READY' | 'READY_FOR_TEST' | 'TESTING' | 'PASSED' | 'FAILED';

/** DB-074 — API-100 creates the pack already APPROVED from an ISSUED + CLEAN procedure revision. */
export type TestPackStatus = 'DRAFT' | 'APPROVED' | 'SUPERSEDED';

/** DB-075 — a run is open, then recorded exactly once. */
export type TestRunStatus = 'IN_PROGRESS' | 'RECORDED';

export type TestRunResult = 'PASSED' | 'FAILED' | 'ABORTED' | 'INCONCLUSIVE';

/** API-103 — only these two results may be followed by a retest. */
export const RETESTABLE_RESULTS: readonly TestRunResult[] = ['FAILED', 'ABORTED'];

/** DB-076 — the COD readiness matrix categories (FR-112). */
export type CodGateCategory =
  'LEGAL' | 'CONTRACTUAL' | 'TECHNICAL' | 'QUALITY' | 'SAFETY' | 'DOCUMENTATION' | 'COMMERCIAL';

/** DB-076 — ACCEPTED and WAIVED are terminal and frozen by trigger. */
export type CodGateStatus = 'PENDING' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'WAIVED';

/** DB-118 — AC-059 records one of these on each review round. */
export type CodGateReviewDecision = 'PASS' | 'FAIL' | 'CONDITIONAL';

/** DB-077 — COD package lifecycle. */
export type CodPackageStatus = 'DRAFT' | 'READY' | 'SUBMITTED' | 'SIGNED' | 'HANDED_OVER';

/** The three registers API-104 reads blocking findings from. */
export type BlockingFindingType = 'PUNCH_ITEM' | 'NCR' | 'STOP_WORK';

export interface CommissioningSystemView {
  id: string;
  projectId: string;
  parentSystemId: string | null;
  code: string;
  name: string;
  systemType: string;
  boundary: Record<string, unknown>;
  status: CommissioningSystemStatus;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestPackView {
  id: string;
  projectId: string;
  commissioningSystemId: string;
  code: string;
  title: string;
  procedureRevisionId: string;
  /** Frozen at approval; its `required` array is the prerequisite contract for every run. */
  prerequisitesSnapshot: Record<string, unknown> | null;
  status: TestPackStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestRunView {
  id: string;
  projectId: string;
  testPackId: string;
  /** Set on a retest: points back at the run that failed. The failure itself never changes. */
  previousRunId: string | null;
  runNo: number;
  status: TestRunStatus;
  result: TestRunResult | null;
  rawDataRef: string | null;
  instrumentSnapshot: Record<string, unknown> | null;
  witnessSnapshot: Record<string, unknown> | null;
  evidenceRefs: string[];
  startedAt: string;
  endedAt: string | null;
  startedBy: string;
  recordedBy: string | null;
  recordedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** One open finding that blocks COD, already narrowed by the server to what the caller may see. */
export interface BlockingFinding {
  type: BlockingFindingType;
  id: string;
  reference: string;
  detail: string;
}

export interface CategoryReadiness {
  category: string;
  total: number;
  satisfied: number;
  outstanding: number;
}

export interface ReadinessGateCounts {
  total: number;
  accepted: number;
  waived: number;
  pending: number;
  underReview: number;
  rejected: number;
  mandatoryTotal: number;
  mandatoryOutstanding: number;
}

export interface ReadinessEvaluation {
  asOf: string;
  gates: ReadinessGateCounts;
  categories: CategoryReadiness[];
  /** Gates whose acceptance rests on evidence that has lapsed as of `asOf`. */
  expiredEvidenceGateIds: string[];
  blockingFindings: {
    punchItems: number;
    criticalNcrs: number;
    stopWorks: number;
    total: number;
    items: BlockingFinding[];
  };
  /** True when at least one blocking finding is open — SIGN_COD answers 422 GATE_BLOCKED. */
  blocked: boolean;
  /** True only when nothing blocks AND every mandatory gate is satisfied with live evidence. */
  readyToSign: boolean;
}

export interface CodGateView {
  id: string;
  projectId: string;
  category: CodGateCategory;
  code: string;
  title: string;
  mandatory: boolean;
  waivable: boolean;
  ownerId: string;
  dueDate: string | null;
  status: CodGateStatus;
  evidenceRefs: string[];
  evidenceExpiry: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  waivedBy: string | null;
  waivedAt: string | null;
  waiverReason: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodGateReviewCycleView {
  id: string;
  codGateId: string;
  sequenceNo: number;
  evidenceRefs: string[];
  evidenceExpiry: string | null;
  submissionComment: string;
  submittedBy: string;
  submittedAt: string;
  decision: CodGateReviewDecision | null;
  decisionComment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface CodPackageView {
  id: string;
  projectId: string;
  version: number;
  status: CodPackageStatus;
  readinessSnapshot: Record<string, unknown> | null;
  snapshotHash: string | null;
  signedArtifactRef: string | null;
  effectiveAt: string | null;
  /** Can be asserted on a signed package but never cleared — the trigger refuses false. */
  legalHold: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  signedBy: string | null;
  signedAt: string | null;
  signerSnapshot: Record<string, unknown> | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HandoverView {
  id: string;
  projectId: string;
  codPackageId: string;
  fromPartyId: string;
  recipientPartyId: string;
  itemManifest: Array<Record<string, unknown>>;
  openItems: Array<Record<string, unknown>>;
  acceptedBy: string;
  acceptedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodReadinessData {
  projectId: string;
  readiness: ReadinessEvaluation;
  packages: CodPackageView[];
}

export interface CommissioningPageMeta {
  nextCursor: string | null;
  limit: number;
}

export interface CommissioningSystemListQuery {
  cursor?: string;
  limit?: number;
  status?: CommissioningSystemStatus;
  systemType?: string;
  parentSystemId?: string;
}

export interface CreateCommissioningSystemRequest {
  code: string;
  name: string;
  systemType: string;
  parentSystemId?: string;
  boundary?: Record<string, unknown>;
}

export interface CreateTestPackRequest {
  code: string;
  title: string;
  /** Must be an ISSUED revision with a CLEAN malware scan, else 422 PROCEDURE_REVISION_LOCKED. */
  procedureRevisionId: string;
  prerequisitesSnapshot?: Record<string, unknown>;
}

export interface StartTestRunRequest {
  satisfiedPrerequisites?: string[];
  instrumentSnapshot?: Record<string, unknown>;
  witnesses?: Array<Record<string, unknown>>;
}

/** API-102 — evidence is mandatory whatever the outcome; the write happens exactly once. */
export interface CompleteTestRunRequest {
  expectedVersion: number;
  result: TestRunResult;
  evidenceRefs: string[];
  rawDataRef?: string;
  witnesses?: Array<Record<string, unknown>>;
}

export interface CreateRetestRequest {
  satisfiedPrerequisites?: string[];
  instrumentSnapshot?: Record<string, unknown>;
  reason: string;
}

export interface CodReadinessQuery {
  asOf?: string;
}

/** API-105 — the CLOSED command union; `@IsIn` on the server rejects anything outside it. */
export type CodCommandType =
  'DEFINE_GATE' | 'REVIEW_EVIDENCE' | 'WAIVE_GATE' | 'SUBMIT_COD' | 'SIGN_COD' | 'ACCEPT_HANDOVER';

export interface CodTransitionCommandRequest {
  commandType: CodCommandType;
  expectedVersion?: number;
  category?: CodGateCategory;
  code?: string;
  title?: string;
  mandatory?: boolean;
  waivable?: boolean;
  ownerUserId?: string;
  dueDate?: string;
  codGateId?: string;
  reviewAction?: 'SUBMIT' | 'DECIDE';
  evidenceRefs?: string[];
  evidenceExpiry?: string;
  decision?: CodGateReviewDecision;
  reason?: string;
  codPackageId?: string;
  signedArtifactRef?: string;
  effectiveAt?: string;
  fromPartyId?: string;
  recipientPartyId?: string;
  itemManifest?: Array<Record<string, unknown>>;
  openItems?: Array<Record<string, unknown>>;
}

/**
 * Every API-105 branch answers `{ resourceType, resourceId }` plus whichever aggregates it touched.
 * The optional members are exactly the branch payloads — a caller must narrow, never assume.
 */
export interface CodTransitionResult {
  resourceType: string;
  resourceId: string;
  gate?: CodGateView;
  reviewCycle?: CodGateReviewCycleView;
  package?: CodPackageView;
  readiness?: ReadinessEvaluation;
  handover?: HandoverView;
}

export interface CommissioningSystemListResponse {
  data: CommissioningSystemView[];
  meta: CommissioningPageMeta;
  correlationId: string;
}

export interface CommissioningSystemResponse {
  data: CommissioningSystemView;
  correlationId: string;
}
export interface TestPackResponse { data: TestPackView; correlationId: string }
export interface TestRunResponse { data: TestRunView; correlationId: string }
export interface CodReadinessResponse { data: CodReadinessData; correlationId: string }
export interface CodTransitionResponse { data: CodTransitionResult; correlationId: string }
