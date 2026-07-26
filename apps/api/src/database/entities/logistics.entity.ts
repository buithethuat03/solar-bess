import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  GoodsReceiptCondition, GoodsReceiptStatus, InventoryTransactionType, ShipmentMilestoneSource,
  ShipmentMilestoneType, ShipmentStatus
} from './procurement-logistics.enums';

/**
 * DB-051 — shipment against a purchase order (FR-069/FR-070). `committed_date` is the supplier's
 * commitment and is immutable after insert (`protect_shipment_committed_date`); etd/eta/actuals
 * stay mutable so slippage is visible against the frozen commitment. The (carrier, tracking) index
 * is deliberately NON-unique: cross-carrier tracking uniqueness is documented TBD.
 *
 * Status is derived monotonically from the milestone stream (API-084), never regressing.
 */
@Entity({ name: 'shipments' })
@Unique('uq_shipments_tenant_id', ['tenantId', 'id'])
@Unique('uq_shipments_po_id', ['tenantId', 'purchaseOrderId', 'id'])
@Index('idx_shipment_tracking', ['tenantId', 'carrier', 'trackingNo'])
@Index('idx_shipment_po', ['tenantId', 'purchaseOrderId', 'status'])
@Check('ck_shipment_status', `status IN ('PLANNED','BOOKED','IN_TRANSIT','CUSTOMS','DELIVERED','EXCEPTION','CLOSED')`)
@Check('ck_shipment_version', 'version_no >= 1')
export class ShipmentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'purchase_order_id' }) purchaseOrderId!: string;
  /** Immutable after insert: the committed delivery date is the baseline slippage is read against. */
  @Column({ name: 'committed_date', type: 'date' }) committedDate!: string;
  @Column({ type: 'date', nullable: true }) etd!: string | null;
  @Column({ type: 'date', nullable: true }) eta!: string | null;
  @Column({ name: 'actual_delivery_date', type: 'date', nullable: true })
  actualDeliveryDate!: string | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) carrier!: string | null;
  @Column({ name: 'tracking_no', type: 'varchar', length: 200, nullable: true })
  trackingNo!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: ShipmentStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * Aggregate-internal child of DB-051 (no own DB id in the dictionary — recorded as such, not an
 * invented canonical id). Append-only event stream: `protect_shipment_milestone_history` forbids
 * UPDATE and DELETE, and `uq_shipment_milestone_replay` deduplicates carrier replays of the same
 * (type, event time, source). Ordering is enforced by the service via the milestone-policy domain
 * rules (422 MILESTONE_OUT_OF_ORDER).
 */
@Entity({ name: 'shipment_milestones' })
@Unique('uq_shipment_milestones_tenant_id', ['tenantId', 'id'])
@Unique('uq_shipment_milestone_replay',
  ['tenantId', 'shipmentId', 'milestoneType', 'eventTime', 'source'])
@Index('idx_shipment_milestone_stream', ['tenantId', 'shipmentId', 'eventTime'])
@Check('ck_shipment_milestone_type', `milestone_type IN ('BOOKED','DEPARTED','ARRIVED','CUSTOMS_CLEARED','DELIVERED','EXCEPTION')`)
@Check('ck_shipment_milestone_source', "source IN ('MANUAL','CARRIER')")
export class ShipmentMilestoneEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'shipment_id' }) shipmentId!: string;
  @Column({ name: 'milestone_type', type: 'varchar', length: 30 })
  milestoneType!: ShipmentMilestoneType;
  @Column({ name: 'event_time', type: 'timestamptz' }) eventTime!: Date;
  @Column({ type: 'varchar', length: 10 }) source!: ShipmentMilestoneSource;
  @Column({ type: 'varchar', length: 2000, nullable: true }) notes!: string | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-052 — goods receipt for one purchase-order line (FR-071). The line binding
 * (tenant, po, line) → purchase_order_lines (tenant, po, id) makes a receipt against another
 * order's line structurally impossible, and the site binding rides the project denormalized from
 * the PO. `receipt_no` is unique per (tenant, site) — recorded interpretation of the ambiguous
 * dictionary scope.
 *
 * OVER-RECEIPT IS AN ERROR: the service locks the PO line FOR UPDATE and refuses the receipt when
 * accepted-so-far + incoming exceeds the ordered quantity (422 OVER_RECEIPT), summed in Postgres
 * numeric. A condition other than GOOD quarantines the receipt. Once ACCEPTED/CLOSED the row is
 * frozen (`protect_goods_receipt_history`), allowing only ACCEPTED → CLOSED.
 */
@Entity({ name: 'goods_receipts' })
@Unique('uq_goods_receipts_tenant_id', ['tenantId', 'id'])
@Unique('uq_goods_receipt_site_number', ['tenantId', 'siteId', 'receiptNo'])
@Index('idx_goods_receipt_po', ['tenantId', 'purchaseOrderId', 'status'])
@Check('ck_goods_receipt_number', "receipt_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_goods_receipt_quantity', 'quantity > 0')
@Check('ck_goods_receipt_condition', "condition IN ('GOOD','DAMAGED','SHORTAGE','WRONG_ITEM')")
@Check('ck_goods_receipt_status', `status IN ('RECEIVING','ACCEPTED','PARTIAL','QUARANTINED','REJECTED','CLOSED')`)
@Check('ck_goods_receipt_quarantine', "condition = 'GOOD' OR status IN ('QUARANTINED','REJECTED','CLOSED')")
@Check('ck_goods_receipt_version', 'version_no >= 1')
export class GoodsReceiptEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'purchase_order_id' }) purchaseOrderId!: string;
  @Column('uuid', { name: 'purchase_order_line_id' }) purchaseOrderLineId!: string;
  @Column('uuid', { name: 'shipment_id', nullable: true }) shipmentId!: string | null;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column({ name: 'receipt_no', type: 'varchar', length: 80 }) receiptNo!: string;
  /** numeric(19,4) as string; the over-receipt sum is computed only in Postgres. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) quantity!: string;
  @Column({ type: 'varchar', length: 20 }) condition!: GoodsReceiptCondition;
  @Column({ type: 'varchar', length: 20 }) status!: GoodsReceiptStatus;
  @Column({ type: 'varchar', length: 2000, nullable: true }) notes!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-053 — append-only inventory ledger. `uq_inventory_transaction_source` on (tenant, source_key)
 * is the idempotency control: replaying the same business event cannot double-count stock.
 * A goods receipt writes its RECEIPT row (plus QUARANTINE_IN when quarantined) in the same
 * transaction as the receipt itself. `protect_inventory_transaction_history` forbids UPDATE/DELETE.
 */
@Entity({ name: 'inventory_transactions' })
@Unique('uq_inventory_transactions_tenant_id', ['tenantId', 'id'])
@Unique('uq_inventory_transaction_source', ['tenantId', 'sourceKey'])
@Index('idx_inventory_transaction_site', ['tenantId', 'siteId', 'transactionType'])
@Check('ck_inventory_transaction_type', `transaction_type IN ('RECEIPT','ISSUE','RETURN','ADJUSTMENT','QUARANTINE_IN','QUARANTINE_RELEASE')`)
@Check('ck_inventory_transaction_quantity', 'quantity <> 0')
export class InventoryTransactionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'purchase_order_line_id', nullable: true })
  purchaseOrderLineId!: string | null;
  @Column('uuid', { name: 'goods_receipt_id', nullable: true }) goodsReceiptId!: string | null;
  @Column({ name: 'transaction_type', type: 'varchar', length: 30 })
  transactionType!: InventoryTransactionType;
  /** Signed numeric(19,4) as string: inbound positive, outbound negative. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) quantity!: string;
  @Column({ type: 'varchar', length: 20 }) uom!: string;
  /** Natural idempotency key of the business event, e.g. `GR:<receiptId>:RECEIPT`. */
  @Column({ name: 'source_key', type: 'varchar', length: 200 }) sourceKey!: string;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-054 — serial number captured at receipt. `normalized_serial` is server-computed
 * (trim + uppercase) and its identity to the raw value is a CHECK, so the uniqueness scope
 * (tenant, equipment_model_id, normalized_serial) cannot be dodged by whitespace or casing —
 * recorded Assumption: the dictionary leaves the uniqueness scope TBD; per-model per-tenant is
 * enforced until decided. Duplicate → 409 SERIAL_CONFLICT. `equipment_model_id` has a DDL-level
 * FK to equipment_models (tenant_id, id) provided by the merged migration chain; the entity stays
 * relation-less by design.
 */
@Entity({ name: 'serial_numbers' })
@Unique('uq_serial_numbers_tenant_id', ['tenantId', 'id'])
@Unique('uq_serial_number_scope', ['tenantId', 'equipmentModelId', 'normalizedSerial'])
@Index('idx_serial_number_receipt', ['tenantId', 'goodsReceiptId'])
@Check('ck_serial_number_normalized', 'normalized_serial = upper(btrim(serial_no))')
@Check('ck_serial_number_present', "btrim(serial_no) <> ''")
export class SerialNumberEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'goods_receipt_id' }) goodsReceiptId!: string;
  /** Relation-less cross-domain reference; the FK lives in DDL only. */
  @Column('uuid', { name: 'equipment_model_id' }) equipmentModelId!: string;
  @Column({ name: 'serial_no', type: 'varchar', length: 120 }) serialNo!: string;
  @Column({ name: 'normalized_serial', type: 'varchar', length: 120 })
  normalizedSerial!: string;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
