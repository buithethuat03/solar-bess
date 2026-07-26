import { OpportunityStage } from 'src/database/entities';
import {
  OPPORTUNITY_STAGE_TRANSITIONS, SCENARIO_CREATABLE_STAGES, SUBMIT_ELIGIBLE_STAGES, canMoveStage
} from 'src/modules/opportunity/domain/stage-transitions';

describe('Opportunity stage transition map — WF-002 / API-029', () => {
  const stages = Object.values(OpportunityStage);

  it('covers the whole WF-002 vocabulary exactly once', () => {
    expect(Object.keys(OPPORTUNITY_STAGE_TRANSITIONS).sort()).toEqual([...stages].sort());
  });

  it.each([
    [OpportunityStage.LEAD, OpportunityStage.QUALIFIED],
    [OpportunityStage.QUALIFIED, OpportunityStage.SURVEYED],
    [OpportunityStage.SURVEYED, OpportunityStage.SCENARIO_READY],
    [OpportunityStage.RETURNED, OpportunityStage.SCENARIO_READY]
  ])('allows the legal adjacent move %s → %s', (from, to) => {
    expect(canMoveStage(from, to)).toBe(true);
  });

  it('refuses every stage skip along the qualification chain', () => {
    expect(canMoveStage(OpportunityStage.LEAD, OpportunityStage.SURVEYED)).toBe(false);
    expect(canMoveStage(OpportunityStage.LEAD, OpportunityStage.SCENARIO_READY)).toBe(false);
    expect(canMoveStage(OpportunityStage.QUALIFIED, OpportunityStage.SCENARIO_READY)).toBe(false);
  });

  it('refuses every backward move', () => {
    expect(canMoveStage(OpportunityStage.QUALIFIED, OpportunityStage.LEAD)).toBe(false);
    expect(canMoveStage(OpportunityStage.SURVEYED, OpportunityStage.QUALIFIED)).toBe(false);
    expect(canMoveStage(OpportunityStage.SCENARIO_READY, OpportunityStage.SURVEYED)).toBe(false);
  });

  it.each([
    OpportunityStage.SUBMITTED, OpportunityStage.APPROVED, OpportunityStage.RETURNED,
    OpportunityStage.REJECTED, OpportunityStage.CONVERTED
  ])('never lets PATCH reach the command-owned stage %s from anywhere', (target) => {
    for (const from of stages) {
      expect(canMoveStage(from, target)).toBe(false);
    }
  });

  it('leaves decision and terminal stages without client-drivable exits except RETURNED', () => {
    for (const from of [
      OpportunityStage.SCENARIO_READY, OpportunityStage.SUBMITTED, OpportunityStage.APPROVED,
      OpportunityStage.REJECTED, OpportunityStage.CONVERTED
    ]) {
      expect(OPPORTUNITY_STAGE_TRANSITIONS[from]).toEqual([]);
    }
    expect(OPPORTUNITY_STAGE_TRANSITIONS[OpportunityStage.RETURNED])
      .toEqual([OpportunityStage.SCENARIO_READY]);
  });

  it('lets API-031 create scenarios only at or after SURVEYED (plus rework)', () => {
    expect([...SCENARIO_CREATABLE_STAGES].sort()).toEqual([
      OpportunityStage.RETURNED, OpportunityStage.SCENARIO_READY, OpportunityStage.SURVEYED
    ].sort());
  });

  it('lets API-032 submit only from SCENARIO_READY or RETURNED', () => {
    expect([...SUBMIT_ELIGIBLE_STAGES].sort()).toEqual([
      OpportunityStage.RETURNED, OpportunityStage.SCENARIO_READY
    ].sort());
  });
});
