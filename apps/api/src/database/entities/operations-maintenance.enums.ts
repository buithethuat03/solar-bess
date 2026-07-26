/**
 * Enumerations of the O&M slice (API-114…API-121).
 *
 * Every value below is mirrored 1:1 by a database CHECK constraint in
 * `1783760000000-CreateOperationsMaintenance`; adding a value here without the matching migration
 * is a schema drift, not a feature.
 *
 * Deliberately NOT enumerated here (recorded, per AGENTS.md §3 — no invented vocabularies):
 * - `alarm_cases.source_quality` — the quality flag is copied verbatim from the DB-092 OT event
 *   store, whose vocabulary is owned by the gateway contract, not by PM Web. `Open Question`:
 *   the OT gateway owner must publish the quality vocabulary before it can become a CHECK.
 * - `work_orders.work_type` and `maintenance_plans.plan_type` — no approved code list exists; both
 *   are constrained by a format regex only.
 */

/** DB-084 — local alarm case severity; the same four-step scale the rest of the platform uses. */
export enum AlarmCaseSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * DB-084 — WF-025 local case lifecycle. Every value describes the state of the LOCAL case only.
 * No value here has any meaning in the OT source: acknowledging, resolving or closing a case
 * never clears, resets or suppresses the originating alarm (SEC-127/SEC-128).
 */
export enum AlarmCaseState {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED'
}

/** DB-085 — service incident severity; shares the platform's four-step scale. */
export enum ServiceIncidentSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/** DB-085 — service incident lifecycle (FR-119). */
export enum ServiceIncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATED = 'MITIGATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

/**
 * DB-086 — WF-024 work order lifecycle, exactly the eleven states the workflow names.
 * `APPROVED` is a legal stored value that NO V1 operation writes: the 164-operation catalog has
 * neither an approve nor a schedule operation, so API-119 lands rows in DRAFT (or SCHEDULED when a
 * schedule time is given) and API-120's DISPATCH accepts every pre-dispatch state. Recorded.
 */
export enum WorkOrderStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  SCHEDULED = 'SCHEDULED',
  DISPATCHED = 'DISPATCHED',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  COMPLETE = 'COMPLETE',
  VERIFIED = 'VERIFIED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
  CANCELLED = 'CANCELLED'
}

/** DB-086 — dispatch priority; shares the platform's four-step scale. */
export enum WorkOrderPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * DB-119 — a decision on one work-order closure cycle. Mirrors `QualityCycleDecision` (DB-116/117)
 * value-for-value but stays a separate type so the O&M CHECK and the quality CHECK can diverge
 * without one slice silently redefining the other's vocabulary.
 */
export enum WorkOrderClosureDecision {
  APPROVE = 'APPROVE',
  RETURN = 'RETURN'
}

/**
 * DB-087 — maintenance plan trigger. `Assumption` (owner: Product Owner, confirm before the O&M
 * planning slice ships): DB-087 names `triggerType` without a value list, and TIME/USAGE/CONDITION
 * is the smallest set that covers the interval and condition columns the entity actually stores.
 */
export enum MaintenancePlanTriggerType {
  TIME = 'TIME',
  USAGE = 'USAGE',
  CONDITION = 'CONDITION'
}

/** DB-087 — plan lifecycle; a PUBLISHED version is frozen by trigger and only ever RETIRED. */
export enum MaintenancePlanStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  RETIRED = 'RETIRED'
}

/**
 * DB-088 — warranty claim lifecycle. APPROVED/REJECTED/WITHDRAWN are the resolved states; a
 * resolved claim is frozen by trigger and its resolution text is retained forever.
 */
export enum WarrantyClaimStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN'
}
