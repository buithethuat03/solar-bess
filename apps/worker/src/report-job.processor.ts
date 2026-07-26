import type { PoolClient } from 'pg';
import type { DomainEventJob } from './domain-event';
import type { DomainEventProcessor } from './domain-event.processor';
import type { ReportStorage } from './report-storage';
import type { WorkerLogger } from './worker-logger';

/** Output snapshots stay downloadable for 72 hours; after that API-134 hides the reference. */
export const REPORT_EXPIRY_MS = 72 * 60 * 60 * 1000;

interface ReportJobRow {
  id: string;
  reportType: 'RISK_REGISTER_CSV' | 'DOCUMENT_REGISTER_CSV';
  status: string;
  filterSnapshot: Record<string, unknown>;
  requestedBy: string;
}

/** Flattened ABAC reach of the requester, re-resolved at generation time. */
export interface WorkerAccessScope {
  tenantWide: boolean;
  projectIds: string[];
  packageIds: string[];
}

/** RFC-4180-style field escaping; every field is quoted when it needs to be. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvDocument(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n') + '\n';
}

export const RISK_REGISTER_CSV_HEADER = [
  'code', 'category', 'event', 'status', 'inherentLevel', 'inherentExposure',
  'residualLevel', 'residualExposure', 'reviewDate', 'ownerId', 'packageId'
] as const;

export const DOCUMENT_REGISTER_CSV_HEADER = [
  'documentCode', 'title', 'type', 'discipline', 'classification', 'status',
  'ownerId', 'packageId', 'updatedAt'
] as const;

/**
 * Consumes `ReportJob.Requested` (API-133): claims the DB-107 row, RE-RESOLVES the requester's
 * scope from the live role assignments (the request-time check is only an admission gate), renders
 * the register CSV entirely in SQL under that scope, writes it to the release bucket under
 * `reports/{tenantId}/{jobId}.csv` and completes the job with its immutable snapshot facts.
 *
 * Failure discipline: a deterministic refusal (permission gone, corrupt snapshot) marks the job
 * FAILED with an error code and consumes the event; anything transient (storage/database outage)
 * throws so the queue retries and the job stays claimable.
 */
export class ReportJobProcessor implements DomainEventProcessor {
  constructor(
    private readonly storage: ReportStorage,
    private readonly logger: WorkerLogger,
    private readonly now: () => Date = () => new Date()
  ) {}

  supports(event: DomainEventJob): boolean {
    return event.aggregateType === 'ReportJob' && event.eventType === 'ReportJob.Requested';
  }

  async process(client: PoolClient, event: DomainEventJob): Promise<void> {
    if (!this.supports(event)) return;
    const job = await this.loadJob(client, event.tenantId, event.aggregateId);
    if (!job) throw new Error('Report job event references a job that does not exist');
    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      // Replay after a crash between COMMIT and ack: the terminal row is the truth.
      this.logger.info('report_job_replay_skipped', {
        tenantId: event.tenantId, reportJobId: job.id,
        eventId: event.eventId, correlationId: event.correlationId, status: job.status
      });
      return;
    }
    await client.query(
      `UPDATE report_jobs SET status = 'RUNNING', updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [event.tenantId, job.id]
    );

    const projectId = typeof job.filterSnapshot.projectId === 'string'
      ? job.filterSnapshot.projectId : null;
    if (projectId === null) {
      await this.fail(client, event.tenantId, job.id, 'FILTER_SNAPSHOT_INVALID');
      return;
    }
    const permission = job.reportType === 'RISK_REGISTER_CSV' ? 'riskChange.read' : 'document.read';
    const scope = await resolveWorkerAccessScope(client, event.tenantId, job.requestedBy, permission);
    if (!await this.projectVisible(client, event.tenantId, scope, projectId)) {
      // Deterministic refusal: the requester lost (or never had) live reach — no output may exist.
      await this.fail(client, event.tenantId, job.id, 'PERMISSION_REVOKED');
      return;
    }

    const dataAsOf = this.now();
    const csv = job.reportType === 'RISK_REGISTER_CSV'
      ? await this.riskRegisterCsv(client, event.tenantId, projectId, scope)
      : await this.documentRegisterCsv(client, event.tenantId, projectId, scope);
    const objectKey = `reports/${event.tenantId}/${job.id}.csv`;
    const ref = await this.storage.put(
      objectKey, Buffer.from(csv, 'utf8'), 'text/csv; charset=utf-8'
    );
    const expiresAt = new Date(dataAsOf.getTime() + REPORT_EXPIRY_MS);
    await client.query(
      `UPDATE report_jobs SET
        status = 'COMPLETED', data_as_of = $3, output_object_ref = $4::jsonb,
        expires_at = $5, error_code = NULL, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [
        event.tenantId, job.id, dataAsOf,
        JSON.stringify({ bucket: ref.bucket, objectKey: ref.objectKey }), expiresAt
      ]
    );
    this.logger.info('report_job_completed', {
      tenantId: event.tenantId, reportJobId: job.id, reportType: job.reportType,
      eventId: event.eventId, correlationId: event.correlationId, objectKey: ref.objectKey
    });
  }

  private async fail(
    client: PoolClient, tenantId: string, jobId: string, errorCode: string
  ): Promise<void> {
    await client.query(
      `UPDATE report_jobs SET status = 'FAILED', error_code = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, jobId, errorCode]
    );
    this.logger.warn('report_job_failed', { tenantId, reportJobId: jobId, errorCode });
  }

  private async loadJob(
    client: PoolClient, tenantId: string, jobId: string
  ): Promise<ReportJobRow | null> {
    const result = await client.query<ReportJobRow>(`
      SELECT id, report_type AS "reportType", status,
        filter_snapshot AS "filterSnapshot", requested_by AS "requestedBy"
      FROM report_jobs
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, jobId]);
    return result.rows[0] ?? null;
  }

  private async projectVisible(
    client: PoolClient, tenantId: string, scope: WorkerAccessScope, projectId: string
  ): Promise<boolean> {
    const exists = await client.query(
      'SELECT 1 FROM projects WHERE tenant_id = $1 AND id = $2', [tenantId, projectId]
    );
    if ((exists.rowCount ?? 0) === 0) return false;
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return true;
    if (scope.packageIds.length === 0) return false;
    const anyPackage = await client.query(
      `SELECT 1 FROM packages
       WHERE tenant_id = $1 AND project_id = $2 AND id = ANY($3::uuid[]) LIMIT 1`,
      [tenantId, projectId, scope.packageIds]
    );
    return (anyPackage.rowCount ?? 0) > 0;
  }

  /** Same row predicate the risk register list uses: full project reach or exact package rows. */
  private scopePredicate(
    scope: WorkerAccessScope, alias: string, projectId: string,
    parameters: unknown[]
  ): string {
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return 'TRUE';
    parameters.push(scope.packageIds);
    return `${alias}.package_id = ANY($${parameters.length}::uuid[])`;
  }

  private async riskRegisterCsv(
    client: PoolClient, tenantId: string, projectId: string, scope: WorkerAccessScope
  ): Promise<string> {
    const parameters: unknown[] = [tenantId, projectId];
    const predicate = this.scopePredicate(scope, 'risk', projectId, parameters);
    const result = await client.query<Record<string, unknown>>(`
      SELECT code, category, event, status,
        inherent_level AS "inherentLevel", inherent_exposure AS "inherentExposure",
        residual_level AS "residualLevel", residual_exposure AS "residualExposure",
        review_date::text AS "reviewDate", owner_id AS "ownerId", package_id AS "packageId"
      FROM risks risk
      WHERE risk.tenant_id = $1 AND risk.project_id = $2 AND ${predicate}
      ORDER BY code, id
    `, parameters);
    return csvDocument(
      RISK_REGISTER_CSV_HEADER,
      result.rows.map((row) => RISK_REGISTER_CSV_HEADER.map((column) => row[column]))
    );
  }

  private async documentRegisterCsv(
    client: PoolClient, tenantId: string, projectId: string, scope: WorkerAccessScope
  ): Promise<string> {
    const parameters: unknown[] = [tenantId, projectId];
    const predicate = this.scopePredicate(scope, 'document', projectId, parameters);
    const result = await client.query<Record<string, unknown>>(`
      SELECT document_code AS "documentCode", title, type, discipline, classification, status,
        owner_id AS "ownerId", package_id AS "packageId", updated_at::text AS "updatedAt"
      FROM documents document
      WHERE document.tenant_id = $1 AND document.project_id = $2 AND ${predicate}
      ORDER BY document_code, id
    `, parameters);
    return csvDocument(
      DOCUMENT_REGISTER_CSV_HEADER,
      result.rows.map((row) => DOCUMENT_REGISTER_CSV_HEADER.map((column) => row[column]))
    );
  }
}

/**
 * Live re-resolution of one user's reach for one permission — the worker-side mirror of the API's
 * `PermissionService.accessScopeSets`: ACTIVE assignment, ACTIVE role, effective window, portfolio
 * expanded to its projects, package reach limited to ACTIVE packages.
 */
export async function resolveWorkerAccessScope(
  client: PoolClient, tenantId: string, userId: string, permission: string
): Promise<WorkerAccessScope> {
  const assignments = await client.query<{ scopeType: string; scopeId: string | null }>(`
    SELECT assignment.scope_type AS "scopeType", assignment.scope_id AS "scopeId"
    FROM role_assignments assignment
    JOIN roles role
      ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id
    WHERE assignment.tenant_id = $1
      AND assignment.user_account_id = $2
      AND assignment.status = 'ACTIVE'
      AND role.status = 'ACTIVE'
      AND assignment.effective_from <= CURRENT_TIMESTAMP
      AND (assignment.effective_to IS NULL OR assignment.effective_to > CURRENT_TIMESTAMP)
      AND role.permissions ? $3
  `, [tenantId, userId, permission]);
  if (assignments.rows.some((row) => row.scopeType === 'TENANT')) {
    return { tenantWide: true, projectIds: [], packageIds: [] };
  }
  const ids = (scopeType: string): string[] => assignments.rows
    .filter((row) => row.scopeType === scopeType && row.scopeId !== null)
    .map((row) => row.scopeId!);
  const projectIds = ids('PROJECT');
  const portfolioIds = ids('PORTFOLIO');
  if (portfolioIds.length > 0) {
    const portfolioProjects = await client.query<{ id: string }>(
      'SELECT id FROM projects WHERE tenant_id = $1 AND portfolio_id = ANY($2::uuid[])',
      [tenantId, portfolioIds]
    );
    projectIds.push(...portfolioProjects.rows.map((row) => row.id));
  }
  const packageIds = ids('PACKAGE');
  const activePackageIds = packageIds.length === 0 ? [] : (await client.query<{ id: string }>(
    `SELECT id FROM packages
     WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'ACTIVE'`,
    [tenantId, packageIds]
  )).rows.map((row) => row.id);
  return {
    tenantWide: false,
    projectIds: [...new Set(projectIds)],
    packageIds: [...new Set(activePackageIds)]
  };
}
