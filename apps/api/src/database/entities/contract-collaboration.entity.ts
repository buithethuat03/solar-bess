import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  ContractAppendixStatus, ContractAppendixType, ContractPartyRole, ObligationDecisionType,
  ObligationStatus
} from './contract-cost.enums';

/**
 * DB-029 — append-only legal snapshot of one party on one contract (FR-037). The snapshot copies
 * exactly the fields the legal-entity master actually holds (legal name, country, registration
 * number, tax id) plus the client-supplied representative/authority, so a later master edit can
 * never rewrite who signed. `snapshot_hash` is the canonical hash over that snapshot.
 */
@Entity({ name: 'contract_parties' })
@Unique('uq_contract_parties_tenant_id', ['tenantId', 'id'])
@Unique('uq_contract_parties_contract_id', ['tenantId', 'contractId', 'id'])
@Unique('uq_contract_party_role_entity', ['tenantId', 'contractId', 'partyRole', 'legalEntityId'])
@Index('idx_contract_party_contract', ['tenantId', 'contractId', 'partyRole'])
@Check('ck_contract_party_role', `party_role IN ('OWNER','EPC','VENDOR','LENDER','SUBCONTRACTOR','OFFTAKER')`)
@Check('ck_contract_party_country', "country_snapshot ~ '^[A-Z]{2}$'")
@Check('ck_contract_party_hash', "snapshot_hash ~ '^[0-9a-f]{64}$'")
export class ContractPartyEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'contract_id' }) contractId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'company_id' }) companyId!: string;
  @Column('uuid', { name: 'legal_entity_id' }) legalEntityId!: string;
  @Column({ name: 'party_role', type: 'varchar', length: 30 }) partyRole!: ContractPartyRole;
  @Column({ name: 'legal_name_snapshot', type: 'varchar', length: 250 }) legalNameSnapshot!: string;
  @Column({ name: 'country_snapshot', type: 'char', length: 2 }) countrySnapshot!: string;
  @Column({ name: 'registration_no_snapshot', type: 'varchar', length: 100 })
  registrationNoSnapshot!: string;
  @Column({ name: 'tax_id_snapshot', type: 'varchar', length: 100, nullable: true })
  taxIdSnapshot!: string | null;
  @Column({ name: 'representative_name', type: 'varchar', length: 200, nullable: true })
  representativeName!: string | null;
  @Column({ name: 'representative_title', type: 'varchar', length: 200, nullable: true })
  representativeTitle!: string | null;
  @Column({ name: 'authority_reference', type: 'varchar', length: 400, nullable: true })
  authorityReference!: string | null;
  @Column({ name: 'snapshot_at', type: 'timestamptz' }) snapshotAt!: Date;
  @Column({ name: 'snapshot_hash', type: 'char', length: 64 }) snapshotHash!: string;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-030 — appendix/amendment to one contract (FR-038). Its `currency` is bound to the parent
 * contract by `fk_contract_appendix_contract_currency`, so a cross-currency value impact cannot be
 * stored. `value_impact` is signed money: a deductive amendment is legal.
 */
@Entity({ name: 'contract_appendices' })
@Unique('uq_contract_appendices_tenant_id', ['tenantId', 'id'])
@Unique('uq_contract_appendices_contract_id', ['tenantId', 'contractId', 'id'])
@Unique('uq_contract_appendix_revision', ['tenantId', 'contractId', 'appendixNo', 'revisionNo'])
@Index('idx_contract_appendix_status', ['tenantId', 'contractId', 'status'])
@Check('ck_contract_appendix_number', "appendix_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_contract_appendix_revision', 'revision_no >= 1')
@Check('ck_contract_appendix_type', "type IN ('AMENDMENT','ADDENDUM')")
@Check('ck_contract_appendix_status', "status IN ('DRAFT','EFFECTIVE','SUPERSEDED','CANCELLED')")
@Check('ck_contract_appendix_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_contract_appendix_effective', "status <> 'EFFECTIVE' OR effective_date IS NOT NULL")
@Check('ck_contract_appendix_version', 'version_no >= 1')
export class ContractAppendixEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'contract_id' }) contractId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ name: 'appendix_no', type: 'varchar', length: 80 }) appendixNo!: string;
  @Column({ name: 'revision_no', type: 'integer', default: 1 }) revisionNo!: number;
  @Column({ type: 'varchar', length: 30 }) type!: ContractAppendixType;
  @Column({ name: 'effective_date', type: 'date', nullable: true }) effectiveDate!: string | null;
  /** Signed numeric(19,4) money as string; negative impacts are legal. */
  @Column({ name: 'value_impact', type: 'numeric', precision: 19, scale: 4, default: 0 })
  valueImpact!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column('uuid', { name: 'document_id', nullable: true }) documentId!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: ContractAppendixStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-031 — a contractual obligation (FR-039/FR-040). Obligor and beneficiary must be parties of
 * this very contract — the composite foreign keys carry `contract_id`, so a party of another
 * contract is unreferencable. Segregation of duties is a row constraint: the decision maker can be
 * neither the obligation owner nor its creator.
 *
 * Stored status never holds DUE/OVERDUE; those are derived in the API-059 SQL projection from
 * `due_date` vs the current date.
 */
@Entity({ name: 'obligations' })
@Unique('uq_obligations_tenant_id', ['tenantId', 'id'])
@Unique('uq_obligations_project_id', ['tenantId', 'projectId', 'id'])
@Index('idx_obligation_contract', ['tenantId', 'contractId', 'status', 'dueDate'])
@Check('ck_obligation_status', `status IN ('OPEN','DUE','OVERDUE','FULFILLED','WAIVED','CANCELLED')`)
@Check('ck_obligation_distinct_parties', 'obligor_party_id <> beneficiary_party_id')
@Check('ck_obligation_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_obligation_decision_pair', `(decision_by IS NULL) = (decision_at IS NULL)
  AND (decision_by IS NULL) = (decision_type IS NULL)`)
@Check('ck_obligation_decided_status', `(status IN ('FULFILLED','WAIVED')) = (decision_by IS NOT NULL)`)
@Check('ck_obligation_decision_type', `decision_type IS NULL
  OR (decision_type IN ('FULFILLED','WAIVED') AND decision_type = status)`)
@Check('ck_obligation_decision_evidence', `status NOT IN ('FULFILLED','WAIVED')
  OR (decision_evidence_refs IS NOT NULL AND jsonb_typeof(decision_evidence_refs) = 'array'
    AND jsonb_array_length(decision_evidence_refs) >= 1)`)
@Check('ck_obligation_sod', `decision_by IS NULL
  OR (decision_by <> owner_user_id AND decision_by <> created_by)`)
@Check('ck_obligation_version', 'version_no >= 1')
export class ObligationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'contract_id' }) contractId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'appendix_id', nullable: true }) appendixId!: string | null;
  @Column({ name: 'clause_ref', type: 'varchar', length: 200 }) clauseRef!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column('uuid', { name: 'obligor_party_id' }) obligorPartyId!: string;
  @Column('uuid', { name: 'beneficiary_party_id' }) beneficiaryPartyId!: string;
  @Column('uuid', { name: 'owner_user_id' }) ownerUserId!: string;
  @Column({ name: 'trigger_type', type: 'varchar', length: 30 }) triggerType!: string;
  @Column({ name: 'trigger_reference', type: 'varchar', length: 400, nullable: true })
  triggerReference!: string | null;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: ObligationStatus;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  @Column({ type: 'varchar', length: 2000, nullable: true }) consequence!: string | null;
  @Column({ name: 'decision_type', type: 'varchar', length: 20, nullable: true })
  decisionType!: ObligationDecisionType | null;
  @Column('uuid', { name: 'decision_by', nullable: true }) decisionBy!: string | null;
  @Column({ name: 'decision_at', type: 'timestamptz', nullable: true }) decisionAt!: Date | null;
  @Column({ name: 'decision_reason', type: 'varchar', length: 2000, nullable: true })
  decisionReason!: string | null;
  @Column({ name: 'decision_evidence_refs', type: 'jsonb', nullable: true })
  decisionEvidenceRefs!: string[] | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
