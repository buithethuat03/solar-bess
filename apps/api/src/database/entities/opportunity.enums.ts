/**
 * WF-002 pipeline stages for DB-014. Stage transitions are enforced by the opportunity module's
 * transition map (`modules/opportunity/domain/stage-transitions.ts`); the DB CHECK only closes the
 * vocabulary.
 */
export enum OpportunityStage {
  LEAD = 'LEAD',
  QUALIFIED = 'QUALIFIED',
  SURVEYED = 'SURVEYED',
  SCENARIO_READY = 'SCENARIO_READY',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  CONVERTED = 'CONVERTED'
}

/** DB-015 survey data quality ladder; an APPROVED survey package row is immutable (trigger). */
export enum SurveyDataQuality {
  RAW = 'RAW',
  VALIDATED = 'VALIDATED',
  APPROVED = 'APPROVED'
}

/** DB-016 scenario families; mirrors the project type vocabulary of DB-010. */
export enum InvestmentScenarioType {
  SOLAR = 'SOLAR',
  BESS = 'BESS',
  HYBRID = 'HYBRID'
}

/**
 * DB-016 stored scenario status. When `workflow_instance_id` is set and the DB-071 instance is in a
 * mapped live state, API-028 presents the instance state projected over this stored value
 * (read-time projection, no duplication); the stored value remains the domain aggregate's own
 * transition history (DRAFT → SUBMITTED via API-032).
 */
export enum InvestmentScenarioStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED'
}
