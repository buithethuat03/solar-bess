import { formatFixedDecimal, parseFixedDecimal } from './fixed-decimal';

const WEIGHT_SCALE = 4;
const ONE_HUNDRED_WEIGHT_UNITS = 1_000_000n;

export type WeightValidationMode = 'DRAFT' | 'SUBMIT';

export interface WeightedWbsNode {
  id: string;
  parentWbsId?: string | null;
  weight: string | number;
}

export interface WeightedActivity {
  id: string;
  wbsId: string;
  weight: string | number;
}

export interface WeightValidationIssue {
  code: string;
  path: string;
  message: string;
  actualTotal?: string;
  expectedTotal?: string;
}

export interface WeightValidationResult {
  valid: boolean;
  issues: readonly WeightValidationIssue[];
  /** Group keys use `ROOT` and `WBS:<id>`. */
  groupTotals: Readonly<Record<string, string>>;
}

export function validateScheduleWeights(
  wbsNodes: readonly WeightedWbsNode[],
  activities: readonly WeightedActivity[],
  mode: WeightValidationMode
): WeightValidationResult {
  const issues: WeightValidationIssue[] = [];
  const nodeById = new Map<string, WeightedWbsNode>();
  const nodeWeightById = new Map<string, bigint>();

  wbsNodes.forEach((node, index) => {
    if (node.id.length === 0) {
      issues.push(issue('INVALID_WBS_ID', `wbsNodes[${index}].id`, 'WBS id must not be empty'));
      return;
    }
    if (nodeById.has(node.id)) {
      issues.push(issue('DUPLICATE_WBS_ID', `wbsNodes[${index}].id`, `WBS ${node.id} is duplicated`));
      return;
    }
    nodeById.set(node.id, node);
    const units = parseWeight(node.weight, `wbsNodes[${index}].weight`, issues);
    if (units !== null) nodeWeightById.set(node.id, units);
  });

  const childrenByParent = new Map<string | null, string[]>();
  childrenByParent.set(null, []);
  wbsNodes.forEach((node, index) => {
    if (nodeById.get(node.id) !== node) return;
    const parentId = node.parentWbsId ?? null;
    if (parentId === node.id) {
      issues.push(issue('SELF_PARENT_WBS', `wbsNodes[${index}].parentWbsId`, 'WBS cannot be its own parent'));
      return;
    }
    if (parentId !== null && !nodeById.has(parentId)) {
      issues.push(issue(
        'UNKNOWN_PARENT_WBS',
        `wbsNodes[${index}].parentWbsId`,
        `parent WBS ${parentId} does not exist`
      ));
      return;
    }
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(node.id);
    childrenByParent.set(parentId, siblings);
    if (!childrenByParent.has(node.id)) childrenByParent.set(node.id, []);
  });
  for (const children of childrenByParent.values()) children.sort(compareText);

  const cycle = findWbsCycle(nodeById);
  if (cycle.length > 0) {
    issues.push(issue('WBS_CYCLE', 'wbsNodes', `WBS cycle detected: ${cycle.join(' -> ')}`));
  }

  if (mode === 'SUBMIT' && nodeById.size === 0) {
    issues.push(issue('EMPTY_WBS', 'wbsNodes', 'at least one root WBS is required for submit'));
  }

  const groupTotals = new Map<string, bigint>();
  for (const [parentId, childIds] of childrenByParent) {
    if (childIds.length === 0) continue;
    const total = childIds.reduce((sum, childId) => sum + (nodeWeightById.get(childId) ?? 0n), 0n);
    const key = parentId === null ? 'ROOT' : `WBS:${parentId}`;
    groupTotals.set(key, total);
    validateGroupTotal(total, mode, parentId === null ? 'wbsNodes' : `wbsNodes[${parentId}].children`, issues);
  }

  const activityIds = new Set<string>();
  const activityWeightsByWbs = new Map<string, bigint[]>();
  activities.forEach((activity, index) => {
    if (activity.id.length === 0) {
      issues.push(issue('INVALID_ACTIVITY_ID', `activities[${index}].id`, 'activity id must not be empty'));
      return;
    }
    if (activityIds.has(activity.id)) {
      issues.push(issue(
        'DUPLICATE_ACTIVITY_ID',
        `activities[${index}].id`,
        `activity ${activity.id} is duplicated`
      ));
      return;
    }
    activityIds.add(activity.id);
    if (!nodeById.has(activity.wbsId)) {
      issues.push(issue(
        'UNKNOWN_ACTIVITY_WBS',
        `activities[${index}].wbsId`,
        `activity WBS ${activity.wbsId} does not exist`
      ));
      return;
    }
    if ((childrenByParent.get(activity.wbsId)?.length ?? 0) > 0) {
      issues.push(issue(
        'ACTIVITY_REQUIRES_LEAF_WBS',
        `activities[${index}].wbsId`,
        `activity ${activity.id} must belong to a leaf WBS`
      ));
    }
    const units = parseWeight(activity.weight, `activities[${index}].weight`, issues);
    if (units !== null) {
      const weights = activityWeightsByWbs.get(activity.wbsId) ?? [];
      weights.push(units);
      activityWeightsByWbs.set(activity.wbsId, weights);
    }
  });

  const leafIds = [...nodeById.keys()]
    .filter((nodeId) => (childrenByParent.get(nodeId)?.length ?? 0) === 0)
    .sort(compareText);
  for (const leafId of leafIds) {
    const total = (activityWeightsByWbs.get(leafId) ?? []).reduce((sum, units) => sum + units, 0n);
    groupTotals.set(`ACTIVITIES:${leafId}`, total);
    validateGroupTotal(total, mode, `activities[wbsId=${leafId}]`, issues);
  }

  return {
    valid: issues.length === 0,
    issues,
    groupTotals: Object.fromEntries(
      [...groupTotals.entries()].map(([key, total]) => [key, formatFixedDecimal(total, WEIGHT_SCALE)])
    )
  };
}

/** Boolean facade for command DTOs where strict means Validate/Submit rules. */
export function validateWeights(
  wbsNodes: readonly WeightedWbsNode[],
  activities: readonly WeightedActivity[],
  strict: boolean
): WeightValidationResult {
  return validateScheduleWeights(wbsNodes, activities, strict ? 'SUBMIT' : 'DRAFT');
}

function parseWeight(
  value: string | number,
  path: string,
  issues: WeightValidationIssue[]
): bigint | null {
  try {
    const units = parseFixedDecimal(value, WEIGHT_SCALE);
    if (units <= 0n || units > ONE_HUNDRED_WEIGHT_UNITS) {
      issues.push(issue('WEIGHT_OUT_OF_RANGE', path, 'weight must be greater than 0 and at most 100'));
      return null;
    }
    return units;
  } catch (error) {
    issues.push(issue(
      'INVALID_WEIGHT',
      path,
      error instanceof Error ? error.message : 'weight has an invalid format'
    ));
    return null;
  }
}

function validateGroupTotal(
  total: bigint,
  mode: WeightValidationMode,
  path: string,
  issues: WeightValidationIssue[]
): void {
  if (mode === 'DRAFT' && total > ONE_HUNDRED_WEIGHT_UNITS) {
    issues.push({
      ...issue('WEIGHT_TOTAL_EXCEEDS_100', path, 'draft sibling weight total must not exceed 100'),
      actualTotal: formatFixedDecimal(total, WEIGHT_SCALE),
      expectedTotal: '100.0000'
    });
  }
  if (mode === 'SUBMIT' && total !== ONE_HUNDRED_WEIGHT_UNITS) {
    issues.push({
      ...issue('WEIGHT_TOTAL_MUST_EQUAL_100', path, 'submit sibling weight total must equal 100'),
      actualTotal: formatFixedDecimal(total, WEIGHT_SCALE),
      expectedTotal: '100.0000'
    });
  }
}

function findWbsCycle(nodeById: ReadonlyMap<string, WeightedWbsNode>): string[] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    visited.add(id);
    active.add(id);
    stack.push(id);
    const parentId = nodeById.get(id)?.parentWbsId ?? null;
    if (parentId !== null && nodeById.has(parentId)) {
      if (!visited.has(parentId)) {
        const cycle = visit(parentId);
        if (cycle) return cycle;
      } else if (active.has(parentId)) {
        return [...stack.slice(stack.indexOf(parentId)), parentId];
      }
    }
    stack.pop();
    active.delete(id);
    return null;
  };

  for (const id of [...nodeById.keys()].sort(compareText)) {
    if (!visited.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return [];
}

function issue(code: string, path: string, message: string): WeightValidationIssue {
  return { code, path, message };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
