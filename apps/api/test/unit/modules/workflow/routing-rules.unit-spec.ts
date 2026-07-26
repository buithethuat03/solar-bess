import {
  findStep, firstStepKey, nextStepKey, orderedSteps, requiredApprovals, validateRoutingRules
} from 'src/modules/workflow/domain/routing-rules';
import type { WorkflowRoutingRules } from 'src/database/entities';

function step(overrides: Record<string, unknown> = {}) {
  return {
    key: 'REVIEW', order: 1, rule: 'ALL',
    approverSelector: { roleCodes: ['PMO'], scope: 'PROJECT' },
    fallbackRoleCodes: ['TENANT_ADMIN'],
    ...overrides
  };
}

function rules(overrides: Record<string, unknown> = {}) {
  return { version: 1, steps: [step()], conditions: [], ...overrides };
}

function codes(value: unknown): string[] {
  return validateRoutingRules(value).map((issue) => issue.code);
}

describe('Workflow routing rules — AC-068', () => {
  it('accepts a well formed single-step route', () => {
    expect(validateRoutingRules(rules())).toEqual([]);
  });

  it('rejects a non-object or unsupported grammar version', () => {
    expect(codes('nope')).toEqual(['RULES_NOT_OBJECT']);
    expect(codes(rules({ version: 2 }))).toContain('RULES_VERSION_UNSUPPORTED');
  });

  it('requires at least one step', () => {
    expect(codes(rules({ steps: [] }))).toEqual(['STEPS_REQUIRED']);
  });

  it('rejects duplicate step keys', () => {
    expect(codes(rules({ steps: [step(), step({ order: 2 })] })))
      .toContain('STEP_KEY_DUPLICATE');
  });

  it('rejects a malformed step key', () => {
    expect(codes(rules({ steps: [step({ key: 'lower case' })] }))).toContain('STEP_KEY_INVALID');
  });

  it('rejects two steps sharing an order unless they declare a parallel group', () => {
    expect(codes(rules({ steps: [step(), step({ key: 'SECOND' })] })))
      .toContain('STEP_ORDER_AMBIGUOUS');
    expect(validateRoutingRules(rules({
      steps: [step({ parallelGroup: 'G1' }), step({ key: 'SECOND', parallelGroup: 'G1' })]
    }))).toEqual([]);
  });

  it('requires an approver selector with at least one role and a valid scope', () => {
    expect(codes(rules({ steps: [step({ approverSelector: undefined })] })))
      .toContain('SELECTOR_REQUIRED');
    expect(codes(rules({ steps: [step({ approverSelector: { roleCodes: [], scope: 'PROJECT' } })] })))
      .toContain('SELECTOR_ROLES_REQUIRED');
    expect(codes(rules({ steps: [step({ approverSelector: { roleCodes: ['PMO'], scope: 'SITE' } })] })))
      .toContain('SELECTOR_SCOPE_INVALID');
  });

  it('requires a fallback so a step cannot dead-end when nobody matches', () => {
    expect(codes(rules({ steps: [step({ fallbackRoleCodes: [] })] })))
      .toContain('FALLBACK_REQUIRED');
  });

  it('validates quorum only where it applies and never beyond the approver count', () => {
    expect(codes(rules({ steps: [step({ rule: 'QUORUM' })] }))).toContain('QUORUM_INVALID');
    expect(codes(rules({
      steps: [step({ rule: 'QUORUM', quorum: 3, approverSelector: { roleCodes: ['PMO', 'EXECUTIVE'], scope: 'PROJECT' } })]
    }))).toContain('QUORUM_UNREACHABLE');
    expect(codes(rules({ steps: [step({ quorum: 2 })] }))).toContain('QUORUM_NOT_APPLICABLE');
    expect(validateRoutingRules(rules({
      steps: [step({ rule: 'QUORUM', quorum: 2, approverSelector: { roleCodes: ['PMO', 'EXECUTIVE'], scope: 'PROJECT' } })]
    }))).toEqual([]);
  });

  it('rejects a condition pointing at a step that does not exist', () => {
    expect(codes(rules({
      conditions: [{ field: 'cost.amount', operator: 'GT', value: 1, stepKey: 'MISSING' }]
    }))).toContain('CONDITION_STEP_UNKNOWN');
    expect(codes(rules({
      conditions: [{ field: 'cost.amount', operator: 'BETWEEN', value: 1, stepKey: 'REVIEW' }]
    }))).toContain('CONDITION_OPERATOR_INVALID');
  });

  it('rejects a non-positive SLA', () => {
    expect(codes(rules({ steps: [step({ slaHours: 0 })] }))).toContain('SLA_INVALID');
  });

  it('orders steps deterministically and walks them in order', () => {
    const route = {
      version: 1,
      steps: [
        step({ key: 'THIRD', order: 3 }),
        step({ key: 'FIRST', order: 1 }),
        step({ key: 'SECOND', order: 2 })
      ],
      conditions: []
    } as unknown as WorkflowRoutingRules;
    expect(orderedSteps(route).map((item) => item.key)).toEqual(['FIRST', 'SECOND', 'THIRD']);
    expect(firstStepKey(route)).toBe('FIRST');
    expect(nextStepKey(route, 'FIRST')).toBe('SECOND');
    expect(nextStepKey(route, 'THIRD')).toBeNull();
    expect(nextStepKey(route, 'UNKNOWN')).toBeNull();
    expect(findStep(route, 'SECOND')?.order).toBe(2);
    expect(findStep(route, 'UNKNOWN')).toBeNull();
  });

  it('derives how many approvals each rule needs', () => {
    expect(requiredApprovals(step() as never)).toBe(1);
    expect(requiredApprovals(step({ rule: 'MANDATORY_ROLE' }) as never)).toBe(1);
    expect(requiredApprovals(step({ rule: 'QUORUM', quorum: 3 }) as never)).toBe(3);
  });
});
