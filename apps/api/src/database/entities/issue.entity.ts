import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  type EvidenceReferenceRecord, IssueSeverity, IssueStatus, RiskChangeDecision
} from './risk-change.enums';

@Entity({ name: 'issues' })
@Unique('uq_issues_tenant_id', ['tenantId', 'id'])
@Unique('uq_issues_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_issue_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_issue_register', [
  'tenantId', 'projectId', 'packageId', 'status', 'severity', 'ownerId', 'targetDate'
])
@Check('ck_issue_status', "status IN ('REPORTED','TRIAGED','IN_PROGRESS','RESOLVED','CLOSURE_PENDING','CLOSED','REOPENED')")
@Check('ck_issue_severity', "severity IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_issue_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_issue_resolution_evidence_array', "jsonb_typeof(resolution_evidence_refs) = 'array'")
@Check('ck_issue_resolution_pair', '(resolved_by IS NULL) = (resolved_at IS NULL)')
@Check('ck_issue_resolution_facts', `status NOT IN ('RESOLVED','CLOSURE_PENDING','CLOSED') OR (
  length(trim(resolution_summary)) >= 3 AND resolved_by IS NOT NULL
  AND jsonb_array_length(resolution_evidence_refs) > 0
)`)
@Check('ck_issue_closure_request_evidence_array', "jsonb_typeof(closure_request_evidence_refs) = 'array'")
@Check('ck_issue_closure_decision_evidence_array', "jsonb_typeof(closure_decision_evidence_refs) = 'array'")
@Check('ck_issue_closure_request_projection', `(
  closure_requested_by IS NULL AND closure_requested_at IS NULL AND closure_reason IS NULL
  AND jsonb_array_length(closure_request_evidence_refs) = 0
) OR (
  closure_requested_by IS NOT NULL AND closure_requested_at IS NOT NULL
  AND length(trim(closure_reason)) >= 3 AND jsonb_array_length(closure_request_evidence_refs) > 0
)`)
@Check('ck_issue_closure_decision_projection', `(
  closure_decision IS NULL AND closure_decided_by IS NULL AND closure_decided_at IS NULL
  AND closure_decision_comment IS NULL AND jsonb_array_length(closure_decision_evidence_refs) = 0
) OR (
  closure_decision IN ('APPROVE','RETURN','REJECT') AND closure_decided_by IS NOT NULL
  AND closure_decided_at IS NOT NULL AND length(trim(closure_decision_comment)) >= 3
  AND jsonb_array_length(closure_decision_evidence_refs) > 0
)`)
@Check('ck_issue_closure_sod', 'closure_decided_by IS NULL OR closure_decided_by <> closure_requested_by')
@Check('ck_issue_closure_decision_request', 'closure_decision IS NULL OR closure_requested_by IS NOT NULL')
@Check('ck_issue_closure_pending_projection', "status <> 'CLOSURE_PENDING' OR (closure_requested_by IS NOT NULL AND closure_decision IS NULL)")
@Check('ck_issue_closed_projection', "status <> 'CLOSED' OR closure_decision = 'APPROVE'")
@Check('ck_issue_version', 'version_no >= 1')
export class IssueEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 250 }) title!: string;
  @Column({ type: 'varchar', length: 4000 }) description!: string;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
  @Column({ name: 'root_cause', type: 'varchar', length: 4000 }) rootCause!: string;
  @Column({ name: 'actual_impact', type: 'varchar', length: 4000 }) actualImpact!: string;
  @Column({ type: 'varchar', length: 20 }) severity!: IssueSeverity;
  @Column({ name: 'decision_summary', type: 'varchar', length: 4000, nullable: true }) decisionSummary!: string | null;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ name: 'target_date', type: 'date' }) targetDate!: string;
  @Column('uuid', { name: 'source_risk_id', nullable: true }) sourceRiskId!: string | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) evidenceRefs!: EvidenceReferenceRecord[];
  @Column({ type: 'varchar', length: 30 }) status!: IssueStatus;
  @Column({ name: 'resolution_summary', type: 'varchar', length: 4000, nullable: true }) resolutionSummary!: string | null;
  @Column({ name: 'resolution_evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) resolutionEvidenceRefs!: EvidenceReferenceRecord[];
  @Column('uuid', { name: 'resolved_by', nullable: true }) resolvedBy!: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
  @Column('uuid', { name: 'closure_requested_by', nullable: true }) closureRequestedBy!: string | null;
  @Column({ name: 'closure_requested_at', type: 'timestamptz', nullable: true }) closureRequestedAt!: Date | null;
  @Column({ name: 'closure_reason', type: 'varchar', length: 2000, nullable: true }) closureReason!: string | null;
  @Column({ name: 'closure_request_evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) closureRequestEvidenceRefs!: EvidenceReferenceRecord[];
  @Column({ name: 'closure_decision', type: 'varchar', length: 20, nullable: true }) closureDecision!: RiskChangeDecision | null;
  @Column({ name: 'closure_decision_evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) closureDecisionEvidenceRefs!: EvidenceReferenceRecord[];
  @Column('uuid', { name: 'closure_decided_by', nullable: true }) closureDecidedBy!: string | null;
  @Column({ name: 'closure_decided_at', type: 'timestamptz', nullable: true }) closureDecidedAt!: Date | null;
  @Column({ name: 'closure_decision_comment', type: 'varchar', length: 2000, nullable: true }) closureDecisionComment!: string | null;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
