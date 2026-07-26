import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { EngineeringPlantsService } from './engineering-plants.service';
import {
  BomListQueryDto, CreateEquipmentModelDto, EquipmentModelListQueryDto, ReleaseBomDto,
  ReleaseSolarConfigurationDto, SimulateDispatchDto
} from './dto/engineering-plants.dto';

/**
 * Engineering & Plants (API-067…API-070, API-072…API-075; API-071 substitutions DEFERRED).
 * Routes carrying `{projectId}` get a project-scoped pre-filter from `PermissionGuard`; plant
 * routes can only be pre-filtered at tenant level, so the real project ABAC is resolved inside
 * the service from the row that owns the record. Every command requires an Idempotency-Key of
 * 8–200 characters.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class EngineeringPlantsController {
  constructor(private readonly service: EngineeringPlantsService) {}

  @Get('equipment-models')
  @RequirePermission('equipmentModel.read')
  async listEquipmentModels(
    @Req() request: ContextRequest,
    @Query() query: EquipmentModelListQueryDto
  ) {
    return this.collection(
      await this.service.listEquipmentModels(this.context(request), query), request
    );
  }

  @Post('equipment-models')
  @RequirePermission('equipmentModel.create')
  async createEquipmentModel(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateEquipmentModelDto
  ) {
    return this.resource(await this.service.createEquipmentModel(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Get('projects/:projectId/bill-of-materials')
  @RequirePermission('bom.read', 'PROJECT')
  async listBillOfMaterials(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: BomListQueryDto
  ) {
    return this.collection(
      await this.service.listBillOfMaterials(this.context(request), projectId, query), request
    );
  }

  @Post('projects/:projectId/bill-of-materials\\:release')
  @HttpCode(200)
  @RequirePermission('bom.release', 'PROJECT')
  async releaseBillOfMaterials(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReleaseBomDto
  ) {
    return this.resource(await this.service.releaseBillOfMaterials(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('solar-plants/:solarPlantId')
  @RequirePermission('solarPlant.read')
  async getSolarPlant(
    @Req() request: ContextRequest,
    @Param('solarPlantId', new ParseUUIDPipe()) solarPlantId: string
  ) {
    return {
      ...await this.service.getSolarPlant(this.context(request), solarPlantId),
      correlationId: request.correlationId
    };
  }

  @Post('solar-plants/:solarPlantId\\:release-configuration')
  @HttpCode(200)
  @RequirePermission('solarPlant.configure')
  async releaseSolarConfiguration(
    @Req() request: ContextRequest,
    @Param('solarPlantId', new ParseUUIDPipe()) solarPlantId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReleaseSolarConfigurationDto
  ) {
    return this.resource(await this.service.releaseSolarConfiguration(
      this.context(request), solarPlantId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('bess-plants/:bessPlantId')
  @RequirePermission('bessPlant.read')
  async getBessPlant(
    @Req() request: ContextRequest,
    @Param('bessPlantId', new ParseUUIDPipe()) bessPlantId: string
  ) {
    return {
      ...await this.service.getBessPlant(this.context(request), bessPlantId),
      correlationId: request.correlationId
    };
  }

  @Post('bess-plants/:bessPlantId\\:simulate-dispatch')
  @HttpCode(200)
  @RequirePermission('bessSimulation.run')
  async simulateDispatch(
    @Req() request: ContextRequest,
    @Param('bessPlantId', new ParseUUIDPipe()) bessPlantId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SimulateDispatchDto
  ) {
    return this.resource(await this.service.simulateDispatch(
      this.context(request), bessPlantId, input, this.idempotencyKey(key)
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
