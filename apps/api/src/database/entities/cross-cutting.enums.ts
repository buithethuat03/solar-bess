/**
 * Enums of the cross-cutting slice: DB-008 Delegation, DB-106 SavedView and DB-107 ReportJob.
 * Every value mirrors a CHECK constraint in migration 1783754/1783755 one-for-one.
 */

export enum DelegationStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  /** Reserved for housekeeping; runtime eligibility always re-checks the effective window. */
  EXPIRED = 'EXPIRED'
}

/**
 * V1 deliberately knows exactly one share scope. Sharing a saved view would republish another
 * user's filter set without re-evaluating their permissions, so the vocabulary itself makes it
 * impossible; widening this enum (and `ck_saved_view_share_scope`) is the future approval gate.
 */
export enum SavedViewShareScope {
  PRIVATE = 'PRIVATE'
}

/**
 * The registers a saved view (and API-130 search) can target. Only implemented registers appear:
 * a target without a queryable endpoint would be a dangling reference.
 */
export enum SavedViewTargetType {
  PROJECT = 'PROJECT',
  DOCUMENT = 'DOCUMENT',
  RISK = 'RISK',
  ISSUE = 'ISSUE',
  CHANGE_REQUEST = 'CHANGE_REQUEST',
  CONTRACT = 'CONTRACT'
}

export enum ReportJobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

/** Allowlisted export types (FR-173). Each maps to exactly one implemented register. */
export enum ReportType {
  RISK_REGISTER_CSV = 'RISK_REGISTER_CSV',
  DOCUMENT_REGISTER_CSV = 'DOCUMENT_REGISTER_CSV'
}
