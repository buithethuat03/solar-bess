import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { BaselineStatus, BaselineType } from './project-controls.enums';

@Entity({ name: 'schedule_baselines' })
@Unique('uq_schedule_baselines_tenant_id', ['tenantId', 'id'])
@Unique('uq_schedule_baselines_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_schedule_baselines_scope_id', ['tenantId', 'projectId', 'scheduleId', 'id'])
@Unique('uq_schedule_baseline_number', ['tenantId', 'projectId', 'baselineNumber'])
@Index('uq_schedule_baseline_current', ['tenantId', 'projectId'], {
  unique: true,
  where: "status = 'APPROVED'"
})
@Index('idx_schedule_baseline_history', ['tenantId', 'projectId', 'status', 'baselineNumber'])
@Check('ck_schedule_baseline_number', 'baseline_number >= 1')
@Check('ck_schedule_baseline_snapshot_object', "jsonb_typeof(snapshot) = 'object'")
@Check('ck_schedule_baseline_snapshot_hash', "snapshot_hash ~ '^[0-9a-f]{64}$'")
@Check(
  'ck_schedule_baseline_rebaseline_change',
  "baseline_type <> 'REBASELINE' OR approved_change_request_id IS NOT NULL"
)
@Check(
  'ck_schedule_baseline_approval_pair',
  '(approved_by IS NULL) = (approved_at IS NULL)'
)
@Check(
  'ck_schedule_baseline_submit_pair',
  '(submitted_by IS NULL) = (submitted_at IS NULL)'
)
@Check(
  'ck_schedule_baseline_approved_actor',
  "status NOT IN ('APPROVED','SUPERSEDED') OR approved_by IS NOT NULL"
)
@Check('ck_schedule_baseline_version', 'version_no >= 1')
export class ScheduleBaselineEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'schedule_id' }) scheduleId!: string;
  @Column({ name: 'baseline_number', type: 'integer' }) baselineNumber!: number;
  @Column({ name: 'baseline_type', type: 'varchar', length: 20 }) baselineType!: BaselineType;
  @Column({ type: 'varchar', length: 20 }) status!: BaselineStatus;
  @Column({ name: 'data_date', type: 'date' }) dataDate!: string;
  @Column({ type: 'jsonb' }) snapshot!: Record<string, unknown>;
  @Column({ name: 'snapshot_hash', type: 'varchar', length: 64 }) snapshotHash!: string;
  @Column({ type: 'varchar', length: 2000 }) reason!: string;
  @Column({ name: 'impact_summary', type: 'varchar', length: 4000 }) impactSummary!: string;
  @Column('uuid', { name: 'approved_change_request_id', nullable: true })
  approvedChangeRequestId!: string | null;
  @Column('uuid', { name: 'replaces_baseline_id', nullable: true }) replacesBaselineId!: string | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'submitted_by', nullable: true }) submittedBy!: string | null;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt!: Date | null;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true })
  decisionComment!: string | null;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
