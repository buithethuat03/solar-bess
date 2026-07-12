import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn,
  Unique, UpdateDateColumn
} from 'typeorm';
import { EventConsumptionStatus } from './operational.enums';
import { TenantEntity } from './tenant.entity';
import { TransactionalOutboxEventEntity } from './transactional-outbox-event.entity';

@Entity({ name: 'event_consumptions' })
@Unique('uq_event_consumption_tenant_id', ['tenantId', 'id'])
@Unique('uq_event_consumption_dedupe', ['tenantId', 'consumerName', 'eventId'])
@Index('idx_event_consumption_claim', ['tenantId', 'consumerName', 'status', 'leaseUntil'])
@Check('ck_event_consumption_status', "status IN ('PROCESSING','PROCESSED','FAILED')")
@Check('ck_event_consumption_attempt_count', 'attempt_count >= 0')
export class EventConsumptionEntity {
  @PrimaryColumn('uuid') id!: string;

  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'event_consumptions_tenant_id_fkey' })
  tenant!: TenantEntity;

  @Column('uuid', { name: 'event_id' }) eventId!: string;

  @ManyToOne(() => TransactionalOutboxEventEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'tenant_id', referencedColumnName: 'tenantId',
      foreignKeyConstraintName: 'fk_event_consumption_tenant_event'
    },
    { name: 'event_id', referencedColumnName: 'id' }
  ])
  event!: TransactionalOutboxEventEntity;

  @Column({ name: 'consumer_name', length: 120 }) consumerName!: string;
  @Column({ name: 'handler_version', length: 64 }) handlerVersion!: string;
  @Column({ type: 'varchar', length: 20 }) status!: EventConsumptionStatus;
  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true }) leaseUntil!: Date | null;
  @Column({ name: 'attempt_count', type: 'integer', default: 0 }) attemptCount!: number;
  @Column({ name: 'last_error_hash', type: 'varchar', length: 64, nullable: true }) lastErrorHash!: string | null;
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true }) processedAt!: Date | null;
  @Column({ name: 'correlation_id', length: 100 }) correlationId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
