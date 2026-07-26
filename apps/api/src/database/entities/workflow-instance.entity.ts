import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { WorkflowInstanceState, WorkflowObjectType } from './workflow.enums';
import type { WorkflowRoutingRules } from './workflow-version.entity';

/**
 * DB-071 — one running approval journey over one target aggregate.
 *
 * `project_id`/`package_id` are derived from the resolved target, never from the request body, and
 * exist so SEC-107/SEC-111 package ABAC can be filtered in SQL rather than row by row after paging.
 * `route_snapshot` freezes the published rules at start time so AC-069 holds: republishing a
 * definition must not alter an instance already in flight.
 */
@Entity({ name: 'workflow_instances' })
@Unique('uq_workflow_instances_tenant_id', ['tenantId', 'id'])
@Index('idx_workflow_instance_inbox', ['tenantId', 'state', 'createdAt'])
@Index('idx_workflow_instance_scope', ['tenantId', 'projectId', 'packageId', 'state'])
@Index('idx_workflow_instance_object', ['tenantId', 'objectType', 'objectId'])
@Check('ck_workflow_instance_state', `state IN (
  'SUBMITTED','IN_REVIEW','RETURNED','REJECTED','CONDITIONALLY_APPROVED',
  'APPROVED','CANCELLED','CONFIGURATION_ERROR','EXPIRED')`)
@Check('ck_workflow_instance_object_type', "object_type IN ('ChangeRequest')")
@Check('ck_workflow_instance_route_object', "jsonb_typeof(route_snapshot) = 'object'")
@Check('ck_workflow_instance_attempt', 'current_attempt_no >= 1')
@Check('ck_workflow_instance_version', 'version_no >= 1')
@Check('ck_workflow_instance_hash_format', "route_hash ~ '^[0-9a-f]{64}$'")
// A terminal state must have been closed by somebody, and a non-terminal one must not look closed.
@Check('ck_workflow_instance_closure_pair', `(
  state IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')
  AND closed_at IS NOT NULL
) OR (
  state NOT IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')
  AND closed_at IS NULL AND closed_by IS NULL
)`)
@Check('ck_workflow_instance_current_step', `state IN ('APPROVED','REJECTED','CANCELLED','EXPIRED','CONFIGURATION_ERROR')
  OR current_step_key IS NOT NULL`)
export class WorkflowInstanceEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'workflow_definition_id' }) workflowDefinitionId!: string;
  @Column('uuid', { name: 'workflow_version_id' }) workflowVersionId!: string;
  @Column({ name: 'object_type', type: 'varchar', length: 80 }) objectType!: WorkflowObjectType;
  @Column('uuid', { name: 'object_id' }) objectId!: string;
  @Column({ name: 'object_version', type: 'integer' }) objectVersion!: number;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ type: 'varchar', length: 30 }) state!: WorkflowInstanceState;
  @Column({ name: 'current_step_key', type: 'varchar', length: 80, nullable: true }) currentStepKey!: string | null;
  @Column({ name: 'current_attempt_no', type: 'integer', default: 1 }) currentAttemptNo!: number;
  @Column({ name: 'route_snapshot', type: 'jsonb' }) routeSnapshot!: WorkflowRoutingRules;
  @Column({ name: 'route_hash', type: 'varchar', length: 64 }) routeHash!: string;
  /** Reserved for the deferred SLA scheduler; always NULL until that slice lands. */
  @Column({ name: 'sla_due_at', type: 'timestamptz', nullable: true }) slaDueAt!: Date | null;
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column('uuid', { name: 'closed_by', nullable: true }) closedBy!: string | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt!: Date | null;
  @Column({ name: 'closure_reason', type: 'varchar', length: 2000, nullable: true }) closureReason!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
