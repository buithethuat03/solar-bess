import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import {
  ApprovalTaskListQueryDto, CancelWorkflowInstanceDto, EscalateWorkflowInstanceDto,
  PublishWorkflowVersionDto, RecordApprovalDecisionDto, StartWorkflowInstanceDto,
  WorkflowDefinitionListQueryDto
} from './dto/workflow.dto';
import { WorkflowService } from './workflow.service';

/**
 * None of these routes carries a `{projectId}`, so `PermissionGuard` can only apply a coarse
 * tenant-level pre-filter. The real project/package ABAC is resolved inside the service against the
 * instance's own scope columns.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get('workflow-definitions')
  @RequirePermission('workflowDefinition.read')
  async listDefinitions(
    @Req() request: ContextRequest,
    @Query() query: WorkflowDefinitionListQueryDto
  ) {
    return this.collection(
      await this.service.listDefinitions(this.context(request), query), request
    );
  }

  @Post('workflow-definitions/:definitionId\\:publish')
  @HttpCode(200)
  @RequirePermission('workflowDefinition.publish')
  async publishVersion(
    @Req() request: ContextRequest,
    @Param('definitionId', new ParseUUIDPipe()) definitionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PublishWorkflowVersionDto
  ) {
    return this.resource(await this.service.publishVersion(
      this.context(request), definitionId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('workflow-instances')
  @RequirePermission('workflow.start')
  async startInstance(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: StartWorkflowInstanceDto
  ) {
    return this.resource(await this.service.startInstance(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Get('workflow-instances/:workflowInstanceId')
  @RequirePermission('workflow.read')
  async getInstance(
    @Req() request: ContextRequest,
    @Param('workflowInstanceId', new ParseUUIDPipe()) workflowInstanceId: string
  ) {
    return {
      ...await this.service.getInstance(this.context(request), workflowInstanceId),
      correlationId: request.correlationId
    };
  }

  @Get('approval-tasks')
  @RequirePermission('approvalTask.read')
  async listApprovalTasks(
    @Req() request: ContextRequest,
    @Query() query: ApprovalTaskListQueryDto
  ) {
    return this.collection(
      await this.service.listApprovalTasks(this.context(request), query), request
    );
  }

  @Post('workflow-instances/:workflowInstanceId/decisions')
  @HttpCode(200)
  @RequirePermission('approval.decide')
  async recordDecision(
    @Req() request: ContextRequest,
    @Param('workflowInstanceId', new ParseUUIDPipe()) workflowInstanceId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RecordApprovalDecisionDto
  ) {
    return this.resource(await this.service.recordDecision(
      this.context(request), workflowInstanceId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('workflow-instances/:workflowInstanceId\\:escalate')
  @HttpCode(200)
  @RequirePermission('workflow.escalate')
  async escalateInstance(
    @Req() request: ContextRequest,
    @Param('workflowInstanceId', new ParseUUIDPipe()) workflowInstanceId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: EscalateWorkflowInstanceDto
  ) {
    return this.resource(await this.service.escalateInstance(
      this.context(request), workflowInstanceId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('workflow-instances/:workflowInstanceId\\:cancel')
  @HttpCode(200)
  @RequirePermission('workflow.cancel')
  async cancelInstance(
    @Req() request: ContextRequest,
    @Param('workflowInstanceId', new ParseUUIDPipe()) workflowInstanceId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CancelWorkflowInstanceDto
  ) {
    return this.resource(await this.service.cancelInstance(
      this.context(request), workflowInstanceId, input, this.idempotencyKey(key)
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
