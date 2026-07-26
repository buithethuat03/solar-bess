import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  AssetOperationalStatus, EquipmentLifecycleStatus, PlantStatus
} from './engineering-plants.enums';

/**
 * DB-079 — one physical piece of equipment installed (or to be installed) on a site. DDL-only in
 * this slice: no Engineering & Plants operation writes it, but Procurement and Commissioning both
 * key against it, so the table and its candidate keys ship now.
 *
 * Deferred references, deliberately without foreign keys until their tables exist:
 * - `serialNumberId` — serial_numbers (Procurement) has no table yet; the partial unique index
 *   already guarantees one equipment row per serial.
 * - `systemId` — DB-073 (system breakdown) is absent from the implemented schema.
 *
 * No hard delete ever: a BEFORE DELETE trigger raises, and RETIRED is terminal.
 */
@Entity({ name: 'equipment' })
@Unique('uq_equipment_tenant_id', ['tenantId', 'id'])
@Unique('uq_equipment_project_id', ['tenantId', 'projectId', 'id'])
@Index('uq_equipment_serial', ['tenantId', 'serialNumberId'], {
  unique: true, where: 'serial_number_id IS NOT NULL'
})
@Index('idx_equipment_site', ['tenantId', 'projectId', 'siteId'])
@Index('idx_equipment_model', ['tenantId', 'equipmentModelId'])
@Index('idx_equipment_lifecycle', ['tenantId', 'lifecycleStatus'])
@Check('ck_equipment_lifecycle', `lifecycle_status IN
  ('RECEIVED','INSTALLED','COMMISSIONED','OPERATIONAL','REPLACED','RETIRED')`)
@Check('ck_equipment_parent_self', 'parent_equipment_id IS NULL OR parent_equipment_id <> id')
@Check('ck_equipment_replaced_self', 'replaced_by_id IS NULL OR replaced_by_id <> id')
@Check('ck_equipment_replaced_status', "replaced_by_id IS NULL OR lifecycle_status = 'REPLACED'")
@Check('ck_equipment_version', 'version_no >= 1')
export class EquipmentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'equipment_model_id' }) equipmentModelId!: string;
  /** Deferred reference: no serial_numbers table exists yet, so no foreign key — by decision. */
  @Column('uuid', { name: 'serial_number_id', nullable: true }) serialNumberId!: string | null;
  @Column('uuid', { name: 'parent_equipment_id', nullable: true })
  parentEquipmentId!: string | null;
  @Column({ name: 'equipment_type', type: 'varchar', length: 100 }) equipmentType!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  /** Deferred reference: DB-073 systems table is absent, so no foreign key — by decision. */
  @Column('uuid', { name: 'system_id', nullable: true }) systemId!: string | null;
  @Column({ name: 'lifecycle_status', type: 'varchar', length: 20 })
  lifecycleStatus!: EquipmentLifecycleStatus;
  @Column({ name: 'installed_at', type: 'timestamptz', nullable: true }) installedAt!: Date | null;
  @Column('uuid', { name: 'replaced_by_id', nullable: true }) replacedById!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-080 — the operational asset an equipment row becomes once it is handed to operations.
 * DDL-only in this slice; the plant tables anchor on it via `root_asset_id`.
 *
 * One live (non-ARCHIVED) asset per equipment is enforced by the partial unique index; the
 * composite site foreign key carries (tenant, project, site) so an asset can never sit on another
 * project's site. A BEFORE DELETE trigger raises — assets are archived, never deleted.
 */
@Entity({ name: 'assets' })
@Unique('uq_assets_tenant_id', ['tenantId', 'id'])
@Unique('uq_assets_site_id', ['tenantId', 'siteId', 'id'])
@Unique('uq_asset_code', ['tenantId', 'assetCode'])
@Index('uq_asset_equipment_active', ['tenantId', 'equipmentId'], {
  unique: true, where: "operational_status <> 'ARCHIVED'"
})
@Index('idx_asset_site', ['tenantId', 'projectId', 'siteId'])
@Check('ck_asset_status', "operational_status IN ('PENDING','ACTIVE','SUSPENDED','ARCHIVED')")
@Check('ck_asset_version', 'version_no >= 1')
export class AssetEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'equipment_id' }) equipmentId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column({ name: 'asset_code', type: 'varchar', length: 80 }) assetCode!: string;
  @Column({ name: 'activation_date', type: 'date', nullable: true })
  activationDate!: string | null;
  @Column({ name: 'operational_status', type: 'varchar', length: 30 })
  operationalStatus!: AssetOperationalStatus;
  @Column({ name: 'dossier_ref', type: 'jsonb', nullable: true })
  dossierRef!: Record<string, unknown> | null;
  @Column({ name: 'external_financial_asset_ref', type: 'varchar', length: 200, nullable: true })
  externalFinancialAssetRef!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-081 — one configuration version of a solar plant on a site (FR-125/FR-126, API-072/API-073).
 * Rows are versioned per site; at most one is RELEASED and API-073 supersedes the prior release
 * atomically while inserting the next version. Capacities are numeric(19,4) surfaced as strings.
 */
@Entity({ name: 'solar_plants' })
@Unique('uq_solar_plants_tenant_id', ['tenantId', 'id'])
@Unique('uq_solar_plant_config_version', ['tenantId', 'siteId', 'configurationVersion'])
@Index('uq_solar_plant_released', ['tenantId', 'siteId'], {
  unique: true, where: "status = 'RELEASED'"
})
@Index('idx_solar_plant_site', ['tenantId', 'projectId', 'siteId'])
@Check('ck_solar_plant_status', "status IN ('DRAFT','RELEASED','SUPERSEDED')")
@Check('ck_solar_plant_dc_capacity', 'dc_capacity_kwp > 0')
@Check('ck_solar_plant_ac_capacity', 'ac_capacity_kw > 0')
@Check('ck_solar_plant_config_version', 'configuration_version >= 1')
@Check('ck_solar_plant_configuration', "jsonb_typeof(configuration) = 'object'")
@Check('ck_solar_plant_hash_format', "configuration_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_solar_plant_version', 'version_no >= 1')
export class SolarPlantEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'root_asset_id' }) rootAssetId!: string;
  /** numeric(19,4) — always a string; never parse it into a JS number. */
  @Column({ name: 'dc_capacity_kwp', type: 'numeric', precision: 19, scale: 4 })
  dcCapacityKwp!: string;
  /** numeric(19,4) — always a string; never parse it into a JS number. */
  @Column({ name: 'ac_capacity_kw', type: 'numeric', precision: 19, scale: 4 })
  acCapacityKw!: string;
  @Column({ name: 'configuration_version', type: 'integer' }) configurationVersion!: number;
  @Column({ type: 'jsonb' }) configuration!: Record<string, unknown>;
  @Column({ name: 'configuration_hash', type: 'char', length: 64 }) configurationHash!: string;
  @Column({ name: 'baseline_ref', type: 'jsonb', nullable: true })
  baselineRef!: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 20 }) status!: PlantStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-082 — one hierarchy version of a BESS plant on a site (FR-130/FR-133, API-074/API-075).
 *
 * SEC-127/SEC-128: the schema-level ABSENCE of any connectivity or credential column (no host,
 * username, password, token, url, endpoint, secret) IS the control that PM Web cannot even store
 * the coordinates of an OT write path. A unit test guards the entity metadata against such a
 * column ever being added; the migration spec guards the live information_schema the same way.
 * The `operatingEnvelope` is a passive engineering constraint document (power/energy/SOC/ramp/
 * efficiency/temperature bounds) used only for the stateless advisory simulation of API-075.
 */
@Entity({ name: 'bess_plants' })
@Unique('uq_bess_plants_tenant_id', ['tenantId', 'id'])
@Unique('uq_bess_plant_hierarchy_version', ['tenantId', 'siteId', 'hierarchyVersion'])
@Index('uq_bess_plant_released', ['tenantId', 'siteId'], {
  unique: true, where: "status = 'RELEASED'"
})
@Index('idx_bess_plant_site', ['tenantId', 'projectId', 'siteId'])
@Check('ck_bess_plant_status', "status IN ('DRAFT','RELEASED','SUPERSEDED')")
@Check('ck_bess_plant_power', 'power_mw > 0')
@Check('ck_bess_plant_energy', 'energy_mwh > 0')
@Check('ck_bess_plant_hierarchy_version', 'hierarchy_version >= 1')
@Check('ck_bess_plant_envelope', "jsonb_typeof(operating_envelope) = 'object'")
@Check('ck_bess_plant_version', 'version_no >= 1')
export class BessPlantEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'root_asset_id' }) rootAssetId!: string;
  /** numeric(19,4) — always a string; never parse it into a JS number. */
  @Column({ name: 'power_mw', type: 'numeric', precision: 19, scale: 4 }) powerMw!: string;
  /** numeric(19,4) — always a string; never parse it into a JS number. */
  @Column({ name: 'energy_mwh', type: 'numeric', precision: 19, scale: 4 }) energyMwh!: string;
  @Column({ name: 'hierarchy_version', type: 'integer' }) hierarchyVersion!: number;
  @Column({ name: 'operating_envelope', type: 'jsonb' })
  operatingEnvelope!: Record<string, unknown>;
  @Column({ name: 'point_list_version', type: 'varchar', length: 60, nullable: true })
  pointListVersion!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: PlantStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
