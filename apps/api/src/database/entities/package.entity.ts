import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { PackageStatus } from './project-controls.enums';

@Entity({ name: 'packages' })
@Unique('uq_packages_tenant_id', ['tenantId', 'id'])
@Unique('uq_packages_tenant_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_package_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_package_filters', ['tenantId', 'projectId', 'parentPackageId', 'status'])
@Index('uq_package_tenant_idempotency', ['tenantId', 'idempotencyKey'], {
  unique: true,
  where: 'idempotency_key IS NOT NULL'
})
@Check('ck_package_status', "status IN ('ACTIVE','INACTIVE','ARCHIVED')")
@Check('ck_package_version', 'version_no >= 1')
@Check('ck_package_parent_not_self', 'parent_package_id IS NULL OR parent_package_id <> id')
export class PackageEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'parent_package_id', nullable: true }) parentPackageId!: string | null;
  @Column('uuid', { name: 'contractor_company_id', nullable: true }) contractorCompanyId!: string | null;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 200 }) name!: string;
  @Column({ name: 'package_type', length: 80 }) packageType!: string;
  @Column({ type: 'varchar', length: 20 }) status!: PackageStatus;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, select: false })
  idempotencyKey!: string | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
