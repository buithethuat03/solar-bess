import {
  ShipmentMilestoneType, ShipmentStatus
} from '../../../database/entities/procurement-logistics.enums';

/**
 * FR-070 milestone ordering and status derivation for API-084.
 *
 * The ranked milestone sequence is BOOKED → DEPARTED → ARRIVED → CUSTOMS_CLEARED → DELIVERED.
 * EXCEPTION is unranked: a carrier may report it at any point of the journey. The shipment status
 * is DERIVED from the stream and advances monotonically — an appended milestone can never move the
 * shipment backwards, and an out-of-order report is refused (422 MILESTONE_OUT_OF_ORDER) instead
 * of silently reordered.
 */
const MILESTONE_RANK: Readonly<Partial<Record<ShipmentMilestoneType, number>>> = {
  [ShipmentMilestoneType.BOOKED]: 1,
  [ShipmentMilestoneType.DEPARTED]: 2,
  [ShipmentMilestoneType.ARRIVED]: 3,
  [ShipmentMilestoneType.CUSTOMS_CLEARED]: 4,
  [ShipmentMilestoneType.DELIVERED]: 5
};

const MILESTONE_TARGET_STATUS: Readonly<Record<ShipmentMilestoneType, ShipmentStatus>> = {
  [ShipmentMilestoneType.BOOKED]: ShipmentStatus.BOOKED,
  [ShipmentMilestoneType.DEPARTED]: ShipmentStatus.IN_TRANSIT,
  [ShipmentMilestoneType.ARRIVED]: ShipmentStatus.CUSTOMS,
  [ShipmentMilestoneType.CUSTOMS_CLEARED]: ShipmentStatus.CUSTOMS,
  [ShipmentMilestoneType.DELIVERED]: ShipmentStatus.DELIVERED,
  [ShipmentMilestoneType.EXCEPTION]: ShipmentStatus.EXCEPTION
};

export interface MilestoneRecord {
  milestoneType: ShipmentMilestoneType;
  eventTime: Date;
}

/**
 * A new milestone is out of order when it is ranked and either
 * - its rank is below the highest rank already recorded (the journey never rewinds), or
 * - it advances the rank but claims an event time earlier than a ranked event already recorded
 *   (a later stage cannot have happened before an earlier one).
 * Repeats of the current stage (equal rank) and EXCEPTION reports are always in order — carriers
 * legitimately re-report the same stage and may flag an exception at any time.
 */
export function assessMilestoneOrder(
  existing: readonly MilestoneRecord[], next: MilestoneRecord
): 'IN_ORDER' | 'OUT_OF_ORDER' {
  const nextRank = MILESTONE_RANK[next.milestoneType];
  if (nextRank === undefined) return 'IN_ORDER';
  const ranked = existing.filter(
    (milestone) => MILESTONE_RANK[milestone.milestoneType] !== undefined
  );
  if (ranked.length === 0) return 'IN_ORDER';
  const maxRank = Math.max(...ranked.map(
    (milestone) => MILESTONE_RANK[milestone.milestoneType]!
  ));
  if (nextRank < maxRank) return 'OUT_OF_ORDER';
  if (nextRank > maxRank) {
    const latestEvent = Math.max(...ranked.map((milestone) => milestone.eventTime.getTime()));
    if (next.eventTime.getTime() < latestEvent) return 'OUT_OF_ORDER';
  }
  return 'IN_ORDER';
}

/**
 * Derives the shipment status from its full milestone stream: the target of the highest ranked
 * milestone, overridden to EXCEPTION when the most recent event (by event time, insertion order
 * breaking ties) is an exception that no later ranked milestone has superseded. No milestones —
 * the shipment stays PLANNED.
 */
export function deriveShipmentStatus(milestones: readonly MilestoneRecord[]): ShipmentStatus {
  if (milestones.length === 0) return ShipmentStatus.PLANNED;
  const ranked = milestones.filter(
    (milestone) => MILESTONE_RANK[milestone.milestoneType] !== undefined
  );
  const exceptions = milestones.filter(
    (milestone) => milestone.milestoneType === ShipmentMilestoneType.EXCEPTION
  );
  const latestRankedTime = ranked.length === 0
    ? Number.NEGATIVE_INFINITY
    : Math.max(...ranked.map((milestone) => milestone.eventTime.getTime()));
  if (exceptions.some((milestone) => milestone.eventTime.getTime() >= latestRankedTime)) {
    return ShipmentStatus.EXCEPTION;
  }
  const top = ranked.reduce((best, milestone) => (
    MILESTONE_RANK[milestone.milestoneType]! > MILESTONE_RANK[best.milestoneType]!
      ? milestone : best
  ));
  return MILESTONE_TARGET_STATUS[top.milestoneType];
}
