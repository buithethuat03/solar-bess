import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { WorkflowDefinitionStatus, WorkflowObjectType } from './workflow.enums';

/** DB-069 — the configurable approval process family for one object type. */
@Entity({ name: 'workflow_definitions' })
@Unique('uq_workflow_definitions_tenant_id', ['tenantId', 'id'])
@Unique('uq_workflow_definition_code', ['tenantId', 'code'])
@Index('idx_workflow_definition_status', ['tenantId', 'status'])
@Index('idx_workflow_definition_object', ['tenantId', 'objectType', 'status'])
@Check('ck_workflow_definition_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{1,79}$'")
@Check('ck_workflow_definition_status', "status IN ('ACTIVE','INACTIVE','ARCHIVED')")
@Check('ck_workflow_definition_object_type', "object_type IN ('ChangeRequest')")
@Check('ck_workflow_definition_version', 'version_no >= 1')
export class WorkflowDefinitionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 200 }) name!: string;
  @Column({ name: 'object_type', type: 'varchar', length: 80 }) objectType!: WorkflowObjectType;
  @Column('uuid', { name: 'process_owner_id' }) processOwnerId!: string;
  @Column({ type: 'varchar', length: 30 }) status!: WorkflowDefinitionStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
