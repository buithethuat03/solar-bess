import type { WorkerConfig } from '../../src/config';
import type { DomainEventJob } from '../../src/domain-event';
import {
  RiskChangeAlertProcessor, riskChangeObjectLink
} from '../../src/risk-change-alert.processor';
import type { WorkerLogger } from '../../src/worker-logger';

const canonical: ReadonlyArray<[string, string]> = [
  ['Risk', 'RiskCreated'],
  ['Risk', 'RiskChanged'],
  ['Risk', 'RiskClosureRequested'],
  ['Risk', 'RiskClosureDecided'],
  ['Issue', 'IssueCreated'],
  ['Issue', 'IssueChanged'],
  ['Issue', 'IssueClosureRequested'],
  ['Issue', 'IssueClosureDecided'],
  ['RiskIssueAction', 'RiskIssueActionCreated'],
  ['RiskIssueAction', 'RiskIssueActionChanged'],
  ['RiskIssueAction', 'RiskIssueActionCompleted'],
  ['RiskIssueAction', 'RiskIssueActionVerified'],
  ['RiskIssueAction', 'RiskIssueActionCancelled'],
  ['ChangeRequest', 'ChangeRequestCreated'],
  ['ChangeRequest', 'ChangeRequestChanged'],
  ['ChangeRequest', 'ChangeRequestSubmitted'],
  ['ChangeRequest', 'ChangeRequestDecided']
];

describe('RiskChangeAlertProcessor committed event contract — TEST-015/194', () => {
  const processor = new RiskChangeAlertProcessor(
    {} as WorkerConfig,
    { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as WorkerLogger
  );

  it.each(canonical)('supports %s/%s', (aggregateType, eventType) => {
    expect(processor.supports(event(aggregateType, eventType))).toBe(true);
  });

  it.each([
    ['Risk', 'IssueChanged'],
    ['Issue', 'RiskChanged'],
    ['ProjectSchedule', 'RiskChanged'],
    ['Risk', 'RISK_CHANGED'],
    ['Risk', 'UnknownEvent']
  ])('rejects non-canonical pair %s/%s', (aggregateType, eventType) => {
    expect(processor.supports(event(aggregateType, eventType))).toBe(false);
  });

  it.each([
    ['Risk', 'risk-id', null, '/projects/project-id/risk-change?tab=risks&riskId=risk-id'],
    ['Issue', 'issue-id', null, '/projects/project-id/risk-change?tab=issues&issueId=issue-id'],
    ['RiskIssueAction', 'risk-action-id', 'RISK', '/projects/project-id/risk-change?tab=risks&actionId=risk-action-id'],
    ['RiskIssueAction', 'issue-action-id', 'ISSUE', '/projects/project-id/risk-change?tab=issues&actionId=issue-action-id'],
    ['ChangeRequest', 'change-id', null, '/projects/project-id/risk-change?tab=changes&changeRequestId=change-id']
  ] as const)(
    'builds the frontend canonical deep-link for %s',
    (sourceType, sourceId, actionParentType, expected) => {
      expect(riskChangeObjectLink('project-id', {
        sourceType, sourceId, actionParentType
      })).toBe(expected);
    }
  );

  it('fails closed when an Action deep-link has no committed parent type', () => {
    expect(() => riskChangeObjectLink('project-id', {
      sourceType: 'RiskIssueAction', sourceId: 'action-id', actionParentType: null
    })).toThrow('requires its committed parent type');
  });
});

function event(aggregateType: string, eventType: string): DomainEventJob {
  return {
    eventId: '10000000-0000-4000-8000-000000000001',
    tenantId: '20000000-0000-4000-8000-000000000001',
    actorId: '30000000-0000-4000-8000-000000000001',
    eventKey: 'risk-change:test',
    aggregateType,
    aggregateId: '40000000-0000-4000-8000-000000000001',
    aggregateVersion: 1,
    eventType,
    schemaVersion: 1,
    payload: { projectId: '50000000-0000-4000-8000-000000000001' },
    occurredAt: '2026-07-18T00:00:00.000Z',
    correlationId: '60000000-0000-4000-8000-000000000001'
  };
}
