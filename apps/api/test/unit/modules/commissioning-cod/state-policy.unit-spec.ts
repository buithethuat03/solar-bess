import {
  CodGateReviewDecision, CodGateStatus, CodPackageStatus, TestRunResult
} from 'src/database/entities';
import {
  COD_GATE_REVIEW_OUTCOME, COD_GATE_TRANSITIONS, COD_PACKAGE_TRANSITIONS,
  NON_TERMINAL_PACKAGE_STATUSES, RETESTABLE_RESULTS, canRetest, canTransition
} from 'src/modules/commissioning-cod/domain/state-policy';

describe('Commissioning & COD state policy — API-103/API-105', () => {
  it('allows a retest only after a FAILED or ABORTED result', () => {
    expect(RETESTABLE_RESULTS).toEqual([TestRunResult.FAILED, TestRunResult.ABORTED]);
    expect(canRetest(TestRunResult.FAILED)).toBe(true);
    expect(canRetest(TestRunResult.ABORTED)).toBe(true);
  });

  it.each([
    ['a passed run', TestRunResult.PASSED],
    ['an inconclusive run', TestRunResult.INCONCLUSIVE]
  ] as const)('refuses a retest of %s', (_label, result) => {
    expect(canRetest(result)).toBe(false);
  });

  it('refuses a retest of a run that has no result yet', () => {
    expect(canRetest(null)).toBe(false);
  });

  it('walks the gate machine: submit, decide, waive', () => {
    expect(canTransition(COD_GATE_TRANSITIONS, 'SUBMIT_EVIDENCE', CodGateStatus.PENDING)).toBe(true);
    expect(canTransition(COD_GATE_TRANSITIONS, 'SUBMIT_EVIDENCE', CodGateStatus.REJECTED))
      .toBe(true);
    expect(COD_GATE_TRANSITIONS.SUBMIT_EVIDENCE.to).toBe(CodGateStatus.UNDER_REVIEW);
    expect(canTransition(COD_GATE_TRANSITIONS, 'DECIDE_REVIEW', CodGateStatus.UNDER_REVIEW))
      .toBe(true);
    expect(canTransition(COD_GATE_TRANSITIONS, 'WAIVE', CodGateStatus.PENDING)).toBe(true);
    expect(COD_GATE_TRANSITIONS.WAIVE.to).toBe(CodGateStatus.WAIVED);
  });

  it.each([
    ['SUBMIT_EVIDENCE', CodGateStatus.UNDER_REVIEW],
    ['SUBMIT_EVIDENCE', CodGateStatus.ACCEPTED],
    ['SUBMIT_EVIDENCE', CodGateStatus.WAIVED],
    ['DECIDE_REVIEW', CodGateStatus.PENDING],
    ['DECIDE_REVIEW', CodGateStatus.ACCEPTED],
    ['DECIDE_REVIEW', CodGateStatus.WAIVED],
    ['WAIVE', CodGateStatus.ACCEPTED],
    ['WAIVE', CodGateStatus.WAIVED]
  ] as const)('refuses gate %s from %s', (command, from) => {
    expect(canTransition(COD_GATE_TRANSITIONS, command, from)).toBe(false);
  });

  it('accepts only on PASS; FAIL rejects and CONDITIONAL returns the gate to PENDING', () => {
    expect(COD_GATE_REVIEW_OUTCOME[CodGateReviewDecision.PASS]).toBe(CodGateStatus.ACCEPTED);
    expect(COD_GATE_REVIEW_OUTCOME[CodGateReviewDecision.FAIL]).toBe(CodGateStatus.REJECTED);
    expect(COD_GATE_REVIEW_OUTCOME[CodGateReviewDecision.CONDITIONAL])
      .toBe(CodGateStatus.PENDING);
  });

  it('signs only a submitted package and hands over only a signed one', () => {
    expect(canTransition(COD_PACKAGE_TRANSITIONS, 'SIGN_COD', CodPackageStatus.SUBMITTED))
      .toBe(true);
    expect(COD_PACKAGE_TRANSITIONS.SIGN_COD.to).toBe(CodPackageStatus.SIGNED);
    expect(canTransition(COD_PACKAGE_TRANSITIONS, 'ACCEPT_HANDOVER', CodPackageStatus.SIGNED))
      .toBe(true);
    expect(COD_PACKAGE_TRANSITIONS.ACCEPT_HANDOVER.to).toBe(CodPackageStatus.HANDED_OVER);
  });

  it.each([
    ['SIGN_COD', CodPackageStatus.DRAFT],
    ['SIGN_COD', CodPackageStatus.SIGNED],
    ['SIGN_COD', CodPackageStatus.HANDED_OVER],
    ['ACCEPT_HANDOVER', CodPackageStatus.SUBMITTED],
    ['ACCEPT_HANDOVER', CodPackageStatus.HANDED_OVER]
  ] as const)('refuses package %s from %s', (command, from) => {
    expect(canTransition(COD_PACKAGE_TRANSITIONS, command, from)).toBe(false);
  });

  it('keeps the non-terminal set aligned with the partial unique index', () => {
    expect(NON_TERMINAL_PACKAGE_STATUSES).toEqual([
      CodPackageStatus.DRAFT, CodPackageStatus.READY, CodPackageStatus.SUBMITTED
    ]);
    expect(NON_TERMINAL_PACKAGE_STATUSES).not.toContain(CodPackageStatus.SIGNED);
    expect(NON_TERMINAL_PACKAGE_STATUSES).not.toContain(CodPackageStatus.HANDED_OVER);
  });
});
