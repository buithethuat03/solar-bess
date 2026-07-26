import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { CodService } from './cod.service';
import { CommissioningService } from './commissioning.service';
import {
  CodReadinessQueryDto, CodTransitionCommandDto, CommissioningSystemListQueryDto,
  CompleteTestRunDto, CreateCommissioningSystemDto, CreateRetestDto, CreateTestPackDto,
  StartTestRunDto
} from './dto/commissioning-cod.dto';

/**
 * Commissioning & COD (API-098…API-105). Project routes get a project-scoped pre-filter from
 * `PermissionGuard`; system/test-pack/test-run routes are pre-filtered at tenant level and the real
 * ABAC resolves in the service from the project that owns the record. Every command requires an
 * Idempotency-Key of 8–200 characters. Committed writes answer 200/201, never 202 — the OpenAPI
 * response block documents 202 for the whole command family, and the recorded platform rule is that
 * a committed write reports the status it actually achieved.
 *
 * API-105 is a multiplexed command answering a fixed 200; see `CodService` for why its union is
 * wider than the three verbs the catalog summary names.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class CommissioningCodController {
  constructor(
    private readonly commissioning: CommissioningService,
    private readonly cod: CodService
  ) {}

  @Get('projects/:projectId/commissioning-systems')
  @RequirePermission('commissioning.read', 'PROJECT')
  async listCommissioningSystems(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: CommissioningSystemListQueryDto
  ) {
    const result = await this.commissioning.listCommissioningSystems(
      this.context(request), projectId, query
    );
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post('projects/:projectId/commissioning-systems')
  @RequirePermission('commissioningSystem.create', 'PROJECT')
  async createCommissioningSystem(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateCommissioningSystemDto
  ) {
    return this.resource(await this.commissioning.createCommissioningSystem(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('commissioning-systems/:systemId/test-packs')
  @RequirePermission('testPack.create')
  async createTestPack(
    @Req() request: ContextRequest,
    @Param('systemId', new ParseUUIDPipe()) systemId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateTestPackDto
  ) {
    return this.resource(await this.commissioning.createTestPack(
      this.context(request), systemId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('test-packs/:testPackId/test-runs')
  @RequirePermission('testRun.start')
  async startTestRun(
    @Req() request: ContextRequest,
    @Param('testPackId', new ParseUUIDPipe()) testPackId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: StartTestRunDto
  ) {
    return this.resource(await this.commissioning.startTestRun(
      this.context(request), testPackId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('test-runs/:testRunId\\:complete')
  @HttpCode(200)
  @RequirePermission('testRun.complete')
  async completeTestRun(
    @Req() request: ContextRequest,
    @Param('testRunId', new ParseUUIDPipe()) testRunId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CompleteTestRunDto
  ) {
    return this.resource(await this.commissioning.completeTestRun(
      this.context(request), testRunId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('test-runs/:testRunId\\:create-retest')
  @RequirePermission('testRun.retest')
  async createRetest(
    @Req() request: ContextRequest,
    @Param('testRunId', new ParseUUIDPipe()) testRunId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateRetestDto
  ) {
    return this.resource(await this.commissioning.createRetest(
      this.context(request), testRunId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('projects/:projectId/cod-readiness')
  @RequirePermission('cod.read', 'PROJECT')
  async readCodReadiness(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: CodReadinessQueryDto
  ) {
    return this.resource(await this.cod.readCodReadiness(
      this.context(request), projectId, query
    ), request);
  }

  @Post('projects/:projectId/cod-transition-commands')
  @HttpCode(200)
  @RequirePermission('cod.manage', 'PROJECT')
  async codTransitionCommand(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CodTransitionCommandDto
  ) {
    return this.resource(await this.cod.codTransitionCommand(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
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
