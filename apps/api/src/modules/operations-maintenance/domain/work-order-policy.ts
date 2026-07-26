import { PermitToWorkStatus, WorkOrderStatus } from '../../../database/entities';

/**
 * Pure policy for API-120. Keeping the legal from-states and the permit rule in data — instead of
 * scattered `if` chains inside a transaction — makes both unit-testable and keeps the service's job
 * down to "look up, compare, refuse".
 */

export const WORK_ORDER_COMMAND_TYPES = [
  'DISPATCH', 'START', 'HOLD', 'RESUME', 'COMPLETE', 'VERIFY', 'CLOSE', 'REOPEN', 'CANCEL',
  'RAISE_WARRANTY_CLAIM'
] as const;
export type WorkOrderCommandType = (typeof WORK_ORDER_COMMAND_TYPES)[number];

/** The nine commands that move the work order; RAISE_WARRANTY_CLAIM appends a DB-088 row instead. */
export type WorkOrderTransitionCommand = Exclude<WorkOrderCommandType, 'RAISE_WARRANTY_CLAIM'>;

/**
 * WF-024. Three recorded readings of the workflow, because the diagram and the prose differ:
 *
 * - `DISPATCH` accepts DRAFT, APPROVED and SCHEDULED. The 164-operation catalog exposes neither an
 *   approve nor a schedule operation, so APPROVED is a legal stored value nothing writes and a work
 *   order reaches dispatch straight from where API-119 created it.
 * - `START` also accepts REOPENED. WF-024 draws no edge out of Reopened; re-entering execution is
 *   the only reading that leaves the state non-terminal, and a reopened work order that could never
 *   run again would make REOPEN a trap.
 * - `CANCEL` accepts DRAFT (the mermaid edge `Draft --> Cancelled`) and VERIFIED (the prose
 *   "Verified → Closed/Reopened/Cancelled"). Both sources are honoured; no further edge is invented.
 */
export const WORK_ORDER_TRANSITIONS: Record<
  WorkOrderTransitionCommand, { from: readonly WorkOrderStatus[]; to: WorkOrderStatus }
> = {
  DISPATCH: {
    from: [WorkOrderStatus.DRAFT, WorkOrderStatus.APPROVED, WorkOrderStatus.SCHEDULED],
    to: WorkOrderStatus.DISPATCHED
  },
  START: {
    from: [WorkOrderStatus.DISPATCHED, WorkOrderStatus.REOPENED],
    to: WorkOrderStatus.IN_PROGRESS
  },
  HOLD: { from: [WorkOrderStatus.IN_PROGRESS], to: WorkOrderStatus.ON_HOLD },
  RESUME: { from: [WorkOrderStatus.ON_HOLD], to: WorkOrderStatus.IN_PROGRESS },
  COMPLETE: { from: [WorkOrderStatus.IN_PROGRESS], to: WorkOrderStatus.COMPLETE },
  VERIFY: { from: [WorkOrderStatus.COMPLETE], to: WorkOrderStatus.VERIFIED },
  CLOSE: { from: [WorkOrderStatus.VERIFIED], to: WorkOrderStatus.CLOSED },
  REOPEN: {
    from: [WorkOrderStatus.VERIFIED, WorkOrderStatus.CLOSED], to: WorkOrderStatus.REOPENED
  },
  CANCEL: {
    from: [WorkOrderStatus.DRAFT, WorkOrderStatus.VERIFIED], to: WorkOrderStatus.CANCELLED
  }
};

/**
 * A warranty claim records a failure found on the asset, so it may be raised from any state where
 * work has actually happened — never from a draft that nobody executed, never from a cancelled one.
 */
export const WARRANTY_CLAIM_STATES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.DISPATCHED, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.COMPLETE, WorkOrderStatus.VERIFIED, WorkOrderStatus.CLOSED,
  WorkOrderStatus.REOPENED
];

/** True when `command` may fire from `current`. */
export function canTransition(
  command: WorkOrderTransitionCommand, current: WorkOrderStatus
): boolean {
  return WORK_ORDER_TRANSITIONS[command].from.includes(current);
}

/** The four ways a permit can fail to authorize work; `null` means the permit authorizes it. */
export type PermitRejection = 'MISSING' | 'STATUS' | 'WINDOW' | 'SITE';

/** Everything the permit rule needs, and nothing else — so the rule stays a pure function. */
export interface PermitFacts {
  status: PermitToWorkStatus;
  siteId: string;
  validFrom: Date;
  validTo: Date;
}

/** Only a live permit authorizes work; REQUESTED/VERIFIED/SUSPENDED/EXPIRED/CLOSED never do. */
const LIVE_PERMIT_STATUSES: readonly PermitToWorkStatus[] = [
  PermitToWorkStatus.ISSUED, PermitToWorkStatus.ACTIVE
];

/**
 * The single place the "is this permit good for this work, here, now?" question is answered.
 *
 * A foreign key can express the site but never the status or the time window, so splitting the rule
 * across the schema and the service would leave two half-rules that can disagree. Both callers —
 * API-119's PTW_REQUIRED gate and API-120's START gate — evaluate this one function.
 */
export function evaluatePermitValidity(
  permit: PermitFacts | null, requiredSiteId: string, at: Date
): PermitRejection | null {
  if (!permit) return 'MISSING';
  if (permit.siteId !== requiredSiteId) return 'SITE';
  if (!LIVE_PERMIT_STATUSES.includes(permit.status)) return 'STATUS';
  const moment = at.getTime();
  if (moment < permit.validFrom.getTime() || moment > permit.validTo.getTime()) return 'WINDOW';
  return null;
}
