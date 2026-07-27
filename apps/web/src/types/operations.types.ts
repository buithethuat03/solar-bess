/**
 * O&M (API-114…API-121) wire types.
 *
 * Two boundaries this file exists to keep visible in the type system:
 *
 * 1. **API-121 has no measurement source.** `kpi` and `telemetry` are typed `null`, not
 *    `number | null` and not `Record<string, number>`. PM Web sits on the read-only side of the OT
 *    boundary (AGENTS.md §10/§11) and DB-091/DB-092 live in a separate OT store, so there is no
 *    shape a KPI could arrive in. Typing them `null` makes "render a zero" a compile error rather
 *    than a judgement call.
 * 2. **Acknowledging is local.** `AcknowledgeAlarmCaseRequest` carries an optimistic-lock version
 *    and a local note and nothing else — there is deliberately no source event id, no clear, no
 *    reset and no suppress field, because API-115 has none either (SEC-127/SEC-128).
 */

/** DB-086 — the eleven WF-024 states. `APPROVED` is storable but no V1 operation writes it. */
export type WorkOrderStatus =
  | 'DRAFT' | 'APPROVED' | 'SCHEDULED' | 'DISPATCHED' | 'IN_PROGRESS' | 'ON_HOLD'
  | 'COMPLETE' | 'VERIFIED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';

export type WorkOrderPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** DB-084 — local case lifecycle. No value here says anything about the OT source alarm. */
export type AlarmCaseState =
  'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED' | 'REOPENED';

export type AlarmCaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ServiceIncidentStatus =
  'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED' | 'CLOSED';

export type ServiceIncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** API-120 — the closed command union; nine transitions plus the warranty-claim append. */
export type WorkOrderCommandType =
  | 'DISPATCH' | 'START' | 'HOLD' | 'RESUME' | 'COMPLETE' | 'VERIFY' | 'CLOSE'
  | 'REOPEN' | 'CANCEL' | 'RAISE_WARRANTY_CLAIM';

export type WorkOrderClosureDecision = 'APPROVE' | 'RETURN';

export type WarrantyClaimStatus =
  'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export type MaintenancePlanStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export type MaintenancePlanTriggerType = 'TIME' | 'USAGE' | 'CONDITION';

export interface AlarmCaseView {
  id: string;
  projectId: string;
  siteId: string;
  assetId: string | null;
  severity: AlarmCaseSeverity;
  state: AlarmCaseState;
  ownerId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Opaque logical ids into the OT event store — never a payload, tag, gateway or endpoint. */
  sourceEventRefs: string[];
  /** Copied verbatim from the gateway contract; PM Web owns no vocabulary for it. */
  sourceQuality: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgmentNote: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * `acknowledgementApplied` is false on a replay: the first acknowledgement stands, the version is
 * not bumped and no second audit fact is written. A harmless no-op, not an error.
 */
export interface AlarmCaseAcknowledgeView extends AlarmCaseView {
  acknowledgementApplied: boolean;
}

export interface ServiceIncidentView {
  id: string;
  projectId: string;
  siteId: string;
  assetId: string | null;
  alarmCaseId: string | null;
  hseIncidentId: string | null;
  severity: ServiceIncidentSeverity;
  status: ServiceIncidentStatus;
  title: string;
  description: string | null;
  detectedAt: string;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  slaResponseDueAt: string | null;
  slaRespondedAt: string | null;
  slaResolutionDueAt: string | null;
  slaResolvedAt: string | null;
  resolutionSummary: string | null;
  reportedBy: string;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePlanSummary {
  id: string;
  planType: string;
  version: number;
  triggerType: MaintenancePlanTriggerType;
  intervalValue: number | null;
  intervalUnit: string | null;
  status: MaintenancePlanStatus;
  nextDueAt: string | null;
}

export interface WorkOrderView {
  id: string;
  projectId: string;
  siteId: string;
  assetId: string;
  serviceIncidentId: string | null;
  maintenancePlanId: string | null;
  permitToWorkId: string | null;
  code: string;
  workType: string;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  requiresPermit: boolean;
  assigneeId: string | null;
  scheduledAt: string | null;
  dispatchedBy: string | null;
  dispatchedAt: string | null;
  startedBy: string | null;
  startedAt: string | null;
  holdReason: string | null;
  /** SEC-108/SEC-109: neither this user nor `assigneeId` may VERIFY or CLOSE the work order. */
  completedBy: string | null;
  completedAt: string | null;
  workSummary: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  returnToServiceRef: string | null;
  closedBy: string | null;
  closedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** One API-118 page row: the work order plus the maintenance/warranty context of that row. */
export interface WorkOrderRegisterRow extends WorkOrderView {
  maintenancePlan: MaintenancePlanSummary | null;
  warrantyClaimCount: number;
}

/**
 * DB-119 — one append-only closure cycle. REOPEN opens the NEXT one; the previous cycle's decision
 * is frozen for good, so the UI renders cycles as history and never rewrites an earlier row.
 */
export interface WorkOrderClosureCycleView {
  id: string;
  workOrderId: string;
  sequenceNo: number;
  requestComment: string;
  requestEvidenceRefs: string[];
  requestedBy: string;
  requestedAt: string;
  decision: WorkOrderClosureDecision | null;
  decisionComment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface WarrantyClaimView {
  id: string;
  projectId: string;
  siteId: string;
  assetId: string;
  workOrderId: string;
  claimCode: string;
  failureDescription: string;
  evidenceRefs: string[];
  submittedAt: string;
  submittedBy: string;
  status: WarrantyClaimStatus;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** API-120 result: the resulting work order, the touched cycle and — for a claim — the DB-088 row. */
export interface WorkOrderCommandView extends WorkOrderView {
  closureCycle: WorkOrderClosureCycleView | null;
  warrantyClaim?: WarrantyClaimView;
}

export interface AssetIdentityView {
  id: string;
  projectId: string;
  siteId: string;
  equipmentId: string | null;
  assetCode: string;
  operationalStatus: string;
  activationDate: string | null;
}

/**
 * API-121. `workOrderCountsByStatus` and friends only ever contain statuses that actually have
 * rows — a status missing from the map means "no rows", which is why the UI must not backfill a
 * zero for the absent keys either.
 *
 * `kpi` and `telemetry` are `null` by contract. See the file header.
 */
export interface AssetPerformanceData {
  asset: AssetIdentityView;
  workOrderCountsByStatus: Record<string, number>;
  serviceIncidentCountsByStatus: Record<string, number>;
  alarmCaseCountsByState: Record<string, number>;
  kpi: null;
  telemetry: null;
}

export interface OperationsPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface AlarmCasePageMeta extends OperationsPageMeta {
  siteId: string;
}

export interface WorkOrderPageMeta extends OperationsPageMeta {
  assetId: string;
  siteId: string;
}

export interface AlarmCaseListQuery {
  cursor?: string;
  limit?: number;
  state?: AlarmCaseState;
  severity?: AlarmCaseSeverity;
  assetId?: string;
}

export interface ServiceIncidentListQuery {
  cursor?: string;
  limit?: number;
  status?: ServiceIncidentStatus;
  severity?: ServiceIncidentSeverity;
  assetId?: string;
}

export interface WorkOrderListQuery {
  cursor?: string;
  limit?: number;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
}

/** API-115 — local acknowledgement only. There is no source-side field, by design. */
export interface AcknowledgeAlarmCaseRequest {
  expectedVersion: number;
  note?: string;
}

export interface CreateServiceIncidentRequest {
  assetId?: string;
  alarmCaseId?: string;
  hseIncidentId?: string;
  severity: ServiceIncidentSeverity;
  title: string;
  description?: string;
  detectedAt: string;
  downtimeStart?: string;
  downtimeEnd?: string;
  slaResponseDueAt?: string;
  slaResolutionDueAt?: string;
}

export interface CreateWorkOrderRequest {
  code: string;
  workType: string;
  title: string;
  description?: string;
  priority: WorkOrderPriority;
  requiresPermit?: boolean;
  permitToWorkId?: string;
  assigneeUserId?: string;
  scheduledAt?: string;
  serviceIncidentId?: string;
  maintenancePlanId?: string;
}

/**
 * API-120 command body. Per-command required fields are enforced by the server (and by the
 * command panel, so no button is offered that the server is bound to refuse):
 * HOLD/CANCEL/REOPEN → `reason`; COMPLETE → `workSummary` + at least one `evidenceRefs`;
 * VERIFY → `reason`; CLOSE → `returnToServiceRef`; RAISE_WARRANTY_CLAIM → `claimCode` +
 * `failureDescription`.
 */
export interface WorkOrderCommandRequest {
  commandType: WorkOrderCommandType;
  expectedVersion: number;
  reason?: string;
  assigneeUserId?: string;
  permitToWorkId?: string;
  workSummary?: string;
  evidenceRefs?: string[];
  returnToServiceRef?: string;
  claimCode?: string;
  failureDescription?: string;
}

export interface AlarmCaseListResponse {
  data: AlarmCaseView[];
  meta: AlarmCasePageMeta;
  correlationId: string;
}

export interface AlarmCaseCommandResponse {
  data: AlarmCaseAcknowledgeView;
  correlationId: string;
}

export interface ServiceIncidentListResponse {
  data: ServiceIncidentView[];
  meta: AlarmCasePageMeta;
  correlationId: string;
}

export interface ServiceIncidentCommandResponse {
  data: ServiceIncidentView;
  correlationId: string;
}

export interface WorkOrderListResponse {
  data: WorkOrderRegisterRow[];
  meta: WorkOrderPageMeta;
  correlationId: string;
}

export interface WorkOrderCreateResponse {
  data: WorkOrderView;
  correlationId: string;
}

export interface WorkOrderCommandResponse {
  data: WorkOrderCommandView;
  correlationId: string;
}

export interface AssetPerformanceResponse {
  data: AssetPerformanceData;
  correlationId: string;
}
