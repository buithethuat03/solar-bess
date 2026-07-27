/**
 * Search & Reporting (API-130…API-134) plus the two Identity-admin reads the same screen needs
 * (API-002 `me/permissions`, API-013 `audit-events`).
 *
 * Three contract facts the types make explicit:
 *
 * - **Saved views are PRIVATE and only PRIVATE.** `SavedViewShareScope` is a one-member union, so
 *   there is no other value a share control could even bind to. V1 refuses anything else with
 *   422 SHARE_SCOPE_NOT_SUPPORTED (`ck_saved_view_share_scope`).
 * - **A report job resolves to an object reference, not a URL.** No S3 presigner is installed in
 *   this build, so `download` is `{ bucket, objectKey }` — the UI renders that reference and never
 *   fabricates a link out of it.
 * - **Search never turns authorization into a probe.** A register the caller cannot read is simply
 *   absent from the result set; there is no per-type error to model.
 */

export type SearchResultType =
  'PROJECT' | 'DOCUMENT' | 'RISK' | 'ISSUE' | 'CHANGE_REQUEST' | 'CONTRACT';

/** DB-106 — a saved view can only target a register that actually has a queryable endpoint. */
export type SavedViewTargetType = SearchResultType;

/** One member on purpose. Widening it is a future approval gate, not a UI decision. */
export type SavedViewShareScope = 'PRIVATE';

export type ReportType = 'RISK_REGISTER_CSV' | 'DOCUMENT_REGISTER_CSV';

export type ReportJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/** Only register identity columns leave the database — never file content or a snippet. */
export interface SearchResultRow {
  type: SearchResultType;
  id: string;
  code: string;
  title: string;
  projectId: string;
}

export interface SavedViewView {
  id: string;
  name: string;
  targetType: SavedViewTargetType;
  filterSnapshot: Record<string, unknown>;
  columnSnapshot: string[];
  sortSnapshot: Record<string, unknown>[];
  shareScope: SavedViewShareScope;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

/** The stable object reference of a completed export. Not a URL, and not turned into one. */
export interface ReportJobObjectRef {
  bucket: string;
  objectKey: string;
}

export interface ReportJobView {
  id: string;
  reportType: ReportType;
  filterSnapshot: Record<string, unknown>;
  status: ReportJobStatus;
  dataAsOf: string | null;
  errorCode: string | null;
  expiresAt: string | null;
  requestedBy: string;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Null until the worker completes, the module permission still passes at read time and the
   * retention window has not lapsed. API-134 re-checks all three on every read.
   */
  download: ReportJobObjectRef | null;
}

/** API-002 — the caller's effective access, with the catalog release that produced the answer. */
export interface IdentityPermissionScope {
  roleCode: string;
  permissions: string[];
  scopeType: 'TENANT' | 'PORTFOLIO' | 'PROJECT' | 'PACKAGE';
  scopeId: string | null;
}

export interface IdentityPermissionsData {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  scopes: IdentityPermissionScope[];
  /** Highest policy version among the caller's ACTIVE roles; 0 means no roles at all. */
  policyVersion: number;
}

/** API-013 — tenant-scoped audit trail. Platform rows (tenant_id NULL) are unreachable here. */
export interface AuditEventView {
  id: string;
  actorId: string | null;
  action: string;
  result: string;
  reasonCode: string | null;
  objectType: string | null;
  objectId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

export interface SearchPageMeta {
  limit: number;
}

export interface CursorPageMeta {
  limit: number;
  nextCursor: string | null;
}

export interface SearchRequest {
  /** 2–200 characters; codes match as a prefix, titles as a contains. */
  query: string;
  types?: SearchResultType[];
  limit?: number;
}

export interface SavedViewListQuery {
  cursor?: string;
  limit?: number;
  targetType?: SavedViewTargetType;
}

/**
 * `shareScope` is intentionally absent: V1 has exactly one scope and the server assigns it. A
 * field here would imply a choice the product does not offer.
 */
export interface CreateSavedViewRequest {
  name: string;
  targetType: SavedViewTargetType;
  filterSnapshot?: Record<string, unknown>;
  columnSnapshot?: string[];
  sortSnapshot?: Record<string, unknown>[];
}

export interface CreateReportJobRequest {
  reportType: ReportType;
  projectId: string;
}

export interface AuditEventListQuery {
  cursor?: string;
  limit?: number;
  objectType?: string;
  objectId?: string;
  actorId?: string;
  action?: string;
  occurredFrom?: string;
  occurredTo?: string;
}

export interface SearchResponse {
  data: SearchResultRow[];
  meta: SearchPageMeta;
  correlationId: string;
}

export interface SavedViewListResponse {
  data: SavedViewView[];
  meta: CursorPageMeta;
  correlationId: string;
}

export interface SavedViewCommandResponse {
  data: SavedViewView;
  correlationId: string;
}

export interface ReportJobResponse {
  data: ReportJobView;
  correlationId: string;
}

export interface IdentityPermissionsResponse {
  data: IdentityPermissionsData;
  correlationId: string;
}

export interface AuditEventListResponse {
  data: AuditEventView[];
  meta: CursorPageMeta;
  correlationId: string;
}
