import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { MasterRecordStatus } from './project.enums';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'roles' })
@Unique('uq_role_tenant_code', ['tenantId', 'code'])
export class RoleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'roles_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 120 }) name!: string;
  @Column({ type: 'jsonb' }) permissions!: string[];
  @Column({ name: 'policy_version', type: 'integer' }) policyVersion!: number;
  @Column({ type: 'varchar', length: 20 }) status!: MasterRecordStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
