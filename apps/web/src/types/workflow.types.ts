export type WorkflowObjectType = 'ChangeRequest';
export type WorkflowDefinitionStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type WorkflowVersionStatus = 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
export type WorkflowInstanceState =
  'SUBMITTED' | 'IN_REVIEW' | 'RETURNED' | 'REJECTED' | 'CONDITIONALLY_APPROVED'
  | 'APPROVED' | 'CANCELLED' | 'CONFIGURATION_ERROR' | 'EXPIRED';
export type WorkflowDecision = 'APPROVE' | 'REJECT' | 'RETURN' | 'CONDITIONAL_APPROVE';

export interface WorkflowVersionView {
  id: string;
  workflowDefinitionId: string;
  version: number;
  status: WorkflowVersionStatus;
  rulesHash: string;
  stepCount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  publishedBy: string | null;
  publishedAt: string | null;
}

export interface WorkflowDefinitionView {
  id: string;
  code: string;
  name: string;
  objectType: WorkflowObjectType;
  processOwnerId: string;
  status: WorkflowDefinitionStatus;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  versions: WorkflowVersionView[];
}

export interface WorkflowInstanceView {
  id: string;
  workflowDefinitionId: string;
  workflowVersionId: string;
  objectType: WorkflowObjectType;
  objectId: string;
  objectVersion: number;
  projectId: string;
  packageId: string | null;
  state: WorkflowInstanceState;
  currentStepKey: string | null;
  currentAttemptNo: number;
  routeHash: string;
  requestedBy: string;
  closedBy: string | null;
  closedAt: string | null;
  closureReason: string | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  sequenceNo?: number;
}

export interface ApprovalDecisionView {
  id: string;
  sequenceNo: number;
  stepKey: string;
  attemptNo: number;
  decision: WorkflowDecision;
  actorId: string;
  effectiveActorId: string;
  comment: string;
  decidedAt: string;
}

export interface WorkflowPageMeta {
  nextCursor: string | null;
  limit: number;
}

export interface ApprovalTaskListQuery {
  cursor?: string;
  limit?: number;
  state?: WorkflowInstanceState;
  objectType?: WorkflowObjectType;
  projectId?: string;
}

export interface ApprovalTaskListResponse {
  data: WorkflowInstanceView[];
  meta: WorkflowPageMeta;
  correlationId: string;
}

export interface WorkflowDefinitionListResponse {
  data: WorkflowDefinitionView[];
  meta: WorkflowPageMeta;
  correlationId: string;
}

export interface WorkflowInstanceDetailResponse {
  data: WorkflowInstanceView;
  decisions: ApprovalDecisionView[];
  correlationId: string;
}

export interface WorkflowInstanceCommandResponse {
  data: WorkflowInstanceView;
  correlationId: string;
}

export interface RecordApprovalDecisionRequest {
  decision: WorkflowDecision;
  stepKey: string;
  expectedVersion: number;
  comment: string;
}

export interface CancelWorkflowInstanceRequest {
  expectedVersion: number;
  reason: string;
}
