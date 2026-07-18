export enum PackageStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export enum ProjectScheduleStatus {
  DRAFT = 'DRAFT',
  VALIDATED = 'VALIDATED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED'
}

export enum ScheduleSourceFormat {
  MANUAL = 'MANUAL',
  CANONICAL_CSV = 'CANONICAL_CSV',
  CANONICAL_JSON = 'CANONICAL_JSON'
}

export enum WbsNodeStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export enum ActivityType {
  TASK = 'TASK',
  MILESTONE = 'MILESTONE'
}

export enum ActivityStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  COMPLETE = 'COMPLETE',
  CANCELLED = 'CANCELLED'
}

export enum DependencyType {
  FS = 'FS',
  SS = 'SS',
  FF = 'FF',
  SF = 'SF'
}

export enum BaselineType {
  INITIAL = 'INITIAL',
  REBASELINE = 'REBASELINE'
}

export enum BaselineStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  APPROVED = 'APPROVED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum AlertType {
  OVERDUE = 'OVERDUE',
  NEAR_CRITICAL = 'NEAR_CRITICAL',
  RISK_REVIEW_DUE = 'RISK_REVIEW_DUE',
  ISSUE_TARGET_DUE = 'ISSUE_TARGET_DUE',
  ACTION_OVERDUE = 'ACTION_OVERDUE',
  CHANGE_DECISION_PENDING = 'CHANGE_DECISION_PENDING'
}

export enum NotificationSourceType {
  SCHEDULE_ACTIVITY = 'ScheduleActivity',
  RISK = 'Risk',
  ISSUE = 'Issue',
  RISK_ISSUE_ACTION = 'RiskIssueAction',
  CHANGE_REQUEST = 'ChangeRequest'
}

export enum NotificationPriority {
  NORMAL = 'NORMAL',
  HIGH = 'HIGH'
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ'
}
