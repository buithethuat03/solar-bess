import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique
} from 'typeorm';
import { WorkflowApproverScope, WorkflowStepRule, WorkflowVersionStatus } from './workflow.enums';

/**
 * Routing grammar for DB-070. Role codes, quorum sizes and SLA hours are tenant configuration and
 * are never hard-coded — the publish-time validator only proves the graph is well formed.
 */
export interface WorkflowApproverSelector {
  roleCodes: string[];
  scope: WorkflowApproverScope;
}

export interface WorkflowRoutingStep {
  key: string;
  order: number;
  parallelGroup?: string;
  rule: WorkflowStepRule;
  quorum?: number;
  approverSelector: WorkflowApproverSelector;
  /** Used when the selector resolves to nobody, so a route can never silently dead-end. */
  fallbackRoleCodes: string[];
  /** Persisted now so the deferred SLA scheduler needs no migration; nothing reads it yet. */
  slaHours?: number;
}

export interface WorkflowRoutingCondition {
  field: string;
  operator: string;
  value: unknown;
  stepKey: string;
}

export interface WorkflowRoutingRules {
  version: number;
  steps: WorkflowRoutingStep[];
  conditions: WorkflowRoutingCondition[];
}

/** DB-070 — an immutable published snapshot of one definition's routing rules. */
@Entity({ name: 'workflow_versions' })
@Unique('uq_workflow_versions_tenant_id', ['tenantId', 'id'])
@Unique('uq_workflow_version_number', ['tenantId', 'workflowDefinitionId', 'version'])
@Index('idx_workflow_version_status', ['tenantId', 'workflowDefinitionId', 'status'])
@Check('ck_workflow_version_number', 'version >= 1')
@Check('ck_workflow_version_status', "status IN ('DRAFT','PUBLISHED','SUPERSEDED')")
@Check('ck_workflow_version_rules_object', "jsonb_typeof(routing_rules) = 'object'")
@Check('ck_workflow_version_publish_pair', '(published_by IS NULL) = (published_at IS NULL)')
@Check('ck_workflow_version_published_status', "status = 'DRAFT' OR published_by IS NOT NULL")
@Check('ck_workflow_version_draft_unpublished', "status <> 'DRAFT' OR published_by IS NULL")
// BR-034 maker-checker: whoever authored a version can never be the one who publishes it. Enforced
// in the service too, but kept here so no future code path can bypass it.
@Check('ck_workflow_version_maker_checker', 'published_by IS NULL OR published_by <> created_by')
@Check('ck_workflow_version_effective_window', 'effective_to IS NULL OR effective_to > effective_from')
export class WorkflowVersionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'workflow_definition_id' }) workflowDefinitionId!: string;
  @Column({ type: 'integer' }) version!: number;
  @Column({ type: 'varchar', length: 20 }) status!: WorkflowVersionStatus;
  @Column({ name: 'routing_rules', type: 'jsonb' }) routingRules!: WorkflowRoutingRules;
  @Column({ name: 'effective_from', type: 'timestamptz' }) effectiveFrom!: Date;
  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true }) effectiveTo!: Date | null;
  @Column({ name: 'rules_hash', type: 'varchar', length: 64 }) rulesHash!: string;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'published_by', nullable: true }) publishedBy!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
