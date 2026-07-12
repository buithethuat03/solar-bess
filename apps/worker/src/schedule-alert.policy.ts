export interface ScheduleCalendarSnapshot {
  workingWeek: readonly number[];
  exceptions: readonly { date: string; working: boolean }[];
}

export interface ScheduleAlertActivity {
  id: string;
  plannedStart: string;
  plannedFinish: string;
  durationWorkDays: number;
  percentComplete: string | number;
  status: string;
}

export interface ScheduleAlertDependency {
  predecessorId: string;
  successorId: string;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagWorkDays: number;
}

export interface ScheduleAlertCandidate {
  activityId: string;
  alertType: 'OVERDUE' | 'NEAR_CRITICAL';
  priority: 'HIGH' | 'NORMAL';
  dueAt: string;
  totalFloatWorkDays: number | null;
}

interface NumericMetric {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  span: number;
}

export function evaluateScheduleAlerts(
  activities: readonly ScheduleAlertActivity[],
  dependencies: readonly ScheduleAlertDependency[],
  calendar: ScheduleCalendarSnapshot,
  dataDate: string,
  nearCriticalFloatDays: number
): ScheduleAlertCandidate[] {
  const active = activities.filter((activity) => activity.status !== 'CANCELLED');
  if (active.length === 0) return [];
  const activityById = new Map(active.map((activity) => [activity.id, activity]));
  const usableDependencies = dependencies.filter((dependency) => (
    activityById.has(dependency.predecessorId) && activityById.has(dependency.successorId)
  ));
  if (usableDependencies.some((dependency) => dependency.predecessorId === dependency.successorId)) {
    throw new Error('Schedule alert scan rejected a self dependency');
  }
  const order = topologicalOrder(active.map((activity) => activity.id), usableDependencies);
  if (order.length !== active.length) throw new Error('Schedule alert scan rejected a dependency cycle');
  const workdays = new WorkdayIndex(calendar);
  const anchor = [...active].map((activity) => activity.plannedStart).sort()[0];
  const incoming = new Map<string, ScheduleAlertDependency[]>();
  const outgoing = new Map<string, ScheduleAlertDependency[]>();
  for (const activity of active) {
    incoming.set(activity.id, []);
    outgoing.set(activity.id, []);
  }
  for (const dependency of usableDependencies) {
    incoming.get(dependency.successorId)?.push(dependency);
    outgoing.get(dependency.predecessorId)?.push(dependency);
  }
  const numeric = new Map<string, NumericMetric>();
  for (const activityId of order) {
    const activity = activityById.get(activityId)!;
    const span = activity.durationWorkDays === 0 ? 0 : activity.durationWorkDays - 1;
    let earlyStart = workdays.distance(anchor, activity.plannedStart);
    for (const dependency of incoming.get(activityId) ?? []) {
      const predecessor = numeric.get(dependency.predecessorId)!;
      earlyStart = Math.max(earlyStart, successorConstraint(
        predecessor, span, dependency.dependencyType, dependency.lagWorkDays
      ));
    }
    numeric.set(activityId, {
      earlyStart, earlyFinish: earlyStart + span, lateStart: 0, lateFinish: 0, span
    });
  }
  const projectFinish = Math.max(...[...numeric.values()].map((metric) => metric.earlyFinish));
  for (const activityId of [...order].reverse()) {
    const metric = numeric.get(activityId)!;
    let lateStart = projectFinish - metric.span;
    for (const dependency of outgoing.get(activityId) ?? []) {
      lateStart = Math.min(lateStart, predecessorLimit(
        metric, numeric.get(dependency.successorId)!, dependency.dependencyType,
        dependency.lagWorkDays
      ));
    }
    metric.lateStart = lateStart;
    metric.lateFinish = lateStart + metric.span;
  }
  const result: ScheduleAlertCandidate[] = [];
  for (const activity of active) {
    if (Number(activity.percentComplete) >= 100 || activity.status === 'COMPLETE') continue;
    const metric = numeric.get(activity.id)!;
    const totalFloatWorkDays = metric.lateStart - metric.earlyStart;
    if (activity.plannedFinish < dataDate) {
      result.push({
        activityId: activity.id, alertType: 'OVERDUE', priority: 'HIGH',
        dueAt: activity.plannedFinish, totalFloatWorkDays
      });
    }
    if (totalFloatWorkDays > 0 && totalFloatWorkDays <= nearCriticalFloatDays) {
      result.push({
        activityId: activity.id, alertType: 'NEAR_CRITICAL', priority: 'NORMAL',
        dueAt: activity.plannedFinish, totalFloatWorkDays
      });
    }
  }
  return result.sort((left, right) => (
    left.dueAt.localeCompare(right.dueAt)
    || left.activityId.localeCompare(right.activityId)
    || left.alertType.localeCompare(right.alertType)
  ));
}

function topologicalOrder(
  activityIds: readonly string[], dependencies: readonly ScheduleAlertDependency[]
): string[] {
  const adjacency = new Map(activityIds.map((id) => [id, [] as string[]]));
  const indegree = new Map(activityIds.map((id) => [id, 0]));
  for (const dependency of dependencies) {
    adjacency.get(dependency.predecessorId)?.push(dependency.successorId);
    indegree.set(dependency.successorId, (indegree.get(dependency.successorId) ?? 0) + 1);
  }
  const ready = activityIds.filter((id) => indegree.get(id) === 0).sort();
  const result: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(id);
    for (const successor of (adjacency.get(id) ?? []).sort()) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        ready.push(successor);
        ready.sort();
      }
    }
  }
  return result;
}

function successorConstraint(
  predecessor: NumericMetric, successorSpan: number,
  type: ScheduleAlertDependency['dependencyType'], lag: number
): number {
  switch (type) {
    case 'FS': return predecessor.earlyFinish + lag + 1;
    case 'SS': return predecessor.earlyStart + lag;
    case 'FF': return predecessor.earlyFinish + lag - successorSpan;
    case 'SF': return predecessor.earlyStart + lag - successorSpan;
  }
}

function predecessorLimit(
  predecessor: NumericMetric, successor: NumericMetric,
  type: ScheduleAlertDependency['dependencyType'], lag: number
): number {
  switch (type) {
    case 'FS': return successor.lateStart - predecessor.span - lag - 1;
    case 'SS': return successor.lateStart - lag;
    case 'FF': return successor.lateFinish - predecessor.span - lag;
    case 'SF': return successor.lateFinish - lag;
  }
}

class WorkdayIndex {
  private readonly week: ReadonlySet<number>;
  private readonly exceptions: ReadonlyMap<string, boolean>;

  constructor(calendar: ScheduleCalendarSnapshot) {
    this.week = new Set(calendar.workingWeek);
    this.exceptions = new Map(calendar.exceptions.map((entry) => [entry.date, entry.working]));
  }

  distance(from: string, to: string): number {
    if (from === to) return 0;
    const direction = from < to ? 1 : -1;
    let cursor = from;
    let result = 0;
    let guard = 0;
    while (cursor !== to) {
      cursor = addCivilDay(cursor, direction);
      if (this.isWorking(cursor)) result += direction;
      guard += 1;
      if (guard > 3_660_000) throw new Error('Schedule alert calendar range exceeded');
    }
    return result;
  }

  private isWorking(date: string): boolean {
    const exception = this.exceptions.get(date);
    if (exception !== undefined) return exception;
    const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return this.week.has(day === 0 ? 7 : day);
  }
}

function addCivilDay(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
