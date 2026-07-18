import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { type EvidenceReferenceRecord, RiskChangeDecision } from './risk-change.enums';

@Entity({ name: 'risk_issue_closure_cycles' })
@Unique('uq_risk_issue_closure_cycles_tenant_id', ['tenantId', 'id'])
@Index('uq_risk_closure_cycle_sequence', ['tenantId', 'riskId', 'sequenceNo'], {
  unique: true, where: 'risk_id IS NOT NULL'
})
@Index('uq_issue_closure_cycle_sequence', ['tenantId', 'issueId', 'sequenceNo'], {
  unique: true, where: 'issue_id IS NOT NULL'
})
@Index('uq_risk_closure_cycle_open', ['tenantId', 'riskId'], {
  unique: true, where: 'risk_id IS NOT NULL AND decision IS NULL'
})
@Index('uq_issue_closure_cycle_open', ['tenantId', 'issueId'], {
  unique: true, where: 'issue_id IS NOT NULL AND decision IS NULL'
})
@Index('idx_risk_closure_cycle_history', ['tenantId', 'projectId', 'riskId', 'sequenceNo', 'createdAt'])
@Index('idx_issue_closure_cycle_history', ['tenantId', 'projectId', 'issueId', 'sequenceNo', 'createdAt'])
@Check('ck_risk_issue_closure_cycle_parent', '(risk_id IS NULL) <> (issue_id IS NULL)')
@Check('ck_risk_issue_closure_cycle_sequence', 'sequence_no >= 1')
@Check('ck_risk_issue_closure_cycle_request_evidence', "jsonb_typeof(request_evidence_refs) = 'array' AND jsonb_array_length(request_evidence_refs) > 0")
@Check('ck_risk_issue_closure_cycle_decision_evidence', "jsonb_typeof(decision_evidence_refs) = 'array'")
@Check('ck_risk_issue_closure_cycle_decision', `(
  decision IS NULL AND decision_comment IS NULL AND jsonb_array_length(decision_evidence_refs) = 0
  AND decided_by IS NULL AND decided_at IS NULL AND resulting_status IS NULL
) OR (
  decision IN ('APPROVE','RETURN','REJECT') AND length(trim(decision_comment)) >= 3
  AND jsonb_array_length(decision_evidence_refs) > 0 AND decided_by IS NOT NULL
  AND decided_at IS NOT NULL AND resulting_status IS NOT NULL
)`)
@Check('ck_risk_issue_closure_cycle_result', `decision IS NULL OR (
  (risk_id IS NOT NULL AND resulting_status = CASE WHEN decision = 'APPROVE' THEN 'CLOSED' ELSE 'MONITORING' END)
  OR (issue_id IS NOT NULL AND resulting_status = CASE WHEN decision = 'APPROVE' THEN 'CLOSED' ELSE 'RESOLVED' END)
)`)
@Check('ck_risk_issue_closure_cycle_sod', 'decided_by IS NULL OR decided_by <> requested_by')
export class RiskIssueClosureCycleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column('uuid', { name: 'risk_id', nullable: true }) riskId!: string | null;
  @Column('uuid', { name: 'issue_id', nullable: true }) issueId!: string | null;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'request_reason', type: 'varchar', length: 2000 }) requestReason!: string;
  @Column({ name: 'request_evidence_refs', type: 'jsonb' }) requestEvidenceRefs!: EvidenceReferenceRecord[];
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column({ name: 'requested_at', type: 'timestamptz' }) requestedAt!: Date;
  @Column({ type: 'varchar', length: 20, nullable: true }) decision!: RiskChangeDecision | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true }) decisionComment!: string | null;
  @Column({ name: 'decision_evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) decisionEvidenceRefs!: EvidenceReferenceRecord[];
  @Column('uuid', { name: 'decided_by', nullable: true }) decidedBy!: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @Column({ name: 'resulting_status', type: 'varchar', length: 30, nullable: true }) resultingStatus!: RiskStatusResult | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

export type RiskStatusResult = 'MONITORING' | 'RESOLVED' | 'CLOSED';
