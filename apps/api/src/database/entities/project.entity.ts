import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, Unique, UpdateDateColumn, VersionColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { LegalEntityEntity } from './legal-entity.entity';
import { PortfolioEntity } from './portfolio.entity';
import { ProjectPhase, ProjectRecordStatus, ProjectType } from './project.enums';
import { SiteEntity } from './site.entity';
import { TenantEntity } from './tenant.entity';
import { UserAccountEntity } from './user-account.entity';

@Entity({ name: 'projects' })
@Unique('uq_project_tenant_code', ['tenantId', 'code'])
@Index('idx_project_filters', ['tenantId', 'portfolioId', 'phase', 'recordStatus'])
@Index('uq_project_tenant_idempotency', ['tenantId', 'idempotencyKey'], { unique: true, where: 'idempotency_key IS NOT NULL' })
export class ProjectEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @ManyToOne(() => TenantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id', foreignKeyConstraintName: 'projects_tenant_id_fkey' }) tenant!: TenantEntity;
  @Column('uuid', { name: 'portfolio_id' }) portfolioId!: string;
  @ManyToOne(() => PortfolioEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'portfolio_id', foreignKeyConstraintName: 'projects_portfolio_id_fkey' }) portfolio!: PortfolioEntity;
  @Column('uuid', { name: 'owner_legal_entity_id' }) ownerLegalEntityId!: string;
  @ManyToOne(() => LegalEntityEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_legal_entity_id', foreignKeyConstraintName: 'projects_owner_legal_entity_id_fkey' }) ownerLegalEntity!: LegalEntityEntity;
  @Column('uuid', { name: 'customer_company_id' }) customerCompanyId!: string;
  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_company_id', foreignKeyConstraintName: 'projects_customer_company_id_fkey' }) customerCompany!: CompanyEntity;
  @Column('uuid', { name: 'project_manager_id', nullable: true }) projectManagerId!: string | null;
  @ManyToOne(() => UserAccountEntity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'project_manager_id', foreignKeyConstraintName: 'projects_project_manager_id_fkey' }) projectManager!: UserAccountEntity | null;
  @Column({ length: 64 }) code!: string;
  @Column({ length: 250 }) name!: string;
  @Column({ type: 'varchar', length: 20 }) type!: ProjectType;
  @Column({ type: 'varchar', length: 30 }) phase!: ProjectPhase;
  @Column({ name: 'record_status', type: 'varchar', length: 20 }) recordStatus!: ProjectRecordStatus;
  @Column({ name: 'contract_model', length: 80 }) contractModel!: string;
  @Column({ length: 3 }) currency!: string;
  @Column({ name: 'planned_cod', type: 'date' }) plannedCod!: string;
  @Column({ name: 'forecast_cod', type: 'date', nullable: true }) forecastCod!: string | null;
  @VersionColumn({ name: 'version_no', type: 'integer' }) versionNo!: number;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200, nullable: true, select: false }) idempotencyKey!: string | null;
  @OneToMany(() => SiteEntity, (site) => site.project) sites!: SiteEntity[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
