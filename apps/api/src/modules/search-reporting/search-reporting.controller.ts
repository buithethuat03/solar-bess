import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import {
  CreateReportJobDto, CreateSavedViewDto, SavedViewListQueryDto, SearchRequestDto
} from './dto/search-reporting.dto';
import { SearchReportingService } from './search-reporting.service';

/**
 * Search & Reporting (API-130…API-134). `search.execute` gates the search entry point; per-module
 * visibility is decided branch by branch inside the query, so a missing module permission empties
 * that branch instead of turning search into a 403 oracle.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class SearchReportingController {
  constructor(private readonly service: SearchReportingService) {}

  /** POST with safe-body semantics per the contract: a read, not a command. */
  @Post('search')
  @HttpCode(200)
  @RequirePermission('search.execute')
  async search(@Req() request: ContextRequest, @Body() input: SearchRequestDto) {
    const result = await this.service.search(this.context(request), input);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Get('saved-views')
  @RequirePermission('savedView.read')
  async listSavedViews(
    @Req() request: ContextRequest,
    @Query() query: SavedViewListQueryDto
  ) {
    const result = await this.service.listSavedViews(this.context(request), query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
  }

  @Post('saved-views')
  @RequirePermission('savedView.create')
  async createSavedView(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateSavedViewDto
  ) {
    return this.resource(await this.service.createSavedView(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Post('report-jobs')
  @RequirePermission('report.create')
  async createReportJob(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateReportJobDto
  ) {
    return this.resource(await this.service.createReportJob(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Get('report-jobs/:reportJobId')
  @RequirePermission('report.read')
  async getReportJob(
    @Req() request: ContextRequest,
    @Param('reportJobId', new ParseUUIDPipe()) reportJobId: string
  ) {
    return {
      ...await this.service.getReportJob(this.context(request), reportJobId),
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
