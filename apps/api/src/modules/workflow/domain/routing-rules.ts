import {
  WorkflowApproverScope, WorkflowStepRule,
  type WorkflowRoutingRules, type WorkflowRoutingStep
} from '../../../database/entities';

export interface RoutingRuleIssue {
  code: string;
  path: string;
  message: string;
}

const stepKeyPattern = /^[A-Z0-9][A-Z0-9_.-]{1,79}$/;
const fieldPattern = /^[a-zA-Z][a-zA-Z0-9_.]{0,79}$/;
const operators = new Set(['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN']);

/**
 * AC-068 requires a definition to be validated before it can be published. This is deliberately a
 * pure function over the JSON: role codes, quorum sizes and SLA hours are tenant configuration, so
 * the validator proves the graph is well formed and never asserts particular business values.
 */
export function validateRoutingRules(value: unknown): RoutingRuleIssue[] {
  const issues: RoutingRuleIssue[] = [];
  if (!isRecord(value)) {
    return [{ code: 'RULES_NOT_OBJECT', path: 'routingRules', message: 'routingRules phải là object' }];
  }
  if (value.version !== 1) {
    issues.push({
      code: 'RULES_VERSION_UNSUPPORTED', path: 'routingRules.version',
      message: 'Chỉ hỗ trợ routingRules.version = 1'
    });
  }
  const steps = value.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    issues.push({
      code: 'STEPS_REQUIRED', path: 'routingRules.steps',
      message: 'Cần ít nhất một step'
    });
    return issues;
  }

  const seenKeys = new Set<string>();
  const seenOrders = new Set<number>();
  steps.forEach((raw, index) => {
    const path = `routingRules.steps[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ code: 'STEP_NOT_OBJECT', path, message: 'Step phải là object' });
      return;
    }
    const key = raw.key;
    if (typeof key !== 'string' || !stepKeyPattern.test(key)) {
      issues.push({ code: 'STEP_KEY_INVALID', path: `${path}.key`, message: 'Step key không hợp lệ' });
    } else if (seenKeys.has(key)) {
      issues.push({ code: 'STEP_KEY_DUPLICATE', path: `${path}.key`, message: `Step key trùng: ${key}` });
    } else {
      seenKeys.add(key);
    }

    const order = raw.order;
    if (!Number.isInteger(order) || (order as number) < 1) {
      issues.push({ code: 'STEP_ORDER_INVALID', path: `${path}.order`, message: 'order phải là số nguyên >= 1' });
    } else if (seenOrders.has(order as number) && typeof raw.parallelGroup !== 'string') {
      // Two steps may share an order only when they are explicitly a parallel group; otherwise the
      // engine would have no deterministic next step.
      issues.push({
        code: 'STEP_ORDER_AMBIGUOUS', path: `${path}.order`,
        message: 'order trùng nhau phải thuộc cùng parallelGroup'
      });
    } else {
      seenOrders.add(order as number);
    }

    if (!Object.values(WorkflowStepRule).includes(raw.rule as WorkflowStepRule)) {
      issues.push({ code: 'STEP_RULE_INVALID', path: `${path}.rule`, message: 'rule không hợp lệ' });
    }

    const selector = raw.approverSelector;
    if (!isRecord(selector)) {
      issues.push({
        code: 'SELECTOR_REQUIRED', path: `${path}.approverSelector`,
        message: 'Thiếu approverSelector'
      });
    } else {
      const roleCodes = selector.roleCodes;
      if (!isNonEmptyStringArray(roleCodes)) {
        issues.push({
          code: 'SELECTOR_ROLES_REQUIRED', path: `${path}.approverSelector.roleCodes`,
          message: 'Cần ít nhất một roleCode'
        });
      }
      if (!Object.values(WorkflowApproverScope).includes(selector.scope as WorkflowApproverScope)) {
        issues.push({
          code: 'SELECTOR_SCOPE_INVALID', path: `${path}.approverSelector.scope`,
          message: 'scope không hợp lệ'
        });
      }
    }

    // Without a fallback, a step whose selector resolves to nobody would strand the instance.
    if (!isNonEmptyStringArray(raw.fallbackRoleCodes)) {
      issues.push({
        code: 'FALLBACK_REQUIRED', path: `${path}.fallbackRoleCodes`,
        message: 'Cần fallbackRoleCodes để step không rơi vào ngõ cụt'
      });
    }

    if (raw.rule === WorkflowStepRule.QUORUM) {
      const quorum = raw.quorum;
      const approverCount = isRecord(selector) && isNonEmptyStringArray(selector.roleCodes)
        ? selector.roleCodes.length
        : 0;
      if (!Number.isInteger(quorum) || (quorum as number) < 1) {
        issues.push({ code: 'QUORUM_INVALID', path: `${path}.quorum`, message: 'QUORUM cần quorum >= 1' });
      } else if (approverCount > 0 && (quorum as number) > approverCount) {
        issues.push({
          code: 'QUORUM_UNREACHABLE', path: `${path}.quorum`,
          message: 'quorum lớn hơn số role có thể phê duyệt'
        });
      }
    } else if (raw.quorum !== undefined) {
      issues.push({
        code: 'QUORUM_NOT_APPLICABLE', path: `${path}.quorum`,
        message: 'quorum chỉ dùng cho rule QUORUM'
      });
    }

    if (raw.slaHours !== undefined && (!Number.isInteger(raw.slaHours) || (raw.slaHours as number) < 1)) {
      issues.push({ code: 'SLA_INVALID', path: `${path}.slaHours`, message: 'slaHours phải là số nguyên >= 1' });
    }
  });

  const conditions = value.conditions;
  if (!Array.isArray(conditions)) {
    issues.push({
      code: 'CONDITIONS_REQUIRED', path: 'routingRules.conditions',
      message: 'conditions phải là mảng (có thể rỗng)'
    });
  } else {
    conditions.forEach((raw, index) => {
      const path = `routingRules.conditions[${index}]`;
      if (!isRecord(raw)) {
        issues.push({ code: 'CONDITION_NOT_OBJECT', path, message: 'Condition phải là object' });
        return;
      }
      if (typeof raw.field !== 'string' || !fieldPattern.test(raw.field)) {
        issues.push({ code: 'CONDITION_FIELD_INVALID', path: `${path}.field`, message: 'field không hợp lệ' });
      }
      if (typeof raw.operator !== 'string' || !operators.has(raw.operator)) {
        issues.push({
          code: 'CONDITION_OPERATOR_INVALID', path: `${path}.operator`,
          message: `operator phải thuộc ${[...operators].join(', ')}`
        });
      }
      // A condition pointing at a step that does not exist would silently never fire.
      if (typeof raw.stepKey !== 'string' || !seenKeys.has(raw.stepKey)) {
        issues.push({
          code: 'CONDITION_STEP_UNKNOWN', path: `${path}.stepKey`,
          message: 'stepKey không tồn tại trong steps'
        });
      }
    });
  }

  return issues;
}

/**
 * Deterministic execution order: ascending `order`, then step key so a parallel group is still
 * stable across reads. Callers must only use this on rules that already validated cleanly.
 */
export function orderedSteps(rules: WorkflowRoutingRules): WorkflowRoutingStep[] {
  return [...rules.steps].sort((left, right) => left.order - right.order
    || left.key.localeCompare(right.key));
}

export function firstStepKey(rules: WorkflowRoutingRules): string | null {
  return orderedSteps(rules)[0]?.key ?? null;
}

export function nextStepKey(rules: WorkflowRoutingRules, currentKey: string): string | null {
  const ordered = orderedSteps(rules);
  const index = ordered.findIndex((step) => step.key === currentKey);
  if (index < 0) return null;
  return ordered[index + 1]?.key ?? null;
}

export function findStep(rules: WorkflowRoutingRules, key: string): WorkflowRoutingStep | null {
  return rules.steps.find((step) => step.key === key) ?? null;
}

/**
 * How many distinct approvals a step needs before it is satisfied. ALL and MANDATORY_ROLE are
 * single-decision gates in the MVP grammar; QUORUM carries its own count.
 */
export function requiredApprovals(step: WorkflowRoutingStep): number {
  return step.rule === WorkflowStepRule.QUORUM ? (step.quorum ?? 1) : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}
