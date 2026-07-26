import { NcrStatus, PunchItemStatus } from '../../../database/entities';

/**
 * Pure state maps for the multiplexed quality commands (API-096/API-097). Keeping the legal
 * from-states in data — instead of scattered `if` chains — makes the machine unit-testable and
 * keeps the service's job down to "look up, compare, refuse".
 */

export type NcrTransitionCommand =
  | 'CONTAIN'
  | 'RECORD_ROOT_CAUSE'
  | 'PROPOSE_DISPOSITION'
  | 'DECIDE_DISPOSITION'
  | 'START_RECTIFICATION'
  | 'REQUEST_VERIFICATION'
  | 'VERIFY_CLOSE'
  | 'REOPEN';

/**
 * FR-094 lifecycle. `DECIDE_DISPOSITION` lists the APPROVE outcome; a RETURN decision resolves to
 * RETURNED via `NCR_RETURN_STATUS`. A REOPENED NCR re-enters at rectification — its root cause and
 * approved disposition still stand.
 */
export const NCR_TRANSITIONS: Record<
  NcrTransitionCommand, { from: readonly NcrStatus[]; to: NcrStatus }
> = {
  CONTAIN: { from: [NcrStatus.OPEN], to: NcrStatus.CONTAINED },
  RECORD_ROOT_CAUSE: { from: [NcrStatus.CONTAINED], to: NcrStatus.ROOT_CAUSE },
  PROPOSE_DISPOSITION: {
    from: [NcrStatus.ROOT_CAUSE, NcrStatus.RETURNED], to: NcrStatus.DISPOSITION_PROPOSED
  },
  DECIDE_DISPOSITION: {
    from: [NcrStatus.DISPOSITION_PROPOSED], to: NcrStatus.DISPOSITION_APPROVED
  },
  START_RECTIFICATION: {
    from: [NcrStatus.DISPOSITION_APPROVED, NcrStatus.REOPENED], to: NcrStatus.RECTIFICATION
  },
  REQUEST_VERIFICATION: {
    from: [NcrStatus.RECTIFICATION], to: NcrStatus.READY_FOR_VERIFICATION
  },
  VERIFY_CLOSE: { from: [NcrStatus.READY_FOR_VERIFICATION], to: NcrStatus.CLOSED },
  REOPEN: { from: [NcrStatus.CLOSED], to: NcrStatus.REOPENED }
};

/** A RETURN decision on the open disposition cycle sends the NCR here instead of `to`. */
export const NCR_RETURN_STATUS = NcrStatus.RETURNED;

export type PunchTransitionCommand = 'REQUEST_CLOSURE' | 'DECIDE_CLOSURE' | 'WAIVE';

/** FR-096 lifecycle; a RETURN decision resolves to `PUNCH_RETURN_STATUS`. */
export const PUNCH_TRANSITIONS: Record<
  PunchTransitionCommand, { from: readonly PunchItemStatus[]; to: PunchItemStatus }
> = {
  REQUEST_CLOSURE: {
    from: [PunchItemStatus.OPEN], to: PunchItemStatus.READY_FOR_VERIFICATION
  },
  DECIDE_CLOSURE: {
    from: [PunchItemStatus.READY_FOR_VERIFICATION], to: PunchItemStatus.CLOSED
  },
  WAIVE: { from: [PunchItemStatus.OPEN], to: PunchItemStatus.WAIVED }
};

export const PUNCH_RETURN_STATUS = PunchItemStatus.OPEN;

/** True when `command` may fire from `current`. */
export function canTransition<C extends string, S>(
  transitions: Record<C, { from: readonly S[] }>, command: C, current: S
): boolean {
  return transitions[command].from.includes(current);
}
