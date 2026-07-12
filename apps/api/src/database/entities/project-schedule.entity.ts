import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  ProjectScheduleStatus, ScheduleSourceFormat
} from './project-controls.enums';

export interface ScheduleCalendarException {
  date: string;
  working: boolean;
  reason?: string;
}

@Entity({ name: 'project_schedules' })
@Unique('uq_project_schedules_tenant_id', ['tenantId', 'id'])
@Unique('uq_project_schedules_scope_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_project_schedule_project', ['tenantId', 'projectId'])
@Index('idx_project_schedule_status_date', ['tenantId', 'projectId', 'status', 'dataDate'])
@Check(
  'ck_project_schedule_working_week_array',
  "jsonb_typeof(working_week) = 'array' AND jsonb_array_length(working_week) BETWEEN 1 AND 7"
)
@Check('ck_project_schedule_exceptions_array', "jsonb_typeof(calendar_exceptions) = 'array'")
@Check('ck_project_schedule_version', 'version_no >= 1')
export class ProjectScheduleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ length: 100 }) timezone!: string;
  @Column({ name: 'calendar_code', length: 64 }) calendarCode!: string;
  @Column({ name: 'working_week', type: 'jsonb' }) workingWeek!: number[];
  @Column({ name: 'calendar_exceptions', type: 'jsonb' })
  calendarExceptions!: ScheduleCalendarException[];
  @Column({ name: 'data_date', type: 'date' }) dataDate!: string;
  @Column({ type: 'varchar', length: 20 }) status!: ProjectScheduleStatus;
  @Column({ name: 'source_format', type: 'varchar', length: 30 }) sourceFormat!: ScheduleSourceFormat;
  @Column({ name: 'source_name', type: 'varchar', length: 250 }) sourceName!: string;
  @Column({ name: 'source_hash', type: 'varchar', length: 128, nullable: true }) sourceHash!: string | null;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
