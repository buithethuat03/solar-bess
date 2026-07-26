import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-044…DB-054 for the Procurement & Logistics slice (API-076…API-085; API-079 deferred — no
 * external supplier identity exists yet, so bids are fixture-only). The DDL mirrors the entity
 * decorators one-for-one; every FK is composite and carries tenant_id.
 *
 * Cross-domain references provided by the merged migration chain (they do not exist in isolation
 * before 1783744/1783746 have run): `sites (tenant_id, project_id, id)` via
 * uq_sites_tenant_project_id, `wbs_nodes (tenant_id, project_id, id)` via
 * uq_wbs_nodes_tenant_project_id and `equipment_models (tenant_id, id)`.
 *
 * Deliberate absences, all recorded: no RFQ invitation child table (no DB id exists — the
 * invitation set is a validated jsonb snapshot on DB-046); shipment_milestones is the
 * aggregate-internal child of DB-051, not a new canonical id; no FK on
 * purchase_order_lines.bom_line_id (BOM domain deferred); no uniqueness on shipment
 * (carrier, tracking) — documented TBD.
 *
 * This migration also extends the EXISTING commitments table (handed over by Contract & Cost):
 * `purchase_order_id`, the widened source-type CHECK and the source/id pairing CHECK, so API-082
 * can write the PO commitment in the same transaction as the ISSUED order.
 */
export class CreateProcurementLogistics1783748000000 implements MigrationInterface {
  name = 'CreateProcurementLogistics1783748000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE supplier_profiles (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      company_id uuid NOT NULL,
      legal_entity_id uuid NOT NULL,
      category varchar(80) NOT NULL,
      qualification_status varchar(20) NOT NULL,
      valid_from date,
      valid_to date,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_supplier_profiles PRIMARY KEY (id),
      CONSTRAINT uq_supplier_profiles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_supplier_profile_company_category UNIQUE (tenant_id, company_id, category),
      CONSTRAINT fk_supplier_profile_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_supplier_profile_company FOREIGN KEY (tenant_id, company_id)
        REFERENCES companies (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_supplier_profile_legal_entity FOREIGN KEY (tenant_id, company_id, legal_entity_id)
        REFERENCES legal_entities (tenant_id, company_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_supplier_profile_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_supplier_profile_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_supplier_profile_category CHECK (category ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_supplier_profile_status CHECK
        (qualification_status IN ('PENDING','QUALIFIED','SUSPENDED','EXPIRED')),
      CONSTRAINT ck_supplier_profile_window CHECK
        (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
      CONSTRAINT ck_supplier_profile_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE requisitions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      package_id uuid NOT NULL,
      wbs_id uuid,
      cost_code_id uuid NOT NULL,
      number varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      description varchar(2000),
      need_by_date date NOT NULL,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_requisitions PRIMARY KEY (id),
      CONSTRAINT uq_requisitions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_requisitions_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_requisition_project_number UNIQUE (tenant_id, project_id, number),
      CONSTRAINT fk_requisition_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_requisition_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_requisition_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_requisition_wbs FOREIGN KEY (tenant_id, project_id, wbs_id)
        REFERENCES wbs_nodes (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_requisition_cost_code FOREIGN KEY (tenant_id, cost_code_id)
        REFERENCES cost_codes (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_requisition_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_requisition_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_requisition_number CHECK (number ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_requisition_status CHECK (status IN
        ('DRAFT','TECHNICAL_CHECK','COST_CHECK','SUBMITTED','APPROVED','RETURNED','REJECTED','SOURCING')),
      CONSTRAINT ck_requisition_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE rfqs (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      requisition_id uuid NOT NULL,
      project_id uuid NOT NULL,
      number varchar(80) NOT NULL,
      revision integer NOT NULL,
      due_date timestamptz NOT NULL,
      invited_supplier_ids jsonb NOT NULL,
      status varchar(30) NOT NULL,
      awarded_bid_id uuid,
      award_submitted_by uuid,
      award_submitted_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_rfqs PRIMARY KEY (id),
      CONSTRAINT uq_rfqs_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_rfqs_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_rfq_project_number_revision UNIQUE (tenant_id, project_id, number, revision),
      CONSTRAINT fk_rfq_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_rfq_requisition FOREIGN KEY (tenant_id, project_id, requisition_id)
        REFERENCES requisitions (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_rfq_award_submitted_by FOREIGN KEY (tenant_id, award_submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_rfq_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_rfq_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_rfq_number CHECK (number ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_rfq_revision CHECK (revision >= 1),
      CONSTRAINT ck_rfq_status CHECK (status IN
        ('RFQ_DRAFT','ISSUED','BID_OPEN','CLOSED','TECHNICAL_EVALUATION','COMMERCIAL_EVALUATION','AWARD_SUBMITTED','AWARD_APPROVED','REJECTED')),
      CONSTRAINT ck_rfq_invited_suppliers_array CHECK (jsonb_typeof(invited_supplier_ids) = 'array'),
      CONSTRAINT ck_rfq_invited_suppliers_present CHECK (jsonb_array_length(invited_supplier_ids) >= 1),
      CONSTRAINT ck_rfq_award_pair CHECK
        (((award_submitted_by IS NULL) = (award_submitted_at IS NULL))
        AND ((award_submitted_by IS NULL) = (awarded_bid_id IS NULL))),
      CONSTRAINT ck_rfq_award_status CHECK
        ((status IN ('AWARD_SUBMITTED','AWARD_APPROVED')) = (awarded_bid_id IS NOT NULL)),
      CONSTRAINT ck_rfq_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE bids (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      rfq_id uuid NOT NULL,
      supplier_profile_id uuid NOT NULL,
      revision integer NOT NULL,
      sealed_status varchar(10) NOT NULL,
      total numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      payload_ref jsonb,
      submitted_at timestamptz NOT NULL,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_bids PRIMARY KEY (id),
      CONSTRAINT uq_bids_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_bids_rfq_id UNIQUE (tenant_id, rfq_id, id),
      CONSTRAINT uq_bid_rfq_supplier_revision UNIQUE (tenant_id, rfq_id, supplier_profile_id, revision),
      CONSTRAINT fk_bid_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_bid_rfq FOREIGN KEY (tenant_id, rfq_id)
        REFERENCES rfqs (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bid_supplier_profile FOREIGN KEY (tenant_id, supplier_profile_id)
        REFERENCES supplier_profiles (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_bid_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_bid_revision CHECK (revision >= 1),
      CONSTRAINT ck_bid_sealed_status CHECK (sealed_status IN ('SEALED','OPENED')),
      CONSTRAINT ck_bid_total CHECK (total >= 0),
      CONSTRAINT ck_bid_currency CHECK (currency ~ '^[A-Z]{3}$')
    )`);
    // Added after bids exists (rfqs ↔ bids are mutually referencing). The three-column key binds
    // the awarded bid to THIS rfq — awarding another RFQ's bid is structurally impossible.
    await queryRunner.query(`ALTER TABLE rfqs
      ADD CONSTRAINT fk_rfq_awarded_bid FOREIGN KEY (tenant_id, id, awarded_bid_id)
      REFERENCES bids (tenant_id, rfq_id, id) ON DELETE RESTRICT`);

    await queryRunner.query(`CREATE TABLE evaluations (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      bid_id uuid NOT NULL,
      evaluation_type varchar(20) NOT NULL,
      version integer NOT NULL,
      evaluator_id uuid NOT NULL,
      normalized_total numeric(19,4),
      currency char(3),
      normalization_basis varchar(400),
      override_reason varchar(2000),
      notes varchar(2000),
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_evaluations PRIMARY KEY (id),
      CONSTRAINT uq_evaluations_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_evaluation_bid_type_version_evaluator
        UNIQUE (tenant_id, bid_id, evaluation_type, version, evaluator_id),
      CONSTRAINT fk_evaluation_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_evaluation_bid FOREIGN KEY (tenant_id, bid_id)
        REFERENCES bids (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_evaluation_evaluator FOREIGN KEY (tenant_id, evaluator_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_evaluation_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_evaluation_type CHECK (evaluation_type IN ('TECHNICAL','COMMERCIAL')),
      CONSTRAINT ck_evaluation_version CHECK (version >= 1),
      CONSTRAINT ck_evaluation_normalized_pair CHECK ((normalized_total IS NULL) = (currency IS NULL)),
      CONSTRAINT ck_evaluation_normalized_total CHECK (normalized_total IS NULL OR normalized_total >= 0),
      CONSTRAINT ck_evaluation_currency CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
    )`);

    await queryRunner.query(`CREATE TABLE purchase_orders (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      supplier_profile_id uuid NOT NULL,
      awarded_rfq_id uuid,
      po_no varchar(80) NOT NULL,
      revision integer NOT NULL,
      title varchar(400) NOT NULL,
      status varchar(20) NOT NULL,
      total_value numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      issued_at timestamptz,
      approved_by uuid NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_purchase_orders PRIMARY KEY (id),
      CONSTRAINT uq_purchase_orders_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_purchase_orders_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_purchase_orders_tenant_currency UNIQUE (tenant_id, id, currency),
      CONSTRAINT uq_purchase_order_number_revision UNIQUE (tenant_id, project_id, po_no, revision),
      CONSTRAINT fk_purchase_order_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_supplier FOREIGN KEY (tenant_id, supplier_profile_id)
        REFERENCES supplier_profiles (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_awarded_rfq FOREIGN KEY (tenant_id, project_id, awarded_rfq_id)
        REFERENCES rfqs (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_approved_by FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_purchase_order_number CHECK (po_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_purchase_order_revision CHECK (revision >= 1),
      CONSTRAINT ck_purchase_order_status CHECK (status IN
        ('DRAFT','REVIEW','SUBMITTED','APPROVED','ISSUED','ACKNOWLEDGED','AMENDED','CLOSED','CANCELLED')),
      CONSTRAINT ck_purchase_order_total CHECK (total_value >= 0),
      CONSTRAINT ck_purchase_order_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_purchase_order_sod CHECK (approved_by <> created_by),
      CONSTRAINT ck_purchase_order_issued_requires_at CHECK
        (status NOT IN ('ISSUED','ACKNOWLEDGED','AMENDED','CLOSED') OR issued_at IS NOT NULL),
      CONSTRAINT ck_purchase_order_version CHECK (version_no >= 1)
    )`);
    // One open revision per po_no; CLOSED/CANCELLED/SUPERSEDED free the number for the next revision.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_purchase_order_open_revision
      ON purchase_orders (tenant_id, project_id, po_no)
      WHERE status NOT IN ('CLOSED','CANCELLED','SUPERSEDED')`);

    await queryRunner.query(`CREATE TABLE purchase_order_lines (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      purchase_order_id uuid NOT NULL,
      line_no integer NOT NULL,
      description varchar(400) NOT NULL,
      quantity numeric(19,4) NOT NULL,
      uom varchar(20) NOT NULL,
      unit_price numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      requisition_id uuid,
      bom_line_id uuid,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_purchase_order_lines PRIMARY KEY (id),
      CONSTRAINT uq_purchase_order_lines_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_purchase_order_lines_po_id UNIQUE (tenant_id, purchase_order_id, id),
      CONSTRAINT uq_purchase_order_line_number UNIQUE (tenant_id, purchase_order_id, line_no),
      CONSTRAINT fk_purchase_order_line_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_line_po FOREIGN KEY (tenant_id, purchase_order_id)
        REFERENCES purchase_orders (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_line_po_currency FOREIGN KEY (tenant_id, purchase_order_id, currency)
        REFERENCES purchase_orders (tenant_id, id, currency) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_line_requisition FOREIGN KEY (tenant_id, requisition_id)
        REFERENCES requisitions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_purchase_order_line_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_purchase_order_line_number CHECK (line_no >= 1),
      CONSTRAINT ck_purchase_order_line_quantity CHECK (quantity > 0),
      CONSTRAINT ck_purchase_order_line_unit_price CHECK (unit_price >= 0),
      CONSTRAINT ck_purchase_order_line_currency CHECK (currency ~ '^[A-Z]{3}$')
    )`);

    await queryRunner.query(`CREATE TABLE shipments (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      purchase_order_id uuid NOT NULL,
      committed_date date NOT NULL,
      etd date,
      eta date,
      actual_delivery_date date,
      carrier varchar(200),
      tracking_no varchar(200),
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_shipments PRIMARY KEY (id),
      CONSTRAINT uq_shipments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_shipments_po_id UNIQUE (tenant_id, purchase_order_id, id),
      CONSTRAINT fk_shipment_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_shipment_po FOREIGN KEY (tenant_id, purchase_order_id)
        REFERENCES purchase_orders (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_shipment_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_shipment_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_shipment_status CHECK (status IN
        ('PLANNED','BOOKED','IN_TRANSIT','CUSTOMS','DELIVERED','EXCEPTION','CLOSED')),
      CONSTRAINT ck_shipment_version CHECK (version_no >= 1)
    )`);
    // Deliberately NON-unique: cross-carrier tracking uniqueness is documented TBD (do not add).
    await queryRunner.query(`CREATE INDEX idx_shipment_tracking
      ON shipments (tenant_id, carrier, tracking_no)`);

    await queryRunner.query(`CREATE TABLE shipment_milestones (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      shipment_id uuid NOT NULL,
      milestone_type varchar(30) NOT NULL,
      event_time timestamptz NOT NULL,
      source varchar(10) NOT NULL,
      notes varchar(2000),
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_shipment_milestones PRIMARY KEY (id),
      CONSTRAINT uq_shipment_milestones_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_shipment_milestone_replay
        UNIQUE (tenant_id, shipment_id, milestone_type, event_time, source),
      CONSTRAINT fk_shipment_milestone_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_shipment_milestone_shipment FOREIGN KEY (tenant_id, shipment_id)
        REFERENCES shipments (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_shipment_milestone_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_shipment_milestone_type CHECK (milestone_type IN
        ('BOOKED','DEPARTED','ARRIVED','CUSTOMS_CLEARED','DELIVERED','EXCEPTION')),
      CONSTRAINT ck_shipment_milestone_source CHECK (source IN ('MANUAL','CARRIER'))
    )`);

    await queryRunner.query(`CREATE TABLE goods_receipts (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      purchase_order_id uuid NOT NULL,
      purchase_order_line_id uuid NOT NULL,
      shipment_id uuid,
      site_id uuid NOT NULL,
      receipt_no varchar(80) NOT NULL,
      quantity numeric(19,4) NOT NULL,
      condition varchar(20) NOT NULL,
      status varchar(20) NOT NULL,
      notes varchar(2000),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_goods_receipts PRIMARY KEY (id),
      CONSTRAINT uq_goods_receipts_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_goods_receipt_site_number UNIQUE (tenant_id, site_id, receipt_no),
      CONSTRAINT fk_goods_receipt_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_goods_receipt_po FOREIGN KEY (tenant_id, project_id, purchase_order_id)
        REFERENCES purchase_orders (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_goods_receipt_po_line FOREIGN KEY (tenant_id, purchase_order_id, purchase_order_line_id)
        REFERENCES purchase_order_lines (tenant_id, purchase_order_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_goods_receipt_shipment FOREIGN KEY (tenant_id, purchase_order_id, shipment_id)
        REFERENCES shipments (tenant_id, purchase_order_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_goods_receipt_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_goods_receipt_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_goods_receipt_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_goods_receipt_number CHECK (receipt_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_goods_receipt_quantity CHECK (quantity > 0),
      CONSTRAINT ck_goods_receipt_condition CHECK
        (condition IN ('GOOD','DAMAGED','SHORTAGE','WRONG_ITEM')),
      CONSTRAINT ck_goods_receipt_status CHECK
        (status IN ('RECEIVING','ACCEPTED','PARTIAL','QUARANTINED','REJECTED','CLOSED')),
      CONSTRAINT ck_goods_receipt_quarantine CHECK
        (condition = 'GOOD' OR status IN ('QUARANTINED','REJECTED','CLOSED')),
      CONSTRAINT ck_goods_receipt_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE inventory_transactions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      purchase_order_line_id uuid,
      goods_receipt_id uuid,
      transaction_type varchar(30) NOT NULL,
      quantity numeric(19,4) NOT NULL,
      uom varchar(20) NOT NULL,
      source_key varchar(200) NOT NULL,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_inventory_transactions PRIMARY KEY (id),
      CONSTRAINT uq_inventory_transactions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_inventory_transaction_source UNIQUE (tenant_id, source_key),
      CONSTRAINT fk_inventory_transaction_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_inventory_transaction_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inventory_transaction_po_line FOREIGN KEY (tenant_id, purchase_order_line_id)
        REFERENCES purchase_order_lines (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inventory_transaction_receipt FOREIGN KEY (tenant_id, goods_receipt_id)
        REFERENCES goods_receipts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_inventory_transaction_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_inventory_transaction_type CHECK (transaction_type IN
        ('RECEIPT','ISSUE','RETURN','ADJUSTMENT','QUARANTINE_IN','QUARANTINE_RELEASE')),
      CONSTRAINT ck_inventory_transaction_quantity CHECK (quantity <> 0)
    )`);

    await queryRunner.query(`CREATE TABLE serial_numbers (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      goods_receipt_id uuid NOT NULL,
      equipment_model_id uuid NOT NULL,
      serial_no varchar(120) NOT NULL,
      normalized_serial varchar(120) NOT NULL,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_serial_numbers PRIMARY KEY (id),
      CONSTRAINT uq_serial_numbers_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_serial_number_scope UNIQUE (tenant_id, equipment_model_id, normalized_serial),
      CONSTRAINT fk_serial_number_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_serial_number_receipt FOREIGN KEY (tenant_id, goods_receipt_id)
        REFERENCES goods_receipts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_serial_number_equipment_model FOREIGN KEY (tenant_id, equipment_model_id)
        REFERENCES equipment_models (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_serial_number_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_serial_number_normalized CHECK (normalized_serial = upper(btrim(serial_no))),
      CONSTRAINT ck_serial_number_present CHECK (btrim(serial_no) <> '')
    )`);

    await queryRunner.query(`CREATE INDEX idx_supplier_profile_category
      ON supplier_profiles (tenant_id, category, qualification_status)`);
    await queryRunner.query(`CREATE INDEX idx_requisition_register
      ON requisitions (tenant_id, project_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_rfq_register
      ON rfqs (tenant_id, project_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_evaluation_bid
      ON evaluations (tenant_id, bid_id, evaluation_type)`);
    await queryRunner.query(`CREATE INDEX idx_purchase_order_register
      ON purchase_orders (tenant_id, project_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_shipment_po
      ON shipments (tenant_id, purchase_order_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_shipment_milestone_stream
      ON shipment_milestones (tenant_id, shipment_id, event_time)`);
    await queryRunner.query(`CREATE INDEX idx_goods_receipt_po
      ON goods_receipts (tenant_id, purchase_order_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_inventory_transaction_site
      ON inventory_transactions (tenant_id, site_id, transaction_type)`);
    await queryRunner.query(`CREATE INDEX idx_serial_number_receipt
      ON serial_numbers (tenant_id, goods_receipt_id)`);

    // Handed over by Contract & Cost: commitments learn the PURCHASE_ORDER source. The pairing
    // CHECK keeps contract sources on contract_id and PO sources on purchase_order_id, exclusively.
    await queryRunner.query('ALTER TABLE commitments ADD COLUMN purchase_order_id uuid');
    await queryRunner.query(`ALTER TABLE commitments
      ADD CONSTRAINT fk_commitment_purchase_order FOREIGN KEY (tenant_id, purchase_order_id)
      REFERENCES purchase_orders (tenant_id, id) ON DELETE RESTRICT`);
    await queryRunner.query('ALTER TABLE commitments DROP CONSTRAINT ck_commitment_source_type');
    await queryRunner.query(`ALTER TABLE commitments ADD CONSTRAINT ck_commitment_source_type
      CHECK (source_type IN ('CONTRACT','CONTRACT_APPENDIX','PURCHASE_ORDER'))`);
    await queryRunner.query('ALTER TABLE commitments DROP CONSTRAINT ck_commitment_contract_presence');
    await queryRunner.query(`ALTER TABLE commitments ADD CONSTRAINT ck_commitment_contract_presence
      CHECK (((source_type IN ('CONTRACT','CONTRACT_APPENDIX')) = (contract_id IS NOT NULL))
        AND ((source_type = 'PURCHASE_ORDER') = (purchase_order_id IS NOT NULL)))`);

    // FR-061: supplier history is never destroyed — profiles expire, they are not deleted.
    await queryRunner.query(`CREATE FUNCTION protect_supplier_profile_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'supplier profiles cannot be deleted; set qualification_status = EXPIRED instead';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_supplier_profile_history
      BEFORE DELETE ON supplier_profiles
      FOR EACH ROW EXECUTE FUNCTION protect_supplier_profile_history()`);

    // FR-063/FR-066: an ISSUED RFQ is a published commercial document. Its business columns are
    // frozen; only the forward status walk (with the award triple) may move, and it never regresses.
    await queryRunner.query(`CREATE FUNCTION protect_rfq_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      old_rank integer;
      new_rank integer;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'RFQ_DRAFT' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'only RFQ_DRAFT rfqs can be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status <> 'RFQ_DRAFT' AND (
        NEW.requisition_id IS DISTINCT FROM OLD.requisition_id
        OR NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.number IS DISTINCT FROM OLD.number
        OR NEW.revision IS DISTINCT FROM OLD.revision
        OR NEW.due_date IS DISTINCT FROM OLD.due_date
        OR NEW.invited_supplier_ids IS DISTINCT FROM OLD.invited_supplier_ids
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'issued RFQ business columns are immutable; only the status may walk forward';
      END IF;
      IF OLD.status IN ('AWARD_APPROVED','REJECTED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal RFQs are immutable';
      END IF;
      old_rank := CASE OLD.status WHEN 'RFQ_DRAFT' THEN 1 WHEN 'ISSUED' THEN 2
        WHEN 'BID_OPEN' THEN 3 WHEN 'CLOSED' THEN 4 WHEN 'TECHNICAL_EVALUATION' THEN 5
        WHEN 'COMMERCIAL_EVALUATION' THEN 6 WHEN 'AWARD_SUBMITTED' THEN 7 ELSE 8 END;
      new_rank := CASE NEW.status WHEN 'RFQ_DRAFT' THEN 1 WHEN 'ISSUED' THEN 2
        WHEN 'BID_OPEN' THEN 3 WHEN 'CLOSED' THEN 4 WHEN 'TECHNICAL_EVALUATION' THEN 5
        WHEN 'COMMERCIAL_EVALUATION' THEN 6 WHEN 'AWARD_SUBMITTED' THEN 7 ELSE 8 END;
      IF new_rank < old_rank THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'rfq status cannot regress';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_rfq_history
      BEFORE UPDATE OR DELETE ON rfqs
      FOR EACH ROW EXECUTE FUNCTION protect_rfq_history()`);

    // FR-065: once the award has been submitted the evaluation record is decision evidence.
    await queryRunner.query(`CREATE FUNCTION protect_evaluation_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      parent_status varchar(30);
    BEGIN
      SELECT rfq.status INTO parent_status
        FROM bids bid
        JOIN rfqs rfq ON rfq.tenant_id = bid.tenant_id AND rfq.id = bid.rfq_id
        WHERE bid.tenant_id = OLD.tenant_id AND bid.id = OLD.bid_id;
      IF parent_status IN ('AWARD_SUBMITTED','AWARD_APPROVED','REJECTED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'evaluations are immutable once the RFQ award has been submitted';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_evaluation_history
      BEFORE UPDATE OR DELETE ON evaluations
      FOR EACH ROW EXECUTE FUNCTION protect_evaluation_history()`);

    // FR-067: an ISSUED purchase order is a commercial instrument — identity frozen, status
    // forward-only, and only an unissued DRAFT may ever be deleted.
    await queryRunner.query(`CREATE FUNCTION protect_purchase_order_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      old_rank integer;
      new_rank integer;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'only DRAFT purchase orders can be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status IN ('CLOSED','CANCELLED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal purchase orders are immutable';
      END IF;
      IF OLD.status IN ('ISSUED','ACKNOWLEDGED','AMENDED') AND (
        NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.supplier_profile_id IS DISTINCT FROM OLD.supplier_profile_id
        OR NEW.awarded_rfq_id IS DISTINCT FROM OLD.awarded_rfq_id
        OR NEW.po_no IS DISTINCT FROM OLD.po_no
        OR NEW.revision IS DISTINCT FROM OLD.revision
        OR NEW.total_value IS DISTINCT FROM OLD.total_value
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'issued purchase order commercial identity is immutable; amend with a new revision';
      END IF;
      old_rank := CASE OLD.status WHEN 'DRAFT' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'SUBMITTED' THEN 3
        WHEN 'APPROVED' THEN 4 WHEN 'ISSUED' THEN 5 WHEN 'ACKNOWLEDGED' THEN 6
        WHEN 'AMENDED' THEN 7 ELSE 8 END;
      new_rank := CASE NEW.status WHEN 'DRAFT' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'SUBMITTED' THEN 3
        WHEN 'APPROVED' THEN 4 WHEN 'ISSUED' THEN 5 WHEN 'ACKNOWLEDGED' THEN 6
        WHEN 'AMENDED' THEN 7 ELSE 8 END;
      IF new_rank < old_rank THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'purchase order status cannot regress';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_purchase_order_history
      BEFORE UPDATE OR DELETE ON purchase_orders
      FOR EACH ROW EXECUTE FUNCTION protect_purchase_order_history()`);

    // Lines of anything beyond a DRAFT order are frozen; a rogue insert cannot survive either,
    // because it breaks the deferred sum identity below.
    await queryRunner.query(`CREATE FUNCTION protect_purchase_order_line_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      parent_status varchar(20);
    BEGIN
      SELECT status INTO parent_status FROM purchase_orders
        WHERE tenant_id = OLD.tenant_id AND id = OLD.purchase_order_id;
      IF parent_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'purchase order lines are immutable once the order left DRAFT';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_purchase_order_line_history
      BEFORE UPDATE OR DELETE ON purchase_order_lines
      FOR EACH ROW EXECUTE FUNCTION protect_purchase_order_line_history()`);

    // The header/lines identity: if any line exists, SUM(quantity * unit_price) must equal the
    // header total_value — in Postgres numeric. DEFERRABLE INITIALLY DEFERRED (payment-components
    // pattern); the API forces it with SET CONSTRAINTS ALL IMMEDIATE so a wrong breakdown surfaces
    // as PO_LINE_SUM_MISMATCH and rolls the whole slice back.
    await queryRunner.query(`CREATE FUNCTION enforce_purchase_order_line_sum()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_tenant uuid;
      target_po uuid;
      line_count bigint;
      line_total numeric;
      header_total numeric;
    BEGIN
      IF TG_TABLE_NAME = 'purchase_order_lines' THEN
        IF TG_OP = 'DELETE' THEN
          target_tenant := OLD.tenant_id; target_po := OLD.purchase_order_id;
        ELSE
          target_tenant := NEW.tenant_id; target_po := NEW.purchase_order_id;
        END IF;
      ELSE
        target_tenant := NEW.tenant_id; target_po := NEW.id;
      END IF;
      SELECT count(*), COALESCE(sum(quantity * unit_price), 0) INTO line_count, line_total
        FROM purchase_order_lines
        WHERE tenant_id = target_tenant AND purchase_order_id = target_po;
      IF line_count = 0 THEN RETURN NULL; END IF;
      SELECT total_value INTO header_total FROM purchase_orders
        WHERE tenant_id = target_tenant AND id = target_po;
      IF header_total IS NULL THEN RETURN NULL; END IF;
      IF line_total <> header_total THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_purchase_order_line_sum',
          MESSAGE = 'purchase order line amounts must sum to the header total_value';
      END IF;
      RETURN NULL;
    END $$`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER trg_purchase_order_line_sum
      AFTER INSERT OR UPDATE OR DELETE ON purchase_order_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_purchase_order_line_sum()`);
    // Mirrored on the header so editing total_value cannot silently break an existing breakdown.
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER trg_purchase_order_sum_mirror
      AFTER INSERT OR UPDATE ON purchase_orders
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_purchase_order_line_sum()`);

    // FR-069: the committed date is the supplier's promise — slippage is measured against it, so
    // it can never be rewritten. ETD/ETA/actuals stay mutable.
    await queryRunner.query(`CREATE FUNCTION protect_shipment_committed_date()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.committed_date IS DISTINCT FROM OLD.committed_date THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'shipment committed_date is immutable after insert';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_shipment_committed_date
      BEFORE UPDATE ON shipments
      FOR EACH ROW EXECUTE FUNCTION protect_shipment_committed_date()`);

    // FR-070/SEC-125: the milestone stream is append-only evidence of what the carrier reported.
    await queryRunner.query(`CREATE FUNCTION protect_shipment_milestone_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'shipment milestones are append-only; record a new milestone instead';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_shipment_milestone_history
      BEFORE UPDATE OR DELETE ON shipment_milestones
      FOR EACH ROW EXECUTE FUNCTION protect_shipment_milestone_history()`);

    // FR-071: an accepted receipt fed the inventory ledger; it may only be closed, never edited,
    // and never deleted past RECEIVING.
    await queryRunner.query(`CREATE FUNCTION protect_goods_receipt_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'RECEIVING' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'only RECEIVING goods receipts can be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'CLOSED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'closed goods receipts are immutable';
      END IF;
      IF OLD.status = 'ACCEPTED' AND (
        NEW.status <> 'CLOSED'
        OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[])
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'accepted goods receipts are immutable; they may only be closed';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_goods_receipt_history
      BEFORE UPDATE OR DELETE ON goods_receipts
      FOR EACH ROW EXECUTE FUNCTION protect_goods_receipt_history()`);

    // DB-053: the stock ledger is append-only; corrections are new ADJUSTMENT rows.
    await queryRunner.query(`CREATE FUNCTION protect_inventory_transaction_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'inventory transactions are append-only; record an ADJUSTMENT instead';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_inventory_transaction_history
      BEFORE UPDATE OR DELETE ON inventory_transactions
      FOR EACH ROW EXECUTE FUNCTION protect_inventory_transaction_history()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_inventory_transaction_history ON inventory_transactions');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_inventory_transaction_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_goods_receipt_history ON goods_receipts');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_goods_receipt_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_shipment_milestone_history ON shipment_milestones');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_shipment_milestone_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_shipment_committed_date ON shipments');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_shipment_committed_date()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_purchase_order_sum_mirror ON purchase_orders');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_purchase_order_line_sum ON purchase_order_lines');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_purchase_order_line_sum()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_purchase_order_line_history ON purchase_order_lines');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_purchase_order_line_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_purchase_order_history ON purchase_orders');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_purchase_order_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_evaluation_history ON evaluations');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_evaluation_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_rfq_history ON rfqs');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_rfq_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_supplier_profile_history ON supplier_profiles');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_supplier_profile_history()');

    // Restore the commitments table exactly as Contract & Cost left it.
    await queryRunner.query('ALTER TABLE commitments DROP CONSTRAINT ck_commitment_contract_presence');
    await queryRunner.query(`ALTER TABLE commitments ADD CONSTRAINT ck_commitment_contract_presence
      CHECK ((source_type IN ('CONTRACT','CONTRACT_APPENDIX')) = (contract_id IS NOT NULL))`);
    await queryRunner.query('ALTER TABLE commitments DROP CONSTRAINT ck_commitment_source_type');
    await queryRunner.query(`ALTER TABLE commitments ADD CONSTRAINT ck_commitment_source_type
      CHECK (source_type IN ('CONTRACT','CONTRACT_APPENDIX'))`);
    await queryRunner.query('ALTER TABLE commitments DROP CONSTRAINT fk_commitment_purchase_order');
    await queryRunner.query('ALTER TABLE commitments DROP COLUMN purchase_order_id');

    await queryRunner.query('ALTER TABLE rfqs DROP CONSTRAINT IF EXISTS fk_rfq_awarded_bid');
    await queryRunner.query('DROP TABLE IF EXISTS serial_numbers');
    await queryRunner.query('DROP TABLE IF EXISTS inventory_transactions');
    await queryRunner.query('DROP TABLE IF EXISTS goods_receipts');
    await queryRunner.query('DROP TABLE IF EXISTS shipment_milestones');
    await queryRunner.query('DROP TABLE IF EXISTS shipments');
    await queryRunner.query('DROP TABLE IF EXISTS purchase_order_lines');
    await queryRunner.query('DROP TABLE IF EXISTS purchase_orders');
    await queryRunner.query('DROP TABLE IF EXISTS evaluations');
    await queryRunner.query('DROP TABLE IF EXISTS bids');
    await queryRunner.query('DROP TABLE IF EXISTS rfqs');
    await queryRunner.query('DROP TABLE IF EXISTS requisitions');
    await queryRunner.query('DROP TABLE IF EXISTS supplier_profiles');
  }
}
