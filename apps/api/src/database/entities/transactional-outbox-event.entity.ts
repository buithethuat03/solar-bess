import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique
} from 'typeorm';
import { OutboxEventStatus } from './operational.enums';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'transactional_outbox_events' })
@Unique('uq_outbox_tenant_id', ['tenantId', 'id'])
@Unique('uq_outbox_tenant_event_key', ['tenantId', 'eventKey'])
@Unique('uq_outbox_aggregate_event', [
  'tenantId', 'aggregateType', 'aggregateId', 'aggregateVersion', 'eventType'
])
@Index('idx_outbox_publishable', ['tenantId', 'status', 'availableAt'])
@Index('idx_outbox_lock', ['tenantId', 'status', 'lockedAt'])
@Index('idx_outbox_relay', ['status', 'availableAt', 'occurredAt'])
@Check('ck_outbox_status', "status IN ('PENDING','PROCESSING','ENQUEUED','FAILED')")
@Check('ck_outbox_schema_version', 'schema_version >= 1')
@Check('ck_outbox_aggregate_version', 'aggregate_version IS NULL OR aggregate_version >= 0')
@Check('ck_outbox_attempt_count', 'attempt_count >= 0')
@Check('ck_outbox_lock_pair', '(locked_at IS NULL) = (locked_by IS NULL)')
@Check('ck_outbox_payload_object', "jsonb_typeof(payload) = 'object'")
export class TransactionalOutboxEventEntity {
  @PrimaryColumn('uuid') id!: string;

  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'transactional_outbox_events_tenant_id_fkey' })
  tenant!: TenantEntity;

  @Column('uuid', { name: 'actor_id', nullable: true }) actorId!: string | null;

  @Column({ name: 'event_key', length: 200 }) eventKey!: string;
  @Column({ name: 'aggregate_type', length: 80 }) aggregateType!: string;
  @Column('uuid', { name: 'aggregate_id' }) aggregateId!: string;
  @Column({ name: 'aggregate_version', type: 'integer', nullable: true }) aggregateVersion!: number | null;
  @Column({ name: 'event_type', length: 120 }) eventType!: string;
  @Column({ name: 'schema_version', type: 'integer' }) schemaVersion!: number;
  @Column({ type: 'jsonb' }) payload!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20 }) status!: OutboxEventStatus;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' }) availableAt!: Date;
  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true }) lockedAt!: Date | null;
  @Column({ name: 'locked_by', type: 'varchar', length: 100, nullable: true }) lockedBy!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount!: number;
  @Column({ name: 'last_error', type: 'varchar', length: 2000, nullable: true }) lastError!: string | null;
  @Column({ name: 'correlation_id', length: 100 }) correlationId!: string;
}
