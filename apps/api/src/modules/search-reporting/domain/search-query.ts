/**
 * Pure SQL builder for API-130 relational search.
 *
 * One statement, one UNION ALL branch per searched register, each branch carrying ITS OWN module
 * scope predicate — the exact shape that module's list endpoint enforces — so authorization is
 * decided inside the same query that paginates. A caller lacking a module's read permission gets
 * that branch omitted entirely (no rows, never a 403). No file content, no snippets: only the
 * register identity columns {type, id, code, title, projectId} ever leave the database.
 */

export type SearchResultType =
  | 'PROJECT' | 'DOCUMENT' | 'RISK' | 'ISSUE' | 'CHANGE_REQUEST' | 'CONTRACT';

export const SEARCH_RESULT_TYPES: readonly SearchResultType[] = [
  'PROJECT', 'DOCUMENT', 'RISK', 'ISSUE', 'CHANGE_REQUEST', 'CONTRACT'
];

/** Flattened ABAC reach of one module (same shape as PermissionService.accessScopeSets). */
export interface ModuleScope {
  tenantWide: boolean;
  projectIds: string[];
  packageIds: string[];
}

export interface SearchScopes {
  /**
   * project.read reach in the projectScopeIds shape: null = whole tenant, [] = no reach.
   * Package assignments already expand to their owning project inside projectScopeIds.
   */
  projectVisibleIds: string[] | null;
  /** document.read: project reach sees all documents; package reach only its packages' rows. */
  document: ModuleScope;
  /** riskChange.read governs risks, issues and change requests alike. */
  riskChange: ModuleScope;
  /** contract.read: contracts are project-level, so package reach deliberately grants NOTHING. */
  contract: ModuleScope;
}

export interface SearchQueryInput {
  tenantId: string;
  query: string;
  types: readonly SearchResultType[];
  limit: number;
  scopes: SearchScopes;
}

export interface BuiltSearchQuery {
  sql: string;
  parameters: unknown[];
}

/** Escape LIKE metacharacters so user input can never widen its own match. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Returns null when no branch is authorized — the service answers with an empty page. */
export function buildSearchQuery(input: SearchQueryInput): BuiltSearchQuery | null {
  const parameters: unknown[] = [];
  const bind = (value: unknown): string => `$${parameters.push(value)}`;
  const tenant = bind(input.tenantId);
  const escaped = escapeLikePattern(input.query.trim());
  // Codes are matched as prefixes (how people cite them); titles as contains.
  const prefix = bind(`${escaped}%`);
  const contains = bind(`%${escaped}%`);

  const branches: string[] = [];
  const wants = (type: SearchResultType): boolean => input.types.includes(type);

  if (wants('PROJECT') && (input.scopes.projectVisibleIds === null
    || input.scopes.projectVisibleIds.length > 0)) {
    const reach = input.scopes.projectVisibleIds === null
      ? 'TRUE'
      : `project.id = ANY(${bind(input.scopes.projectVisibleIds)}::uuid[])`;
    branches.push(`SELECT 'PROJECT' AS "type", project.id AS "id", project.code AS "code",
      project.name AS "title", project.id AS "projectId"
    FROM projects project
    WHERE project.tenant_id = ${tenant}::uuid
      AND (project.code ILIKE ${prefix} ESCAPE '\\' OR project.name ILIKE ${contains} ESCAPE '\\')
      AND ${reach}`);
  }

  const documentReach = moduleReach(input.scopes.document, 'document', bind);
  if (wants('DOCUMENT') && documentReach !== null) {
    branches.push(`SELECT 'DOCUMENT' AS "type", document.id AS "id",
      document.document_code AS "code", document.title AS "title",
      document.project_id AS "projectId"
    FROM documents document
    WHERE document.tenant_id = ${tenant}::uuid
      AND (document.document_code ILIKE ${prefix} ESCAPE '\\'
        OR document.title ILIKE ${contains} ESCAPE '\\')
      AND ${documentReach}`);
  }

  const riskReach = moduleReach(input.scopes.riskChange, 'risk', bind);
  if (wants('RISK') && riskReach !== null) {
    // DB-022 risks carry no title column; `event` (what may happen) is the human-readable line the
    // register shows, trimmed to a headline length here.
    branches.push(`SELECT 'RISK' AS "type", risk.id AS "id", risk.code AS "code",
      left(risk.event, 200) AS "title", risk.project_id AS "projectId"
    FROM risks risk
    WHERE risk.tenant_id = ${tenant}::uuid
      AND (risk.code ILIKE ${prefix} ESCAPE '\\' OR risk.event ILIKE ${contains} ESCAPE '\\')
      AND ${riskReach}`);
  }

  const issueReach = moduleReach(input.scopes.riskChange, 'issue', bind);
  if (wants('ISSUE') && issueReach !== null) {
    branches.push(`SELECT 'ISSUE' AS "type", issue.id AS "id", issue.code AS "code",
      issue.title AS "title", issue.project_id AS "projectId"
    FROM issues issue
    WHERE issue.tenant_id = ${tenant}::uuid
      AND (issue.code ILIKE ${prefix} ESCAPE '\\' OR issue.title ILIKE ${contains} ESCAPE '\\')
      AND ${issueReach}`);
  }

  const changeReach = moduleReach(input.scopes.riskChange, 'change', bind);
  if (wants('CHANGE_REQUEST') && changeReach !== null) {
    branches.push(`SELECT 'CHANGE_REQUEST' AS "type", change.id AS "id", change.code AS "code",
      change.title AS "title", change.project_id AS "projectId"
    FROM change_requests change
    WHERE change.tenant_id = ${tenant}::uuid
      AND (change.code ILIKE ${prefix} ESCAPE '\\' OR change.title ILIKE ${contains} ESCAPE '\\')
      AND ${changeReach}`);
  }

  if (wants('CONTRACT')
    && (input.scopes.contract.tenantWide || input.scopes.contract.projectIds.length > 0)) {
    // Same rule as ContractCostService: tenant-wide or explicit project reach only.
    const reach = input.scopes.contract.tenantWide
      ? 'TRUE'
      : `contract.project_id = ANY(${bind(input.scopes.contract.projectIds)}::uuid[])`;
    branches.push(`SELECT 'CONTRACT' AS "type", contract.id AS "id",
      contract.contract_no AS "code", contract.title AS "title",
      contract.project_id AS "projectId"
    FROM contracts contract
    WHERE contract.tenant_id = ${tenant}::uuid
      AND (contract.contract_no ILIKE ${prefix} ESCAPE '\\'
        OR contract.title ILIKE ${contains} ESCAPE '\\')
      AND ${reach}`);
  }

  if (branches.length === 0) return null;
  const sql = `SELECT * FROM (
${branches.join('\nUNION ALL\n')}
) result
ORDER BY result."type" ASC, result."code" ASC, result."id" ASC
LIMIT ${bind(input.limit)}`;
  return { sql, parameters };
}

/**
 * The shared project/package predicate: full-project reach sees every row of the project,
 * package reach only rows tagged with one of the caller's packages. Null = branch unauthorized.
 */
function moduleReach(
  scope: ModuleScope, alias: string, bind: (value: unknown) => string
): string | null {
  if (scope.tenantWide) return 'TRUE';
  const parts: string[] = [];
  if (scope.projectIds.length > 0) {
    parts.push(`${alias}.project_id = ANY(${bind(scope.projectIds)}::uuid[])`);
  }
  if (scope.packageIds.length > 0) {
    parts.push(`${alias}.package_id = ANY(${bind(scope.packageIds)}::uuid[])`);
  }
  if (parts.length === 0) return null;
  return `(${parts.join(' OR ')})`;
}
