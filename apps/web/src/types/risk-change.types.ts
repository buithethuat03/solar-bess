export type RiskStatus = 'IDENTIFIED' | 'ASSESSED' | 'TREATING' | 'MONITORING' | 'CLOSURE_PENDING' | 'CLOSED' | 'OCCURRED';
export type IssueStatus = 'REPORTED' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSURE_PENDING' | 'CLOSED' | 'REOPENED';
export type RiskIssueActionStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'VERIFIED' | 'CANCELLED';
export type ChangeRequestStatus = 'DRAFT' | 'ASSESSED' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'IMPLEMENTED' | 'CLOSED';
export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ExposureLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskChangeDecision = 'APPROVE' | 'RETURN' | 'REJECT';
export type RiskResponseStrategy = 'AVOID' | 'MITIGATE' | 'TRANSFER' | 'ACCEPT';
export type RiskIssueActionType = 'RESPONSE' | 'CONTINGENCY' | 'CORRECTIVE' | 'DECISION';
export type ChangeSourceType = 'MANUAL' | 'RISK' | 'ISSUE';
export type RiskChangeSourceType = 'RISK' | 'ISSUE' | 'ACTION' | 'CHANGE_REQUEST';

export interface EvidenceReference {
  objectType: string;
  objectId: string;
  revisionId?: string;
  label?: string;
}

export interface RiskResidualAssessment {
  probability: number;
  costImpactRating: number;
  scheduleImpactRating: number;
  hseImpactRating: number;
  rationale?: string;
}

export interface Risk {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  category: string;
  cause: string;
  event: string;
  impact: string;
  probability: number;
  costImpactRating: number;
  scheduleImpactRating: number;
  hseImpactRating: number;
  impactRating: number;
  inherentExposure: number;
  inherentLevel: ExposureLevel;
  residualProbability: number | null;
  residualCostImpactRating: number | null;
  residualScheduleImpactRating: number | null;
  residualHseImpactRating: number | null;
  residualImpactRating: number | null;
  residualExposure: number | null;
  residualLevel: ExposureLevel | null;
  scoringVersion: string;
  thresholdVersion: string;
  ownerId: string;
  reviewDate: string;
  responseStrategy: RiskResponseStrategy | null;
  responsePlan: string | null;
  trigger: string | null;
  contingencyPlan: string | null;
  evidenceRefs: EvidenceReference[];
  status: RiskStatus;
  occurredIssueId: string | null;
  createdBy: string;
  closureRequestedBy: string | null;
  closureRequestedAt: string | null;
  closureReason: string | null;
  closureRequestEvidenceRefs: EvidenceReference[];
  closureDecision: RiskChangeDecision | null;
  closureDecisionEvidenceRefs: EvidenceReference[];
  closureDecidedBy: string | null;
  closureDecidedAt: string | null;
  closureDecisionComment: string | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiskSummary {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  category: string;
  ownerId: string;
  reviewDate: string;
  status: RiskStatus;
  inherentProbability: number;
  inherentImpactRating: number;
  inherentExposure: number;
  inherentLevel: ExposureLevel;
  residualProbability: number | null;
  residualImpactRating: number | null;
  residualExposure: number | null;
  residualLevel: ExposureLevel | null;
  effectiveExposure: number;
  effectiveLevel: ExposureLevel;
  scoringVersion: string;
  thresholdVersion: string;
  versionNo: number;
}

export interface CreateRiskRequest {
  packageId?: string;
  code: string;
  category: string;
  cause: string;
  event: string;
  impact: string;
  probability: number;
  costImpactRating: number;
  scheduleImpactRating: number;
  hseImpactRating: number;
  ownerId: string;
  reviewDate: string;
  responseStrategy?: RiskResponseStrategy;
  responsePlan?: string;
  trigger?: string;
  contingencyPlan?: string;
  evidenceRefs?: EvidenceReference[];
}

type ForbiddenFields<T> = { [Key in keyof T]?: never };

type UpdateRiskManagementRequest = Partial<Omit<CreateRiskRequest,
  'packageId' | 'code' | 'responseStrategy' | 'responsePlan' | 'trigger' | 'contingencyPlan'>> & {
  expectedVersion: number;
  responseStrategy?: RiskResponseStrategy | null;
  responsePlan?: string | null;
  trigger?: string | null;
  contingencyPlan?: string | null;
  residualAssessment?: RiskResidualAssessment;
  residualAssessmentReason?: string;
  status?: Exclude<RiskStatus, 'CLOSURE_PENDING'>;
  occurredIssueId?: string;
  closureReason?: never;
  closureEvidenceRefs?: never;
};

type UpdateRiskClosureRequest = {
  expectedVersion: number;
  status: 'CLOSURE_PENDING';
  closureReason: string;
  closureEvidenceRefs: EvidenceReference[];
} & ForbiddenFields<Omit<UpdateRiskManagementRequest,
  'expectedVersion' | 'status' | 'closureReason' | 'closureEvidenceRefs'>>;

export type UpdateRiskRequest = UpdateRiskManagementRequest | UpdateRiskClosureRequest;

export interface Issue {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  title: string;
  description: string;
  occurredAt: string;
  rootCause: string;
  actualImpact: string;
  severity: IssueSeverity;
  decisionSummary: string | null;
  ownerId: string;
  targetDate: string;
  sourceRiskId: string | null;
  evidenceRefs: EvidenceReference[];
  status: IssueStatus;
  resolutionSummary: string | null;
  resolutionEvidenceRefs: EvidenceReference[];
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string;
  closureRequestedBy: string | null;
  closureRequestedAt: string | null;
  closureReason: string | null;
  closureRequestEvidenceRefs: EvidenceReference[];
  closureDecision: RiskChangeDecision | null;
  closureDecisionEvidenceRefs: EvidenceReference[];
  closureDecidedBy: string | null;
  closureDecidedAt: string | null;
  closureDecisionComment: string | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueSummary {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  title: string;
  severity: IssueSeverity;
  ownerId: string;
  targetDate: string;
  status: IssueStatus;
  sourceRiskId: string | null;
  versionNo: number;
}

export interface CreateIssueRequest {
  packageId?: string;
  code: string;
  title: string;
  description: string;
  occurredAt: string;
  rootCause: string;
  actualImpact: string;
  severity: IssueSeverity;
  ownerId: string;
  targetDate: string;
  sourceRiskId?: string;
  markSourceRiskOccurred?: boolean;
  evidenceRefs?: EvidenceReference[];
}

type UpdateIssueManagementRequest = Partial<Omit<CreateIssueRequest,
  'packageId' | 'code' | 'sourceRiskId' | 'markSourceRiskOccurred'>> & {
  expectedVersion: number;
  decisionSummary?: string | null;
  status?: Exclude<IssueStatus, 'CLOSURE_PENDING'>;
  resolutionSummary?: string;
  resolutionEvidenceRefs?: EvidenceReference[];
  closureReason?: never;
  closureEvidenceRefs?: never;
};

type UpdateIssueClosureRequest = {
  expectedVersion: number;
  status: 'CLOSURE_PENDING';
  closureReason: string;
  closureEvidenceRefs: EvidenceReference[];
} & ForbiddenFields<Omit<UpdateIssueManagementRequest,
  'expectedVersion' | 'status' | 'closureReason' | 'closureEvidenceRefs'>>;

export type UpdateIssueRequest = UpdateIssueManagementRequest | UpdateIssueClosureRequest;

export interface RiskIssueAction {
  id: string;
  projectId: string;
  packageId: string | null;
  riskId: string | null;
  issueId: string | null;
  code: string;
  actionType: RiskIssueActionType;
  title: string;
  description: string | null;
  ownerId: string;
  dueDate: string;
  status: RiskIssueActionStatus;
  statusReason: string | null;
  evidenceRefs: EvidenceReference[];
  residualAssessment: RiskResidualAssessment | null;
  residualRiskVersion: number | null;
  completedBy: string | null;
  completedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export type RiskIssueActionSummary = Pick<RiskIssueAction,
  'id' | 'projectId' | 'packageId' | 'riskId' | 'issueId' | 'code' | 'actionType' |
  'title' | 'ownerId' | 'dueDate' | 'status' | 'versionNo'>;

export type CreateRiskIssueActionRequest = {
  code: string;
  actionType: RiskIssueActionType;
  title: string;
  description?: string;
  ownerId: string;
  dueDate: string;
  evidenceRefs?: EvidenceReference[];
} & ({ riskId: string; issueId?: never } | { issueId: string; riskId?: never });

export interface UpdateRiskIssueActionFieldsRequest {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  ownerId?: string;
  dueDate?: string;
  status?: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED';
  statusReason?: string;
  evidenceRefs?: EvidenceReference[];
}

interface CompleteRiskIssueActionBase {
  expectedVersion: number;
  status: 'DONE';
  evidenceRefs: EvidenceReference[];
}

export type CompleteRiskIssueActionRequest = CompleteRiskIssueActionBase & (
  { residualAssessment: RiskResidualAssessment; residualRiskVersion: number } |
  { residualAssessment?: never; residualRiskVersion?: never }
);

export interface VerifyRiskIssueActionRequest {
  expectedVersion: number;
  status: 'VERIFIED';
  evidenceRefs: EvidenceReference[];
}

export interface CancelRiskIssueActionRequest {
  expectedVersion: number;
  status: 'CANCELLED';
  statusReason: string;
  evidenceRefs: EvidenceReference[];
}

export type UpdateRiskIssueActionRequest = UpdateRiskIssueActionFieldsRequest |
  CompleteRiskIssueActionRequest | VerifyRiskIssueActionRequest | CancelRiskIssueActionRequest;

export type ChangeSource = { type: 'MANUAL' } | { type: 'RISK'; riskId: string } |
  { type: 'ISSUE'; issueId: string };

export interface TextImpactDimension {
  summary: string;
}

export interface ScheduleImpactDimension extends TextImpactDimension {
  durationDeltaDays: number;
  requiresRebaseline: boolean;
  affectedMilestoneIds: string[];
}

export interface CostImpactDimension {
  summary: string;
  amountDelta: string;
  currency: string;
}

export interface ChangeImpactDraft {
  scope?: TextImpactDimension;
  schedule?: ScheduleImpactDimension;
  cost?: CostImpactDimension;
  quality?: TextImpactDimension;
  hse?: TextImpactDimension;
  contract?: TextImpactDimension;
}

export interface ChangeImpactSnapshot {
  scope: TextImpactDimension;
  schedule: ScheduleImpactDimension;
  cost: CostImpactDimension;
  quality: TextImpactDimension;
  hse: TextImpactDimension;
  contract: TextImpactDimension;
}

export interface ChangeRequest {
  id: string;
  projectId: string;
  packageId: string | null;
  code: string;
  title: string;
  reason: string;
  options: string[];
  recommendation: string | null;
  ownerId: string;
  requesterId: string;
  sourceBaselineId: string | null;
  source: ChangeSource;
  evidenceRefs: EvidenceReference[];
  sourceEvidenceSnapshot: EvidenceReference[];
  impactDraft: ChangeImpactDraft;
  impactSnapshot: ChangeImpactSnapshot | null;
  impactSnapshotHash: string | null;
  approvalSnapshotHash: string | null;
  status: ChangeRequestStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  decisionVersion: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  decisionComment: string | null;
  scheduleImpactApproved: boolean;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export type ChangeRequestSummary = Pick<ChangeRequest,
  'id' | 'projectId' | 'packageId' | 'code' | 'title' | 'ownerId' | 'requesterId' |
  'source' | 'status' | 'submittedAt' | 'scheduleImpactApproved' | 'versionNo' | 'updatedAt'>;

export interface CreateChangeRequestRequest {
  packageId?: string;
  code: string;
  title: string;
  reason: string;
  options?: string[];
  recommendation?: string;
  ownerId: string;
  sourceBaselineId?: string;
  source: ChangeSource;
  impact?: ChangeImpactDraft;
  evidenceRefs?: EvidenceReference[];
}

export interface UpdateChangeRequestRequest {
  expectedVersion: number;
  title?: string;
  reason?: string;
  options?: string[];
  recommendation?: string | null;
  ownerId?: string;
  sourceBaselineId?: string;
  impact?: ChangeImpactDraft;
  evidenceRefs?: EvidenceReference[];
  status?: 'DRAFT' | 'ASSESSED';
}

export interface RiskIssueClosureCycle {
  id: string;
  projectId: string;
  packageId: string | null;
  riskId: string | null;
  issueId: string | null;
  sequenceNo: number;
  requestReason: string;
  requestEvidenceRefs: EvidenceReference[];
  requestedBy: string;
  requestedAt: string;
  decision: RiskChangeDecision | null;
  decisionComment: string | null;
  decisionEvidenceRefs: EvidenceReference[];
  decidedBy: string | null;
  decidedAt: string | null;
  resultingStatus: 'MONITORING' | 'RESOLVED' | 'CLOSED' | null;
  createdAt: string;
}

export interface ClosureDecisionRequest {
  decision: RiskChangeDecision;
  expectedVersion: number;
  comment: string;
  evidenceRefs: EvidenceReference[];
}

export interface ChangeDecisionRequest {
  decision: RiskChangeDecision;
  expectedVersion: number;
  comment: string;
}

export interface RiskHeatmapCell {
  probability: number;
  impactRating: number;
  count: number;
}

export interface RiskHeatmapVersionGroup {
  scoringVersion: string;
  thresholdVersion: string;
  inherentCells: RiskHeatmapCell[];
  residualCells: RiskHeatmapCell[];
  residualMissingCount: number;
}

export interface RiskHeatmap {
  filteredRiskCount: number;
  versionGroups: RiskHeatmapVersionGroup[];
}

export interface RiskChangeSummary {
  riskTotal: number;
  highRiskCount: number;
  criticalRiskCount: number;
  riskHeatmap: RiskHeatmap;
  issueTotal: number;
  criticalIssueCount: number;
  overdueActionCount: number;
  pendingChangeDecisionCount: number;
  topRisks: RiskSummary[];
  criticalIssues: IssueSummary[];
  overdueActions: RiskIssueActionSummary[];
  pendingChangeRequests: ChangeRequestSummary[];
  calculatedAt: string;
}

export interface RiskChangeHistoryItem {
  id: string;
  sourceType: RiskChangeSourceType;
  sourceId: string;
  eventType: string;
  actorId: string | null;
  effectiveActorId: string | null;
  versionNo: number;
  summary: string;
  occurredAt: string;
  correlationId: string;
}

export interface CursorMeta {
  nextCursor: string | null;
  limit: number;
}

export interface CursorQuery { cursor?: string; limit?: number }
export interface RiskListQuery extends CursorQuery {
  packageId?: string; status?: RiskStatus; ownerId?: string;
  exposureLevel?: ExposureLevel; reviewBefore?: string;
}
export interface IssueListQuery extends CursorQuery {
  packageId?: string; status?: IssueStatus; ownerId?: string;
  severity?: IssueSeverity; targetBefore?: string; sourceRiskId?: string;
}
export interface ActionListQuery extends CursorQuery {
  riskId?: string; issueId?: string; status?: RiskIssueActionStatus;
  ownerId?: string; dueBefore?: string;
}
export interface ChangeListQuery extends CursorQuery {
  packageId?: string; status?: ChangeRequestStatus; ownerId?: string;
  sourceType?: ChangeSourceType; sourceId?: string;
}
export interface RiskChangeSummaryQuery {
  packageId?: string; ownerId?: string; riskStatus?: RiskStatus; riskCategory?: string;
  riskReviewBefore?: string; scoringVersion?: string; thresholdVersion?: string;
}
export interface RiskChangeHistoryQuery extends CursorQuery {
  packageId?: string; sourceType?: RiskChangeSourceType; sourceId?: string;
  eventType?: string; actorId?: string;
}

export interface PageResponse<T> { data: T[]; meta: CursorMeta; correlationId: string }
export interface CommandResponse<T> { data: T; correlationId: string }
export interface RiskDetailResponse {
  data: Risk; closureCycles: RiskIssueClosureCycle[];
  closureCycleMeta: CursorMeta; correlationId: string;
}
export interface IssueDetailResponse {
  data: Issue; closureCycles: RiskIssueClosureCycle[];
  closureCycleMeta: CursorMeta; correlationId: string;
}
export type RiskListResponse = PageResponse<RiskSummary>;
export type IssueListResponse = PageResponse<IssueSummary>;
export type ActionListResponse = PageResponse<RiskIssueActionSummary>;
export type ChangeListResponse = PageResponse<ChangeRequestSummary>;
export type RiskChangeHistoryResponse = PageResponse<RiskChangeHistoryItem>;
export type RiskCommandResponse = CommandResponse<Risk>;
export type IssueCommandResponse = CommandResponse<Issue>;
export type ActionCommandResponse = CommandResponse<RiskIssueAction>;
export type ChangeCommandResponse = CommandResponse<ChangeRequest>;
export type RiskChangeSummaryResponse = CommandResponse<RiskChangeSummary>;
