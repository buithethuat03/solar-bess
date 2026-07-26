import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateProcurementLogistics1783748000000';
const grantMigrationName = 'GrantProcurementPermissions1783749000000';
const tables = [
  'supplier_profiles', 'requisitions', 'rfqs', 'bids', 'evaluations',
  'purchase_orders', 'purchase_order_lines', 'shipments', 'shipment_milestones',
  'goods_receipts', 'inventory_transactions', 'serial_numbers'
];

describe('Procurement & Logistics migration — DB-044…DB-054', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const authorId = randomUUID();
  const approverId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const packageId = randomUUID();
  const companyId = randomUUID();
  const legalEntityId = randomUUID();
  const costCodeId = randomUUID();
  const siteId = randomUUID();
  const supplierId = randomUUID();
  const equipmentModelId = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedMasterData();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('creates every table, reverts the commitments ALTER on down and restores all on re-up', async () => {
    expect(await regclasses()).toEqual(tables);
    expect(await commitmentSourceTypeDefinition()).toContain('PURCHASE_ORDER');
    expect(await commitmentHasPurchaseOrderColumn()).toBe(true);
    expect(await commitmentPresenceDefinition()).toContain('purchase_order_id');

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);
    // The commitments table survives with its ORIGINAL Contract & Cost constraints restored.
    expect(await commitmentSourceTypeDefinition()).not.toContain('PURCHASE_ORDER');
    expect(await commitmentHasPurchaseOrderColumn()).toBe(false);
    expect(await commitmentPresenceDefinition()).not.toContain('purchase_order_id');

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
    expect(await commitmentSourceTypeDefinition()).toContain('PURCHASE_ORDER');
    expect(await commitmentHasPurchaseOrderColumn()).toBe(true);
  });

  it('grants the procurement permissions at policy 10 and takes back exactly what it added', async () => {
    const roleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_CONTROLS','Project Controls',$3::jsonb,1,'ACTIVE')`,
      [roleId, tenantId, JSON.stringify(['package.read', 'supplier.read'])]
    );
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    const granted = await permissionsOf(roleId);
    expect(granted).toEqual(expect.arrayContaining([
      'supplier.read', 'requisition.create', 'bid.evaluate', 'shipment.create',
      'shipment.updateMilestone', 'goodsReceipt.create'
    ]));
    expect(granted).not.toContain('rfq.issue');
    expect(granted).not.toContain('award.submit');
    expect(granted).not.toContain('purchaseOrder.issue');
    // API-079 is deferred: bid.submit must not exist anywhere.
    expect(granted).not.toContain('bid.submit');
    const [role] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
    );
    // Floor, not equality: the full migration chain runs later grant slices that raise the same
    // role's policy version, so an exact match would break every time a slice lands.
    expect(role.policyVersion).toBeGreaterThanOrEqual(10);

    await revertThroughMigration(grantMigrationName);
    const reverted = await permissionsOf(roleId);
    // The pre-existing supplier.read was not added by this migration, so it must survive.
    expect(reverted).toEqual(['package.read', 'supplier.read']);

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('expires supplier profiles instead of deleting them and enforces the status allowlist', async () => {
    await expect(AppDataSource.query(
      'DELETE FROM supplier_profiles WHERE id = $1', [supplierId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE supplier_profiles SET qualification_status = 'BANNED' WHERE id = $1`, [supplierId]
    )).rejects.toMatchObject({ constraint: 'ck_supplier_profile_status' });
    await expect(AppDataSource.query(
      `UPDATE supplier_profiles SET qualification_status = 'EXPIRED' WHERE id = $1`, [supplierId]
    )).resolves.toBeDefined();
  });

  it('freezes ISSUED RFQ business columns, allows only the forward status walk', async () => {
    const requisitionId = await seedRequisition('REQ-001');
    const rfqId = await seedRfq(requisitionId, 'RFQ-001');

    await expect(AppDataSource.query(
      `UPDATE rfqs SET number = 'RFQ-RENAMED' WHERE id = $1`, [rfqId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE rfqs SET invited_supplier_ids = '[]'::jsonb WHERE id = $1`, [rfqId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM rfqs WHERE id = $1', [rfqId]
    )).rejects.toMatchObject({ code: '55000' });

    await expect(AppDataSource.query(
      `UPDATE rfqs SET status = 'CLOSED' WHERE id = $1`, [rfqId]
    )).resolves.toBeDefined();
    // Regression CLOSED → ISSUED refused.
    await expect(AppDataSource.query(
      `UPDATE rfqs SET status = 'ISSUED' WHERE id = $1`, [rfqId]
    )).rejects.toMatchObject({ code: '55000' });
    // AWARD_SUBMITTED requires the award triple (pair CHECK) and then freezes evaluations.
    const bidId = await seedBid(rfqId, supplierId, 1);
    await expect(AppDataSource.query(
      `UPDATE rfqs SET status = 'AWARD_SUBMITTED' WHERE id = $1`, [rfqId]
    )).rejects.toMatchObject({ constraint: 'ck_rfq_award_status' });
    await expect(AppDataSource.query(
      `UPDATE rfqs SET status = 'AWARD_SUBMITTED', awarded_bid_id = $2,
        award_submitted_by = $3, award_submitted_at = now() WHERE id = $1`,
      [rfqId, bidId, approverId]
    )).resolves.toBeDefined();
  });

  it('freezes evaluations once the parent RFQ award is submitted', async () => {
    const requisitionId = await seedRequisition('REQ-001');
    const rfqId = await seedRfq(requisitionId, 'RFQ-001', 'CLOSED');
    const bidId = await seedBid(rfqId, supplierId, 1);
    const evaluationId = await seedEvaluation(bidId, 'TECHNICAL', 1);

    // Editable while the RFQ is still in evaluation.
    await expect(AppDataSource.query(
      `UPDATE evaluations SET notes = 'chỉnh sửa khi còn đánh giá' WHERE id = $1`, [evaluationId]
    )).resolves.toBeDefined();

    await AppDataSource.query(
      `UPDATE rfqs SET status = 'AWARD_SUBMITTED', awarded_bid_id = $2,
        award_submitted_by = $3, award_submitted_at = now() WHERE id = $1`,
      [rfqId, bidId, approverId]
    );
    await expect(AppDataSource.query(
      `UPDATE evaluations SET notes = 'viết lại sau award' WHERE id = $1`, [evaluationId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM evaluations WHERE id = $1', [evaluationId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('rejects at COMMIT a line breakdown that does not sum to the PO total', async () => {
    // Wrong sum: the deferred constraint trigger fails the whole transaction at commit.
    await expect(AppDataSource.transaction(async (manager) => {
      const purchaseOrderId = await seedPurchaseOrder('PO-BAD', 1, '1000.0000', manager);
      await seedPurchaseOrderLine(purchaseOrderId, 1, '10', '50.0000', manager);
    })).rejects.toMatchObject({ constraint: 'ck_purchase_order_line_sum' });
    expect(await count('purchase_orders')).toBe(0);
    expect(await count('purchase_order_lines')).toBe(0);

    // Right sum (10 × 50 + 500 × 1 = 1000) commits.
    await AppDataSource.transaction(async (manager) => {
      const purchaseOrderId = await seedPurchaseOrder('PO-GOOD', 1, '1000.0000', manager);
      await seedPurchaseOrderLine(purchaseOrderId, 1, '10', '50.0000', manager);
      await seedPurchaseOrderLine(purchaseOrderId, 2, '500', '1.0000', manager);
    });
    expect(await count('purchase_orders')).toBe(1);
    expect(await count('purchase_order_lines')).toBe(2);
  });

  it('freezes ISSUED purchase orders and their lines; SoD and open-revision are row constraints', async () => {
    const purchaseOrderId = await seedIssuedPurchaseOrder('PO-2026-001', '500.0000');

    await expect(AppDataSource.query(
      `UPDATE purchase_orders SET total_value = 999 WHERE id = $1`, [purchaseOrderId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE purchase_orders SET status = 'DRAFT' WHERE id = $1`, [purchaseOrderId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM purchase_orders WHERE id = $1', [purchaseOrderId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE purchase_order_lines SET unit_price = 1 WHERE purchase_order_id = $1`,
      [purchaseOrderId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `DELETE FROM purchase_order_lines WHERE purchase_order_id = $1`, [purchaseOrderId]
    )).rejects.toMatchObject({ code: '55000' });

    // Creator must not approve their own order.
    await expect(AppDataSource.transaction((manager) => seedPurchaseOrder(
      'PO-2026-SOD', 1, '1.0000', manager, { approvedBy: authorId }
    ))).rejects.toMatchObject({ constraint: 'ck_purchase_order_sod' });

    // One open revision per po_no: revision 2 conflicts while revision 1 is still open.
    await expect(AppDataSource.transaction((manager) => seedPurchaseOrder(
      'PO-2026-001', 2, '1.0000', manager
    ))).rejects.toMatchObject({ constraint: 'uq_purchase_order_open_revision' });
    // Closing revision 1 frees the number.
    await AppDataSource.query(
      `UPDATE purchase_orders SET status = 'CLOSED' WHERE id = $1`, [purchaseOrderId]
    );
    await AppDataSource.transaction(async (manager) => {
      const nextRevision = await seedPurchaseOrder('PO-2026-001', 2, '1.0000', manager);
      await seedPurchaseOrderLine(nextRevision, 1, '1', '1.0000', manager);
    });
  });

  it('pairs commitment sources: PURCHASE_ORDER carries purchase_order_id, contracts do not', async () => {
    const purchaseOrderId = await seedIssuedPurchaseOrder('PO-CMT', '500.0000');
    // Missing purchase_order_id.
    await expect(seedCommitment('PURCHASE_ORDER', null))
      .rejects.toMatchObject({ constraint: 'ck_commitment_contract_presence' });
    await expect(seedCommitment('PURCHASE_ORDER', purchaseOrderId)).resolves.toBeDefined();
    // A contract-source row must not carry a purchase_order_id (and needs a contract).
    await expect(seedCommitment('CONTRACT', purchaseOrderId))
      .rejects.toMatchObject({ constraint: 'ck_commitment_contract_presence' });
  });

  it('keeps the shipment committed_date immutable while ETD/ETA stay correctable', async () => {
    const purchaseOrderId = await seedIssuedPurchaseOrder('PO-SHIP', '500.0000');
    const shipmentId = await seedShipment(purchaseOrderId);
    await expect(AppDataSource.query(
      `UPDATE shipments SET committed_date = '2026-12-31' WHERE id = $1`, [shipmentId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE shipments SET eta = '2026-10-01', status = 'BOOKED' WHERE id = $1`, [shipmentId]
    )).resolves.toBeDefined();
  });

  it('keeps shipment milestones append-only with replay dedup', async () => {
    const purchaseOrderId = await seedIssuedPurchaseOrder('PO-MS', '500.0000');
    const shipmentId = await seedShipment(purchaseOrderId);
    const milestoneId = randomUUID();
    const eventTime = '2026-08-01T00:00:00.000Z';
    await AppDataSource.query(
      `INSERT INTO shipment_milestones (
        id, tenant_id, shipment_id, milestone_type, event_time, source, created_by
      ) VALUES ($1,$2,$3,'BOOKED',$4,'CARRIER',$5)`,
      [milestoneId, tenantId, shipmentId, eventTime, authorId]
    );
    await expect(AppDataSource.query(
      `INSERT INTO shipment_milestones (
        id, tenant_id, shipment_id, milestone_type, event_time, source, created_by
      ) VALUES ($1,$2,$3,'BOOKED',$4,'CARRIER',$5)`,
      [randomUUID(), tenantId, shipmentId, eventTime, authorId]
    )).rejects.toMatchObject({ constraint: 'uq_shipment_milestone_replay' });
    await expect(AppDataSource.query(
      `UPDATE shipment_milestones SET notes = 'viết lại' WHERE id = $1`, [milestoneId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM shipment_milestones WHERE id = $1', [milestoneId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('freezes goods receipts after acceptance and keeps the inventory ledger append-only', async () => {
    const purchaseOrderId = await seedIssuedPurchaseOrder('PO-GR', '500.0000');
    const lineId = await lineOf(purchaseOrderId);
    const receiptId = await seedReceipt(purchaseOrderId, lineId, 'GR-001', 'ACCEPTED');

    await expect(AppDataSource.query(
      `UPDATE goods_receipts SET quantity = 1 WHERE id = $1`, [receiptId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM goods_receipts WHERE id = $1', [receiptId]
    )).rejects.toMatchObject({ code: '55000' });
    // The one legal exit: ACCEPTED → CLOSED, everything else untouched.
    await expect(AppDataSource.query(
      `UPDATE goods_receipts SET status = 'CLOSED' WHERE id = $1`, [receiptId]
    )).resolves.toBeDefined();
    await expect(AppDataSource.query(
      `UPDATE goods_receipts SET notes = 'đã đóng vẫn sửa' WHERE id = $1`, [receiptId]
    )).rejects.toMatchObject({ code: '55000' });

    const transactionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO inventory_transactions (
        id, tenant_id, project_id, site_id, purchase_order_line_id, goods_receipt_id,
        transaction_type, quantity, uom, source_key, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'RECEIPT',5,'PCS',$7,$8)`,
      [transactionId, tenantId, projectId, siteId, lineId, receiptId,
        `GR:${receiptId}:RECEIPT`, authorId]
    );
    await expect(AppDataSource.query(
      `UPDATE inventory_transactions SET quantity = 99 WHERE id = $1`, [transactionId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM inventory_transactions WHERE id = $1', [transactionId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('scopes serial uniqueness to (tenant, equipment model, normalized serial)', async () => {
    const purchaseOrderId = await seedIssuedPurchaseOrder('PO-SN', '500.0000');
    const lineId = await lineOf(purchaseOrderId);
    const receiptId = await seedReceipt(purchaseOrderId, lineId, 'GR-SN', 'ACCEPTED');

    await seedSerial(receiptId, 'sn-0001');
    // A differently-spelled duplicate collapses onto the same normalized serial.
    await expect(seedSerial(receiptId, '  SN-0001 '))
      .rejects.toMatchObject({ constraint: 'uq_serial_number_scope' });
    // The stored normalized value cannot diverge from upper(btrim(serial_no)).
    await expect(AppDataSource.query(
      `INSERT INTO serial_numbers (
        id, tenant_id, goods_receipt_id, equipment_model_id, serial_no, normalized_serial, created_by
      ) VALUES ($1,$2,$3,$4,'sn-0002','SOMETHING-ELSE',$5)`,
      [randomUUID(), tenantId, receiptId, equipmentModelId, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_serial_number_normalized' });
  });

  it('cannot reference a project, package or supplier from another tenant', async () => {
    await expect(AppDataSource.query(
      `INSERT INTO requisitions (
        id, tenant_id, project_id, package_id, cost_code_id, number, title,
        need_by_date, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'REQ-X','Cross tenant','2026-09-01','DRAFT',$6,$6)`,
      [randomUUID(), tenantId, otherProjectId, packageId, costCodeId, authorId]
    )).rejects.toMatchObject({ code: '23503' });

    const requisitionId = await seedRequisition('REQ-XT');
    await expect(AppDataSource.query(
      `INSERT INTO rfqs (
        id, tenant_id, requisition_id, project_id, number, revision, due_date,
        invited_supplier_ids, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'RFQ-XT',1,now() + interval '7 day',$5::jsonb,'ISSUED',$6,$6)`,
      [randomUUID(), otherTenantId, requisitionId, projectId,
        JSON.stringify([supplierId]), otherTenantUserId]
    )).rejects.toMatchObject({ code: '23503' });
  });

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function count(table: string): Promise<number> {
    const [row] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*) AS count FROM ${table}`
    );
    return Number(row.count);
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      tables.map((table) => `to_regclass('public.${table}')::text AS ${table}`).join(', ')
        .replace(/^/, 'SELECT ')
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function constraintDefinition(name: string): Promise<string> {
    const [row] = await AppDataSource.query<Array<{ definition: string | null }>>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1`,
      [name]
    );
    return row?.definition ?? '';
  }

  function commitmentSourceTypeDefinition(): Promise<string> {
    return constraintDefinition('ck_commitment_source_type');
  }

  function commitmentPresenceDefinition(): Promise<string> {
    return constraintDefinition('ck_commitment_contract_presence');
  }

  async function commitmentHasPurchaseOrderColumn(): Promise<boolean> {
    const [row] = await AppDataSource.query<Array<{ present: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'commitments' AND column_name = 'purchase_order_id'
      ) AS present`
    );
    return row.present;
  }

  async function seedRequisition(number: string): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO requisitions (
        id, tenant_id, project_id, package_id, cost_code_id, number, title,
        need_by_date, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'Yêu cầu mua sắm demo','2026-09-01','DRAFT',$7,$7)`,
      [id, tenantId, projectId, packageId, costCodeId, number, authorId]
    );
    return id;
  }

  async function seedRfq(
    requisitionId: string, number: string, status = 'ISSUED'
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO rfqs (
        id, tenant_id, requisition_id, project_id, number, revision, due_date,
        invited_supplier_ids, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,1,now() + interval '7 day',$6::jsonb,$7,$8,$8)`,
      [id, tenantId, requisitionId, projectId, number,
        JSON.stringify([supplierId]), status, authorId]
    );
    return id;
  }

  async function seedBid(rfqId: string, supplier: string, revision: number): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO bids (
        id, tenant_id, rfq_id, supplier_profile_id, revision, sealed_status, total,
        currency, submitted_at, created_by
      ) VALUES ($1,$2,$3,$4,$5,'SEALED',123456.7890,'VND',now(),$6)`,
      [id, tenantId, rfqId, supplier, revision, authorId]
    );
    return id;
  }

  async function seedEvaluation(
    bidId: string, evaluationType: string, version: number
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO evaluations (
        id, tenant_id, bid_id, evaluation_type, version, evaluator_id, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [id, tenantId, bidId, evaluationType, version, approverId]
    );
    return id;
  }

  async function seedPurchaseOrder(
    poNo: string, revision: number, totalValue: string,
    manager: { query: (sql: string, parameters?: unknown[]) => Promise<unknown> },
    overrides: { approvedBy?: string } = {}
  ): Promise<string> {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO purchase_orders (
        id, tenant_id, project_id, supplier_profile_id, po_no, revision, title, status,
        total_value, currency, issued_at, approved_by, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'PO demo','ISSUED',$7,'VND',now(),$8,$9,$9)`,
      [id, tenantId, projectId, supplierId, poNo, revision, totalValue,
        overrides.approvedBy ?? approverId, authorId]
    );
    return id;
  }

  async function seedPurchaseOrderLine(
    purchaseOrderId: string, lineNo: number, quantity: string, unitPrice: string,
    manager: { query: (sql: string, parameters?: unknown[]) => Promise<unknown> }
  ): Promise<string> {
    const id = randomUUID();
    await manager.query(
      `INSERT INTO purchase_order_lines (
        id, tenant_id, purchase_order_id, line_no, description, quantity, uom,
        unit_price, currency, created_by
      ) VALUES ($1,$2,$3,$4,'Dòng PO demo',$5,'PCS',$6,'VND',$7)`,
      [id, tenantId, purchaseOrderId, lineNo, quantity, unitPrice, authorId]
    );
    return id;
  }

  /** 10 × 50.0000 = 500.0000 — the sum identity is satisfied without any JS arithmetic. */
  async function seedIssuedPurchaseOrder(poNo: string, totalValue: '500.0000'): Promise<string> {
    return AppDataSource.transaction(async (manager) => {
      const id = await seedPurchaseOrder(poNo, 1, totalValue, manager);
      await seedPurchaseOrderLine(id, 1, '10', '50.0000', manager);
      return id;
    });
  }

  async function lineOf(purchaseOrderId: string): Promise<string> {
    const [row] = await AppDataSource.query<Array<{ id: string }>>(
      'SELECT id FROM purchase_order_lines WHERE purchase_order_id = $1 LIMIT 1',
      [purchaseOrderId]
    );
    return row.id;
  }

  async function seedShipment(purchaseOrderId: string): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO shipments (
        id, tenant_id, purchase_order_id, committed_date, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'2026-09-15','PLANNED',$4,$4)`,
      [id, tenantId, purchaseOrderId, authorId]
    );
    return id;
  }

  async function seedReceipt(
    purchaseOrderId: string, lineId: string, receiptNo: string, status: string
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO goods_receipts (
        id, tenant_id, project_id, purchase_order_id, purchase_order_line_id, site_id,
        receipt_no, quantity, condition, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,5,'GOOD',$8,$9,$9)`,
      [id, tenantId, projectId, purchaseOrderId, lineId, siteId, receiptNo, status, authorId]
    );
    return id;
  }

  async function seedSerial(receiptId: string, serialNo: string): Promise<void> {
    const normalized = serialNo.trim().toUpperCase();
    await AppDataSource.query(
      `INSERT INTO serial_numbers (
        id, tenant_id, goods_receipt_id, equipment_model_id, serial_no, normalized_serial, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), tenantId, receiptId, equipmentModelId, serialNo, normalized, authorId]
    );
  }

  async function seedCommitment(
    sourceType: string, purchaseOrderId: string | null
  ): Promise<unknown> {
    return AppDataSource.query(
      `INSERT INTO commitments (
        id, tenant_id, project_id, contract_id, purchase_order_id, cost_code_id, amount,
        currency, status, source_type, source_id, source_version, created_by
      ) VALUES ($1,$2,$3,NULL,$4,$5,500,'VND','ACTIVE',$6,$7,1,$8)`,
      [randomUUID(), tenantId, projectId, purchaseOrderId, costCodeId,
        sourceType, purchaseOrderId ?? randomUUID(), authorId]
    );
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'pl-mig'], [otherTenantId, 'pl-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'pl-mig-author@example.test'],
      [approverId, tenantId, 'pl-mig-approver@example.test'],
      [otherTenantUserId, otherTenantId, 'pl-mig-other@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await seedProject(tenantId, projectId, 'PL-PRJ', authorId, companyId, legalEntityId);
    await seedProject(
      otherTenantId, otherProjectId, 'PL-PRJ-2', otherTenantUserId, randomUUID(), randomUUID()
    );
    await AppDataSource.query(
      `INSERT INTO packages (
        id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'PL-PKG','PL Package','EPC','ACTIVE',$4,$4)`,
      [packageId, tenantId, projectId, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO cost_codes (
        id, tenant_id, code, name, capex_opex_class, status, effective_from, created_by, updated_by
      ) VALUES ($1,$2,'CAPEX-PL','PL Cost Code','CAPEX','ACTIVE','2026-01-01',$3,$3)`,
      [costCodeId, tenantId, authorId]
    );
    await AppDataSource.query(
      `INSERT INTO sites (
        id, tenant_id, project_id, code, name, timezone, is_primary, status
      ) VALUES ($1,$2,$3,'MAIN','PL Site','Asia/Ho_Chi_Minh',true,'ACTIVE')`,
      [siteId, tenantId, projectId]
    );
    await AppDataSource.query(
      `INSERT INTO supplier_profiles (
        id, tenant_id, company_id, legal_entity_id, category, qualification_status,
        valid_from, valid_to, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'PV_MODULE','QUALIFIED','2026-01-01','2030-12-31',$5,$5)`,
      [supplierId, tenantId, companyId, legalEntityId, authorId]
    );
    // The equipment catalog belongs to the sibling slice (migration 1783746); only the composite
    // key (tenant_id, id) is contractual here. Adjust the column list if the sibling's DDL differs.
    await AppDataSource.query(
      `INSERT INTO equipment_models (
        id, tenant_id, equipment_class, manufacturer, model, ratings, spec_version,
        status, created_by, updated_by
      ) VALUES ($1,$2,'PV_MODULE','Demo Manufacturer','PV-550','{}'::jsonb,'v1','APPROVED',$3,$3)`,
      [equipmentModelId, tenantId, authorId]
    );
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerId: string,
    fixtureCompanyId: string, fixtureLegalId: string
  ): Promise<void> {
    const portfolioId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,$3,'Company PL','VENDOR','ACTIVE')`,
      [fixtureCompanyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal PL','VN',$4,'ACTIVE')`,
      [fixtureLegalId, fixtureTenantId, fixtureCompanyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio PL','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Procurement Project','SOLAR','EXECUTION','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, fixtureLegalId, fixtureCompanyId, managerId, code]
    );
  }
});
