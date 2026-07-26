import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { AlarmIncidentService } from './alarm-incident.service';
import { WorkOrderService } from './work-order.service';
import {
  AcknowledgeAlarmCaseDto, AlarmCaseListQueryDto, CreateServiceIncidentDto, CreateWorkOrderDto,
  ServiceIncidentListQueryDto, WorkOrderCommandDto, WorkOrderListQueryDto
} from './dto/operations-maintenance.dto';

/**
 * O&M (API-114…API-121).
 *
 * Every route here is site- or asset-scoped, and `role_assignments` has no SITE or ASSET scope
 * type, so `PermissionGuard` can only pre-filter at tenant level (`ANY`); the real ABAC resolves in
 * the services from the project that owns the site — sites are project-scoped — and an unreachable
 * row answers 404, never 403. Every command requires an Idempotency-Key of 8–200 characters and
 * committed writes answer 200/201, never 202.
 *
 * API-115 acknowledges the LOCAL alarm case and nothing else: no route, body field or code path in
 * this controller can clear, reset or suppress a source alarm (SEC-127/SEC-128).
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class OperationsMaintenanceController {
  constructor(
    private readonly alarms: AlarmIncidentService,
    private readonly workOrders: WorkOrderService
  ) {}

  @Get('sites/:siteId/alarm-cases')
  @RequirePermission('alarmCase.read')
  async listAlarmCases(
    @Req() request: ContextRequest,
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Query() query: AlarmCaseListQueryDto
  ) {
    const result = await this.alarms.listAlarmCases(this.context(request), siteId, query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post('alarm-cases/:alarmCaseId\\:acknowledge')
  @HttpCode(200)
  @RequirePermission('alarmCase.acknowledge')
  async acknowledgeAlarmCase(
    @Req() request: ContextRequest,
    @Param('alarmCaseId', new ParseUUIDPipe()) alarmCaseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: AcknowledgeAlarmCaseDto
  ) {
    return this.resource(await this.alarms.acknowledgeAlarmCase(
      this.context(request), alarmCaseId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('sites/:siteId/service-incidents')
  @RequirePermission('serviceIncident.read')
  async listServiceIncidents(
    @Req() request: ContextRequest,
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Query() query: ServiceIncidentListQueryDto
  ) {
    const result = await this.alarms.listServiceIncidents(this.context(request), siteId, query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post('sites/:siteId/service-incidents')
  @RequirePermission('serviceIncident.create')
  async createServiceIncident(
    @Req() request: ContextRequest,
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateServiceIncidentDto
  ) {
    return this.resource(await this.alarms.createServiceIncident(
      this.context(request), siteId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('assets/:assetId/work-orders')
  @RequirePermission('workOrder.read')
  async listWorkOrders(
    @Req() request: ContextRequest,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query() query: WorkOrderListQueryDto
  ) {
    const result = await this.workOrders.listWorkOrders(this.context(request), assetId, query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post('assets/:assetId/work-orders')
  @RequirePermission('workOrder.create')
  async createWorkOrder(
    @Req() request: ContextRequest,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateWorkOrderDto
  ) {
    return this.resource(await this.workOrders.createWorkOrder(
      this.context(request), assetId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('work-orders/:workOrderId/actions')
  @HttpCode(200)
  @RequirePermission('workOrder.manage')
  async workOrderCommand(
    @Req() request: ContextRequest,
    @Param('workOrderId', new ParseUUIDPipe()) workOrderId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: WorkOrderCommandDto
  ) {
    return this.resource(await this.workOrders.workOrderCommand(
      this.context(request), workOrderId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('assets/:assetId/performance')
  @RequirePermission('performance.read')
  async getAssetPerformance(
    @Req() request: ContextRequest,
    @Param('assetId', new ParseUUIDPipe()) assetId: string
  ) {
    return {
      ...await this.workOrders.getAssetPerformance(this.context(request), assetId),
      correlationId: request.correlationId
    };
  }

  private context(request: ContextRequest) {
    return { ...request.auth!, correlationId: request.correlationId };
  }

  private resource<T>(data: T, request: ContextRequest) {
    return { data, correlationId: request.correlationId };
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
