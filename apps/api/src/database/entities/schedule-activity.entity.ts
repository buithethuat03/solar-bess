import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  ActivityStatus, ActivityType
} from './project-controls.enums';

@Entity({ name: 'schedule_activities' })
@Unique('uq_schedule_activities_tenant_id', ['tenantId', 'id'])
@Unique('uq_schedule_activities_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_schedule_activities_scope_id', ['tenantId', 'projectId', 'scheduleId', 'id'])
@Unique('uq_schedule_activity_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_schedule_activity_status_dates', ['tenantId', 'projectId', 'status', 'plannedStart', 'plannedFinish'])
@Index('idx_schedule_activity_scope', ['tenantId', 'projectId', 'wbsId', 'packageId', 'ownerId'])
@Check('ck_schedule_activity_weight', 'weight > 0 AND weight <= 100')
@Check('ck_schedule_activity_duration', 'duration_work_days >= 0 AND remaining_duration_work_days >= 0')
@Check('ck_schedule_activity_percent', 'percent_complete >= 0 AND percent_complete <= 100')
@Check(
  'ck_schedule_activity_type_duration',
  "(activity_type = 'MILESTONE' AND duration_work_days = 0 AND planned_start = planned_finish) OR "
  + "(activity_type = 'TASK' AND duration_work_days > 0 AND planned_finish >= planned_start)"
)
@Check(
  'ck_schedule_activity_forecast_dates',
  'forecast_finish IS NULL OR (forecast_start IS NOT NULL AND forecast_finish >= forecast_start)'
)
@Check(
  'ck_schedule_activity_actual_dates',
  'actual_finish IS NULL OR (actual_start IS NOT NULL AND actual_finish >= actual_start)'
)
@Check(
  'ck_schedule_activity_actual_finish_progress',
  'actual_finish IS NULL OR percent_complete = 100'
)
@Check('ck_schedule_activity_version', 'version_no >= 1')
export class ScheduleActivityEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'schedule_id' }) scheduleId!: string;
  @Column('uuid', { name: 'wbs_id' }) wbsId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ length: 80 }) code!: string;
  @Column({ length: 250 }) name!: string;
  @Column({ name: 'activity_type', type: 'varchar', length: 20 }) activityType!: ActivityType;
  @Column({ type: 'numeric', precision: 7, scale: 4 }) weight!: string;
  @Column({ name: 'planned_start', type: 'date' }) plannedStart!: string;
  @Column({ name: 'planned_finish', type: 'date' }) plannedFinish!: string;
  @Column({ name: 'forecast_start', type: 'date', nullable: true }) forecastStart!: string | null;
  @Column({ name: 'forecast_finish', type: 'date', nullable: true }) forecastFinish!: string | null;
  @Column({ name: 'actual_start', type: 'date', nullable: true }) actualStart!: string | null;
  @Column({ name: 'actual_finish', type: 'date', nullable: true }) actualFinish!: string | null;
  @Column({ name: 'duration_work_days', type: 'integer' }) durationWorkDays!: number;
  @Column({ name: 'remaining_duration_work_days', type: 'integer' }) remainingDurationWorkDays!: number;
  @Column({ name: 'percent_complete', type: 'numeric', precision: 5, scale: 2, default: 0 })
  percentComplete!: string;
  @Column({ type: 'varchar', length: 20 }) status!: ActivityStatus;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
