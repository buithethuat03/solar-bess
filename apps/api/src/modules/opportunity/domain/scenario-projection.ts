/**
 * API-028 read-time status projection for DB-016 (recorded decision): when a scenario carries a
 * `workflow_instance_id` and the DB-071 instance is in a mapped live state, the instance state is
 * presented AS the scenario status — a single SQL join, no stored duplication:
 *
 *   SUBMITTED / IN_REVIEW → SUBMITTED, APPROVED → APPROVED,
 *   REJECTED → REJECTED,   RETURNED → RETURNED.
 *
 * Unmapped instance states (CANCELLED, EXPIRED, CONFIGURATION_ERROR, CONDITIONALLY_APPROVED) and
 * scenarios without an instance fall back to the stored status, which stays visible alongside as
 * `storedStatus`. Expects the aliases `scenario` (investment_scenarios) and `instance`
 * (LEFT JOIN workflow_instances ON tenant + workflow_instance_id).
 */
export const SCENARIO_EFFECTIVE_STATUS_SQL = `CASE
  WHEN scenario.workflow_instance_id IS NOT NULL
    AND instance.state IN ('SUBMITTED','IN_REVIEW') THEN 'SUBMITTED'
  WHEN scenario.workflow_instance_id IS NOT NULL
    AND instance.state IN ('APPROVED','REJECTED','RETURNED') THEN instance.state
  ELSE scenario.status
END`;
