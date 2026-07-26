import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { ProcurementLogisticsService } from './procurement-logistics.service';
import {
  CreateEvaluationDto, CreateGoodsReceiptDto, CreatePurchaseOrderDto, CreateRequisitionDto,
  CreateRfqDto, CreateShipmentDto, CreateShipmentMilestoneDto, SubmitAwardDto,
  SupplierListQueryDto
} from './dto/procurement-logistics.dto';

/**
 * Procurement & Logistics (API-076…API-085; API-079 deferred — deliberately NO route here, not a
 * stub). Project routes get the guard's project pre-filter; the object routes (requisition, bid,
 * RFQ, PO, shipment) resolve their real project ABAC inside the service from the row that owns
 * the record — out of scope answers 404, never 403. Every command requires an Idempotency-Key of
 * 8–200 characters, and every committed write answers 200/201, never 202.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class ProcurementLogisticsController {
  constructor(private readonly service: ProcurementLogisticsService) {}

  @Get('suppliers')
  @RequirePermission('supplier.read')
  async listSuppliers(
    @Req() request: ContextRequest,
    @Query() query: SupplierListQueryDto
  ) {
    return this.collection(
      await this.service.listSuppliers(this.context(request), query), request
    );
  }

  @Post('projects/:projectId/requisitions')
  @RequirePermission('requisition.create', 'PROJECT')
  async createRequisition(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateRequisitionDto
  ) {
    return this.resource(await this.service.createRequisition(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('requisitions/:requisitionId/rfqs')
  @RequirePermission('rfq.issue')
  async createRfq(
    @Req() request: ContextRequest,
    @Param('requisitionId', new ParseUUIDPipe()) requisitionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateRfqDto
  ) {
    return this.resource(await this.service.createRfq(
      this.context(request), requisitionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('bids/:bidId/evaluations')
  @RequirePermission('bid.evaluate')
  async createEvaluation(
    @Req() request: ContextRequest,
    @Param('bidId', new ParseUUIDPipe()) bidId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateEvaluationDto
  ) {
    return this.resource(await this.service.createEvaluation(
      this.context(request), bidId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('rfqs/:rfqId\\:submit-award')
  @HttpCode(200)
  @RequirePermission('award.submit')
  async submitAward(
    @Req() request: ContextRequest,
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SubmitAwardDto
  ) {
    return this.resource(await this.service.submitAward(
      this.context(request), rfqId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/purchase-orders')
  @RequirePermission('purchaseOrder.issue', 'PROJECT')
  async createPurchaseOrder(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreatePurchaseOrderDto
  ) {
    return this.resource(await this.service.createPurchaseOrder(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('purchase-orders/:purchaseOrderId/shipments')
  @RequirePermission('shipment.create')
  async createShipment(
    @Req() request: ContextRequest,
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateShipmentDto
  ) {
    return this.resource(await this.service.createShipment(
      this.context(request), purchaseOrderId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('shipments/:shipmentId/milestones')
  @RequirePermission('shipment.updateMilestone')
  async createShipmentMilestone(
    @Req() request: ContextRequest,
    @Param('shipmentId', new ParseUUIDPipe()) shipmentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateShipmentMilestoneDto
  ) {
    return this.resource(await this.service.createShipmentMilestone(
      this.context(request), shipmentId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('purchase-orders/:purchaseOrderId/goods-receipts')
  @RequirePermission('goodsReceipt.create')
  async createGoodsReceipt(
    @Req() request: ContextRequest,
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateGoodsReceiptDto
  ) {
    return this.resource(await this.service.createGoodsReceipt(
      this.context(request), purchaseOrderId, input, this.idempotencyKey(key)
    ), request);
  }

  private context(request: ContextRequest) {
    return { ...request.auth!, correlationId: request.correlationId };
  }

  private resource<T>(data: T, request: ContextRequest) {
    return { data, correlationId: request.correlationId };
  }

  private collection<T>(
    result: { items: T[]; meta: { nextCursor: string | null; limit: number } },
    request: ContextRequest
  ) {
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  private idempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key phải có từ 8 đến 200 ký tự', retryable: false
      });
    }
    return key;
  }
}
