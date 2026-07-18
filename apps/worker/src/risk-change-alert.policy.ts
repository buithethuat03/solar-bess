import type {
  NotificationAlertType, NotificationSourceType
} from './notification-projection';

export type ExposureLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueSeverity = ExposureLevel;

export interface RiskAlertSource {
  id: string;
  packageId: string | null;
  reviewDate: string;
  inherentExposure: number;
  inherentLevel: ExposureLevel;
  residualExposure: number | null;
  residualLevel: ExposureLevel | null;
  status: string;
}

export interface IssueAlertSource {
  id: string;
  packageId: string | null;
  targetDate: string;
  severity: IssueSeverity;
  status: string;
}

export interface ActionAlertSource {
  id: string;
  packageId: string | null;
  riskId: string | null;
  issueId: string | null;
  dueDate: string;
  status: string;
}

export interface ChangeAlertSource {
  id: string;
  packageId: string | null;
  submittedDate: string | null;
  requesterId: string;
  submittedBy: string | null;
  status: string;
}

export interface RiskChangeAlertSnapshot {
  risks: readonly RiskAlertSource[];
  issues: readonly IssueAlertSource[];
  actions: readonly ActionAlertSource[];
  changes: readonly ChangeAlertSource[];
}

export interface RiskChangeAlertCandidate {
  sourceType: Exclude<NotificationSourceType, 'ScheduleActivity'>;
  sourceId: string;
  packageId: string | null;
  alertType: Exclude<NotificationAlertType, 'OVERDUE' | 'NEAR_CRITICAL'>;
  priority: 'NORMAL' | 'HIGH';
  dueAt: string;
  excludedRecipientIds: readonly string[];
  actionParentType: 'RISK' | 'ISSUE' | null;
}

const ACTIVE_RISK_STATUSES = new Set([
  'IDENTIFIED', 'ASSESSED', 'TREATING', 'MONITORING', 'CLOSURE_PENDING'
]);
const ACTIVE_ISSUE_STATUSES = new Set([
  'REPORTED', 'TRIAGED', 'IN_PROGRESS', 'REOPENED'
]);
const ACTIVE_ACTION_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED']);

export function exposureLevel(
  exposure: number,
  highThreshold: number,
  criticalThreshold: number
): ExposureLevel {
  if (!Number.isInteger(exposure) || exposure < 1 || exposure > 25) {
    throw new Error('Risk exposure must be an integer between 1 and 25');
  }
  if (highThreshold < 1 || criticalThreshold > 25 || highThreshold >= criticalThreshold) {
    throw new Error('Risk exposure thresholds are inconsistent');
  }
  if (exposure >= criticalThreshold) return 'CRITICAL';
  if (exposure >= highThreshold) return 'HIGH';
  return exposure >= 8 ? 'MEDIUM' : 'LOW';
}

export function evaluateRiskChangeAlerts(
  snapshot: RiskChangeAlertSnapshot,
  dataDate: string
): RiskChangeAlertCandidate[] {
  const candidates: RiskChangeAlertCandidate[] = [];
  for (const risk of snapshot.risks) {
    if (!ACTIVE_RISK_STATUSES.has(risk.status) || risk.reviewDate > dataDate) continue;
    const effectiveLevel = risk.residualLevel ?? risk.inherentLevel;
    candidates.push({
      sourceType: 'Risk',
      sourceId: risk.id,
      packageId: risk.packageId,
      alertType: 'RISK_REVIEW_DUE',
      priority: highPriority(effectiveLevel) ? 'HIGH' : 'NORMAL',
      dueAt: risk.reviewDate,
      excludedRecipientIds: [],
      actionParentType: null
    });
  }
  for (const issue of snapshot.issues) {
    if (!ACTIVE_ISSUE_STATUSES.has(issue.status) || issue.targetDate > dataDate) continue;
    candidates.push({
      sourceType: 'Issue',
      sourceId: issue.id,
      packageId: issue.packageId,
      alertType: 'ISSUE_TARGET_DUE',
      priority: highPriority(issue.severity) ? 'HIGH' : 'NORMAL',
      dueAt: issue.targetDate,
      excludedRecipientIds: [],
      actionParentType: null
    });
  }
  for (const action of snapshot.actions) {
    if (!ACTIVE_ACTION_STATUSES.has(action.status) || action.dueDate >= dataDate) continue;
    candidates.push({
      sourceType: 'RiskIssueAction',
      sourceId: action.id,
      packageId: action.packageId,
      alertType: 'ACTION_OVERDUE',
      priority: 'HIGH',
      dueAt: action.dueDate,
      excludedRecipientIds: [],
      actionParentType: actionParentType(action)
    });
  }
  for (const change of snapshot.changes) {
    if (change.status !== 'SUBMITTED' || !change.submittedDate) continue;
    candidates.push({
      sourceType: 'ChangeRequest',
      sourceId: change.id,
      packageId: change.packageId,
      alertType: 'CHANGE_DECISION_PENDING',
      priority: 'NORMAL',
      dueAt: change.submittedDate,
      excludedRecipientIds: [change.requesterId, change.submittedBy]
        .filter((value): value is string => value !== null),
      actionParentType: null
    });
  }
  return candidates.sort((left, right) => (
    left.dueAt.localeCompare(right.dueAt)
    || left.sourceType.localeCompare(right.sourceType)
    || left.sourceId.localeCompare(right.sourceId)
  ));
}

function highPriority(level: ExposureLevel): boolean {
  return level === 'HIGH' || level === 'CRITICAL';
}

function actionParentType(action: ActionAlertSource): 'RISK' | 'ISSUE' {
  const hasRisk = action.riskId !== null;
  const hasIssue = action.issueId !== null;
  if (hasRisk === hasIssue) {
    throw new Error('Risk/Issue Action must have exactly one committed parent');
  }
  return hasRisk ? 'RISK' : 'ISSUE';
}
