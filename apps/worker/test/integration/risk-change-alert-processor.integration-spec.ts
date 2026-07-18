import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { loadWorkerConfig, type WorkerConfig } from '../../src/config';
import type { DomainEventJob } from '../../src/domain-event';
import { RiskChangeAlertProcessor } from '../../src/risk-change-alert.processor';
import type { WorkerLogger } from '../../src/worker-logger';

const tenantId = randomUUID();
const projectId = randomUUID();
const portfolioId = randomUUID();
const companyId = randomUUID();
const legalEntityId = randomUUID();
const siteId = randomUUID();
const packageId = randomUUID();
const otherPackageId = randomUUID();
const riskId = randomUUID();
const issueId = randomUUID();
const actionId = randomUUID();
const changeId = randomUUID();
const managerId = randomUUID();
const ownerId = randomUUID();
const otherPackageUserId = randomUUID();
const noPermissionUserId = randomUUID();
const managerAssignmentId = randomUUID();
const ownerAssignmentId = randomUUID();

const logger: WorkerLogger = {
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
};

describe('RiskChangeAlertProcessor PostgreSQL projection — TEST-015/194', () => {
  let config: WorkerConfig;
  let pool: Pool;
  let client: PoolClient;
  let processor: RiskChangeAlertProcessor;
  let transactionStarted = false;
  let businessDate: string;

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
    config = loadWorkerConfig({
      WORKER_DATABASE_URL_FILE: databaseSecret,
      WORKER_DATABASE_HOST_OVERRIDE: process.env.WORKER_TEST_DATABASE_HOST,
      WORKER_DATABASE_PORT_OVERRIDE: process.env.WORKER_TEST_DATABASE_PORT,
      WORKER_DATABASE_NAME_OVERRIDE: process.env.WORKER_TEST_DATABASE_NAME,
      WORKER_REDIS_PASSWORD_FILE: redisSecret,
      WORKER_REDIS_HOST: process.env.WORKER_TEST_REDIS_HOST ?? '127.0.0.1',
      WORKER_REDIS_PORT: process.env.WORKER_TEST_REDIS_PORT ?? '6380',
      WORKER_ID: `risk-change-alert-test-${process.pid}`,
      RISK_HIGH_EXPOSURE_THRESHOLD: '15',
      RISK_CRITICAL_EXPOSURE_THRESHOLD: '20',
      RISK_CHANGE_THRESHOLD_VERSION: 'RISK_CHANGE_THRESHOLDS_V1'
    }, (path) => readFileSync(path, 'utf8'));
    pool = new Pool({
      connectionString: config.database.url,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      query_timeout: config.database.queryTimeoutMs,
      statement_timeout: config.database.queryTimeoutMs,
      application_name: 'risk-change-alert-integration-test'
    });
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    await seedFixture();
    const dateResult = await client.query<{ businessDate: string }>(`
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE timezone)::date::text AS "businessDate"
      FROM sites WHERE id = $1
    `, [siteId]);
    businessDate = dateResult.rows[0]!.businessDate;
    processor = new RiskChangeAlertProcessor(config, logger);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await client.query('DELETE FROM notifications WHERE tenant_id = $1', [tenantId]);
    await client.query(`UPDATE role_assignments SET status = 'ACTIVE'
      WHERE id = $1`, [ownerAssignmentId]);
  });

  afterAll(async () => {
    if (client) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    if (pool) await pool.end();
  });

  it('reloads committed sources and writes exact typed mapping/date/priority fields', async () => {
    const event = domainEvent('Risk', 'RiskChanged', riskId, {
      projectId,
      packageId,
      priority: 'NORMAL',
      dueAt: '2099-12-31',
      thresholdVersion: 'PAYLOAD_MUST_NOT_WIN'
    });
    expect(processor.supports(event)).toBe(true);

    await processor.process(client, event);

    const rows = await notificationRows();
    expect(rows).toHaveLength(7);
    expect(rows.filter((row) => row.recipientId === managerId)).toEqual([
      expected('ChangeRequest', changeId, 'CHANGE_DECISION_PENDING', 'NORMAL', managerId,
        '2026-07-17', '2026-07-17'),
      expected('Issue', issueId, 'ISSUE_TARGET_DUE', 'NORMAL', managerId,
        '2000-01-02', businessDate),
      expected('Risk', riskId, 'RISK_REVIEW_DUE', 'HIGH', managerId,
        '2000-01-01', businessDate),
      expected('RiskIssueAction', actionId, 'ACTION_OVERDUE', 'HIGH', managerId,
        '2000-01-03', businessDate)
    ]);
    expect(rows.filter((row) => row.recipientId === ownerId)).toEqual([
      expected('Issue', issueId, 'ISSUE_TARGET_DUE', 'NORMAL', ownerId,
        '2000-01-02', businessDate),
      expected('Risk', riskId, 'RISK_REVIEW_DUE', 'HIGH', ownerId,
        '2000-01-01', businessDate),
      expected('RiskIssueAction', actionId, 'ACTION_OVERDUE', 'HIGH', ownerId,
        '2000-01-03', businessDate)
    ]);
    expect(rows.map((row) => row.recipientId)).not.toContain(otherPackageUserId);
    expect(rows.map((row) => row.recipientId)).not.toContain(noPermissionUserId);
    expect(logger.info).toHaveBeenCalledWith(
      'risk_change_alert_projection_updated',
      expect.objectContaining({ eventId: event.eventId, projectId, inserted: 7 })
    );
  });

  it('is idempotent, preserves read state and resolves revoked recipients', async () => {
    expect(await processor.scanProject(client, tenantId, projectId)).toBe(7);
    await client.query(`UPDATE notifications SET status = 'READ', read_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND recipient_user_id = $2
        AND source_type = 'Risk' AND source_id = $3`, [tenantId, managerId, riskId]);

    expect(await processor.scanProject(client, tenantId, projectId)).toBe(0);
    expect((await notificationRows()).find((row) => (
      row.recipientId === managerId && row.sourceType === 'Risk'
    ))?.status).toBe('READ');

    await client.query(`UPDATE role_assignments SET status = 'INACTIVE'
      WHERE id = $1`, [ownerAssignmentId]);
    expect(await processor.scanProject(client, tenantId, projectId)).toBe(0);
    const rows = await notificationRows();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.recipientId))).toEqual(new Set([managerId]));
    expect(rows.find((row) => row.sourceType === 'Risk')?.status).toBe('READ');
  });

  it('rejects a project payload that does not match the committed aggregate', async () => {
    const event = domainEvent('Risk', 'RiskChanged', riskId, {
      projectId: randomUUID(), packageId
    });

    await expect(processor.process(client, event)).rejects.toThrow(
      'does not match its committed aggregate'
    );
    expect(await notificationRows()).toEqual([]);
  });

  it('rejects a non-canonical source/alert combination at DB-105', async () => {
    await client.query('SAVEPOINT invalid_notification_mapping');
    try {
      await expect(client.query(`INSERT INTO notifications (
        id, tenant_id, recipient_user_id, project_id, package_id, activity_id,
        source_type, source_id, alert_type, priority, object_link, reason,
        due_at, data_date, threshold_version, dedup_key, status
      ) VALUES (
        $1, $2, $3, $4, $5, NULL,
        'Risk', $6, 'ACTION_OVERDUE', 'HIGH', '/invalid', 'invalid mapping',
        '2000-01-01', $7, $8, $9, 'UNREAD'
      )`, [
        randomUUID(), tenantId, managerId, projectId, packageId, riskId,
        businessDate, config.riskChange.thresholdVersion, randomUUID()
      ])).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT invalid_notification_mapping');
      await client.query('RELEASE SAVEPOINT invalid_notification_mapping');
    }
  });

  async function seedFixture(): Promise<void> {
    await client.query(`INSERT INTO tenants (id, code, name, status)
      VALUES ($1, $2, 'Risk Change Alert Integration', 'ACTIVE')`, [
      tenantId, `risk-change-alert-${process.pid}-${Date.now()}`.slice(0, 64)
    ]);
    await client.query(`INSERT INTO user_accounts
      (id, tenant_id, email, normalized_email, display_name, status) VALUES
      ($1, $5, 'risk-manager@example.test', 'risk-manager@example.test', 'Risk Manager', 'ACTIVE'),
      ($2, $5, 'risk-owner@example.test', 'risk-owner@example.test', 'Risk Owner', 'ACTIVE'),
      ($3, $5, 'risk-other-package@example.test', 'risk-other-package@example.test', 'Other Package', 'ACTIVE'),
      ($4, $5, 'risk-no-permission@example.test', 'risk-no-permission@example.test', 'No Permission', 'ACTIVE')`,
    [managerId, ownerId, otherPackageUserId, noPermissionUserId, tenantId]);
    await client.query(`INSERT INTO companies
      (id, tenant_id, code, name, organization_type, status)
      VALUES ($1, $2, 'RISK-COMPANY', 'Risk Company', 'INTERNAL', 'ACTIVE')`,
    [companyId, tenantId]);
    await client.query(`INSERT INTO legal_entities
      (id, tenant_id, company_id, legal_name, country, registration_no, status)
      VALUES ($1, $2, $3, 'Risk Legal Entity', 'VN', $4, 'ACTIVE')`,
    [legalEntityId, tenantId, companyId, `REG-${randomUUID()}`]);
    await client.query(`INSERT INTO portfolios (id, tenant_id, code, name, status)
      VALUES ($1, $2, 'RISK-PORTFOLIO', 'Risk Portfolio', 'ACTIVE')`,
    [portfolioId, tenantId]);
    await client.query(`INSERT INTO projects (
      id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
      project_manager_id, code, name, type, phase, record_status, contract_model,
      currency, planned_cod
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'RISK-PROJECT', 'Risk Project', 'HYBRID',
      'EXECUTION', 'ACTIVE', 'EPC', 'VND', '2027-12-31'
    )`, [projectId, tenantId, portfolioId, legalEntityId, companyId, managerId]);
    await client.query(`INSERT INTO sites (
      id, tenant_id, project_id, code, name, timezone, is_primary, status
    ) VALUES (
      $1, $2, $3, 'PRIMARY', 'Primary Site', 'Asia/Ho_Chi_Minh', true, 'ACTIVE'
    )`, [siteId, tenantId, projectId]);
    await client.query(`INSERT INTO packages
      (id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by)
      VALUES
      ($1, $3, $4, 'RISK-A', 'Risk Package A', 'EPC', 'ACTIVE', $5, $5),
      ($2, $3, $4, 'RISK-B', 'Risk Package B', 'EPC', 'ACTIVE', $5, $5)`,
    [packageId, otherPackageId, tenantId, projectId, managerId]);

    await client.query(`INSERT INTO risks (
      id, tenant_id, project_id, package_id, code, category, cause, event, impact,
      probability, cost_impact_rating, schedule_impact_rating, hse_impact_rating,
      impact_rating, inherent_exposure, inherent_level, scoring_version,
      threshold_version, owner_id, review_date, status, created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, 'RSK-ALERT', 'DELIVERY', 'Synthetic cause',
      'Synthetic event', 'Synthetic impact', 4, 5, 3, 2,
      5, 20, 'CRITICAL', 'RISK_SCORING_V1', 'RISK_CHANGE_THRESHOLDS_V1',
      $5, '2000-01-01', 'MONITORING', $6, $6
    )`, [riskId, tenantId, projectId, packageId, ownerId, managerId]);
    await client.query(`INSERT INTO issues (
      id, tenant_id, project_id, package_id, code, title, description, occurred_at,
      root_cause, actual_impact, severity, owner_id, target_date, status,
      created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, 'ISS-ALERT', 'Synthetic issue', 'Synthetic description',
      '2026-07-01T00:00:00Z', 'Synthetic root cause', 'Synthetic actual impact',
      'MEDIUM', $5, '2000-01-02', 'IN_PROGRESS', $6, $6
    )`, [issueId, tenantId, projectId, packageId, ownerId, managerId]);
    await client.query(`INSERT INTO risk_issue_actions (
      id, tenant_id, project_id, package_id, risk_id, code, action_type,
      title, owner_id, due_date, status, created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, 'ACT-ALERT', 'RESPONSE',
      'Synthetic overdue action', $6, '2000-01-03', 'IN_PROGRESS', $7, $7
    )`, [actionId, tenantId, projectId, packageId, riskId, ownerId, managerId]);
    await client.query(`INSERT INTO change_requests (
      id, tenant_id, project_id, package_id, code, title, reason, recommendation,
      owner_id, requester_id, source_type, impact_snapshot, impact_snapshot_hash,
      approval_snapshot, approval_snapshot_hash, status, submitted_by, submitted_at,
      created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, 'CHG-ALERT', 'Synthetic pending change', 'Synthetic reason',
      'Synthetic recommendation', $5, $5, 'MANUAL', '{}'::jsonb, $6,
      '{}'::jsonb, $7, 'SUBMITTED', $5, '2026-07-16T23:30:00Z', $5, $5
    )`, [changeId, tenantId, projectId, packageId, ownerId, 'a'.repeat(64), 'b'.repeat(64)]);

    const managerRoleId = randomUUID();
    const ownerRoleId = randomUUID();
    const otherPackageRoleId = randomUUID();
    const noPermissionRoleId = randomUUID();
    await client.query(`INSERT INTO roles
      (id, tenant_id, code, name, permissions, policy_version, status) VALUES
      ($1, $5, 'RISK_MANAGER', 'Risk Manager',
        '["riskChange.read","riskChange.approve"]'::jsonb, 1, 'ACTIVE'),
      ($2, $5, 'RISK_OWNER', 'Risk Owner', '["riskChange.read"]'::jsonb, 1, 'ACTIVE'),
      ($3, $5, 'RISK_OTHER_PACKAGE', 'Other Package', '["riskChange.read"]'::jsonb, 1, 'ACTIVE'),
      ($4, $5, 'RISK_NO_PERMISSION', 'No Permission', '["project.read"]'::jsonb, 1, 'ACTIVE')`,
    [managerRoleId, ownerRoleId, otherPackageRoleId, noPermissionRoleId, tenantId]);
    await client.query(`INSERT INTO role_assignments (
      id, tenant_id, user_account_id, role_id, scope_type, scope_id,
      effective_from, status
    ) VALUES
      ($1, $9, $5, $10, 'PROJECT', $13, '2026-01-01T00:00:00Z', 'ACTIVE'),
      ($2, $9, $6, $11, 'PACKAGE', $14, '2026-01-01T00:00:00Z', 'ACTIVE'),
      ($3, $9, $7, $12, 'PACKAGE', $15, '2026-01-01T00:00:00Z', 'ACTIVE'),
      ($4, $9, $8, $16, 'TENANT', NULL, '2026-01-01T00:00:00Z', 'ACTIVE')`, [
      managerAssignmentId, ownerAssignmentId, randomUUID(), randomUUID(),
      managerId, ownerId, otherPackageUserId, noPermissionUserId,
      tenantId, managerRoleId, ownerRoleId, otherPackageRoleId,
      projectId, packageId, otherPackageId, noPermissionRoleId
    ]);
  }

  function domainEvent(
    aggregateType: string,
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>
  ): DomainEventJob {
    return {
      eventId: randomUUID(),
      tenantId,
      actorId: managerId,
      eventKey: `risk-change-alert:${randomUUID()}`,
      aggregateType,
      aggregateId,
      aggregateVersion: 2,
      eventType,
      schemaVersion: 1,
      payload,
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID()
    };
  }

  function expected(
    sourceType: string,
    sourceId: string,
    alertType: string,
    priority: string,
    recipientId: string,
    dueAt: string,
    dataDate: string
  ): NotificationRow {
    return {
      sourceType,
      sourceId,
      alertType,
      priority,
      recipientId,
      packageId,
      activityId: null,
      dueAt,
      dataDate,
      thresholdVersion: config.riskChange.thresholdVersion,
      objectLink: sourceType === 'Risk'
        ? `/projects/${projectId}/risk-change?tab=risks&riskId=${sourceId}`
        : sourceType === 'Issue'
          ? `/projects/${projectId}/risk-change?tab=issues&issueId=${sourceId}`
          : sourceType === 'RiskIssueAction'
            ? `/projects/${projectId}/risk-change?tab=risks&actionId=${sourceId}`
            : `/projects/${projectId}/risk-change?tab=changes&changeRequestId=${sourceId}`,
      status: 'UNREAD'
    };
  }

  async function notificationRows(): Promise<NotificationRow[]> {
    const result = await client.query<NotificationRow>(`
      SELECT source_type AS "sourceType", source_id AS "sourceId",
        alert_type AS "alertType", priority,
        recipient_user_id AS "recipientId", package_id AS "packageId",
        activity_id AS "activityId", due_at::text AS "dueAt",
        data_date::text AS "dataDate", threshold_version AS "thresholdVersion",
        object_link AS "objectLink", status
      FROM notifications
      WHERE tenant_id = $1 AND project_id = $2 AND source_type <> 'ScheduleActivity'
      ORDER BY recipient_user_id, source_type, source_id
    `, [tenantId, projectId]);
    return result.rows;
  }
});

interface NotificationRow {
  sourceType: string;
  sourceId: string;
  alertType: string;
  priority: string;
  recipientId: string;
  packageId: string | null;
  activityId: string | null;
  dueAt: string;
  dataDate: string;
  thresholdVersion: string;
  objectLink: string;
  status: string;
}
