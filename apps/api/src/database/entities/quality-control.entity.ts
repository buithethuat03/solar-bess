import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  CapaActionStatus, InspectionResult, InspectionStatus, NcrDisposition, NcrStatus,
  PunchCategory, PunchItemStatus, QualityCycleDecision
} from './field-hse-quality.enums';

/**
 * DB-058 — inspection & test plan (FR-092). Recorded V1 decision: there is NO ITP-create operation
 * in the catalog; the approved ITP row is materialized server-side by the FIRST API-095 call for a
 * given ISSUED + CLEAN document revision, and the ITP's id IS that document revision's id (1:1).
 * Later calls with the same path id find the row; the source revision can never be quarantined
 * malware because `documentRevision` release already required scan_status = 'CLEAN'.
 * `uq_itp_package_version` allocates an ITP version per package in-transaction.
 */
@Entity({ name: 'inspection_test_plans' })
@Unique('uq_itp_tenant_id', ['tenantId', 'id'])
@Unique('uq_itp_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_itp_document_revision', ['tenantId', 'documentRevisionId'])
@Unique('uq_itp_package_version', ['tenantId', 'packageId', 'version'])
@Check('ck_itp_version', 'version >= 1')
export class InspectionTestPlanEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id' }) packageId!: string;
  @Column('uuid', { name: 'document_revision_id' }) documentRevisionId!: string;
  @Column({ type: 'integer' }) version!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-059 — one inspection of one ITP hold point (FR-092). A re-inspection is a NEW row with
 * sequence_no + 1 under `uq_inspection_hold_point_sequence`; `ck_inspection_recorded` requires
 * result + recorder pair + at least one piece of evidence before a row may claim RECORDED, and
 * `trg_inspection_recorded_immutable` freezes recorded rows forever. The witness list is stored as
 * a legal snapshot (`witness_snapshot`), never as display strings on mutable columns.
 */
@Entity({ name: 'inspections' })
@Unique('uq_inspections_tenant_id', ['tenantId', 'id'])
@Unique('uq_inspections_itp_id', ['tenantId', 'itpId', 'id'])
@Unique('uq_inspection_hold_point_sequence', ['tenantId', 'itpId', 'holdPointRef', 'sequenceNo'])
@Index('uq_inspection_hold_point_open', ['tenantId', 'itpId', 'holdPointRef'], {
  unique: true, where: "status = 'REQUESTED'"
})
@Index('idx_inspection_register', ['tenantId', 'projectId', 'status'])
@Check('ck_inspection_status', "status IN ('REQUESTED','RECORDED')")
@Check('ck_inspection_result', "result IS NULL OR result IN ('PASS','FAIL')")
@Check('ck_inspection_hold_point', "hold_point_ref ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_inspection_sequence', 'sequence_no >= 1')
@Check('ck_inspection_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_inspection_recorded', `status <> 'RECORDED'
  OR (result IS NOT NULL AND recorded_by IS NOT NULL AND recorded_at IS NOT NULL
    AND jsonb_array_length(evidence_refs) >= 1)`)
@Check('ck_inspection_recorded_pair', '(recorded_by IS NULL) = (recorded_at IS NULL)')
@Check('ck_inspection_version', 'version_no >= 1')
export class InspectionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'itp_id' }) itpId!: string;
  @Column({ name: 'hold_point_ref', type: 'varchar', length: 80 }) holdPointRef!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ type: 'varchar', length: 20 }) status!: InspectionStatus;
  @Column({ type: 'varchar', length: 10, nullable: true }) result!: InspectionResult | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  @Column({ name: 'witness_snapshot', type: 'jsonb', nullable: true })
  witnessSnapshot!: Record<string, unknown> | null;
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column('uuid', { name: 'recorded_by', nullable: true }) recordedBy!: string | null;
  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true }) recordedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-060 — non-conformity report (FR-094). Two independence rules are row constraints, not service
 * courtesy: `ck_ncr_verifier_independent` (the closing verifier is never the owner) and
 * `ck_ncr_disposition_independent` (the disposition approver is never the raiser). Root cause is
 * structurally required from DISPOSITION_PROPOSED onward, and CLOSED requires the verifier plus at
 * least one piece of closure evidence.
 */
@Entity({ name: 'ncrs' })
@Unique('uq_ncrs_tenant_id', ['tenantId', 'id'])
@Unique('uq_ncrs_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_ncr_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_ncr_register', ['tenantId', 'projectId', 'status', 'severity'])
@Check('ck_ncr_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_ncr_status', `status IN ('OPEN','CONTAINED','ROOT_CAUSE','DISPOSITION_PROPOSED',
  'RETURNED','DISPOSITION_APPROVED','RECTIFICATION','READY_FOR_VERIFICATION','CLOSED','REOPENED')`)
@Check('ck_ncr_severity', "severity IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_ncr_disposition', `disposition IS NULL
  OR disposition IN ('REWORK','REPAIR','USE_AS_IS','SCRAP','REJECT')`)
@Check('ck_ncr_root_cause_required', `status NOT IN ('DISPOSITION_PROPOSED','RETURNED',
  'DISPOSITION_APPROVED','RECTIFICATION','READY_FOR_VERIFICATION','CLOSED','REOPENED')
  OR root_cause IS NOT NULL`)
@Check('ck_ncr_disposition_approved', `status NOT IN ('DISPOSITION_APPROVED','RECTIFICATION',
  'READY_FOR_VERIFICATION','CLOSED','REOPENED')
  OR (disposition IS NOT NULL AND disposition_approved_by IS NOT NULL)`)
@Check('ck_ncr_disposition_independent',
  'disposition_approved_by IS NULL OR disposition_approved_by <> raised_by')
@Check('ck_ncr_verifier_independent', 'verified_by IS NULL OR verified_by <> owner_id')
@Check('ck_ncr_verified_pair', '(verified_by IS NULL) = (verified_at IS NULL)')
@Check('ck_ncr_closure_evidence_array', "jsonb_typeof(closure_evidence_refs) = 'array'")
@Check('ck_ncr_closed', `status <> 'CLOSED'
  OR (verified_by IS NOT NULL AND jsonb_array_length(closure_evidence_refs) >= 1)`)
@Check('ck_ncr_version', 'version_no >= 1')
export class NcrEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 4000 }) description!: string;
  @Column({ type: 'varchar', length: 10 }) severity!: string;
  @Column({ type: 'varchar', length: 30 }) status!: NcrStatus;
  @Column('uuid', { name: 'raised_by' }) raisedBy!: string;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ name: 'containment_action', type: 'varchar', length: 2000, nullable: true })
  containmentAction!: string | null;
  @Column({ name: 'root_cause', type: 'varchar', length: 4000, nullable: true })
  rootCause!: string | null;
  @Column({ type: 'varchar', length: 20, nullable: true }) disposition!: NcrDisposition | null;
  @Column('uuid', { name: 'disposition_approved_by', nullable: true })
  dispositionApprovedBy!: string | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'closure_evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  closureEvidenceRefs!: string[];
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-116 — NcrDispositionCycle (allocated under the Product Owner's blanket delegation for this
 * slice). Mirrors `risk_issue_closure_cycles`: one proposal/decision round per row,
 * `uq_ncr_disposition_cycle_sequence` orders them, the partial unique
 * `uq_ncr_disposition_cycle_open` allows one undecided cycle at a time, decided rows are frozen by
 * trigger, and `ck_ncr_disposition_cycle_sod` keeps decider and proposer distinct.
 */
@Entity({ name: 'ncr_disposition_cycles' })
@Unique('uq_ncr_disposition_cycles_tenant_id', ['tenantId', 'id'])
@Unique('uq_ncr_disposition_cycle_sequence', ['tenantId', 'ncrId', 'sequenceNo'])
@Index('uq_ncr_disposition_cycle_open', ['tenantId', 'ncrId'], {
  unique: true, where: 'decision IS NULL'
})
@Index('idx_ncr_disposition_cycle_history', ['tenantId', 'projectId', 'ncrId', 'sequenceNo'])
@Check('ck_ncr_disposition_cycle_sequence', 'sequence_no >= 1')
@Check('ck_ncr_disposition_cycle_proposed', `proposed_disposition IN
  ('REWORK','REPAIR','USE_AS_IS','SCRAP','REJECT')`)
@Check('ck_ncr_disposition_cycle_proposal_comment', 'coalesce(length(trim(proposal_comment)), 0) >= 3')
@Check('ck_ncr_disposition_cycle_decision', `(
    decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
  ) OR (
    decision IN ('APPROVE','RETURN') AND coalesce(length(trim(decision_comment)), 0) >= 3
    AND decided_by IS NOT NULL AND decided_at IS NOT NULL
  )`)
@Check('ck_ncr_disposition_cycle_sod', 'decided_by IS NULL OR decided_by <> proposed_by')
export class NcrDispositionCycleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'ncr_id' }) ncrId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'proposed_disposition', type: 'varchar', length: 20 })
  proposedDisposition!: NcrDisposition;
  @Column({ name: 'proposal_comment', type: 'varchar', length: 2000 }) proposalComment!: string;
  @Column('uuid', { name: 'proposed_by' }) proposedBy!: string;
  @Column({ name: 'proposed_at', type: 'timestamptz' }) proposedAt!: Date;
  @Column({ type: 'varchar', length: 20, nullable: true })
  decision!: QualityCycleDecision | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true })
  decisionComment!: string | null;
  @Column('uuid', { name: 'decided_by', nullable: true }) decidedBy!: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-061 — punch item (FR-096). Category discipline is structural: A items are COD-blocking
 * (`ck_punch_category_a_blocking`) and never waivable (`ck_punch_category_a_not_waivable`); a
 * waiver requires waivability, an actor and a reason; closure requires an owner-independent
 * verifier plus evidence.
 */
@Entity({ name: 'punch_items' })
@Unique('uq_punch_items_tenant_id', ['tenantId', 'id'])
@Unique('uq_punch_items_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_punch_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_punch_register', ['tenantId', 'projectId', 'status', 'category'])
@Check('ck_punch_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_punch_status', "status IN ('OPEN','READY_FOR_VERIFICATION','CLOSED','WAIVED')")
@Check('ck_punch_category', "category IN ('A','B','C','D')")
@Check('ck_punch_category_a_blocking', "category <> 'A' OR cod_blocking = true")
@Check('ck_punch_category_a_not_waivable', "category <> 'A' OR waivable = false")
@Check('ck_punch_waiver', `status <> 'WAIVED' OR (waivable = true AND waived_by IS NOT NULL
  AND waived_reason IS NOT NULL AND length(trim(waived_reason)) > 0)`)
@Check('ck_punch_verifier_independent', 'verified_by IS NULL OR verified_by <> owner_id')
@Check('ck_punch_verified_pair', '(verified_by IS NULL) = (verified_at IS NULL)')
@Check('ck_punch_closure_evidence_array', "jsonb_typeof(closure_evidence_refs) = 'array'")
@Check('ck_punch_closed', `status <> 'CLOSED'
  OR (verified_by IS NOT NULL AND jsonb_array_length(closure_evidence_refs) >= 1)`)
@Check('ck_punch_version', 'version_no >= 1')
export class PunchItemEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 4000, nullable: true }) description!: string | null;
  @Column({ type: 'char', length: 1 }) category!: PunchCategory;
  @Column({ name: 'cod_blocking', type: 'boolean' }) codBlocking!: boolean;
  @Column({ type: 'boolean' }) waivable!: boolean;
  @Column({ type: 'varchar', length: 30 }) status!: PunchItemStatus;
  @Column('uuid', { name: 'raised_by' }) raisedBy!: string;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column('uuid', { name: 'waived_by', nullable: true }) waivedBy!: string | null;
  @Column({ name: 'waived_reason', type: 'varchar', length: 2000, nullable: true })
  waivedReason!: string | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'closure_evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  closureEvidenceRefs!: string[];
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-117 — PunchClosureCycle (allocated under the Product Owner's blanket delegation for this
 * slice). Structural mirror of DB-116 for punch items: closure is requested with evidence, decided
 * by someone other than the requester, one open cycle at a time, decided rows frozen by trigger.
 */
@Entity({ name: 'punch_closure_cycles' })
@Unique('uq_punch_closure_cycles_tenant_id', ['tenantId', 'id'])
@Unique('uq_punch_closure_cycle_sequence', ['tenantId', 'punchItemId', 'sequenceNo'])
@Index('uq_punch_closure_cycle_open', ['tenantId', 'punchItemId'], {
  unique: true, where: 'decision IS NULL'
})
@Index('idx_punch_closure_cycle_history', ['tenantId', 'projectId', 'punchItemId', 'sequenceNo'])
@Check('ck_punch_closure_cycle_sequence', 'sequence_no >= 1')
@Check('ck_punch_closure_cycle_request_comment', 'coalesce(length(trim(request_comment)), 0) >= 3')
@Check('ck_punch_closure_cycle_request_evidence', `jsonb_typeof(request_evidence_refs) = 'array'
  AND jsonb_array_length(request_evidence_refs) >= 1`)
@Check('ck_punch_closure_cycle_decision', `(
    decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
  ) OR (
    decision IN ('APPROVE','RETURN') AND coalesce(length(trim(decision_comment)), 0) >= 3
    AND decided_by IS NOT NULL AND decided_at IS NOT NULL
  )`)
@Check('ck_punch_closure_cycle_sod', 'decided_by IS NULL OR decided_by <> requested_by')
export class PunchClosureCycleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'punch_item_id' }) punchItemId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'request_comment', type: 'varchar', length: 2000 }) requestComment!: string;
  @Column({ name: 'request_evidence_refs', type: 'jsonb' }) requestEvidenceRefs!: string[];
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column({ name: 'requested_at', type: 'timestamptz' }) requestedAt!: Date;
  @Column({ type: 'varchar', length: 20, nullable: true })
  decision!: QualityCycleDecision | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true })
  decisionComment!: string | null;
  @Column('uuid', { name: 'decided_by', nullable: true }) decidedBy!: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-064 — corrective/preventive action. Exactly one parent — an HSE incident or an NCR — by
 * CHECK `num_nonnulls(...) = 1`. VERIFIED requires an effectiveness assessment and a verifier who
 * is not the CAPA owner. V1 writes CAPA rows only through API-096 for NCR parents; the incident
 * parent column exists per the data model but no V1 operation populates it (recorded deferral).
 */
@Entity({ name: 'capa_actions' })
@Unique('uq_capa_actions_tenant_id', ['tenantId', 'id'])
@Unique('uq_capa_actions_project_id', ['tenantId', 'projectId', 'id'])
@Index('idx_capa_register', ['tenantId', 'projectId', 'status'])
@Check('ck_capa_parent', 'num_nonnulls(hse_incident_id, ncr_id) = 1')
@Check('ck_capa_status', "status IN ('OPEN','VERIFIED')")
@Check('ck_capa_verified', `status <> 'VERIFIED' OR (verified_by IS NOT NULL
  AND effectiveness_assessment IS NOT NULL AND length(trim(effectiveness_assessment)) > 0)`)
@Check('ck_capa_verifier_independent', 'verified_by IS NULL OR verified_by <> owner_id')
@Check('ck_capa_verified_pair', '(verified_by IS NULL) = (verified_at IS NULL)')
@Check('ck_capa_version', 'version_no >= 1')
export class CapaActionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'hse_incident_id', nullable: true }) hseIncidentId!: string | null;
  @Column('uuid', { name: 'ncr_id', nullable: true }) ncrId!: string | null;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: CapaActionStatus;
  @Column({ name: 'effectiveness_assessment', type: 'varchar', length: 2000, nullable: true })
  effectivenessAssessment!: string | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
