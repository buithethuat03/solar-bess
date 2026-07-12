import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { MasterRecordStatus, OrganizationType } from './project.enums';

@Entity({ name: 'companies' })
@Unique('uq_company_tenant_code', ['tenantId', 'code'])
@Index('uq_company_tenant_idempotency', ['tenantId', 'idempotencyKey'], { unique: true, where: 'idempotency_key IS NOT NULL' })
export class CompanyEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'companies_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ name: 'organization_type', type: 'varchar', length: 30 }) organizationType!: OrganizationType;
  @Column({ type: 'varchar', length: 20 }) status!: MasterRecordStatus;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, select: false }) idempotencyKey!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
