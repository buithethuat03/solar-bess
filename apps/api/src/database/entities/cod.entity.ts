import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  CodGateCategory, CodGateReviewDecision, CodGateStatus, CodPackageStatus
} from './commissioning-cod.enums';

/**
 * DB-076 — CODGate (FR-109…FR-113).
 *
 * RECORDED INTERPRETATION of the dictionary's ambiguous "UQ gate definition instance": one gate
 * instance per `(tenant_id, project_id, category, code)`. The dictionary names the columns
 * `category` + a gate definition but never spells the key out; keying on (project, category, code)
 * is the only reading under which a project's readiness matrix has exactly one row per condition,
 * which is what FR-112's matrix and AC-060's "critical condition missing" check both assume.
 *
 * `ck_cod_gate_waiver_allowed` is the AC-060 rule as a row constraint: a non-waivable gate can
 * never carry status WAIVED, whatever the service believes. `trg_cod_gate_decision_immutable`
 * freezes the row once it is ACCEPTED or WAIVED.
 */
@Entity({ name: 'cod_gates' })
@Unique('uq_cod_gates_tenant_id', ['tenantId', 'id'])
@Unique('uq_cod_gates_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_cod_gate_instance', ['tenantId', 'projectId', 'category', 'code'])
@Index('idx_cod_gate_register', ['tenantId', 'projectId', 'category', 'status'])
@Check('ck_cod_gate_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_cod_gate_category', `category IN ('LEGAL','CONTRACTUAL','TECHNICAL','QUALITY',
  'SAFETY','DOCUMENTATION','COMMERCIAL')`)
@Check('ck_cod_gate_status',
  "status IN ('PENDING','UNDER_REVIEW','ACCEPTED','REJECTED','WAIVED')")
@Check('ck_cod_gate_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_cod_gate_waiver_allowed', "NOT (status = 'WAIVED' AND waivable = false)")
@Check('ck_cod_gate_waived', `status <> 'WAIVED' OR (waived_by IS NOT NULL AND waived_at IS NOT NULL
  AND coalesce(length(trim(waiver_reason)), 0) > 0)`)
@Check('ck_cod_gate_waived_pair', '(waived_by IS NULL) = (waived_at IS NULL)')
@Check('ck_cod_gate_accepted',
  "status <> 'ACCEPTED' OR (accepted_by IS NOT NULL AND accepted_at IS NOT NULL)")
@Check('ck_cod_gate_accepted_pair', '(accepted_by IS NULL) = (accepted_at IS NULL)')
@Check('ck_cod_gate_version', 'version_no >= 1')
export class CodGateEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ type: 'varchar', length: 20 }) category!: CodGateCategory;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'boolean' }) mandatory!: boolean;
  @Column({ type: 'boolean' }) waivable!: boolean;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: CodGateStatus;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  /** AC-059: expired evidence can never satisfy a gate, so the expiry lives on the row. */
  @Column({ name: 'evidence_expiry', type: 'date', nullable: true })
  evidenceExpiry!: string | null;
  @Column('uuid', { name: 'accepted_by', nullable: true }) acceptedBy!: string | null;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @Column('uuid', { name: 'waived_by', nullable: true }) waivedBy!: string | null;
  @Column({ name: 'waived_at', type: 'timestamptz', nullable: true }) waivedAt!: Date | null;
  @Column({ name: 'waiver_reason', type: 'varchar', length: 2000, nullable: true })
  waiverReason!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-118 — CodGateReviewCycle. NEW canonical id allocated under the Product Owner's blanket
 * delegation for this slice, following the DB-114/DB-115/DB-116/DB-117 precedent
 * (DocumentExternalShare, StopWorkAction, NcrDispositionCycle and PunchClosureCycle were each
 * allocated the same way when a slice needed an entity the dictionary had not named): AC-059
 * requires every review round to keep its own submitter, reviewer, decision, comment and evidence
 * revision, and no dictionary entity carries that history.
 *
 * Structural mirror of `ncr_disposition_cycles`: `uq_cod_gate_review_cycle_sequence` orders the
 * rounds, `uq_cod_gate_review_cycle_open` allows one undecided round at a time,
 * `ck_cod_gate_review_cycle_sod` keeps the reviewer distinct from the submitter, and
 * `trg_cod_gate_review_cycle_protect` freezes a decided round.
 */
@Entity({ name: 'cod_gate_review_cycles' })
@Unique('uq_cod_gate_review_cycles_tenant_id', ['tenantId', 'id'])
@Unique('uq_cod_gate_review_cycle_sequence', ['tenantId', 'codGateId', 'sequenceNo'])
@Index('uq_cod_gate_review_cycle_open', ['tenantId', 'codGateId'], {
  unique: true, where: 'decision IS NULL'
})
@Index('idx_cod_gate_review_cycle_history', ['tenantId', 'projectId', 'codGateId', 'sequenceNo'])
@Check('ck_cod_gate_review_cycle_sequence', 'sequence_no >= 1')
@Check('ck_cod_gate_review_cycle_evidence', `jsonb_typeof(evidence_refs) = 'array'
  AND jsonb_array_length(evidence_refs) >= 1`)
@Check('ck_cod_gate_review_cycle_comment',
  'coalesce(length(trim(submission_comment)), 0) >= 3')
@Check('ck_cod_gate_review_cycle_decision', `(
    decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
  ) OR (
    decision IN ('PASS','FAIL','CONDITIONAL') AND coalesce(length(trim(decision_comment)), 0) >= 3
    AND decided_by IS NOT NULL AND decided_at IS NOT NULL
  )`)
@Check('ck_cod_gate_review_cycle_sod', 'decided_by IS NULL OR decided_by <> submitted_by')
export class CodGateReviewCycleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'cod_gate_id' }) codGateId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'evidence_refs', type: 'jsonb' }) evidenceRefs!: string[];
  @Column({ name: 'evidence_expiry', type: 'date', nullable: true })
  evidenceExpiry!: string | null;
  @Column({ name: 'submission_comment', type: 'varchar', length: 2000 })
  submissionComment!: string;
  @Column('uuid', { name: 'submitted_by' }) submittedBy!: string;
  @Column({ name: 'submitted_at', type: 'timestamptz' }) submittedAt!: Date;
  @Column({ type: 'varchar', length: 20, nullable: true })
  decision!: CodGateReviewDecision | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true })
  decisionComment!: string | null;
  @Column('uuid', { name: 'decided_by', nullable: true }) decidedBy!: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-077 — CODPackage (FR-112/FR-113). The signed package is the legal artefact: it carries the
 * readiness snapshot it was signed against plus `snapshot_hash`, a canonical SHA-256 over that
 * snapshot produced by the SHARED `canonicalHash` helper — the same serializer risk-change,
 * document-control and the daily-log signature already use.
 *
 * `ck_cod_package_sod` is the Segregation-of-Duties rule as a row constraint: the signer can never
 * be the submitter. `uq_cod_package_active` allows one non-terminal package per project, so a
 * project cannot have two competing COD submissions in flight.
 */
@Entity({ name: 'cod_packages' })
@Unique('uq_cod_packages_tenant_id', ['tenantId', 'id'])
@Unique('uq_cod_packages_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_cod_package_version', ['tenantId', 'projectId', 'version'])
@Index('uq_cod_package_active', ['tenantId', 'projectId'], {
  unique: true, where: "status IN ('DRAFT','READY','SUBMITTED')"
})
@Index('idx_cod_package_register', ['tenantId', 'projectId', 'status'])
@Check('ck_cod_package_status',
  "status IN ('DRAFT','READY','SUBMITTED','SIGNED','HANDED_OVER')")
@Check('ck_cod_package_version_no', 'version >= 1')
@Check('ck_cod_package_snapshot', "jsonb_typeof(readiness_snapshot) = 'object'")
@Check('ck_cod_package_snapshot_hash', "snapshot_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_cod_package_submitted_pair', '(submitted_by IS NULL) = (submitted_at IS NULL)')
@Check('ck_cod_package_submitted',
  "status NOT IN ('SUBMITTED','SIGNED','HANDED_OVER') OR submitted_by IS NOT NULL")
@Check('ck_cod_package_signed_pair', `((signed_by IS NULL) = (signed_at IS NULL))
  AND ((signed_by IS NULL) = (signer_snapshot IS NULL))`)
@Check('ck_cod_package_signed',
  "status NOT IN ('SIGNED','HANDED_OVER') OR signed_by IS NOT NULL")
@Check('ck_cod_package_sod', 'signed_by IS NULL OR signed_by <> submitted_by')
@Check('ck_cod_package_row_version', 'version_no >= 1')
export class CodPackageEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ type: 'integer' }) version!: number;
  @Column({ type: 'varchar', length: 20 }) status!: CodPackageStatus;
  @Column({ name: 'readiness_snapshot', type: 'jsonb' })
  readinessSnapshot!: Record<string, unknown>;
  @Column({ name: 'snapshot_hash', type: 'char', length: 64 }) snapshotHash!: string;
  @Column({ name: 'signed_artifact_ref', type: 'varchar', length: 500, nullable: true })
  signedArtifactRef!: string | null;
  @Column({ name: 'effective_at', type: 'timestamptz', nullable: true })
  effectiveAt!: Date | null;
  @Column({ name: 'legal_hold', type: 'boolean', default: false }) legalHold!: boolean;
  @Column('uuid', { name: 'submitted_by', nullable: true }) submittedBy!: string | null;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;
  @Column('uuid', { name: 'signed_by', nullable: true }) signedBy!: string | null;
  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true }) signedAt!: Date | null;
  @Column({ name: 'signer_snapshot', type: 'jsonb', nullable: true })
  signerSnapshot!: Record<string, unknown> | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-078 — Handover (FR-114).
 *
 * RESOLUTION OF A DOCUMENTED CONTRADICTION: the data dictionary says "UQ COD package+recipient
 * /version" while the ERD draws COD package → handover as 1:1. Those cannot both hold. The unique
 * key implemented here is `(tenant_id, cod_package_id, recipient_party_id)` — the dictionary's
 * reading minus the unsourced "/version" fragment, because no handover version column exists
 * anywhere in the dictionary row. It is also the weaker constraint of the two, so a project that
 * hands one COD package to a single recipient still satisfies the ERD's 1:1 picture, while a plant
 * handed to both an owner entity and an O&M contractor stays representable. Recorded for review.
 *
 * `trg_handover_accepted_immutable` freezes a row once it carries an acceptance.
 */
@Entity({ name: 'handovers' })
@Unique('uq_handovers_tenant_id', ['tenantId', 'id'])
@Unique('uq_handovers_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_handover_package_recipient', ['tenantId', 'codPackageId', 'recipientPartyId'])
@Index('idx_handover_register', ['tenantId', 'projectId', 'acceptedAt'])
@Check('ck_handover_parties', 'from_party_id <> recipient_party_id')
@Check('ck_handover_manifest', "jsonb_typeof(item_manifest) = 'array'")
@Check('ck_handover_open_items', "jsonb_typeof(open_items) = 'array'")
@Check('ck_handover_accepted_pair', '(accepted_by IS NULL) = (accepted_at IS NULL)')
@Check('ck_handover_version', 'version_no >= 1')
export class HandoverEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'cod_package_id' }) codPackageId!: string;
  @Column('uuid', { name: 'from_party_id' }) fromPartyId!: string;
  @Column('uuid', { name: 'recipient_party_id' }) recipientPartyId!: string;
  @Column({ name: 'item_manifest', type: 'jsonb', default: () => "'[]'::jsonb" })
  itemManifest!: Array<Record<string, unknown>>;
  @Column({ name: 'open_items', type: 'jsonb', default: () => "'[]'::jsonb" })
  openItems!: Array<Record<string, unknown>>;
  @Column('uuid', { name: 'accepted_by', nullable: true }) acceptedBy!: string | null;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
