import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { BillOfMaterialsStatus, BomLineSubstitutionStatus } from './engineering-plants.enums';

/**
 * DB-042 — one immutable-once-released BOM version of a project (FR-046/FR-047, API-069/API-070).
 *
 * A BOM version is bound to the ISSUED, scan-CLEAN design revision it was extracted from, and its
 * released content is fingerprinted with the shared canonical hash over the ordered line content.
 * At most one version per project is RELEASED (partial unique index `uq_bom_released_per_project`);
 * API-070 supersedes the previous release inside the same transaction that releases the next one.
 */
@Entity({ name: 'bill_of_materials' })
@Unique('uq_bill_of_materials_tenant_id', ['tenantId', 'id'])
@Unique('uq_bill_of_materials_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_bom_project_version', ['tenantId', 'projectId', 'version'])
@Index('uq_bom_released_per_project', ['tenantId', 'projectId'], {
  unique: true, where: "status = 'RELEASED'"
})
@Check('ck_bom_status', "status IN ('DRAFT','IN_REVIEW','RELEASED','SUPERSEDED')")
@Check('ck_bom_version', 'version >= 1')
@Check('ck_bom_released_pair', '(released_by IS NULL) = (released_at IS NULL)')
@Check('ck_bom_released_fields', `status <> 'RELEASED'
  OR (snapshot_hash IS NOT NULL AND released_by IS NOT NULL)`)
@Check('ck_bom_hash_format', "snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_bom_version_no', 'version_no >= 1')
export class BillOfMaterialsEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'design_revision_id' }) designRevisionId!: string;
  @Column({ type: 'integer' }) version!: number;
  @Column({ type: 'varchar', length: 20 }) status!: BillOfMaterialsStatus;
  @Column('uuid', { name: 'released_by', nullable: true }) releasedBy!: string | null;
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true }) releasedAt!: Date | null;
  @Column({ name: 'snapshot_hash', type: 'char', length: 64, nullable: true })
  snapshotHash!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-043 — one line of a BOM version. Lines of a RELEASED/SUPERSEDED parent are frozen by
 * `protect_bom_line_history`, which reads the parent status on INSERT, UPDATE and DELETE.
 *
 * QUANTITY IS TEXT: `quantity` is `numeric(19,4)` surfaced as a TypeScript string with no
 * transformer — a JS `number` never touches it.
 */
@Entity({ name: 'bom_lines' })
@Unique('uq_bom_lines_tenant_id', ['tenantId', 'id'])
@Unique('uq_bom_line_number', ['tenantId', 'billOfMaterialsId', 'lineNo'])
@Index('idx_bom_line_model', ['tenantId', 'equipmentModelId'])
@Index('idx_bom_line_item_code', ['tenantId', 'itemCode'])
@Check('ck_bom_line_number', 'line_no >= 1')
@Check('ck_bom_line_quantity', 'quantity > 0')
@Check('ck_bom_line_substitution', "substitution_status IN ('NONE','PROPOSED','APPROVED','REJECTED')")
export class BomLineEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'bill_of_materials_id' }) billOfMaterialsId!: string;
  @Column('uuid', { name: 'equipment_model_id', nullable: true }) equipmentModelId!: string | null;
  @Column({ name: 'line_no', type: 'integer' }) lineNo!: number;
  @Column({ name: 'item_code', type: 'varchar', length: 80 }) itemCode!: string;
  @Column({ type: 'varchar', length: 1000, nullable: true }) description!: string | null;
  /** numeric(19,4) quantity — always a string; never parse it into a JS number. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) quantity!: string;
  @Column({ type: 'varchar', length: 40 }) unit!: string;
  @Column({ name: 'substitution_status', type: 'varchar', length: 20, default: 'NONE' })
  substitutionStatus!: BomLineSubstitutionStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
