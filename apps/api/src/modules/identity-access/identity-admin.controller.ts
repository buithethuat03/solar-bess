import {
  BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from './access.guard';
import type { ContextRequest } from './context-request';
import {
  AuditEventListQueryDto, CreateDelegationDto, CreateRoleAssignmentDto, RevokeDelegationDto
} from './dto/identity-admin.dto';
import { IdentityAdminService } from './identity-admin.service';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';

/**
 * Identity & Tenant administration (API-002/003/009/010/011/012/013). Every route is tenant-level;
 * finer mandates (delegator self-service, tenant-id equality) live in the service so a failure is
 * a 404, never an information-bearing 403.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class IdentityAdminController {
  constructor(private readonly service: IdentityAdminService) {}

  @Get('me/permissions')
  @RequirePermission('permission.read.self')
  async mePermissions(@Req() request: ContextRequest) {
    return {
      ...await this.service.mePermissions(this.context(request)),
      correlationId: request.correlationId
    };
  }

  @Get('tenants/:tenantId')
  @RequirePermission('tenant.read')
  async getTenant(
    @Req() request: ContextRequest,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string
  ) {
    return {
      ...await this.service.getTenant(this.context(request), tenantId),
      correlationId: request.correlationId
    };
  }

  @Post('role-assignments')
  @RequirePermission('roleAssignment.grant')
  async createRoleAssignment(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateRoleAssignmentDto
  ) {
    return this.resource(await this.service.createRoleAssignment(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Delete('role-assignments/:roleAssignmentId')
  @HttpCode(204)
  @RequirePermission('roleAssignment.revoke')
  async revokeRoleAssignment(
    @Req() request: ContextRequest,
    @Param('roleAssignmentId', new ParseUUIDPipe()) roleAssignmentId: string
  ): Promise<void> {
    await this.service.revokeRoleAssignment(this.context(request), roleAssignmentId);
  }

  @Post('delegations')
  @RequirePermission('delegation.create')
  async createDelegation(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateDelegationDto
  ) {
    return this.resource(await this.service.createDelegation(
      this.context(request), input, this.idempotencyKey(key)
    ), request);
  }

  @Post('delegations/:delegationId\\:revoke')
  @HttpCode(200)
  @RequirePermission('delegation.revoke')
  async revokeDelegation(
    @Req() request: ContextRequest,
    @Param('delegationId', new ParseUUIDPipe()) delegationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RevokeDelegationDto
  ) {
    return this.resource(await this.service.revokeDelegation(
      this.context(request), delegationId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('audit-events')
  @RequirePermission('audit.read')
  async listAuditEvents(
    @Req() request: ContextRequest,
    @Query() query: AuditEventListQueryDto
  ) {
    const result = await this.service.listAuditEvents(this.context(request), query);
    return { data: result.items, meta: result.meta, correlationId: request.correlationId };
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
