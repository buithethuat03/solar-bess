import type { Pool, PoolClient } from 'pg';
import type { WorkerConfig } from './config';
import type { DomainEventJob } from './domain-event';
import type { DomainEventProcessor } from './domain-event.processor';
import {
  authorizedRecipients,
  notificationDedupKey,
  removeStaleNotifications,
  upsertNotification,
  type NotificationSourceType
} from './notification-projection';
import {
  evaluateRiskChangeAlerts,
  type ActionAlertSource,
  type ChangeAlertSource,
  type IssueAlertSource,
  type RiskAlertSource
} from './risk-change-alert.policy';
import { safeErrorCode } from './safe-error';
import type { WorkerLogger } from './worker-logger';

const EVENTS_BY_AGGREGATE: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Risk', new Set([
    'RiskCreated', 'RiskChanged', 'RiskClosureRequested', 'RiskClosureDecided'
  ])],
  ['Issue', new Set([
    'IssueCreated', 'IssueChanged', 'IssueClosureRequested', 'IssueClosureDecided'
  ])],
  ['RiskIssueAction', new Set([
    'RiskIssueActionCreated', 'RiskIssueActionChanged', 'RiskIssueActionCompleted',
    'RiskIssueActionVerified', 'RiskIssueActionCancelled'
  ])],
  ['ChangeRequest', new Set([
    'ChangeRequestCreated', 'ChangeRequestChanged', 'ChangeRequestSubmitted',
    'ChangeRequestDecided'
  ])]
]);

const RISK_CHANGE_SOURCE_TYPES: readonly NotificationSourceType[] = [
  'Risk', 'Issue', 'RiskIssueAction', 'ChangeRequest'
];

interface SiteBusinessDate {
  timezone: string;
  dataDate: string;
}

export class RiskChangeAlertProcessor implements DomainEventProcessor {
  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger
  ) {}

  supports(event: DomainEventJob): boolean {
    return EVENTS_BY_AGGREGATE.get(event.aggregateType)?.has(event.eventType) ?? false;
  }

  async process(client: PoolClient, event: DomainEventJob): Promise<void> {
    if (!this.supports(event)) return;
    const projectId = uuid(event.payload.projectId);
    if (!projectId) throw new Error('Risk/change event payload requires a projectId UUID');
    const committedProjectId = await this.committedProjectId(client, event);
    if (committedProjectId !== projectId) {
      throw new Error('Risk/change event projectId does not match its committed aggregate');
    }
    const count = await this.scanProject(client, event.tenantId, projectId);
    this.logger.info('risk_change_alert_projection_updated', {
      tenantId: event.tenantId,
      projectId,
      eventId: event.eventId,
      correlationId: event.correlationId,
      inserted: count
    });
  }

  private async committedProjectId(
    client: PoolClient,
    event: DomainEventJob
  ): Promise<string> {
    const table = sourceTable(event.aggregateType);
    const result = await client.query<{ projectId: string }>(`
      SELECT project_id AS "projectId"
      FROM ${table}
      WHERE tenant_id = $1 AND id = $2
    `, [event.tenantId, event.aggregateId]);
    const projectId = result.rows[0]?.projectId;
    if (!projectId) throw new Error('Risk/change committed event aggregate does not exist');
    return projectId;
  }

  async scanProject(client: PoolClient, tenantId: string, projectId: string): Promise<number> {
    const siteResult = await client.query<SiteBusinessDate>(`
      SELECT timezone,
        (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date::text AS "dataDate"
      FROM sites
      WHERE tenant_id = $1 AND project_id = $2 AND is_primary = true
    `, [tenantId, projectId]);
    const site = siteResult.rows[0];
    if (!site) throw new Error('Risk/change alert projection requires one primary project Site');

    const riskResult = await client.query<RiskAlertSource>(`
      SELECT id, package_id AS "packageId", review_date::text AS "reviewDate",
        inherent_exposure AS "inherentExposure", inherent_level AS "inherentLevel",
        residual_exposure AS "residualExposure", residual_level AS "residualLevel", status
      FROM risks
      WHERE tenant_id = $1 AND project_id = $2
    `, [tenantId, projectId]);
    const issueResult = await client.query<IssueAlertSource>(`
      SELECT id, package_id AS "packageId", target_date::text AS "targetDate",
        severity, status
      FROM issues
      WHERE tenant_id = $1 AND project_id = $2
    `, [tenantId, projectId]);
    const actionResult = await client.query<ActionAlertSource>(`
      SELECT id, package_id AS "packageId", risk_id AS "riskId", issue_id AS "issueId",
        due_date::text AS "dueDate", status
      FROM risk_issue_actions
      WHERE tenant_id = $1 AND project_id = $2
    `, [tenantId, projectId]);
    const changeResult = await client.query<ChangeAlertSource>(`
      SELECT id, package_id AS "packageId",
        CASE WHEN submitted_at IS NULL THEN NULL
          ELSE (submitted_at AT TIME ZONE $3::text)::date::text END AS "submittedDate",
        requester_id AS "requesterId", submitted_by AS "submittedBy", status
      FROM change_requests
      WHERE tenant_id = $1 AND project_id = $2
    `, [tenantId, projectId, site.timezone]);
    const candidates = evaluateRiskChangeAlerts({
      risks: riskResult.rows,
      issues: issueResult.rows,
      actions: actionResult.rows,
      changes: changeResult.rows
    }, site.dataDate);

    let inserted = 0;
    const currentDedupKeys: string[] = [];
    for (const candidate of candidates) {
      const changePending = candidate.sourceType === 'ChangeRequest';
      const recipients = await authorizedRecipients(client, {
        tenantId,
        projectId,
        packageId: candidate.packageId,
        requiredPermissions: changePending
          ? ['riskChange.read', 'riskChange.approve']
          : ['riskChange.read'],
        fullProjectOnly: changePending,
        excludedUserIds: candidate.excludedRecipientIds
      });
      for (const recipientId of recipients) {
        const dedupKey = notificationDedupKey({
          tenantId,
          projectId,
          packageId: candidate.packageId,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          recipientId,
          alertType: candidate.alertType,
          dueAt: candidate.dueAt,
          thresholdVersion: this.config.riskChange.thresholdVersion
        });
        currentDedupKeys.push(dedupKey);
        const result = await upsertNotification(client, {
          tenantId,
          recipientId,
          projectId,
          packageId: candidate.packageId,
          activityId: null,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          alertType: candidate.alertType,
          priority: candidate.priority,
          objectLink: riskChangeObjectLink(projectId, candidate),
          reason: alertReason(candidate.sourceType),
          dueAt: candidate.dueAt,
          dataDate: changePending ? candidate.dueAt : site.dataDate,
          thresholdVersion: this.config.riskChange.thresholdVersion,
          dedupKey
        });
        if (result.inserted) inserted += 1;
      }
    }
    await removeStaleNotifications(
      client, tenantId, projectId, RISK_CHANGE_SOURCE_TYPES, currentDedupKeys
    );
    return inserted;
  }
}

export class RiskChangeAlertScanner {
  private timer: NodeJS.Timeout | null = null;
  private active: Promise<void> | null = null;
  private running = false;

  constructor(
    private readonly pool: Pool,
    private readonly processor: RiskChangeAlertProcessor,
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.trigger();
    this.timer = setInterval(
      () => this.trigger(), this.config.riskChange.alertScanIntervalMs
    );
    this.timer.unref();
  }

  isRunning(): boolean {
    return this.running;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.active) return;
    let timeout: NodeJS.Timeout | null = null;
    try {
      await Promise.race([
        this.active,
        new Promise<void>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Risk/change alert scanner shutdown timed out')),
            this.config.shutdownTimeoutMs
          );
          timeout.unref();
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private trigger(): void {
    if (!this.running || this.active) return;
    this.active = this.scanAll()
      .catch((error: unknown) => {
        this.logger.error('risk_change_alert_scan_failed', { errorCode: safeErrorCode(error) });
      })
      .finally(() => { this.active = null; });
  }

  private async scanAll(): Promise<void> {
    const projects = await this.pool.query<{ tenantId: string; projectId: string }>(`
      SELECT tenant_id AS "tenantId", project_id AS "projectId"
      FROM (
        SELECT tenant_id, project_id FROM risks
        UNION SELECT tenant_id, project_id FROM issues
        UNION SELECT tenant_id, project_id FROM risk_issue_actions
        UNION SELECT tenant_id, project_id FROM change_requests
        UNION SELECT tenant_id, project_id FROM notifications
          WHERE source_type IN ('Risk','Issue','RiskIssueAction','ChangeRequest')
      ) project_sources
      ORDER BY tenant_id, project_id
    `);
    for (const project of projects.rows) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await this.processor.scanProject(client, project.tenantId, project.projectId);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.logger.warn('risk_change_alert_project_scan_failed', {
          tenantId: project.tenantId,
          projectId: project.projectId,
          errorCode: safeErrorCode(error)
        });
      } finally {
        client.release();
      }
    }
  }
}

function uuid(value: unknown): string | null {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value : null;
}

function sourceTable(aggregateType: string): string {
  switch (aggregateType) {
    case 'Risk': return 'risks';
    case 'Issue': return 'issues';
    case 'RiskIssueAction': return 'risk_issue_actions';
    case 'ChangeRequest': return 'change_requests';
    default: throw new Error('Unsupported Risk/change aggregate type');
  }
}

export function riskChangeObjectLink(
  projectId: string,
  source: {
    sourceType: Exclude<NotificationSourceType, 'ScheduleActivity'>;
    sourceId: string;
    actionParentType: 'RISK' | 'ISSUE' | null;
  }
): string {
  const base = `/projects/${encodeURIComponent(projectId)}/risk-change`;
  const sourceId = encodeURIComponent(source.sourceId);
  switch (source.sourceType) {
    case 'Risk': return `${base}?tab=risks&riskId=${sourceId}`;
    case 'Issue': return `${base}?tab=issues&issueId=${sourceId}`;
    case 'ChangeRequest': return `${base}?tab=changes&changeRequestId=${sourceId}`;
    case 'RiskIssueAction': {
      if (!source.actionParentType) {
        throw new Error('Risk/Issue Action deep-link requires its committed parent type');
      }
      const tab = source.actionParentType === 'RISK' ? 'risks' : 'issues';
      return `${base}?tab=${tab}&actionId=${sourceId}`;
    }
  }
}

function alertReason(sourceType: NotificationSourceType): string {
  switch (sourceType) {
    case 'Risk': return 'Risk đã đến ngày review';
    case 'Issue': return 'Issue đã đến ngày mục tiêu';
    case 'RiskIssueAction': return 'Action đã quá hạn và chưa hoàn tất';
    case 'ChangeRequest': return 'Change Request đang chờ quyết định độc lập';
    case 'ScheduleActivity': throw new Error('Schedule reason belongs to schedule projector');
  }
}
