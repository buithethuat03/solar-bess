import {
  ChangeRequestStatus, IssueStatus, RiskIssueActionStatus, RiskStatus
} from '../../../database/entities';

const riskTransitions = new Map<RiskStatus, ReadonlySet<RiskStatus>>([
  [RiskStatus.IDENTIFIED, new Set([RiskStatus.ASSESSED, RiskStatus.OCCURRED])],
  [RiskStatus.ASSESSED, new Set([RiskStatus.TREATING, RiskStatus.OCCURRED])],
  [RiskStatus.TREATING, new Set([RiskStatus.MONITORING, RiskStatus.OCCURRED])],
  [RiskStatus.MONITORING, new Set([RiskStatus.CLOSURE_PENDING, RiskStatus.OCCURRED])],
  [RiskStatus.CLOSURE_PENDING, new Set()],
  [RiskStatus.CLOSED, new Set([RiskStatus.MONITORING])],
  [RiskStatus.OCCURRED, new Set()]
]);

const issueTransitions = new Map<IssueStatus, ReadonlySet<IssueStatus>>([
  [IssueStatus.REPORTED, new Set([IssueStatus.TRIAGED])],
  [IssueStatus.TRIAGED, new Set([IssueStatus.IN_PROGRESS])],
  [IssueStatus.IN_PROGRESS, new Set([IssueStatus.RESOLVED])],
  [IssueStatus.RESOLVED, new Set([IssueStatus.CLOSURE_PENDING])],
  [IssueStatus.CLOSURE_PENDING, new Set()],
  [IssueStatus.CLOSED, new Set([IssueStatus.REOPENED])],
  [IssueStatus.REOPENED, new Set([IssueStatus.IN_PROGRESS])]
]);

const changeTransitions = new Map<ChangeRequestStatus, ReadonlySet<ChangeRequestStatus>>([
  [ChangeRequestStatus.DRAFT, new Set([ChangeRequestStatus.ASSESSED])],
  [ChangeRequestStatus.ASSESSED, new Set([ChangeRequestStatus.DRAFT, ChangeRequestStatus.SUBMITTED])],
  [ChangeRequestStatus.SUBMITTED, new Set([
    ChangeRequestStatus.APPROVED, ChangeRequestStatus.RETURNED, ChangeRequestStatus.REJECTED
  ])],
  [ChangeRequestStatus.RETURNED, new Set([ChangeRequestStatus.ASSESSED])],
  [ChangeRequestStatus.APPROVED, new Set([ChangeRequestStatus.IMPLEMENTED])],
  [ChangeRequestStatus.IMPLEMENTED, new Set([ChangeRequestStatus.CLOSED])],
  [ChangeRequestStatus.REJECTED, new Set()],
  [ChangeRequestStatus.CLOSED, new Set()]
]);

export function canRiskTransition(from: RiskStatus, to: RiskStatus): boolean {
  return from === to || riskTransitions.get(from)?.has(to) === true;
}

export function canIssueTransition(from: IssueStatus, to: IssueStatus): boolean {
  return from === to || issueTransitions.get(from)?.has(to) === true;
}

export function canChangeTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return from === to || changeTransitions.get(from)?.has(to) === true;
}

export function actionCommandKind(status: RiskIssueActionStatus | undefined):
'FIELDS' | 'COMPLETE' | 'VERIFY' | 'CANCEL' {
  if (status === RiskIssueActionStatus.DONE) return 'COMPLETE';
  if (status === RiskIssueActionStatus.VERIFIED) return 'VERIFY';
  if (status === RiskIssueActionStatus.CANCELLED) return 'CANCEL';
  return 'FIELDS';
}
