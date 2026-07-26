import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { OpportunityStage } from './opportunity.enums';

/**
 * DB-014 — one pre-project business opportunity (US-025, WF-002).
 *
 * Tenant-scoped and deliberately WITHOUT a project reach: no project exists yet, so ABAC reach is
 * tenant-wide or nothing (see OpportunityService).
 *
 * `site_id` carries NO foreign key on purpose: sites (DB-011) are project-scoped children and no
 * project exists before conversion. The column records the surveyed site candidate as an opaque
 * reference until the domain gets a pre-project site register (recorded deliberate gap).
 *
 * `duplicate_key` is server-computed — sha256 over the normalized pair
 * (customer_company_id + lower(trim(location_text))) when both are present, else NULL (recorded
 * Assumption: this pair is the V1 duplicate-detection identity). The partial unique index turns a
 * duplicate submission into a structural 409 instead of a service-side race.
 *
 * MONEY/QUANTITY: `expected_capacity_kwp` is numeric(19,4) surfaced as a TypeScript string; no JS
 * `number` ever touches it.
 */
@Entity({ name: 'opportunities' })
@Unique('uq_opportunities_tenant_id', ['tenantId', 'id'])
@Unique('uq_opportunity_code', ['tenantId', 'code'])
@Index('uq_opportunity_duplicate_key', ['tenantId', 'duplicateKey'], {
  unique: true, where: 'duplicate_key IS NOT NULL'
})
@Index('idx_opportunity_pipeline', ['tenantId', 'stage', 'createdAt'])
@Index('idx_opportunity_customer', ['tenantId', 'customerCompanyId'])
@Check('ck_opportunity_code', "code ~ '^[A-Z0-9][A-Z0-9_./-]{0,63}$'")
@Check('ck_opportunity_stage', `stage IN (
  'LEAD','QUALIFIED','SURVEYED','SCENARIO_READY','SUBMITTED',
  'APPROVED','RETURNED','REJECTED','CONVERTED')`)
@Check('ck_opportunity_capacity', 'expected_capacity_kwp IS NULL OR expected_capacity_kwp > 0')
@Check('ck_opportunity_duplicate_key_format',
  "duplicate_key IS NULL OR duplicate_key ~ '^[0-9a-f]{64}$'")
// CONVERTED and the converted project pointer appear and disappear together.
@Check('ck_opportunity_converted_pair', "(stage = 'CONVERTED') = (converted_project_id IS NOT NULL)")
@Check('ck_opportunity_version', 'version_no >= 1')
export class OpportunityEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column({ type: 'varchar', length: 64 }) code!: string;
  @Column('uuid', { name: 'customer_company_id', nullable: true }) customerCompanyId!: string | null;
  @Column({ type: 'varchar', length: 400 }) name!: string;
  @Column({ type: 'varchar', length: 30 }) stage!: OpportunityStage;
  /** Opaque candidate-site reference — deliberately no FK; sites are project-scoped (DB-011). */
  @Column('uuid', { name: 'site_id', nullable: true }) siteId!: string | null;
  @Column({ name: 'location_text', type: 'varchar', length: 500, nullable: true })
  locationText!: string | null;
  /** numeric(19,4) as text; never parse into a JS number. */
  @Column({
    name: 'expected_capacity_kwp', type: 'numeric', precision: 19, scale: 4, nullable: true
  }) expectedCapacityKwp!: string | null;
  /** Server-computed duplicate identity; NULL when customer or location is missing. */
  @Column({ name: 'duplicate_key', type: 'varchar', length: 200, nullable: true })
  duplicateKey!: string | null;
  @Column('uuid', { name: 'owner_id' }) ownerId!: string;
  @Column('uuid', { name: 'converted_project_id', nullable: true })
  convertedProjectId!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
