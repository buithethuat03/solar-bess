export interface ProgressProjectionFact {
  id: string;
  activityId: string;
  correctionOfId: string | null;
  dataDate: string;
  percentComplete: string;
  remainingDurationWorkDays: number;
  actualStart: string | null;
  actualFinish: string | null;
  recordedAt: string | Date;
}

/**
 * Materializes the latest effective progress fact from an append-only stream.
 * A correction supersedes the fact it references; the current projection is
 * selected by reporting date first, so a late correction of history cannot
 * roll an activity back behind a newer reporting date.
 */
export function materializeProgressProjection<T extends ProgressProjectionFact>(
  facts: readonly T[]
): T | null {
  if (facts.length === 0) return null;
  const activityId = facts[0].activityId;
  if (facts.some((fact) => fact.activityId !== activityId)) {
    throw new Error('Progress projection facts must belong to one activity');
  }
  const supersededIds = new Set(
    facts.map((fact) => fact.correctionOfId).filter((id): id is string => id !== null)
  );
  const effective = facts.filter((fact) => !supersededIds.has(fact.id));
  if (effective.length === 0) return null;
  return [...effective].sort((left, right) => (
    right.dataDate.localeCompare(left.dataDate)
    || new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime()
    || right.id.localeCompare(left.id)
  ))[0];
}
