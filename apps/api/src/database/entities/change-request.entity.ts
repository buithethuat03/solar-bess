import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  ChangeRequestStatus, ChangeSourceType, type EvidenceReferenceRecord
} from './risk-change.enums';

export interface ChangeImpactRecord {
  scope?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
  cost?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  hse?: Record<string, unknown>;
  contract?: Record<string, unknown>;
}

@Entity({ name: 'change_requests' })
@Unique('uq_change_requests_tenant_id', ['tenantId', 'id'])
@Unique('uq_change_requests_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_change_request_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_change_request_register', [
  'tenantId', 'projectId', 'packageId', 'status', 'requesterId', 'submittedAt'
])
@Check('ck_change_request_status', "status IN ('DRAFT','ASSESSED','SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED')")
@Check('ck_change_request_source', `
  (source_type = 'MANUAL' AND source_risk_id IS NULL AND source_issue_id IS NULL)
  OR (source_type = 'RISK' AND source_risk_id IS NOT NULL AND source_issue_id IS NULL)
  OR (source_type = 'ISSUE' AND source_risk_id IS NULL AND source_issue_id IS NOT NULL)`)
@Check('ck_change_request_options_array', "jsonb_typeof(options) = 'array'")
@Check('ck_change_request_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_change_request_source_evidence_array', "jsonb_typeof(source_evidence_snapshot) = 'array'")
@Check('ck_change_request_impact_draft_object', "jsonb_typeof(impact_draft) = 'object'")
@Check('ck_change_request_impact_snapshot_object', "impact_snapshot IS NULL OR jsonb_typeof(impact_snapshot) = 'object'")
@Check('ck_change_request_approval_snapshot_object', "approval_snapshot IS NULL OR jsonb_typeof(approval_snapshot) = 'object'")
@Check('ck_change_request_impact_hash_pair', '(impact_snapshot IS NULL) = (impact_snapshot_hash IS NULL)')
@Check('ck_change_request_approval_hash_pair', '(approval_snapshot IS NULL) = (approval_snapshot_hash IS NULL)')
@Check('ck_change_request_hash_format', `(impact_snapshot_hash IS NULL OR impact_snapshot_hash ~ '^[0-9a-f]{64}$')
  AND (approval_snapshot_hash IS NULL OR approval_snapshot_hash ~ '^[0-9a-f]{64}$')`)
@Check('ck_change_request_submit_pair', '(submitted_by IS NULL) = (submitted_at IS NULL)')
@Check('ck_change_request_decision_facts', `(
  decision_version IS NULL AND decided_by IS NULL AND decided_at IS NULL AND decision_comment IS NULL
) OR (
  decision_version >= 1 AND decided_by IS NOT NULL AND decided_at IS NOT NULL
  AND length(trim(decision_comment)) >= 3
)`)
@Check('ck_change_request_approval_pair', '(approved_by IS NULL) = (approved_at IS NULL)')
@Check('ck_change_request_submitted_snapshot', `status IN ('DRAFT','ASSESSED') OR (
  submitted_by IS NOT NULL AND impact_snapshot IS NOT NULL AND approval_snapshot IS NOT NULL
)`)
@Check('ck_change_request_decided_status', `status NOT IN ('APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED')
  OR decided_by IS NOT NULL`)
@Check('ck_change_request_approved_status', `status NOT IN ('APPROVED','IMPLEMENTED','CLOSED')
  OR approved_by IS NOT NULL`)
@Check('ck_change_request_approval_status', `approved_by IS NULL
  OR status IN ('APPROVED','IMPLEMENTED','CLOSED')`)
@Check('ck_change_request_schedule_approval_status', `schedule_impact_approved = false
  OR status IN ('APPROVED','IMPLEMENTED','CLOSED')`)
@Check('ck_change_request_rebaseline_source', "schedule_impact_approved = false OR source_baseline_id IS NOT NULL")
@Check('ck_change_request_sod', 'decided_by IS NULL OR (decided_by <> requester_id AND decided_by IS DISTINCT FROM submitted_by)')
@Check('ck_change_request_version', 'version_no >= 1')
export class ChangeRequestEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 250 }) title!: string;
  @Column({ type: 'varchar', length: 4000 }) reason!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) options!: string[];
  @Column({ type: 'varchar', length: 4000, nullable: true }) recommendation!: string | null;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column('uuid', { name: 'requester_id' }) requesterId!: string;
  @Column('uuid', { name: 'source_baseline_id', nullable: true }) sourceBaselineId!: string | null;
  @Column({ name: 'source_type', type: 'varchar', length: 20 }) sourceType!: ChangeSourceType;
  @Column('uuid', { name: 'source_risk_id', nullable: true }) sourceRiskId!: string | null;
  @Column('uuid', { name: 'source_issue_id', nullable: true }) sourceIssueId!: string | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) evidenceRefs!: EvidenceReferenceRecord[];
  @Column({ name: 'source_evidence_snapshot', type: 'jsonb', default: () => "'[]'::jsonb" }) sourceEvidenceSnapshot!: EvidenceReferenceRecord[];
  @Column({ name: 'impact_draft', type: 'jsonb', default: () => "'{}'::jsonb" }) impactDraft!: ChangeImpactRecord;
  @Column({ name: 'impact_snapshot', type: 'jsonb', nullable: true }) impactSnapshot!: ChangeImpactRecord | null;
  @Column({ name: 'impact_snapshot_hash', type: 'varchar', length: 64, nullable: true }) impactSnapshotHash!: string | null;
  @Column({ name: 'approval_snapshot', type: 'jsonb', nullable: true }) approvalSnapshot!: Record<string, unknown> | null;
  @Column({ name: 'approval_snapshot_hash', type: 'varchar', length: 64, nullable: true }) approvalSnapshotHash!: string | null;
  @Column({ type: 'varchar', length: 30 }) status!: ChangeRequestStatus;
  @Column('uuid', { name: 'submitted_by', nullable: true }) submittedBy!: string | null;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt!: Date | null;
  @Column({ name: 'decision_version', type: 'integer', nullable: true }) decisionVersion!: number | null;
  @Column('uuid', { name: 'decided_by', nullable: true }) decidedBy!: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true }) decisionComment!: string | null;
  @Column({ name: 'schedule_impact_approved', type: 'boolean', default: false }) scheduleImpactApproved!: boolean;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
