import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique
} from 'typeorm';
import {
  AlertType, NotificationPriority, NotificationStatus
} from './project-controls.enums';

@Entity({ name: 'schedule_notifications' })
@Unique('uq_schedule_notifications_tenant_id', ['tenantId', 'id'])
@Unique('uq_schedule_notification_dedup', ['tenantId', 'dedupKey'])
@Index('idx_schedule_notification_inbox', ['tenantId', 'recipientUserId', 'status', 'dueAt'])
@Index('idx_schedule_notification_activity', ['tenantId', 'projectId', 'activityId', 'dataDate'])
@Check('ck_schedule_notification_read', "status <> 'READ' OR read_at IS NOT NULL")
export class ScheduleNotificationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'recipient_user_id' }) recipientUserId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'activity_id' }) activityId!: string;
  @Column({ name: 'source_type', type: 'varchar', length: 80 }) sourceType!: string;
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
