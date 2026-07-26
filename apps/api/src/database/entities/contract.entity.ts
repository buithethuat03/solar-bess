import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { ContractStatus, ContractType } from './contract-cost.enums';

/**
 * DB-028 — the commercial contract register row (FR-036). Project-scoped and deliberately without a
 * `package_id`: contracts are a project-level concern, so a package-only principal has no reach
 * into them at all.
 *
 * MONEY: `value` is `numeric(19,4)` surfaced as a TypeScript `string` with no transformer. No JS
 * `number` ever touches it; any arithmetic over it happens in Postgres `numeric`.
 *
 * `uq_contracts_tenant_currency` exists so currency-carrying foreign keys (appendices, invoices,
 * commitments) can bind their currency column to the contract's, making a currency mismatch
 * structurally impossible instead of merely validated.
 */
@Entity({ name: 'contracts' })
@Unique('uq_contracts_tenant_id', ['tenantId', 'id'])
@Unique('uq_contracts_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_contracts_tenant_currency', ['tenantId', 'id', 'currency'])
@Unique('uq_contract_project_number', ['tenantId', 'projectId', 'contractNo'])
@Index('idx_contract_register', ['tenantId', 'projectId', 'status', 'type'])
@Check('ck_contract_number', "contract_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_contract_type', `type IN ('EPC','EQUIPMENT_LEASE','PPA','ESCO','SUBCONTRACT','EQUIPMENT_PURCHASE')`)
@Check('ck_contract_status', `status IN ('DRAFT','REVIEW','APPROVED','SIGNED','EFFECTIVE','SUSPENDED','EXPIRED','CLOSED')`)
@Check('ck_contract_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_contract_value', 'value >= 0')
@Check('ck_contract_effective_window', `effective_from IS NULL OR effective_to IS NULL
  OR effective_to >= effective_from`)
@Check('ck_contract_signed_pair', '(signed_by IS NULL) = (signed_at IS NULL)')
@Check('ck_contract_signed_status', `status NOT IN ('SIGNED','EFFECTIVE','SUSPENDED','EXPIRED','CLOSED')
  OR signed_by IS NOT NULL`)
@Check('ck_contract_effective_requires_from', "status <> 'EFFECTIVE' OR effective_from IS NOT NULL")
@Check('ck_contract_version', 'version_no >= 1')
export class ContractEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ name: 'contract_no', type: 'varchar', length: 80 }) contractNo!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 30 }) type!: ContractType;
  @Column({ type: 'varchar', length: 20 }) status!: ContractStatus;
  @Column({ name: 'effective_from', type: 'date', nullable: true }) effectiveFrom!: string | null;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo!: string | null;
  /** numeric(19,4) money — always a string; never parse it into a JS number. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) value!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column('uuid', { name: 'root_document_id', nullable: true }) rootDocumentId!: string | null;
  @Column({ name: 'legal_hold', type: 'boolean', default: false }) legalHold!: boolean;
  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true }) signedAt!: Date | null;
  @Column('uuid', { name: 'signed_by', nullable: true }) signedBy!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
