import {
  DayLevelCalendar,
  assertIsoDate,
  type CalendarValidationError,
  type DayLevelCalendarConfig
} from './calendar-calculator';
import {
  divideAndRound,
  formatFixedDecimal,
  parseFixedDecimal
} from './fixed-decimal';

export const SPI_FORMULA_VERSION = 'SPI_WEIGHTED_LINEAR_V1';

const FRACTION_SCALE = 1_000_000_000_000n;
const WEIGHT_UNITS_AT_100_PERCENT = 1_000_000n;
const PROGRESS_UNITS_AT_100_PERCENT = 10_000n;

export interface ProgressWbsNodeInput {
  id: string;
  parentWbsId?: string | null;
  weight: string | number;
}

export interface ProgressActivityInput {
  id: string;
  activityType?: 'TASK' | 'MILESTONE';
  /** Required when hierarchical WBS nodes are supplied. */
  wbsId?: string;
  weight: string | number;
  plannedStart: string;
  durationWorkDays: number;
  percentComplete: string | number;
}

export interface ActivityProgressMetric {
  activityId: string;
  effectiveWeight: string;
  plannedProgress: string;
  actualProgress: string;
  weightedPlannedContribution: string;
  weightedActualContribution: string;
}

export interface ProgressCalculationResult {
  formulaVersion: typeof SPI_FORMULA_VERSION;
  dataDate: string;
  plannedProgress: string;
  actualProgress: string;
  /** Null is the canonical N/A representation when planned progress is zero. */
  spi: string | null;
  activityMetrics: readonly ActivityProgressMetric[];
}

export interface ProgressCalculationIssue {
  code: string;
  path: string;
  message: string;
}

export class ProgressCalculationError extends Error {
  constructor(public readonly issues: readonly ProgressCalculationIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join('; '));
    this.name = 'ProgressCalculationError';
  }
}

/**
 * Calculates weighted linear planned progress, latest actual progress and SPI.
 * Without WBS nodes, activity weights are interpreted as project-level weights.
 * With WBS nodes, effective weight is the product of every WBS and activity weight.
 */
export function calculateProgress(
  activities: readonly ProgressActivityInput[],
  dataDate: string,
  calendarConfig: DayLevelCalendarConfig,
  wbsNodes: readonly ProgressWbsNodeInput[] = []
): ProgressCalculationResult {
  const issues: ProgressCalculationIssue[] = [];
  try {
    assertIsoDate(dataDate, 'dataDate');
  } catch (error) {
    const calendarError = error as CalendarValidationError;
    issues.push({
      code: calendarError.code ?? 'INVALID_DATA_DATE',
      path: 'dataDate',
      message: calendarError.message
    });
  }

  let calendar: DayLevelCalendar;
  try {
    calendar = new DayLevelCalendar(calendarConfig);
  } catch (error) {
    const calendarError = error as CalendarValidationError;
    issues.push({
      code: calendarError.code ?? 'INVALID_CALENDAR',
      path: 'calendar',
      message: calendarError.message
    });
    throw new ProgressCalculationError(issues);
  }

  const wbsShares = calculateWbsShares(wbsNodes, issues);
  const seenActivityIds = new Set<string>();
  const normalized: Array<{
    activity: ProgressActivityInput;
    effectiveShare: bigint;
    actualFraction: bigint;
  }> = [];

  activities.forEach((activity, index) => {
    if (activity.id.length === 0 || seenActivityIds.has(activity.id)) {
      issues.push({
        code: activity.id.length === 0 ? 'INVALID_ACTIVITY_ID' : 'DUPLICATE_ACTIVITY_ID',
        path: `activities[${index}].id`,
        message: activity.id.length === 0 ? 'activity id must not be empty' : `activity ${activity.id} is duplicated`
      });
      return;
    }
    seenActivityIds.add(activity.id);

    let weightUnits: bigint;
    let progressUnits: bigint;
    try {
      weightUnits = parseFixedDecimal(activity.weight, 4);
      if (weightUnits <= 0n || weightUnits > WEIGHT_UNITS_AT_100_PERCENT) {
        throw new Error('weight must be greater than 0 and at most 100');
      }
    } catch (error) {
      issues.push({
        code: 'INVALID_ACTIVITY_WEIGHT',
        path: `activities[${index}].weight`,
        message: error instanceof Error ? error.message : 'activity weight is invalid'
      });
      return;
    }
    try {
      progressUnits = parseFixedDecimal(activity.percentComplete, 2);
      if (progressUnits < 0n || progressUnits > PROGRESS_UNITS_AT_100_PERCENT) {
        throw new Error('percentComplete must be between 0 and 100');
      }
    } catch (error) {
      issues.push({
        code: 'INVALID_PERCENT_COMPLETE',
        path: `activities[${index}].percentComplete`,
        message: error instanceof Error ? error.message : 'percentComplete is invalid'
      });
      return;
    }
    if (!Number.isSafeInteger(activity.durationWorkDays) || activity.durationWorkDays < 0) {
      issues.push({
        code: 'INVALID_DURATION_WORKDAYS',
        path: `activities[${index}].durationWorkDays`,
        message: 'durationWorkDays must be a non-negative safe integer'
      });
      return;
    }
    if (activity.activityType === 'TASK' && activity.durationWorkDays < 1) {
      issues.push({
        code: 'TASK_DURATION_REQUIRED',
        path: `activities[${index}].durationWorkDays`,
        message: 'TASK duration must be at least one workday'
      });
      return;
    }
    if (activity.activityType === 'MILESTONE' && activity.durationWorkDays !== 0) {
      issues.push({
        code: 'MILESTONE_DURATION_MUST_BE_ZERO',
        path: `activities[${index}].durationWorkDays`,
        message: 'MILESTONE duration must be zero'
      });
      return;
    }

    let parentShare = FRACTION_SCALE;
    if (wbsNodes.length > 0) {
      if (!activity.wbsId || !wbsShares.has(activity.wbsId)) {
        issues.push({
          code: 'UNKNOWN_ACTIVITY_WBS',
          path: `activities[${index}].wbsId`,
          message: 'activity must reference a WBS in the supplied hierarchy'
        });
        return;
      }
      parentShare = wbsShares.get(activity.wbsId) as bigint;
    }
    const effectiveShare = divideAndRound(parentShare * weightUnits, WEIGHT_UNITS_AT_100_PERCENT);
    const actualFraction = divideAndRound(
      progressUnits * FRACTION_SCALE,
      PROGRESS_UNITS_AT_100_PERCENT
    );
    try {
      calendar.calculatePlannedFinish(activity.plannedStart, activity.durationWorkDays);
    } catch (error) {
      const calendarError = error as CalendarValidationError;
      issues.push({
        code: calendarError.code ?? 'INVALID_ACTIVITY_DATE',
        path: `activities[${index}].plannedStart`,
        message: calendarError.message
      });
      return;
    }
    normalized.push({ activity, effectiveShare, actualFraction });
  });

  if (issues.length > 0) throw new ProgressCalculationError(issues);

  let weightedPlanned = 0n;
  let weightedActual = 0n;
  const activityMetrics: ActivityProgressMetric[] = [];
  for (const { activity, effectiveShare, actualFraction } of normalized.sort((left, right) => (
    compareText(left.activity.id, right.activity.id)
  ))) {
    const plannedFraction = plannedProgressFraction(activity, dataDate, calendar);
    const plannedContribution = divideAndRound(effectiveShare * plannedFraction, FRACTION_SCALE);
    const actualContribution = divideAndRound(effectiveShare * actualFraction, FRACTION_SCALE);
    weightedPlanned += plannedContribution;
    weightedActual += actualContribution;
    activityMetrics.push({
      activityId: activity.id,
      effectiveWeight: formatPercentFraction(effectiveShare),
      plannedProgress: formatPercentFraction(plannedFraction),
      actualProgress: formatPercentFraction(actualFraction),
      weightedPlannedContribution: formatPercentFraction(plannedContribution),
      weightedActualContribution: formatPercentFraction(actualContribution)
    });
  }

  return {
    formulaVersion: SPI_FORMULA_VERSION,
    dataDate,
    plannedProgress: formatPercentFraction(weightedPlanned),
    actualProgress: formatPercentFraction(weightedActual),
    spi: calculateSpiFromFractions(weightedActual, weightedPlanned),
    activityMetrics
  };
}

export function calculateSpi(actualProgress: string | number, plannedProgress: string | number): string | null {
  const actual = parseFixedDecimal(actualProgress, 4);
  const planned = parseFixedDecimal(plannedProgress, 4);
  if (actual < 0n || planned < 0n) throw new Error('progress values must not be negative');
  return planned === 0n
    ? null
    : formatFixedDecimal(divideAndRound(actual * 10_000n, planned), 4);
}

function calculateWbsShares(
  wbsNodes: readonly ProgressWbsNodeInput[],
  issues: ProgressCalculationIssue[]
): Map<string, bigint> {
  const nodeById = new Map<string, ProgressWbsNodeInput>();
  const weightById = new Map<string, bigint>();
  wbsNodes.forEach((node, index) => {
    if (node.id.length === 0 || nodeById.has(node.id)) {
      issues.push({
        code: node.id.length === 0 ? 'INVALID_WBS_ID' : 'DUPLICATE_WBS_ID',
        path: `wbsNodes[${index}].id`,
        message: node.id.length === 0 ? 'WBS id must not be empty' : `WBS ${node.id} is duplicated`
      });
      return;
    }
    nodeById.set(node.id, node);
    try {
      const weight = parseFixedDecimal(node.weight, 4);
      if (weight <= 0n || weight > WEIGHT_UNITS_AT_100_PERCENT) {
        throw new Error('weight must be greater than 0 and at most 100');
      }
      weightById.set(node.id, weight);
    } catch (error) {
      issues.push({
        code: 'INVALID_WBS_WEIGHT',
        path: `wbsNodes[${index}].weight`,
        message: error instanceof Error ? error.message : 'WBS weight is invalid'
      });
    }
  });

  const shares = new Map<string, bigint>();
  const active = new Set<string>();
  const shareFor = (id: string): bigint | null => {
    const cached = shares.get(id);
    if (cached !== undefined) return cached;
    if (active.has(id)) {
      issues.push({ code: 'WBS_CYCLE', path: 'wbsNodes', message: `WBS cycle includes ${id}` });
      return null;
    }
    const node = nodeById.get(id);
    const weight = weightById.get(id);
    if (!node || weight === undefined) return null;
    active.add(id);
    const parentId = node.parentWbsId ?? null;
    let parentShare = FRACTION_SCALE;
    if (parentId !== null) {
      if (!nodeById.has(parentId)) {
        issues.push({
          code: 'UNKNOWN_PARENT_WBS',
          path: `wbsNodes[${id}].parentWbsId`,
          message: `parent WBS ${parentId} does not exist`
        });
        active.delete(id);
        return null;
      }
      const resolved = shareFor(parentId);
      if (resolved === null) {
        active.delete(id);
        return null;
      }
      parentShare = resolved;
    }
    const share = divideAndRound(parentShare * weight, WEIGHT_UNITS_AT_100_PERCENT);
    shares.set(id, share);
    active.delete(id);
    return share;
  };

  for (const id of [...nodeById.keys()].sort(compareText)) shareFor(id);
  return shares;
}

function plannedProgressFraction(
  activity: ProgressActivityInput,
  dataDate: string,
  calendar: DayLevelCalendar
): bigint {
  if (dataDate < activity.plannedStart) return 0n;
  if (activity.durationWorkDays === 0) return FRACTION_SCALE;
  const finish = calendar.calculatePlannedFinish(activity.plannedStart, activity.durationWorkDays);
  if (dataDate >= finish) return FRACTION_SCALE;
  const elapsedWorkdays = calendar.countWorkdays(activity.plannedStart, dataDate);
  return divideAndRound(BigInt(elapsedWorkdays) * FRACTION_SCALE, BigInt(activity.durationWorkDays));
}

function calculateSpiFromFractions(actual: bigint, planned: bigint): string | null {
  return planned === 0n
    ? null
    : formatFixedDecimal(divideAndRound(actual * 10_000n, planned), 4);
}

function formatPercentFraction(fraction: bigint): string {
  const percentUnits = divideAndRound(fraction * 1_000_000n, FRACTION_SCALE);
  return formatFixedDecimal(percentUnits, 4);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
