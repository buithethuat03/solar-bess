import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  AuditEventListQuery, AuditEventListResponse, CreateReportJobRequest, CreateSavedViewRequest,
  IdentityPermissionsResponse, ReportJobResponse, SavedViewCommandResponse, SavedViewListQuery,
  SavedViewListResponse, SearchRequest, SearchResponse
} from '@/types/search.types';

/**
 * Search, Reporting and the two Identity-admin reads the same screen depends on
 * (API-130…API-134 + API-002 `me/permissions` + API-013 `audit-events`).
 *
 * The identity pair lives here rather than in its own module because it has no screen of its own:
 * `me/permissions` is what lets the search screen explain an empty branch honestly ("you cannot
 * read that register" rather than "there is nothing there"), and `audit-events` is the trail of the
 * commands this screen queues. Both are reads, so neither carries a command header.
 *
 * API-130 is a POST that is semantically a READ — safe-body search, no side effect — so it
 * deliberately does NOT send an Idempotency-Key. Only the two real commands (create saved view,
 * create report job) do.
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method: 'POST', auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const searchApi = {
  /**
   * API-130 — one relational query across the implemented registers. A register the caller cannot
   * read is silently absent from the results; search is never allowed to become a 403 oracle, so
   * there is no per-type error for the UI to render.
   */
  search(auth: ApiAuthContext, input: SearchRequest): Promise<SearchResponse> {
    return httpClient.request<SearchResponse, SearchRequest>('/v1/search', {
      method: 'POST', auth, body: input
    });
  },

  /** API-131 — the caller's own saved views. There is nothing else to list: all views are private. */
  listSavedViews(
    auth: ApiAuthContext, query: SavedViewListQuery = {}
  ): Promise<SavedViewListResponse> {
    return httpClient.request(withQuery('/v1/saved-views', query), { method: 'GET', auth });
  },

  /**
   * API-132 — create a saved view. `shareScope` is never sent: V1 supports PRIVATE only and the
   * server assigns it. Sending anything else is refused with 422 SHARE_SCOPE_NOT_SUPPORTED, so the
   * request type has no field for it and the UI offers no share control.
   */
  createSavedView(
    auth: ApiAuthContext, input: CreateSavedViewRequest, key: string
  ): Promise<SavedViewCommandResponse> {
    return command(auth, '/v1/saved-views', input, key);
  },

  /** API-133 — queue a register export after the server proves the caller can read it NOW. */
  createReportJob(
    auth: ApiAuthContext, input: CreateReportJobRequest, key: string
  ): Promise<ReportJobResponse> {
    return command(auth, '/v1/report-jobs', input, key);
  },

  /**
   * API-134 — requester-only status. A completed job resolves to `download: { bucket, objectKey }`
   * and never to a URL: no presigner is installed in this build, and the client will not invent a
   * link that would 404 or, worse, look downloadable to someone who no longer has the permission.
   */
  getReportJob(auth: ApiAuthContext, reportJobId: string): Promise<ReportJobResponse> {
    return httpClient.request(`/v1/report-jobs/${reportJobId}`, { method: 'GET', auth });
  },

  /** API-002 — the caller's effective roles/permissions/scopes and the policy version behind them. */
  mePermissions(auth: ApiAuthContext): Promise<IdentityPermissionsResponse> {
    return httpClient.request('/v1/me/permissions', { method: 'GET', auth });
  },

  /** API-013 — the tenant audit trail, filterable by object, actor, action and time window. */
  listAuditEvents(
    auth: ApiAuthContext, query: AuditEventListQuery = {}
  ): Promise<AuditEventListResponse> {
    return httpClient.request(withQuery('/v1/audit-events', query), { method: 'GET', auth });
  }
};
