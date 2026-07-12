import {
  BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch,
  Post, Put, Query, Req, UseGuards
} from '@nestjs/common';
import { AccessGuard } from '../identity-access/access.guard';
import type { ContextRequest } from '../identity-access/context-request';
import { RequirePermission } from '../identity-access/permission.decorator';
import { PermissionGuard } from '../identity-access/permission.guard';
import {
  CreateCompanyDto, CreateLegalEntityDto, CreatePortfolioDto
} from './dto/organization.dto';
import {
  CreateProjectDto, CreateSiteDto, ProjectListQueryDto,
  UpdateProjectDto, UpsertProjectPartyDto
} from './dto/project.dto';
import { ProjectManagementService } from './project-management.service';

@Controller('v1')
@UseGuards(AccessGuard, PermissionGuard)
export class ProjectManagementController {
  constructor(private readonly service: ProjectManagementService) {}

  @Get('companies')
  @RequirePermission('organization.read')
  async listCompanies(@Req() request: ContextRequest) {
    return this.collection(await this.service.listCompanies(this.context(request)), request);
  }

  @Post('companies')
  @HttpCode(202)
  @RequirePermission('organization.create', 'TENANT')
  async createCompany(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateCompanyDto
  ) {
    return this.resource(
      await this.service.createCompany(this.context(request), input, this.idempotencyKey(idempotencyKey)), request
    );
  }

  @Get('legal-entities')
  @RequirePermission('legalEntity.read')
  async listLegalEntities(@Req() request: ContextRequest) {
    return this.collection(await this.service.listLegalEntities(this.context(request)), request);
  }

  @Post('legal-entities')
  @HttpCode(202)
  @RequirePermission('legalEntity.create', 'TENANT')
  async createLegalEntity(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateLegalEntityDto
  ) {
    return this.resource(
      await this.service.createLegalEntity(this.context(request), input, this.idempotencyKey(idempotencyKey)), request
    );
  }

  @Get('portfolios')
  @RequirePermission('portfolio.read')
  async listPortfolios(@Req() request: ContextRequest) {
    return this.collection(await this.service.listPortfolios(this.context(request)), request);
  }

  @Post('portfolios')
  @HttpCode(202)
  @RequirePermission('portfolio.create', 'TENANT')
  async createPortfolio(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreatePortfolioDto
  ) {
    return this.resource(
      await this.service.createPortfolio(this.context(request), input, this.idempotencyKey(idempotencyKey)), request
    );
  }

  @Get('projects')
  @RequirePermission('project.read')
  async listProjects(@Req() request: ContextRequest, @Query() query: ProjectListQueryDto) {
    const result = await this.service.listProjects(this.context(request), query);
    return {
      data: result.items, meta: { total: result.total, limit: result.limit },
      correlationId: request.correlationId
    };
  }

  @Post('projects')
  @HttpCode(202)
  @RequirePermission('project.create', 'TENANT')
  async createProject(
    @Req() request: ContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateProjectDto
  ) {
    return this.resource(
      await this.service.createProject(this.context(request), input, this.idempotencyKey(idempotencyKey)), request
    );
  }

  @Get('projects/:projectId')
  @RequirePermission('project.read', 'PROJECT')
  async getProject(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string
  ) {
    return this.resource(await this.service.getProject(this.context(request), projectId), request);
  }

  @Patch('projects/:projectId')
  @HttpCode(202)
  @RequirePermission('project.update', 'PROJECT')
  async updateProject(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: UpdateProjectDto
  ) {
    return this.resource(
      await this.service.updateProject(
        this.context(request), projectId, input, this.expectedVersion(ifMatch),
        this.idempotencyKey(idempotencyKey)
      ), request
    );
  }

  @Get('projects/:projectId/sites')
  @RequirePermission('site.read', 'PROJECT')
  async listSites(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string
  ) {
    return this.collection(await this.service.listSites(this.context(request), projectId), request);
  }

  @Post('projects/:projectId/sites')
  @HttpCode(202)
  @RequirePermission('site.create', 'PROJECT')
  async createSite(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateSiteDto
  ) {
    return this.resource(
      await this.service.createSite(
        this.context(request), projectId, input, this.idempotencyKey(idempotencyKey)
      ), request
    );
  }

  @Put('projects/:projectId/parties/:partyId')
  @HttpCode(202)
  @RequirePermission('projectParty.manage', 'PROJECT')
  async upsertProjectParty(
    @Req() request: ContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('partyId', new ParseUUIDPipe()) partyId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: UpsertProjectPartyDto
  ) {
    return this.resource(
      await this.service.upsertProjectParty(
        this.context(request), projectId, partyId, input, this.expectedVersion(ifMatch, true),
        this.idempotencyKey(idempotencyKey)
      ), request
    );
  }

  private context(request: ContextRequest) {
    return { ...request.auth!, correlationId: request.correlationId };
  }

  private resource<T>(data: T, request: ContextRequest) {
    return { data, correlationId: request.correlationId };
  }

  private collection<T>(data: T[], request: ContextRequest) {
    return { data, meta: { total: data.length }, correlationId: request.correlationId };
  }

  private idempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length < 8 || key.length > 200) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key phải có từ 8 đến 200 ký tự', retryable: false
      });
    }
    return key;
  }

  private expectedVersion(value: string | undefined, allowZero = false): number {
    const normalized = value?.replaceAll('"', '').trim();
    const parsed = normalized ? Number(normalized) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
      throw new BadRequestException({
        code: 'IF_MATCH_REQUIRED', message: 'If-Match phải chứa resource version hợp lệ', retryable: false
      });
    }
    return parsed;
  }
}
