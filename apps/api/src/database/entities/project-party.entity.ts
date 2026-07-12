import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn, VersionColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { LegalEntityEntity } from './legal-entity.entity';
import { ProjectEntity } from './project.entity';
import { ProjectPartyRole, RaciRole } from './project.enums';
import { TenantEntity } from './tenant.entity';

@Entity({ name: 'project_parties' })
@Index('idx_project_party_effective', ['tenantId', 'projectId', 'roleCode', 'effectiveFrom', 'effectiveTo'])
export class ProjectPartyEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'project_parties_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @ManyToOne(() => ProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_id', foreignKeyConstraintName: 'project_parties_project_id_fkey' }) project!: ProjectEntity;
  @Column('uuid', { name: 'company_id' }) companyId!: string;
  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'company_id', foreignKeyConstraintName: 'project_parties_company_id_fkey' }) company!: CompanyEntity;
  @Column('uuid', { name: 'legal_entity_id', nullable: true }) legalEntityId!: string | null;
  @ManyToOne(() => LegalEntityEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'legal_entity_id', foreignKeyConstraintName: 'project_parties_legal_entity_id_fkey' }) legalEntity!: LegalEntityEntity | null;
  @Column({ name: 'role_code', type: 'varchar', length: 30 }) roleCode!: ProjectPartyRole;
  @Column({ type: 'varchar', length: 20 }) raci!: RaciRole;
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom!: string;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo!: string | null;
  @Column({ name: 'contact_name', type: 'varchar', length: 200, nullable: true }) contactName!: string | null;
  @Column({ name: 'contact_email', type: 'varchar', length: 254, nullable: true }) contactEmail!: string | null;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
