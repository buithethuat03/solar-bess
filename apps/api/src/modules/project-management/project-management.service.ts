import {
  BadRequestException, ConflictException, Injectable, NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import {
  AuditEventEntity, CompanyEntity, LegalEntityEntity, MasterRecordStatus,
  PortfolioEntity, ProjectEntity, ProjectPartyEntity, ProjectPhase,
  ProjectRecordStatus, SiteEntity, UserAccountEntity
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import type {
  CreateCompanyDto, CreateLegalEntityDto, CreatePortfolioDto
} from './dto/organization.dto';
import type {
  CreateProjectDto, CreateSiteDto, ProjectListQueryDto,
  UpdateProjectDto, UpsertProjectPartyDto
} from './dto/project.dto';

interface RequestContext extends AuthContext { correlationId: string }

@Injectable()
export class ProjectManagementService {
  constructor(
    @InjectRepository(CompanyEntity) private readonly companies: Repository<CompanyEntity>,
    @InjectRepository(LegalEntityEntity) private readonly legalEntities: Repository<LegalEntityEntity>,
    @InjectRepository(PortfolioEntity) private readonly portfolios: Repository<PortfolioEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(SiteEntity) private readonly sites: Repository<SiteEntity>,
    @InjectRepository(ProjectPartyEntity) private readonly projectParties: Repository<ProjectPartyEntity>,
    @InjectRepository(UserAccountEntity) private readonly users: Repository<UserAccountEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  async listCompanies(context: RequestContext) {
    const projectIds = await this.permissions.projectScopeIds(context, 'organization.read');
    if (projectIds?.length === 0) return [];
    const query = this.companies.createQueryBuilder('company')
      .where('company.tenantId = :tenantId', { tenantId: context.tenantId });
    if (projectIds) {
      query.andWhere(`(
        EXISTS (
          SELECT 1 FROM projects project
          LEFT JOIN legal_entities owner_legal
            ON owner_legal.id = project.owner_legal_entity_id
           AND owner_legal.tenant_id = project.tenant_id
          WHERE project.tenant_id = company.tenant_id
            AND project.id IN (:...projectIds)
            AND (project.customer_company_id = company.id OR owner_legal.company_id = company.id)
        ) OR EXISTS (
          SELECT 1 FROM project_parties party
          WHERE party.tenant_id = company.tenant_id
            AND party.project_id IN (:...projectIds)
            AND party.company_id = company.id
        )
      )`, { projectIds });
    }
    const rows = await query.orderBy('company.name', 'ASC').getMany();
    return rows.map((row) => this.companyView(row));
  }

  async createCompany(context: RequestContext, input: CreateCompanyDto, idempotencyKey: string) {
    try {
      return await this.commands.execute({
        context,
        operation: 'company.create',
        idempotencyKey,
        request: input,
        execute: async (manager) => {
          const row = await manager.getRepository(CompanyEntity).save({
            id: randomUUID(), tenantId: context.tenantId, code: input.code,
            name: input.name.trim(), organizationType: input.organizationType,
            status: MasterRecordStatus.ACTIVE, idempotencyKey: null
          });
          await this.recordMutation(manager, context, {
            action: 'COMPANY_CREATED', objectType: 'Company', objectId: row.id,
            aggregateVersion: 1, payload: { code: row.code }
          });
          return this.companyView(row);
        },
        resultReference: (result) => ({ resourceType: 'Company', resourceId: result.id, responseStatus: 202 })
      });
    } catch (error) {
      this.rethrowDatabaseConflict(error, 'COMPANY_DUPLICATE', 'Mã Company hoặc idempotency key đã tồn tại');
    }
  }

  async listLegalEntities(context: RequestContext) {
    const projectIds = await this.permissions.projectScopeIds(context, 'legalEntity.read');
    if (projectIds?.length === 0) return [];
    const query = this.legalEntities.createQueryBuilder('legal_entity')
      .where('legal_entity.tenantId = :tenantId', { tenantId: context.tenantId });
    if (projectIds) {
      query.andWhere(`(
        EXISTS (
          SELECT 1 FROM projects project
          WHERE project.tenant_id = legal_entity.tenant_id
            AND project.id IN (:...projectIds)
            AND project.owner_legal_entity_id = legal_entity.id
        ) OR EXISTS (
          SELECT 1 FROM project_parties party
          WHERE party.tenant_id = legal_entity.tenant_id
            AND party.project_id IN (:...projectIds)
            AND party.legal_entity_id = legal_entity.id
        )
      )`, { projectIds });
    }
    const rows = await query.orderBy('legal_entity.legalName', 'ASC').getMany();
    return rows.map((row) => this.legalEntityView(row));
  }

  async createLegalEntity(context: RequestContext, input: CreateLegalEntityDto, idempotencyKey: string) {
    try {
      return await this.commands.execute({
        context,
        operation: 'legal-entity.create',
        idempotencyKey,
        request: input,
        execute: async (manager) => {
          await this.requireCompany(
            context.tenantId, input.companyId, manager.getRepository(CompanyEntity)
          );
          const row = await manager.getRepository(LegalEntityEntity).save({
            id: randomUUID(), tenantId: context.tenantId, companyId: input.companyId,
            legalName: input.legalName.trim(), country: input.country,
            registrationNo: input.registrationNo.trim(), taxId: input.taxId?.trim() || null,
            status: MasterRecordStatus.ACTIVE, idempotencyKey: null
          });
          await this.recordMutation(manager, context, {
            action: 'LEGAL_ENTITY_CREATED', objectType: 'LegalEntity', objectId: row.id,
            aggregateVersion: 1,
            payload: { companyId: row.companyId, country: row.country, registrationNo: row.registrationNo }
          });
          return this.legalEntityView(row);
        },
        resultReference: (result) => ({
          resourceType: 'LegalEntity', resourceId: result.id, responseStatus: 202
        })
      });
    } catch (error) {
      this.rethrowDatabaseConflict(error, 'LEGAL_ENTITY_DUPLICATE', 'Pháp nhân hoặc idempotency key đã tồn tại');
    }
  }

  async listPortfolios(context: RequestContext) {
    const projectIds = await this.permissions.projectScopeIds(context, 'portfolio.read');
    if (projectIds?.length === 0) return [];
    const query = this.portfolios.createQueryBuilder('portfolio')
      .where('portfolio.tenantId = :tenantId', { tenantId: context.tenantId });
    if (projectIds) {
      query.andWhere(`EXISTS (
        SELECT 1 FROM projects project
        WHERE project.tenant_id = portfolio.tenant_id
          AND project.portfolio_id = portfolio.id
          AND project.id IN (:...projectIds)
      )`, { projectIds });
    }
    const rows = await query.orderBy('portfolio.name', 'ASC').getMany();
    return rows.map((row) => this.portfolioView(row));
  }

  async createPortfolio(context: RequestContext, input: CreatePortfolioDto, idempotencyKey: string) {
    try {
      return await this.commands.execute({
        context,
        operation: 'portfolio.create',
        idempotencyKey,
        request: input,
        execute: async (manager) => {
          const row = await manager.getRepository(PortfolioEntity).save({
            id: randomUUID(), tenantId: context.tenantId, code: input.code,
            name: input.name.trim(), status: MasterRecordStatus.ACTIVE, idempotencyKey: null
          });
          await this.recordMutation(manager, context, {
            action: 'PORTFOLIO_CREATED', objectType: 'Portfolio', objectId: row.id,
            aggregateVersion: 1, payload: { code: row.code }
          });
          return this.portfolioView(row);
        },
        resultReference: (result) => ({ resourceType: 'Portfolio', resourceId: result.id, responseStatus: 202 })
      });
    } catch (error) {
      this.rethrowDatabaseConflict(error, 'PORTFOLIO_DUPLICATE', 'Mã Portfolio hoặc idempotency key đã tồn tại');
    }
  }

  async listProjects(context: RequestContext, query: ProjectListQueryDto) {
    const projectIds = await this.permissions.projectScopeIds(context, 'project.read');
    if (projectIds?.length === 0) return { items: [], total: 0, limit: query.limit };
    const builder = this.projects.createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId: context.tenantId });
    if (projectIds) builder.andWhere('project.id IN (:...projectIds)', { projectIds });
    if (query.portfolioId) builder.andWhere('project.portfolioId = :portfolioId', query);
    if (query.ownerLegalEntityId) builder.andWhere('project.ownerLegalEntityId = :ownerLegalEntityId', query);
    if (query.customerCompanyId) builder.andWhere('project.customerCompanyId = :customerCompanyId', query);
    if (query.projectManagerId) builder.andWhere('project.projectManagerId = :projectManagerId', query);
    if (query.type) builder.andWhere('project.type = :type', query);
    if (query.phase) builder.andWhere('project.phase = :phase', query);
    if (query.recordStatus) builder.andWhere('project.recordStatus = :recordStatus', query);
    if (query.search) {
      builder.andWhere('(project.code ILIKE :search OR project.name ILIKE :search)', {
        search: `%${query.search.trim()}%`
      });
    }
    const [rows, total] = await builder
      .orderBy('project.updatedAt', 'DESC')
      .take(query.limit)
      .getManyAndCount();
    return { items: rows.map((row) => this.projectView(row)), total, limit: query.limit };
  }

  async createProject(context: RequestContext, input: CreateProjectDto, idempotencyKey: string) {
    try {
      return await this.commands.execute({
        context,
        operation: 'project.create',
        idempotencyKey,
        request: input,
        execute: async (manager) => {
          await this.requirePortfolio(
            context.tenantId, input.portfolioId, manager.getRepository(PortfolioEntity)
          );
          await this.requireLegalEntity(
            context.tenantId, input.ownerLegalEntityId, manager.getRepository(LegalEntityEntity)
          );
          await this.requireCompany(
            context.tenantId, input.customerCompanyId, manager.getRepository(CompanyEntity)
          );
          if (input.projectManagerId) {
            await this.requireUser(
              context.tenantId, input.projectManagerId, manager.getRepository(UserAccountEntity)
            );
          }
          const projectId = randomUUID();
          const project = await manager.getRepository(ProjectEntity).save({
            id: projectId, tenantId: context.tenantId, portfolioId: input.portfolioId,
            ownerLegalEntityId: input.ownerLegalEntityId, customerCompanyId: input.customerCompanyId,
            projectManagerId: input.projectManagerId ?? null, code: input.code,
            name: input.name.trim(), type: input.type, phase: ProjectPhase.INITIATION,
            recordStatus: ProjectRecordStatus.DRAFT, contractModel: input.contractModel.trim(),
            currency: input.currency, plannedCod: input.plannedCod.slice(0, 10), forecastCod: null,
            idempotencyKey: null
          });
          const siteId = randomUUID();
          const site = await manager.getRepository(SiteEntity).save({
            id: siteId, tenantId: context.tenantId, projectId,
            code: input.primarySite.code, name: input.primarySite.name.trim(),
            location: input.primarySite.location?.trim() || null,
            timezone: input.primarySite.timezone.trim(), isPrimary: true,
            status: MasterRecordStatus.ACTIVE, idempotencyKey: null
          });
          await this.recordMutation(manager, context, {
            action: 'PROJECT_CREATED', objectType: 'Project', objectId: projectId,
            aggregateVersion: project.versionNo,
            payload: { code: input.code, portfolioId: input.portfolioId, primarySiteId: siteId }
          });
          return {
            ...this.projectView(project), sites: [this.siteView(site)], parties: []
          };
        },
        resultReference: (result) => ({ resourceType: 'Project', resourceId: result.id, responseStatus: 202 })
      });
    } catch (error) {
      this.rethrowDatabaseConflict(error, 'PROJECT_DUPLICATE', 'Mã Project, Site hoặc idempotency key đã tồn tại');
    }
  }

  async getProject(context: RequestContext, projectId: string) {
    const project = await this.projects.findOne({
      where: { id: projectId, tenantId: context.tenantId }, relations: { sites: true }
    });
    if (!project) throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    const parties = await this.projectParties.find({
      where: { tenantId: context.tenantId, projectId }, order: { effectiveFrom: 'DESC' }
    });
    return {
      ...this.projectView(project),
      sites: project.sites.map((site) => this.siteView(site)),
      parties: parties.map((party) => this.projectPartyView(party))
    };
  }

  async updateProject(
    context: RequestContext, projectId: string, input: UpdateProjectDto,
    expectedVersion: number, idempotencyKey: string
  ) {
    return this.commands.execute({
      context,
      operation: `project.update:${projectId}`,
      idempotencyKey,
      request: { projectId, input, expectedVersion },
      execute: async (manager) => {
        const projects = manager.getRepository(ProjectEntity);
        const current = await this.requireTenantEntity(
          projects, context.tenantId, projectId, 'PROJECT_NOT_FOUND', 'Không tìm thấy dự án'
        );
        if (current.versionNo !== expectedVersion) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT', message: 'Dự án đã được cập nhật bởi người khác', retryable: true,
            currentVersion: current.versionNo
          });
        }
        const changes = Object.entries(input)
          .filter(([key, value]) => key !== 'reason' && value !== undefined);
        if (changes.length === 0) {
          throw new BadRequestException({
            code: 'PROJECT_NO_CHANGES', message: 'Không có dữ liệu cần cập nhật', retryable: false
          });
        }
        this.validatePhaseChange(current, input);
        await Promise.all([
          input.portfolioId
            ? this.requirePortfolio(context.tenantId, input.portfolioId, manager.getRepository(PortfolioEntity))
            : Promise.resolve(),
          input.ownerLegalEntityId
            ? this.requireLegalEntity(
              context.tenantId, input.ownerLegalEntityId, manager.getRepository(LegalEntityEntity)
            ) : Promise.resolve(),
          input.customerCompanyId
            ? this.requireCompany(
              context.tenantId, input.customerCompanyId, manager.getRepository(CompanyEntity)
            ) : Promise.resolve(),
          input.projectManagerId
            ? this.requireUser(
              context.tenantId, input.projectManagerId, manager.getRepository(UserAccountEntity)
            ) : Promise.resolve()
        ]);
        const patch: Record<string, unknown> = {};
        for (const [key, value] of changes) {
          patch[key] = typeof value === 'string' ? value.trim() : value;
        }
        if (typeof patch.plannedCod === 'string') patch.plannedCod = patch.plannedCod.slice(0, 10);
        if (typeof patch.forecastCod === 'string') patch.forecastCod = patch.forecastCod.slice(0, 10);
        const update = await projects.createQueryBuilder().update(ProjectEntity)
          .set({ ...patch, versionNo: () => '"version_no" + 1' })
          .where('id = :projectId AND tenant_id = :tenantId AND version_no = :expectedVersion', {
            projectId, tenantId: context.tenantId, expectedVersion
          }).execute();
        if (update.affected !== 1) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT', message: 'Dự án đã được cập nhật bởi người khác', retryable: true
          });
        }
        const updated = await projects.findOneByOrFail({ id: projectId, tenantId: context.tenantId });
        await this.recordMutation(manager, context, {
          action: 'PROJECT_UPDATED', objectType: 'Project', objectId: projectId,
          aggregateVersion: updated.versionNo,
          payload: {
            reason: input.reason, changedFields: changes.map(([key]) => key), fromVersion: expectedVersion
          }
        });
        const [sites, parties] = await Promise.all([
          manager.getRepository(SiteEntity).find({
            where: { tenantId: context.tenantId, projectId },
            order: { isPrimary: 'DESC', name: 'ASC' }
          }),
          manager.getRepository(ProjectPartyEntity).find({
            where: { tenantId: context.tenantId, projectId }, order: { effectiveFrom: 'DESC' }
          })
        ]);
        return {
          ...this.projectView(updated), sites: sites.map((site) => this.siteView(site)),
          parties: parties.map((party) => this.projectPartyView(party))
        };
      },
      resultReference: (result) => ({ resourceType: 'Project', resourceId: result.id, responseStatus: 202 })
    });
  }

  async listSites(context: RequestContext, projectId: string) {
    await this.requireProject(context.tenantId, projectId);
    const rows = await this.sites.find({
      where: { tenantId: context.tenantId, projectId }, order: { isPrimary: 'DESC', name: 'ASC' }
    });
    return rows.map((row) => this.siteView(row));
  }

  async createSite(
    context: RequestContext, projectId: string, input: CreateSiteDto, idempotencyKey: string
  ) {
    try {
      return await this.commands.execute({
        context,
        operation: `site.create:${projectId}`,
        idempotencyKey,
        request: { projectId, input },
        execute: async (manager) => {
          await this.requireTenantEntity(
            manager.getRepository(ProjectEntity), context.tenantId, projectId,
            'PROJECT_NOT_FOUND', 'Không tìm thấy dự án'
          );
          const row = await manager.getRepository(SiteEntity).save({
            id: randomUUID(), tenantId: context.tenantId, projectId, code: input.code,
            name: input.name.trim(), location: input.location?.trim() || null,
            timezone: input.timezone.trim(), isPrimary: input.isPrimary ?? false,
            status: MasterRecordStatus.ACTIVE, idempotencyKey: null
          });
          await this.recordMutation(manager, context, {
            action: 'SITE_CREATED', objectType: 'Site', objectId: row.id,
            aggregateVersion: 1, payload: { projectId, code: row.code }
          });
          return this.siteView(row);
        },
        resultReference: (result) => ({ resourceType: 'Site', resourceId: result.id, responseStatus: 202 })
      });
    } catch (error) {
      this.rethrowDatabaseConflict(error, 'SITE_DUPLICATE', 'Mã Site, Site chính hoặc idempotency key đã tồn tại');
    }
  }

  async upsertProjectParty(
    context: RequestContext, projectId: string, partyId: string,
    input: UpsertProjectPartyDto, expectedVersion: number, idempotencyKey: string
  ) {
    return this.commands.execute({
      context,
      operation: `project-party.upsert:${projectId}:${partyId}`,
      idempotencyKey,
      request: { projectId, partyId, input, expectedVersion },
      execute: async (manager) => {
        await this.requireTenantEntity(
          manager.getRepository(ProjectEntity), context.tenantId, projectId,
          'PROJECT_NOT_FOUND', 'Không tìm thấy dự án'
        );
        const [company, legalEntity] = await Promise.all([
          this.requireCompany(context.tenantId, input.companyId, manager.getRepository(CompanyEntity)),
          input.legalEntityId
            ? this.requireLegalEntity(
              context.tenantId, input.legalEntityId, manager.getRepository(LegalEntityEntity)
            ) : Promise.resolve(null)
        ]);
        if (legalEntity && legalEntity.companyId !== company.id) {
          throw new BadRequestException({
            code: 'LEGAL_ENTITY_COMPANY_MISMATCH',
            message: 'Pháp nhân không thuộc Company đã chọn', retryable: false
          });
        }
        if (input.effectiveTo && input.effectiveTo.slice(0, 10) < input.effectiveFrom.slice(0, 10)) {
          throw new BadRequestException({
            code: 'INVALID_EFFECTIVE_PERIOD', message: 'Ngày kết thúc phải sau ngày bắt đầu'
          });
        }
        const repository = manager.getRepository(ProjectPartyEntity);
        const current = await repository.findOneBy({
          id: partyId, tenantId: context.tenantId, projectId
        });
        if ((!current && expectedVersion !== 0) || (current && current.versionNo !== expectedVersion)) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT', message: 'Project party version không hợp lệ',
            currentVersion: current?.versionNo ?? 0
          });
        }
        const values = {
          companyId: input.companyId, legalEntityId: input.legalEntityId ?? null,
          roleCode: input.roleCode, raci: input.raci,
          effectiveFrom: input.effectiveFrom.slice(0, 10),
          effectiveTo: input.effectiveTo?.slice(0, 10) ?? null,
          contactName: input.contactName?.trim() || null,
          contactEmail: input.contactEmail?.trim().toLowerCase() || null
        };
        let saved: ProjectPartyEntity;
        if (current) {
          const updated = await repository.createQueryBuilder().update(ProjectPartyEntity)
            .set({ ...values, versionNo: () => '"version_no" + 1' })
            .where(
              'id = :partyId AND tenant_id = :tenantId AND project_id = :projectId AND version_no = :expectedVersion',
              { partyId, tenantId: context.tenantId, projectId, expectedVersion }
            ).execute();
          if (updated.affected !== 1) {
            throw new ConflictException({
              code: 'VERSION_CONFLICT', message: 'Project party đã được cập nhật bởi người khác',
              retryable: true
            });
          }
          saved = await repository.findOneByOrFail({
            id: partyId, tenantId: context.tenantId, projectId
          });
        } else {
          try {
            saved = await repository.save({
              id: partyId, tenantId: context.tenantId, projectId, ...values
            });
          } catch (error) {
            if (this.isUniqueViolation(error)) {
              throw new ConflictException({
                code: 'VERSION_CONFLICT', message: 'Project party đã được tạo bởi yêu cầu khác',
                retryable: true
              });
            }
            throw error;
          }
        }
        await this.recordMutation(manager, context, {
          action: current ? 'PROJECT_PARTY_UPDATED' : 'PROJECT_PARTY_CREATED',
          objectType: 'ProjectParty', objectId: partyId,
          aggregateVersion: saved.versionNo,
          payload: {
            projectId, companyId: input.companyId, legalEntityId: input.legalEntityId ?? null,
            roleCode: input.roleCode, reason: input.reason
          }
        });
        return this.projectPartyView(saved);
      },
      resultReference: (result) => ({
        resourceType: 'ProjectParty', resourceId: result.id, responseStatus: 202
      })
    });
  }

  private validatePhaseChange(current: ProjectEntity, input: UpdateProjectDto): void {
    if (!input.phase || input.phase === current.phase) return;
    const phases = Object.values(ProjectPhase);
    if (phases.indexOf(input.phase) !== phases.indexOf(current.phase) + 1) {
      throw new BadRequestException({
        code: 'INVALID_PHASE_TRANSITION', message: 'Project phase chỉ được chuyển tuần tự sang giai đoạn kế tiếp', retryable: false
      });
    }
    if (current.recordStatus !== ProjectRecordStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'PROJECT_NOT_ACTIVE', message: 'Chỉ dự án ACTIVE mới được chuyển phase', retryable: false
      });
    }
  }

  private requireCompany(tenantId: string, id: string, repository = this.companies) {
    return this.requireTenantEntity(repository, tenantId, id, 'COMPANY_NOT_FOUND', 'Không tìm thấy Company');
  }

  private requireLegalEntity(tenantId: string, id: string, repository = this.legalEntities) {
    return this.requireTenantEntity(repository, tenantId, id, 'LEGAL_ENTITY_NOT_FOUND', 'Không tìm thấy pháp nhân');
  }

  private requirePortfolio(tenantId: string, id: string, repository = this.portfolios) {
    return this.requireTenantEntity(repository, tenantId, id, 'PORTFOLIO_NOT_FOUND', 'Không tìm thấy Portfolio');
  }

  private requireUser(tenantId: string, id: string, repository = this.users) {
    return this.requireTenantEntity(repository, tenantId, id, 'USER_NOT_FOUND', 'Không tìm thấy Project Manager');
  }

  private requireProject(tenantId: string, id: string) {
    return this.requireTenantEntity(this.projects, tenantId, id, 'PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
  }

  private async requireTenantEntity<T extends { id: string; tenantId: string }>(
    repository: Repository<T>, tenantId: string, id: string, code: string, message: string
  ): Promise<T> {
    const row = await repository.findOneBy({ id, tenantId } as never);
    if (!row) throw this.notFound(code, message);
    return row;
  }

  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message, retryable: false });
  }

  private rethrowDatabaseConflict(error: unknown, code: string, message: string): never {
    if (this.isUniqueViolation(error)) {
      throw new ConflictException({ code, message, retryable: false });
    }
    throw error;
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private async recordMutation(
    manager: EntityManager,
    context: RequestContext,
    event: {
      action: string;
      objectType: string;
      objectId: string;
      aggregateVersion: number;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await manager.getRepository(AuditEventEntity).save({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: event.action, result: 'SUCCESS', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: event.objectType, objectId: event.objectId, payload: event.payload
    });
    await this.outbox.append(manager, context, {
      aggregateType: event.objectType,
      aggregateId: event.objectId,
      aggregateVersion: event.aggregateVersion,
      eventType: event.action,
      payload: event.payload
    });
  }

  private companyView(row: CompanyEntity) {
    return { id: row.id, code: row.code, name: row.name, organizationType: row.organizationType, status: row.status };
  }

  private legalEntityView(row: LegalEntityEntity) {
    return {
      id: row.id, companyId: row.companyId, legalName: row.legalName, country: row.country,
      registrationNo: row.registrationNo, taxId: row.taxId, status: row.status
    };
  }

  private portfolioView(row: PortfolioEntity) {
    return { id: row.id, code: row.code, name: row.name, status: row.status };
  }

  private projectView(row: ProjectEntity) {
    return {
      id: row.id, code: row.code, name: row.name, type: row.type, phase: row.phase,
      recordStatus: row.recordStatus, portfolioId: row.portfolioId,
      ownerLegalEntityId: row.ownerLegalEntityId, customerCompanyId: row.customerCompanyId,
      projectManagerId: row.projectManagerId, contractModel: row.contractModel,
      currency: row.currency, plannedCod: row.plannedCod, forecastCod: row.forecastCod,
      versionNo: row.versionNo, createdAt: row.createdAt, updatedAt: row.updatedAt
    };
  }

  private siteView(row: SiteEntity) {
    return {
      id: row.id, projectId: row.projectId, code: row.code, name: row.name,
      location: row.location, timezone: row.timezone, isPrimary: row.isPrimary, status: row.status
    };
  }

  private projectPartyView(row: ProjectPartyEntity) {
    return {
      id: row.id, projectId: row.projectId, companyId: row.companyId,
      legalEntityId: row.legalEntityId, roleCode: row.roleCode, raci: row.raci,
      effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
      contactName: row.contactName, contactEmail: row.contactEmail, versionNo: row.versionNo
    };
  }
}
