import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { loadWorkerConfig, type WorkerConfig } from '../../src/config';
import type { DomainEventJob } from '../../src/domain-event';
import { EventConsumptionStore } from '../../src/event-consumption.store';
import { ScheduleAlertProcessor } from '../../src/schedule-alert.processor';
import type { WorkerLogger } from '../../src/worker-logger';

const tenantId = randomUUID();
const projectId = randomUUID();
const portfolioId = randomUUID();
const companyId = randomUUID();
const legalEntityId = randomUUID();
const packageId = randomUUID();
const otherPackageId = randomUUID();
const scheduleId = randomUUID();
const wbsId = randomUUID();
const activityId = randomUUID();
const projectManagerId = randomUUID();
const activityOwnerId = randomUUID();
const otherPackageUserId = randomUUID();
const noPermissionUserId = randomUUID();

const logger: WorkerLogger = {
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
};

describe('ScheduleAlertProcessor PostgreSQL projection — TEST-013/194', () => {
  let config: WorkerConfig;
  let pool: Pool;
  let processor: ScheduleAlertProcessor;
  let store: EventConsumptionStore;
  let fixtureSeeded = false;

  beforeAll(async () => {
    const secretDirectory = process.env.WORKER_TEST_SECRETS_DIR
      ?? '/tmp/solar-bess-worker-test-secrets';
    const databaseSecret = process.env.WORKER_TEST_DATABASE_URL_FILE
      ?? resolve(secretDirectory, 'database_url');
    const redisSecret = process.env.WORKER_TEST_REDIS_PASSWORD_FILE
      ?? resolve(secretDirectory, 'redis_password');
    if (!existsSync(databaseSecret) || !existsSync(redisSecret)) {
      throw new Error('Run `npm run test:secrets --workspace=@solar-bess/worker` first');
    }
    const suffix = `${process.pid}-${Date.now()}`;
    config = loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: databaseSecret,
      WORKER_DATABASE_HOST_OVERRIDE: process.env.WORKER_TEST_DATABASE_HOST,
      WORKER_DATABASE_PORT_OVERRIDE: process.env.WORKER_TEST_DATABASE_PORT,
      WORKER_DATABASE_NAME_OVERRIDE: process.env.WORKER_TEST_DATABASE_NAME,
      WORKER_REDIS_PASSWORD_FILE: redisSecret,
      WORKER_REDIS_HOST: process.env.WORKER_TEST_REDIS_HOST ?? '127.0.0.1',
      WORKER_REDIS_PORT: process.env.WORKER_TEST_REDIS_PORT ?? '6380',
      WORKER_QUEUE_NAME: `schedule-alert-test-${suffix}`,
      WORKER_DLQ_NAME: `schedule-alert-dlq-${suffix}`,
      WORKER_QUEUE_PREFIX: `schedule-alert-${suffix}`,
      WORKER_ID: `schedule-alert-test-${process.pid}`,
      WORKER_CONSUMER_NAME: `schedule-alert-integration-${process.pid}`,
      WORKER_HANDLER_VERSION: 'schedule-alert-test-v1'
    }, (path) => readFileSync(path, 'utf8'));
    pool = new Pool({
      connectionString: config.database.url,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      query_timeout: config.database.queryTimeoutMs,
      statement_timeout: config.database.queryTimeoutMs,
      application_name: 'schedule-alert-integration-test'
    });
    processor = new ScheduleAlertProcessor(config, logger);
    store = new EventConsumptionStore(
      pool, config.consumption.consumerName,
      config.consumption.handlerVersion, config.consumption.leaseMs
    );
    await seedScheduleFixture();
    fixtureSeeded = true;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await pool.query('DELETE FROM event_consumptions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM schedule_notifications WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM transactional_outbox_events WHERE tenant_id = $1', [tenantId]);
  });

  afterAll(async () => {
    if (!pool) return;
    if (!fixtureSeeded) {
      await pool.end();
      return;
    }
    await pool.query('DELETE FROM event_consumptions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM schedule_notifications WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM transactional_outbox_events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM activity_dependencies WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM progress_updates WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM schedule_baselines WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM schedule_activities WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM wbs_nodes WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM project_schedules WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM role_assignments WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM roles WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM packages WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM projects WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM portfolios WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM legal_entities WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM companies WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM user_accounts WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await pool.end();
  });

  it('projects ScheduleDraftChanged atomically to only authorized current recipients', async () => {
    const event = await insertOutboxEvent('ScheduleDraftChanged', scheduleId, 1);
    const result = await store.consume(event, (client, current) => (
      processor.process(client, current)
    ));
    expect(result).toBe('PROCESSED');

    const notifications = await notificationRows();
    expect(notifications).toEqual([
      {
        recipientId: activityOwnerId, alertType: 'OVERDUE', priority: 'HIGH',
        activityId, status: 'UNREAD', thresholdVersion: config.schedule.thresholdVersion
      },
      {
        recipientId: projectManagerId, alertType: 'OVERDUE', priority: 'HIGH',
        activityId, status: 'UNREAD', thresholdVersion: config.schedule.thresholdVersion
      }
    ].sort((left, right) => left.recipientId.localeCompare(right.recipientId)));
    expect(notifications.map((row) => row.recipientId)).not.toContain(otherPackageUserId);
    expect(notifications.map((row) => row.recipientId)).not.toContain(noPermissionUserId);

    const consumption = await pool.query<{
      status: string;
      attemptCount: number;
    }>(`SELECT status, attempt_count AS "attemptCount"
      FROM event_consumptions
      WHERE tenant_id = $1 AND event_id = $2 AND consumer_name = $3`,
    [tenantId, event.eventId, config.consumption.consumerName]);
    expect(consumption.rows).toEqual([{ status: 'PROCESSED', attemptCount: 1 }]);

    const replay = await store.consume(event, (client, current) => (
      processor.process(client, current)
    ));
    expect(replay).toBe('DUPLICATE');
    expect(await notificationRows()).toHaveLength(2);
  });

  it('projects ProgressRecorded and deduplicates a distinct event for the same alert date', async () => {
    const first = await insertOutboxEvent('ProgressRecorded', activityId, 2);
    expect(await store.consume(first, (client, current) => (
      processor.process(client, current)
    ))).toBe('PROCESSED');
    expect(await notificationRows()).toHaveLength(2);

    const second = await insertOutboxEvent('ProgressRecorded', activityId, 3);
    expect(await store.consume(second, (client, current) => (
      processor.process(client, current)
    ))).toBe('PROCESSED');
    const notifications = await notificationRows();
    expect(notifications).toHaveLength(2);
    expect(new Set(notifications.map((row) => row.recipientId))).toEqual(
      new Set([projectManagerId, activityOwnerId])
    );
    const processed = await pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM event_consumptions
      WHERE tenant_id = $1 AND event_id = ANY($2::uuid[]) AND status = 'PROCESSED'
    `, [tenantId, [first.eventId, second.eventId]]);
    expect(processed.rows[0]?.count).toBe('2');
    expect(logger.info).toHaveBeenLastCalledWith(
      'schedule_alert_projection_updated',
      expect.objectContaining({ eventId: second.eventId, inserted: 0 })
    );
  });

  it('records an out-of-scope event consumption without creating DB-105 rows', async () => {
    const event = await insertOutboxEvent('PROJECT_CREATED', projectId, 1);
    expect(processor.supports(event)).toBe(false);
    expect(await store.consume(event, (client, current) => (
      processor.process(client, current)
    ))).toBe('PROCESSED');
    expect(await notificationRows()).toEqual([]);
    expect(logger.info).not.toHaveBeenCalledWith(
      'schedule_alert_projection_updated', expect.anything()
    );
  });

  async function seedScheduleFixture(): Promise<void> {
    await pool.query(`INSERT INTO tenants (id, code, name, status)
      VALUES ($1, $2, 'Schedule Alert Integration', 'ACTIVE')`,
    [tenantId, `schedule-alert-${process.pid}-${Date.now()}`.slice(0, 64)]);
    await pool.query(`INSERT INTO user_accounts
      (id, tenant_id, email, normalized_email, display_name, status) VALUES
      ($1, $5, 'pm-alert@example.test', 'pm-alert@example.test', 'Alert PM', 'ACTIVE'),
      ($2, $5, 'owner-alert@example.test', 'owner-alert@example.test', 'Alert Owner', 'ACTIVE'),
      ($3, $5, 'other-package@example.test', 'other-package@example.test', 'Other Package', 'ACTIVE'),
      ($4, $5, 'no-alert-permission@example.test', 'no-alert-permission@example.test', 'No Alert Permission', 'ACTIVE')`,
    [projectManagerId, activityOwnerId, otherPackageUserId, noPermissionUserId, tenantId]);
    await pool.query(`INSERT INTO companies
      (id, tenant_id, code, name, organization_type, status)
      VALUES ($1, $2, 'ALERT-COMPANY', 'Alert Company', 'INTERNAL', 'ACTIVE')`,
    [companyId, tenantId]);
    await pool.query(`INSERT INTO legal_entities
      (id, tenant_id, company_id, legal_name, country, registration_no, status)
      VALUES ($1, $2, $3, 'Alert Legal Entity', 'VN', $4, 'ACTIVE')`,
    [legalEntityId, tenantId, companyId, `REG-${randomUUID()}`]);
    await pool.query(`INSERT INTO portfolios (id, tenant_id, code, name, status)
      VALUES ($1, $2, 'ALERT-PORTFOLIO', 'Alert Portfolio', 'ACTIVE')`,
    [portfolioId, tenantId]);
    await pool.query(`INSERT INTO projects (
      id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
      project_manager_id, code, name, type, phase, record_status, contract_model,
      currency, planned_cod
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'ALERT-PROJECT', 'Alert Project', 'SOLAR',
      'PLANNING', 'ACTIVE', 'EPC', 'VND', '2027-12-31'
    )`, [projectId, tenantId, portfolioId, legalEntityId, companyId, projectManagerId]);
    await pool.query(`INSERT INTO packages
      (id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by)
      VALUES
      ($1, $3, $4, 'ALERT-A', 'Alert Package A', 'EPC', 'ACTIVE', $5, $5),
      ($2, $3, $4, 'ALERT-B', 'Alert Package B', 'EPC', 'ACTIVE', $5, $5)`,
    [packageId, otherPackageId, tenantId, projectId, projectManagerId]);
    await pool.query(`INSERT INTO project_schedules (
      id, tenant_id, project_id, timezone, calendar_code, working_week,
      calendar_exceptions, data_date, status, source_format, source_name,
      created_by, updated_by
    ) VALUES (
      $1, $2, $3, 'Asia/Ho_Chi_Minh', 'STANDARD', '[1,2,3,4,5]'::jsonb,
      '[]'::jsonb, '2026-07-13', 'DRAFT', 'MANUAL', 'Synthetic alert fixture', $4, $4
    )`, [scheduleId, tenantId, projectId, projectManagerId]);
    await pool.query(`INSERT INTO wbs_nodes (
      id, tenant_id, project_id, schedule_id, package_id, owner_id,
      code, name, weight, sort_order, status, created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'ALERT-WBS', 'Alert WBS', 100, 0,
      'ACTIVE', $7, $7
    )`, [wbsId, tenantId, projectId, scheduleId, packageId, activityOwnerId, projectManagerId]);
    await pool.query(`INSERT INTO schedule_activities (
      id, tenant_id, project_id, schedule_id, wbs_id, package_id, owner_id,
      code, name, activity_type, weight, planned_start, planned_finish,
      duration_work_days, remaining_duration_work_days, percent_complete,
      status, created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'ALERT-ACTIVITY', 'Overdue activity',
      'TASK', 100, '2026-07-06', '2026-07-10', 5, 4, 20,
      'IN_PROGRESS', $8, $8
    )`, [
      activityId, tenantId, projectId, scheduleId, wbsId, packageId,
      activityOwnerId, projectManagerId
    ]);

    const pmRole = randomUUID();
    const ownerRole = randomUUID();
    const unrelatedRole = randomUUID();
    const noPermissionRole = randomUUID();
    await pool.query(`INSERT INTO roles
      (id, tenant_id, code, name, permissions, policy_version, status) VALUES
      ($1, $5, 'ALERT_PM', 'Alert PM', '["schedule.read"]'::jsonb, 1, 'ACTIVE'),
      ($2, $5, 'ALERT_OWNER', 'Alert Owner', '["schedule.read"]'::jsonb, 1, 'ACTIVE'),
      ($3, $5, 'ALERT_OTHER_PACKAGE', 'Other Package', '["schedule.read"]'::jsonb, 1, 'ACTIVE'),
      ($4, $5, 'NO_ALERT_PERMISSION', 'No Alert Permission', '["project.read"]'::jsonb, 1, 'ACTIVE')`,
    [pmRole, ownerRole, unrelatedRole, noPermissionRole, tenantId]);
    await pool.query(`INSERT INTO role_assignments (
      id, tenant_id, user_account_id, role_id, scope_type, scope_id,
      effective_from, status
    ) VALUES
      ($1, $9, $5, $10, 'TENANT', NULL, '2026-01-01T00:00:00Z', 'ACTIVE'),
      ($2, $9, $6, $11, 'PACKAGE', $13, '2026-01-01T00:00:00Z', 'ACTIVE'),
      ($3, $9, $7, $12, 'PACKAGE', $14, '2026-01-01T00:00:00Z', 'ACTIVE'),
      ($4, $9, $8, $15, 'TENANT', NULL, '2026-01-01T00:00:00Z', 'ACTIVE')`, [
      randomUUID(), randomUUID(), randomUUID(), randomUUID(),
      projectManagerId, activityOwnerId, otherPackageUserId, noPermissionUserId,
      tenantId, pmRole, ownerRole, unrelatedRole, packageId, otherPackageId,
      noPermissionRole
    ]);
  }

  async function insertOutboxEvent(
    eventType: string, aggregateId: string, aggregateVersion: number
  ): Promise<DomainEventJob> {
    const eventId = randomUUID();
    const correlationId = randomUUID();
    const occurredAt = new Date().toISOString();
    const payload = { projectId, scheduleId, activityId };
    await pool.query(`INSERT INTO transactional_outbox_events (
      id, tenant_id, actor_id, event_key, aggregate_type, aggregate_id,
      aggregate_version, event_type, schema_version, payload, status,
      occurred_at, available_at, attempt_count, correlation_id
    ) VALUES (
      $1, $2, $3, $4, 'ProjectSchedule', $5,
      $6, $7, 1, $8::jsonb, 'PENDING', $9, $9, 0, $10
    )`, [
      eventId, tenantId, projectManagerId, `schedule-alert:${eventId}`,
      aggregateId, aggregateVersion, eventType, JSON.stringify(payload),
      occurredAt, correlationId
    ]);
    return {
      eventId, tenantId, actorId: projectManagerId,
      eventKey: `schedule-alert:${eventId}`,
      aggregateType: 'ProjectSchedule', aggregateId, aggregateVersion,
      eventType, schemaVersion: 1, payload, occurredAt, correlationId
    };
  }

  async function notificationRows(): Promise<Array<{
    recipientId: string;
    alertType: string;
    priority: string;
    activityId: string;
    status: string;
    thresholdVersion: string;
  }>> {
    const result = await pool.query<{
      recipientId: string;
      alertType: string;
      priority: string;
      activityId: string;
      status: string;
      thresholdVersion: string;
    }>(`SELECT recipient_user_id AS "recipientId", alert_type AS "alertType",
      priority, activity_id AS "activityId", status,
      threshold_version AS "thresholdVersion"
      FROM schedule_notifications
      WHERE tenant_id = $1 AND project_id = $2
      ORDER BY recipient_user_id, alert_type`, [tenantId, projectId]);
    return result.rows;
  }
});
