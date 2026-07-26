import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, IsNull, Repository, type EntityManager } from 'typeorm';
import {
  AssetEntity, MaintenancePlanEntity, PermitToWorkEntity, ServiceIncidentEntity,
  UserAccountEntity, WarrantyClaimEntity, WarrantyClaimStatus, WorkOrderClosureCycleEntity,
  WorkOrderClosureDecision, WorkOrderEntity, WorkOrderStatus
} from '../../database/entities';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { applyCursor, decodeOperationsCursor, encodeOperationsCursor } from './domain/cursor';
import {
  assertVersion, conflict, emit, inScope, notFound, type RequestContext, unprocessable,
  withConstraintMap
} from './domain/support';
import {
  WARRANTY_CLAIM_STATES, WORK_ORDER_TRANSITIONS, canTransition, evaluatePermitValidity,
  type PermitRejection, type WorkOrderTransitionCommand
} from './domain/work-order-policy';
import type {
  CreateWorkOrderDto, WorkOrderCommandDto, WorkOrderListQueryDto
} from './dto/operations-maintenance.dto';

/**
 * Work orders, closure cycles and asset performance (API-118…API-121).
 *
 * Two things this service refuses to do:
 *
 * 1. **Let anyone verify or close their own work.** SEC-108/SEC-109 and WF-024 both say a
 *    technician cannot self-close a critical work order. The rule is checked here for a clean 422
 *    SOD_CONFLICT and enforced again by `ck_work_order_verifier_independent`, so a direct SQL write
 *    fails the same way an API call does.
 * 2. **Invent telemetry.** API-121 returns the asset identity and the counts this database can
 *    actually prove, with `kpi: null` and `telemetry: null` — never a zero standing in for a number
 *    nobody measured.
 */
@Injectable()
export class WorkOrderService {
  constructor(
    @InjectRepository(WorkOrderEntity)
    private readonly workOrders: Repository<WorkOrderEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService
  ) {}

  /** API-118 — the work-order register of one asset with its maintenance/warranty context. */
  async listWorkOrders(
    context: RequestContext, assetId: string, query: WorkOrderListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'workOrder.read');
    const asset = await this.resolveAsset(this.workOrders.manager, context, assetId, scope);
    const cursor = decodeOperationsCursor(query.cursor);
    const builder = this.workOrders.createQueryBuilder('workOrder')
      .where('workOrder.tenantId = :tenantId AND workOrder.assetId = :assetId', {
        tenantId: context.tenantId, assetId
      });
    if (!scope.tenantWide) {
      builder.andWhere('workOrder.projectId IN (:...projectIds)', {
        projectIds: scope.projectIds
      });
    }
    if (query.status) builder.andWhere('workOrder.status = :status', { status: query.status });
    if (query.priority) {
      builder.andWhere('workOrder.priority = :priority', { priority: query.priority });
    }
    applyCursor(builder, 'workOrder', 'work_orders', cursor, context.tenantId);
    const rows = await builder
      .orderBy('workOrder.createdAt', 'DESC').addOrderBy('workOrder.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const extras = await this.pageContext(this.workOrders.manager, context, page);
    return {
      items: page.map((row) => ({
        ...this.workOrderView(row),
        maintenancePlan: row.maintenancePlanId === null
          ? null : extras.plans.get(row.maintenancePlanId) ?? null,
        warrantyClaimCount: extras.claimCounts.get(row.id) ?? 0
      })),
      meta: {
        limit: query.limit, assetId: asset.id, siteId: asset.siteId,
        nextCursor: rows.length > query.limit && last
          ? encodeOperationsCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null
      }
    };
  }

  /**
   * API-119 — create a work order on an asset. When the work needs a permit to work, the referenced
   * permit must be live, in window and on the ASSET'S OWN SITE, otherwise the request is refused
   * with 422 PTW_REQUIRED and nothing is written.
   */
  async createWorkOrder(
    context: RequestContext, assetId: string, input: CreateWorkOrderDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'workOrder.create');
    return this.commands.execute({
      context, operation: 'API-119:create-work-order', idempotencyKey,
      request: { assetId, input }, responseStatus: 201, resourceType: 'WorkOrder',
      resultReference: (result: { id: string }) => ({
        resourceType: 'WorkOrder', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const asset = await this.resolveAsset(manager, context, assetId, scope);
        const requiresPermit = input.requiresPermit ?? false;
        if (requiresPermit) {
          const rejection = await this.checkPermit(
            manager, context, input.permitToWorkId ?? null, asset.siteId
          );
          if (rejection) {
            throw unprocessable('PTW_REQUIRED', this.permitMessage(rejection, true));
          }
        } else if (input.permitToWorkId) {
          // Even when the work does not require a permit, a reference to a permit that does not
          // exist or belongs to another site would be misleading data on a safety record. The
          // window is deliberately NOT checked here: a not-yet-valid permit is a normal thing to
          // attach at planning time, and START is where the window has to hold.
          const rejection = await this.checkPermit(
            manager, context, input.permitToWorkId, asset.siteId
          );
          if (rejection === 'MISSING' || rejection === 'SITE') {
            throw unprocessable('PTW_NOT_VALID', this.permitMessage(rejection, false));
          }
        }
        if (input.assigneeUserId) {
          await this.assertUserExists(manager, context, input.assigneeUserId);
        }
        if (input.serviceIncidentId) {
          const exists = await manager.getRepository(ServiceIncidentEntity).existsBy({
            id: input.serviceIncidentId, tenantId: context.tenantId, siteId: asset.siteId
          });
          if (!exists) {
            throw unprocessable('SERVICE_INCIDENT_NOT_FOUND', 'Sự cố dịch vụ không thuộc site này');
          }
        }
        if (input.maintenancePlanId) {
          const exists = await manager.getRepository(MaintenancePlanEntity).existsBy({
            id: input.maintenancePlanId, tenantId: context.tenantId, assetId: asset.id
          });
          if (!exists) {
            throw unprocessable('MAINTENANCE_PLAN_NOT_FOUND', 'Kế hoạch bảo trì không thuộc asset này');
          }
        }
        const orders = manager.getRepository(WorkOrderEntity);
        const row = orders.create({
          id: randomUUID(), tenantId: context.tenantId, projectId: asset.projectId,
          siteId: asset.siteId, assetId: asset.id,
          serviceIncidentId: input.serviceIncidentId ?? null,
          maintenancePlanId: input.maintenancePlanId ?? null,
          permitToWorkId: input.permitToWorkId ?? null,
          code: input.code, workType: input.workType, title: input.title,
          description: input.description ?? null, priority: input.priority,
          // No approve/schedule operation exists in the catalog; the row is born where API-119
          // leaves it and DISPATCH accepts every pre-dispatch state.
          status: input.scheduledAt ? WorkOrderStatus.SCHEDULED : WorkOrderStatus.DRAFT,
          requiresPermit, assigneeId: input.assigneeUserId ?? null,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          dispatchedBy: null, dispatchedAt: null, startedBy: null, startedAt: null,
          holdReason: null, completedBy: null, completedAt: null, workSummary: null,
          verifiedBy: null, verifiedAt: null, returnToServiceRef: null,
          closedBy: null, closedAt: null, cancelledBy: null, cancelledAt: null,
          cancelReason: null, createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await withConstraintMap(() => orders.save(row), {
          uq_work_order_code: () => conflict(
            'WORK_ORDER_CODE_CONFLICT', 'Mã work order đã tồn tại trong tenant'
          )
        });
        await emit(this.outbox, manager, context, 'WorkOrder', saved.id, saved.versionNo,
          'WorkOrder.Created', {
            siteId: saved.siteId, assetId: saved.assetId, code: saved.code,
            workType: saved.workType, priority: saved.priority, status: saved.status,
            requiresPermit: saved.requiresPermit,
            summary: `Work order ${saved.code} created`
          });
        return this.workOrderView(saved);
      }
    });
  }

  /** API-120 — the closed work-order command union; a fixed 200 with the resulting resource. */
  async workOrderCommand(
    context: RequestContext, workOrderId: string, input: WorkOrderCommandDto,
    idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'workOrder.manage');
    return this.commands.execute({
      context, operation: 'API-120:work-order-command', idempotencyKey,
      request: { workOrderId, input }, responseStatus: 200,
      resourceType: 'WorkOrder', resourceId: workOrderId,
      execute: async (manager) => {
        const workOrder = await this.lockWorkOrder(manager, context, workOrderId, scope);
        assertVersion(workOrder.versionNo, input.expectedVersion);
        if (input.commandType === 'RAISE_WARRANTY_CLAIM') {
          return this.raiseWarrantyClaim(manager, context, workOrder, input);
        }
        return this.transitionWorkOrder(manager, context, workOrder, input);
      }
    });
  }

  /**
   * API-121 — asset performance.
   *
   * `kpi` and `telemetry` are EXPLICITLY null, exactly as `engineering-plants.service.ts` answers
   * for a BESS plant: PM Web has no telemetry store (DB-091/DB-092 live in a separate OT
   * time-series/event store) and the OT boundary forbids inventing one. Everything else in this
   * response is counted from real rows in this database. A zero here would be a lie — "no work
   * orders in that status" and "we cannot measure this" are different answers, and only the first
   * one is ever reported as a number.
   */
  async getAssetPerformance(context: RequestContext, assetId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'performance.read');
    const manager = this.workOrders.manager;
    const asset = await this.resolveAsset(manager, context, assetId, scope);
    const [workOrderCounts, incidentCounts, alarmCounts] = await Promise.all([
      this.countBy(
        manager, 'work_orders', 'status', 'asset_id', context.tenantId, asset.id
      ),
      this.countBy(
        manager, 'service_incidents', 'status', 'asset_id', context.tenantId, asset.id
      ),
      this.countBy(manager, 'alarm_cases', 'state', 'asset_id', context.tenantId, asset.id)
    ]);
    return {
      data: {
        asset: {
          id: asset.id, projectId: asset.projectId, siteId: asset.siteId,
          equipmentId: asset.equipmentId, assetCode: asset.assetCode,
          operationalStatus: asset.operationalStatus, activationDate: asset.activationDate
        },
        workOrderCountsByStatus: workOrderCounts,
        serviceIncidentCountsByStatus: incidentCounts,
        alarmCaseCountsByState: alarmCounts,
        // Not "0", not "{}" — unknown. No telemetry or KPI store exists on this side of the OT
        // boundary, and PM Web will not manufacture one (SEC-127/SEC-128, FR-116/FR-117).
        kpi: null,
        telemetry: null
      }
    };
  }

  private async transitionWorkOrder(
    manager: EntityManager, context: RequestContext, workOrder: WorkOrderEntity,
    input: WorkOrderCommandDto
  ) {
    const command = input.commandType as WorkOrderTransitionCommand;
    if (!canTransition(command, workOrder.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION', `Work order đang ${workOrder.status} không nhận lệnh ${command}`
      );
    }
    const orders = manager.getRepository(WorkOrderEntity);
    const now = new Date();
    const patch: Partial<WorkOrderEntity> = {
      status: WORK_ORDER_TRANSITIONS[command].to,
      updatedBy: context.userId, versionNo: workOrder.versionNo + 1
    };
    let eventType = `WorkOrder.${command}`;
    let cycleView: Record<string, unknown> | null = null;

    switch (command) {
      case 'DISPATCH': {
        if (input.assigneeUserId) {
          await this.assertUserExists(manager, context, input.assigneeUserId);
          patch.assigneeId = input.assigneeUserId;
        } else if (workOrder.assigneeId === null) {
          throw unprocessable('ASSIGNEE_REQUIRED', 'DISPATCH phải chỉ định người thực hiện');
        }
        patch.dispatchedBy = context.userId;
        patch.dispatchedAt = now;
        eventType = 'WorkOrder.Dispatched';
        break;
      }
      case 'START': {
        if (workOrder.requiresPermit) {
          const permitId = input.permitToWorkId ?? workOrder.permitToWorkId;
          const rejection = await this.checkPermit(
            manager, context, permitId, workOrder.siteId, now
          );
          if (rejection) {
            throw unprocessable('PTW_NOT_VALID', this.permitMessage(rejection, false));
          }
          patch.permitToWorkId = permitId;
        } else if (input.permitToWorkId) {
          const rejection = await this.checkPermit(
            manager, context, input.permitToWorkId, workOrder.siteId, now
          );
          if (rejection === 'MISSING' || rejection === 'SITE') {
            throw unprocessable('PTW_NOT_VALID', this.permitMessage(rejection, false));
          }
          patch.permitToWorkId = input.permitToWorkId;
        }
        patch.startedBy = context.userId;
        patch.startedAt = now;
        patch.holdReason = null;
        eventType = 'WorkOrder.Started';
        break;
      }
      case 'HOLD': {
        this.require(input.reason, 'REASON_REQUIRED', 'HOLD phải kèm lý do');
        patch.holdReason = input.reason!;
        eventType = 'WorkOrder.Held';
        break;
      }
      case 'RESUME': {
        patch.holdReason = null;
        eventType = 'WorkOrder.Resumed';
        break;
      }
      case 'COMPLETE': {
        this.require(input.workSummary, 'WORK_SUMMARY_REQUIRED', 'COMPLETE phải mô tả công việc');
        if (!input.evidenceRefs || input.evidenceRefs.length === 0) {
          throw unprocessable('EVIDENCE_REQUIRED', 'COMPLETE phải kèm ít nhất một bằng chứng');
        }
        cycleView = await this.openClosureCycle(
          manager, context, workOrder, input.workSummary!, input.evidenceRefs
        );
        patch.completedBy = context.userId;
        patch.completedAt = now;
        patch.workSummary = input.workSummary!;
        eventType = 'WorkOrder.Completed';
        break;
      }
      case 'VERIFY': {
        this.require(input.reason, 'REASON_REQUIRED', 'VERIFY phải kèm thuyết minh xác nhận');
        this.assertIndependent(context, workOrder);
        cycleView = await this.decideClosureCycle(manager, context, workOrder, input.reason!);
        patch.verifiedBy = context.userId;
        patch.verifiedAt = now;
        eventType = 'WorkOrder.Verified';
        break;
      }
      case 'CLOSE': {
        const returnToServiceRef = input.returnToServiceRef ?? workOrder.returnToServiceRef;
        if (!returnToServiceRef || returnToServiceRef.trim().length === 0) {
          throw unprocessable(
            'RETURN_TO_SERVICE_REQUIRED',
            'CLOSE phải ghi nhận bằng chứng bàn giao trở lại vận hành'
          );
        }
        this.assertIndependent(context, workOrder);
        patch.returnToServiceRef = returnToServiceRef;
        patch.closedBy = context.userId;
        patch.closedAt = now;
        eventType = 'WorkOrder.Closed';
        break;
      }
      case 'REOPEN': {
        this.require(input.reason, 'REASON_REQUIRED', 'REOPEN phải kèm lý do');
        // The previous cycle's decision stays frozen; the reopen opens the NEXT one, so the
        // verification that has already happened can never be overwritten (DB-119).
        cycleView = await this.openClosureCycle(
          manager, context, workOrder, input.reason!, input.evidenceRefs ?? [], true
        );
        // Reopening puts the asset back out of service: the verification, the closure and the
        // return-to-service evidence of the previous cycle no longer describe this work order.
        // They are not lost — the frozen DB-119 cycle keeps them.
        patch.verifiedBy = null;
        patch.verifiedAt = null;
        patch.closedBy = null;
        patch.closedAt = null;
        patch.returnToServiceRef = null;
        eventType = 'WorkOrder.Reopened';
        break;
      }
      case 'CANCEL': {
        this.require(input.reason, 'REASON_REQUIRED', 'CANCEL phải kèm lý do');
        patch.cancelledBy = context.userId;
        patch.cancelledAt = now;
        patch.cancelReason = input.reason!;
        eventType = 'WorkOrder.Cancelled';
        break;
      }
    }

    await withConstraintMap(
      () => orders.update({ id: workOrder.id, tenantId: context.tenantId }, patch),
      {
        ck_work_order_verifier_independent: () => unprocessable(
          'SOD_CONFLICT', 'Người thực hiện công việc không được tự xác nhận/đóng work order'
        ),
        ck_work_order_closed: () => unprocessable(
          'RETURN_TO_SERVICE_REQUIRED',
          'CLOSE phải ghi nhận bằng chứng bàn giao trở lại vận hành'
        ),
        ck_work_order_permit_required: () => unprocessable(
          'PTW_NOT_VALID', 'Công việc này yêu cầu permit to work còn hiệu lực'
        ),
        ck_work_order_hold_reason: () => unprocessable(
          'REASON_REQUIRED', 'HOLD phải kèm lý do'
        )
      }
    );
    const updated = await orders.findOneByOrFail({
      id: workOrder.id, tenantId: context.tenantId
    });
    await emit(this.outbox, manager, context, 'WorkOrder', updated.id, updated.versionNo,
      eventType, {
        siteId: updated.siteId, assetId: updated.assetId, code: updated.code,
        status: updated.status, priority: updated.priority,
        assigneeId: updated.assigneeId, verifiedBy: updated.verifiedBy,
        returnToServiceRef: updated.returnToServiceRef,
        summary: `Work order ${updated.code} → ${updated.status}`
      });
    return { ...this.workOrderView(updated), closureCycle: cycleView };
  }

  /**
   * RAISE_WARRANTY_CLAIM — appends a DB-088 row. No `warrantyId`: DB-083 is deliberately not part
   * of the schema (nothing in the catalog can populate it), so a claim keys on the asset and the
   * work order that found the failure.
   */
  private async raiseWarrantyClaim(
    manager: EntityManager, context: RequestContext, workOrder: WorkOrderEntity,
    input: WorkOrderCommandDto
  ) {
    if (!WARRANTY_CLAIM_STATES.includes(workOrder.status)) {
      throw unprocessable(
        'INVALID_STATE_TRANSITION',
        `Work order đang ${workOrder.status} không thể lập yêu cầu bảo hành`
      );
    }
    this.require(input.claimCode, 'CLAIM_CODE_REQUIRED', 'Yêu cầu bảo hành phải có mã');
    this.require(
      input.failureDescription, 'FAILURE_DESCRIPTION_REQUIRED', 'Phải mô tả hư hỏng'
    );
    const claims = manager.getRepository(WarrantyClaimEntity);
    const row = claims.create({
      id: randomUUID(), tenantId: context.tenantId, projectId: workOrder.projectId,
      siteId: workOrder.siteId, assetId: workOrder.assetId, workOrderId: workOrder.id,
      claimCode: input.claimCode!, failureDescription: input.failureDescription!,
      evidenceRefs: input.evidenceRefs ?? [], submittedAt: new Date(),
      submittedBy: context.userId, status: WarrantyClaimStatus.SUBMITTED,
      resolution: null, resolvedBy: null, resolvedAt: null,
      createdBy: context.userId, updatedBy: context.userId
    });
    const saved = await withConstraintMap(() => claims.save(row), {
      uq_warranty_claim_code: () => conflict(
        'WARRANTY_CLAIM_CODE_CONFLICT', 'Mã yêu cầu bảo hành đã tồn tại trong tenant'
      )
    });
    await emit(this.outbox, manager, context, 'WarrantyClaim', saved.id, saved.versionNo,
      'WarrantyClaim.Raised', {
        siteId: saved.siteId, assetId: saved.assetId, workOrderId: saved.workOrderId,
        claimCode: saved.claimCode, status: saved.status,
        summary: `Warranty claim ${saved.claimCode} raised`
      });
    return {
      ...this.workOrderView(workOrder), closureCycle: null,
      warrantyClaim: this.warrantyClaimView(saved)
    };
  }

  /**
   * Opens the next DB-119 cycle. COMPLETE reuses an already-open cycle instead of opening a second
   * one, because a REOPEN has already opened the cycle that the next verification will decide; the
   * partial unique index guarantees at most one undecided cycle either way.
   */
  private async openClosureCycle(
    manager: EntityManager, context: RequestContext, workOrder: WorkOrderEntity,
    comment: string, evidenceRefs: string[], mustBeNew = false
  ): Promise<Record<string, unknown>> {
    const cycles = manager.getRepository(WorkOrderClosureCycleEntity);
    const open = await cycles.findOneBy({
      tenantId: context.tenantId, workOrderId: workOrder.id, decision: IsNull()
    });
    if (open) {
      if (mustBeNew) {
        throw conflict(
          'CLOSURE_CYCLE_OPEN', 'Work order này đang có chu kỳ nghiệm thu chưa được quyết định'
        );
      }
      return this.cycleView(open);
    }
    const [next] = await manager.query<Array<{ next: number }>>(
      `SELECT (COALESCE(MAX(sequence_no), 0) + 1)::int AS "next"
      FROM work_order_closure_cycles WHERE tenant_id = $1 AND work_order_id = $2`,
      [context.tenantId, workOrder.id]
    );
    const id = randomUUID();
    await withConstraintMap(
      () => cycles.insert({
        id, tenantId: context.tenantId, projectId: workOrder.projectId,
        workOrderId: workOrder.id, sequenceNo: next.next, requestComment: comment,
        requestEvidenceRefs: evidenceRefs, requestedBy: context.userId, requestedAt: new Date(),
        decision: null, decisionComment: null, decidedBy: null, decidedAt: null
      }),
      {
        uq_work_order_closure_cycle_open: () => conflict(
          'CLOSURE_CYCLE_OPEN', 'Work order này đang có chu kỳ nghiệm thu chưa được quyết định'
        ),
        uq_work_order_closure_cycle_sequence: () => conflict(
          'CLOSURE_CYCLE_CONFLICT', 'Trình tự chu kỳ vừa được cấp bởi yêu cầu khác'
        )
      }
    );
    const saved = await cycles.findOneByOrFail({ id, tenantId: context.tenantId });
    return this.cycleView(saved);
  }

  private async decideClosureCycle(
    manager: EntityManager, context: RequestContext, workOrder: WorkOrderEntity, comment: string
  ): Promise<Record<string, unknown>> {
    const cycles = manager.getRepository(WorkOrderClosureCycleEntity);
    const open = await cycles.createQueryBuilder('cycle')
      .setLock('pessimistic_write')
      .where(
        'cycle.tenantId = :tenantId AND cycle.workOrderId = :workOrderId AND cycle.decision IS NULL',
        { tenantId: context.tenantId, workOrderId: workOrder.id }
      )
      .getOne();
    if (!open) {
      throw unprocessable('NO_OPEN_CYCLE', 'Work order này không có chu kỳ nghiệm thu đang chờ');
    }
    if (open.requestedBy === context.userId) {
      throw unprocessable(
        'SOD_CONFLICT', 'Người yêu cầu nghiệm thu không được tự quyết định chu kỳ'
      );
    }
    await withConstraintMap(
      () => cycles.update(
        { id: open.id, tenantId: context.tenantId },
        {
          decision: WorkOrderClosureDecision.APPROVE, decisionComment: comment,
          decidedBy: context.userId, decidedAt: new Date()
        }
      ),
      {
        ck_work_order_closure_cycle_sod: () => unprocessable(
          'SOD_CONFLICT', 'Người yêu cầu nghiệm thu không được tự quyết định chu kỳ'
        )
      }
    );
    const decided = await cycles.findOneByOrFail({ id: open.id, tenantId: context.tenantId });
    return this.cycleView(decided);
  }

  /** SEC-108/SEC-109 at service level; `ck_work_order_verifier_independent` repeats it in SQL. */
  private assertIndependent(context: RequestContext, workOrder: WorkOrderEntity): void {
    if (context.userId === workOrder.assigneeId || context.userId === workOrder.completedBy) {
      throw unprocessable(
        'SOD_CONFLICT', 'Người thực hiện công việc không được tự xác nhận/đóng work order'
      );
    }
  }

  /** Loads the permit and runs the pure evaluator; `null` means the permit authorizes the work. */
  private async checkPermit(
    manager: EntityManager, context: RequestContext, permitToWorkId: string | null,
    requiredSiteId: string, at = new Date()
  ): Promise<PermitRejection | null> {
    if (!permitToWorkId) return evaluatePermitValidity(null, requiredSiteId, at);
    const permit = await manager.getRepository(PermitToWorkEntity).findOneBy({
      id: permitToWorkId, tenantId: context.tenantId
    });
    return evaluatePermitValidity(
      permit === null ? null : {
        status: permit.status, siteId: permit.siteId,
        validFrom: permit.validFrom, validTo: permit.validTo
      },
      requiredSiteId, at
    );
  }

  private permitMessage(rejection: PermitRejection, onCreate: boolean): string {
    const detail = {
      MISSING: 'chưa khai báo permit to work',
      SITE: 'permit to work không thuộc site của asset',
      STATUS: 'permit to work chưa được cấp hoặc không còn hiệu lực',
      WINDOW: 'permit to work nằm ngoài thời hạn hiệu lực'
    }[rejection];
    return onCreate
      ? `Công việc này yêu cầu permit to work hợp lệ: ${detail}`
      : `Không thể bắt đầu công việc: ${detail}`;
  }

  /** Maintenance-plan summaries and warranty-claim counts for exactly the rows on this page. */
  private async pageContext(
    manager: EntityManager, context: RequestContext, page: WorkOrderEntity[]
  ): Promise<{
    plans: Map<string, Record<string, unknown>>;
    claimCounts: Map<string, number>;
  }> {
    const plans = new Map<string, Record<string, unknown>>();
    const claimCounts = new Map<string, number>();
    if (page.length === 0) return { plans, claimCounts };
    const planIds = [...new Set(
      page.map((row) => row.maintenancePlanId).filter((value): value is string => value !== null)
    )];
    if (planIds.length > 0) {
      const rows = await manager.getRepository(MaintenancePlanEntity).findBy({
        tenantId: context.tenantId, id: In(planIds)
      });
      for (const row of rows) {
        plans.set(row.id, {
          id: row.id, planType: row.planType, version: row.version,
          triggerType: row.triggerType, intervalValue: row.intervalValue,
          intervalUnit: row.intervalUnit, status: row.status,
          nextDueAt: row.nextDueAt === null ? null : row.nextDueAt.toISOString()
        });
      }
    }
    const counts = await manager.query<Array<{ workOrderId: string; total: string }>>(
      `SELECT work_order_id AS "workOrderId", count(*)::text AS total
      FROM warranty_claims
      WHERE tenant_id = $1 AND work_order_id = ANY($2::uuid[])
      GROUP BY work_order_id`,
      [context.tenantId, page.map((row) => row.id)]
    );
    for (const row of counts) claimCounts.set(row.workOrderId, Number(row.total));
    return { plans, claimCounts };
  }

  /**
   * Counts rows of one O&M table for one asset, grouped by its state column. The table and column
   * names come from a closed set of literals at every call site, never from request input.
   */
  private async countBy(
    manager: EntityManager, table: 'work_orders' | 'service_incidents' | 'alarm_cases',
    stateColumn: 'status' | 'state', assetColumn: 'asset_id', tenantId: string, assetId: string
  ): Promise<Record<string, number>> {
    const rows = await manager.query<Array<{ value: string; total: string }>>(
      `SELECT ${stateColumn} AS value, count(*)::text AS total FROM ${table}
      WHERE tenant_id = $1 AND ${assetColumn} = $2 GROUP BY ${stateColumn}`,
      [tenantId, assetId]
    );
    return Object.fromEntries(rows.map((row) => [row.value, Number(row.total)]));
  }

  private async lockWorkOrder(
    manager: EntityManager, context: RequestContext, workOrderId: string, scope: AccessScopeSets
  ): Promise<WorkOrderEntity> {
    const workOrder = await manager.getRepository(WorkOrderEntity)
      .createQueryBuilder('workOrder')
      .setLock('pessimistic_write')
      .where('workOrder.id = :id AND workOrder.tenantId = :tenantId', {
        id: workOrderId, tenantId: context.tenantId
      })
      .getOne();
    if (!workOrder || !inScope(workOrder.projectId, scope)) {
      throw notFound('WORK_ORDER_NOT_FOUND', 'Không tìm thấy work order');
    }
    return workOrder;
  }

  /**
   * Asset visibility. An asset sits on a site and a site belongs to a project, so the project is
   * the ABAC anchor: `role_assignments` has no ASSET or SITE scope type and this slice does not
   * invent one. Out of reach reads as missing.
   */
  private async resolveAsset(
    manager: EntityManager, context: RequestContext, assetId: string, scope: AccessScopeSets
  ): Promise<AssetEntity> {
    const asset = await manager.getRepository(AssetEntity).findOneBy({
      id: assetId, tenantId: context.tenantId
    });
    if (!asset || !inScope(asset.projectId, scope)) {
      throw notFound('ASSET_NOT_FOUND', 'Không tìm thấy asset');
    }
    return asset;
  }

  private async assertUserExists(
    manager: EntityManager, context: RequestContext, userId: string
  ): Promise<void> {
    const exists = await manager.getRepository(UserAccountEntity).existsBy({
      id: userId, tenantId: context.tenantId
    });
    if (!exists) throw unprocessable('ASSIGNEE_NOT_FOUND', 'Người thực hiện không thuộc tenant này');
  }

  private require(value: unknown, code: string, message: string): void {
    if (value === undefined || value === null || value === '') {
      throw unprocessable(code, message);
    }
  }

  private workOrderView(row: WorkOrderEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, assetId: row.assetId,
      serviceIncidentId: row.serviceIncidentId, maintenancePlanId: row.maintenancePlanId,
      permitToWorkId: row.permitToWorkId, code: row.code, workType: row.workType,
      title: row.title, description: row.description, priority: row.priority,
      status: row.status, requiresPermit: row.requiresPermit, assigneeId: row.assigneeId,
      scheduledAt: row.scheduledAt === null ? null : row.scheduledAt.toISOString(),
      dispatchedBy: row.dispatchedBy,
      dispatchedAt: row.dispatchedAt === null ? null : row.dispatchedAt.toISOString(),
      startedBy: row.startedBy,
      startedAt: row.startedAt === null ? null : row.startedAt.toISOString(),
      holdReason: row.holdReason, completedBy: row.completedBy,
      completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
      workSummary: row.workSummary, verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt === null ? null : row.verifiedAt.toISOString(),
      returnToServiceRef: row.returnToServiceRef, closedBy: row.closedBy,
      closedAt: row.closedAt === null ? null : row.closedAt.toISOString(),
      cancelledBy: row.cancelledBy,
      cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
      cancelReason: row.cancelReason, versionNo: row.versionNo,
      createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private cycleView(row: WorkOrderClosureCycleEntity) {
    return {
      id: row.id, workOrderId: row.workOrderId, sequenceNo: row.sequenceNo,
      requestComment: row.requestComment, requestEvidenceRefs: row.requestEvidenceRefs,
      requestedBy: row.requestedBy, requestedAt: row.requestedAt.toISOString(),
      decision: row.decision, decisionComment: row.decisionComment, decidedBy: row.decidedBy,
      decidedAt: row.decidedAt === null ? null : row.decidedAt.toISOString()
    };
  }

  private warrantyClaimView(row: WarrantyClaimEntity) {
    return {
      id: row.id, projectId: row.projectId, siteId: row.siteId, assetId: row.assetId,
      workOrderId: row.workOrderId, claimCode: row.claimCode,
      failureDescription: row.failureDescription, evidenceRefs: row.evidenceRefs,
      submittedAt: row.submittedAt.toISOString(), submittedBy: row.submittedBy,
      status: row.status, resolution: row.resolution, resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }
}
