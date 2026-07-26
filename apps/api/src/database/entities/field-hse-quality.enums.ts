/**
 * Enumerations of the Field, HSE & Quality slice (API-086…API-097).
 *
 * Every value below is mirrored 1:1 by a database CHECK constraint in
 * `1783746000000-CreateFieldHseQuality`; adding a value here without the matching migration is a
 * schema drift, not a feature.
 */

/** DB-055 — workfront lifecycle. */
export enum WorkfrontStatus {
  PLANNED = 'PLANNED',
  READY = 'READY',
  RELEASED = 'RELEASED',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED'
}

/** DB-055 — readiness gate projection; RELEASED structurally requires GATES_CLEARED. */
export enum WorkfrontReadiness {
  PENDING = 'PENDING',
  GATES_CLEARED = 'GATES_CLEARED'
}

/** DB-056 — daily log lifecycle; SUPERSEDED rows are the frozen history of corrections. */
export enum DailyLogStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  SIGNED = 'SIGNED',
  SUPERSEDED = 'SUPERSEDED'
}

/** DB-056 — one live log per (site, contractor, date, shift). */
export enum DailyLogShift {
  DAY = 'DAY',
  NIGHT = 'NIGHT'
}

/** DB-062 — permit-to-work lifecycle (FR-085/FR-086). */
export enum PermitToWorkStatus {
  DRAFT = 'DRAFT',
  REQUESTED = 'REQUESTED',
  VERIFIED = 'VERIFIED',
  ISSUED = 'ISSUED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  CLOSED = 'CLOSED'
}

/** DB-063 — incident report lifecycle; the initial report itself never changes. */
export enum HseIncidentStatus {
  REPORTED = 'REPORTED',
  INVESTIGATING = 'INVESTIGATING',
  CLOSED = 'CLOSED'
}

/** DB-063 — incident classification (FR-087). */
export enum HseIncidentType {
  NEAR_MISS = 'NEAR_MISS',
  FIRST_AID = 'FIRST_AID',
  MEDICAL_TREATMENT = 'MEDICAL_TREATMENT',
  LOST_TIME = 'LOST_TIME',
  FATALITY = 'FATALITY',
  ENVIRONMENTAL = 'ENVIRONMENTAL',
  PROPERTY_DAMAGE = 'PROPERTY_DAMAGE',
  SECURITY = 'SECURITY',
  OTHER = 'OTHER'
}

/** DB-063 — actual and potential severity share one scale. */
export enum HseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/** DB-115 — the stop-work ledger records exactly two kinds of fact. */
export enum StopWorkAction {
  ISSUE = 'ISSUE',
  LIFT = 'LIFT'
}

/** DB-115 — what a stop-work covers; the CHECK forces the matching id columns. */
export enum StopWorkTargetType {
  PROJECT = 'PROJECT',
  SITE = 'SITE',
  WORKFRONT = 'WORKFRONT',
  PERMIT = 'PERMIT'
}

/** DB-059 — an inspection is requested, then recorded exactly once. */
export enum InspectionStatus {
  REQUESTED = 'REQUESTED',
  RECORDED = 'RECORDED'
}

/** DB-059 — recorded outcome; FAIL enables a re-inspection row (sequence_no + 1). */
export enum InspectionResult {
  PASS = 'PASS',
  FAIL = 'FAIL'
}

/** DB-060 — NCR lifecycle (FR-094). */
export enum NcrStatus {
  OPEN = 'OPEN',
  CONTAINED = 'CONTAINED',
  ROOT_CAUSE = 'ROOT_CAUSE',
  DISPOSITION_PROPOSED = 'DISPOSITION_PROPOSED',
  RETURNED = 'RETURNED',
  DISPOSITION_APPROVED = 'DISPOSITION_APPROVED',
  RECTIFICATION = 'RECTIFICATION',
  READY_FOR_VERIFICATION = 'READY_FOR_VERIFICATION',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED'
}

/** DB-060 — approved disposition of a non-conformity. */
export enum NcrDisposition {
  REWORK = 'REWORK',
  REPAIR = 'REPAIR',
  USE_AS_IS = 'USE_AS_IS',
  SCRAP = 'SCRAP',
  REJECT = 'REJECT'
}

/** DB-116/DB-117 — a decision on a disposition/closure cycle. */
export enum QualityCycleDecision {
  APPROVE = 'APPROVE',
  RETURN = 'RETURN'
}

/** DB-061 — punch category; A is structurally COD-blocking and never waivable. */
export enum PunchCategory {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D'
}

/** DB-061 — punch item lifecycle (FR-096). */
export enum PunchItemStatus {
  OPEN = 'OPEN',
  READY_FOR_VERIFICATION = 'READY_FOR_VERIFICATION',
  CLOSED = 'CLOSED',
  WAIVED = 'WAIVED'
}

/** DB-064 — CAPA lifecycle; VERIFIED requires an independent verifier and an assessment. */
export enum CapaActionStatus {
  OPEN = 'OPEN',
  VERIFIED = 'VERIFIED'
}
