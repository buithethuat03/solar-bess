/**
 * Enumerations of the Commissioning & COD slice (API-098…API-105).
 *
 * Every value below is mirrored 1:1 by a database CHECK constraint in
 * `1783758000000-CreateCommissioningCod`; adding a value here without the matching migration is a
 * schema drift, not a feature.
 */

/** DB-073 — commissioning system lifecycle (SRS §5.14 COM state list). */
export enum CommissioningSystemStatus {
  NOT_READY = 'NOT_READY',
  READY_FOR_TEST = 'READY_FOR_TEST',
  TESTING = 'TESTING',
  PASSED = 'PASSED',
  FAILED = 'FAILED'
}

/**
 * DB-074 — test pack lifecycle. API-100 is the catalog's only test-pack operation and its summary
 * is "Tạo/approve test pack revision", so a pack is born APPROVED from an ISSUED + CLEAN procedure
 * revision. DRAFT stays in the vocabulary for the future two-step flow; SUPERSEDED is the only
 * status an APPROVED pack may still reach (`trg_test_pack_approved_immutable`).
 */
export enum TestPackStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  SUPERSEDED = 'SUPERSEDED'
}

/** DB-075 — a run is open, then recorded exactly once; a retest is a NEW row. */
export enum TestRunStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  RECORDED = 'RECORDED'
}

/** DB-075 — recorded outcome. FAILED/ABORTED are the only results a retest may follow. */
export enum TestRunResult {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  ABORTED = 'ABORTED',
  INCONCLUSIVE = 'INCONCLUSIVE'
}

/** DB-076 — the COD readiness matrix categories (FR-112). */
export enum CodGateCategory {
  LEGAL = 'LEGAL',
  CONTRACTUAL = 'CONTRACTUAL',
  TECHNICAL = 'TECHNICAL',
  QUALITY = 'QUALITY',
  SAFETY = 'SAFETY',
  DOCUMENTATION = 'DOCUMENTATION',
  COMMERCIAL = 'COMMERCIAL'
}

/** DB-076 — gate lifecycle; ACCEPTED and WAIVED are terminal and frozen by trigger. */
export enum CodGateStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WAIVED = 'WAIVED'
}

/** DB-118 — AC-059 records Pass/Fail/Conditional on each review round. */
export enum CodGateReviewDecision {
  PASS = 'PASS',
  FAIL = 'FAIL',
  CONDITIONAL = 'CONDITIONAL'
}

/** DB-077 — COD package lifecycle (SRS §5.14: Draft/Ready/Submitted/Signed/HandedOver). */
export enum CodPackageStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  SUBMITTED = 'SUBMITTED',
  SIGNED = 'SIGNED',
  HANDED_OVER = 'HANDED_OVER'
}
