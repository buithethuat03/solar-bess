import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  type EvidenceReferenceRecord, ExposureLevel, RiskChangeDecision,
  RiskResponseStrategy, RiskStatus
} from './risk-change.enums';

@Entity({ name: 'risks' })
@Unique('uq_risks_tenant_id', ['tenantId', 'id'])
@Unique('uq_risks_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_risk_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_risk_register', [
  'tenantId', 'projectId', 'packageId', 'status', 'ownerId', 'residualExposure', 'reviewDate'
])
@Check('ck_risk_status', "status IN ('IDENTIFIED','ASSESSED','TREATING','MONITORING','CLOSURE_PENDING','CLOSED','OCCURRED')")
@Check('ck_risk_response_strategy', "response_strategy IS NULL OR response_strategy IN ('AVOID','MITIGATE','TRANSFER','ACCEPT')")
@Check('ck_risk_inherent_ratings', 'probability BETWEEN 1 AND 5 AND cost_impact_rating BETWEEN 1 AND 5 AND schedule_impact_rating BETWEEN 1 AND 5 AND hse_impact_rating BETWEEN 1 AND 5')
@Check('ck_risk_inherent_derived', 'impact_rating = GREATEST(cost_impact_rating, schedule_impact_rating, hse_impact_rating) AND inherent_exposure = probability * impact_rating')
@Check('ck_risk_inherent_level', "inherent_level IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_risk_residual_complete', `(
  residual_probability IS NULL AND residual_cost_impact_rating IS NULL
  AND residual_schedule_impact_rating IS NULL AND residual_hse_impact_rating IS NULL
  AND residual_impact_rating IS NULL AND residual_exposure IS NULL AND residual_level IS NULL
) OR (
  residual_probability BETWEEN 1 AND 5 AND residual_cost_impact_rating BETWEEN 1 AND 5
  AND residual_schedule_impact_rating BETWEEN 1 AND 5 AND residual_hse_impact_rating BETWEEN 1 AND 5
  AND residual_impact_rating = GREATEST(residual_cost_impact_rating, residual_schedule_impact_rating, residual_hse_impact_rating)
  AND residual_exposure = residual_probability * residual_impact_rating
  AND residual_level IN ('LOW','MEDIUM','HIGH','CRITICAL')
)`)
@Check('ck_risk_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_risk_closure_request_evidence_array', "jsonb_typeof(closure_request_evidence_refs) = 'array'")
@Check('ck_risk_closure_decision_evidence_array', "jsonb_typeof(closure_decision_evidence_refs) = 'array'")
@Check('ck_risk_closure_request_projection', `(
  closure_requested_by IS NULL AND closure_requested_at IS NULL AND closure_reason IS NULL
  AND jsonb_array_length(closure_request_evidence_refs) = 0
) OR (
  closure_requested_by IS NOT NULL AND closure_requested_at IS NOT NULL
  AND length(trim(closure_reason)) >= 3 AND jsonb_array_length(closure_request_evidence_refs) > 0
)`)
@Check('ck_risk_closure_decision_projection', `(
  closure_decision IS NULL AND closure_decided_by IS NULL AND closure_decided_at IS NULL
  AND closure_decision_comment IS NULL AND jsonb_array_length(closure_decision_evidence_refs) = 0
) OR (
  closure_decision IN ('APPROVE','RETURN','REJECT') AND closure_decided_by IS NOT NULL
  AND closure_decided_at IS NOT NULL AND length(trim(closure_decision_comment)) >= 3
  AND jsonb_array_length(closure_decision_evidence_refs) > 0
)`)
@Check('ck_risk_closure_sod', 'closure_decided_by IS NULL OR closure_decided_by <> closure_requested_by')
@Check('ck_risk_closure_decision_request', 'closure_decision IS NULL OR closure_requested_by IS NOT NULL')
@Check('ck_risk_closure_pending_projection', "status <> 'CLOSURE_PENDING' OR (closure_requested_by IS NOT NULL AND closure_decision IS NULL)")
@Check('ck_risk_closed_projection', "status <> 'CLOSED' OR closure_decision = 'APPROVE'")
@Check('ck_risk_occurred_issue', "status <> 'OCCURRED' OR occurred_issue_id IS NOT NULL")
@Check('ck_risk_version', 'version_no >= 1')
export class RiskEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 100 }) category!: string;
  @Column({ type: 'varchar', length: 2000 }) cause!: string;
  @Column({ type: 'varchar', length: 2000 }) event!: string;
  @Column({ type: 'varchar', length: 4000 }) impact!: string;
  @Column({ type: 'smallint' }) probability!: number;
  @Column({ name: 'cost_impact_rating', type: 'smallint' }) costImpactRating!: number;
  @Column({ name: 'schedule_impact_rating', type: 'smallint' }) scheduleImpactRating!: number;
  @Column({ name: 'hse_impact_rating', type: 'smallint' }) hseImpactRating!: number;
  @Column({ name: 'impact_rating', type: 'smallint' }) impactRating!: number;
  @Column({ name: 'inherent_exposure', type: 'smallint' }) inherentExposure!: number;
  @Column({ name: 'inherent_level', type: 'varchar', length: 20 }) inherentLevel!: ExposureLevel;
  @Column({ name: 'residual_probability', type: 'smallint', nullable: true }) residualProbability!: number | null;
  @Column({ name: 'residual_cost_impact_rating', type: 'smallint', nullable: true }) residualCostImpactRating!: number | null;
  @Column({ name: 'residual_schedule_impact_rating', type: 'smallint', nullable: true }) residualScheduleImpactRating!: number | null;
  @Column({ name: 'residual_hse_impact_rating', type: 'smallint', nullable: true }) residualHseImpactRating!: number | null;
  @Column({ name: 'residual_impact_rating', type: 'smallint', nullable: true }) residualImpactRating!: number | null;
  @Column({ name: 'residual_exposure', type: 'smallint', nullable: true }) residualExposure!: number | null;
  @Column({ name: 'residual_level', type: 'varchar', length: 20, nullable: true }) residualLevel!: ExposureLevel | null;
  @Column({ name: 'scoring_version', type: 'varchar', length: 100 }) scoringVersion!: string;
  @Column({ name: 'threshold_version', type: 'varchar', length: 100 }) thresholdVersion!: string;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ name: 'review_date', type: 'date' }) reviewDate!: string;
  @Column({ name: 'response_strategy', type: 'varchar', length: 20, nullable: true }) responseStrategy!: RiskResponseStrategy | null;
  @Column({ name: 'response_plan', type: 'varchar', length: 4000, nullable: true }) responsePlan!: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) trigger!: string | null;
  @Column({ name: 'contingency_plan', type: 'varchar', length: 4000, nullable: true }) contingencyPlan!: string | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" }) evidenceRefs!: EvidenceReferenceRecord[];
  @Column({ type: 'varchar', length: 30 }) status!: RiskStatus;
  @Column('uuid', { name: 'occurred_issue_id', nullable: true }) occurredIssueId!: string | null;
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
