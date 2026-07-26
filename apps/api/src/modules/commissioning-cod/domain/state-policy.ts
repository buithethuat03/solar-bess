import {
  CodGateReviewDecision, CodGateStatus, CodPackageStatus, TestRunResult
} from '../../../database/entities';

/**
 * Pure state maps for the Commissioning & COD commands. Keeping the legal from-states in data —
 * instead of scattered `if` chains — makes the machine unit-testable and keeps the services' job
 * down to "look up, compare, refuse". Every map here is mirrored by a row constraint or a trigger;
 * these exist so the API answers 422 with a domain code instead of surfacing a raw 55000.
 */

/**
 * API-103: a retest may only follow a run whose recorded result is a non-success. PASSED is
 * excluded because a passed test has nothing to retest; INCONCLUSIVE is excluded because the
 * catalog names the retest trigger as "failed/aborted" and widening it is a scope change.
 */
export const RETESTABLE_RESULTS: readonly TestRunResult[] = [
  TestRunResult.FAILED, TestRunResult.ABORTED
];

export function canRetest(result: TestRunResult | null): boolean {
  return result !== null && RETESTABLE_RESULTS.includes(result);
}

export type CodGateCommand = 'SUBMIT_EVIDENCE' | 'DECIDE_REVIEW' | 'WAIVE';

/**
 * FR-113 gate lifecycle. `DECIDE_REVIEW` lists the PASS outcome; FAIL and CONDITIONAL resolve
 * through `COD_GATE_REVIEW_OUTCOME`. A WAIVED or ACCEPTED gate accepts nothing further — the
 * trigger freezes the row, so these from-lists deliberately exclude both.
 */
export const COD_GATE_TRANSITIONS: Record<
  CodGateCommand, { from: readonly CodGateStatus[]; to: CodGateStatus }
> = {
  SUBMIT_EVIDENCE: {
    from: [CodGateStatus.PENDING, CodGateStatus.REJECTED], to: CodGateStatus.UNDER_REVIEW
  },
  DECIDE_REVIEW: { from: [CodGateStatus.UNDER_REVIEW], to: CodGateStatus.ACCEPTED },
  WAIVE: {
    from: [CodGateStatus.PENDING, CodGateStatus.UNDER_REVIEW, CodGateStatus.REJECTED],
    to: CodGateStatus.WAIVED
  }
};

/**
 * AC-059 outcomes. CONDITIONAL is recorded as its own decision but does NOT accept the gate: the
 * conditions are still outstanding, so the gate returns to PENDING and a new review round can be
 * submitted. Only PASS accepts.
 */
export const COD_GATE_REVIEW_OUTCOME: Record<CodGateReviewDecision, CodGateStatus> = {
  [CodGateReviewDecision.PASS]: CodGateStatus.ACCEPTED,
  [CodGateReviewDecision.FAIL]: CodGateStatus.REJECTED,
  [CodGateReviewDecision.CONDITIONAL]: CodGateStatus.PENDING
};

export type CodPackageCommand = 'SUBMIT_COD' | 'SIGN_COD' | 'ACCEPT_HANDOVER';

/**
 * FR-113/FR-114 package lifecycle. SUBMIT_COD has no from-state because it CREATES the package
 * row; the partial unique `uq_cod_package_active` is what refuses a second one in flight.
 */
export const COD_PACKAGE_TRANSITIONS: Record<
  Exclude<CodPackageCommand, 'SUBMIT_COD'>, { from: readonly CodPackageStatus[]; to: CodPackageStatus }
> = {
  SIGN_COD: { from: [CodPackageStatus.SUBMITTED], to: CodPackageStatus.SIGNED },
  ACCEPT_HANDOVER: { from: [CodPackageStatus.SIGNED], to: CodPackageStatus.HANDED_OVER }
};

/** The statuses that keep `uq_cod_package_active` occupied — one per project at a time. */
export const NON_TERMINAL_PACKAGE_STATUSES: readonly CodPackageStatus[] = [
  CodPackageStatus.DRAFT, CodPackageStatus.READY, CodPackageStatus.SUBMITTED
];

/** True when `command` may fire from `current`. */
export function canTransition<C extends string, S>(
  transitions: Record<C, { from: readonly S[] }>, command: C, current: S
): boolean {
  return transitions[command].from.includes(current);
}
