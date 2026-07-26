import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { PurchaseOrderStatus } from './procurement-logistics.enums';

/**
 * DB-049 — purchase order header (FR-067). V1: API-082 creates it ISSUED directly with
 * creator ≠ approver captured as row-level SoD (`ck_purchase_order_sod`); amendments (new row with
 * revision + 1) come later — the create endpoint stays create-only (recorded deferral).
 *
 * Both `uq_purchase_orders_tenant_id` and `uq_purchase_orders_project_id` are contractual: the
 * Contract & Cost commitments FK and the logistics children hang off them. The partial unique
 * index `uq_purchase_order_open_revision` allows at most one open revision per po_no.
 *
 * MONEY: `total_value` numeric(19,4) as string; the header/lines identity — if lines exist,
 * SUM(quantity * unit_price) must equal total_value — is a DEFERRABLE INITIALLY DEFERRED
 * constraint trigger computed in Postgres numeric, forced inside the API transaction with
 * SET CONSTRAINTS ALL IMMEDIATE (payment-components pattern).
 */
@Entity({ name: 'purchase_orders' })
@Unique('uq_purchase_orders_tenant_id', ['tenantId', 'id'])
@Unique('uq_purchase_orders_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_purchase_orders_tenant_currency', ['tenantId', 'id', 'currency'])
@Unique('uq_purchase_order_number_revision', ['tenantId', 'projectId', 'poNo', 'revision'])
@Index('uq_purchase_order_open_revision', ['tenantId', 'projectId', 'poNo'], {
  unique: true, where: "status NOT IN ('CLOSED','CANCELLED','SUPERSEDED')"
})
@Index('idx_purchase_order_register', ['tenantId', 'projectId', 'status'])
@Check('ck_purchase_order_number', "po_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_purchase_order_revision', 'revision >= 1')
@Check('ck_purchase_order_status', `status IN ('DRAFT','REVIEW','SUBMITTED','APPROVED','ISSUED','ACKNOWLEDGED','AMENDED','CLOSED','CANCELLED')`)
@Check('ck_purchase_order_total', 'total_value >= 0')
@Check('ck_purchase_order_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_purchase_order_sod', 'approved_by <> created_by')
@Check('ck_purchase_order_issued_requires_at', `status NOT IN ('ISSUED','ACKNOWLEDGED','AMENDED','CLOSED')
  OR issued_at IS NOT NULL`)
@Check('ck_purchase_order_version', 'version_no >= 1')
export class PurchaseOrderEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'supplier_profile_id' }) supplierProfileId!: string;
  @Column('uuid', { name: 'awarded_rfq_id', nullable: true }) awardedRfqId!: string | null;
  @Column({ name: 'po_no', type: 'varchar', length: 80 }) poNo!: string;
  @Column({ type: 'integer' }) revision!: number;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 20 }) status!: PurchaseOrderStatus;
  /** numeric(19,4) money as string; equals the SQL sum of its lines whenever lines exist. */
  @Column({ name: 'total_value', type: 'numeric', precision: 19, scale: 4 }) totalValue!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt!: Date | null;
  @Column('uuid', { name: 'approved_by' }) approvedBy!: string;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-050 — one line of a purchase order. Currency is bound to the header by the composite key
 * (tenant, po, currency) → purchase_orders (tenant, id, currency), making a cross-currency line
 * structurally impossible. `bom_line_id` is a plain uuid with NO foreign key — the BOM domain is a
 * cross-domain deferral (recorded). Lines of an ISSUED order are frozen by
 * `protect_purchase_order_line_history`; a post-issue insert cannot survive either because it
 * breaks the deferred sum identity.
 */
@Entity({ name: 'purchase_order_lines' })
@Unique('uq_purchase_order_lines_tenant_id', ['tenantId', 'id'])
@Unique('uq_purchase_order_lines_po_id', ['tenantId', 'purchaseOrderId', 'id'])
@Unique('uq_purchase_order_line_number', ['tenantId', 'purchaseOrderId', 'lineNo'])
@Check('ck_purchase_order_line_number', 'line_no >= 1')
@Check('ck_purchase_order_line_quantity', 'quantity > 0')
@Check('ck_purchase_order_line_unit_price', 'unit_price >= 0')
@Check('ck_purchase_order_line_currency', "currency ~ '^[A-Z]{3}$'")
export class PurchaseOrderLineEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'purchase_order_id' }) purchaseOrderId!: string;
  @Column({ name: 'line_no', type: 'integer' }) lineNo!: number;
  @Column({ type: 'varchar', length: 400 }) description!: string;
  /** numeric(19,4) as string; quantity arithmetic happens only in Postgres. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) quantity!: string;
  @Column({ type: 'varchar', length: 20 }) uom!: string;
  /** numeric(19,4) money as string. */
  @Column({ name: 'unit_price', type: 'numeric', precision: 19, scale: 4 }) unitPrice!: string;
  @Column({ type: 'char', length: 3 }) currency!: string;
  @Column('uuid', { name: 'requisition_id', nullable: true }) requisitionId!: string | null;
  /** Plain uuid, deliberately without FK: BOM lines live in a deferred domain (recorded). */
  @Column('uuid', { name: 'bom_line_id', nullable: true }) bomLineId!: string | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
