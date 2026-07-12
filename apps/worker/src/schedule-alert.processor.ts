import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { WorkerConfig } from './config';
import type { DomainEventJob } from './domain-event';
import {
  evaluateScheduleAlerts, type ScheduleAlertActivity, type ScheduleAlertDependency
} from './schedule-alert.policy';
import { safeErrorCode } from './safe-error';
import type { WorkerLogger } from './worker-logger';

export interface DomainEventProcessor {
  supports(event: DomainEventJob): boolean;
  process(client: PoolClient, event: DomainEventJob): Promise<void>;
}

interface ScheduleRow {
  tenantId: string;
  projectId: string;
  dataDate: string;
  workingWeek: number[];
  exceptions: Array<{ date: string; working: boolean }>;
}

interface ActivityRow extends ScheduleAlertActivity {
  packageId: string | null;
}

const SCHEDULE_EVENT_TYPES = new Set([
  'ScheduleDraftChanged', 'BaselineSubmitted', 'BaselineApproved', 'ProgressRecorded',
  'SCHEDULE_DRAFT_CHANGED', 'BASELINE_SUBMITTED', 'BASELINE_APPROVED', 'PROGRESS_RECORDED'
]);

export class ScheduleAlertProcessor implements DomainEventProcessor {
  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger
  ) {}

  supports(event: DomainEventJob): boolean {
    return SCHEDULE_EVENT_TYPES.has(event.eventType);
  }

  async process(client: PoolClient, event: DomainEventJob): Promise<void> {
    if (!this.supports(event)) return;
    const projectId = this.projectId(event.payload);
    if (!projectId) throw new Error('Schedule event payload requires a projectId UUID');
    const count = await this.scanProject(client, event.tenantId, projectId);
    this.logger.info('schedule_alert_projection_updated', {
      tenantId: event.tenantId,
      projectId,
      eventId: event.eventId,
      correlationId: event.correlationId,
      inserted: count
    });
  }

  async scanProject(client: PoolClient, tenantId: string, projectId: string): Promise<number> {
    const scheduleResult = await client.query<ScheduleRow>(`
      SELECT tenant_id AS "tenantId", project_id AS "projectId",
        data_date::text AS "dataDate", working_week AS "workingWeek",
        calendar_exceptions AS exceptions
      FROM project_schedules
      WHERE tenant_id = $1 AND project_id = $2
    `, [tenantId, projectId]);
    const schedule = scheduleResult.rows[0];
    if (!schedule) return 0;
    const [activitiesResult, dependenciesResult] = await Promise.all([
      client.query<ActivityRow>(`
        SELECT id, package_id AS "packageId", planned_start::text AS "plannedStart",
          planned_finish::text AS "plannedFinish", duration_work_days AS "durationWorkDays",
          percent_complete::text AS "percentComplete", status
        FROM schedule_activities
        WHERE tenant_id = $1 AND project_id = $2
      `, [tenantId, projectId]),
      client.query<ScheduleAlertDependency>(`
        SELECT predecessor_id AS "predecessorId", successor_id AS "successorId",
          dependency_type AS "dependencyType", lag_work_days AS "lagWorkDays"
        FROM activity_dependencies
        WHERE tenant_id = $1 AND project_id = $2
      `, [tenantId, projectId])
    ]);
    const candidates = evaluateScheduleAlerts(
      activitiesResult.rows,
      dependenciesResult.rows,
      { workingWeek: schedule.workingWeek, exceptions: schedule.exceptions },
      schedule.dataDate,
      this.config.schedule.nearCriticalFloatDays
    );
    const activityById = new Map(activitiesResult.rows.map((row) => [row.id, row]));
    let inserted = 0;
    for (const candidate of candidates) {
      const activity = activityById.get(candidate.activityId)!;
      const recipients = await this.recipients(
        client, tenantId, projectId, activity.packageId
      );
      for (const recipientId of recipients) {
        const dedupKey = this.dedupKey(
          tenantId, projectId, candidate.activityId, recipientId,
          candidate.alertType, schedule.dataDate
        );
        const result = await client.query(`
          INSERT INTO schedule_notifications (
            id, tenant_id, recipient_user_id, project_id, activity_id,
            source_type, source_id, alert_type, priority, object_link,
            reason, due_at, data_date, threshold_version, dedup_key, status
          ) VALUES (
            $1, $2, $3, $4, $5,
            'ScheduleActivity', $5, $6, $7, $8,
            $9, $10, $11, $12, $13, 'UNREAD'
          ) ON CONFLICT ON CONSTRAINT uq_schedule_notification_dedup DO NOTHING
        `, [
          randomUUID(), tenantId, recipientId, projectId, candidate.activityId,
          candidate.alertType, candidate.priority,
          `/projects/${projectId}/schedule?activityId=${candidate.activityId}`,
          candidate.alertType === 'OVERDUE'
            ? 'Activity đã quá ngày kế hoạch và chưa hoàn thành'
            : `Activity có total float ${candidate.totalFloatWorkDays} ngày`,
          candidate.dueAt, schedule.dataDate,
          this.config.schedule.thresholdVersion, dedupKey
        ]);
        inserted += result.rowCount ?? 0;
      }
    }
    return inserted;
  }

  private async recipients(
    client: PoolClient, tenantId: string, projectId: string, packageId: string | null
  ): Promise<string[]> {
    const result = await client.query<{ userId: string }>(`
      SELECT DISTINCT assignment.user_account_id AS "userId"
      FROM role_assignments assignment
      JOIN roles role
        ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id
      JOIN user_accounts account
        ON account.id = assignment.user_account_id AND account.tenant_id = assignment.tenant_id
      JOIN projects project
        ON project.id = $2 AND project.tenant_id = assignment.tenant_id
      WHERE assignment.tenant_id = $1
        AND assignment.status = 'ACTIVE'
        AND role.status = 'ACTIVE'
        AND account.status = 'ACTIVE'
        AND assignment.effective_from <= CURRENT_TIMESTAMP
        AND (assignment.effective_to IS NULL OR assignment.effective_to > CURRENT_TIMESTAMP)
        AND role.permissions ? 'schedule.read'
        AND (
          assignment.scope_type = 'TENANT'
          OR (assignment.scope_type = 'PORTFOLIO' AND assignment.scope_id = project.portfolio_id)
          OR (assignment.scope_type = 'PROJECT' AND assignment.scope_id = project.id)
          OR (assignment.scope_type = 'PACKAGE' AND assignment.scope_id = $3)
        )
      ORDER BY assignment.user_account_id
    `, [tenantId, projectId, packageId]);
    return result.rows.map((row) => row.userId);
  }

  private projectId(payload: Record<string, unknown>): string | null {
    const value = payload.projectId;
    return typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value : null;
  }

  private dedupKey(
    tenantId: string, projectId: string, activityId: string, recipientId: string,
    alertType: string, dataDate: string
  ): string {
    return createHash('sha256').update([
      tenantId, projectId, activityId, recipientId, alertType, dataDate,
      this.config.schedule.thresholdVersion
    ].join(':')).digest('hex');
  }
}

export class ScheduleAlertScanner {
  private timer: NodeJS.Timeout | null = null;
  private active: Promise<void> | null = null;
  private running = false;

  constructor(
    private readonly pool: Pool,
    private readonly processor: ScheduleAlertProcessor,
    private readonly config: WorkerConfig,
    private readonly logger: WorkerLogger
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.trigger();
    this.timer = setInterval(() => this.trigger(), this.config.schedule.alertScanIntervalMs);
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
            () => reject(new Error('Schedule alert scanner shutdown timed out')),
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
        this.logger.error('schedule_alert_scan_failed', { errorCode: safeErrorCode(error) });
      })
      .finally(() => { this.active = null; });
  }

  private async scanAll(): Promise<void> {
    const schedules = await this.pool.query<{ tenantId: string; projectId: string }>(`
      SELECT tenant_id AS "tenantId", project_id AS "projectId"
      FROM project_schedules
      WHERE status NOT IN ('REJECTED')
      ORDER BY tenant_id, project_id
    `);
    for (const schedule of schedules.rows) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await this.processor.scanProject(client, schedule.tenantId, schedule.projectId);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        this.logger.warn('schedule_alert_project_scan_failed', {
          tenantId: schedule.tenantId,
          projectId: schedule.projectId,
          errorCode: safeErrorCode(error)
        });
      } finally {
        client.release();
      }
    }
  }
}
