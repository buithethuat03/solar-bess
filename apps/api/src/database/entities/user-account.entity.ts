import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn
} from 'typeorm';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'user_accounts' })
@Unique('uq_user_tenant_email', ['tenantId', 'normalizedEmail'])
export class UserAccountEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'user_accounts_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column({ length: 254 }) email!: string;
  @Column({ name: 'normalized_email', length: 254 }) normalizedEmail!: string;
  @Column({ name: 'display_name', length: 200 }) displayName!: string;
  @Column({ length: 20, default: 'ACTIVE' }) status!: string;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
