import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  type EvidenceReferenceRecord, RiskIssueActionStatus, RiskIssueActionType
} from './risk-change.enums';

@Entity({ name: 'risk_issue_actions' })
@Unique('uq_risk_issue_actions_tenant_id', ['tenantId', 'id'])
@Unique('uq_risk_issue_actions_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_risk_issue_action_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_risk_issue_action_register', [
  'tenantId', 'projectId', 'packageId', 'ownerId', 'status', 'dueDate'
])
@Index('idx_risk_issue_action_risk', ['tenantId', 'projectId', 'riskId', 'status'])
@Index('idx_risk_issue_action_issue', ['tenantId', 'projectId', 'issueId', 'status'])
@Check('ck_risk_issue_action_parent', '(risk_id IS NULL) <> (issue_id IS NULL)')
@Check('ck_risk_issue_action_type', "action_type IN ('RESPONSE','CONTINGENCY','CORRECTIVE','DECISION')")
@Check('ck_risk_issue_action_status', "status IN ('OPEN','IN_PROGRESS','BLOCKED','DONE','VERIFIED','CANCELLED')")
@Check('ck_risk_issue_action_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_risk_issue_action_residual_complete', `(
  residual_probability IS NULL AND residual_cost_impact_rating IS NULL
  AND residual_schedule_impact_rating IS NULL AND residual_hse_impact_rating IS NULL
  AND residual_rationale IS NULL AND residual_risk_version IS NULL
) OR (
  risk_id IS NOT NULL AND residual_probability BETWEEN 1 AND 5
  AND residual_cost_impact_rating BETWEEN 1 AND 5
  AND residual_schedule_impact_rating BETWEEN 1 AND 5
  AND residual_hse_impact_rating BETWEEN 1 AND 5
  AND (residual_rationale IS NULL OR length(trim(residual_rationale)) >= 3)
  AND residual_risk_version >= 1
)`)
@Check('ck_risk_issue_action_completion_pair', '(completed_by IS NULL) = (completed_at IS NULL)')
@Check('ck_risk_issue_action_verification_pair', '(verified_by IS NULL) = (verified_at IS NULL)')
@Check('ck_risk_issue_action_cancellation_pair', '(cancelled_by IS NULL) = (cancelled_at IS NULL)')
@Check('ck_risk_issue_action_terminal_facts', `
  (status IN ('OPEN','IN_PROGRESS','BLOCKED')
    AND completed_by IS NULL AND verified_by IS NULL AND cancelled_by IS NULL)
  OR (status = 'DONE' AND completed_by IS NOT NULL
    AND verified_by IS NULL AND cancelled_by IS NULL AND jsonb_array_length(evidence_refs) > 0)
  OR (status = 'VERIFIED' AND completed_by IS NOT NULL
    AND verified_by IS NOT NULL AND cancelled_by IS NULL AND jsonb_array_length(evidence_refs) > 0)
  OR (status = 'CANCELLED' AND verified_by IS NULL AND cancelled_by IS NOT NULL
    AND length(trim(status_reason)) >= 3 AND jsonb_array_length(evidence_refs) > 0)`)
@Check('ck_risk_issue_action_verification_sod', 'verified_by IS NULL OR (verified_by <> owner_id AND verified_by IS DISTINCT FROM completed_by)')
@Check('ck_risk_issue_action_cancellation_sod', 'cancelled_by IS NULL OR (cancelled_by <> owner_id AND cancelled_by IS DISTINCT FROM completed_by)')
@Check('ck_risk_issue_action_version', 'version_no >= 1')
export class RiskIssueActionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column('uuid', { name: 'risk_id', nullable: true }) riskId!: string | null;
  @Column('uuid', { name: 'issue_id', nullable: true }) issueId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ name: 'action_type', type: 'varchar', length: 30 }) actionType!: RiskIssueActionType;
  @Column({ type: 'varchar', length: 250 }) title!: string;
  @Column({ type: 'varchar', length: 4000, nullable: true }) description!: string | null;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ name: 'due_date', type: 'date' }) dueDate!: string;
  @Column({ type: 'varchar', length: 30 }) status!: RiskIssueActionStatus;
  @Column({ name: 'status_reason', type: 'varchar', length: 2000, nullable: true }) statusReason!: string | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) evidenceRefs!: EvidenceReferenceRecord[];
  @Column({ name: 'residual_probability', type: 'smallint', nullable: true }) residualProbability!: number | null;
  @Column({ name: 'residual_cost_impact_rating', type: 'smallint', nullable: true }) residualCostImpactRating!: number | null;
  @Column({ name: 'residual_schedule_impact_rating', type: 'smallint', nullable: true }) residualScheduleImpactRating!: number | null;
  @Column({ name: 'residual_hse_impact_rating', type: 'smallint', nullable: true }) residualHseImpactRating!: number | null;
  @Column({ name: 'residual_rationale', type: 'varchar', length: 2000, nullable: true })
  residualRationale!: string | null;
  @Column({ name: 'residual_risk_version', type: 'integer', nullable: true }) residualRiskVersion!: number | null;
  @Column('uuid', { name: 'completed_by', nullable: true }) completedBy!: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column('uuid', { name: 'cancelled_by', nullable: true }) cancelledBy!: string | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt!: Date | null;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
