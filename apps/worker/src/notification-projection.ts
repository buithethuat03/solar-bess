import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export type NotificationSourceType =
  | 'ScheduleActivity'
  | 'Risk'
  | 'Issue'
  | 'RiskIssueAction'
  | 'ChangeRequest';

export type NotificationAlertType =
  | 'OVERDUE'
  | 'NEAR_CRITICAL'
  | 'RISK_REVIEW_DUE'
  | 'ISSUE_TARGET_DUE'
  | 'ACTION_OVERDUE'
  | 'CHANGE_DECISION_PENDING';

export interface NotificationProjection {
  tenantId: string;
  recipientId: string;
  projectId: string;
  packageId: string | null;
  activityId: string | null;
  sourceType: NotificationSourceType;
  sourceId: string;
  alertType: NotificationAlertType;
  priority: 'NORMAL' | 'HIGH';
  objectLink: string;
  reason: string;
  dueAt: string;
  dataDate: string;
  thresholdVersion: string;
  dedupKey: string;
}

export interface RecipientPolicy {
  tenantId: string;
  projectId: string;
  packageId: string | null;
  requiredPermissions: readonly string[];
  fullProjectOnly?: boolean;
  excludedUserIds?: readonly string[];
}

export function notificationDedupKey(input: {
  tenantId: string;
  projectId: string;
  packageId: string | null;
  sourceType: NotificationSourceType;
  sourceId: string;
  recipientId: string;
  alertType: NotificationAlertType;
  dueAt: string;
  thresholdVersion: string;
}): string {
  return createHash('sha256').update([
    input.tenantId,
    input.projectId,
    input.packageId ?? '',
    input.sourceType,
    input.sourceId,
    input.recipientId,
    input.alertType,
    input.dueAt,
    input.thresholdVersion
  ].join(':')).digest('hex');
}

export async function authorizedRecipients(
  client: PoolClient,
  policy: RecipientPolicy
): Promise<string[]> {
  if (policy.requiredPermissions.length === 0) {
    throw new Error('Notification recipient policy requires at least one permission');
  }
  const result = await client.query<{ userId: string }>(`
    SELECT account.id AS "userId"
    FROM user_accounts account
    JOIN projects project
      ON project.id = $2 AND project.tenant_id = account.tenant_id
    WHERE account.tenant_id = $1
      AND account.status = 'ACTIVE'
      AND NOT (account.id = ANY($6::uuid[]))
      AND NOT EXISTS (
        SELECT 1
        FROM unnest($4::text[]) required(permission)
        WHERE NOT EXISTS (
          SELECT 1
          FROM role_assignments assignment
          JOIN roles role
            ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id
          WHERE assignment.tenant_id = account.tenant_id
            AND assignment.user_account_id = account.id
            AND assignment.status = 'ACTIVE'
            AND role.status = 'ACTIVE'
            AND assignment.effective_from <= CURRENT_TIMESTAMP
            AND (assignment.effective_to IS NULL OR assignment.effective_to > CURRENT_TIMESTAMP)
            AND role.permissions ? required.permission
            AND ($5::boolean = false OR assignment.scope_type <> 'PACKAGE')
            AND (
              assignment.scope_type = 'TENANT'
              OR (assignment.scope_type = 'PORTFOLIO'
                AND assignment.scope_id = project.portfolio_id)
              OR (assignment.scope_type = 'PROJECT' AND assignment.scope_id = project.id)
              OR (assignment.scope_type = 'PACKAGE' AND assignment.scope_id = $3::uuid)
            )
        )
      )
    ORDER BY account.id
  `, [
    policy.tenantId,
    policy.projectId,
    policy.packageId,
    [...policy.requiredPermissions],
    policy.fullProjectOnly ?? false,
    [...(policy.excludedUserIds ?? [])]
  ]);
  return result.rows.map((row) => row.userId);
}

export async function upsertNotification(
  client: PoolClient,
  notification: NotificationProjection
): Promise<{ inserted: boolean; changed: boolean }> {
  const result = await client.query<{ inserted: boolean }>(`
    INSERT INTO notifications (
      id, tenant_id, recipient_user_id, project_id, package_id, activity_id,
      source_type, source_id, alert_type, priority, object_link,
      reason, due_at, data_date, threshold_version, dedup_key, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, $15, $16, 'UNREAD'
    )
    ON CONFLICT ON CONSTRAINT uq_notification_dedup DO UPDATE SET
      package_id = EXCLUDED.package_id,
      activity_id = EXCLUDED.activity_id,
      source_type = EXCLUDED.source_type,
      source_id = EXCLUDED.source_id,
      alert_type = EXCLUDED.alert_type,
      priority = EXCLUDED.priority,
      object_link = EXCLUDED.object_link,
      reason = EXCLUDED.reason,
      due_at = EXCLUDED.due_at,
      data_date = EXCLUDED.data_date,
      threshold_version = EXCLUDED.threshold_version
    WHERE notifications.package_id IS DISTINCT FROM EXCLUDED.package_id
      OR notifications.activity_id IS DISTINCT FROM EXCLUDED.activity_id
      OR notifications.source_type IS DISTINCT FROM EXCLUDED.source_type
      OR notifications.source_id IS DISTINCT FROM EXCLUDED.source_id
      OR notifications.alert_type IS DISTINCT FROM EXCLUDED.alert_type
      OR notifications.priority IS DISTINCT FROM EXCLUDED.priority
      OR notifications.object_link IS DISTINCT FROM EXCLUDED.object_link
      OR notifications.reason IS DISTINCT FROM EXCLUDED.reason
      OR notifications.due_at IS DISTINCT FROM EXCLUDED.due_at
      OR notifications.data_date IS DISTINCT FROM EXCLUDED.data_date
      OR notifications.threshold_version IS DISTINCT FROM EXCLUDED.threshold_version
    RETURNING (xmax = 0) AS inserted
  `, [
    randomUUID(),
    notification.tenantId,
    notification.recipientId,
    notification.projectId,
    notification.packageId,
    notification.activityId,
    notification.sourceType,
    notification.sourceId,
    notification.alertType,
    notification.priority,
    notification.objectLink,
    notification.reason,
    notification.dueAt,
    notification.dataDate,
    notification.thresholdVersion,
    notification.dedupKey
  ]);
  return {
    inserted: result.rows[0]?.inserted === true,
    changed: (result.rowCount ?? 0) > 0
  };
}

export async function removeStaleNotifications(
  client: PoolClient,
  tenantId: string,
  projectId: string,
  sourceTypes: readonly NotificationSourceType[],
  currentDedupKeys: readonly string[]
): Promise<number> {
  const result = await client.query(`
    DELETE FROM notifications
    WHERE tenant_id = $1
      AND project_id = $2
      AND source_type = ANY($3::text[])
      AND NOT (dedup_key = ANY($4::varchar[]))
  `, [tenantId, projectId, [...sourceTypes], [...currentDedupKeys]]);
  return result.rowCount ?? 0;
}
