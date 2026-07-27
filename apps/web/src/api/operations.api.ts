import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  AcknowledgeAlarmCaseRequest, AlarmCaseCommandResponse, AlarmCaseListQuery,
  AlarmCaseListResponse, AssetPerformanceResponse, CreateServiceIncidentRequest,
  CreateWorkOrderRequest, ServiceIncidentCommandResponse, ServiceIncidentListQuery,
  ServiceIncidentListResponse, WorkOrderCommandRequest, WorkOrderCommandResponse,
  WorkOrderCreateResponse, WorkOrderListQuery, WorkOrderListResponse
} from '@/types/operations.types';

/**
 * O&M transport (API-114…API-121).
 *
 * Every command carries an Idempotency-Key of 8–200 characters; the four reads carry none. The
 * acknowledge and command paths are colon-suffixed / action-suffixed exactly as the controller
 * declares them, because a near-miss path is a 404 that looks like a permission problem.
 *
 * This module can only ever reach the seven O&M operations below. There is no route here — and
 * none anywhere in PM Web — that clears, resets, suppresses or otherwise writes to an OT source
 * alarm, and none that sends a control command to BESS/PCS/BMS/EMS/SCADA (AGENTS.md §10/§11).
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method: 'POST', auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const operationsApi = {
  /** API-114 — the LOCAL alarm-case register of one site. */
  listAlarmCases(
    auth: ApiAuthContext, siteId: string, query: AlarmCaseListQuery = {}
  ): Promise<AlarmCaseListResponse> {
    return httpClient.request(withQuery(`/v1/sites/${siteId}/alarm-cases`, query), {
      method: 'GET', auth
    });
  },

  /**
   * API-115 — acknowledge the LOCAL case. The body carries the optimistic-lock version and an
   * optional local note; there is no source identifier to send because the operation has no
   * source-side effect at all. A replay answers 200 with `acknowledgementApplied: false`.
   */
  acknowledgeAlarmCase(
    auth: ApiAuthContext, alarmCaseId: string, input: AcknowledgeAlarmCaseRequest, key: string
  ): Promise<AlarmCaseCommandResponse> {
    return command(auth, `/v1/alarm-cases/${alarmCaseId}:acknowledge`, input, key);
  },

  /** API-116 — the service-incident / SLA register of one site. */
  listServiceIncidents(
    auth: ApiAuthContext, siteId: string, query: ServiceIncidentListQuery = {}
  ): Promise<ServiceIncidentListResponse> {
    return httpClient.request(withQuery(`/v1/sites/${siteId}/service-incidents`, query), {
      method: 'GET', auth
    });
  },

  /** API-117 — open a service incident; it is born OPEN, downtime and SLA clocks optional. */
  createServiceIncident(
    auth: ApiAuthContext, siteId: string, input: CreateServiceIncidentRequest, key: string
  ): Promise<ServiceIncidentCommandResponse> {
    return command(auth, `/v1/sites/${siteId}/service-incidents`, input, key);
  },

  /** API-118 — the work-order register of one asset with maintenance/warranty context. */
  listWorkOrders(
    auth: ApiAuthContext, assetId: string, query: WorkOrderListQuery = {}
  ): Promise<WorkOrderListResponse> {
    return httpClient.request(withQuery(`/v1/assets/${assetId}/work-orders`, query), {
      method: 'GET', auth
    });
  },

  /** API-119 — create a work order; a permit-required job without a live permit is 422. */
  createWorkOrder(
    auth: ApiAuthContext, assetId: string, input: CreateWorkOrderRequest, key: string
  ): Promise<WorkOrderCreateResponse> {
    return command(auth, `/v1/assets/${assetId}/work-orders`, input, key);
  },

  /**
   * API-120 — the closed command union. The server re-checks the SoD independence rule on VERIFY
   * and CLOSE whatever the UI decided to show, and `ck_work_order_verifier_independent` refuses it
   * again in SQL.
   */
  workOrderCommand(
    auth: ApiAuthContext, workOrderId: string, input: WorkOrderCommandRequest, key: string
  ): Promise<WorkOrderCommandResponse> {
    return command(auth, `/v1/work-orders/${workOrderId}/actions`, input, key);
  },

  /**
   * API-121 — asset performance. The response carries counts of rows this database can prove and
   * `kpi: null` / `telemetry: null` for everything it cannot: no telemetry store exists on this
   * side of the OT boundary. The client passes both through untouched — substituting a 0 here
   * would turn "not measured" into "measured as zero".
   */
  getAssetPerformance(auth: ApiAuthContext, assetId: string): Promise<AssetPerformanceResponse> {
    return httpClient.request(`/v1/assets/${assetId}/performance`, { method: 'GET', auth });
  }
};
