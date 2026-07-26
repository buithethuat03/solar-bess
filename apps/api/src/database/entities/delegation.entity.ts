import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn
} from 'typeorm';
import { DelegationStatus } from './cross-cutting.enums';

/** The bounded reach of one delegation; empty arrays mean "no restriction of that kind". */
export interface DelegationScopeSnapshot {
  workflowDefinitionCodes: string[];
  projectIds: string[];
}

/**
 * DB-008 — a bounded, auditable hand-over of approval eligibility (FR-150, SEC-108/SEC-110).
 *
 * A delegation never expands authority: consuming it (workflow.service.ts decide path) still
 * re-evaluates the DELEGATOR's current roles, and SoD is enforced against both identities.
 * `ck_delegation_no_self` and the service-level chain refusal keep the graph one level deep.
 * There is deliberately no `value_limit` column: a stored limit nothing enforces would be a fake
 * control, so API-011 refuses the field outright (422 VALUE_LIMIT_NOT_SUPPORTED).
 */
@Entity({ name: 'delegations' })
@Unique('uq_delegations_tenant_id', ['tenantId', 'id'])
@Index('idx_delegation_delegate', ['tenantId', 'delegateId', 'status'])
@Index('idx_delegation_delegator', ['tenantId', 'delegatorId', 'status'])
@Check('ck_delegation_scope_object', "jsonb_typeof(scope) = 'object'")
@Check('ck_delegation_window', 'effective_from < effective_to')
@Check('ck_delegation_reason', 'length(trim(reason)) > 0')
@Check('ck_delegation_status', "status IN ('ACTIVE','REVOKED','EXPIRED')")
@Check('ck_delegation_no_self', 'delegator_id <> delegate_id')
// A revoked delegation must say who revoked it and when; any other status must not look revoked.
@Check('ck_delegation_revocation_pair', `(
  status = 'REVOKED' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL
) OR (
  status <> 'REVOKED' AND revoked_by IS NULL AND revoked_at IS NULL
)`)
export class DelegationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'delegator_id' }) delegatorId!: string;
  @Column('uuid', { name: 'delegate_id' }) delegateId!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) scope!: DelegationScopeSnapshot;
  @Column({ name: 'effective_from', type: 'timestamptz' }) effectiveFrom!: Date;
  @Column({ name: 'effective_to', type: 'timestamptz' }) effectiveTo!: Date;
  @Column({ type: 'varchar', length: 2000 }) reason!: string;
  @Column({ type: 'varchar', length: 20 }) status!: DelegationStatus;
  @Column('uuid', { name: 'revoked_by', nullable: true }) revokedBy!: string | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
