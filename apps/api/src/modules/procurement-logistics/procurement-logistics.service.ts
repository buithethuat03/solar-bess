import {
  ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, In, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  AuditEventEntity, BidEntity, BidSealedStatus, CommitmentEntity, CommitmentSourceType,
  CommitmentStatus, CostCodeEntity, CostCodeStatus, EvaluationEntity, EvaluationType,
  GoodsReceiptCondition, GoodsReceiptEntity, GoodsReceiptStatus, InventoryTransactionEntity,
  InventoryTransactionType, PackageEntity, PackageStatus, ProjectEntity, PurchaseOrderEntity,
  PurchaseOrderLineEntity, PurchaseOrderStatus, RequisitionEntity, RequisitionStatus,
  RFQ_BID_VISIBLE_STATUSES, RfqEntity, RfqStatus, SerialNumberEntity, ShipmentEntity,
  ShipmentMilestoneEntity, ShipmentStatus, SiteEntity, SupplierProfileEntity,
  SupplierQualificationStatus, UserAccountEntity, WbsNodeEntity
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeProcurementCursor, encodeProcurementCursor } from './domain/cursor';
import { assessMilestoneOrder, deriveShipmentStatus } from './domain/milestone-policy';
import { normalizeSerial } from './domain/serial-number';
import type {
  CreateEvaluationDto, CreateGoodsReceiptDto, CreatePurchaseOrderDto, CreateRequisitionDto,
  CreateRfqDto, CreateShipmentDto, CreateShipmentMilestoneDto, RegisterSealedBidInput,
  SubmitAwardDto, SupplierListQueryDto
} from './dto/procurement-logistics.dto';

export interface RequestContext extends AuthContext { correlationId: string }

/**
 * US Procurement & Logistics (API-076…API-085).
 *
 * Ground rules inherited from Contract & Cost and enforced throughout:
 * - MONEY NEVER TOUCHES JS: totals, quantities and every comparison (over-receipt, PO line sum,
 *   bid-vs-normalized) are computed by Postgres in `numeric`; this service moves strings.
 * - Out of ABAC scope is indistinguishable from missing: 404, never 403. Procurement objects are
 *   project-scoped through their owning purchase order / requisition; only goods receipts
 *   additionally admit package-scoped principals whose package sits in the PO's project.
 * - SEALED BIDS: while the parent RFQ status is before CLOSED, a bid's total, currency and
 *   payload_ref are never serialized in any response (RFQ_BID_VISIBLE_STATUSES).
 *
 * API-079 (supplier bid submission) is DEFERRED — no external supplier identity exists. Bids are
 * created only through `registerSealedBid`, an internal fixture path with no route.
 */
@Injectable()
export class ProcurementLogisticsService {
  constructor(
    @InjectRepository(SupplierProfileEntity)
    private readonly suppliers: Repository<SupplierProfileEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly purchaseOrders: Repository<PurchaseOrderEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-076 — the tenant supplier/qualification register; a tenant-level master catalog. */
  async listSuppliers(context: RequestContext, query: SupplierListQueryDto) {
    await this.permissions.accessScopeSets(context, 'supplier.read');
    const cursor = decodeProcurementCursor(query.cursor);
    const builder = this.suppliers.createQueryBuilder('supplier')
      .where('supplier.tenantId = :tenantId', { tenantId: context.tenantId });
    if (query.category) {
      builder.andWhere('supplier.category = :category', { category: query.category });
    }
    if (query.qualificationStatus) {
      builder.andWhere('supplier.qualificationStatus = :qualificationStatus', {
        qualificationStatus: query.qualificationStatus
      });
    }
    if (cursor) this.applyCursor(builder, 'supplier', cursor, 'supplier_profiles', context.tenantId);
    const rows = await builder
      .orderBy('supplier.createdAt', 'DESC').addOrderBy('supplier.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => this.supplierView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-077 — requisition header, born DRAFT; the approval walk rides the workflow engine later. */
  async createRequisition(
    context: RequestContext, projectId: string, input: CreateRequisitionDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'requisition.create');
    return this.commands.execute({
      context, operation: 'API-077:create-requisition', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'Requisition',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Requisition', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const packageExists = await manager.getRepository(PackageEntity).existsBy({
          id: input.packageId, tenantId: context.tenantId, projectId,
          status: PackageStatus.ACTIVE
        });
        if (!packageExists) {
          throw this.unprocessable('PACKAGE_NOT_FOUND', 'Gói thầu không thuộc dự án này');
        }
        if (input.wbsId) {
          const wbsExists = await manager.getRepository(WbsNodeEntity).existsBy({
            id: input.wbsId, tenantId: context.tenantId, projectId
          });
          if (!wbsExists) {
            throw this.unprocessable('WBS_NOT_FOUND', 'WBS node không thuộc dự án này');
          }
        }
        await this.assertActiveCostCode(manager, context, input.costCodeId);

        const row = manager.getRepository(RequisitionEntity).create({
          id: randomUUID(), tenantId: context.tenantId, projectId,
          packageId: input.packageId, wbsId: input.wbsId ?? null,
          costCodeId: input.costCodeId, number: input.number, title: input.title,
          description: input.description ?? null, needByDate: input.needByDate,
          status: RequisitionStatus.DRAFT,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(RequisitionEntity).save(row),
          {
            uq_requisition_project_number: () => this.conflict(
              'REQUISITION_NUMBER_CONFLICT', 'Số requisition đã tồn tại trong dự án'
            ),
            fk_requisition_wbs: () => this.unprocessable(
              'WBS_NOT_FOUND', 'WBS node không thuộc dự án này'
            )
          }
        );
        const saved = await manager.getRepository(RequisitionEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Requisition', saved.id, saved.versionNo,
          'Requisition.Created', {
            projectId, packageId: saved.packageId, number: saved.number,
            needByDate: saved.needByDate,
            summary: `Requisition ${saved.number} created`
          });
        return this.requisitionView(saved);
      }
    });
  }

  /**
   * API-078 — issues the RFQ directly (the catalog has no draft endpoint). Every invited supplier
   * must be QUALIFIED with `valid_to` not in the past, decided by Postgres against CURRENT_DATE.
   * The invitation set is stored as a validated jsonb snapshot — no invitation child table exists
   * in the dictionary (recorded).
   */
  async createRfq(
    context: RequestContext, requisitionId: string, input: CreateRfqDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'rfq.issue');
    return this.commands.execute({
      context, operation: 'API-078:create-rfq', idempotencyKey,
      request: { requisitionId, input }, responseStatus: 201, resourceType: 'Rfq',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Rfq', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const requisition = await this.lockRequisition(manager, context, requisitionId, scope);
        const invitedIds = [...new Set(input.invitedSupplierIds)];
        const [eligibility] = await manager.query<Array<{ eligible: number }>>(
          `SELECT count(*)::int AS "eligible" FROM supplier_profiles
          WHERE tenant_id = $1 AND id = ANY($2::uuid[])
            AND qualification_status = $3
            AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
          [context.tenantId, invitedIds, SupplierQualificationStatus.QUALIFIED]
        );
        if (eligibility.eligible !== invitedIds.length) {
          throw this.unprocessable(
            'SUPPLIER_INELIGIBLE',
            'Mọi supplier được mời phải đang QUALIFIED và còn hiệu lực qualification'
          );
        }

        const row = manager.getRepository(RfqEntity).create({
          id: randomUUID(), tenantId: context.tenantId,
          requisitionId: requisition.id, projectId: requisition.projectId,
          number: input.number, revision: input.revision ?? 1,
          dueDate: new Date(input.dueDate), invitedSupplierIds: invitedIds,
          status: RfqStatus.ISSUED,
          awardedBidId: null, awardSubmittedBy: null, awardSubmittedAt: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(RfqEntity).save(row),
          {
            uq_rfq_project_number_revision: () => this.conflict(
              'RFQ_NUMBER_CONFLICT', 'Số RFQ và revision đã tồn tại trong dự án'
            )
          }
        );
        const saved = await manager.getRepository(RfqEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Rfq', saved.id, saved.versionNo, 'Rfq.Issued', {
          projectId: saved.projectId, requisitionId: saved.requisitionId,
          number: saved.number, revision: saved.revision,
          invitedSupplierCount: invitedIds.length,
          summary: `RFQ ${saved.number} rev ${saved.revision} issued`
        });
        return this.rfqView(saved);
      }
    });
  }

  /**
   * API-080 — records a technical/commercial evaluation. The sealed guard refuses any evaluation
   * while the RFQ is before CLOSED (422 BID_ACCESS_DENIED): nobody evaluates a bid that is still
   * sealed. A COMMERCIAL normalization that differs from the sealed total — compared by Postgres
   * numeric, never JS — requires an explicit override reason.
   */
  async createEvaluation(
    context: RequestContext, bidId: string, input: CreateEvaluationDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'bid.evaluate');
    return this.commands.execute({
      context, operation: 'API-080:create-evaluation', idempotencyKey,
      request: { bidId, input }, responseStatus: 201, resourceType: 'Evaluation',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Evaluation', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const loaded = await this.loadBid(manager, context, bidId, scope);
        const { bid, rfq } = loaded;
        if (!RFQ_BID_VISIBLE_STATUSES.includes(rfq.status)) {
          throw this.unprocessable(
            'BID_ACCESS_DENIED', 'Hồ sơ thầu còn niêm phong cho đến khi RFQ đóng thầu'
          );
        }
        if ([RfqStatus.AWARD_SUBMITTED, RfqStatus.AWARD_APPROVED, RfqStatus.REJECTED]
          .includes(rfq.status)) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'RFQ đã trình kết quả; không nhận thêm đánh giá'
          );
        }
        if (input.evaluationType === EvaluationType.COMMERCIAL && input.normalizedTotal) {
          const [comparison] = await manager.query<Array<{ matches: boolean }>>(
            `SELECT (total = $3::numeric AND currency = $4) AS "matches"
            FROM bids WHERE tenant_id = $1 AND id = $2`,
            [context.tenantId, bid.id, input.normalizedTotal, input.currency ?? bid.currency]
          );
          if (!comparison.matches && !input.overrideReason) {
            throw this.unprocessable(
              'EVALUATION_OVERRIDE_REASON_REQUIRED',
              'Giá trị chuẩn hóa khác giá dự thầu; cần lý do override'
            );
          }
        }
        const [next] = await manager.query<Array<{ next: number }>>(
          `SELECT (COALESCE(MAX(version), 0) + 1)::int AS "next" FROM evaluations
          WHERE tenant_id = $1 AND bid_id = $2 AND evaluation_type = $3 AND evaluator_id = $4`,
          [context.tenantId, bid.id, input.evaluationType, context.userId]
        );
        const row = manager.getRepository(EvaluationEntity).create({
          id: randomUUID(), tenantId: context.tenantId, bidId: bid.id,
          evaluationType: input.evaluationType, version: next.next,
          evaluatorId: context.userId,
          normalizedTotal: input.normalizedTotal ?? null,
          currency: input.normalizedTotal ? (input.currency ?? bid.currency) : null,
          normalizationBasis: input.normalizationBasis ?? null,
          overrideReason: input.overrideReason ?? null,
          notes: input.notes ?? null, createdBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(EvaluationEntity).save(row),
          {
            uq_evaluation_bid_type_version_evaluator: () => this.conflict(
              'EVALUATION_VERSION_CONFLICT',
              'Phiên bản đánh giá vừa được cấp bởi yêu cầu khác; hãy thử lại'
            )
          }
        );
        const saved = await manager.getRepository(EvaluationEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Evaluation', saved.id, saved.version,
          'Evaluation.Recorded', {
            projectId: rfq.projectId, rfqId: rfq.id, bidId: bid.id,
            evaluationType: saved.evaluationType, version: saved.version,
            summary: `${saved.evaluationType} evaluation v${saved.version} recorded`
          });
        return {
          ...this.evaluationView(saved),
          bid: this.bidView(bid, rfq.status)
        };
      }
    });
  }

  /**
   * API-081 — submits the award decision and moves the RFQ to AWARD_SUBMITTED. Segregation of
   * duties: whoever evaluated any bid of this RFQ cannot also submit its award
   * (422 AWARD_SOD_CONFLICT). The awarded bid must belong to this RFQ — checked here and again
   * structurally by `fk_rfq_awarded_bid (tenant, id, awarded_bid_id) → bids (tenant, rfq_id, id)`.
   */
  async submitAward(
    context: RequestContext, rfqId: string, input: SubmitAwardDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'award.submit');
    return this.commands.execute({
      context, operation: 'API-081:submit-award', idempotencyKey,
      request: { rfqId, input }, responseStatus: 200, resourceType: 'Rfq', resourceId: rfqId,
      execute: async (manager) => {
        const rfq = await this.lockRfq(manager, context, rfqId, scope);
        if (!([RfqStatus.CLOSED, RfqStatus.TECHNICAL_EVALUATION, RfqStatus.COMMERCIAL_EVALUATION]
          .includes(rfq.status))) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION',
            'Chỉ RFQ đã đóng thầu và đang/đã đánh giá mới được trình kết quả'
          );
        }
        const [sod] = await manager.query<Array<{ conflicted: boolean }>>(
          `SELECT EXISTS (
            SELECT 1 FROM evaluations evaluation
            JOIN bids bid ON bid.tenant_id = evaluation.tenant_id AND bid.id = evaluation.bid_id
            WHERE evaluation.tenant_id = $1 AND bid.rfq_id = $2 AND evaluation.evaluator_id = $3
          ) AS "conflicted"`,
          [context.tenantId, rfq.id, context.userId]
        );
        if (sod.conflicted) {
          throw this.unprocessable(
            'AWARD_SOD_CONFLICT', 'Người đánh giá hồ sơ thầu không được tự trình kết quả'
          );
        }
        const bidBelongs = await manager.getRepository(BidEntity).existsBy({
          id: input.awardedBidId, tenantId: context.tenantId, rfqId: rfq.id
        });
        if (!bidBelongs) {
          throw this.unprocessable('BID_NOT_FOUND', 'Hồ sơ thầu không thuộc RFQ này');
        }

        await this.withConstraintMap(
          () => manager.getRepository(RfqEntity).update(
            { id: rfq.id, tenantId: context.tenantId },
            {
              status: RfqStatus.AWARD_SUBMITTED, awardedBidId: input.awardedBidId,
              awardSubmittedBy: context.userId, awardSubmittedAt: new Date(),
              updatedBy: context.userId, versionNo: rfq.versionNo + 1
            }
          ),
          {
            fk_rfq_awarded_bid: () => this.unprocessable(
              'BID_NOT_FOUND', 'Hồ sơ thầu không thuộc RFQ này'
            )
          }
        );
        const updated = await manager.getRepository(RfqEntity)
          .findOneByOrFail({ id: rfq.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Rfq', updated.id, updated.versionNo,
          'Rfq.AwardSubmitted', {
            projectId: updated.projectId, awardedBidId: updated.awardedBidId,
            awardSubmittedBy: updated.awardSubmittedBy, reason: input.reason ?? null,
            summary: `RFQ ${updated.number} award submitted`
          });
        return this.rfqView(updated);
      }
    });
  }

  /**
   * API-082 — ONE transaction: the ISSUED purchase order, its lines and the PURCHASE_ORDER
   * commitment (idempotent on (source, version) via uq_commitment_source). The header/lines sum
   * identity is enforced by the deferred trigger, forced here with SET CONSTRAINTS ALL IMMEDIATE
   * so a wrong breakdown surfaces as PO_LINE_SUM_MISMATCH and nothing survives.
   */
  async createPurchaseOrder(
    context: RequestContext, projectId: string,
    input: CreatePurchaseOrderDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'purchaseOrder.issue');
    return this.commands.execute({
      context, operation: 'API-082:create-purchase-order', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'PurchaseOrder',
      resultReference: (result: { id: string }) => ({
        resourceType: 'PurchaseOrder', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        if (input.approvedBy === context.userId) {
          throw this.unprocessable(
            'PO_SOD_CONFLICT', 'Người phát hành PO không được tự phê duyệt chính nó'
          );
        }
        const approverExists = await manager.getRepository(UserAccountEntity).existsBy({
          id: input.approvedBy, tenantId: context.tenantId
        });
        if (!approverExists) {
          throw this.unprocessable('APPROVER_NOT_FOUND', 'Người phê duyệt không thuộc tenant này');
        }
        const supplierExists = await manager.getRepository(SupplierProfileEntity).existsBy({
          id: input.supplierProfileId, tenantId: context.tenantId
        });
        if (!supplierExists) {
          throw this.unprocessable('SUPPLIER_NOT_FOUND', 'Supplier profile không tồn tại');
        }
        if (input.awardedRfqId) {
          const rfqExists = await manager.getRepository(RfqEntity).existsBy({
            id: input.awardedRfqId, tenantId: context.tenantId, projectId
          });
          if (!rfqExists) {
            throw this.unprocessable('RFQ_NOT_FOUND', 'RFQ không thuộc dự án này');
          }
        }
        await this.assertActiveCostCode(manager, context, input.costCodeId);
        const requisitionIds = [...new Set(
          input.lines.flatMap((line) => line.requisitionId ? [line.requisitionId] : [])
        )];
        if (requisitionIds.length > 0) {
          const found = await manager.getRepository(RequisitionEntity).countBy({
            id: In(requisitionIds), tenantId: context.tenantId, projectId
          });
          if (found !== requisitionIds.length) {
            throw this.unprocessable('REQUISITION_NOT_FOUND', 'Requisition không thuộc dự án này');
          }
        }

        const purchaseOrderId = randomUUID();
        const issuedAt = new Date();
        await this.withConstraintMap(
          () => manager.getRepository(PurchaseOrderEntity).insert({
            id: purchaseOrderId, tenantId: context.tenantId, projectId,
            supplierProfileId: input.supplierProfileId,
            awardedRfqId: input.awardedRfqId ?? null,
            poNo: input.poNo, revision: input.revision ?? 1, title: input.title,
            status: PurchaseOrderStatus.ISSUED, totalValue: input.totalValue,
            currency: input.currency, issuedAt, approvedBy: input.approvedBy,
            createdBy: context.userId, updatedBy: context.userId
          }),
          {
            uq_purchase_order_number_revision: () => this.conflict(
              'PO_NUMBER_CONFLICT', 'Số PO và revision đã tồn tại trong dự án'
            ),
            uq_purchase_order_open_revision: () => this.conflict(
              'PO_OPEN_REVISION_CONFLICT', 'Số PO này đang có một revision còn hiệu lực'
            ),
            ck_purchase_order_sod: () => this.unprocessable(
              'PO_SOD_CONFLICT', 'Người phát hành PO không được tự phê duyệt chính nó'
            )
          }
        );

        const lines = manager.getRepository(PurchaseOrderLineEntity);
        for (const line of input.lines) {
          await this.withConstraintMap(
            () => lines.insert({
              id: randomUUID(), tenantId: context.tenantId, purchaseOrderId,
              lineNo: line.lineNo, description: line.description, quantity: line.quantity,
              uom: line.uom, unitPrice: line.unitPrice, currency: input.currency,
              requisitionId: line.requisitionId ?? null, bomLineId: line.bomLineId ?? null,
              createdBy: context.userId
            }),
            {
              uq_purchase_order_line_number: () => this.conflict(
                'PO_LINE_NUMBER_CONFLICT', 'Trùng số dòng trong purchase order'
              )
            }
          );
        }

        // The commitment travels with the order: same transaction, same rollback. The unique
        // (source_type, source_id, source_version) makes replaying this PO revision a conflict
        // instead of a double-counted exposure.
        await this.withConstraintMap(
          () => manager.getRepository(CommitmentEntity).insert({
            id: randomUUID(), tenantId: context.tenantId, projectId,
            contractId: null, purchaseOrderId, costCodeId: input.costCodeId,
            amount: input.totalValue, currency: input.currency,
            status: CommitmentStatus.ACTIVE, sourceType: CommitmentSourceType.PURCHASE_ORDER,
            sourceId: purchaseOrderId, sourceVersion: input.revision ?? 1,
            reversesCommitmentId: null, createdBy: context.userId
          }),
          {
            uq_commitment_source: () => this.conflict(
              'COMMITMENT_SOURCE_CONFLICT',
              'Nguồn này ở đúng phiên bản này đã được ghi nhận commitment'
            ),
            ck_commitment_amount_sign: () => this.unprocessable(
              'PO_TOTAL_INVALID', 'Giá trị PO phải lớn hơn 0 để ghi nhận commitment'
            )
          }
        );

        // Force the deferred sum trigger now so a wrong breakdown is a domain error, not a
        // COMMIT-time surprise — and the rollback removes order, lines and commitment together.
        await this.withConstraintMap(
          () => manager.query('SET CONSTRAINTS ALL IMMEDIATE'),
          {
            ck_purchase_order_line_sum: () => this.unprocessable(
              'PO_LINE_SUM_MISMATCH',
              'Tổng các dòng phải đúng bằng tổng giá trị của purchase order'
            )
          }
        );

        const saved = await manager.getRepository(PurchaseOrderEntity)
          .findOneByOrFail({ id: purchaseOrderId, tenantId: context.tenantId });
        const savedLines = await lines.find({
          where: { tenantId: context.tenantId, purchaseOrderId },
          order: { lineNo: 'ASC' }
        });
        const commitment = await manager.getRepository(CommitmentEntity).findOneByOrFail({
          tenantId: context.tenantId, sourceType: CommitmentSourceType.PURCHASE_ORDER,
          sourceId: purchaseOrderId, sourceVersion: saved.revision
        });
        await this.emit(manager, context, 'PurchaseOrder', saved.id, saved.versionNo,
          'PurchaseOrder.Issued', {
            projectId, poNo: saved.poNo, revision: saved.revision,
            supplierProfileId: saved.supplierProfileId, totalValue: saved.totalValue,
            currency: saved.currency, lineCount: savedLines.length,
            commitmentId: commitment.id,
            summary: `Purchase order ${saved.poNo} rev ${saved.revision} issued`
          });
        return {
          ...this.purchaseOrderView(saved),
          lines: savedLines.map((row) => this.purchaseOrderLineView(row)),
          commitmentId: commitment.id
        };
      }
    });
  }

  /** API-083 — plans a shipment against an open purchase order; committed_date freezes at insert. */
  async createShipment(
    context: RequestContext, purchaseOrderId: string,
    input: CreateShipmentDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'shipment.create');
    return this.commands.execute({
      context, operation: 'API-083:create-shipment', idempotencyKey,
      request: { purchaseOrderId, input }, responseStatus: 201, resourceType: 'Shipment',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Shipment', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const order = await this.loadPurchaseOrder(manager, context, purchaseOrderId, scope);
        this.assertPurchaseOrderOpen(order);
        const row = manager.getRepository(ShipmentEntity).create({
          id: randomUUID(), tenantId: context.tenantId, purchaseOrderId: order.id,
          committedDate: input.committedDate, etd: input.etd ?? null, eta: input.eta ?? null,
          actualDeliveryDate: null, carrier: input.carrier ?? null,
          trackingNo: input.trackingNo ?? null, status: ShipmentStatus.PLANNED,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await manager.getRepository(ShipmentEntity).save(row);
        await this.emit(manager, context, 'Shipment', saved.id, saved.versionNo,
          'Shipment.Created', {
            projectId: order.projectId, purchaseOrderId: order.id,
            committedDate: saved.committedDate, carrier: saved.carrier,
            summary: `Shipment planned for PO ${order.poNo}`
          });
        return this.shipmentView(saved);
      }
    });
  }

  /**
   * API-084 — appends to the immutable milestone stream (201) and advances the derived shipment
   * status monotonically. Out-of-order reports are refused (422 MILESTONE_OUT_OF_ORDER); replays
   * of the same (type, event time, source) conflict on the dedup key.
   */
  async createShipmentMilestone(
    context: RequestContext, shipmentId: string,
    input: CreateShipmentMilestoneDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'shipment.updateMilestone');
    return this.commands.execute({
      context, operation: 'API-084:create-shipment-milestone', idempotencyKey,
      request: { shipmentId, input }, responseStatus: 201, resourceType: 'ShipmentMilestone',
      resultReference: (result: { id: string }) => ({
        resourceType: 'ShipmentMilestone', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const { shipment, order } = await this.lockShipment(manager, context, shipmentId, scope);
        if (shipment.status === ShipmentStatus.CLOSED) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Shipment đã CLOSED không nhận thêm milestone'
          );
        }
        const milestones = manager.getRepository(ShipmentMilestoneEntity);
        const existing = await milestones.find({
          where: { tenantId: context.tenantId, shipmentId: shipment.id },
          order: { eventTime: 'ASC', createdAt: 'ASC' }
        });
        const next = {
          milestoneType: input.milestoneType, eventTime: new Date(input.eventTime)
        };
        if (assessMilestoneOrder(existing, next) === 'OUT_OF_ORDER') {
          throw this.unprocessable(
            'MILESTONE_OUT_OF_ORDER',
            'Milestone không đúng trình tự vận chuyển đã ghi nhận'
          );
        }
        const row = milestones.create({
          id: randomUUID(), tenantId: context.tenantId, shipmentId: shipment.id,
          milestoneType: input.milestoneType, eventTime: next.eventTime,
          source: input.source, notes: input.notes ?? null, createdBy: context.userId
        });
        await this.withConstraintMap(
          () => milestones.insert(row),
          {
            uq_shipment_milestone_replay: () => this.conflict(
              'MILESTONE_DUPLICATE', 'Milestone này đã được ghi nhận (cùng loại, thời điểm, nguồn)'
            )
          }
        );

        const derived = deriveShipmentStatus([...existing, next]);
        const statusChanged = derived !== shipment.status;
        const etaChanged = input.eta !== undefined && input.eta !== shipment.eta;
        if (statusChanged || etaChanged) {
          await manager.getRepository(ShipmentEntity).update(
            { id: shipment.id, tenantId: context.tenantId },
            {
              status: derived,
              eta: input.eta ?? shipment.eta,
              actualDeliveryDate: derived === ShipmentStatus.DELIVERED
                ? next.eventTime.toISOString().slice(0, 10)
                : shipment.actualDeliveryDate,
              updatedBy: context.userId, versionNo: shipment.versionNo + 1
            }
          );
        }
        const savedMilestone = await milestones.findOneByOrFail({
          id: row.id, tenantId: context.tenantId
        });
        const savedShipment = await manager.getRepository(ShipmentEntity)
          .findOneByOrFail({ id: shipment.id, tenantId: context.tenantId });
        // The milestone is its own event aggregate, not the shipment's. `uq_outbox_aggregate_event`
        // is unique on (tenant, aggregate_type, aggregate_id, aggregate_version, event_type), and a
        // milestone that does not move the shipment's status leaves its version unchanged — two such
        // appends would collide. An append-only child is the truthful aggregate for its own event.
        await this.emit(manager, context, 'ShipmentMilestone', savedMilestone.id, 1,
          'Shipment.MilestoneRecorded', {
            shipmentId: shipment.id, shipmentVersionNo: savedShipment.versionNo,
            projectId: order.projectId, purchaseOrderId: order.id,
            milestoneType: savedMilestone.milestoneType,
            eventTime: savedMilestone.eventTime.toISOString(),
            source: savedMilestone.source, derivedStatus: savedShipment.status,
            summary: `Shipment milestone ${savedMilestone.milestoneType} recorded`
          });
        return {
          ...this.milestoneView(savedMilestone),
          shipment: this.shipmentView(savedShipment)
        };
      }
    });
  }

  /**
   * API-085 — ONE transaction: the receipt, its inventory ledger rows and the captured serials.
   * The PO line is locked FOR UPDATE and over-receipt (accepted-so-far + incoming > ordered,
   * decided by Postgres numeric) refuses the whole write. A condition other than GOOD quarantines
   * the receipt and adds a QUARANTINE_IN ledger row. Duplicate serials → 409 SERIAL_CONFLICT.
   */
  async createGoodsReceipt(
    context: RequestContext, purchaseOrderId: string,
    input: CreateGoodsReceiptDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'goodsReceipt.create');
    return this.commands.execute({
      context, operation: 'API-085:create-goods-receipt', idempotencyKey,
      request: { purchaseOrderId, input }, responseStatus: 201, resourceType: 'GoodsReceipt',
      resultReference: (result: { id: string }) => ({
        resourceType: 'GoodsReceipt', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const order = await this.loadPurchaseOrderForReceipt(
          manager, context, purchaseOrderId, scope
        );
        this.assertPurchaseOrderOpen(order);
        const line = await manager.getRepository(PurchaseOrderLineEntity)
          .createQueryBuilder('line')
          .setLock('pessimistic_write')
          .where(
            'line.id = :id AND line.tenantId = :tenantId AND line.purchaseOrderId = :orderId',
            { id: input.purchaseOrderLineId, tenantId: context.tenantId, orderId: order.id }
          )
          .getOne();
        if (!line) {
          throw this.unprocessable('PO_LINE_NOT_FOUND', 'Dòng PO không thuộc purchase order này');
        }
        const siteExists = await manager.getRepository(SiteEntity).existsBy({
          id: input.siteId, tenantId: context.tenantId, projectId: order.projectId
        });
        if (!siteExists) {
          throw this.unprocessable('SITE_NOT_FOUND', 'Site không thuộc dự án của purchase order');
        }
        if (input.shipmentId) {
          const shipmentExists = await manager.getRepository(ShipmentEntity).existsBy({
            id: input.shipmentId, tenantId: context.tenantId, purchaseOrderId: order.id
          });
          if (!shipmentExists) {
            throw this.unprocessable('SHIPMENT_NOT_FOUND', 'Shipment không thuộc purchase order này');
          }
        }
        // Over-receipt: everything not REJECTED counts against the ordered quantity — including
        // quarantined stock, which physically arrived. Postgres numeric decides, not JS.
        const [overReceipt] = await manager.query<Array<{ over: boolean }>>(
          `SELECT (COALESCE((
            SELECT SUM(receipt.quantity) FROM goods_receipts receipt
            WHERE receipt.tenant_id = $1 AND receipt.purchase_order_line_id = $2
              AND receipt.status <> 'REJECTED'
          ), 0) + $3::numeric) > line.quantity AS "over"
          FROM purchase_order_lines line WHERE line.tenant_id = $1 AND line.id = $2`,
          [context.tenantId, line.id, input.quantity]
        );
        if (overReceipt.over) {
          throw this.unprocessable(
            'OVER_RECEIPT', 'Tổng lượng đã nhận vượt quá số lượng đặt của dòng PO'
          );
        }

        const receiptId = randomUUID();
        const quarantined = input.condition !== GoodsReceiptCondition.GOOD;
        await this.withConstraintMap(
          () => manager.getRepository(GoodsReceiptEntity).insert({
            id: receiptId, tenantId: context.tenantId, projectId: order.projectId,
            purchaseOrderId: order.id, purchaseOrderLineId: line.id,
            shipmentId: input.shipmentId ?? null, siteId: input.siteId,
            receiptNo: input.receiptNo, quantity: input.quantity,
            condition: input.condition,
            status: quarantined ? GoodsReceiptStatus.QUARANTINED : GoodsReceiptStatus.ACCEPTED,
            notes: input.notes ?? null,
            createdBy: context.userId, updatedBy: context.userId
          }),
          {
            uq_goods_receipt_site_number: () => this.conflict(
              'RECEIPT_NUMBER_CONFLICT', 'Số phiếu nhận đã tồn tại tại site này'
            ),
            fk_goods_receipt_site: () => this.unprocessable(
              'SITE_NOT_FOUND', 'Site không thuộc dự án của purchase order'
            ),
            fk_goods_receipt_shipment: () => this.unprocessable(
              'SHIPMENT_NOT_FOUND', 'Shipment không thuộc purchase order này'
            )
          }
        );

        const inventory = manager.getRepository(InventoryTransactionEntity);
        const ledger: Array<{ type: InventoryTransactionType; key: string }> = [
          { type: InventoryTransactionType.RECEIPT, key: `GR:${receiptId}:RECEIPT` }
        ];
        if (quarantined) {
          ledger.push({
            type: InventoryTransactionType.QUARANTINE_IN, key: `GR:${receiptId}:QUARANTINE_IN`
          });
        }
        for (const entry of ledger) {
          await this.withConstraintMap(
            () => inventory.insert({
              id: randomUUID(), tenantId: context.tenantId, projectId: order.projectId,
              siteId: input.siteId, purchaseOrderLineId: line.id, goodsReceiptId: receiptId,
              transactionType: entry.type, quantity: input.quantity, uom: line.uom,
              sourceKey: entry.key, createdBy: context.userId
            }),
            {
              uq_inventory_transaction_source: () => this.conflict(
                'INVENTORY_SOURCE_CONFLICT', 'Giao dịch kho cho nguồn này đã được ghi nhận'
              )
            }
          );
        }

        const serialRepository = manager.getRepository(SerialNumberEntity);
        for (const serial of input.serials ?? []) {
          const normalized = normalizeSerial(serial.serialNo);
          if (normalized.length === 0) {
            throw this.unprocessable('SERIAL_INVALID', 'Serial không được rỗng sau khi chuẩn hóa');
          }
          await this.withConstraintMap(
            () => serialRepository.insert({
              id: randomUUID(), tenantId: context.tenantId, goodsReceiptId: receiptId,
              equipmentModelId: serial.equipmentModelId, serialNo: serial.serialNo,
              normalizedSerial: normalized, createdBy: context.userId
            }),
            {
              uq_serial_number_scope: () => this.conflict(
                'SERIAL_CONFLICT', 'Serial này đã tồn tại cho model thiết bị này'
              ),
              fk_serial_number_equipment_model: () => this.unprocessable(
                'EQUIPMENT_MODEL_NOT_FOUND', 'Model thiết bị không tồn tại trong tenant này'
              )
            }
          );
        }

        const saved = await manager.getRepository(GoodsReceiptEntity)
          .findOneByOrFail({ id: receiptId, tenantId: context.tenantId });
        const transactions = await inventory.find({
          where: { tenantId: context.tenantId, goodsReceiptId: receiptId },
          order: { sourceKey: 'ASC' }
        });
        const serials = await serialRepository.find({
          where: { tenantId: context.tenantId, goodsReceiptId: receiptId },
          order: { normalizedSerial: 'ASC' }
        });
        await this.emit(manager, context, 'GoodsReceipt', saved.id, saved.versionNo,
          'GoodsReceipt.Recorded', {
            projectId: order.projectId, purchaseOrderId: order.id,
            purchaseOrderLineId: line.id, receiptNo: saved.receiptNo,
            quantity: saved.quantity, condition: saved.condition, status: saved.status,
            serialCount: serials.length,
            summary: `Goods receipt ${saved.receiptNo} recorded (${saved.status})`
          });
        return {
          ...this.goodsReceiptView(saved),
          inventoryTransactions: transactions.map((row) => this.inventoryView(row)),
          serials: serials.map((row) => this.serialView(row))
        };
      }
    });
  }

  /**
   * INTERNAL — NOT wired to any route. API-079 (supplier bid submission) is deferred because no
   * external supplier identity exists; this is the fixture path tests use so evaluations and
   * awards stay exercisable. It writes a SEALED bid with no permission model of its own.
   */
  async registerSealedBid(
    context: RequestContext, input: RegisterSealedBidInput
  ): Promise<{ id: string }> {
    const manager = this.purchaseOrders.manager;
    const rfq = await manager.getRepository(RfqEntity).findOneBy({
      id: input.rfqId, tenantId: context.tenantId
    });
    if (!rfq) throw this.notFound('RFQ_NOT_FOUND', 'Không tìm thấy RFQ');
    const id = randomUUID();
    const row = manager.getRepository(BidEntity).create({
      id, tenantId: context.tenantId, rfqId: rfq.id,
      supplierProfileId: input.supplierProfileId, revision: input.revision ?? 1,
      sealedStatus: BidSealedStatus.SEALED, total: input.total, currency: input.currency,
      payloadRef: input.payloadRef ?? null, submittedAt: new Date(),
      createdBy: context.userId
    });
    await this.withConstraintMap(
      () => manager.getRepository(BidEntity).save(row),
      {
        uq_bid_rfq_supplier_revision: () => this.conflict(
          'BID_REVISION_CONFLICT', 'Supplier này đã nộp revision này cho RFQ'
        ),
        fk_bid_supplier_profile: () => this.unprocessable(
          'SUPPLIER_NOT_FOUND', 'Supplier profile không tồn tại'
        )
      }
    );
    return { id };
  }

  private async lockRequisition(
    manager: EntityManager, context: RequestContext, requisitionId: string, scope: AccessScopeSets
  ): Promise<RequisitionEntity> {
    const requisition = await manager.getRepository(RequisitionEntity)
      .createQueryBuilder('requisition')
      .setLock('pessimistic_write')
      .where('requisition.id = :id AND requisition.tenantId = :tenantId', {
        id: requisitionId, tenantId: context.tenantId
      })
      .getOne();
    if (!requisition || !this.inScope(requisition.projectId, scope)) {
      throw this.notFound('REQUISITION_NOT_FOUND', 'Không tìm thấy requisition');
    }
    return requisition;
  }

  private async lockRfq(
    manager: EntityManager, context: RequestContext, rfqId: string, scope: AccessScopeSets
  ): Promise<RfqEntity> {
    const rfq = await manager.getRepository(RfqEntity)
      .createQueryBuilder('rfq')
      .setLock('pessimistic_write')
      .where('rfq.id = :id AND rfq.tenantId = :tenantId', {
        id: rfqId, tenantId: context.tenantId
      })
      .getOne();
    if (!rfq || !this.inScope(rfq.projectId, scope)) {
      throw this.notFound('RFQ_NOT_FOUND', 'Không tìm thấy RFQ');
    }
    return rfq;
  }

  /** Bid reachability rides the owning RFQ's project; out of scope answers as missing. */
  private async loadBid(
    manager: EntityManager, context: RequestContext, bidId: string, scope: AccessScopeSets
  ): Promise<{ bid: BidEntity; rfq: RfqEntity }> {
    const bid = await manager.getRepository(BidEntity).findOneBy({
      id: bidId, tenantId: context.tenantId
    });
    const rfq = bid === null ? null : await manager.getRepository(RfqEntity).findOneBy({
      id: bid.rfqId, tenantId: context.tenantId
    });
    if (!bid || !rfq || !this.inScope(rfq.projectId, scope)) {
      throw this.notFound('BID_NOT_FOUND', 'Không tìm thấy hồ sơ thầu');
    }
    return { bid, rfq };
  }

  private async loadPurchaseOrder(
    manager: EntityManager, context: RequestContext, purchaseOrderId: string,
    scope: AccessScopeSets
  ): Promise<PurchaseOrderEntity> {
    const order = await manager.getRepository(PurchaseOrderEntity).findOneBy({
      id: purchaseOrderId, tenantId: context.tenantId
    });
    if (!order || !this.inScope(order.projectId, scope)) {
      throw this.notFound('PURCHASE_ORDER_NOT_FOUND', 'Không tìm thấy purchase order');
    }
    return order;
  }

  /**
   * Goods receipts additionally admit package-scoped principals (PACKAGE_OWNER holds
   * goodsReceipt.create): a package assignment grants reach when the package belongs to the PO's
   * project — the data scope of API-085 is PO/site/package. Everything else in this module keeps
   * the stricter project-only reach.
   */
  private async loadPurchaseOrderForReceipt(
    manager: EntityManager, context: RequestContext, purchaseOrderId: string,
    scope: AccessScopeSets
  ): Promise<PurchaseOrderEntity> {
    const order = await manager.getRepository(PurchaseOrderEntity).findOneBy({
      id: purchaseOrderId, tenantId: context.tenantId
    });
    if (order && this.inScope(order.projectId, scope)) return order;
    if (order && scope.packageIds.length > 0) {
      const packageInProject = await manager.getRepository(PackageEntity).existsBy({
        id: In(scope.packageIds), tenantId: context.tenantId, projectId: order.projectId,
        status: PackageStatus.ACTIVE
      });
      if (packageInProject) return order;
    }
    throw this.notFound('PURCHASE_ORDER_NOT_FOUND', 'Không tìm thấy purchase order');
  }

  private async lockShipment(
    manager: EntityManager, context: RequestContext, shipmentId: string, scope: AccessScopeSets
  ): Promise<{ shipment: ShipmentEntity; order: PurchaseOrderEntity }> {
    const shipment = await manager.getRepository(ShipmentEntity)
      .createQueryBuilder('shipment')
      .setLock('pessimistic_write')
      .where('shipment.id = :id AND shipment.tenantId = :tenantId', {
        id: shipmentId, tenantId: context.tenantId
      })
      .getOne();
    const order = shipment === null
      ? null
      : await manager.getRepository(PurchaseOrderEntity).findOneBy({
        id: shipment.purchaseOrderId, tenantId: context.tenantId
      });
    if (!shipment || !order || !this.inScope(order.projectId, scope)) {
      throw this.notFound('SHIPMENT_NOT_FOUND', 'Không tìm thấy shipment');
    }
    return { shipment, order };
  }

  private async assertProjectVisible(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets
  ): Promise<void> {
    const exists = await manager.getRepository(ProjectEntity).existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!exists || !this.inScope(projectId, scope)) {
      throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    }
  }

  private inScope(projectId: string, scope: AccessScopeSets): boolean {
    return scope.tenantWide || scope.projectIds.includes(projectId);
  }

  private assertPurchaseOrderOpen(order: PurchaseOrderEntity): void {
    if (![PurchaseOrderStatus.ISSUED, PurchaseOrderStatus.ACKNOWLEDGED, PurchaseOrderStatus.AMENDED]
      .includes(order.status)) {
      throw this.unprocessable(
        'INVALID_STATE_TRANSITION', 'Purchase order không ở trạng thái nhận hàng/vận chuyển'
      );
    }
  }

  private async assertActiveCostCode(
    manager: EntityManager, context: RequestContext, costCodeId: string
  ): Promise<void> {
    const costCode = await manager.getRepository(CostCodeEntity).findOneBy({
      id: costCodeId, tenantId: context.tenantId
    });
    if (!costCode || costCode.status !== CostCodeStatus.ACTIVE) {
      throw this.unprocessable('COST_CODE_NOT_FOUND', 'Cost code không tồn tại hoặc không ACTIVE');
    }
  }

  /**
   * Keyset predicate compared row-wise against the cursor row's stored values.
   *
   * The obvious form — `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)`
   * — silently drops rows. Postgres stores `timestamptz` at microsecond precision but a JS `Date`
   * (and therefore the encoded cursor) only carries milliseconds, so a row whose timestamp has
   * sub-millisecond digits satisfies neither branch and vanishes from the next page. Reading the
   * boundary back from the table compares the real stored values, and `(created_at, id) < (…)` is a
   * row-wise comparison the `(created_at DESC, id DESC)` index can still drive.
   *
   * If the cursor row is gone (deleted or moved out of scope) the millisecond comparison is used as
   * a fallback: a slightly conservative page beats an error on a stale cursor.
   */
  private applyCursor<T extends { createdAt: Date; id: string }>(
    builder: SelectQueryBuilder<T>, alias: string, cursor: { createdAt: string; id: string },
    table: string, tenantId: string
  ): void {
    builder.andWhere(new Brackets((where) => where
      .where(
        `(${alias}.createdAt, ${alias}.id) < (
           SELECT boundary.created_at, boundary.id FROM ${table} boundary
           WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
         )`,
        { cursorId: cursor.id, cursorTenantId: tenantId }
      )
      .orWhere(new Brackets((fallback) => fallback
        .where(`NOT EXISTS (SELECT 1 FROM ${table} missing WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId)`)
        .andWhere(new Brackets((legacy) => legacy
          .where(`${alias}.createdAt < :cursorTime`, { cursorTime: cursor.createdAt })
          .orWhere(`${alias}.createdAt = :cursorTime AND ${alias}.id < :cursorId`, {
            cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: tenantId
          }))))))); 
  }

  private pageMeta<T extends { createdAt: Date; id: string }>(
    rows: T[], page: T[], limit: number
  ) {
    const last = page.at(-1);
    return {
      limit,
      nextCursor: rows.length > limit && last
        ? encodeProcurementCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    };
  }

  private supplierView(row: SupplierProfileEntity) {
    return {
      id: row.id, companyId: row.companyId, legalEntityId: row.legalEntityId,
      category: row.category, qualificationStatus: row.qualificationStatus,
      validFrom: row.validFrom, validTo: row.validTo, versionNo: row.versionNo,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private requisitionView(row: RequisitionEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId, wbsId: row.wbsId,
      costCodeId: row.costCodeId, number: row.number, title: row.title,
      description: row.description, needByDate: row.needByDate, status: row.status,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private rfqView(row: RfqEntity) {
    return {
      id: row.id, requisitionId: row.requisitionId, projectId: row.projectId,
      number: row.number, revision: row.revision, dueDate: row.dueDate.toISOString(),
      invitedSupplierIds: row.invitedSupplierIds, status: row.status,
      awardedBidId: row.awardedBidId, awardSubmittedBy: row.awardSubmittedBy,
      awardSubmittedAt: row.awardSubmittedAt === null
        ? null : row.awardSubmittedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  /**
   * The sealed-bid serialization ACL: before the RFQ reaches CLOSED, the commercial fields are
   * NOT serialized at all — the keys are absent, not null, so nothing downstream can even see
   * that a value exists.
   */
  private bidView(row: BidEntity, rfqStatus: RfqStatus) {
    const base = {
      id: row.id, rfqId: row.rfqId, supplierProfileId: row.supplierProfileId,
      revision: row.revision, sealedStatus: row.sealedStatus,
      submittedAt: row.submittedAt.toISOString(), createdAt: row.createdAt.toISOString()
    };
    if (!RFQ_BID_VISIBLE_STATUSES.includes(rfqStatus)) return base;
    return {
      ...base, total: row.total, currency: row.currency, payloadRef: row.payloadRef
    };
  }

  private evaluationView(row: EvaluationEntity) {
    return {
      id: row.id, bidId: row.bidId, evaluationType: row.evaluationType, version: row.version,
      evaluatorId: row.evaluatorId, normalizedTotal: row.normalizedTotal,
      currency: row.currency, normalizationBasis: row.normalizationBasis,
      overrideReason: row.overrideReason, notes: row.notes,
      createdBy: row.createdBy, createdAt: row.createdAt.toISOString()
    };
  }

  private purchaseOrderView(row: PurchaseOrderEntity) {
    return {
      id: row.id, projectId: row.projectId, supplierProfileId: row.supplierProfileId,
      awardedRfqId: row.awardedRfqId, poNo: row.poNo, revision: row.revision,
      title: row.title, status: row.status, totalValue: row.totalValue,
      currency: row.currency,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      approvedBy: row.approvedBy, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private purchaseOrderLineView(row: PurchaseOrderLineEntity) {
    return {
      id: row.id, purchaseOrderId: row.purchaseOrderId, lineNo: row.lineNo,
      description: row.description, quantity: row.quantity, uom: row.uom,
      unitPrice: row.unitPrice, currency: row.currency, requisitionId: row.requisitionId,
      bomLineId: row.bomLineId, createdAt: row.createdAt.toISOString()
    };
  }

  private shipmentView(row: ShipmentEntity) {
    return {
      id: row.id, purchaseOrderId: row.purchaseOrderId, committedDate: row.committedDate,
      etd: row.etd, eta: row.eta, actualDeliveryDate: row.actualDeliveryDate,
      carrier: row.carrier, trackingNo: row.trackingNo, status: row.status,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private milestoneView(row: ShipmentMilestoneEntity) {
    return {
      id: row.id, shipmentId: row.shipmentId, milestoneType: row.milestoneType,
      eventTime: row.eventTime.toISOString(), source: row.source, notes: row.notes,
      createdBy: row.createdBy, createdAt: row.createdAt.toISOString()
    };
  }

  private goodsReceiptView(row: GoodsReceiptEntity) {
    return {
      id: row.id, projectId: row.projectId, purchaseOrderId: row.purchaseOrderId,
      purchaseOrderLineId: row.purchaseOrderLineId, shipmentId: row.shipmentId,
      siteId: row.siteId, receiptNo: row.receiptNo, quantity: row.quantity,
      condition: row.condition, status: row.status, notes: row.notes,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private inventoryView(row: InventoryTransactionEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId,
      purchaseOrderLineId: row.purchaseOrderLineId, goodsReceiptId: row.goodsReceiptId,
      transactionType: row.transactionType, quantity: row.quantity, uom: row.uom,
      sourceKey: row.sourceKey, createdAt: row.createdAt.toISOString()
    };
  }

  private serialView(row: SerialNumberEntity) {
    return {
      id: row.id, goodsReceiptId: row.goodsReceiptId, equipmentModelId: row.equipmentModelId,
      serialNo: row.serialNo, normalizedSerial: row.normalizedSerial,
      createdAt: row.createdAt.toISOString()
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId };
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: eventType, result: 'SUCCEEDED', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: aggregateType, objectId: aggregateId, payload: safePayload
    });
    await this.outbox.append(manager, context, {
      aggregateType, aggregateId, aggregateVersion, eventType,
      eventKey: createHash('sha256')
        .update(`${aggregateType}:${aggregateId}:${aggregateVersion}:${eventType}`)
        .digest('hex'),
      payload: safePayload
    });
  }

  /**
   * Maps a named database constraint violation (unique, check or foreign key) to its domain error.
   * The constraint stays the enforcement; this only translates its failure for the wire.
   */
  private async withConstraintMap<T>(
    action: () => Promise<T>, map: Record<string, () => HttpException>
  ): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as {
        code?: string; constraint?: string;
        driverError?: { code?: string; constraint?: string };
      };
      const code = candidate.code ?? candidate.driverError?.code;
      const constraint = candidate.constraint ?? candidate.driverError?.constraint;
      if (
        constraint !== undefined
        && (code === '23505' || code === '23514' || code === '23503')
        && map[constraint] !== undefined
      ) {
        throw map[constraint]();
      }
      throw cause;
    }
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message, retryable: false });
  }

  private unprocessable(code: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, message, retryable: false });
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message, retryable: false });
  }
}
