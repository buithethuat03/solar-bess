import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  CreateDailyLogRequest, CreatePermitToWorkRequest, DailyLogCommandResponse, HseIncidentResponse,
  InspectionCommandRequest, InspectionCommandResponse, IssuePermitToWorkRequest, NcrCommandRequest,
  NcrCommandResponse, PermitToWorkResponse, PunchCommandRequest, PunchCommandResponse,
  QuantityProgressResponse, RecordQuantityProgressRequest, ReleaseWorkfrontRequest,
  ReportHseIncidentRequest, StopWorkActionRequest, StopWorkActionResponse, SubmitDailyLogRequest,
  WorkfrontCommandResponse, WorkfrontListQuery, WorkfrontListResponse
} from '@/types/field-hse.types';

/**
 * Every Field/HSE/Quality command is a POST carrying an Idempotency-Key of 8–200 characters; the
 * API answers `IDEMPOTENCY_KEY_REQUIRED` (400) without one. Quantities travel as strings and are
 * serialized untouched — this module never converts them.
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method: 'POST', auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const fieldHseApi = {
  /** API-086 — workfront/readiness register with a status filter and cursor pagination. */
  listWorkfronts(
    auth: ApiAuthContext, projectId: string, query: WorkfrontListQuery = {}
  ): Promise<WorkfrontListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/workfronts`, query), {
      method: 'GET', auth
    });
  },

  /**
   * API-087 — release a workfront. READY + GATES_CLEARED only, and refused with
   * `STOP_WORK_ACTIVE` (422) while any unlifted stop-work covers it, its site or its project.
   */
  releaseWorkfront(
    auth: ApiAuthContext, workfrontId: string, input: ReleaseWorkfrontRequest, key: string
  ): Promise<WorkfrontCommandResponse> {
    return command(auth, `/v1/workfronts/${workfrontId}:release`, input, key);
  },

  /**
   * API-088 — create a daily log, or correct a SIGNED one. With `correctionOfId` the server writes
   * a NEW row at revision + 1 and supersedes the original in the same transaction; `reason` is
   * mandatory on that path.
   */
  createDailyLog(
    auth: ApiAuthContext, projectId: string, input: CreateDailyLogRequest, key: string
  ): Promise<DailyLogCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/daily-logs`, input, key);
  },

  /** API-089 — SUBMIT (DRAFT → SUBMITTED) or SIGN (SUBMITTED → SIGNED with a legal snapshot). */
  submitDailyLog(
    auth: ApiAuthContext, dailyLogId: string, input: SubmitDailyLogRequest, key: string
  ): Promise<DailyLogCommandResponse> {
    return command(auth, `/v1/daily-logs/${dailyLogId}:submit`, input, key);
  },

  /** API-090 — append one quantity row; corrections and certifications are appends, never edits. */
  recordQuantityProgress(
    auth: ApiAuthContext, workfrontId: string, input: RecordQuantityProgressRequest, key: string
  ): Promise<QuantityProgressResponse> {
    return command(auth, `/v1/workfronts/${workfrontId}/quantity-progress`, input, key);
  },

  /** API-091 — request a permit to work; it is born REQUESTED with the caller as requester. */
  createPermitToWork(
    auth: ApiAuthContext, workfrontId: string, input: CreatePermitToWorkRequest, key: string
  ): Promise<PermitToWorkResponse> {
    return command(auth, `/v1/workfronts/${workfrontId}/permits-to-work`, input, key);
  },

  /**
   * API-092 — issue a permit. The requester can never be the issuer (`SOD_CONFLICT`) and an
   * unlifted stop-work over the permit's reach refuses the issue (`STOP_WORK_ACTIVE`).
   */
  issuePermitToWork(
    auth: ApiAuthContext, permitToWorkId: string, input: IssuePermitToWorkRequest, key: string
  ): Promise<PermitToWorkResponse> {
    return command(auth, `/v1/permits-to-work/${permitToWorkId}:issue`, input, key);
  },

  /**
   * API-093 — report an HSE incident. Never gated on any aggregate state: the only failures are
   * 400 (validation), 404 (invisible project), 409 (idempotency) and 500.
   */
  reportHseIncident(
    auth: ApiAuthContext, projectId: string, input: ReportHseIncidentRequest, key: string
  ): Promise<HseIncidentResponse> {
    return command(auth, `/v1/projects/${projectId}/hse-incidents`, input, key);
  },

  /**
   * API-094 — append one stop-work ISSUE or LIFT. The route admits either half of the split
   * permission; the service re-checks `stopWork.issue` / `stopWork.lift` against the body.
   */
  recordStopWorkAction(
    auth: ApiAuthContext, projectId: string, input: StopWorkActionRequest, key: string
  ): Promise<StopWorkActionResponse> {
    return command(auth, `/v1/projects/${projectId}/stop-work-actions`, input, key);
  },

  /**
   * API-095 — multiplexed inspection command. REQUEST opens a hold-point inspection (the first
   * command for an unknown path id materializes the ITP from that ISSUED + CLEAN document
   * revision); RECORD writes the immutable result exactly once.
   */
  inspectionCommand(
    auth: ApiAuthContext, itpId: string, input: InspectionCommandRequest, key: string
  ): Promise<InspectionCommandResponse> {
    return command(auth, `/v1/inspection-test-plans/${itpId}/inspections`, input, key);
  },

  /** API-096 — the whole NCR/CAPA lifecycle as one multiplexed command endpoint. */
  ncrCommand(
    auth: ApiAuthContext, projectId: string, input: NcrCommandRequest, key: string
  ): Promise<NcrCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/ncrs`, input, key);
  },

  /** API-097 — the punch lifecycle as one multiplexed command endpoint. */
  punchCommand(
    auth: ApiAuthContext, projectId: string, input: PunchCommandRequest, key: string
  ): Promise<PunchCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/punch-items`, input, key);
  }
};
