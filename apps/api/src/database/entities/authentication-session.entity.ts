import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique
} from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { UserAccountEntity } from './user-account.entity';

@Entity({ name: 'authentication_sessions' })
@Index('idx_session_tenant_user', ['tenantId', 'userAccountId'])
@Index('idx_session_family', ['tenantId', 'familyId'])
@Unique('authentication_sessions_refresh_jti_hash_key', ['refreshTokenHash'])
export class AuthenticationSessionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'authentication_sessions_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'user_account_id' }) userAccountId!: string;
  @ManyToOne(() => UserAccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_account_id', foreignKeyConstraintName: 'authentication_sessions_user_account_id_fkey' }) userAccount!: UserAccountEntity;
  @Column('uuid', { name: 'family_id' }) familyId!: string;
  @Column({ name: 'refresh_jti_hash', length: 64 }) refreshTokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'revoke_reason', type: 'varchar', length: 40, nullable: true }) revokeReason!: string | null;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt!: Date | null;
  @Column({ name: 'created_ip_hash', length: 64 }) createdIpHash!: string;
  @Column({ name: 'user_agent', length: 500, default: '' }) userAgent!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
