export enum WorkflowDefinitionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED'
}

/**
 * The MVP engine routes exactly one aggregate family. FR-139 needs deterministic routing by object
 * type, so the binding is an explicit column with a closed CHECK rather than an implicit convention.
 */
export enum WorkflowObjectType {
  CHANGE_REQUEST = 'ChangeRequest'
}

export enum WorkflowVersionStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  SUPERSEDED = 'SUPERSEDED'
}

/**
 * SRS §5 writes these in PascalCase (`Submitted → InReview → …`); the repository persists
 * SCREAMING_SNAKE everywhere, so the mapping is:
 *   SUBMITTED = Submitted, IN_REVIEW = InReview, RETURNED = Returned, REJECTED = Rejected,
 *   CONDITIONALLY_APPROVED = ConditionallyApproved, APPROVED = Approved, CANCELLED = Cancelled,
 *   CONFIGURATION_ERROR = ConfigurationError, EXPIRED = Expired.
 * There is deliberately no DRAFT: `Draft` belongs to the domain object before API-108 starts an
 * instance, and an instance is born SUBMITTED.
 */
export enum WorkflowInstanceState {
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  CONDITIONALLY_APPROVED = 'CONDITIONALLY_APPROVED',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  EXPIRED = 'EXPIRED'
}

/** States with no outbound transition; a command targeting one of these is INVALID_STATE_TRANSITION. */
export const TERMINAL_WORKFLOW_STATES: readonly WorkflowInstanceState[] = [
  WorkflowInstanceState.APPROVED,
  WorkflowInstanceState.REJECTED,
  WorkflowInstanceState.CANCELLED,
  WorkflowInstanceState.EXPIRED
];

export enum WorkflowDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  RETURN = 'RETURN',
  /**
   * Persisted in the vocabulary so enabling it later needs no migration, but rejected at the service
   * boundary until the non-waivable control list exists (docs/16 Open Question).
   */
  CONDITIONAL_APPROVE = 'CONDITIONAL_APPROVE'
}

/** How a step decides it is satisfied. */
export enum WorkflowStepRule {
  ALL = 'ALL',
  QUORUM = 'QUORUM',
  MANDATORY_ROLE = 'MANDATORY_ROLE'
}

export enum WorkflowApproverScope {
  TENANT = 'TENANT',
  PROJECT = 'PROJECT',
  PACKAGE = 'PACKAGE'
}
