import {
  DayLevelCalendar,
  type DayLevelCalendarConfig,
  type CalendarValidationError
} from './calendar-calculator';
import {
  type DependencyActivityRef,
  type DependencyType,
  type DependencyValidationIssue,
  type DependencyValidationOptions,
  type ScheduleDependencyInput,
  validateDependencyGraph
} from './dependency-validator';

export const CPM_FORMULA_VERSION = 'CPM_WORKDAY_V1';

export type ScheduleActivityType = 'TASK' | 'MILESTONE';

export interface CriticalPathActivityInput extends DependencyActivityRef {
  activityType: ScheduleActivityType;
  plannedStart: string;
  /** Optional import assertion; it never overrides the server-calculated finish. */
  plannedFinish?: string;
  durationWorkDays: number;
}

export interface CriticalPathOptions extends DependencyValidationOptions {
  nearCriticalFloatDays?: number;
}

export interface CriticalPathMetric {
  activityId: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloatWorkDays: number;
  critical: boolean;
  nearCritical: boolean;
}

export interface CriticalPathResult {
  formulaVersion: typeof CPM_FORMULA_VERSION;
  projectStart: string | null;
  projectFinish: string | null;
  topologicalOrder: readonly string[];
  metricsByActivity: ReadonlyMap<string, CriticalPathMetric>;
}

export interface CriticalPathCalculationIssue {
  code: string;
  path: string;
  message: string;
}

export class CriticalPathValidationError extends Error {
  constructor(public readonly issues: readonly CriticalPathCalculationIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join('; '));
    this.name = 'CriticalPathValidationError';
  }
}

interface NumericMetric {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  span: number;
}

export function calculateCriticalPath(
  activities: readonly CriticalPathActivityInput[],
  dependencies: readonly ScheduleDependencyInput[],
  calendarConfig: DayLevelCalendarConfig,
  options: CriticalPathOptions = {}
): CriticalPathResult {
  const nearCriticalFloatDays = options.nearCriticalFloatDays ?? 5;
  if (!Number.isSafeInteger(nearCriticalFloatDays) || nearCriticalFloatDays < 0) {
    throw new CriticalPathValidationError([{
      code: 'INVALID_NEAR_CRITICAL_THRESHOLD',
      path: 'nearCriticalFloatDays',
      message: 'near-critical threshold must be a non-negative safe integer'
    }]);
  }

  const graph = validateDependencyGraph(activities, dependencies, options);
  const issues: CriticalPathCalculationIssue[] = graph.issues.map(copyDependencyIssue);
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
    throw new CriticalPathValidationError(issues);
  }

  const activityById = new Map<string, CriticalPathActivityInput>();
  activities.forEach((activity, index) => {
    if (!activityById.has(activity.id)) activityById.set(activity.id, activity);
    if (!Number.isSafeInteger(activity.durationWorkDays) || activity.durationWorkDays < 0) {
      issues.push({
        code: 'INVALID_DURATION_WORKDAYS',
        path: `activities[${index}].durationWorkDays`,
        message: 'durationWorkDays must be a non-negative safe integer'
      });
      return;
    }
    if (activity.activityType !== 'TASK' && activity.activityType !== 'MILESTONE') {
      issues.push({
        code: 'INVALID_ACTIVITY_TYPE',
        path: `activities[${index}].activityType`,
        message: 'activityType must be TASK or MILESTONE'
      });
    }
    if (activity.activityType === 'TASK' && activity.durationWorkDays < 1) {
      issues.push({
        code: 'TASK_DURATION_REQUIRED',
        path: `activities[${index}].durationWorkDays`,
        message: 'TASK duration must be at least one workday'
      });
    }
    if (activity.activityType === 'MILESTONE' && activity.durationWorkDays !== 0) {
      issues.push({
        code: 'MILESTONE_DURATION_MUST_BE_ZERO',
        path: `activities[${index}].durationWorkDays`,
        message: 'MILESTONE duration must be zero'
      });
    }
    try {
      const canonicalFinish = calendar.calculatePlannedFinish(activity.plannedStart, activity.durationWorkDays);
      if (activity.plannedFinish !== undefined && activity.plannedFinish !== canonicalFinish) {
        issues.push({
          code: 'PLANNED_FINISH_MISMATCH',
          path: `activities[${index}].plannedFinish`,
          message: `plannedFinish must equal canonical finish ${canonicalFinish}`
        });
      }
    } catch (error) {
      const calendarError = error as CalendarValidationError;
      issues.push({
        code: calendarError.code ?? 'INVALID_ACTIVITY_DATE',
        path: `activities[${index}].plannedStart`,
        message: calendarError.message
      });
    }
  });

  if (issues.length > 0) throw new CriticalPathValidationError(issues);
  if (activities.length === 0) {
    return {
      formulaVersion: CPM_FORMULA_VERSION,
      projectStart: null,
      projectFinish: null,
      topologicalOrder: [],
      metricsByActivity: new Map()
    };
  }

  const anchor = activities
    .map((activity) => activity.plannedStart)
    .sort(compareText)[0];
  const incoming = new Map<string, ScheduleDependencyInput[]>();
  const outgoing = new Map<string, ScheduleDependencyInput[]>();
  for (const activity of activities) {
    incoming.set(activity.id, []);
    outgoing.set(activity.id, []);
  }
  for (const dependency of dependencies) {
    incoming.get(dependency.successorId)?.push(dependency);
    outgoing.get(dependency.predecessorId)?.push(dependency);
  }
  for (const relations of [...incoming.values(), ...outgoing.values()]) {
    relations.sort(compareDependency);
  }

  const numeric = new Map<string, NumericMetric>();
  for (const activityId of graph.topologicalOrder) {
    const activity = activityById.get(activityId) as CriticalPathActivityInput;
    const span = activity.durationWorkDays === 0 ? 0 : activity.durationWorkDays - 1;
    let earlyStart = calendar.workdayDistance(anchor, activity.plannedStart);
    for (const dependency of incoming.get(activityId) ?? []) {
      const predecessor = numeric.get(dependency.predecessorId) as NumericMetric;
      earlyStart = Math.max(
        earlyStart,
        successorStartConstraint(predecessor, span, dependency.dependencyType, dependency.lagWorkDays)
      );
    }
    numeric.set(activityId, {
      earlyStart,
      earlyFinish: earlyStart + span,
      lateStart: 0,
      lateFinish: 0,
      span
    });
  }

  const projectFinishIndex = Math.max(...[...numeric.values()].map((metric) => metric.earlyFinish));
  for (const activityId of [...graph.topologicalOrder].reverse()) {
    const metric = numeric.get(activityId) as NumericMetric;
    let lateStart = projectFinishIndex - metric.span;
    for (const dependency of outgoing.get(activityId) ?? []) {
      const successor = numeric.get(dependency.successorId) as NumericMetric;
      lateStart = Math.min(
        lateStart,
        predecessorStartLimit(metric, successor, dependency.dependencyType, dependency.lagWorkDays)
      );
    }
    metric.lateStart = lateStart;
    metric.lateFinish = lateStart + metric.span;
  }

  const metricsByActivity = new Map<string, CriticalPathMetric>();
  for (const activityId of graph.topologicalOrder) {
    const metric = numeric.get(activityId) as NumericMetric;
    const totalFloatWorkDays = metric.lateStart - metric.earlyStart;
    metricsByActivity.set(activityId, {
      activityId,
      earlyStart: calendar.addWorkdays(anchor, metric.earlyStart),
      earlyFinish: calendar.addWorkdays(anchor, metric.earlyFinish),
      lateStart: calendar.addWorkdays(anchor, metric.lateStart),
      lateFinish: calendar.addWorkdays(anchor, metric.lateFinish),
      totalFloatWorkDays,
      critical: totalFloatWorkDays <= 0,
      nearCritical: totalFloatWorkDays > 0 && totalFloatWorkDays <= nearCriticalFloatDays
    });
  }

  return {
    formulaVersion: CPM_FORMULA_VERSION,
    projectStart: calendar.addWorkdays(anchor, Math.min(...[...numeric.values()].map((metric) => metric.earlyStart))),
    projectFinish: calendar.addWorkdays(anchor, projectFinishIndex),
    topologicalOrder: graph.topologicalOrder,
    metricsByActivity
  };
}

function successorStartConstraint(
  predecessor: NumericMetric,
  successorSpan: number,
  dependencyType: DependencyType,
  lagWorkDays: number
): number {
  switch (dependencyType) {
    case 'FS': return predecessor.earlyFinish + lagWorkDays + 1;
    case 'SS': return predecessor.earlyStart + lagWorkDays;
    case 'FF': return predecessor.earlyFinish + lagWorkDays - successorSpan;
    case 'SF': return predecessor.earlyStart + lagWorkDays - successorSpan;
  }
}

function predecessorStartLimit(
  predecessor: NumericMetric,
  successor: NumericMetric,
  dependencyType: DependencyType,
  lagWorkDays: number
): number {
  switch (dependencyType) {
    case 'FS': return successor.lateStart - predecessor.span - lagWorkDays - 1;
    case 'SS': return successor.lateStart - lagWorkDays;
    case 'FF': return successor.lateFinish - predecessor.span - lagWorkDays;
    case 'SF': return successor.lateFinish - lagWorkDays;
  }
}

function compareDependency(left: ScheduleDependencyInput, right: ScheduleDependencyInput): number {
  return compareText(left.predecessorId, right.predecessorId)
    || compareText(left.successorId, right.successorId)
    || compareText(left.dependencyType, right.dependencyType)
    || left.lagWorkDays - right.lagWorkDays;
}

function copyDependencyIssue(issue: DependencyValidationIssue): CriticalPathCalculationIssue {
  return { code: issue.code, path: issue.path, message: issue.message };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
