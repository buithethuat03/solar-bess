import {
  Check, Column, Entity, Index, PrimaryColumn, Unique
} from 'typeorm';

@Entity({ name: 'progress_updates' })
@Unique('uq_progress_updates_tenant_id', ['tenantId', 'id'])
@Unique('uq_progress_updates_scope_id', ['tenantId', 'projectId', 'activityId', 'id'])
@Unique('uq_progress_update_source', ['tenantId', 'sourceKey'])
@Index('idx_progress_update_activity_date', ['tenantId', 'activityId', 'dataDate', 'recordedAt'])
@Check('ck_progress_update_percent', 'percent_complete >= 0 AND percent_complete <= 100')
@Check('ck_progress_update_remaining', 'remaining_duration_work_days >= 0')
@Check('ck_progress_update_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check(
  'ck_progress_update_correction',
  "correction_of_id IS NULL OR (correction_of_id <> id AND length(trim(reason)) > 0)"
)
@Check(
  'ck_progress_update_actual_finish',
  "actual_finish IS NULL OR (actual_start IS NOT NULL AND percent_complete = 100 "
  + "AND jsonb_array_length(evidence_refs) > 0)"
)
@Check(
  'ck_progress_update_actual_dates',
  'actual_finish IS NULL OR (actual_start IS NOT NULL AND actual_finish >= actual_start)'
)
export class ProgressUpdateEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'activity_id' }) activityId!: string;
  @Column('uuid', { name: 'correction_of_id', nullable: true }) correctionOfId!: string | null;
  @Column({ name: 'data_date', type: 'date' }) dataDate!: string;
  @Column({ name: 'percent_complete', type: 'numeric', precision: 5, scale: 2 }) percentComplete!: string;
  @Column({ name: 'remaining_duration_work_days', type: 'integer' }) remainingDurationWorkDays!: number;
  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true }) quantity!: string | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) unit!: string | null;
  @Column({ name: 'actual_start', type: 'date', nullable: true }) actualStart!: string | null;
  @Column({ name: 'actual_finish', type: 'date', nullable: true }) actualFinish!: string | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  @Column({ type: 'varchar', length: 2000, nullable: true }) note!: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) reason!: string | null;
  @Column({ name: 'source_key', type: 'varchar', length: 200 }) sourceKey!: string;
  @Column('uuid', { name: 'recorded_by' }) recordedBy!: string;
  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt!: Date;
}
