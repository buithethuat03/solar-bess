import { OpportunityStage } from '../../../database/entities';

/**
 * WF-002 stage machine as seen by API-029 (direct PATCH moves).
 *
 * Only forward, adjacent qualification moves are client-drivable:
 *   LEAD → QUALIFIED → SURVEYED → SCENARIO_READY, plus the rework edge RETURNED → SCENARIO_READY.
 *
 * Every other stage is owned by a command, never by PATCH:
 *   SUBMITTED  — API-032 (scenario submit),
 *   APPROVED / RETURNED / REJECTED — the approval decision (DB-071 engine once it accepts
 *   pre-project targets; unreachable through the API until then, recorded honest stop),
 *   CONVERTED  — API-033 (convert).
 */
export const OPPORTUNITY_STAGE_TRANSITIONS: Readonly<
  Record<OpportunityStage, readonly OpportunityStage[]>
> = {
  [OpportunityStage.LEAD]: [OpportunityStage.QUALIFIED],
  [OpportunityStage.QUALIFIED]: [OpportunityStage.SURVEYED],
  [OpportunityStage.SURVEYED]: [OpportunityStage.SCENARIO_READY],
  [OpportunityStage.SCENARIO_READY]: [],
  [OpportunityStage.SUBMITTED]: [],
  [OpportunityStage.APPROVED]: [],
  [OpportunityStage.RETURNED]: [OpportunityStage.SCENARIO_READY],
  [OpportunityStage.REJECTED]: [],
  [OpportunityStage.CONVERTED]: []
};

/** True when API-029 may move `from` directly to `to`. */
export function canMoveStage(from: OpportunityStage, to: OpportunityStage): boolean {
  return OPPORTUNITY_STAGE_TRANSITIONS[from].includes(to);
}

/**
 * Stages in which API-031 may add a scenario version; each of them lands on SCENARIO_READY.
 * SUBMITTED/APPROVED/REJECTED/CONVERTED refuse — adding evidence under a pending or closed
 * decision would silently regress the pipeline (recorded decision).
 */
export const SCENARIO_CREATABLE_STAGES: readonly OpportunityStage[] = [
  OpportunityStage.SURVEYED, OpportunityStage.SCENARIO_READY, OpportunityStage.RETURNED
];

/** Stages from which API-032 may submit a scenario; both land on SUBMITTED. */
export const SUBMIT_ELIGIBLE_STAGES: readonly OpportunityStage[] = [
  OpportunityStage.SCENARIO_READY, OpportunityStage.RETURNED
];
