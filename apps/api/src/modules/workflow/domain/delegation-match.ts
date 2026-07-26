/**
 * Pure US-018 delegation matcher for the decide path (API-111).
 *
 * A delegation is consumable for one concrete decision when, at the decision instant:
 * - it is stored ACTIVE (REVOKED/EXPIRED rows never match, whatever their window says);
 * - the instant lies inside [effectiveFrom, effectiveTo) — from inclusive, to exclusive, matching
 *   the `ck_delegation_window` open-interval semantics;
 * - its scope covers the instance: an EMPTY list means "no restriction of that kind", a non-empty
 *   list must contain the instance's workflow definition code / project id respectively.
 *
 * The function never reorders its input: the caller passes rows in a deterministic order
 * (created_at, id) so "which delegator acts" is reproducible, not an accident of the query plan.
 */

export interface DelegationMatchRow {
  id: string;
  delegatorId: string;
  status: string;
  effectiveFrom: Date;
  effectiveTo: Date;
  scope: {
    workflowDefinitionCodes?: unknown;
    projectIds?: unknown;
  };
}

export interface DelegationMatchCriteria {
  /** Code of the instance's workflow definition; null when the definition row is gone. */
  definitionCode: string | null;
  projectId: string;
  at: Date;
}

export function matchDelegations(
  rows: readonly DelegationMatchRow[], criteria: DelegationMatchCriteria
): DelegationMatchRow[] {
  return rows.filter((row) => (
    row.status === 'ACTIVE'
    && row.effectiveFrom.getTime() <= criteria.at.getTime()
    && criteria.at.getTime() < row.effectiveTo.getTime()
    && listCovers(row.scope.workflowDefinitionCodes, criteria.definitionCode)
    && listCovers(row.scope.projectIds, criteria.projectId)
  ));
}

/** Empty/missing list = unrestricted; a restricted list needs a known, contained value. */
function listCovers(list: unknown, value: string | null): boolean {
  if (!Array.isArray(list) || list.length === 0) return true;
  return value !== null && list.includes(value);
}
