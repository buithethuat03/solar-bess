import {
  BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, ParseUUIDPipe,
  Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import {
  RequireAnyPermission, RequirePermission
} from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import {
  ApplyScheduleDraftDto, BaselineDecisionDto, CreatePackageDto, LookAheadExportQueryDto,
  PackageListQueryDto,
  ProgressHistoryQueryDto, ProgressUpdateDto, ScheduleQueryDto, SubmitScheduleBaselineDto
} from './dto/project-controls.dto';
import { ProjectControlsService } from './project-controls.service';

@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class ProjectControlsController {
  constructor(private readonly service: ProjectControlsService) {}

  @Get('projects/:projectId/packages')
  @RequirePermission('package.read', 'PROJECT')
  async listPackages(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: PackageListQueryDto
  ) {
    const result = await this.service.listPackages(this.context(request), projectId, query);
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor },
      correlationId: request.correlationId
    };
  }

  @Post('projects/:projectId/packages')
  @RequirePermission('package.create', 'PROJECT')
  async createPackage(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreatePackageDto
  ) {
    return this.resource(await this.service.createPackage(
      this.context(request), projectId, input, this.idempotencyKey(idempotencyKey)
    ), request);
  }

  @Get('projects/:projectId/schedule')
  @RequirePermission('schedule.read', 'PROJECT')
  async getSchedule(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: ScheduleQueryDto
  ) {
    return this.resource(
      await this.service.getSchedule(this.context(request), projectId, query), request
    );
  }

  @Get('projects/:projectId/schedule-look-ahead.csv')
  @RequirePermission('schedule.read', 'PROJECT')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="schedule-look-ahead.csv"')
  async exportLookAhead(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: LookAheadExportQueryDto
  ) {
    return this.service.exportLookAhead(this.context(request), projectId, query);
  }

  @Post('projects/:projectId/schedule\\:apply-draft')
  @HttpCode(200)
  @RequirePermission('schedule.manage', 'PROJECT')
  async applyDraft(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ApplyScheduleDraftDto
  ) {
    return this.resource(await this.service.applyDraft(
      this.context(request), projectId, input, this.idempotencyKey(idempotencyKey)
    ), request);
  }

  @Post('projects/:projectId/schedule-baselines')
  @RequirePermission('baseline.submit', 'PROJECT')
  async submitBaseline(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: SubmitScheduleBaselineDto
  ) {
    return this.resource(await this.service.submitBaseline(
      this.context(request), projectId, input, this.idempotencyKey(idempotencyKey)
    ), request);
  }

  @Post('schedule-baselines/:baselineId\\:decision')
  @HttpCode(200)
  @RequirePermission('baseline.approve')
  async decideBaseline(
    @Req() request: ContextRequest,
    @Param('baselineId', new ParseUUIDPipe()) baselineId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: BaselineDecisionDto
  ) {
    return this.resource(await this.service.decideBaseline(
      this.context(request), baselineId, input, this.idempotencyKey(idempotencyKey)
    ), request);
  }

  @Post('projects/:projectId/progress-updates')
  @RequireAnyPermission(['progress.record', 'progress.correct'], 'PROJECT')
  async recordProgress(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: ProgressUpdateDto
  ) {
    return this.resource(await this.service.recordProgress(
      this.context(request), projectId, input, this.idempotencyKey(idempotencyKey)
    ), request);
  }

  @Get('projects/:projectId/progress-updates')
  @RequirePermission('schedule.read', 'PROJECT')
  async listProgressHistory(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: ProgressHistoryQueryDto
  ) {
    const result = await this.service.listProgressHistory(
      this.context(request), projectId, query
    );
    return {
      data: result.items,
      meta: { nextCursor: result.nextCursor },
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
        message: 'Idempotency-Key phải có từ 8 đến 200 ký tự',
        retryable: false
      });
    }
    return key;
  }
}
