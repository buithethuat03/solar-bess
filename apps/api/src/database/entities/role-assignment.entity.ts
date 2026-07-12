import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { AssignmentScopeType, MasterRecordStatus } from './project.enums';
import { RoleEntity } from './role.entity';
import { TenantEntity } from './tenant.entity';
import { UserAccountEntity } from './user-account.entity';

@Entity({ name: 'role_assignments' })
@Index('idx_role_assignment_effective', ['tenantId', 'userAccountId', 'status', 'effectiveFrom', 'effectiveTo'])
export class RoleAssignmentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'role_assignments_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'user_account_id' }) userAccountId!: string;
  @ManyToOne(() => UserAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_account_id', foreignKeyConstraintName: 'role_assignments_user_account_id_fkey' }) userAccount!: UserAccountEntity;
  @Column('uuid', { name: 'role_id' }) roleId!: string;
  @ManyToOne(() => RoleEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id', foreignKeyConstraintName: 'role_assignments_role_id_fkey' }) role!: RoleEntity;
  @Column({ name: 'scope_type', type: 'varchar', length: 30 }) scopeType!: AssignmentScopeType;
  @Column('uuid', { name: 'scope_id', nullable: true }) scopeId!: string | null;
  @Column({ name: 'effective_from', type: 'timestamptz' }) effectiveFrom!: Date;
  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true }) effectiveTo!: Date | null;
  @Column({ type: 'varchar', length: 20 }) status!: MasterRecordStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
