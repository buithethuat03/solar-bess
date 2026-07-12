import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn,
  Unique, UpdateDateColumn
} from 'typeorm';
import { CommandReceiptState } from './operational.enums';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'command_receipts' })
@Unique('uq_command_receipt_tenant_id', ['tenantId', 'id'])
@Unique('uq_command_receipt_scope', [
  'tenantId', 'actorType', 'actorId', 'operation', 'idempotencyKey'
])
@Index('idx_command_receipt_expiry', ['tenantId', 'state', 'expiresAt'])
@Check('ck_command_receipt_state', "state IN ('IN_PROGRESS','COMPLETED')")
@Check('ck_command_receipt_request_hash', "request_hash ~ '^[0-9a-f]{64}$'")
@Check(
  'ck_command_receipt_response_status',
  'response_status IS NULL OR (response_status >= 100 AND response_status <= 599)'
)
@Check('ck_command_receipt_expiry', 'expires_at > created_at')
export class CommandReceiptEntity {
  @PrimaryColumn('uuid') id!: string;

  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'command_receipts_tenant_id_fkey' })
  tenant!: TenantEntity;

  @Column({ name: 'actor_type', length: 40 }) actorType!: string;
  @Column('uuid', { name: 'actor_id' }) actorId!: string;
  @Column({ length: 120 }) operation!: string;
  @Column({ name: 'idempotency_key', length: 200 }) idempotencyKey!: string;
  @Column({ name: 'request_hash', length: 64 }) requestHash!: string;
  @Column({ type: 'varchar', length: 20 }) state!: CommandReceiptState;
  @Column({ name: 'response_status', type: 'integer', nullable: true }) responseStatus!: number | null;
  @Column({ name: 'response_body', type: 'jsonb', nullable: true }) responseBody!: any;
  @Column({ name: 'resource_type', type: 'varchar', length: 80, nullable: true }) resourceType!: string | null;
  @Column('uuid', { name: 'resource_id', nullable: true }) resourceId!: string | null;
  @Column({ name: 'correlation_id', length: 100 }) correlationId!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
