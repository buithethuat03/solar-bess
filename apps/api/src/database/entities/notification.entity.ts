import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique
} from 'typeorm';
import {
  AlertType, NotificationPriority, NotificationSourceType, NotificationStatus
} from './project-controls.enums';

@Entity({ name: 'notifications' })
@Unique('uq_notifications_tenant_id', ['tenantId', 'id'])
@Unique('uq_notification_dedup', ['tenantId', 'dedupKey'])
@Index('idx_notification_inbox', ['tenantId', 'recipientUserId', 'status', 'dueAt'])
@Index('idx_notification_source', [
  'tenantId', 'projectId', 'packageId', 'sourceType', 'sourceId'
])
@Index('idx_notification_schedule_activity', [
  'tenantId', 'projectId', 'activityId', 'dataDate'
], { where: "source_type = 'ScheduleActivity'" })
@Check('ck_notification_source_type', "source_type IN ('ScheduleActivity','Risk','Issue','RiskIssueAction','ChangeRequest')")
@Check('ck_notification_source_activity', `
  (source_type = 'ScheduleActivity' AND activity_id = source_id)
  OR (source_type <> 'ScheduleActivity' AND activity_id IS NULL)`)
@Check('ck_notification_alert_mapping', `
  (source_type = 'ScheduleActivity' AND alert_type IN ('OVERDUE','NEAR_CRITICAL'))
  OR (source_type = 'Risk' AND alert_type = 'RISK_REVIEW_DUE')
  OR (source_type = 'Issue' AND alert_type = 'ISSUE_TARGET_DUE')
  OR (source_type = 'RiskIssueAction' AND alert_type = 'ACTION_OVERDUE')
  OR (source_type = 'ChangeRequest' AND alert_type = 'CHANGE_DECISION_PENDING')`)
@Check('ck_notification_priority', "priority IN ('NORMAL','HIGH')")
@Check('ck_notification_status', "status IN ('UNREAD','READ')")
@Check('ck_notification_read', "status <> 'READ' OR read_at IS NOT NULL")
@Check('ck_notification_threshold_version', 'length(trim(threshold_version)) > 0')
export class NotificationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'recipient_user_id' }) recipientUserId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column('uuid', { name: 'activity_id', nullable: true }) activityId!: string | null;
  @Column({ name: 'source_type', type: 'varchar', length: 80 }) sourceType!: NotificationSourceType;
  @Column('uuid', { name: 'source_id' }) sourceId!: string;
  @Column({ name: 'alert_type', type: 'varchar', length: 30 }) alertType!: AlertType;
  @Column({ type: 'varchar', length: 20 }) priority!: NotificationPriority;
  @Column({ name: 'object_link', type: 'varchar', length: 500 }) objectLink!: string;
  @Column({ type: 'varchar', length: 2000 }) reason!: string;
  @Column({ name: 'due_at', type: 'date' }) dueAt!: string;
  @Column({ name: 'data_date', type: 'date' }) dataDate!: string;
  @Column({ name: 'threshold_version', type: 'varchar', length: 100 }) thresholdVersion!: string;
  @Column({ name: 'dedup_key', type: 'varchar', length: 200 }) dedupKey!: string;
  @Column({ type: 'varchar', length: 20, default: NotificationStatus.UNREAD }) status!: NotificationStatus;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
