export enum RiskStatus {
  IDENTIFIED = 'IDENTIFIED',
  ASSESSED = 'ASSESSED',
  TREATING = 'TREATING',
  MONITORING = 'MONITORING',
  CLOSURE_PENDING = 'CLOSURE_PENDING',
  CLOSED = 'CLOSED',
  OCCURRED = 'OCCURRED'
}

export enum IssueStatus {
  REPORTED = 'REPORTED',
  TRIAGED = 'TRIAGED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSURE_PENDING = 'CLOSURE_PENDING',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED'
}

export enum RiskIssueActionStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
  VERIFIED = 'VERIFIED',
  CANCELLED = 'CANCELLED'
}

export enum ChangeRequestStatus {
  DRAFT = 'DRAFT',
  ASSESSED = 'ASSESSED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  IMPLEMENTED = 'IMPLEMENTED',
  CLOSED = 'CLOSED'
}

export enum IssueSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ExposureLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ChangeSourceType {
  MANUAL = 'MANUAL',
  RISK = 'RISK',
  ISSUE = 'ISSUE'
}

export enum RiskResponseStrategy {
  AVOID = 'AVOID',
  MITIGATE = 'MITIGATE',
  TRANSFER = 'TRANSFER',
  ACCEPT = 'ACCEPT'
}

export enum RiskIssueActionType {
  RESPONSE = 'RESPONSE',
  CONTINGENCY = 'CONTINGENCY',
  CORRECTIVE = 'CORRECTIVE',
  DECISION = 'DECISION'
}

export enum RiskChangeDecision {
  APPROVE = 'APPROVE',
  RETURN = 'RETURN',
  REJECT = 'REJECT'
}

export interface EvidenceReferenceRecord {
  objectType: string;
  objectId: string;
  revisionId?: string;
  label?: string;
}
