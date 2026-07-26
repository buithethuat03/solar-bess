import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  BidSealedStatus, EvaluationType, RequisitionStatus, RfqStatus, SupplierQualificationStatus
} from './procurement-logistics.enums';

/**
 * DB-044 — tenant-scoped supplier/qualification profile (FR-061). One row per (company, category):
 * the same company may be qualified for PV modules but only pending for BESS. Profiles expire —
 * `protect_supplier_profile_history` forbids hard deletes — and eligibility for RFQ invitations
 * (API-078) is QUALIFIED with `valid_to` not in the past, compared in SQL against CURRENT_DATE.
 *
 * No create/update operation exists in the catalog (recorded spec gap, same as cost codes): the
 * project-master seed provides a small QUALIFIED demo set so API-076…API-082 are usable.
 */
@Entity({ name: 'supplier_profiles' })
@Unique('uq_supplier_profiles_tenant_id', ['tenantId', 'id'])
@Unique('uq_supplier_profile_company_category', ['tenantId', 'companyId', 'category'])
@Index('idx_supplier_profile_category', ['tenantId', 'category', 'qualificationStatus'])
@Check('ck_supplier_profile_category', "category ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_supplier_profile_status',
  "qualification_status IN ('PENDING','QUALIFIED','SUSPENDED','EXPIRED')")
@Check('ck_supplier_profile_window', 'valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from')
@Check('ck_supplier_profile_version', 'version_no >= 1')
export class SupplierProfileEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'company_id' }) companyId!: string;
  @Column('uuid', { name: 'legal_entity_id' }) legalEntityId!: string;
  @Column({ type: 'varchar', length: 80 }) category!: string;
  @Column({ name: 'qualification_status', type: 'varchar', length: 20 })
  qualificationStatus!: SupplierQualificationStatus;
  @Column({ name: 'valid_from', type: 'date', nullable: true }) validFrom!: string | null;
  @Column({ name: 'valid_to', type: 'date', nullable: true }) validTo!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-045 — purchase requisition header (FR-062). Project AND package are mandatory scope; the WBS
 * reference is optional and bound to the same project by a composite key that exists in the merged
 * migration chain (`uq_wbs_nodes_tenant_project_id`). V1 writes DRAFT on create only — the
 * TECHNICAL_CHECK…SOURCING walk rides the workflow engine later (recorded deferral), so RFQs may
 * be issued from a DRAFT requisition in V1.
 */
@Entity({ name: 'requisitions' })
@Unique('uq_requisitions_tenant_id', ['tenantId', 'id'])
@Unique('uq_requisitions_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_requisition_project_number', ['tenantId', 'projectId', 'number'])
@Index('idx_requisition_register', ['tenantId', 'projectId', 'status'])
@Check('ck_requisition_number', "number ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_requisition_status', `status IN ('DRAFT','TECHNICAL_CHECK','COST_CHECK','SUBMITTED','APPROVED','RETURNED','REJECTED','SOURCING')`)
@Check('ck_requisition_version', 'version_no >= 1')
export class RequisitionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id' }) packageId!: string;
  @Column('uuid', { name: 'wbs_id', nullable: true }) wbsId!: string | null;
  @Column('uuid', { name: 'cost_code_id' }) costCodeId!: string;
  @Column({ type: 'varchar', length: 80 }) number!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 2000, nullable: true }) description!: string | null;
  @Column({ name: 'need_by_date', type: 'date' }) needByDate!: string;
  @Column({ type: 'varchar', length: 20 }) status!: RequisitionStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-046 — RFQ revision (FR-063/FR-066). `project_id` is denormalized and bound back through
 * `requisitions (tenant_id, project_id, id)` — recorded resolution of the data-dictionary
 * contradiction that scoped RFQ numbers per project while only referencing the requisition.
 *
 * `invited_supplier_ids` is a jsonb snapshot of DB-044 ids validated at issue time; the dictionary
 * allocates no DB id for an invitation child table, so none exists (recorded).
 *
 * `protect_rfq_history`: once ISSUED, the business columns (requisition, project, number, revision,
 * due date, invitation snapshot) are immutable; only the forward status walk and the award triple
 * may change, and rows are never deleted past RFQ_DRAFT.
 */
@Entity({ name: 'rfqs' })
@Unique('uq_rfqs_tenant_id', ['tenantId', 'id'])
@Unique('uq_rfqs_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_rfq_project_number_revision', ['tenantId', 'projectId', 'number', 'revision'])
@Index('idx_rfq_register', ['tenantId', 'projectId', 'status'])
@Check('ck_rfq_number', "number ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_rfq_revision', 'revision >= 1')
@Check('ck_rfq_status', `status IN ('RFQ_DRAFT','ISSUED','BID_OPEN','CLOSED','TECHNICAL_EVALUATION','COMMERCIAL_EVALUATION','AWARD_SUBMITTED','AWARD_APPROVED','REJECTED')`)
@Check('ck_rfq_invited_suppliers_array', "jsonb_typeof(invited_supplier_ids) = 'array'")
@Check('ck_rfq_invited_suppliers_present', 'jsonb_array_length(invited_supplier_ids) >= 1')
@Check('ck_rfq_award_pair', `((award_submitted_by IS NULL) = (award_submitted_at IS NULL))
  AND ((award_submitted_by IS NULL) = (awarded_bid_id IS NULL))`)
@Check('ck_rfq_award_status', `(status IN ('AWARD_SUBMITTED','AWARD_APPROVED'))
  = (awarded_bid_id IS NOT NULL)`)
@Check('ck_rfq_version', 'version_no >= 1')
export class RfqEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'requisition_id' }) requisitionId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ type: 'varchar', length: 80 }) number!: string;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ name: 'due_date', type: 'timestamptz' }) dueDate!: Date;
  @Column({ name: 'invited_supplier_ids', type: 'jsonb' }) invitedSupplierIds!: string[];
  @Column({ type: 'varchar', length: 30 }) status!: RfqStatus;
  @Column('uuid', { name: 'awarded_bid_id', nullable: true }) awardedBidId!: string | null;
  @Column('uuid', { name: 'award_submitted_by', nullable: true }) awardSubmittedBy!: string | null;
  @Column({ name: 'award_submitted_at', type: 'timestamptz', nullable: true })
  awardSubmittedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-047 — sealed bid (FR-064). API-079 (supplier bid submission) is DEFERRED because no external
 * supplier identity exists; rows are created only through the internal fixture path so evaluations
 * (DB-048) stay testable. Modeled fully regardless.
 *
 * SEALING IS A SERIALIZATION ACL: while the parent RFQ status is before CLOSED, `total`,
 * `currency` and `payload_ref` are never serialized in any API response — see
 * `RFQ_BID_VISIBLE_STATUSES`.
 */
@Entity({ name: 'bids' })
@Unique('uq_bids_tenant_id', ['tenantId', 'id'])
@Unique('uq_bids_rfq_id', ['tenantId', 'rfqId', 'id'])
@Unique('uq_bid_rfq_supplier_revision', ['tenantId', 'rfqId', 'supplierProfileId', 'revision'])
@Check('ck_bid_revision', 'revision >= 1')
@Check('ck_bid_sealed_status', "sealed_status IN ('SEALED','OPENED')")
@Check('ck_bid_total', 'total >= 0')
@Check('ck_bid_currency', "currency ~ '^[A-Z]{3}$'")
export class BidEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'rfq_id' }) rfqId!: string;
  @Column('uuid', { name: 'supplier_profile_id' }) supplierProfileId!: string;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ name: 'sealed_status', type: 'varchar', length: 10 })
  sealedStatus!: BidSealedStatus;
  /** numeric(19,4) money as string; never a JS number. Sealed until the RFQ reaches CLOSED. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) total!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  /** Opaque reference payload (document refs etc.); sealed with the commercial fields. */
  @Column({ name: 'payload_ref', type: 'jsonb', nullable: true })
  payloadRef!: Record<string, unknown> | null;
  @Column({ name: 'submitted_at', type: 'timestamptz' }) submittedAt!: Date;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-048 — technical/commercial evaluation of one bid (FR-065). Versioned per
 * (bid, type, evaluator); the version is allocated in-transaction. A commercial normalization that
 * differs from the sealed bid total requires an override reason — enforced as a service-level 422
 * (EVALUATION_OVERRIDE_REASON_REQUIRED) because the comparison crosses tables in Postgres numeric.
 * `protect_evaluation_history` freezes evaluations once the parent RFQ reaches AWARD_SUBMITTED.
 */
@Entity({ name: 'evaluations' })
@Unique('uq_evaluations_tenant_id', ['tenantId', 'id'])
@Unique('uq_evaluation_bid_type_version_evaluator',
  ['tenantId', 'bidId', 'evaluationType', 'version', 'evaluatorId'])
@Index('idx_evaluation_bid', ['tenantId', 'bidId', 'evaluationType'])
@Check('ck_evaluation_type', "evaluation_type IN ('TECHNICAL','COMMERCIAL')")
@Check('ck_evaluation_version', 'version >= 1')
@Check('ck_evaluation_normalized_pair', '(normalized_total IS NULL) = (currency IS NULL)')
@Check('ck_evaluation_normalized_total', 'normalized_total IS NULL OR normalized_total >= 0')
@Check('ck_evaluation_currency', "currency IS NULL OR currency ~ '^[A-Z]{3}$'")
export class EvaluationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'bid_id' }) bidId!: string;
  @Column({ name: 'evaluation_type', type: 'varchar', length: 20 })
  evaluationType!: EvaluationType;
  @Column({ type: 'integer' }) version!: number;
  @Column('uuid', { name: 'evaluator_id' }) evaluatorId!: string;
  /** numeric(19,4) money as string; compared with the bid total only inside Postgres. */
  @Column({ name: 'normalized_total', type: 'numeric', precision: 19, scale: 4, nullable: true })
  normalizedTotal!: string | null;
  @Column({ type: 'char', length: 3, nullable: true }) currency!: string | null;
  @Column({ name: 'normalization_basis', type: 'varchar', length: 400, nullable: true })
  normalizationBasis!: string | null;
  @Column({ name: 'override_reason', type: 'varchar', length: 2000, nullable: true })
  overrideReason!: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) notes!: string | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
