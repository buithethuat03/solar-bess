import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { WbsNodeStatus } from './project-controls.enums';

@Entity({ name: 'wbs_nodes' })
@Unique('uq_wbs_nodes_tenant_id', ['tenantId', 'id'])
@Unique('uq_wbs_nodes_scope_id', ['tenantId', 'projectId', 'scheduleId', 'id'])
@Unique('uq_wbs_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_wbs_hierarchy', ['tenantId', 'scheduleId', 'parentWbsId', 'sortOrder'])
@Index('idx_wbs_scope_filters', ['tenantId', 'projectId', 'packageId', 'ownerId', 'status'])
@Check('ck_wbs_weight', 'weight > 0 AND weight <= 100')
@Check('ck_wbs_sort_order', 'sort_order >= 0')
@Check('ck_wbs_version', 'version_no >= 1')
@Check('ck_wbs_parent_not_self', 'parent_wbs_id IS NULL OR parent_wbs_id <> id')
export class WbsNodeEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'schedule_id' }) scheduleId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column('uuid', { name: 'parent_wbs_id', nullable: true }) parentWbsId!: string | null;
  @Column('uuid', { name: 'owner_id', nullable: true }) ownerId!: string | null;
  @Column({ length: 80 }) code!: string;
  @Column({ length: 250 }) name!: string;
  @Column({ type: 'varchar', length: 2000, nullable: true }) description!: string | null;
  @Column({ type: 'numeric', precision: 7, scale: 4 }) weight!: string;
  @Column({ name: 'sort_order', type: 'integer' }) sortOrder!: number;
  @Column({ type: 'varchar', length: 20 }) status!: WbsNodeStatus;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
