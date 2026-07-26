export type NotificationStatus = 'UNREAD' | 'READ';
export type NotificationPriority = 'NORMAL' | 'HIGH';
export type NotificationSourceType =
  'ScheduleActivity' | 'Risk' | 'Issue' | 'RiskIssueAction' | 'ChangeRequest';
export type NotificationAlertType =
  'OVERDUE' | 'NEAR_CRITICAL' | 'RISK_REVIEW_DUE' | 'ISSUE_TARGET_DUE'
  | 'ACTION_OVERDUE' | 'CHANGE_DECISION_PENDING';

export interface AppNotification {
  id: string;
  projectId: string;
  packageId: string | null;
  sourceType: NotificationSourceType;
  sourceId: string;
  activityId: string | null;
  alertType: NotificationAlertType;
  priority: NotificationPriority;
  objectLink: string;
  reason: string;
  dueAt: string;
  dataDate: string;
  thresholdVersion: string;
  status: NotificationStatus;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPageMeta {
  nextCursor: string | null;
  limit: number;
  /** Unread totals for the badge; independent of the request filters, but scope-bound. */
  unreadTotal: number;
  unreadHigh: number;
  unreadNormal: number;
}

export interface NotificationListQuery {
  cursor?: string;
  limit?: number;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  sourceType?: NotificationSourceType;
  alertType?: NotificationAlertType;
  projectId?: string;
}

export interface NotificationListResponse {
  data: AppNotification[];
  meta: NotificationPageMeta;
  correlationId: string;
}

export interface NotificationCommandResponse {
  data: AppNotification;
  correlationId: string;
}
