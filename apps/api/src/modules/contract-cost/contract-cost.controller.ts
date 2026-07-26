import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import { ContractCostService } from './contract-cost.service';
import {
  ContractListQueryDto, CreateBudgetVersionDto, CreateCommitmentDto, CreateContractAppendixDto,
  CreateContractDto, CreateContractPartyDto, CreateObligationDto, CreatePaymentDto,
  FulfillObligationDto, ObligationListQueryDto, UpdateContractDto
} from './dto/contract-cost.dto';

/**
 * Contract & Cost (API-053…API-066). Routes carrying a `{projectId}` get a project-scoped
 * pre-filter from `PermissionGuard`; contract/obligation/payment routes can only be pre-filtered at
 * tenant level, so the real project ABAC is resolved inside the service from the row that owns the
 * record. Every command requires an Idempotency-Key of 8–200 characters.
 */
@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class ContractCostController {
  constructor(private readonly service: ContractCostService) {}

  @Get('projects/:projectId/contracts')
  @RequirePermission('contract.read', 'PROJECT')
  async listContracts(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: ContractListQueryDto
  ) {
    return this.collection(
      await this.service.listContracts(this.context(request), projectId, query), request
    );
  }

  @Post('projects/:projectId/contracts')
  @RequirePermission('contract.create', 'PROJECT')
  async createContract(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateContractDto
  ) {
    return this.resource(await this.service.createContract(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('contracts/:contractId')
  @RequirePermission('contract.read')
  async getContract(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string
  ) {
    return {
      ...await this.service.getContract(this.context(request), contractId),
      correlationId: request.correlationId
    };
  }

  @Patch('contracts/:contractId')
  @HttpCode(200)
  @RequirePermission('contract.update')
  async updateContract(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: UpdateContractDto
  ) {
    return this.resource(await this.service.updateContract(
      this.context(request), contractId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('contracts/:contractId/parties')
  @RequirePermission('contractParty.create')
  async createContractParty(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateContractPartyDto
  ) {
    return this.resource(await this.service.createContractParty(
      this.context(request), contractId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('contracts/:contractId/appendices')
  @RequirePermission('contractAppendix.create')
  async createContractAppendix(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateContractAppendixDto
  ) {
    return this.resource(await this.service.createContractAppendix(
      this.context(request), contractId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('contracts/:contractId/obligations')
  @RequirePermission('obligation.read')
  async listObligations(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Query() query: ObligationListQueryDto
  ) {
    return this.collection(
      await this.service.listObligations(this.context(request), contractId, query), request
    );
  }

  @Post('contracts/:contractId/obligations')
  @RequirePermission('obligation.create')
  async createObligation(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateObligationDto
  ) {
    return this.resource(await this.service.createObligation(
      this.context(request), contractId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('obligations/:obligationId\\:fulfill')
  @HttpCode(200)
  @RequirePermission('obligation.fulfill')
  async fulfillObligation(
    @Req() request: ContextRequest,
    @Param('obligationId', new ParseUUIDPipe()) obligationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: FulfillObligationDto
  ) {
    return this.resource(await this.service.fulfillObligation(
      this.context(request), obligationId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('projects/:projectId/cost-summary')
  @RequirePermission('cost.read', 'PROJECT')
  async getCostSummary(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string
  ) {
    return {
      ...await this.service.getCostSummary(this.context(request), projectId),
      correlationId: request.correlationId
    };
  }

  @Post('projects/:projectId/budget-versions')
  @RequirePermission('budget.submit', 'PROJECT')
  async createBudgetVersion(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateBudgetVersionDto
  ) {
    return this.resource(await this.service.createBudgetVersion(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('projects/:projectId/commitments')
  @RequirePermission('commitment.create', 'PROJECT')
  async createCommitment(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateCommitmentDto
  ) {
    return this.resource(await this.service.createCommitment(
      this.context(request), projectId, input, this.idempotencyKey(key)
    ), request);
  }

  @Post('contracts/:contractId/payments')
  @RequirePermission('payment.create')
  async createPayment(
    @Req() request: ContextRequest,
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreatePaymentDto
  ) {
    return this.resource(await this.service.createPayment(
      this.context(request), contractId, input, this.idempotencyKey(key)
    ), request);
  }

  @Get('payments/:paymentId')
  @RequirePermission('payment.read')
  async getPayment(
    @Req() request: ContextRequest,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string
  ) {
    return {
      ...await this.service.getPayment(this.context(request), paymentId),
      correlationId: request.correlationId
    };
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
