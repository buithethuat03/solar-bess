import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { SurveyDataQuality } from './opportunity.enums';

/**
 * DB-015 — one survey revision under an opportunity (API-030). Revisions are allocated
 * `max + 1` inside the command transaction while the parent opportunity row is locked, and
 * `uq_survey_package_revision` is the structural backstop against a racing allocation.
 *
 * `document_refs` holds opaque references only (jsonb array of strings) — never bytes; the
 * document store stays the system of record for content.
 *
 * An APPROVED row is immutable: `trg_survey_package_history` refuses UPDATE and DELETE.
 */
@Entity({ name: 'survey_packages' })
@Unique('uq_survey_packages_tenant_id', ['tenantId', 'id'])
@Unique('uq_survey_package_revision', ['tenantId', 'opportunityId', 'revision'])
@Index('idx_survey_package_opportunity', ['tenantId', 'opportunityId'])
@Check('ck_survey_package_revision', 'revision >= 1')
@Check('ck_survey_package_quality', "data_quality IN ('RAW','VALIDATED','APPROVED')")
@Check('ck_survey_package_document_refs', "jsonb_typeof(document_refs) = 'array'")
@Check('ck_survey_package_version', 'version_no >= 1')
export class SurveyPackageEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'opportunity_id' }) opportunityId!: string;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ name: 'data_quality', type: 'varchar', length: 20 }) dataQuality!: SurveyDataQuality;
  @Column({ name: 'document_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  documentRefs!: string[];
  @Column({ type: 'varchar', length: 4000, nullable: true }) notes!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
