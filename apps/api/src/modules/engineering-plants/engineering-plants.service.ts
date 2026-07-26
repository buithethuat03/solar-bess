import {
  ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Brackets, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  AuditEventEntity, BessPlantEntity, BillOfMaterialsEntity, BillOfMaterialsStatus,
  BomLineEntity, BomLineSubstitutionStatus, CompanyEntity, DocumentRevisionEntity,
  DocumentRevisionStatus, DocumentScanStatus, EquipmentModelEntity, EquipmentModelStatus,
  PlantStatus, ProjectEntity, SolarPlantEntity
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { canonicalHash } from '../risk-change/domain/canonical-hash';
import { decodeEngineeringCursor, encodeEngineeringCursor } from './domain/cursor';
import {
  evaluateDispatchScenario, parseOperatingEnvelope
} from './domain/dispatch-evaluation';
import type {
  BomListQueryDto, CreateEquipmentModelDto, EquipmentModelListQueryDto, ReleaseBomDto,
  ReleaseSolarConfigurationDto, SimulateDispatchDto
} from './dto/engineering-plants.dto';

export interface RequestContext extends AuthContext { correlationId: string }

/**
 * Engineering & Plants (API-067…API-070, API-072…API-075). API-071 substitutions is DEFERRED —
 * its table has no allocated DB id — and is deliberately absent here (decision D3).
 *
 * The rules the module is built around:
 * - QUANTITIES NEVER TOUCH JS NUMBERS. numeric(19,4) values cross this service as strings; the
 *   only arithmetic on them (the API-075 envelope check) runs on exact decimal strings.
 * - Out of ABAC scope is indistinguishable from missing: 404, never 403. BOMs and plants are
 *   project-level, so a package-only principal has no reach at all; the equipment model catalog
 *   is the one tenant-level surface.
 * - Released engineering content is immutable. The database triggers enforce it; this service
 *   only performs the atomic supersede transitions the triggers permit.
 *
 * Recorded V1 interpretations:
 * - API-070 creates-and-releases the BOM in one command (no draft operation exists in the
 *   catalog). Because of that, the documented "releaser ≠ BOM.updated_by" SoD is unsatisfiable
 *   as written — the releaser IS the row's author — so the enforced SoD is the nearest honest
 *   equivalent: the releaser must differ from the design revision's uploader (RELEASE_SOD).
 * - API-073 always releases the NEXT configuration version as a new row (MAX(site versions)+1),
 *   superseding the current release; the addressed row anchors identity and the optimistic
 *   check, and a SUPERSEDED row can no longer be used as that anchor.
 * - API-075 persists NOTHING except its command receipt: no audit row, no outbox event — nothing
 *   an OT-facing consumer could ever mistake for a command (SEC-128).
 */
@Injectable()
export class EngineeringPlantsService {
  constructor(
    @InjectRepository(EquipmentModelEntity)
    private readonly equipmentModels: Repository<EquipmentModelEntity>,
    @InjectRepository(BillOfMaterialsEntity)
    private readonly boms: Repository<BillOfMaterialsEntity>,
    @InjectRepository(SolarPlantEntity)
    private readonly solarPlants: Repository<SolarPlantEntity>,
    @InjectRepository(BessPlantEntity)
    private readonly bessPlants: Repository<BessPlantEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-067 — the tenant equipment model catalog; APPROVED by default, `status=ALL` widens. */
  async listEquipmentModels(context: RequestContext, query: EquipmentModelListQueryDto) {
    const cursor = decodeEngineeringCursor(query.cursor);
    const builder = this.equipmentModels.createQueryBuilder('model')
      .where('model.tenantId = :tenantId', { tenantId: context.tenantId });
    const status = query.status ?? EquipmentModelStatus.APPROVED;
    if (status !== 'ALL') builder.andWhere('model.status = :status', { status });
    if (query.equipmentClass) {
      builder.andWhere('model.equipmentClass = :equipmentClass', {
        equipmentClass: query.equipmentClass
      });
    }
    if (query.manufacturer) {
      builder.andWhere('model.manufacturer = :manufacturer', {
        manufacturer: query.manufacturer
      });
    }
    if (cursor) this.applyCursor(builder, 'model', cursor, 'equipment_models', context.tenantId);
    const rows = await builder
      .orderBy('model.createdAt', 'DESC').addOrderBy('model.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => this.equipmentModelView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-068 — register a catalog model; it is born DRAFT (decision D2: no approve op exists). */
  async createEquipmentModel(
    context: RequestContext, input: CreateEquipmentModelDto, idempotencyKey: string
  ) {
    return this.commands.execute({
      context, operation: 'API-068:create-equipment-model', idempotencyKey,
      request: { input }, responseStatus: 201, resourceType: 'EquipmentModel',
      resultReference: (result: { id: string }) => ({
        resourceType: 'EquipmentModel', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        if (input.manufacturerCompanyId) {
          const companyExists = await manager.getRepository(CompanyEntity).existsBy({
            id: input.manufacturerCompanyId, tenantId: context.tenantId
          });
          if (!companyExists) {
            throw this.unprocessable(
              'MANUFACTURER_COMPANY_NOT_FOUND', 'Nhà sản xuất không thuộc tenant này'
            );
          }
        }
        const row = manager.getRepository(EquipmentModelEntity).create({
          id: randomUUID(), tenantId: context.tenantId,
          manufacturerCompanyId: input.manufacturerCompanyId ?? null,
          equipmentClass: input.equipmentClass, manufacturer: input.manufacturer,
          model: input.model, ratings: input.ratings ?? {}, specVersion: input.specVersion,
          status: EquipmentModelStatus.DRAFT, supersededById: null,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.withConstraintMap(
          () => manager.getRepository(EquipmentModelEntity).save(row),
          {
            uq_equipment_model_identity: () => this.conflict(
              'EQUIPMENT_MODEL_CONFLICT',
              'Model này với spec version này đã tồn tại trong catalog'
            )
          }
        );
        const saved = await manager.getRepository(EquipmentModelEntity)
          .findOneByOrFail({ id: row.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'EquipmentModel', saved.id, saved.versionNo,
          'EquipmentModel.Created', {
            equipmentClass: saved.equipmentClass, manufacturer: saved.manufacturer,
            model: saved.model, specVersion: saved.specVersion, status: saved.status,
            summary: `Equipment model ${saved.manufacturer} ${saved.model} registered`
          });
        return this.equipmentModelView(saved);
      }
    });
  }

  /** API-069 — the project BOM version register with line counts. */
  async listBillOfMaterials(context: RequestContext, projectId: string, query: BomListQueryDto) {
    const scope = await this.permissions.accessScopeSets(context, 'bom.read');
    await this.assertProjectVisible(this.boms.manager, context, projectId, scope);
    const cursor = decodeEngineeringCursor(query.cursor);
    const builder = this.boms.createQueryBuilder('bom')
      .where('bom.tenantId = :tenantId AND bom.projectId = :projectId', {
        tenantId: context.tenantId, projectId
      });
    if (cursor) this.applyCursor(builder, 'bom', cursor, 'bill_of_materials', context.tenantId);
    const rows = await builder
      .orderBy('bom.createdAt', 'DESC').addOrderBy('bom.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);

    const counts = new Map<string, number>();
    if (page.length > 0) {
      const counted = await this.boms.manager.query<Array<{ bomId: string; lineCount: number }>>(
        `SELECT line.bill_of_materials_id AS "bomId", count(*)::int AS "lineCount"
        FROM bom_lines line
        WHERE line.tenant_id = $1 AND line.bill_of_materials_id = ANY($2::uuid[])
        GROUP BY line.bill_of_materials_id`,
        [context.tenantId, page.map((row) => row.id)]
      );
      for (const row of counted) counts.set(row.bomId, row.lineCount);
    }
    // Line embedding is page-local by design: the requested version embeds its ordered lines
    // only when it is part of the returned page; other items carry `lines: null`.
    const embedded = query.linesForVersion === undefined
      ? null : page.find((row) => row.version === query.linesForVersion) ?? null;
    const embeddedLines = embedded === null
      ? [] : await this.boms.manager.getRepository(BomLineEntity).find({
        where: { tenantId: context.tenantId, billOfMaterialsId: embedded.id },
        order: { lineNo: 'ASC' }
      });
    return {
      items: page.map((row) => ({
        ...this.bomView(row),
        lineCount: counts.get(row.id) ?? 0,
        lines: embedded !== null && row.id === embedded.id
          ? embeddedLines.map((line) => this.bomLineView(line)) : null
      })),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /**
   * API-070 — create-and-release the next BOM version in one transaction: verify the design
   * revision is ISSUED and scan-CLEAN, enforce releaser SoD, write the lines, fingerprint the
   * ordered stored content with the shared canonical hash, supersede the previous release, and
   * only then mark the new version RELEASED.
   */
  async releaseBillOfMaterials(
    context: RequestContext, projectId: string, input: ReleaseBomDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'bom.release');
    return this.commands.execute({
      context, operation: 'API-070:release-bill-of-materials', idempotencyKey,
      request: { projectId, input }, responseStatus: 200, resourceType: 'BillOfMaterials',
      resultReference: (result: { id: string }) => ({
        resourceType: 'BillOfMaterials', resourceId: result.id, responseStatus: 200
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);

        // Re-checked inside the command transaction: only an ISSUED, scan-CLEAN design revision
        // of THIS project can back a released BOM (SEC-121 chain).
        const revision = await manager.getRepository(DocumentRevisionEntity).findOneBy({
          id: input.designRevisionId, tenantId: context.tenantId, projectId
        });
        if (!revision) {
          throw this.unprocessable(
            'DESIGN_REVISION_NOT_FOUND', 'Design revision không thuộc dự án này'
          );
        }
        if (revision.status !== DocumentRevisionStatus.ISSUED
          || revision.scanStatus !== DocumentScanStatus.CLEAN) {
          throw this.unprocessable(
            'DESIGN_REVISION_LOCKED',
            'Design revision phải ở trạng thái ISSUED với kết quả quét CLEAN'
          );
        }
        // Recorded SoD interpretation: with create-and-release, the BOM's author IS the
        // releaser, so the enforced segregation is releaser ≠ design revision uploader.
        if (revision.uploadedBy === context.userId) {
          throw this.unprocessable(
            'RELEASE_SOD', 'Người upload design revision không được tự release BOM'
          );
        }

        const seen = new Set<number>();
        for (const line of input.lines) {
          if (seen.has(line.lineNo)) {
            throw this.unprocessable('BOM_LINE_DUPLICATE', 'Trùng số dòng trong BOM');
          }
          seen.add(line.lineNo);
        }
        const modelIds = [...new Set(input.lines
          .map((line) => line.equipmentModelId)
          .filter((id): id is string => id !== undefined))];
        for (const modelId of modelIds) {
          const modelExists = await manager.getRepository(EquipmentModelEntity).existsBy({
            id: modelId, tenantId: context.tenantId
          });
          if (!modelExists) {
            throw this.unprocessable(
              'EQUIPMENT_MODEL_NOT_FOUND', 'Equipment model không tồn tại trong catalog'
            );
          }
        }

        const [next] = await manager.query<Array<{ next: number }>>(
          `SELECT (COALESCE(MAX(version), 0) + 1)::int AS "next"
          FROM bill_of_materials WHERE tenant_id = $1 AND project_id = $2`,
          [context.tenantId, projectId]
        );
        const bomId = randomUUID();
        const bomRepository = manager.getRepository(BillOfMaterialsEntity);
        // Born DRAFT so the line trigger admits the inserts; flipped to RELEASED below.
        await this.withConstraintMap(
          () => bomRepository.insert({
            id: bomId, tenantId: context.tenantId, projectId,
            designRevisionId: revision.id, version: next.next,
            status: BillOfMaterialsStatus.DRAFT,
            releasedBy: null, releasedAt: null, snapshotHash: null,
            createdBy: context.userId, updatedBy: context.userId
          }),
          {
            uq_bom_project_version: () => this.conflict(
              'BOM_VERSION_CONFLICT', 'BOM version vừa được cấp bởi yêu cầu khác; hãy thử lại'
            )
          }
        );
        const lineRepository = manager.getRepository(BomLineEntity);
        for (const line of [...input.lines].sort((a, b) => a.lineNo - b.lineNo)) {
          await this.withConstraintMap(
            () => lineRepository.insert({
              id: randomUUID(), tenantId: context.tenantId, billOfMaterialsId: bomId,
              equipmentModelId: line.equipmentModelId ?? null, lineNo: line.lineNo,
              itemCode: line.itemCode, description: line.description ?? null,
              quantity: line.quantity, unit: line.unit,
              substitutionStatus: BomLineSubstitutionStatus.NONE
            }),
            {
              uq_bom_line_number: () => this.unprocessable(
                'BOM_LINE_DUPLICATE', 'Trùng số dòng trong BOM'
              ),
              ck_bom_line_quantity: () => this.unprocessable(
                'QUANTITY_INVALID', 'Số lượng của dòng BOM phải lớn hơn 0'
              ),
              fk_bom_line_equipment_model: () => this.unprocessable(
                'EQUIPMENT_MODEL_NOT_FOUND', 'Equipment model không tồn tại trong catalog'
              )
            }
          );
        }
        // Hash the content as Postgres stores it (canonical numeric text), in line order.
        const storedLines = await lineRepository.find({
          where: { tenantId: context.tenantId, billOfMaterialsId: bomId },
          order: { lineNo: 'ASC' }
        });
        const snapshotHash = canonicalHash(storedLines.map((line) => ({
          lineNo: line.lineNo, itemCode: line.itemCode, description: line.description,
          quantity: line.quantity, unit: line.unit, equipmentModelId: line.equipmentModelId,
          substitutionStatus: line.substitutionStatus
        })));

        // Atomic supersede of the previous release, before the partial unique sees a second one.
        const previous = await bomRepository.createQueryBuilder('bom')
          .setLock('pessimistic_write')
          .where(
            'bom.tenantId = :tenantId AND bom.projectId = :projectId AND bom.status = :status',
            { tenantId: context.tenantId, projectId, status: BillOfMaterialsStatus.RELEASED }
          )
          .getOne();
        if (previous) {
          await bomRepository.update(
            { id: previous.id, tenantId: context.tenantId },
            {
              status: BillOfMaterialsStatus.SUPERSEDED,
              updatedBy: context.userId, versionNo: previous.versionNo + 1
            }
          );
        }
        await bomRepository.update(
          { id: bomId, tenantId: context.tenantId },
          {
            status: BillOfMaterialsStatus.RELEASED, snapshotHash,
            releasedBy: context.userId, releasedAt: new Date(),
            updatedBy: context.userId, versionNo: 2
          }
        );
        const released = await bomRepository
          .findOneByOrFail({ id: bomId, tenantId: context.tenantId });
        await this.emit(manager, context, 'BillOfMaterials', released.id, released.versionNo,
          'BillOfMaterials.Released', {
            projectId, version: released.version, designRevisionId: revision.id,
            snapshotHash, lineCount: storedLines.length,
            supersededBomId: previous?.id ?? null,
            summary: `BOM version ${released.version} released`
          });
        return {
          ...this.bomView(released),
          lineCount: storedLines.length,
          lines: storedLines.map((line) => this.bomLineView(line)),
          supersededBomId: previous?.id ?? null
        };
      }
    });
  }

  /** API-072 — one solar plant with its released configuration and the site version history. */
  async getSolarPlant(context: RequestContext, solarPlantId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'solarPlant.read');
    const plant = await this.solarPlants.findOneBy({
      id: solarPlantId, tenantId: context.tenantId
    });
    if (!plant || !this.inScope(plant.projectId, scope)) {
      throw this.notFound('SOLAR_PLANT_NOT_FOUND', 'Không tìm thấy solar plant');
    }
    const versions = await this.solarPlants.find({
      where: { tenantId: context.tenantId, siteId: plant.siteId },
      order: { configurationVersion: 'ASC' }
    });
    const released = versions.find((row) => row.status === PlantStatus.RELEASED) ?? null;
    return {
      data: this.solarPlantView(plant),
      releasedConfiguration: released === null ? null : {
        solarPlantId: released.id,
        configurationVersion: released.configurationVersion,
        configuration: released.configuration,
        configurationHash: released.configurationHash
      },
      versionHistory: versions.map((row) => ({
        id: row.id, configurationVersion: row.configurationVersion, status: row.status,
        configurationHash: row.configurationHash, versionNo: row.versionNo,
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
      }))
    };
  }

  /**
   * API-073 — release the NEXT configuration version of the addressed plant's site as a new
   * RELEASED row, superseding the current release atomically. The addressed row is the identity
   * and optimistic-concurrency anchor; a SUPERSEDED row can no longer anchor a release.
   */
  async releaseSolarConfiguration(
    context: RequestContext, solarPlantId: string,
    input: ReleaseSolarConfigurationDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'solarPlant.configure');
    return this.commands.execute({
      context, operation: 'API-073:release-solar-configuration', idempotencyKey,
      request: { solarPlantId, input }, responseStatus: 200, resourceType: 'SolarPlant',
      resultReference: (result: { id: string }) => ({
        resourceType: 'SolarPlant', resourceId: result.id, responseStatus: 200
      }),
      execute: async (manager) => {
        const plants = manager.getRepository(SolarPlantEntity);
        const anchor = await plants.createQueryBuilder('plant')
          .setLock('pessimistic_write')
          .where('plant.id = :id AND plant.tenantId = :tenantId', {
            id: solarPlantId, tenantId: context.tenantId
          })
          .getOne();
        if (!anchor || !this.inScope(anchor.projectId, scope)) {
          throw this.notFound('SOLAR_PLANT_NOT_FOUND', 'Không tìm thấy solar plant');
        }
        if (anchor.status === PlantStatus.SUPERSEDED) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION',
            'Bản ghi cấu hình đã SUPERSEDED; hãy release từ bản ghi hiện hành'
          );
        }
        this.assertVersion(anchor.versionNo, input.expectedVersion);

        const released = await plants.createQueryBuilder('plant')
          .setLock('pessimistic_write')
          .where(
            'plant.tenantId = :tenantId AND plant.siteId = :siteId AND plant.status = :status',
            { tenantId: context.tenantId, siteId: anchor.siteId, status: PlantStatus.RELEASED }
          )
          .getOne();
        if (released) {
          await plants.update(
            { id: released.id, tenantId: context.tenantId },
            {
              status: PlantStatus.SUPERSEDED,
              updatedBy: context.userId, versionNo: released.versionNo + 1
            }
          );
        }
        // A DRAFT anchor is not itself released, but its version must move so concurrent
        // releases anchored on it collide on expectedVersion instead of double-releasing.
        if (anchor.status === PlantStatus.DRAFT && anchor.id !== released?.id) {
          await plants.update(
            { id: anchor.id, tenantId: context.tenantId },
            { updatedBy: context.userId, versionNo: anchor.versionNo + 1 }
          );
        }

        const [next] = await manager.query<Array<{ next: number }>>(
          `SELECT (COALESCE(MAX(configuration_version), 0) + 1)::int AS "next"
          FROM solar_plants WHERE tenant_id = $1 AND site_id = $2`,
          [context.tenantId, anchor.siteId]
        );
        const id = randomUUID();
        const nextRow = plants.create({
          id, tenantId: context.tenantId, projectId: anchor.projectId,
          siteId: anchor.siteId, rootAssetId: anchor.rootAssetId,
          dcCapacityKwp: input.dcCapacityKwp ?? anchor.dcCapacityKwp,
          acCapacityKw: input.acCapacityKw ?? anchor.acCapacityKw,
          configurationVersion: next.next, configuration: input.configuration,
          configurationHash: canonicalHash(input.configuration),
          baselineRef: input.baselineRef ?? anchor.baselineRef,
          status: PlantStatus.RELEASED,
          createdBy: context.userId, updatedBy: context.userId
        });
        await this.withConstraintMap(
          () => plants.save(nextRow),
          {
            uq_solar_plant_config_version: () => this.conflict(
              'CONFIGURATION_VERSION_CONFLICT',
              'Configuration version vừa được cấp bởi yêu cầu khác; hãy thử lại'
            ),
            uq_solar_plant_released: () => this.conflict(
              'CONFIGURATION_VERSION_CONFLICT',
              'Site này vừa có một release song song; hãy tải lại và thử lại'
            ),
            ck_solar_plant_dc_capacity: () => this.unprocessable(
              'CAPACITY_INVALID', 'Công suất DC phải lớn hơn 0'
            ),
            ck_solar_plant_ac_capacity: () => this.unprocessable(
              'CAPACITY_INVALID', 'Công suất AC phải lớn hơn 0'
            )
          }
        );
        const saved = await plants.findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'SolarPlant', saved.id, saved.versionNo,
          'SolarPlant.ConfigurationReleased', {
            projectId: saved.projectId, siteId: saved.siteId,
            configurationVersion: saved.configurationVersion,
            configurationHash: saved.configurationHash,
            supersededPlantId: released?.id ?? null,
            summary: `Solar configuration version ${saved.configurationVersion} released`
          });
        return { ...this.solarPlantView(saved), supersededPlantId: released?.id ?? null };
      }
    });
  }

  /**
   * API-074 — one BESS plant with its envelope and hierarchy version. The KPI and telemetry
   * blocks are EXPLICITLY null: no telemetry table exists in PM Web, and per the OT boundary the
   * data would arrive read-only through the integration layer, never from here.
   */
  async getBessPlant(context: RequestContext, bessPlantId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'bessPlant.read');
    const plant = await this.bessPlants.findOneBy({ id: bessPlantId, tenantId: context.tenantId });
    if (!plant || !this.inScope(plant.projectId, scope)) {
      throw this.notFound('BESS_PLANT_NOT_FOUND', 'Không tìm thấy BESS plant');
    }
    return { data: { ...this.bessPlantView(plant), kpi: null, telemetry: null } };
  }

  /**
   * API-075 — stateless advisory dispatch simulation. Validates the scenario against the site's
   * RELEASED operating envelope entirely in TypeScript with exact decimal comparison, persists
   * NOTHING except the command receipt, and never emits any event — advisory in, verdict out.
   */
  async simulateDispatch(
    context: RequestContext, bessPlantId: string,
    input: SimulateDispatchDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'bessSimulation.run');
    return this.commands.execute({
      context, operation: 'API-075:simulate-dispatch', idempotencyKey,
      request: { bessPlantId, input }, responseStatus: 200,
      resourceType: 'BessPlant', resourceId: bessPlantId,
      execute: async (manager) => {
        const plants = manager.getRepository(BessPlantEntity);
        const plant = await plants.findOneBy({ id: bessPlantId, tenantId: context.tenantId });
        if (!plant || !this.inScope(plant.projectId, scope)) {
          throw this.notFound('BESS_PLANT_NOT_FOUND', 'Không tìm thấy BESS plant');
        }
        const released = await plants.findOneBy({
          tenantId: context.tenantId, siteId: plant.siteId, status: PlantStatus.RELEASED
        });
        if (!released) {
          throw this.unprocessable(
            'OPERATING_ENVELOPE_MISSING',
            'Site này chưa có operating envelope nào được release'
          );
        }
        const envelope = parseOperatingEnvelope(released.operatingEnvelope);
        if (envelope === null) {
          throw this.unprocessable(
            'OPERATING_ENVELOPE_INVALID',
            'Operating envelope đã release không đủ cấu trúc để mô phỏng'
          );
        }
        const evaluation = evaluateDispatchScenario(envelope, {
          intervalMinutes: input.intervalMinutes,
          initialSocPercent: input.initialSocPercent,
          steps: input.steps
        });
        // Deliberately no emit(): the verdict is advisory. Nothing leaves this transaction
        // except the command receipt — no audit aggregate, no outbox event (SEC-128).
        return {
          bessPlantId: plant.id,
          envelope: {
            bessPlantId: released.id, hierarchyVersion: released.hierarchyVersion
          },
          advisory: true,
          feasible: evaluation.feasible,
          evaluatedSteps: evaluation.evaluatedSteps,
          intervalMinutes: input.intervalMinutes,
          violations: evaluation.violations
        };
      }
    });
  }

  /**
   * BOMs and plants carry no package granularity: tenant-wide or explicit project reach only. A
   * package-scoped assignment grants nothing here, and an unreachable project answers 404 — the
   * same as a missing one.
   */
  private async assertProjectVisible(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets
  ): Promise<void> {
    const exists = await manager.getRepository(ProjectEntity).existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!exists || !this.inScope(projectId, scope)) {
      throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    }
  }

  private inScope(projectId: string, scope: AccessScopeSets): boolean {
    return scope.tenantWide || scope.projectIds.includes(projectId);
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
   * Catalog and BOM rows arrive in bulk imports that share a single `now()`, which puts a whole
   * batch on one page boundary. Reading the boundary straight out of `table` compares the real
   * stored values, and `(created_at, id) < (…)` stays a row-wise comparison the
   * `(created_at DESC, id DESC)` ordering index can drive.
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
        ? encodeEngineeringCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    };
  }

  private equipmentModelView(row: EquipmentModelEntity) {
    return {
      id: row.id, manufacturerCompanyId: row.manufacturerCompanyId,
      equipmentClass: row.equipmentClass, manufacturer: row.manufacturer, model: row.model,
      ratings: row.ratings, specVersion: row.specVersion, status: row.status,
      supersededById: row.supersededById, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private bomView(row: BillOfMaterialsEntity) {
    return {
      id: row.id, projectId: row.projectId, designRevisionId: row.designRevisionId,
      version: row.version, status: row.status,
      releasedBy: row.releasedBy,
      releasedAt: row.releasedAt === null ? null : row.releasedAt.toISOString(),
      snapshotHash: row.snapshotHash, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private bomLineView(row: BomLineEntity) {
    return {
      id: row.id, billOfMaterialsId: row.billOfMaterialsId,
      equipmentModelId: row.equipmentModelId, lineNo: row.lineNo, itemCode: row.itemCode,
      description: row.description, quantity: row.quantity, unit: row.unit,
      substitutionStatus: row.substitutionStatus,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private solarPlantView(row: SolarPlantEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, rootAssetId: row.rootAssetId,
      dcCapacityKwp: row.dcCapacityKwp, acCapacityKw: row.acCapacityKw,
      configurationVersion: row.configurationVersion, configuration: row.configuration,
      configurationHash: row.configurationHash, baselineRef: row.baselineRef,
      status: row.status, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private bessPlantView(row: BessPlantEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, rootAssetId: row.rootAssetId,
      powerMw: row.powerMw, energyMwh: row.energyMwh, hierarchyVersion: row.hierarchyVersion,
      operatingEnvelope: row.operatingEnvelope, pointListVersion: row.pointListVersion,
      status: row.status, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
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

  /**
   * Maps a named database constraint violation (unique, check or foreign key) to its domain
   * error. The constraint stays the enforcement; this only translates its failure for the wire.
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
