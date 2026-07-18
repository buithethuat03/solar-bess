import {
  evaluateRiskChangeAlerts, exposureLevel
} from '../../src/risk-change-alert.policy';

describe('Risk/Issue/Action/Change notification policy — TEST-015/194', () => {
  it('materializes the closed DB-105 mapping, canonical dates and server priorities', () => {
    const candidates = evaluateRiskChangeAlerts({
      risks: [
        {
          id: 'risk-inherent', packageId: null, reviewDate: '2026-07-17',
          inherentExposure: 20, inherentLevel: 'CRITICAL',
          residualExposure: null, residualLevel: null, status: 'MONITORING'
        },
        {
          id: 'risk-residual', packageId: 'package-a', reviewDate: '2026-07-18',
          inherentExposure: 25, inherentLevel: 'CRITICAL',
          residualExposure: 4, residualLevel: 'LOW', status: 'TREATING'
        }
      ],
      issues: [
        {
          id: 'issue-critical', packageId: 'package-a', targetDate: '2026-07-18',
          severity: 'CRITICAL', status: 'IN_PROGRESS'
        },
        {
          id: 'issue-medium', packageId: null, targetDate: '2026-07-17',
          severity: 'MEDIUM', status: 'REPORTED'
        }
      ],
      actions: [
        {
          id: 'action-overdue', packageId: 'package-a', dueDate: '2026-07-17',
          riskId: 'risk-residual', issueId: null, status: 'BLOCKED'
        },
        {
          id: 'action-due-today', packageId: 'package-a', dueDate: '2026-07-18',
          riskId: null, issueId: 'issue-critical', status: 'OPEN'
        }
      ],
      changes: [{
        id: 'change-pending', packageId: null, submittedDate: '2026-07-16',
        requesterId: 'requester', submittedBy: 'submitter', status: 'SUBMITTED'
      }]
    }, '2026-07-18');

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceType: 'Risk', sourceId: 'risk-inherent', alertType: 'RISK_REVIEW_DUE',
        priority: 'HIGH', dueAt: '2026-07-17'
      }),
      expect.objectContaining({
        sourceType: 'Risk', sourceId: 'risk-residual', alertType: 'RISK_REVIEW_DUE',
        priority: 'NORMAL', dueAt: '2026-07-18'
      }),
      expect.objectContaining({
        sourceType: 'Issue', sourceId: 'issue-critical', alertType: 'ISSUE_TARGET_DUE',
        priority: 'HIGH', dueAt: '2026-07-18'
      }),
      expect.objectContaining({
        sourceType: 'Issue', sourceId: 'issue-medium', alertType: 'ISSUE_TARGET_DUE',
        priority: 'NORMAL', dueAt: '2026-07-17'
      }),
      expect.objectContaining({
        sourceType: 'RiskIssueAction', sourceId: 'action-overdue',
        alertType: 'ACTION_OVERDUE', priority: 'HIGH', dueAt: '2026-07-17'
      }),
      expect.objectContaining({
        sourceType: 'ChangeRequest', sourceId: 'change-pending',
        alertType: 'CHANGE_DECISION_PENDING', priority: 'NORMAL',
        dueAt: '2026-07-16', excludedRecipientIds: ['requester', 'submitter']
      })
    ]));
    expect(candidates.map((candidate) => candidate.sourceId)).not.toContain('action-due-today');
  });

  it('resolves terminal, future and no-longer-pending sources', () => {
    const candidates = evaluateRiskChangeAlerts({
      risks: [{
        id: 'closed-risk', packageId: null, reviewDate: '2020-01-01',
        inherentExposure: 20, inherentLevel: 'CRITICAL', residualExposure: null,
        residualLevel: null, status: 'CLOSED'
      }, {
        id: 'future-risk', packageId: null, reviewDate: '2026-07-19',
        inherentExposure: 20, inherentLevel: 'CRITICAL', residualExposure: null,
        residualLevel: null, status: 'MONITORING'
      }],
      issues: [{
        id: 'resolved-issue', packageId: null, targetDate: '2020-01-01',
        severity: 'HIGH', status: 'RESOLVED'
      }],
      actions: [{
        id: 'done-action', packageId: null, riskId: 'closed-risk', issueId: null,
        dueDate: '2020-01-01', status: 'DONE'
      }],
      changes: [{
        id: 'approved-change', packageId: null, submittedDate: '2020-01-01',
        requesterId: 'requester', submittedBy: 'submitter', status: 'APPROVED'
      }]
    }, '2026-07-18');

    expect(candidates).toEqual([]);
  });

  it('classifies approved exposure boundaries and rejects invalid inputs', () => {
    expect([1, 7, 8, 14, 15, 19, 20, 25].map((value) => (
      exposureLevel(value, 15, 20)
    ))).toEqual(['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'CRITICAL', 'CRITICAL']);
    expect(() => exposureLevel(0, 15, 20)).toThrow('between 1 and 25');
    expect(() => exposureLevel(15, 20, 20)).toThrow('inconsistent');
  });

  it('rejects an overdue Action without exactly one committed parent', () => {
    const snapshot = {
      risks: [], issues: [], changes: [],
      actions: [{
        id: 'invalid-action', packageId: null, riskId: null, issueId: null,
        dueDate: '2026-07-17', status: 'OPEN'
      }]
    };
    expect(() => evaluateRiskChangeAlerts(snapshot, '2026-07-18')).toThrow(
      'exactly one committed parent'
    );
  });
});
