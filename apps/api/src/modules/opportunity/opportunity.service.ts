import {
  ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  AuditEventEntity, CompanyEntity, InvestmentScenarioEntity, InvestmentScenarioStatus,
  LegalEntityEntity, MasterRecordStatus, OpportunityEntity, OpportunityStage, PortfolioEntity,
  ProjectEntity, ProjectPhase, ProjectRecordStatus, SiteEntity, SurveyDataQuality,
  SurveyPackageEntity, UserAccountEntity
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeOpportunityCursor, encodeOpportunityCursor } from './domain/cursor';
import { computeDuplicateKey } from './domain/duplicate-key';
import { SCENARIO_EFFECTIVE_STATUS_SQL } from './domain/scenario-projection';
import {
  SCENARIO_CREATABLE_STAGES, SUBMIT_ELIGIBLE_STAGES, canMoveStage
} from './domain/stage-transitions';
import type {
  ConvertOpportunityDto, CreateInvestmentScenarioDto, CreateOpportunityDto,
  CreateSurveyPackageDto, OpportunityListQueryDto, SubmitInvestmentScenarioDto,
  UpdateOpportunityDto
} from './dto/opportunity.dto';

export interface RequestContext extends AuthContext { correlationId: string }

/** One raw row of the API-028 scenario embed: stored columns plus the projected status. */
interface ScenarioProjectionRecord {
  id: string;
  opportunityId: string;
  scenarioType: string;
  version: number;
  status: string;
  storedStatus: string;
  currency: string;
  capexTotal: string | null;
  npv: string | null;
  irr: string | null;
  paybackMonths: number | null;
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
  formulaVersion: string;
  workflowInstanceId: string | null;
  workflowInstanceState: string | null;
  submittedBy: string | null;
  submittedAt: Date | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * US-025 Opportunity pipeline (API-026…API-033, WF-002).
 *
 * The three rules the module is built around:
 * - MONEY/QUANTITY NEVER TOUCHES JS: capacity, capex, NPV and IRR cross this service as strings
 *   into Postgres `numeric`. The server computes NO financial figures (recorded decision): DB-016
 *   stores client-supplied evidence verbatim with its `formula_version` — no approved formula
 *   catalog exists and AGENTS.md forbids inventing one.
 * - Out of ABAC scope is indistinguishable from missing: 404, never 403. Opportunities are
 *   PRE-PROJECT, tenant-level records, so reach is deliberately narrower than everywhere else:
 *   only a tenant-scoped assignment holding the permission reaches them; project-, portfolio- and
 *   package-scoped assignments grant nothing here because there is no project to match
 *   (recorded decision, mirroring contract-cost's package narrowing).
 * - ENGINE BRIDGE HONEST STOP: DB-071 `workflow_instances.project_id` is NOT NULL (with an FK to
 *   projects) and `WorkflowTarget.projectId` is non-nullable, so the engine cannot host an
 *   instance for a pre-project scenario. API-032 therefore records submission on the aggregate
 *   itself (status SUBMITTED + submitted_by/at SoD fields) and leaves `workflow_instance_id`
 *   NULL; approve/reject stay deferred to the engine. The API-028 projection and the widened
 *   object-type CHECK are already in place for the day the engine accepts pre-project targets.
 *   Consequence: stage APPROVED is unreachable through the API in V1, so API-033 convert is
 *   exercised against decision states recorded outside the API surface.
 */
@Injectable()
export class OpportunityService {
  constructor(
    @InjectRepository(OpportunityEntity)
    private readonly opportunities: Repository<OpportunityEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-026 — the tenant pipeline, filterable by stage and customer, keyset-paged. */
  async listOpportunities(context: RequestContext, query: OpportunityListQueryDto) {
    const scope = await this.permissions.accessScopeSets(context, 'opportunity.read');
    if (!this.reachable(scope)) {
      return { items: [], meta: { limit: query.limit, nextCursor: null } };
    }
    const cursor = decodeOpportunityCursor(query.cursor);
    const builder = this.opportunities.createQueryBuilder('opportunity')
      .where('opportunity.tenantId = :tenantId', { tenantId: context.tenantId });
    if (query.stage) builder.andWhere('opportunity.stage = :stage', { stage: query.stage });
    if (query.customerCompanyId) {
      builder.andWhere('opportunity.customerCompanyId = :customerCompanyId', {
        customerCompanyId: query.customerCompanyId
      });
    }
    if (cursor) this.applyCursor(builder, 'opportunity', cursor, 'opportunities', context.tenantId);
    const rows = await builder
      .orderBy('opportunity.createdAt', 'DESC').addOrderBy('opportunity.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => this.opportunityView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-027 — create a LEAD with server-computed duplicate control. */
  async createOpportunity(
    context: RequestContext, input: CreateOpportunityDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'opportunity.create');
    return this.commands.execute({
      context, operation: 'API-027:create-opportunity', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'Opportunity',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Opportunity', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        this.assertReach(scope);
        await this.assertCustomerCompany(manager, context, input.customerCompanyId ?? null);
        const ownerId = input.ownerId ?? context.userId;
        await this.assertOwner(manager, context, ownerId);

        const row = manager.getRepository(OpportunityEntity).create({
          id: randomUUID(), tenantId: context.tenantId, code: input.code,
          customerCompanyId: input.customerCompanyId ?? null, name: input.name.trim(),
          stage: OpportunityStage.LEAD, siteId: input.siteId ?? null,
          locationText: input.locationText?.trim() || null,
          expectedCapacityKwp: input.expectedCapacityKwp ?? null,
          duplicateKey: computeDuplicateKey(
            input.customerCompanyId ?? null, input.locationText ?? null
          ),
          ownerId, convertedProjectId: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(OpportunityEntity).save(row),
          {
            uq_opportunity_code: () => this.conflict(
              'OPPORTUNITY_CODE_CONFLICT', 'Mã opportunity đã tồn tại trong tenant'
            ),
            uq_opportunity_duplicate_key: () => this.conflict(
              'DUPLICATE_OPPORTUNITY',
              'Đã có opportunity cùng khách hàng và địa điểm (duplicate check)'
            )
          }
        );
        const saved = await manager.getRepository(OpportunityEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Opportunity', saved.id, saved.versionNo,
          'Opportunity.Created', {
            code: saved.code, stage: saved.stage, customerCompanyId: saved.customerCompanyId,
            ownerId: saved.ownerId, duplicateKey: saved.duplicateKey,
            summary: `Opportunity ${saved.code} created as LEAD`
          });
        return this.opportunityView(saved);
      }
    });
  }

  /** API-028 — detail with survey revisions and the scenario status projection (single join). */
  async getOpportunity(context: RequestContext, opportunityId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'opportunity.read');
    const opportunity = await this.loadOpportunity(
      this.opportunities.manager, context, opportunityId, scope
    );
    const surveys = await this.opportunities.manager.getRepository(SurveyPackageEntity).find({
      where: { tenantId: context.tenantId, opportunityId: opportunity.id },
      order: { revision: 'ASC' }
    });
    const scenarios = await this.loadScenarioProjections(
      this.opportunities.manager, context, opportunity.id
    );
    return {
      data: this.opportunityView(opportunity),
      surveys: surveys.map((row) => this.surveyView(row)),
      scenarios: scenarios.map((row) => this.scenarioProjectionView(row))
    };
  }

  /** API-029 — optimistic-concurrency PATCH; stage moves only along legal adjacent edges. */
  async updateOpportunity(
    context: RequestContext, opportunityId: string,
    input: UpdateOpportunityDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'opportunity.update');
    return this.commands.execute({
      context, operation: 'API-029:update-opportunity', idempotencyKey,
      request: { opportunityId, input }, responseStatus: 200,
      resourceType: 'Opportunity', resourceId: opportunityId,
      execute: async (manager) => {
        const opportunity = await this.lockOpportunity(manager, context, opportunityId, scope);
        this.assertVersion(opportunity.versionNo, input.expectedVersion);
        if (input.stage !== undefined && input.stage !== opportunity.stage
          && !canMoveStage(opportunity.stage, input.stage)) {
          throw this.unprocessable(
            'INVALID_STAGE_TRANSITION',
            `Không thể chuyển stage ${opportunity.stage} → ${input.stage} trực tiếp`
          );
        }
        if (input.customerCompanyId !== undefined) {
          await this.assertCustomerCompany(manager, context, input.customerCompanyId);
        }
        if (input.ownerId !== undefined) {
          await this.assertOwner(manager, context, input.ownerId);
        }

        const customerCompanyId = input.customerCompanyId ?? opportunity.customerCompanyId;
        const locationText = input.locationText !== undefined
          ? input.locationText.trim() || null : opportunity.locationText;
        await this.withConstraintMap(
          () => manager.getRepository(OpportunityEntity).update(
            { id: opportunity.id, tenantId: context.tenantId },
            {
              name: input.name?.trim() ?? opportunity.name,
              stage: input.stage ?? opportunity.stage,
              ownerId: input.ownerId ?? opportunity.ownerId,
              customerCompanyId, locationText,
              siteId: input.siteId ?? opportunity.siteId,
              expectedCapacityKwp: input.expectedCapacityKwp ?? opportunity.expectedCapacityKwp,
              // The duplicate identity follows the customer/location facts, in-transaction.
              duplicateKey: computeDuplicateKey(customerCompanyId, locationText),
              updatedBy: context.userId, versionNo: opportunity.versionNo + 1
            }
          ),
          {
            uq_opportunity_duplicate_key: () => this.conflict(
              'DUPLICATE_OPPORTUNITY',
              'Đã có opportunity cùng khách hàng và địa điểm (duplicate check)'
            )
          }
        );
        const updated = await manager.getRepository(OpportunityEntity)
          .findOneByOrFail({ id: opportunity.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Opportunity', updated.id, updated.versionNo,
          'Opportunity.Updated', {
            code: updated.code, fromStage: opportunity.stage, stage: updated.stage,
            ownerId: updated.ownerId,
            summary: `Opportunity ${updated.code} updated (${opportunity.stage} → ${updated.stage})`
          });
        return this.opportunityView(updated);
      }
    });
  }

  /** API-030 — survey revision `max + 1` in-transaction; QUALIFIED advances to SURVEYED. */
  async createSurveyPackage(
    context: RequestContext, opportunityId: string,
    input: CreateSurveyPackageDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'survey.create');
    return this.commands.execute({
      context, operation: 'API-030:create-survey-package', idempotencyKey,
      request: { opportunityId, input }, responseStatus: 201, resourceType: 'SurveyPackage',
      resultReference: (result: { id: string }) => ({
        resourceType: 'SurveyPackage', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const opportunity = await this.lockOpportunity(manager, context, opportunityId, scope);
        if (opportunity.stage === OpportunityStage.CONVERTED) {
          throw this.unprocessable(
            'INVALID_STAGE_TRANSITION', 'Opportunity đã CONVERTED không nhận khảo sát mới'
          );
        }
        // The parent row lock serializes allocation; the unique constraint is the backstop.
        const [next] = await manager.query<Array<{ next: number }>>(
          `SELECT (COALESCE(MAX(revision), 0) + 1)::int AS "next"
          FROM survey_packages WHERE tenant_id = $1 AND opportunity_id = $2`,
          [context.tenantId, opportunity.id]
        );
        const row = manager.getRepository(SurveyPackageEntity).create({
          id: randomUUID(), tenantId: context.tenantId, opportunityId: opportunity.id,
          revision: next.next, dataQuality: input.dataQuality ?? SurveyDataQuality.RAW,
          documentRefs: input.documentRefs ?? [], notes: input.notes?.trim() || null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.rethrowUnique(
          () => manager.getRepository(SurveyPackageEntity).save(row),
          'SURVEY_REVISION_CONFLICT', 'Revision khảo sát vừa được cấp bởi yêu cầu khác; hãy thử lại'
        );
        const saved = await manager.getRepository(SurveyPackageEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });

        const advanced = opportunity.stage === OpportunityStage.QUALIFIED;
        if (advanced) {
          await this.moveStage(manager, context, opportunity, OpportunityStage.SURVEYED);
        }
        await this.emit(manager, context, 'SurveyPackage', saved.id, saved.versionNo,
          'SurveyPackage.Created', {
            opportunityId: opportunity.id, revision: saved.revision,
            dataQuality: saved.dataQuality, documentCount: saved.documentRefs.length,
            stageAdvanced: advanced,
            summary: `Survey package rev ${saved.revision} recorded`
          });
        return { ...this.surveyView(saved), opportunityStage: advanced
          ? OpportunityStage.SURVEYED : opportunity.stage };
      }
    });
  }

  /** API-031 — scenario version `max + 1` per type; requires stage >= SURVEYED. */
  async createInvestmentScenario(
    context: RequestContext, opportunityId: string,
    input: CreateInvestmentScenarioDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'scenario.create');
    return this.commands.execute({
      context, operation: 'API-031:create-investment-scenario', idempotencyKey,
      request: { opportunityId, input }, responseStatus: 201, resourceType: 'InvestmentScenario',
      resultReference: (result: { id: string }) => ({
        resourceType: 'InvestmentScenario', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const opportunity = await this.lockOpportunity(manager, context, opportunityId, scope);
        if (!SCENARIO_CREATABLE_STAGES.includes(opportunity.stage)) {
          throw this.unprocessable(
            'INVALID_STAGE_TRANSITION',
            'Chỉ opportunity đã SURVEYED (hoặc SCENARIO_READY/RETURNED) mới nhận scenario'
          );
        }
        const [next] = await manager.query<Array<{ next: number }>>(
          `SELECT (COALESCE(MAX(version), 0) + 1)::int AS "next"
          FROM investment_scenarios
          WHERE tenant_id = $1 AND opportunity_id = $2 AND scenario_type = $3`,
          [context.tenantId, opportunity.id, input.scenarioType]
        );
        const row = manager.getRepository(InvestmentScenarioEntity).create({
          id: randomUUID(), tenantId: context.tenantId, opportunityId: opportunity.id,
          scenarioType: input.scenarioType, version: next.next,
          status: InvestmentScenarioStatus.DRAFT, currency: input.currency,
          capexTotal: input.capexTotal ?? null, npv: input.npv ?? null, irr: input.irr ?? null,
          paybackMonths: input.paybackMonths ?? null,
          inputSnapshot: input.inputSnapshot, outputSnapshot: input.outputSnapshot ?? {},
          formulaVersion: input.formulaVersion, workflowInstanceId: null,
          submittedBy: null, submittedAt: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.rethrowUnique(
          () => manager.getRepository(InvestmentScenarioEntity).save(row),
          'SCENARIO_VERSION_CONFLICT', 'Version scenario vừa được cấp bởi yêu cầu khác; hãy thử lại'
        );
        const saved = await manager.getRepository(InvestmentScenarioEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });

        const advanced = opportunity.stage !== OpportunityStage.SCENARIO_READY;
        if (advanced) {
          await this.moveStage(manager, context, opportunity, OpportunityStage.SCENARIO_READY);
        }
        await this.emit(manager, context, 'InvestmentScenario', saved.id, saved.versionNo,
          'InvestmentScenario.Created', {
            opportunityId: opportunity.id, scenarioType: saved.scenarioType,
            version: saved.version, currency: saved.currency,
            formulaVersion: saved.formulaVersion, stageAdvanced: advanced,
            summary: `Scenario ${saved.scenarioType} v${saved.version} recorded`
          });
        return { ...this.scenarioView(saved), opportunityStage: OpportunityStage.SCENARIO_READY };
      }
    });
  }

  /**
   * API-032 — submit a scenario for decision.
   *
   * ENGINE PATH NOT TAKEN (recorded honest stop): `workflow_instances.project_id` is NOT NULL and
   * FK-bound to projects, and `WorkflowTarget.projectId` is a non-nullable string — the DB-071
   * engine structurally cannot host a pre-project target, so no InvestmentScenario resolver is
   * registered and no instance is started. Submission is recorded on the aggregate itself:
   * status → SUBMITTED with the SoD pair submitted_by/submitted_at; the opportunity moves to
   * SUBMITTED. Approve/reject remain deferred to the engine's maker-checker.
   */
  async submitInvestmentScenario(
    context: RequestContext, scenarioId: string,
    input: SubmitInvestmentScenarioDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'scenario.submit');
    return this.commands.execute({
      context, operation: 'API-032:submit-investment-scenario', idempotencyKey,
      request: { scenarioId, input }, responseStatus: 200,
      resourceType: 'InvestmentScenario', resourceId: scenarioId,
      execute: async (manager) => {
        const scenario = await this.lockScenario(manager, context, scenarioId, scope);
        const opportunity = await this.lockOpportunity(
          manager, context, scenario.opportunityId, scope
        );
        if (scenario.status !== InvestmentScenarioStatus.DRAFT
          && scenario.status !== InvestmentScenarioStatus.RETURNED) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ scenario DRAFT hoặc RETURNED mới được submit'
          );
        }
        this.assertVersion(scenario.versionNo, input.expectedVersion);
        if (!SUBMIT_ELIGIBLE_STAGES.includes(opportunity.stage)) {
          throw this.unprocessable(
            'INVALID_STAGE_TRANSITION',
            'Opportunity phải ở SCENARIO_READY hoặc RETURNED mới submit được scenario'
          );
        }

        await manager.getRepository(InvestmentScenarioEntity).update(
          { id: scenario.id, tenantId: context.tenantId },
          {
            status: InvestmentScenarioStatus.SUBMITTED,
            submittedBy: context.userId, submittedAt: new Date(),
            updatedBy: context.userId, versionNo: scenario.versionNo + 1
          }
        );
        await this.moveStage(manager, context, opportunity, OpportunityStage.SUBMITTED);
        const updated = await manager.getRepository(InvestmentScenarioEntity)
          .findOneByOrFail({ id: scenario.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'InvestmentScenario', updated.id, updated.versionNo,
          'InvestmentScenario.Submitted', {
            opportunityId: opportunity.id, scenarioType: updated.scenarioType,
            version: updated.version, submittedBy: updated.submittedBy,
            comment: input.comment ?? null, workflowInstanceId: null,
            summary: `Scenario ${updated.scenarioType} v${updated.version} submitted`
          });
        return { ...this.scenarioView(updated), opportunityStage: OpportunityStage.SUBMITTED };
      }
    });
  }

  /**
   * API-033 — convert an approved opportunity into a project.
   *
   * The project is created THROUGH THE SAME INSERT INVARIANTS as project-master (API-011): master
   * refs validated in-tenant, project born INITIATION/DRAFT with a mandatory primary site, the
   * same trims/defaults, and the same PROJECT_CREATED audit/outbox event.
   * `ProjectManagementService.createProject` could not be injected (recorded why): its module
   * exports nothing, and the method opens its own CommandReceipt transaction — nesting it would
   * consume a second idempotency receipt and split convert across two transactions, losing the
   * atomicity between the project insert and the opportunity flip.
   *
   * Replay idempotency is anchored on the DB-010 partial unique `uq_project_source_opportunity`:
   * the row lock on the opportunity serializes racers, a repeat call returns the existing project
   * (`alreadyConverted: true` — the documented 200-equivalent semantics inside the 201 envelope),
   * and the constraint remains the structural backstop should anything bypass the lock.
   */
  async convertOpportunity(
    context: RequestContext, opportunityId: string,
    input: ConvertOpportunityDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'opportunity.convert');
    return this.commands.execute({
      context, operation: 'API-033:convert-opportunity', idempotencyKey,
      request: { opportunityId, input }, responseStatus: 201, resourceType: 'Project',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Project', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const opportunity = await this.lockOpportunity(manager, context, opportunityId, scope);
        if (opportunity.convertedProjectId !== null) {
          return this.convertedView(manager, context, opportunity);
        }
        await this.assertConvertEligible(manager, context, opportunity);

        const customerCompanyId = opportunity.customerCompanyId ?? input.customerCompanyId ?? null;
        if (customerCompanyId === null) {
          throw this.unprocessable(
            'CUSTOMER_COMPANY_REQUIRED',
            'Opportunity chưa có khách hàng; cần customerCompanyId để tạo dự án'
          );
        }
        if (opportunity.customerCompanyId !== null && input.customerCompanyId !== undefined
          && input.customerCompanyId !== opportunity.customerCompanyId) {
          throw this.unprocessable(
            'CUSTOMER_COMPANY_MISMATCH', 'Khách hàng của dự án phải đúng khách hàng của opportunity'
          );
        }
        await this.assertMasterRef(manager, context, PortfolioEntity,
          input.portfolioId, 'PORTFOLIO_NOT_FOUND', 'Không tìm thấy Portfolio');
        await this.assertMasterRef(manager, context, LegalEntityEntity,
          input.ownerLegalEntityId, 'LEGAL_ENTITY_NOT_FOUND', 'Không tìm thấy pháp nhân');
        await this.assertMasterRef(manager, context, CompanyEntity,
          customerCompanyId, 'COMPANY_NOT_FOUND', 'Không tìm thấy Company');
        if (input.projectManagerId) {
          await this.assertMasterRef(manager, context, UserAccountEntity,
            input.projectManagerId, 'USER_NOT_FOUND', 'Không tìm thấy Project Manager');
        }

        // Same insert invariants as project-master: INITIATION/DRAFT, trimmed fields, forecast
        // NULL, no register idempotency key — plus the DB-010 source_opportunity_id anchor.
        const projectId = randomUUID();
        const project = await this.withConstraintMap(
          () => manager.getRepository(ProjectEntity).save({
            id: projectId, tenantId: context.tenantId, portfolioId: input.portfolioId,
            ownerLegalEntityId: input.ownerLegalEntityId, customerCompanyId,
            projectManagerId: input.projectManagerId ?? null,
            code: input.projectCode ?? opportunity.code,
            name: (input.projectName ?? opportunity.name).trim().slice(0, 250),
            type: input.projectType, phase: ProjectPhase.INITIATION,
            recordStatus: ProjectRecordStatus.DRAFT,
            contractModel: input.contractModel.trim(), currency: input.currency,
            plannedCod: input.plannedCod.slice(0, 10), forecastCod: null,
            sourceOpportunityId: opportunity.id, idempotencyKey: null
          }),
          {
            uq_project_tenant_code: () => this.conflict(
              'PROJECT_CODE_CONFLICT', 'Mã Project đã tồn tại trong tenant'
            ),
            // Backstop only: the opportunity row lock serializes converts, so a racer normally
            // lands in the alreadyConverted read above instead of here.
            uq_project_source_opportunity: () => new ConflictException({
              code: 'OPPORTUNITY_ALREADY_CONVERTED',
              message: 'Opportunity vừa được chuyển đổi bởi yêu cầu khác; gọi lại để nhận dự án',
              retryable: true
            })
          }
        );
        const site = await this.rethrowUnique(
          () => manager.getRepository(SiteEntity).save({
            id: randomUUID(), tenantId: context.tenantId, projectId,
            code: input.primarySite.code, name: input.primarySite.name.trim(),
            location: input.primarySite.location?.trim() || null,
            timezone: input.primarySite.timezone.trim(), isPrimary: true,
            status: MasterRecordStatus.ACTIVE, idempotencyKey: null
          }),
          'SITE_DUPLICATE', 'Mã Site hoặc Site chính đã tồn tại'
        );
        await manager.getRepository(OpportunityEntity).update(
          { id: opportunity.id, tenantId: context.tenantId },
          {
            stage: OpportunityStage.CONVERTED, convertedProjectId: projectId,
            updatedBy: context.userId, versionNo: opportunity.versionNo + 1
          }
        );
        // Event parity with project-master's creation path, then the lineage event.
        await this.emit(manager, context, 'Project', projectId, project.versionNo,
          'PROJECT_CREATED', {
            code: project.code, portfolioId: project.portfolioId, primarySiteId: site.id,
            sourceOpportunityId: opportunity.id,
            summary: `Project ${project.code} created from opportunity ${opportunity.code}`
          });
        await this.emit(manager, context, 'Opportunity', opportunity.id,
          opportunity.versionNo + 1, 'Opportunity.Converted', {
            code: opportunity.code, convertedProjectId: projectId,
            summary: `Opportunity ${opportunity.code} converted`
          });
        return {
          ...this.projectView(project), sites: [this.siteView(site)],
          opportunityId: opportunity.id, alreadyConverted: false
        };
      }
    });
  }

  /** The documented 200-equivalent replay body: the project this opportunity already became. */
  private async convertedView(
    manager: EntityManager, context: RequestContext, opportunity: OpportunityEntity
  ) {
    const project = await manager.getRepository(ProjectEntity).findOneByOrFail({
      id: opportunity.convertedProjectId!, tenantId: context.tenantId
    });
    const sites = await manager.getRepository(SiteEntity).find({
      where: { tenantId: context.tenantId, projectId: project.id },
      order: { isPrimary: 'DESC', name: 'ASC' }
    });
    return {
      ...this.projectView(project), sites: sites.map((row) => this.siteView(row)),
      opportunityId: opportunity.id, alreadyConverted: true
    };
  }

  /** Convert requires stage APPROVED — or an APPROVED scenario under the read-time projection. */
  private async assertConvertEligible(
    manager: EntityManager, context: RequestContext, opportunity: OpportunityEntity
  ): Promise<void> {
    if (opportunity.stage === OpportunityStage.APPROVED) return;
    const [approved] = await manager.query<Array<{ approved: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM investment_scenarios scenario
        LEFT JOIN workflow_instances instance
          ON instance.tenant_id = scenario.tenant_id
          AND instance.id = scenario.workflow_instance_id
        WHERE scenario.tenant_id = $1 AND scenario.opportunity_id = $2
          AND (${SCENARIO_EFFECTIVE_STATUS_SQL}) = 'APPROVED'
      ) AS "approved"`,
      [context.tenantId, opportunity.id]
    );
    if (!approved.approved) {
      throw this.unprocessable(
        'INVALID_STAGE_TRANSITION',
        'Chỉ opportunity APPROVED (hoặc có scenario APPROVED) mới được chuyển thành dự án'
      );
    }
  }

  /** API-028/API-033 scenario rows with the projected status — one SQL join, no duplication. */
  private async loadScenarioProjections(
    manager: EntityManager, context: RequestContext, opportunityId: string
  ): Promise<ScenarioProjectionRecord[]> {
    return manager.query(
      `SELECT
        scenario.id AS "id",
        scenario.opportunity_id AS "opportunityId",
        scenario.scenario_type AS "scenarioType",
        scenario.version AS "version",
        ${SCENARIO_EFFECTIVE_STATUS_SQL} AS "status",
        scenario.status AS "storedStatus",
        scenario.currency AS "currency",
        scenario.capex_total::text AS "capexTotal",
        scenario.npv::text AS "npv",
        scenario.irr::text AS "irr",
        scenario.payback_months AS "paybackMonths",
        scenario.input_snapshot AS "inputSnapshot",
        scenario.output_snapshot AS "outputSnapshot",
        scenario.formula_version AS "formulaVersion",
        scenario.workflow_instance_id AS "workflowInstanceId",
        instance.state AS "workflowInstanceState",
        scenario.submitted_by AS "submittedBy",
        scenario.submitted_at AS "submittedAt",
        scenario.version_no AS "versionNo",
        scenario.created_by AS "createdBy",
        scenario.updated_by AS "updatedBy",
        scenario.created_at AS "createdAt",
        scenario.updated_at AS "updatedAt"
      FROM investment_scenarios scenario
      LEFT JOIN workflow_instances instance
        ON instance.tenant_id = scenario.tenant_id
        AND instance.id = scenario.workflow_instance_id
      WHERE scenario.tenant_id = $1 AND scenario.opportunity_id = $2
      ORDER BY scenario.scenario_type ASC, scenario.version ASC`,
      [context.tenantId, opportunityId]
    );
  }

  /** Stage bump under the already-held row lock; the caller emits the domain event. */
  private async moveStage(
    manager: EntityManager, context: RequestContext,
    opportunity: OpportunityEntity, stage: OpportunityStage
  ): Promise<void> {
    await manager.getRepository(OpportunityEntity).update(
      { id: opportunity.id, tenantId: context.tenantId },
      { stage, updatedBy: context.userId, versionNo: opportunity.versionNo + 1 }
    );
    await this.emit(manager, context, 'Opportunity', opportunity.id,
      opportunity.versionNo + 1, 'Opportunity.StageChanged', {
        code: opportunity.code, fromStage: opportunity.stage, stage,
        summary: `Opportunity ${opportunity.code} moved ${opportunity.stage} → ${stage}`
      });
  }

  private async lockOpportunity(
    manager: EntityManager, context: RequestContext, opportunityId: string, scope: AccessScopeSets
  ): Promise<OpportunityEntity> {
    const opportunity = await manager.getRepository(OpportunityEntity)
      .createQueryBuilder('opportunity')
      .setLock('pessimistic_write')
      .where('opportunity.id = :id AND opportunity.tenantId = :tenantId', {
        id: opportunityId, tenantId: context.tenantId
      })
      .getOne();
    return this.resolveOpportunity(opportunity, scope);
  }

  private async loadOpportunity(
    manager: EntityManager, context: RequestContext, opportunityId: string, scope: AccessScopeSets
  ): Promise<OpportunityEntity> {
    const opportunity = await manager.getRepository(OpportunityEntity).findOneBy({
      id: opportunityId, tenantId: context.tenantId
    });
    return this.resolveOpportunity(opportunity, scope);
  }

  /** Out of reach is indistinguishable from missing — an id cannot be probed cross-tenant. */
  private resolveOpportunity(
    opportunity: OpportunityEntity | null, scope: AccessScopeSets
  ): OpportunityEntity {
    if (!opportunity || !this.reachable(scope)) {
      throw this.notFound('OPPORTUNITY_NOT_FOUND', 'Không tìm thấy opportunity');
    }
    return opportunity;
  }

  private async lockScenario(
    manager: EntityManager, context: RequestContext, scenarioId: string, scope: AccessScopeSets
  ): Promise<InvestmentScenarioEntity> {
    const scenario = await manager.getRepository(InvestmentScenarioEntity)
      .createQueryBuilder('scenario')
      .setLock('pessimistic_write')
      .where('scenario.id = :id AND scenario.tenantId = :tenantId', {
        id: scenarioId, tenantId: context.tenantId
      })
      .getOne();
    if (!scenario || !this.reachable(scope)) {
      throw this.notFound('SCENARIO_NOT_FOUND', 'Không tìm thấy scenario');
    }
    return scenario;
  }

  /**
   * Pre-project reach (recorded decision): only a tenant-scoped assignment reaches opportunity
   * records. There is no project to match a project/portfolio/package assignment against, so
   * those grant nothing here — narrower than every project-scoped module, on purpose.
   */
  private reachable(scope: AccessScopeSets): boolean {
    return scope.tenantWide;
  }

  private assertReach(scope: AccessScopeSets): void {
    if (!this.reachable(scope)) {
      throw this.notFound('OPPORTUNITY_NOT_FOUND', 'Không tìm thấy opportunity');
    }
  }

  private async assertCustomerCompany(
    manager: EntityManager, context: RequestContext, companyId: string | null
  ): Promise<void> {
    if (companyId === null) return;
    const exists = await manager.getRepository(CompanyEntity).existsBy({
      id: companyId, tenantId: context.tenantId
    });
    if (!exists) {
      throw this.unprocessable('COMPANY_NOT_FOUND', 'Khách hàng không tồn tại trong tenant này');
    }
  }

  private async assertOwner(
    manager: EntityManager, context: RequestContext, ownerId: string
  ): Promise<void> {
    const exists = await manager.getRepository(UserAccountEntity).existsBy({
      id: ownerId, tenantId: context.tenantId
    });
    if (!exists) {
      throw this.unprocessable('OWNER_NOT_FOUND', 'Người phụ trách không thuộc tenant này');
    }
  }

  private async assertMasterRef<T extends { id: string; tenantId: string }>(
    manager: EntityManager, context: RequestContext,
    entity: new () => T, id: string, code: string, message: string
  ): Promise<void> {
    const exists = await manager.getRepository(entity).existsBy(
      { id, tenantId: context.tenantId } as never
    );
    if (!exists) throw this.unprocessable(code, message);
  }

  private assertVersion(currentVersion: number, expectedVersion: number): void {
    if (currentVersion !== expectedVersion) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
        retryable: false, currentVersion
      });
    }
  }

  /**
   * Keyset predicate compared row-wise against the cursor row's stored values.
   *
   * The naive form — `created_at < :cursorTime OR (created_at = :cursorTime AND id < :cursorId)` —
   * silently loses rows. Postgres keeps `timestamptz` at microsecond precision while a JS `Date`
   * (and so the ISO string inside the cursor) only carries milliseconds, so any row whose stored
   * timestamp has sub-millisecond digits matches neither branch and disappears from the next page.
   * A pipeline import that lands many leads under one `now()` puts a whole batch on a page
   * boundary. Reading the boundary straight out of `table` compares the real stored values, and
   * `(created_at, id) < (…)` stays a row-wise comparison the `(created_at DESC, id DESC)` ordering
   * index can drive.
   *
   * When the cursor row itself has gone the old millisecond comparison is used as a fallback — a
   * marginally conservative page beats failing a request that carries a stale cursor.
   */
  private applyCursor<T extends { createdAt: Date; id: string }>(
    builder: SelectQueryBuilder<T>, alias: string, cursor: { createdAt: string; id: string },
    table: string, tenantId: string
  ): void {
    builder.andWhere(new Brackets((where) => where
      .where(
        `(${alias}.createdAt, ${alias}.id) < (
           SELECT boundary.created_at, boundary.id FROM ${table} boundary
           WHERE boundary.id = :cursorId AND boundary.tenant_id = :cursorTenantId
         )`,
        { cursorId: cursor.id, cursorTenantId: tenantId }
      )
      .orWhere(new Brackets((fallback) => fallback
        .where(`NOT EXISTS (SELECT 1 FROM ${table} missing WHERE missing.id = :cursorId AND missing.tenant_id = :cursorTenantId)`)
        .andWhere(new Brackets((legacy) => legacy
          .where(`${alias}.createdAt < :cursorTime`, { cursorTime: cursor.createdAt })
          .orWhere(`${alias}.createdAt = :cursorTime AND ${alias}.id < :cursorId`, {
            cursorTime: cursor.createdAt, cursorId: cursor.id, cursorTenantId: tenantId
          })))))));
  }

  private pageMeta<T extends { createdAt: Date; id: string }>(
    rows: T[], page: T[], limit: number
  ) {
    const last = page.at(-1);
    return {
      limit,
      nextCursor: rows.length > limit && last
        ? encodeOpportunityCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    };
  }

  private opportunityView(row: OpportunityEntity) {
    return {
      id: row.id, code: row.code, name: row.name, stage: row.stage,
      customerCompanyId: row.customerCompanyId, siteId: row.siteId,
      locationText: row.locationText, expectedCapacityKwp: row.expectedCapacityKwp,
      duplicateKey: row.duplicateKey, ownerId: row.ownerId,
      convertedProjectId: row.convertedProjectId, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private surveyView(row: SurveyPackageEntity) {
    return {
      id: row.id, opportunityId: row.opportunityId, revision: row.revision,
      dataQuality: row.dataQuality, documentRefs: row.documentRefs, notes: row.notes,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private scenarioView(row: InvestmentScenarioEntity) {
    return {
      id: row.id, opportunityId: row.opportunityId, scenarioType: row.scenarioType,
      version: row.version, status: row.status, currency: row.currency,
      capexTotal: row.capexTotal, npv: row.npv, irr: row.irr,
      paybackMonths: row.paybackMonths, inputSnapshot: row.inputSnapshot,
      outputSnapshot: row.outputSnapshot, formulaVersion: row.formulaVersion,
      workflowInstanceId: row.workflowInstanceId, submittedBy: row.submittedBy,
      submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private scenarioProjectionView(row: ScenarioProjectionRecord) {
    return {
      ...row,
      submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private projectView(row: ProjectEntity) {
    return {
      id: row.id, code: row.code, name: row.name, type: row.type, phase: row.phase,
      recordStatus: row.recordStatus, portfolioId: row.portfolioId,
      ownerLegalEntityId: row.ownerLegalEntityId, customerCompanyId: row.customerCompanyId,
      projectManagerId: row.projectManagerId, contractModel: row.contractModel,
      currency: row.currency, plannedCod: row.plannedCod, forecastCod: row.forecastCod,
      sourceOpportunityId: row.sourceOpportunityId, versionNo: row.versionNo
    };
  }

  private siteView(row: SiteEntity) {
    return {
      id: row.id, projectId: row.projectId, code: row.code, name: row.name,
      location: row.location, timezone: row.timezone, isPrimary: row.isPrimary,
      status: row.status
    };
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId };
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: eventType, result: 'SUCCEEDED', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: aggregateType, objectId: aggregateId, payload: safePayload
    });
    await this.outbox.append(manager, context, {
      aggregateType, aggregateId, aggregateVersion, eventType,
      eventKey: createHash('sha256')
        .update(`${aggregateType}:${aggregateId}:${aggregateVersion}:${eventType}`)
        .digest('hex'),
      payload: safePayload
    });
  }

  private async rethrowUnique<T>(action: () => Promise<T>, code: string, message: string): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as { code?: string; driverError?: { code?: string } };
      if ((candidate.code ?? candidate.driverError?.code) === '23505') {
        throw new ConflictException({ code, message, retryable: false });
      }
      throw cause;
    }
  }

  /**
   * Maps a named database constraint violation (unique, check or foreign key) to its domain error.
   * The constraint stays the enforcement; this only translates its failure for the wire.
   */
  private async withConstraintMap<T>(
    action: () => Promise<T>, map: Record<string, () => HttpException>
  ): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as {
        code?: string; constraint?: string;
        driverError?: { code?: string; constraint?: string };
      };
      const code = candidate.code ?? candidate.driverError?.code;
      const constraint = candidate.constraint ?? candidate.driverError?.constraint;
      if (
        constraint !== undefined
        && (code === '23505' || code === '23514' || code === '23503')
        && map[constraint] !== undefined
      ) {
        throw map[constraint]();
      }
      throw cause;
    }
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message, retryable: false });
  }

  private unprocessable(code: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, message, retryable: false });
  }

  private conflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message, retryable: false });
  }
}
