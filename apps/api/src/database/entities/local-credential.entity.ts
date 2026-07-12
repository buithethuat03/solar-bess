import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { UserAccountEntity } from './user-account.entity';

@Entity({ name: 'local_credentials' })
@Unique('uq_credential_tenant_user', ['tenantId', 'userAccountId'])
export class LocalCredentialEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'local_credentials_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'user_account_id' }) userAccountId!: string;
  @ManyToOne(() => UserAccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_account_id', foreignKeyConstraintName: 'local_credentials_user_account_id_fkey' }) userAccount!: UserAccountEntity;
  @Column({ name: 'password_hash', type: 'text', select: false }) passwordHash!: string;
  @Column({ length: 20, default: 'argon2id' }) algorithm!: string;
  @Column({ name: 'credential_version', type: 'integer', default: 1 }) credentialVersion!: number;
  @Column({ name: 'changed_at', type: 'timestamptz' }) changedAt!: Date;
}
