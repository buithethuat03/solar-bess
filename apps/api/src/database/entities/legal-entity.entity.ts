import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { MasterRecordStatus } from './project.enums';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'legal_entities' })
@Unique('uq_legal_entity_registration', ['tenantId', 'country', 'registrationNo'])
@Unique('uq_legal_entities_tenant_company_id', ['tenantId', 'companyId', 'id'])
@Index('idx_legal_entity_company', ['tenantId', 'companyId', 'status'])
@Index('uq_legal_entity_tenant_idempotency', ['tenantId', 'idempotencyKey'], { unique: true, where: 'idempotency_key IS NOT NULL' })
export class LegalEntityEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'legal_entities_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'company_id' }) companyId!: string;
  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id', foreignKeyConstraintName: 'legal_entities_company_id_fkey' }) company!: CompanyEntity;
  @Column({ name: 'legal_name', length: 250 }) legalName!: string;
  @Column({ length: 2 }) country!: string;
  @Column({ name: 'registration_no', length: 100 }) registrationNo!: string;
  @Column({ name: 'tax_id', type: 'varchar', length: 100, nullable: true }) taxId!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: MasterRecordStatus;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, select: false }) idempotencyKey!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
