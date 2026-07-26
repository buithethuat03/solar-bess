import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository, type EntityManager } from 'typeorm';
import {
  AlarmCaseEntity, AlarmCaseState, AssetEntity, HseIncidentEntity, ServiceIncidentEntity,
  ServiceIncidentStatus, SiteEntity
} from '../../database/entities';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import {
  applyCursor, decodeOperationsCursor, encodeOperationsCursor
} from './domain/cursor';
import {
  assertVersion, emit, inScope, notFound, type RequestContext, unprocessable
} from './domain/support';
import type {
  AcknowledgeAlarmCaseDto, AlarmCaseListQueryDto, CreateServiceIncidentDto,
  ServiceIncidentListQueryDto
} from './dto/operations-maintenance.dto';

/**
 * Alarm cases and service incidents (API-114…API-117).
 *
 * The rule this half of the module exists to keep:
 *
 * **ACKNOWLEDGING IS LOCAL AND ONLY LOCAL.** API-115 writes `state`, `acknowledgedBy`,
 * `acknowledgedAt` and `acknowledgmentNote` on the PM Web row and NOTHING else. It never clears,
 * resets, suppresses or otherwise touches the source alarm in the OT system — there is no request
 * field, no code path, no queue and no credential here that could reach one, the DTO carries no
 * source identifier, and `trg_alarm_case_local_acknowledge` refuses any update that would smuggle a
 * change of the source projection into the same statement (SEC-127/SEC-128, WF-025: "local ack does
 * not clear source"). A closed local case says nothing about the state of the plant.
 *
 * Out of ABAC scope is indistinguishable from missing: 404, never 403.
 */
@Injectable()
export class AlarmIncidentService {
  constructor(
    @InjectRepository(AlarmCaseEntity)
    private readonly alarmCases: Repository<AlarmCaseEntity>,
    @InjectRepository(ServiceIncidentEntity)
    private readonly serviceIncidents: Repository<ServiceIncidentEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-114 — the local alarm-case register of one site, ABAC-filtered in SQL before paging. */
  async listAlarmCases(
    context: RequestContext, siteId: string, query: AlarmCaseListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'alarmCase.read');
    const site = await this.resolveSite(this.alarmCases.manager, context, siteId, scope);
    const cursor = decodeOperationsCursor(query.cursor);
    const builder = this.alarmCases.createQueryBuilder('alarmCase')
      .where('alarmCase.tenantId = :tenantId AND alarmCase.siteId = :siteId', {
        tenantId: context.tenantId, siteId
      });
    // Belt and braces: the site is already known to be reachable, but the project predicate goes
    // into the SAME query so a page can never be trimmed after pagination.
    if (!scope.tenantWide) {
      builder.andWhere('alarmCase.projectId IN (:...projectIds)', {
        projectIds: scope.projectIds
      });
    }
    if (query.state) builder.andWhere('alarmCase.state = :state', { state: query.state });
    if (query.severity) {
      builder.andWhere('alarmCase.severity = :severity', { severity: query.severity });
    }
    if (query.assetId) builder.andWhere('alarmCase.assetId = :assetId', { assetId: query.assetId });
    applyCursor(builder, 'alarmCase', 'alarm_cases', cursor, context.tenantId);
    const rows = await builder
      .orderBy('alarmCase.createdAt', 'DESC').addOrderBy('alarmCase.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.alarmCaseView(row)),
      meta: {
        limit: query.limit, siteId: site.id,
        nextCursor: rows.length > query.limit && last
          ? encodeOperationsCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /**
   * API-115 — acknowledge the LOCAL case only.
   *
   * The write touches four local columns. It does NOT clear, reset or suppress the source alarm,
   * and it cannot: nothing in this method — or anywhere in PM Web — can address the OT system.
   * Re-acknowledging an already-acknowledged case is a NO-OP: the row, its version and the audit
   * trail are left exactly as the first acknowledgement wrote them, so a retry never produces a
   * second acknowledgement fact.
   */
  async acknowledgeAlarmCase(
    context: RequestContext, alarmCaseId: string, input: AcknowledgeAlarmCaseDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'alarmCase.acknowledge');
    return this.commands.execute({
      context, operation: 'API-115:acknowledge-alarm-case', idempotencyKey,
      request: { alarmCaseId, input }, responseStatus: 200,
      resourceType: 'AlarmCase', resourceId: alarmCaseId,
      execute: async (manager) => {
        const cases = manager.getRepository(AlarmCaseEntity);
        const alarmCase = await cases.createQueryBuilder('alarmCase')
          .setLock('pessimistic_write')
          .where('alarmCase.id = :id AND alarmCase.tenantId = :tenantId', {
            id: alarmCaseId, tenantId: context.tenantId
          })
          .getOne();
        if (!alarmCase || !inScope(alarmCase.projectId, scope)) {
          throw notFound('ALARM_CASE_NOT_FOUND', 'Không tìm thấy alarm case');
        }
        assertVersion(alarmCase.versionNo, input.expectedVersion);
        if (alarmCase.acknowledgedBy !== null) {
          // Already acknowledged: no second write, no second audit row, no version bump.
          return { ...this.alarmCaseView(alarmCase), acknowledgementApplied: false };
        }
        const acknowledgedAt = new Date();
        await cases.update(
          { id: alarmCase.id, tenantId: context.tenantId },
          {
            state: AlarmCaseState.ACKNOWLEDGED,
            acknowledgedBy: context.userId, acknowledgedAt,
            acknowledgmentNote: input.note ?? null,
            updatedBy: context.userId, versionNo: alarmCase.versionNo + 1
          }
        );
        const updated = await cases.findOneByOrFail({
          id: alarmCase.id, tenantId: context.tenantId
        });
        // Ids and LOCAL state only. No source event payload ever leaves the row (SEC-128).
        await emit(this.outbox, manager, context, 'AlarmCase', updated.id, updated.versionNo,
          'AlarmCase.Acknowledged', {
            siteId: updated.siteId, assetId: updated.assetId, severity: updated.severity,
            state: updated.state, scope: 'LOCAL_ONLY',
            summary: `Alarm case acknowledged locally (source untouched)`
          });
        return { ...this.alarmCaseView(updated), acknowledgementApplied: true };
      }
    });
  }

  /** API-116 — the service-incident/SLA register of one site. */
  async listServiceIncidents(
    context: RequestContext, siteId: string, query: ServiceIncidentListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'serviceIncident.read');
    const site = await this.resolveSite(this.serviceIncidents.manager, context, siteId, scope);
    const cursor = decodeOperationsCursor(query.cursor);
    const builder = this.serviceIncidents.createQueryBuilder('incident')
      .where('incident.tenantId = :tenantId AND incident.siteId = :siteId', {
        tenantId: context.tenantId, siteId
      });
    if (!scope.tenantWide) {
      builder.andWhere('incident.projectId IN (:...projectIds)', { projectIds: scope.projectIds });
    }
    if (query.status) builder.andWhere('incident.status = :status', { status: query.status });
    if (query.severity) {
      builder.andWhere('incident.severity = :severity', { severity: query.severity });
    }
    if (query.assetId) builder.andWhere('incident.assetId = :assetId', { assetId: query.assetId });
    applyCursor(builder, 'incident', 'service_incidents', cursor, context.tenantId);
    const rows = await builder
      .orderBy('incident.createdAt', 'DESC').addOrderBy('incident.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.serviceIncidentView(row)),
      meta: {
        limit: query.limit, siteId: site.id,
        nextCursor: rows.length > query.limit && last
          ? encodeOperationsCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /** API-117 — open a service incident on a site, optionally linked to a case or an HSE incident. */
  async createServiceIncident(
    context: RequestContext, siteId: string, input: CreateServiceIncidentDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'serviceIncident.create');
    return this.commands.execute({
      context, operation: 'API-117:create-service-incident', idempotencyKey,
      request: { siteId, input }, responseStatus: 201, resourceType: 'ServiceIncident',
      resultReference: (result: { id: string }) => ({
        resourceType: 'ServiceIncident', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const site = await this.resolveSite(manager, context, siteId, scope);
        const detectedAt = new Date(input.detectedAt);
        const downtimeStart = input.downtimeStart ? new Date(input.downtimeStart) : null;
        const downtimeEnd = input.downtimeEnd ? new Date(input.downtimeEnd) : null;
        if (downtimeEnd && !downtimeStart) {
          throw unprocessable(
            'DOWNTIME_START_REQUIRED', 'Phải khai báo thời điểm bắt đầu gián đoạn'
          );
        }
        if (downtimeStart && downtimeEnd && downtimeEnd.getTime() < downtimeStart.getTime()) {
          throw unprocessable(
            'DOWNTIME_WINDOW_INVALID', 'Thời điểm kết thúc gián đoạn phải sau thời điểm bắt đầu'
          );
        }
        if (input.assetId) await this.assertAssetOnSite(manager, context, input.assetId, siteId);
        if (input.alarmCaseId) {
          const caseExists = await manager.getRepository(AlarmCaseEntity).existsBy({
            id: input.alarmCaseId, tenantId: context.tenantId, siteId
          });
          if (!caseExists) {
            throw unprocessable('ALARM_CASE_NOT_FOUND', 'Alarm case không thuộc site này');
          }
        }
        if (input.hseIncidentId) {
          const hseExists = await manager.getRepository(HseIncidentEntity).existsBy({
            id: input.hseIncidentId, tenantId: context.tenantId, projectId: site.projectId
          });
          if (!hseExists) {
            throw unprocessable('HSE_INCIDENT_NOT_FOUND', 'Sự cố HSE không thuộc dự án này');
          }
        }
        const incidents = manager.getRepository(ServiceIncidentEntity);
        const row = incidents.create({
          id: randomUUID(), tenantId: context.tenantId, projectId: site.projectId, siteId,
          assetId: input.assetId ?? null, alarmCaseId: input.alarmCaseId ?? null,
          hseIncidentId: input.hseIncidentId ?? null, severity: input.severity,
          status: ServiceIncidentStatus.OPEN, title: input.title,
          description: input.description ?? null, detectedAt, downtimeStart, downtimeEnd,
          slaResponseDueAt: input.slaResponseDueAt ? new Date(input.slaResponseDueAt) : null,
          slaRespondedAt: null,
          slaResolutionDueAt: input.slaResolutionDueAt
            ? new Date(input.slaResolutionDueAt) : null,
          slaResolvedAt: null, resolutionSummary: null, reportedBy: context.userId,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await incidents.save(row);
        await emit(this.outbox, manager, context, 'ServiceIncident', saved.id, saved.versionNo,
          'ServiceIncident.Created', {
            siteId: saved.siteId, assetId: saved.assetId, alarmCaseId: saved.alarmCaseId,
            severity: saved.severity, status: saved.status,
            detectedAt: saved.detectedAt.toISOString(),
            summary: `Service incident opened (${saved.severity})`
          });
        return this.serviceIncidentView(saved);
      }
    });
  }

  /**
   * Site visibility. Sites are project-scoped, so the site's project IS the ABAC anchor — there is
   * no SITE scope type in `role_assignments` and inventing one would invent an authorization model.
   * An unreachable site is reported as missing, never as forbidden.
   */
  private async resolveSite(
    manager: EntityManager, context: RequestContext, siteId: string, scope: AccessScopeSets
  ): Promise<SiteEntity> {
    const site = await manager.getRepository(SiteEntity).findOneBy({
      id: siteId, tenantId: context.tenantId
    });
    if (!site || !inScope(site.projectId, scope)) {
      throw notFound('SITE_NOT_FOUND', 'Không tìm thấy site');
    }
    return site;
  }

  private async assertAssetOnSite(
    manager: EntityManager, context: RequestContext, assetId: string, siteId: string
  ): Promise<void> {
    const exists = await manager.getRepository(AssetEntity).existsBy({
      id: assetId, tenantId: context.tenantId, siteId
    });
    if (!exists) throw unprocessable('ASSET_NOT_FOUND', 'Asset không thuộc site này');
  }

  /**
   * The alarm-case view. `sourceEventRefs` are opaque logical ids into the OT event store; no
   * payload, tag, gateway or endpoint of the source is stored, so none can be serialized.
   */
  private alarmCaseView(row: AlarmCaseEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, assetId: row.assetId,
      severity: row.severity, state: row.state, ownerId: row.ownerId,
      firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(),
      sourceEventRefs: row.sourceEventRefs, sourceQuality: row.sourceQuality,
      acknowledgedBy: row.acknowledgedBy,
      acknowledgedAt: row.acknowledgedAt === null ? null : row.acknowledgedAt.toISOString(),
      acknowledgmentNote: row.acknowledgmentNote, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private serviceIncidentView(row: ServiceIncidentEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, assetId: row.assetId,
      alarmCaseId: row.alarmCaseId, hseIncidentId: row.hseIncidentId,
      severity: row.severity, status: row.status, title: row.title,
      description: row.description, detectedAt: row.detectedAt.toISOString(),
      downtimeStart: row.downtimeStart === null ? null : row.downtimeStart.toISOString(),
      downtimeEnd: row.downtimeEnd === null ? null : row.downtimeEnd.toISOString(),
      slaResponseDueAt: row.slaResponseDueAt === null
        ? null : row.slaResponseDueAt.toISOString(),
      slaRespondedAt: row.slaRespondedAt === null ? null : row.slaRespondedAt.toISOString(),
      slaResolutionDueAt: row.slaResolutionDueAt === null
        ? null : row.slaResolutionDueAt.toISOString(),
      slaResolvedAt: row.slaResolvedAt === null ? null : row.slaResolvedAt.toISOString(),
      resolutionSummary: row.resolutionSummary, reportedBy: row.reportedBy,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }
}
