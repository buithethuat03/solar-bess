export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export interface DependencyActivityRef {
  id: string;
  tenantId?: string;
  projectId?: string;
  scheduleId?: string;
}

export interface ScheduleDependencyInput {
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  lagWorkDays: number;
}

export interface DependencyScope {
  tenantId: string;
  projectId: string;
  scheduleId: string;
}

export interface DependencyValidationOptions {
  maxAbsoluteLagDays?: number;
  scope?: DependencyScope;
}

export interface DependencyValidationIssue {
  code: string;
  path: string;
  message: string;
  cycle?: readonly string[];
}

export interface DependencyValidationResult {
  valid: boolean;
  issues: readonly DependencyValidationIssue[];
  /** Lexicographically stable order; empty when a cycle exists. */
  topologicalOrder: readonly string[];
}

interface IndexedDependency {
  dependency: ScheduleDependencyInput;
  index: number;
}

export function validateDependencyGraph(
  activities: readonly (DependencyActivityRef | string)[],
  dependencies: readonly ScheduleDependencyInput[],
  options: DependencyValidationOptions = {}
): DependencyValidationResult {
  const maxAbsoluteLagDays = options.maxAbsoluteLagDays ?? 3650;
  if (!Number.isSafeInteger(maxAbsoluteLagDays) || maxAbsoluteLagDays < 0) {
    throw new Error('maxAbsoluteLagDays must be a non-negative safe integer');
  }

  const issues: DependencyValidationIssue[] = [];
  const activityById = new Map<string, DependencyActivityRef>();
  activities.forEach((activity, index) => {
    const normalized = typeof activity === 'string' ? { id: activity } : activity;
    if (normalized.id.length === 0) {
      issues.push({
        code: 'INVALID_ACTIVITY_ID',
        path: `activities[${index}].id`,
        message: 'activity id must not be empty'
      });
      return;
    }
    if (activityById.has(normalized.id)) {
      issues.push({
        code: 'DUPLICATE_ACTIVITY_ID',
        path: `activities[${index}].id`,
        message: `activity ${normalized.id} is duplicated`
      });
      return;
    }
    activityById.set(normalized.id, normalized);
    if (options.scope && !matchesScope(normalized, options.scope)) {
      issues.push({
        code: 'ACTIVITY_SCOPE_MISMATCH',
        path: `activities[${index}]`,
        message: `activity ${normalized.id} is outside the expected tenant/project/schedule scope`
      });
    }
  });

  const usableDependencies: IndexedDependency[] = [];
  const relationKeys = new Set<string>();
  dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    let usable = true;
    if (!activityById.has(dependency.predecessorId)) {
      issues.push({
        code: 'UNKNOWN_PREDECESSOR',
        path: `${path}.predecessorId`,
        message: `predecessor ${dependency.predecessorId} does not belong to this schedule`
      });
      usable = false;
    }
    if (!activityById.has(dependency.successorId)) {
      issues.push({
        code: 'UNKNOWN_SUCCESSOR',
        path: `${path}.successorId`,
        message: `successor ${dependency.successorId} does not belong to this schedule`
      });
      usable = false;
    }
    if (dependency.predecessorId === dependency.successorId) {
      issues.push({
        code: 'SELF_DEPENDENCY',
        path,
        message: 'an activity cannot depend on itself'
      });
      usable = false;
    }
    if (!isDependencyType(dependency.dependencyType)) {
      issues.push({
        code: 'INVALID_DEPENDENCY_TYPE',
        path: `${path}.dependencyType`,
        message: 'dependency type must be FS, SS, FF or SF'
      });
      usable = false;
    }
    if (!Number.isSafeInteger(dependency.lagWorkDays)) {
      issues.push({
        code: 'INVALID_LAG_WORKDAYS',
        path: `${path}.lagWorkDays`,
        message: 'lagWorkDays must be a safe integer'
      });
      usable = false;
    } else if (Math.abs(dependency.lagWorkDays) > maxAbsoluteLagDays) {
      issues.push({
        code: 'LAG_OUT_OF_RANGE',
        path: `${path}.lagWorkDays`,
        message: `absolute lag must not exceed ${maxAbsoluteLagDays} workdays`
      });
      usable = false;
    }

    const relationKey = [
      dependency.predecessorId,
      dependency.successorId,
      dependency.dependencyType
    ].join('\u0000');
    if (relationKeys.has(relationKey)) {
      issues.push({
        code: 'DUPLICATE_DEPENDENCY',
        path,
        message: 'the predecessor/successor/type relationship is duplicated'
      });
      usable = false;
    } else {
      relationKeys.add(relationKey);
    }

    if (usable) usableDependencies.push({ dependency, index });
  });

  const adjacency = createAdjacency(activityById.keys(), usableDependencies);
  const topologicalOrder = stableTopologicalOrder(activityById.keys(), adjacency);
  if (topologicalOrder.length !== activityById.size) {
    const cycle = findStableCycle(activityById.keys(), adjacency);
    issues.push({
      code: 'DEPENDENCY_CYCLE',
      path: 'dependencies',
      message: cycle.length > 0
        ? `dependency cycle detected: ${cycle.join(' -> ')}`
        : 'dependency cycle detected',
      cycle
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    topologicalOrder: topologicalOrder.length === activityById.size ? topologicalOrder : []
  };
}

function isDependencyType(value: string): value is DependencyType {
  return (DEPENDENCY_TYPES as readonly string[]).includes(value);
}

function matchesScope(activity: DependencyActivityRef, scope: DependencyScope): boolean {
  return (activity.tenantId === undefined || activity.tenantId === scope.tenantId)
    && (activity.projectId === undefined || activity.projectId === scope.projectId)
    && (activity.scheduleId === undefined || activity.scheduleId === scope.scheduleId);
}

function createAdjacency(
  activityIds: Iterable<string>,
  dependencies: readonly IndexedDependency[]
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const id of activityIds) adjacency.set(id, []);
  for (const { dependency } of dependencies) {
    adjacency.get(dependency.predecessorId)?.push(dependency.successorId);
  }
  for (const successors of adjacency.values()) {
    successors.sort(compareText);
  }
  return adjacency;
}

function stableTopologicalOrder(
  activityIds: Iterable<string>,
  adjacency: ReadonlyMap<string, readonly string[]>
): string[] {
  const ids = [...activityIds].sort(compareText);
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const successors of adjacency.values()) {
    for (const successor of successors) indegree.set(successor, (indegree.get(successor) ?? 0) + 1);
  }

  const ready = ids.filter((id) => indegree.get(id) === 0);
  const result: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift() as string;
    result.push(current);
    for (const successor of adjacency.get(current) ?? []) {
      const nextIndegree = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, nextIndegree);
      if (nextIndegree === 0) insertSorted(ready, successor);
    }
  }
  return result;
}

function insertSorted(values: string[], value: string): void {
  let index = 0;
  while (index < values.length && compareText(values[index], value) < 0) index += 1;
  values.splice(index, 0, value);
}

function findStableCycle(
  activityIds: Iterable<string>,
  adjacency: ReadonlyMap<string, readonly string[]>
): string[] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const successor of adjacency.get(id) ?? []) {
      if (!visited.has(successor)) {
        const cycle = visit(successor);
        if (cycle) return cycle;
      } else if (active.has(successor)) {
        const cycleStart = stack.indexOf(successor);
        return [...stack.slice(cycleStart), successor];
      }
    }
    stack.pop();
    active.delete(id);
    return null;
  };

  for (const id of [...activityIds].sort(compareText)) {
    if (!visited.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return [];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
