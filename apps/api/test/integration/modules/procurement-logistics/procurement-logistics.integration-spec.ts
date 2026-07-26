import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssignmentScopeType, CommitmentEntity, CompanyEntity, CostCodeClass, CostCodeEntity,
  CostCodeStatus, EvaluationEntity, GoodsReceiptEntity, InventoryTransactionEntity,
  LegalEntityEntity, LocalCredentialEntity, MasterRecordStatus, OrganizationType,
  PackageEntity, PackageStatus, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectType, PurchaseOrderEntity, PurchaseOrderLineEntity,
  RequisitionEntity, RfqEntity, RoleAssignmentEntity, RoleEntity, SerialNumberEntity,
  ShipmentEntity, ShipmentMilestoneEntity, SiteEntity, SupplierProfileEntity,
  SupplierQualificationStatus, TenantEntity, UserAccountEntity
} from 'src/database/entities';
import {
  ProcurementLogisticsService
} from 'src/modules/procurement-logistics/procurement-logistics.service';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const awarderId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
/** A second project in the SAME tenant, used to prove the receipt site binding per project. */
const secondProjectId = randomUUID();
const packageAId = randomUUID();
const companyId = randomUUID();
const legalEntityId = randomUUID();
const costCodeId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const supplierQualifiedId = randomUUID();
const supplierPendingId = randomUUID();
const supplierExpiredId = randomUUID();
const equipmentModelId = randomUUID();
const password = 'Procure!Integration2026';

jest.setTimeout(180_000);

describe('Procurement & Logistics HTTP integration — API-076…API-085 (079 deferred)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let service: ProcurementLogisticsService;
  let passwordHash: string;
  let managerToken: string;
  let awarderToken: string;
  let packageToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true
    }));
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
    service = app.get(ProcurementLogisticsService);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    await seedFixture();
    managerToken = await login('pl-manager@example.test', 'pl-test');
    awarderToken = await login('pl-awarder@example.test', 'pl-test');
    packageToken = await login('pl-package@example.test', 'pl-test');
    otherTenantToken = await login('pl-other@example.test', 'pl-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-076: lists the supplier register with filters and cursor paging', async () => {
    const all = await api(managerToken).get('/v1/suppliers').expect(200);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta).toEqual({ limit: 50, nextCursor: null });

    const qualified = await api(managerToken)
      .get('/v1/suppliers?qualificationStatus=QUALIFIED').expect(200);
    expect(qualified.body.data.map((row: { id: string }) => row.id).sort())
      .toEqual([supplierExpiredId, supplierQualifiedId].sort());
    const byCategory = await api(managerToken)
      .get('/v1/suppliers?category=BESS').expect(200);
    expect(byCategory.body.data.map((row: { id: string }) => row.id))
      .toEqual([supplierPendingId]);

    const paged = await api(managerToken).get('/v1/suppliers?limit=2').expect(200);
    expect(paged.body.data).toHaveLength(2);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(managerToken)
      .get(`/v1/suppliers?limit=2&cursor=${paged.body.meta.nextCursor}`).expect(200);
    expect(next.body.data).toHaveLength(1);

    // Another tenant sees only its own register — empty here.
    const foreign = await api(otherTenantToken, otherTenantId).get('/v1/suppliers').expect(200);
    expect(foreign.body.data).toHaveLength(0);

    // 403 stays reserved for a true permission gap: the package role lacks supplier.read.
    const denied = await api(packageToken).get('/v1/suppliers').expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
  });

  it('API-077: creates a DRAFT requisition and validates package/WBS/cost code scope', async () => {
    const created = await createRequisition({ number: 'REQ-2026-001' });
    expect(created).toMatchObject({
      number: 'REQ-2026-001', status: 'DRAFT', projectId, packageId: packageAId,
      wbsId: null, needByDate: '2026-09-01', versionNo: 1
    });

    const duplicate = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload({ number: 'REQ-2026-001' }))
      .expect(409);
    expect(duplicate.body.code).toBe('REQUISITION_NUMBER_CONFLICT');

    const badPackage = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload({ number: 'REQ-2026-002', packageId: randomUUID() }))
      .expect(422);
    expect(badPackage.body.code).toBe('PACKAGE_NOT_FOUND');

    const badWbs = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload({ number: 'REQ-2026-003', wbsId: randomUUID() }))
      .expect(422);
    expect(badWbs.body.code).toBe('WBS_NOT_FOUND');

    const badCostCode = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload({ number: 'REQ-2026-004', costCodeId: randomUUID() }))
      .expect(422);
    expect(badCostCode.body.code).toBe('COST_CODE_NOT_FOUND');
    expect(await count(RequisitionEntity)).toBe(1);

    // Requisitions are project-level: a package-only principal answers 404, never 403.
    const scoped = await api(packageToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload({ number: 'REQ-PKG-001' }))
      .expect(404);
    expect(scoped.body.code).toBe('PROJECT_NOT_FOUND');
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload({ number: 'REQ-XT-001' }))
      .expect(404);
    expect(await count(RequisitionEntity)).toBe(1);
  });

  it('API-078: issues an RFQ only to QUALIFIED, unexpired suppliers', async () => {
    const requisition = await createRequisition({ number: 'REQ-2026-001' });
    const rfq = await createRfq(requisition.id, { number: 'RFQ-2026-001' });
    expect(rfq).toMatchObject({
      number: 'RFQ-2026-001', revision: 1, status: 'ISSUED', projectId,
      invitedSupplierIds: [supplierQualifiedId], awardedBidId: null
    });

    const pending = await api(managerToken).post(`/v1/requisitions/${requisition.id}/rfqs`)
      .set('Idempotency-Key', `pl-rfq-${randomUUID()}`)
      .send(rfqPayload({ number: 'RFQ-2026-002', invitedSupplierIds: [supplierPendingId] }))
      .expect(422);
    expect(pending.body.code).toBe('SUPPLIER_INELIGIBLE');

    // QUALIFIED but with valid_to in the past — the date comparison happens in Postgres.
    const expired = await api(managerToken).post(`/v1/requisitions/${requisition.id}/rfqs`)
      .set('Idempotency-Key', `pl-rfq-${randomUUID()}`)
      .send(rfqPayload({ number: 'RFQ-2026-003', invitedSupplierIds: [supplierExpiredId] }))
      .expect(422);
    expect(expired.body.code).toBe('SUPPLIER_INELIGIBLE');

    const duplicate = await api(managerToken).post(`/v1/requisitions/${requisition.id}/rfqs`)
      .set('Idempotency-Key', `pl-rfq-${randomUUID()}`)
      .send(rfqPayload({ number: 'RFQ-2026-001' }))
      .expect(409);
    expect(duplicate.body.code).toBe('RFQ_NUMBER_CONFLICT');
    expect(await count(RfqEntity)).toBe(1);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/requisitions/${requisition.id}/rfqs`)
      .set('Idempotency-Key', `pl-rfq-${randomUUID()}`)
      .send(rfqPayload({ number: 'RFQ-XT' }))
      .expect(404);
    expect(await count(RfqEntity)).toBe(1);
  });

  it('API-080: seals bids until the RFQ closes, then records versioned evaluations', async () => {
    const requisition = await createRequisition({ number: 'REQ-2026-001' });
    const rfq = await createRfq(requisition.id, { number: 'RFQ-2026-001' });
    // API-079 is deferred: the bid arrives through the internal fixture path only.
    const bid = await registerBid(rfq.id, { total: '123456.7890' });

    // While the RFQ is still ISSUED the bid is sealed: the evaluation is refused AND nothing in
    // the response leaks the commercial fields.
    const sealed = await api(managerToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'TECHNICAL' })
      .expect(422);
    expect(sealed.body.code).toBe('BID_ACCESS_DENIED');
    expect(JSON.stringify(sealed.body)).not.toContain('123456');
    expect(JSON.stringify(sealed.body)).not.toContain('payloadRef');
    expect(await count(EvaluationEntity)).toBe(0);

    await closeRfq(rfq.id);
    const technical = await api(managerToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'TECHNICAL', notes: 'Đạt yêu cầu kỹ thuật' })
      .expect(201);
    expect(technical.body.data).toMatchObject({
      evaluationType: 'TECHNICAL', version: 1, evaluatorId: managerId
    });
    // After CLOSED the commercial fields become visible in the embedded bid.
    expect(technical.body.data.bid).toMatchObject({
      id: bid.id, total: '123456.7890', currency: 'VND', sealedStatus: 'SEALED'
    });

    // A COMMERCIAL normalization that differs from the sealed total needs an override reason;
    // the equality is decided by Postgres numeric.
    const noReason = await api(managerToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'COMMERCIAL', normalizedTotal: '120000' })
      .expect(422);
    expect(noReason.body.code).toBe('EVALUATION_OVERRIDE_REASON_REQUIRED');
    expect(await count(EvaluationEntity)).toBe(1);

    const overridden = await api(managerToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({
        evaluationType: 'COMMERCIAL', normalizedTotal: '120000',
        overrideReason: 'Loại trừ chi phí vận chuyển đã tính trùng'
      })
      .expect(201);
    expect(overridden.body.data).toMatchObject({
      evaluationType: 'COMMERCIAL', version: 1, normalizedTotal: '120000.0000',
      currency: 'VND'
    });
    // An identical normalized total needs no reason, and the per-evaluator version increments.
    const identical = await api(managerToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'COMMERCIAL', normalizedTotal: '123456.789' })
      .expect(201);
    expect(identical.body.data.version).toBe(2);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'TECHNICAL' })
      .expect(404);
    expect(await count(EvaluationEntity)).toBe(3);
  });

  it('API-081: award submission is SoD-guarded and freezes further evaluations', async () => {
    const requisition = await createRequisition({ number: 'REQ-2026-001' });
    const rfq = await createRfq(requisition.id, { number: 'RFQ-2026-001' });
    const bid = await registerBid(rfq.id, { total: '99000' });
    await closeRfq(rfq.id);
    await api(managerToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'TECHNICAL' })
      .expect(201);

    // The manager evaluated a bid of this RFQ and therefore cannot submit its award.
    const sod = await api(managerToken).post(`/v1/rfqs/${rfq.id}:submit-award`)
      .set('Idempotency-Key', `pl-award-${randomUUID()}`)
      .send({ awardedBidId: bid.id })
      .expect(422);
    expect(sod.body.code).toBe('AWARD_SOD_CONFLICT');

    // A bid of another RFQ cannot be awarded here.
    const otherRequisition = await createRequisition({ number: 'REQ-2026-002' });
    const otherRfq = await createRfq(otherRequisition.id, { number: 'RFQ-2026-002' });
    const foreignBid = await registerBid(otherRfq.id, { total: '1' });
    const wrongBid = await api(awarderToken).post(`/v1/rfqs/${rfq.id}:submit-award`)
      .set('Idempotency-Key', `pl-award-${randomUUID()}`)
      .send({ awardedBidId: foreignBid.id })
      .expect(422);
    expect(wrongBid.body.code).toBe('BID_NOT_FOUND');

    const submitted = await api(awarderToken).post(`/v1/rfqs/${rfq.id}:submit-award`)
      .set('Idempotency-Key', `pl-award-${randomUUID()}`)
      .send({ awardedBidId: bid.id })
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      status: 'AWARD_SUBMITTED', awardedBidId: bid.id, awardSubmittedBy: awarderId
    });

    // Submitted means submitted: no second award, no further evaluations.
    const again = await api(awarderToken).post(`/v1/rfqs/${rfq.id}:submit-award`)
      .set('Idempotency-Key', `pl-award-${randomUUID()}`)
      .send({ awardedBidId: bid.id })
      .expect(422);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
    const lateEvaluation = await api(awarderToken).post(`/v1/bids/${bid.id}/evaluations`)
      .set('Idempotency-Key', `pl-eval-${randomUUID()}`)
      .send({ evaluationType: 'COMMERCIAL', normalizedTotal: '99000' })
      .expect(422);
    expect(lateEvaluation.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('API-082: issues the PO with lines and the commitment in one transaction', async () => {
    const created = await createPurchaseOrder({ poNo: 'PO-2026-001' });
    expect(created).toMatchObject({
      poNo: 'PO-2026-001', revision: 1, status: 'ISSUED', totalValue: '500.0000',
      currency: 'VND', approvedBy: awarderId, projectId
    });
    expect(created.issuedAt).toEqual(expect.any(String));
    expect(created.lines).toHaveLength(2);
    const commitment = await dataSource.getRepository(CommitmentEntity)
      .findOneByOrFail({ tenantId, id: created.commitmentId as string });
    expect(commitment).toMatchObject({
      projectId, purchaseOrderId: created.id, contractId: null,
      amount: '500.0000', currency: 'VND', sourceType: 'PURCHASE_ORDER',
      sourceId: created.id, sourceVersion: 1, costCodeId
    });

    // Wrong breakdown: the deferred trigger rejects and the WHOLE slice rolls back.
    const mismatch = await api(managerToken).post(`/v1/projects/${projectId}/purchase-orders`)
      .set('Idempotency-Key', `pl-po-${randomUUID()}`)
      .send(purchaseOrderPayload({
        poNo: 'PO-2026-002',
        lines: [
          { lineNo: 1, description: 'PV module', quantity: '10', uom: 'PCS', unitPrice: '1' }
        ]
      }))
      .expect(422);
    expect(mismatch.body.code).toBe('PO_LINE_SUM_MISMATCH');
    expect(await count(PurchaseOrderEntity)).toBe(1);
    expect(await count(PurchaseOrderLineEntity)).toBe(2);
    expect(await count(CommitmentEntity)).toBe(1);

    const selfApproved = await api(managerToken)
      .post(`/v1/projects/${projectId}/purchase-orders`)
      .set('Idempotency-Key', `pl-po-${randomUUID()}`)
      .send(purchaseOrderPayload({ poNo: 'PO-2026-003', approvedBy: managerId }))
      .expect(422);
    expect(selfApproved.body.code).toBe('PO_SOD_CONFLICT');

    const duplicate = await api(managerToken)
      .post(`/v1/projects/${projectId}/purchase-orders`)
      .set('Idempotency-Key', `pl-po-${randomUUID()}`)
      .send(purchaseOrderPayload({ poNo: 'PO-2026-001' }))
      .expect(409);
    expect(duplicate.body.code).toBe('PO_NUMBER_CONFLICT');

    const badSupplier = await api(managerToken)
      .post(`/v1/projects/${projectId}/purchase-orders`)
      .set('Idempotency-Key', `pl-po-${randomUUID()}`)
      .send(purchaseOrderPayload({ poNo: 'PO-2026-004', supplierProfileId: randomUUID() }))
      .expect(422);
    expect(badSupplier.body.code).toBe('SUPPLIER_NOT_FOUND');
    expect(await count(PurchaseOrderEntity)).toBe(1);
    expect(await count(CommitmentEntity)).toBe(1);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/projects/${projectId}/purchase-orders`)
      .set('Idempotency-Key', `pl-po-${randomUUID()}`)
      .send(purchaseOrderPayload({ poNo: 'PO-XT-001' }))
      .expect(404);
    expect(await count(PurchaseOrderEntity)).toBe(1);
  });

  it('API-083: plans shipments against reachable, open purchase orders only', async () => {
    const order = await createPurchaseOrder({ poNo: 'PO-2026-001' });
    const shipment = await createShipment(order.id);
    expect(shipment).toMatchObject({
      purchaseOrderId: order.id, status: 'PLANNED', committedDate: '2026-09-15',
      eta: '2026-09-10', versionNo: 1
    });

    // Package-scoped principals have no reach into shipments; cross-tenant sees nothing either.
    await api(packageToken).post(`/v1/purchase-orders/${order.id}/shipments`)
      .set('Idempotency-Key', `pl-ship-${randomUUID()}`)
      .send(shipmentPayload())
      .expect(404);
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/purchase-orders/${order.id}/shipments`)
      .set('Idempotency-Key', `pl-ship-${randomUUID()}`)
      .send(shipmentPayload())
      .expect(404);

    await dataSource.query(
      `UPDATE purchase_orders SET status = 'CLOSED' WHERE id = $1`, [order.id]
    );
    const closed = await api(managerToken).post(`/v1/purchase-orders/${order.id}/shipments`)
      .set('Idempotency-Key', `pl-ship-${randomUUID()}`)
      .send(shipmentPayload())
      .expect(422);
    expect(closed.body.code).toBe('INVALID_STATE_TRANSITION');
    expect(await count(ShipmentEntity)).toBe(1);
  });

  it('API-084: appends milestones in order and derives the shipment status monotonically', async () => {
    const order = await createPurchaseOrder({ poNo: 'PO-2026-001' });
    const shipment = await createShipment(order.id);

    const booked = await createMilestone(shipment.id, 'BOOKED', '2026-08-01T00:00:00.000Z');
    expect(booked.shipment).toMatchObject({ status: 'BOOKED', versionNo: 2 });
    const delivered = await createMilestone(shipment.id, 'DELIVERED', '2026-09-12T00:00:00.000Z');
    expect(delivered.shipment).toMatchObject({
      status: 'DELIVERED', actualDeliveryDate: '2026-09-12'
    });

    // A later report of an earlier stage is out of order and writes nothing.
    const regression = await api(managerToken).post(`/v1/shipments/${shipment.id}/milestones`)
      .set('Idempotency-Key', `pl-ms-${randomUUID()}`)
      .send({
        milestoneType: 'DEPARTED', eventTime: '2026-09-13T00:00:00.000Z', source: 'CARRIER'
      })
      .expect(422);
    expect(regression.body.code).toBe('MILESTONE_OUT_OF_ORDER');
    expect(await count(ShipmentMilestoneEntity)).toBe(2);

    // Carrier replay of the same (type, time, source) is a duplicate, not a second event. The
    // DELIVERED row above was recorded by CARRIER, so the replay must also be CARRIER — a MANUAL
    // report at the same instant is a distinct event by design, asserted in its own test below.
    const replay = await api(managerToken).post(`/v1/shipments/${shipment.id}/milestones`)
      .set('Idempotency-Key', `pl-ms-${randomUUID()}`)
      .send({
        milestoneType: 'DELIVERED', eventTime: '2026-09-12T00:00:00.000Z', source: 'CARRIER'
      })
      .expect(409);
    expect(replay.body.code).toBe('MILESTONE_DUPLICATE');
    expect(await count(ShipmentMilestoneEntity)).toBe(2);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/shipments/${shipment.id}/milestones`)
      .set('Idempotency-Key', `pl-ms-${randomUUID()}`)
      .send({
        milestoneType: 'EXCEPTION', eventTime: '2026-09-14T00:00:00.000Z', source: 'MANUAL'
      })
      .expect(404);
    expect(await count(ShipmentMilestoneEntity)).toBe(2);
  });

  it('API-084: milestone source MANUAL at the same instant is a distinct event', async () => {
    const order = await createPurchaseOrder({ poNo: 'PO-2026-001' });
    const shipment = await createShipment(order.id);
    await createMilestone(shipment.id, 'BOOKED', '2026-08-01T00:00:00.000Z', 'CARRIER');
    const manual = await createMilestone(shipment.id, 'BOOKED', '2026-08-01T00:00:00.000Z', 'MANUAL');
    expect(manual.shipment.status).toBe('BOOKED');
    expect(await count(ShipmentMilestoneEntity)).toBe(2);
  });

  it('API-085: receives goods transactionally — inventory, serials and quarantine', async () => {
    const order = await createPurchaseOrder({ poNo: 'PO-2026-001' });
    const lineId = order.lines[0].id;

    const received = await createGoodsReceipt(order.id, {
      purchaseOrderLineId: lineId, receiptNo: 'GR-2026-001', quantity: '6',
      serials: [
        { serialNo: 'sn-0001', equipmentModelId },
        { serialNo: 'SN-0002', equipmentModelId }
      ]
    });
    expect(received).toMatchObject({
      receiptNo: 'GR-2026-001', status: 'ACCEPTED', condition: 'GOOD', quantity: '6.0000',
      siteId, projectId
    });
    expect(received.inventoryTransactions).toHaveLength(1);
    expect(received.inventoryTransactions[0]).toMatchObject({
      transactionType: 'RECEIPT', quantity: '6.0000', uom: 'PCS',
      sourceKey: `GR:${received.id}:RECEIPT`
    });
    expect(received.serials.map((row) => row.normalizedSerial))
      .toEqual(['SN-0001', 'SN-0002']);

    // Over-receipt: 6 accepted + 5 incoming > 10 ordered — refused, and NOTHING is written.
    const over = await api(managerToken)
      .post(`/v1/purchase-orders/${order.id}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload({
        purchaseOrderLineId: lineId, receiptNo: 'GR-2026-002', quantity: '5'
      }))
      .expect(422);
    expect(over.body.code).toBe('OVER_RECEIPT');
    expect(await count(GoodsReceiptEntity)).toBe(1);
    expect(await count(InventoryTransactionEntity)).toBe(1);

    // Duplicate serial (same normalized form): the whole receipt rolls back.
    const duplicateSerial = await api(managerToken)
      .post(`/v1/purchase-orders/${order.id}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload({
        purchaseOrderLineId: lineId, receiptNo: 'GR-2026-003', quantity: '1',
        serials: [{ serialNo: '  sn-0001 ', equipmentModelId }]
      }))
      .expect(409);
    expect(duplicateSerial.body.code).toBe('SERIAL_CONFLICT');
    expect(await count(GoodsReceiptEntity)).toBe(1);
    expect(await count(InventoryTransactionEntity)).toBe(1);
    expect(await count(SerialNumberEntity)).toBe(2);

    // A damaged delivery is quarantined and writes RECEIPT + QUARANTINE_IN together.
    const damaged = await createGoodsReceipt(order.id, {
      purchaseOrderLineId: lineId, receiptNo: 'GR-2026-004', quantity: '2', condition: 'DAMAGED'
    });
    expect(damaged.status).toBe('QUARANTINED');
    expect(damaged.inventoryTransactions.map((row) => row.transactionType).sort())
      .toEqual(['QUARANTINE_IN', 'RECEIPT']);

    // Wrong site (another project) and receipt number reuse are refused with nothing written.
    const wrongSite = await api(managerToken)
      .post(`/v1/purchase-orders/${order.id}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload({
        purchaseOrderLineId: lineId, receiptNo: 'GR-2026-005', quantity: '1',
        siteId: otherSiteId
      }))
      .expect(422);
    expect(wrongSite.body.code).toBe('SITE_NOT_FOUND');
    const reusedNumber = await api(managerToken)
      .post(`/v1/purchase-orders/${order.id}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload({
        purchaseOrderLineId: lineId, receiptNo: 'GR-2026-001', quantity: '1'
      }))
      .expect(409);
    expect(reusedNumber.body.code).toBe('RECEIPT_NUMBER_CONFLICT');
    expect(await count(GoodsReceiptEntity)).toBe(2);

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/purchase-orders/${order.id}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload({
        purchaseOrderLineId: lineId, receiptNo: 'GR-XT-001', quantity: '1'
      }))
      .expect(404);
    expect(await count(GoodsReceiptEntity)).toBe(2);
  });

  it('API-085: a package-scoped principal in the PO project may record receipts', async () => {
    const order = await createPurchaseOrder({ poNo: 'PO-2026-001' });
    const receipt = await api(packageToken)
      .post(`/v1/purchase-orders/${order.id}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload({
        purchaseOrderLineId: order.lines[0].id, receiptNo: 'GR-PKG-001', quantity: '1'
      }))
      .expect(201);
    expect(receipt.body.data.createdBy).toBe(packageUserId);
  });

  it('replays an identical command and conflicts on a reused key with different content', async () => {
    const key = `pl-replay-${randomUUID()}`;
    const first = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', key).send(requisitionPayload({ number: 'REQ-2026-001' }))
      .expect(201);
    const replay = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', key).send(requisitionPayload({ number: 'REQ-2026-001' }))
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await count(RequisitionEntity)).toBe(1);

    const conflict = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', key).send(requisitionPayload({ number: 'REQ-2026-999' }))
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await count(RequisitionEntity)).toBe(1);
  });

  it('rejects a malformed cursor and a missing Idempotency-Key without writing', async () => {
    const cursor = await api(managerToken)
      .get('/v1/suppliers?cursor=not-a-cursor').expect(400);
    expect(cursor.body.code).toBe('INVALID_CURSOR');

    const missingKey = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .send(requisitionPayload({ number: 'REQ-2026-001' }))
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await count(RequisitionEntity)).toBe(0);
  });

  function requisitionPayload(overrides: Partial<{
    number: string; packageId: string; wbsId: string; costCodeId: string;
  }> = {}) {
    return {
      number: overrides.number ?? 'REQ-2026-001',
      title: 'Mua module PV cho trạm demo',
      packageId: overrides.packageId ?? packageAId,
      costCodeId: overrides.costCodeId ?? costCodeId,
      needByDate: '2026-09-01',
      ...(overrides.wbsId ? { wbsId: overrides.wbsId } : {})
    };
  }

  async function createRequisition(overrides: Parameters<typeof requisitionPayload>[0]) {
    const response = await api(managerToken).post(`/v1/projects/${projectId}/requisitions`)
      .set('Idempotency-Key', `pl-req-${randomUUID()}`)
      .send(requisitionPayload(overrides))
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  function rfqPayload(overrides: Partial<{
    number: string; invitedSupplierIds: string[];
  }> = {}) {
    return {
      number: overrides.number ?? 'RFQ-2026-001',
      dueDate: '2026-08-15T00:00:00.000Z',
      invitedSupplierIds: overrides.invitedSupplierIds ?? [supplierQualifiedId]
    };
  }

  async function createRfq(
    requisitionId: string, overrides: Parameters<typeof rfqPayload>[0]
  ) {
    const response = await api(managerToken).post(`/v1/requisitions/${requisitionId}/rfqs`)
      .set('Idempotency-Key', `pl-rfq-${randomUUID()}`)
      .send(rfqPayload(overrides))
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  /** API-079 is deferred: bids exist only through the service's internal fixture path. */
  async function registerBid(rfqId: string, overrides: { total: string }) {
    return service.registerSealedBid(
      { userId: managerId, tenantId, sessionId: randomUUID(), correlationId: randomUUID() },
      {
        rfqId, supplierProfileId: supplierQualifiedId,
        total: overrides.total, currency: 'VND',
        payloadRef: { document: 'minio://bids/demo-bid.pdf' }
      }
    );
  }

  async function closeRfq(rfqId: string): Promise<void> {
    await dataSource.query(`UPDATE rfqs SET status = 'CLOSED' WHERE id = $1`, [rfqId]);
  }

  function purchaseOrderPayload(overrides: Partial<{
    poNo: string; approvedBy: string; supplierProfileId: string;
    lines: Array<Record<string, unknown>>;
  }> = {}) {
    return {
      poNo: overrides.poNo ?? 'PO-2026-001',
      title: 'PO mua module PV',
      supplierProfileId: overrides.supplierProfileId ?? supplierQualifiedId,
      totalValue: '500', currency: 'VND',
      approvedBy: overrides.approvedBy ?? awarderId,
      costCodeId,
      lines: overrides.lines ?? [
        { lineNo: 1, description: 'PV module 550Wp', quantity: '10', uom: 'PCS', unitPrice: '45' },
        { lineNo: 2, description: 'Phụ kiện lắp đặt', quantity: '10', uom: 'SET', unitPrice: '5' }
      ]
    };
  }

  async function createPurchaseOrder(overrides: Parameters<typeof purchaseOrderPayload>[0]) {
    const response = await api(managerToken).post(`/v1/projects/${projectId}/purchase-orders`)
      .set('Idempotency-Key', `pl-po-${randomUUID()}`)
      .send(purchaseOrderPayload(overrides))
      .expect(201);
    return response.body.data as {
      id: string; lines: Array<{ id: string }>; commitmentId: string;
    } & Record<string, unknown>;
  }

  function shipmentPayload() {
    return { committedDate: '2026-09-15', etd: '2026-08-20', eta: '2026-09-10' };
  }

  async function createShipment(purchaseOrderId: string) {
    const response = await api(managerToken)
      .post(`/v1/purchase-orders/${purchaseOrderId}/shipments`)
      .set('Idempotency-Key', `pl-ship-${randomUUID()}`)
      .send(shipmentPayload())
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  async function createMilestone(
    shipmentId: string, milestoneType: string, eventTime: string, source = 'CARRIER'
  ) {
    const response = await api(managerToken).post(`/v1/shipments/${shipmentId}/milestones`)
      .set('Idempotency-Key', `pl-ms-${randomUUID()}`)
      .send({ milestoneType, eventTime, source })
      .expect(201);
    return response.body.data as {
      id: string; shipment: { status: string; versionNo: number } & Record<string, unknown>;
    } & Record<string, unknown>;
  }

  function goodsReceiptPayload(overrides: {
    purchaseOrderLineId: string; receiptNo: string; quantity: string;
    condition?: string; siteId?: string; serials?: Array<Record<string, unknown>>;
  }) {
    return {
      purchaseOrderLineId: overrides.purchaseOrderLineId,
      siteId: overrides.siteId ?? siteId,
      receiptNo: overrides.receiptNo, quantity: overrides.quantity,
      condition: overrides.condition ?? 'GOOD',
      ...(overrides.serials ? { serials: overrides.serials } : {})
    };
  }

  async function createGoodsReceipt(
    purchaseOrderId: string, overrides: Parameters<typeof goodsReceiptPayload>[0]
  ) {
    const response = await api(managerToken)
      .post(`/v1/purchase-orders/${purchaseOrderId}/goods-receipts`)
      .set('Idempotency-Key', `pl-gr-${randomUUID()}`)
      .send(goodsReceiptPayload(overrides))
      .expect(201);
    return response.body.data as {
      id: string;
      inventoryTransactions: Array<Record<string, unknown>>;
      serials: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'pl-test', name: 'Procurement Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'pl-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'pl-manager@example.test', 'Procurement Manager'),
      user(awarderId, tenantId, 'pl-awarder@example.test', 'Award Submitter'),
      user(packageUserId, tenantId, 'pl-package@example.test', 'Package Receiver'),
      user(otherTenantUserId, otherTenantId, 'pl-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(awarderId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const managerRole = await role(tenantId, 'PL_MANAGER', [
      'supplier.read', 'requisition.create', 'rfq.issue', 'bid.evaluate', 'award.submit',
      'purchaseOrder.issue', 'shipment.create', 'shipment.updateMilestone', 'goodsReceipt.create'
    ]);
    // Holds award.submit WITHOUT having evaluated anything — the clean SoD counterpart.
    const awarderRole = await role(tenantId, 'PL_AWARDER', [
      'supplier.read', 'award.submit', 'bid.evaluate'
    ]);
    // Package-scope principal: receipt codes admit it inside the PO's project; everything else 404s.
    const packageRole = await role(tenantId, 'PL_PACKAGE', [
      'requisition.create', 'shipment.create', 'goodsReceipt.create'
    ]);
    const otherRole = await role(otherTenantId, 'PL_OTHER', [
      'supplier.read', 'requisition.create', 'rfq.issue', 'bid.evaluate', 'award.submit',
      'purchaseOrder.issue', 'shipment.create', 'shipment.updateMilestone', 'goodsReceipt.create'
    ]);

    await seedProject(tenantId, projectId, 'PL-PRJ', managerId, companyId, legalEntityId);
    await seedProject(
      otherTenantId, otherProjectId, 'PL-OTH', otherTenantUserId, randomUUID(), randomUUID()
    );
    await dataSource.getRepository(PackageEntity).save({
      id: packageAId, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
      code: 'PL-PKG-A', name: 'PL Package A', packageType: 'EPC', status: PackageStatus.ACTIVE,
      versionNo: 1, idempotencyKey: null, createdBy: managerId, updatedBy: managerId
    });
    await dataSource.getRepository(CostCodeEntity).save({
      id: costCodeId, tenantId, parentCostCodeId: null, code: 'CAPEX-PL',
      name: 'Procurement Cost Code', capexOpexClass: CostCodeClass.CAPEX,
      status: CostCodeStatus.ACTIVE, effectiveFrom: '2026-01-01', effectiveTo: null,
      createdBy: managerId, updatedBy: managerId
    });
    await dataSource.getRepository(SiteEntity).save([
      {
        id: siteId, tenantId, projectId, code: 'MAIN', name: 'PL Main Site', location: null,
        timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: MasterRecordStatus.ACTIVE,
        idempotencyKey: null
      },
      {
        // A site of ANOTHER project in the same tenant: the receipt site binding must refuse it.
        id: otherSiteId, tenantId, projectId: secondProjectId, code: 'MAIN',
        name: 'Second Project Site', location: null, timezone: 'Asia/Ho_Chi_Minh',
        isPrimary: true, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
      }
    ]);
    await dataSource.getRepository(SupplierProfileEntity).save([
      supplier(supplierQualifiedId, 'PV_MODULE', SupplierQualificationStatus.QUALIFIED, '2030-12-31'),
      supplier(supplierPendingId, 'BESS', SupplierQualificationStatus.PENDING, '2030-12-31'),
      supplier(supplierExpiredId, 'INVERTER', SupplierQualificationStatus.QUALIFIED, '2025-12-31', '2024-01-01')
    ]);
    // The equipment catalog is the sibling slice's table; only (tenant_id, id) is contractual.
    // Adjust the column list here if the sibling's DDL differs at merge time.
    await dataSource.query(
      `INSERT INTO equipment_models (
        id, tenant_id, equipment_class, manufacturer, model, ratings, spec_version,
        status, created_by, updated_by
      ) VALUES ($1,$2,'PV_MODULE','Demo Manufacturer','PV-550','{}'::jsonb,'v1','APPROVED',$3,$3)`,
      [equipmentModelId, tenantId, managerId]
    );

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, awarderId, awarderRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageAId),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerUserId: string,
    fixtureCompanyId: string, fixtureLegalId: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: fixtureCompanyId, tenantId: fixtureTenantId, code: `COMP-${code}`,
      name: `Company ${code}`, organizationType: OrganizationType.VENDOR,
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const legal = await dataSource.getRepository(LegalEntityEntity).save({
      id: fixtureLegalId, tenantId: fixtureTenantId, companyId: company.id,
      legalName: `Legal ${code}`, country: 'VN', registrationNo: `REG-${code}`,
      taxId: null, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const portfolio = await dataSource.getRepository(PortfolioEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `PORT-${code}`,
      name: `Portfolio ${code}`, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    await dataSource.getRepository(ProjectEntity).save({
      id: fixtureProjectId, tenantId: fixtureTenantId, portfolioId: portfolio.id,
      ownerLegalEntityId: legal.id, customerCompanyId: company.id,
      projectManagerId: managerUserId, code, name: `Project ${code}`, type: ProjectType.SOLAR,
      phase: ProjectPhase.EXECUTION, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31', forecastCod: null,
      versionNo: 1, idempotencyKey: null
    });
    if (fixtureTenantId === tenantId) {
      await dataSource.getRepository(ProjectEntity).save({
        id: secondProjectId, tenantId, portfolioId: portfolio.id,
        ownerLegalEntityId: legal.id, customerCompanyId: company.id,
        projectManagerId: managerUserId, code: `${code}-2`, name: `Project ${code} 2`,
        type: ProjectType.SOLAR, phase: ProjectPhase.EXECUTION,
        recordStatus: ProjectRecordStatus.ACTIVE, contractModel: 'EPC', currency: 'VND',
        plannedCod: '2027-12-31', forecastCod: null, versionNo: 1, idempotencyKey: null
      });
    }
  }

  function supplier(
    id: string, category: string, qualificationStatus: SupplierQualificationStatus,
    validTo: string, validFrom = '2026-01-01'
  ) {
    return {
      id, tenantId, companyId, legalEntityId, category, qualificationStatus,
      validFrom, validTo, versionNo: 1,
      createdBy: managerId, updatedBy: managerId
    };
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 10, status: MasterRecordStatus.ACTIVE
    });
  }

  function assignment(
    fixtureTenantId: string, userAccountId: string, roleId: string,
    scopeType: AssignmentScopeType, scopeId: string | null
  ) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId, roleId,
      scopeType, scopeId, effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null, status: MasterRecordStatus.ACTIVE
    };
  }

  function user(id: string, fixtureTenantId: string, email: string, displayName: string) {
    return {
      id, tenantId: fixtureTenantId, email, normalizedEmail: email,
      displayName, status: MasterRecordStatus.ACTIVE, lastLoginAt: null
    };
  }

  function credential(userAccountId: string, fixtureTenantId: string) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId,
      passwordHash, algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    };
  }

  async function login(email: string, tenantCode: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/v1/auth/login')
      .send({ tenantCode, email, password }).expect(200);
    return response.body.accessToken as string;
  }

  function api(token: string, headerTenantId = tenantId) {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', headerTenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path))
    };
  }
});
