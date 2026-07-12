import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn
} from 'typeorm';
import { DependencyType } from './project-controls.enums';

@Entity({ name: 'activity_dependencies' })
@Unique('uq_activity_dependencies_tenant_id', ['tenantId', 'id'])
@Unique('uq_activity_dependency_edge', [
  'tenantId', 'predecessorId', 'successorId', 'dependencyType'
])
@Index('idx_activity_dependency_successor', ['tenantId', 'scheduleId', 'successorId'])
@Index('idx_activity_dependency_predecessor', ['tenantId', 'scheduleId', 'predecessorId'])
@Check('ck_activity_dependency_not_self', 'predecessor_id <> successor_id')
@Check('ck_activity_dependency_lag', 'lag_work_days BETWEEN -3650 AND 3650')
export class ActivityDependencyEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'schedule_id' }) scheduleId!: string;
  @Column('uuid', { name: 'predecessor_id' }) predecessorId!: string;
  @Column('uuid', { name: 'successor_id' }) successorId!: string;
  @Column({ name: 'dependency_type', type: 'varchar', length: 2 }) dependencyType!: DependencyType;
  @Column({ name: 'lag_work_days', type: 'integer', default: 0 }) lagWorkDays!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
