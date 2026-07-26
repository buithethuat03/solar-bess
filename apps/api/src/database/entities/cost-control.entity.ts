import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  BudgetVersionStatus, CommitmentSourceType, CommitmentStatus, CostCodeClass, CostCodeStatus,
  InvoiceStatus, PaymentComponentType, PaymentStatus
} from './contract-cost.enums';

/**
 * DB-034 — tenant-scoped cost code catalog. No CRUD operation exists for cost codes in the
 * operation catalog (recorded spec gap); the project-master seed provides a small demo set so the
 * cost domain is usable and testable.
 */
@Entity({ name: 'cost_codes' })
@Unique('uq_cost_codes_tenant_id', ['tenantId', 'id'])
@Unique('uq_cost_code_code', ['tenantId', 'code'])
@Index('idx_cost_code_status', ['tenantId', 'status'])
@Check('ck_cost_code_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,39}$'")
@Check('ck_cost_code_class', "capex_opex_class IN ('CAPEX','OPEX')")
@Check('ck_cost_code_status', "status IN ('ACTIVE','INACTIVE','ARCHIVED')")
@Check('ck_cost_code_parent', 'parent_cost_code_id IS NULL OR parent_cost_code_id <> id')
@Check('ck_cost_code_window', 'effective_to IS NULL OR effective_to > effective_from')
@Check('ck_cost_code_version', 'version_no >= 1')
export class CostCodeEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'parent_cost_code_id', nullable: true })
  parentCostCodeId!: string | null;
  @Column({ type: 'varchar', length: 40 }) code!: string;
  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Column({ name: 'capex_opex_class', type: 'varchar', length: 10 })
  capexOpexClass!: CostCodeClass;
  @Column({ type: 'varchar', length: 20 }) status!: CostCodeStatus;
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom!: string;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-035 — budget version header (FR-053). Header-only in V1: line items are deliberately deferred
 * and have no DB id allocated. The partial unique index `uq_budget_version_approved` guarantees at
 * most one APPROVED baseline per project; the approve operation itself does not exist yet, so the
 * SoD check (`approved_by <> submitted_by`) is pre-enforced for it.
 */
@Entity({ name: 'budget_versions' })
@Unique('uq_budget_versions_tenant_id', ['tenantId', 'id'])
@Unique('uq_budget_versions_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_budget_version_number', ['tenantId', 'projectId', 'budgetVersion'])
@Index('uq_budget_version_approved', ['tenantId', 'projectId'], {
  unique: true, where: "status = 'APPROVED'"
})
@Check('ck_budget_version_number', 'budget_version >= 1')
@Check('ck_budget_version_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_budget_version_amount', 'total_amount >= 0')
@Check('ck_budget_version_status', "status IN ('DRAFT','SUBMITTED','APPROVED','SUPERSEDED')")
@Check('ck_budget_version_snapshot_pair', '(snapshot IS NULL) = (snapshot_hash IS NULL)')
@Check('ck_budget_version_hash_format', "snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_budget_version_submitted_pair', '(submitted_by IS NULL) = (submitted_at IS NULL)')
@Check('ck_budget_version_approved_pair', '(approved_by IS NULL) = (approved_at IS NULL)')
@Check('ck_budget_version_sod', `approved_by IS NULL OR submitted_by IS NULL
  OR approved_by <> submitted_by`)
@Check('ck_budget_version_submitted_status', "status = 'DRAFT' OR submitted_by IS NOT NULL")
@Check('ck_budget_version_approved_by', "status <> 'APPROVED' OR approved_by IS NOT NULL")
@Check('ck_budget_version_approved_snapshot', `status NOT IN ('APPROVED','SUPERSEDED')
  OR snapshot_hash IS NOT NULL`)
@Check('ck_budget_version_version', 'version_no >= 1')
export class BudgetVersionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ name: 'budget_version', type: 'integer' }) budgetVersion!: number;
  @Column({ type: 'char', length: 3 }) currency!: string;
  /** numeric(19,4) money as string; summed only in SQL. */
  @Column({ name: 'total_amount', type: 'numeric', precision: 19, scale: 4 })
  totalAmount!: string;
  @Column({ type: 'varchar', length: 20 }) status!: BudgetVersionStatus;
  @Column({ type: 'jsonb', nullable: true }) snapshot!: Record<string, unknown> | null;
  @Column({ name: 'snapshot_hash', type: 'char', length: 64, nullable: true })
  snapshotHash!: string | null;
  @Column('uuid', { name: 'submitted_by', nullable: true }) submittedBy!: string | null;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt!: Date | null;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-036 — a committed amount against a cost code (FR-054). `uq_commitment_source` on
 * (tenant, source_type, source_id, source_version) is the anti-duplicate control: recording the
 * same contract version twice conflicts instead of double-counting. Reversals are new negative
 * rows referencing the original — the ledger is append-only. No `purchase_order_id`: Procurement
 * is deferred.
 */
@Entity({ name: 'commitments' })
@Unique('uq_commitments_tenant_id', ['tenantId', 'id'])
@Unique('uq_commitments_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_commitment_source', ['tenantId', 'sourceType', 'sourceId', 'sourceVersion'])
@Index('idx_commitment_summary', ['tenantId', 'projectId', 'currency', 'status'])
@Index('idx_commitment_cost_code', ['tenantId', 'costCodeId'])
@Check('ck_commitment_status', "status IN ('ACTIVE','REVERSED','CLOSED')")
@Check('ck_commitment_source_type', "source_type IN ('CONTRACT','CONTRACT_APPENDIX')")
@Check('ck_commitment_contract_presence', `(source_type IN ('CONTRACT','CONTRACT_APPENDIX'))
  = (contract_id IS NOT NULL)`)
@Check('ck_commitment_amount_sign', `(reverses_commitment_id IS NULL AND amount > 0)
  OR (reverses_commitment_id IS NOT NULL AND amount < 0)`)
@Check('ck_commitment_source_version', 'source_version >= 1')
@Check('ck_commitment_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_commitment_version', 'version_no >= 1')
export class CommitmentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'contract_id', nullable: true }) contractId!: string | null;
  @Column('uuid', { name: 'cost_code_id' }) costCodeId!: string;
  /** Signed numeric(19,4) money as string: originals positive, reversals negative. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) amount!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 20 }) status!: CommitmentStatus;
  @Column({ name: 'source_type', type: 'varchar', length: 30 }) sourceType!: CommitmentSourceType;
  @Column('uuid', { name: 'source_id' }) sourceId!: string;
  @Column({ name: 'source_version', type: 'integer' }) sourceVersion!: number;
  @Column('uuid', { name: 'reverses_commitment_id', nullable: true })
  reversesCommitmentId!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-037 — supplier invoice (FR-056). `uq_invoice_supplier_number` on
 * (tenant, contract, supplier legal entity, invoice number) is the duplicate-invoice control.
 * Deliberately NO CHECK that net = gross - vat: the tax rule is TBD, and storing an unverified
 * triple is safe while enforcing a wrong rule is not.
 */
@Entity({ name: 'invoices' })
@Unique('uq_invoices_tenant_id', ['tenantId', 'id'])
@Unique('uq_invoices_contract_id', ['tenantId', 'contractId', 'id'])
@Unique('uq_invoice_supplier_number', ['tenantId', 'contractId', 'supplierLegalEntityId', 'invoiceNo'])
@Index('idx_invoice_status', ['tenantId', 'contractId', 'status'])
@Check('ck_invoice_gross_amount', 'gross_amount >= 0')
@Check('ck_invoice_vat_amount', 'vat_amount >= 0')
@Check('ck_invoice_net_amount', 'net_amount >= 0')
@Check('ck_invoice_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_invoice_status', "status IN ('RECEIVED','MATCHED','DISPUTED','CANCELLED')")
@Check('ck_invoice_version', 'version_no >= 1')
export class InvoiceEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'contract_id' }) contractId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'supplier_company_id' }) supplierCompanyId!: string;
  @Column('uuid', { name: 'supplier_legal_entity_id' }) supplierLegalEntityId!: string;
  @Column({ name: 'invoice_no', type: 'varchar', length: 80 }) invoiceNo!: string;
  @Column({ name: 'invoice_date', type: 'date' }) invoiceDate!: string;
  /** numeric(19,4) money as string; the gross/vat/net relation is stored, never recomputed. */
  @Column({ name: 'gross_amount', type: 'numeric', precision: 19, scale: 4 })
  grossAmount!: string;
  @Column({ name: 'vat_amount', type: 'numeric', precision: 19, scale: 4 }) vatAmount!: string;
  @Column({ name: 'net_amount', type: 'numeric', precision: 19, scale: 4 }) netAmount!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 20 }) status!: InvoiceStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-038 — payment request lifecycle (FR-056/FR-060). Payer and payee are distinct legal entities
 * by CHECK; approver SoD is pre-enforced as a row constraint. `uq_payments_tenant_currency` lets
 * payment_components bind their currency to the payment's. PAID/RECONCILED rows are frozen and a
 * payment row can never be deleted — `protect_payment_history` enforces both.
 */
@Entity({ name: 'payments' })
@Unique('uq_payments_tenant_id', ['tenantId', 'id'])
@Unique('uq_payments_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_payments_tenant_currency', ['tenantId', 'id', 'currency'])
@Index('uq_payment_external_posting', ['tenantId', 'externalPostingRef'], {
  unique: true, where: 'external_posting_ref IS NOT NULL'
})
@Index('idx_payment_contract', ['tenantId', 'contractId', 'status'])
@Check('ck_payment_status', `status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','SENT','PAID','RECONCILED','CANCELLED')`)
@Check('ck_payment_requested_amount', 'requested_amount > 0')
@Check('ck_payment_approved_amount', 'approved_amount IS NULL OR approved_amount >= 0')
@Check('ck_payment_paid_amount', 'paid_amount IS NULL OR paid_amount >= 0')
@Check('ck_payment_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_payment_distinct_parties', 'payer_legal_entity_id <> payee_legal_entity_id')
@Check('ck_payment_sod', `approved_by IS NULL OR (approved_by <> requested_by
  AND (submitted_by IS NULL OR approved_by <> submitted_by))`)
@Check('ck_payment_paid_pair', '(paid_amount IS NULL) = (paid_at IS NULL)')
@Check('ck_payment_approved_status', "status <> 'APPROVED' OR approved_by IS NOT NULL")
@Check('ck_payment_paid_status', "status NOT IN ('PAID','RECONCILED') OR paid_amount IS NOT NULL")
@Check('ck_payment_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_payment_draft_evidence', `status = 'DRAFT' OR jsonb_array_length(evidence_refs) >= 1`)
@Check('ck_payment_version', 'version_no >= 1')
export class PaymentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'contract_id' }) contractId!: string;
  @Column('uuid', { name: 'invoice_id', nullable: true }) invoiceId!: string | null;
  @Column('uuid', { name: 'payer_company_id' }) payerCompanyId!: string;
  @Column('uuid', { name: 'payer_legal_entity_id' }) payerLegalEntityId!: string;
  @Column('uuid', { name: 'payee_company_id' }) payeeCompanyId!: string;
  @Column('uuid', { name: 'payee_legal_entity_id' }) payeeLegalEntityId!: string;
  @Column('uuid', { name: 'fx_snapshot_id', nullable: true }) fxSnapshotId!: string | null;
  @Column({ name: 'milestone_ref', type: 'varchar', length: 200, nullable: true })
  milestoneRef!: string | null;
  /** numeric(19,4) money as string; the component sum identity lives in Postgres, never here. */
  @Column({ name: 'requested_amount', type: 'numeric', precision: 19, scale: 4 })
  requestedAmount!: string;
  @Column({ name: 'approved_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  approvedAmount!: string | null;
  @Column({ name: 'paid_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  paidAmount!: string | null;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ type: 'varchar', length: 20 }) status!: PaymentStatus;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt!: Date | null;
  @Column({ name: 'bank_reference', type: 'varchar', length: 200, nullable: true })
  bankReference!: string | null;
  @Column({ name: 'external_posting_ref', type: 'varchar', length: 200, nullable: true })
  externalPostingRef!: string | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column('uuid', { name: 'submitted_by', nullable: true }) submittedBy!: string | null;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-039 — one line of a payment's breakdown. Currency is bound to the payment by
 * `fk_payment_component_payment` (tenant, payment, currency), and the sum identity — if any
 * component exists, SUM(amount) must equal the payment's requested_amount — is a DEFERRABLE
 * INITIALLY DEFERRED constraint trigger computed in Postgres numeric. Exactness lives there, never
 * in JS.
 */
@Entity({ name: 'payment_components' })
@Unique('uq_payment_components_tenant_id', ['tenantId', 'id'])
@Unique('uq_payment_component_sequence', ['tenantId', 'paymentId', 'componentType', 'sequenceNo'])
@Check('ck_payment_component_type', `component_type IN ('BASE','VAT','RETENTION','RETENTION_RELEASE','WITHHOLDING','ADVANCE_RECOVERY','OTHER_DEDUCTION')`)
@Check('ck_payment_component_sequence', 'sequence_no >= 1')
@Check('ck_payment_component_sign', `(component_type IN ('RETENTION','WITHHOLDING','ADVANCE_RECOVERY','OTHER_DEDUCTION') AND amount <= 0)
  OR (component_type IN ('BASE','VAT','RETENTION_RELEASE') AND amount >= 0)`)
@Check('ck_payment_component_currency', "currency ~ '^[A-Z]{3}$'")
export class PaymentComponentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'payment_id' }) paymentId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'component_type', type: 'varchar', length: 30 })
  componentType!: PaymentComponentType;
  /** Signed numeric(19,4) money as string. */
  @Column({ name: 'basis_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  basisAmount!: string | null;
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) rate!: string | null;
  @Column({ type: 'numeric', precision: 19, scale: 4 }) amount!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'rule_version', type: 'varchar', length: 40 }) ruleVersion!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-040 — an immutable FX rate observation. Never used to convert anything server-side; it only
 * records which rate a payment referenced. Unique per (tenant, source, rate date, pair).
 */
@Entity({ name: 'fx_snapshots' })
@Unique('uq_fx_snapshots_tenant_id', ['tenantId', 'id'])
@Unique('uq_fx_snapshot_key', ['tenantId', 'source', 'rateDate', 'baseCurrency', 'quoteCurrency'])
@Check('ck_fx_snapshot_base_currency', "base_currency ~ '^[A-Z]{3}$'")
@Check('ck_fx_snapshot_quote_currency', "quote_currency ~ '^[A-Z]{3}$'")
@Check('ck_fx_snapshot_distinct_currencies', 'base_currency <> quote_currency')
@Check('ck_fx_snapshot_rate', 'rate > 0')
export class FxSnapshotEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column({ name: 'base_currency', type: 'char', length: 3 }) baseCurrency!: string;
  @Column({ name: 'quote_currency', type: 'char', length: 3 }) quoteCurrency!: string;
  /** numeric(28,12) as string; never a JS number. */
  @Column({ type: 'numeric', precision: 28, scale: 12 }) rate!: string;
  @Column({ name: 'rate_date', type: 'date' }) rateDate!: string;
  @Column({ type: 'varchar', length: 80 }) source!: string;
  @Column({ name: 'captured_at', type: 'timestamptz', default: () => 'now()' }) capturedAt!: Date;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
}
