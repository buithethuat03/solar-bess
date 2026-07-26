import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { OpportunityService } from './opportunity.service';
import {
  ConvertOpportunityDto, CreateInvestmentScenarioDto, CreateOpportunityDto,
  CreateSurveyPackageDto, OpportunityListQueryDto, SubmitInvestmentScenarioDto,
  UpdateOpportunityDto
} from './dto/opportunity.dto';

/**
 * Opportunity pipeline (API-026…API-033). Opportunities are pre-project records, so the guard can
 * only pre-filter at permission level ('ANY'); the real reach test (tenant-scoped assignment or
 * nothing) is resolved inside the service — out of reach answers 404/empty, never 403. Every
 * command requires an Idempotency-Key of 8–200 characters and answers with its committed result
 * (201/200), never 202.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class OpportunityController {
  constructor(private readonly service: OpportunityService) {}

  @Get('opportunities')
  @RequirePermission('opportunity.read')
  async listOpportunities(
    @Req() request: ContextRequest,
    @Query() query: OpportunityListQueryDto
  ) {
    return this.collection(
      await this.service.listOpportunities(this.context(request), query), request
    );
  }

  @Post('opportunities')
  @RequirePermission('opportunity.create')
  async createOpportunity(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateOpportunityDto
  ) {
    return this.resource(await this.service.createOpportunity(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Get('opportunities/:opportunityId')
  @RequirePermission('opportunity.read')
  async getOpportunity(
    @Req() request: ContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string
  ) {
    return {
      ...await this.service.getOpportunity(this.context(request), opportunityId),
      correlationId: request.correlationId
    };
  }

  @Patch('opportunities/:opportunityId')
  @HttpCode(200)
  @RequirePermission('opportunity.update')
  async updateOpportunity(
    @Req() request: ContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: UpdateOpportunityDto
  ) {
    return this.resource(await this.service.updateOpportunity(
      this.context(request), opportunityId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('opportunities/:opportunityId/survey-packages')
  @RequirePermission('survey.create')
  async createSurveyPackage(
    @Req() request: ContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateSurveyPackageDto
  ) {
    return this.resource(await this.service.createSurveyPackage(
      this.context(request), opportunityId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('opportunities/:opportunityId/investment-scenarios')
  @RequirePermission('scenario.create')
  async createInvestmentScenario(
    @Req() request: ContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateInvestmentScenarioDto
  ) {
    return this.resource(await this.service.createInvestmentScenario(
      this.context(request), opportunityId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('investment-scenarios/:scenarioId\\:submit')
  @HttpCode(200)
  @RequirePermission('scenario.submit')
  async submitInvestmentScenario(
    @Req() request: ContextRequest,
    @Param('scenarioId', new ParseUUIDPipe()) scenarioId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SubmitInvestmentScenarioDto
  ) {
    return this.resource(await this.service.submitInvestmentScenario(
      this.context(request), scenarioId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('opportunities/:opportunityId\\:convert')
  @RequirePermission('opportunity.convert')
  async convertOpportunity(
    @Req() request: ContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ConvertOpportunityDto
  ) {
    return this.resource(await this.service.convertOpportunity(
      this.context(request), opportunityId, input, this.idempotencyKey(key)
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
