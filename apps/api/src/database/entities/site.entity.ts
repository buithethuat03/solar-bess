import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique, UpdateDateColumn } from 'typeorm';
import { MasterRecordStatus } from './project.enums';
import { ProjectEntity } from './project.entity';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'sites' })
@Unique('uq_site_project_code', ['tenantId', 'projectId', 'code'])
@Index('uq_site_project_primary', ['tenantId', 'projectId'], { unique: true, where: 'is_primary = true' })
@Index('uq_site_tenant_idempotency', ['tenantId', 'idempotencyKey'], { unique: true, where: 'idempotency_key IS NOT NULL' })
export class SiteEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'sites_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @ManyToOne(() => ProjectEntity, (project) => project.sites, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id', foreignKeyConstraintName: 'sites_project_id_fkey' }) project!: ProjectEntity;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) location!: string | null;
  @Column({ length: 100 }) timezone!: string;
  @Column({ name: 'is_primary', type: 'boolean' }) isPrimary!: boolean;
  @Column({ type: 'varchar', length: 20 }) status!: MasterRecordStatus;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, select: false }) idempotencyKey!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
