import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { EquipmentModelStatus } from './engineering-plants.enums';

/**
 * DB-041 — one entry of the tenant-scoped equipment model catalog (FR-045, API-067/API-068).
 *
 * The catalog is deliberately tenant-level, not project-level: models are reusable engineering
 * facts, so any principal holding `equipmentModel.read` in the tenant may read them.
 *
 * Once a model reaches APPROVED its business content (class, manufacturer, model, ratings, spec
 * version) is frozen by `protect_equipment_model_history`; the only legal mutation left is the
 * APPROVED → SUPERSEDED transition that writes `supersededById` — the same "issued immutable but
 * supersede allowed" idiom document revisions use.
 */
@Entity({ name: 'equipment_models' })
@Unique('uq_equipment_models_tenant_id', ['tenantId', 'id'])
@Unique('uq_equipment_model_identity', ['tenantId', 'manufacturer', 'model', 'specVersion'])
@Index('idx_equipment_model_class', ['tenantId', 'equipmentClass', 'status'])
@Check('ck_equipment_model_status', "status IN ('DRAFT','IN_REVIEW','APPROVED','SUPERSEDED')")
@Check('ck_equipment_model_ratings', "jsonb_typeof(ratings) = 'object'")
@Check('ck_equipment_model_superseded_self', 'superseded_by_id IS NULL OR superseded_by_id <> id')
@Check('ck_equipment_model_superseded_status', "superseded_by_id IS NULL OR status = 'SUPERSEDED'")
@Check('ck_equipment_model_version', 'version_no >= 1')
export class EquipmentModelEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'manufacturer_company_id', nullable: true })
  manufacturerCompanyId!: string | null;
  @Column({ name: 'equipment_class', type: 'varchar', length: 100 }) equipmentClass!: string;
  @Column({ type: 'varchar', length: 200 }) manufacturer!: string;
  @Column({ type: 'varchar', length: 200 }) model!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) ratings!: Record<string, unknown>;
  @Column({ name: 'spec_version', type: 'varchar', length: 60 }) specVersion!: string;
  @Column({ type: 'varchar', length: 20 }) status!: EquipmentModelStatus;
  @Column('uuid', { name: 'superseded_by_id', nullable: true }) supersededById!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
