import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import {
  RequireAnyPermission, RequirePermission
} from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import {
  ActionListQueryDto, ChangeDecisionDto, ChangeListQueryDto, ClosureDecisionDto,
  CreateActionDto, CreateChangeDto, CreateIssueDto, CreateRiskDto, DetailQueryDto,
  IssueListQueryDto, RiskChangeHistoryQueryDto, RiskChangeSummaryQueryDto,
  RiskListQueryDto, SubmitChangeDto, UpdateActionDto, UpdateChangeDto,
  UpdateIssueDto, UpdateRiskDto
} from './dto/risk-change.dto';
import { RiskChangeService } from './risk-change.service';

@Controller('v1/projects/:projectId')
@UseGuards(AccessGuard, PermissionGuard)
export class RiskChangeController {
  constructor(private readonly service: RiskChangeService) {}

  @Get('risks')
  @RequirePermission('riskChange.read', 'PROJECT')
  async listRisks(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: RiskListQueryDto
  ) {
    return this.collection(
      await this.service.listRisks(this.context(request), projectId, query), request
    );
  }

  @Post('risks')
  @RequirePermission('riskChange.create', 'PROJECT')
  async createRisk(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateRiskDto
  ) {
    return this.resource(await this.service.createRisk(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('risks/:riskId')
  @RequirePermission('riskChange.read', 'PROJECT')
  async getRisk(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('riskId', new ParseUUIDPipe()) riskId: string,
    @Query() query: DetailQueryDto
  ) {
    return {
      ...await this.service.getRisk(this.context(request), projectId, riskId, query),
      correlationId: request.correlationId
    };
  }

  @Patch('risks/:riskId')
  @RequireAnyPermission(['riskChange.manage', 'riskChange.requestClosure'], 'PROJECT')
  async updateRisk(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('riskId', new ParseUUIDPipe()) riskId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: UpdateRiskDto
  ) {
    return this.resource(await this.service.updateRisk(
      this.context(request), projectId, riskId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('risks/:riskId\\:closure-decision')
  @HttpCode(200)
  @RequirePermission('riskChange.close', 'PROJECT')
  async decideRiskClosure(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('riskId', new ParseUUIDPipe()) riskId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ClosureDecisionDto
  ) {
    return this.resource(await this.service.decideRiskClosure(
      this.context(request), projectId, riskId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('issues')
  @RequirePermission('riskChange.read', 'PROJECT')
  async listIssues(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: IssueListQueryDto
  ) {
    return this.collection(
      await this.service.listIssues(this.context(request), projectId, query), request
    );
  }

  @Post('issues')
  @RequirePermission('riskChange.create', 'PROJECT')
  async createIssue(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateIssueDto
  ) {
    return this.resource(await this.service.createIssue(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('issues/:issueId')
  @RequirePermission('riskChange.read', 'PROJECT')
  async getIssue(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Query() query: DetailQueryDto
  ) {
    return {
      ...await this.service.getIssue(this.context(request), projectId, issueId, query),
      correlationId: request.correlationId
    };
  }

  @Patch('issues/:issueId')
  @RequireAnyPermission(['riskChange.manage', 'riskChange.requestClosure'], 'PROJECT')
  async updateIssue(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: UpdateIssueDto
  ) {
    return this.resource(await this.service.updateIssue(
      this.context(request), projectId, issueId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('issues/:issueId\\:closure-decision')
  @HttpCode(200)
  @RequirePermission('riskChange.close', 'PROJECT')
  async decideIssueClosure(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('issueId', new ParseUUIDPipe()) issueId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ClosureDecisionDto
  ) {
    return this.resource(await this.service.decideIssueClosure(
      this.context(request), projectId, issueId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('risk-issue-actions')
  @RequirePermission('riskChange.read', 'PROJECT')
  async listActions(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: ActionListQueryDto
  ) {
    return this.collection(
      await this.service.listActions(this.context(request), projectId, query), request
    );
  }

  @Post('risk-issue-actions')
  @RequirePermission('riskChange.manage', 'PROJECT')
  async createAction(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateActionDto
  ) {
    return this.resource(await this.service.createAction(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('risk-issue-actions/:actionId')
  @RequirePermission('riskChange.read', 'PROJECT')
  async getAction(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('actionId', new ParseUUIDPipe()) actionId: string
  ) {
    return this.resource(
      await this.service.getAction(this.context(request), projectId, actionId), request
    );
  }

  @Patch('risk-issue-actions/:actionId')
  @RequirePermission('riskChange.manage', 'PROJECT')
  async updateAction(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('actionId', new ParseUUIDPipe()) actionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: UpdateActionDto
  ) {
    return this.resource(await this.service.updateAction(
      this.context(request), projectId, actionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('change-requests')
  @RequirePermission('riskChange.read', 'PROJECT')
  async listChanges(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: ChangeListQueryDto
  ) {
    return this.collection(
      await this.service.listChanges(this.context(request), projectId, query), request
    );
  }

  @Post('change-requests')
  @RequirePermission('riskChange.create', 'PROJECT')
  async createChange(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateChangeDto
  ) {
    return this.resource(await this.service.createChange(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('change-requests/:changeRequestId')
  @RequirePermission('riskChange.read', 'PROJECT')
  async getChange(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('changeRequestId', new ParseUUIDPipe()) changeRequestId: string
  ) {
    return this.resource(await this.service.getChange(
      this.context(request), projectId, changeRequestId
    ), request);
  }

  @Patch('change-requests/:changeRequestId')
  @RequirePermission('riskChange.manage', 'PROJECT')
  async updateChange(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('changeRequestId', new ParseUUIDPipe()) changeRequestId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: UpdateChangeDto
  ) {
    return this.resource(await this.service.updateChange(
      this.context(request), projectId, changeRequestId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('change-requests/:changeRequestId\\:submit')
  @HttpCode(200)
  @RequirePermission('riskChange.submit', 'PROJECT')
  async submitChange(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('changeRequestId', new ParseUUIDPipe()) changeRequestId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SubmitChangeDto
  ) {
    return this.resource(await this.service.submitChange(
      this.context(request), projectId, changeRequestId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('change-requests/:changeRequestId\\:decision')
  @HttpCode(200)
  @RequirePermission('riskChange.approve', 'PROJECT')
  async decideChange(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('changeRequestId', new ParseUUIDPipe()) changeRequestId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ChangeDecisionDto
  ) {
    return this.resource(await this.service.decideChange(
      this.context(request), projectId, changeRequestId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('risk-change-summary')
  @RequirePermission('riskChange.read', 'PROJECT')
  async getSummary(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: RiskChangeSummaryQueryDto
  ) {
    return this.resource(
      await this.service.getSummary(this.context(request), projectId, query), request
    );
  }

  @Get('risk-change-history')
  @RequirePermission('riskChange.read', 'PROJECT')
  async getHistory(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: RiskChangeHistoryQueryDto
  ) {
    return this.collection(
      await this.service.getHistory(this.context(request), projectId, query), request
    );
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
