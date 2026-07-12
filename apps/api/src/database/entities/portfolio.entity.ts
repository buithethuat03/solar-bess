import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { MasterRecordStatus } from './project.enums';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'portfolios' })
@Unique('uq_portfolio_tenant_code', ['tenantId', 'code'])
@Index('uq_portfolio_tenant_idempotency', ['tenantId', 'idempotencyKey'], { unique: true, where: 'idempotency_key IS NOT NULL' })
export class PortfolioEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'portfolios_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ type: 'varchar', length: 20 }) status!: MasterRecordStatus;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, select: false }) idempotencyKey!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
