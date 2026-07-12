import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn
} from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { UserAccountEntity } from './user-account.entity';

@Entity({ name: 'audit_events' })
@Index('idx_audit_tenant_time', ['tenantId', 'occurredAt'])
export class AuditEventEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id', nullable: true }) tenantId!: string | null;
  @ManyToOne(() => TenantEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'audit_events_tenant_id_fkey' }) tenant!: TenantEntity | null;
  @Column('uuid', { name: 'actor_id', nullable: true }) actorId!: string | null;
  @ManyToOne(() => UserAccountEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_id', foreignKeyConstraintName: 'audit_events_actor_id_fkey' }) actor!: UserAccountEntity | null;
  @Column({ length: 80 }) action!: string;
  @Column({ length: 20 }) result!: string;
  @Column({ name: 'reason_code', type: 'varchar', length: 80, nullable: true }) reasonCode!: string | null;
  @Column({ name: 'correlation_id', length: 100 }) correlationId!: string;
  @Column({ name: 'ip_hash', type: 'varchar', length: 64, nullable: true }) ipHash!: string | null;
  @Column({ name: 'object_type', type: 'varchar', length: 80, nullable: true }) objectType!: string | null;
  @Column({ name: 'object_id', type: 'uuid', nullable: true }) objectId!: string | null;
  @Column({ type: 'jsonb', nullable: true }) payload!: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
}
