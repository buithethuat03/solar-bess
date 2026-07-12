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
  NEAR_CRITICAL = 'NEAR_CRITICAL'
}

export enum NotificationPriority {
  NORMAL = 'NORMAL',
  HIGH = 'HIGH'
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ'
}
