import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequireAnyPermission, RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { FieldOperationsService } from './field-operations.service';
import { QualityControlService } from './quality-control.service';
import {
  CreateDailyLogDto, CreatePermitToWorkDto, InspectionCommandDto, IssuePermitToWorkDto,
  NcrCommandDto, PunchCommandDto, RecordQuantityProgressDto, ReleaseWorkfrontDto,
  ReportHseIncidentDto, StopWorkActionDto, SubmitDailyLogDto, WorkfrontListQueryDto
} from './dto/field-hse-quality.dto';

/**
 * Field, HSE & Quality (API-086…API-097). Project routes get a project-scoped pre-filter from
 * `PermissionGuard`; workfront/daily-log/permit/ITP routes are pre-filtered at tenant level and the
 * real ABAC resolves in the service from the row that owns the record. Every command requires an
 * Idempotency-Key of 8–200 characters. Committed writes answer 200/201, never 202.
 *
 * API-094 carries the split permissions (recorded deviation from the YAML's `stopWork.manage`):
 * the guard admits either half, and the service re-checks the half the body actually requests.
 * API-095/096/097 are multiplexed commands answering a fixed 200.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class FieldHseQualityController {
  constructor(
    private readonly field: FieldOperationsService,
    private readonly quality: QualityControlService
  ) {}

  @Get('projects/:projectId/workfronts')
  @RequirePermission('workfront.read', 'PROJECT')
  async listWorkfronts(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: WorkfrontListQueryDto
  ) {
    const result = await this.field.listWorkfronts(this.context(request), projectId, query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post('workfronts/:workfrontId\\:release')
  @HttpCode(200)
  @RequirePermission('workfront.release')
  async releaseWorkfront(
    @Req() request: ContextRequest,
    @Param('workfrontId', new ParseUUIDPipe()) workfrontId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReleaseWorkfrontDto
  ) {
    return this.resource(await this.field.releaseWorkfront(
      this.context(request), workfrontId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/daily-logs')
  @RequirePermission('dailyLog.create', 'PROJECT')
  async createDailyLog(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateDailyLogDto
  ) {
    return this.resource(await this.field.createDailyLog(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('daily-logs/:dailyLogId\\:submit')
  @HttpCode(200)
  @RequirePermission('dailyLog.submit')
  async submitDailyLog(
    @Req() request: ContextRequest,
    @Param('dailyLogId', new ParseUUIDPipe()) dailyLogId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SubmitDailyLogDto
  ) {
    return this.resource(await this.field.submitDailyLog(
      this.context(request), dailyLogId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('workfronts/:workfrontId/quantity-progress')
  @RequirePermission('progress.record')
  async recordQuantityProgress(
    @Req() request: ContextRequest,
    @Param('workfrontId', new ParseUUIDPipe()) workfrontId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RecordQuantityProgressDto
  ) {
    return this.resource(await this.field.recordQuantityProgress(
      this.context(request), workfrontId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('workfronts/:workfrontId/permits-to-work')
  @RequirePermission('permitToWork.request')
  async createPermitToWork(
    @Req() request: ContextRequest,
    @Param('workfrontId', new ParseUUIDPipe()) workfrontId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreatePermitToWorkDto
  ) {
    return this.resource(await this.field.createPermitToWork(
      this.context(request), workfrontId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('permits-to-work/:permitToWorkId\\:issue')
  @HttpCode(200)
  @RequirePermission('permitToWork.issue')
  async issuePermitToWork(
    @Req() request: ContextRequest,
    @Param('permitToWorkId', new ParseUUIDPipe()) permitToWorkId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: IssuePermitToWorkDto
  ) {
    return this.resource(await this.field.issuePermitToWork(
      this.context(request), permitToWorkId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/hse-incidents')
  @RequirePermission('hseIncident.report', 'PROJECT')
  async reportHseIncident(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReportHseIncidentDto
  ) {
    return this.resource(await this.field.reportHseIncident(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/stop-work-actions')
  @RequireAnyPermission(['stopWork.issue', 'stopWork.lift'], 'PROJECT')
  async recordStopWorkAction(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: StopWorkActionDto
  ) {
    return this.resource(await this.field.recordStopWorkAction(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('inspection-test-plans/:itpId/inspections')
  @HttpCode(200)
  @RequirePermission('inspection.manage')
  async inspectionCommand(
    @Req() request: ContextRequest,
    @Param('itpId', new ParseUUIDPipe()) itpId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: InspectionCommandDto
  ) {
    return this.resource(await this.quality.inspectionCommand(
      this.context(request), itpId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/ncrs')
  @HttpCode(200)
  @RequirePermission('ncr.manage', 'PROJECT')
  async ncrCommand(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: NcrCommandDto
  ) {
    return this.resource(await this.quality.ncrCommand(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/punch-items')
  @HttpCode(200)
  @RequirePermission('punch.manage', 'PROJECT')
  async punchCommand(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PunchCommandDto
  ) {
    return this.resource(await this.quality.punchCommand(
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
