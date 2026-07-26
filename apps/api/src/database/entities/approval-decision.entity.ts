import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique
} from 'typeorm';
import { WorkflowDecision } from './workflow.enums';

/**
 * DB-072 — the append-only decision ledger. Rows are never updated or deleted (enforced by a trigger
 * in the migration), so the history of an instance is reconstructable in full.
 *
 * `attempt_no` exists because a RETURN legitimately re-runs the same step: without it the
 * "one decision per actor per step" rule would block the resubmission. `actor_id` and
 * `effective_actor_id` are separate columns from day one so US-018 delegation can populate a real
 * chain later without a schema change; today they are always equal.
 */
@Entity({ name: 'approval_decisions' })
@Unique('uq_approval_decisions_tenant_id', ['tenantId', 'id'])
@Unique('uq_approval_decision_sequence', ['tenantId', 'workflowInstanceId', 'sequenceNo'])
@Unique('uq_approval_decision_actor_attempt', [
  'tenantId', 'workflowInstanceId', 'stepKey', 'attemptNo', 'actorId'
])
@Index('idx_approval_decision_instance', ['tenantId', 'workflowInstanceId', 'sequenceNo'])
@Index('idx_approval_decision_actor', ['tenantId', 'effectiveActorId', 'decidedAt'])
@Check('ck_approval_decision_value', "decision IN ('APPROVE','REJECT','RETURN','CONDITIONAL_APPROVE')")
@Check('ck_approval_decision_sequence', 'sequence_no >= 1')
@Check('ck_approval_decision_attempt', 'attempt_no >= 1')
// AC-070: every decision is justified, so a comment is mandatory for all four decision types.
@Check('ck_approval_decision_comment', 'length(trim(comment)) >= 3')
@Check('ck_approval_decision_conditions_array', "jsonb_typeof(conditions) = 'array'")
@Check('ck_approval_decision_conditions_present', `decision = 'CONDITIONAL_APPROVE'
  OR jsonb_array_length(conditions) = 0`)
export class ApprovalDecisionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'workflow_instance_id' }) workflowInstanceId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'step_key', type: 'varchar', length: 80 }) stepKey!: string;
  @Column({ name: 'attempt_no', type: 'integer' }) attemptNo!: number;
  @Column({ type: 'varchar', length: 30 }) decision!: WorkflowDecision;
  /** The account that signed in. */
  @Column('uuid', { name: 'actor_id' }) actorId!: string;
  /** Who the decision counts for. Equal to actorId until US-018 delegation exists. */
  @Column('uuid', { name: 'effective_actor_id' }) effectiveActorId!: string;
  @Column({ type: 'varchar', length: 2000 }) comment!: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) conditions!: Record<string, unknown>[];
  @Column({ name: 'decided_at', type: 'timestamptz' }) decidedAt!: Date;
  @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
