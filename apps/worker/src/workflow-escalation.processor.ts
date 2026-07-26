import type { PoolClient } from 'pg';
import type { DomainEventJob } from './domain-event';
import type { DomainEventProcessor } from './domain-event.processor';
import {
  authorizedRecipients,
  notificationDedupKey,
  removeStaleNotifications,
  upsertNotification
} from './notification-projection';
import type { WorkerLogger } from './worker-logger';

/**
 * Version tag of the escalation notification policy; part of the dedup key so a policy change
 * reprojects rather than silently mutating existing rows.
 */
export const WORKFLOW_ESCALATION_THRESHOLD_VERSION = 'WORKFLOW_ESCALATION_V1';

const TERMINAL_STATES = ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const;

interface InstanceRow {
  id: string;
  projectId: string | null;
  packageId: string | null;
  state: string;
  currentStepKey: string | null;
  requestedBy: string;
  escalationCount: number;
  lastEscalatedAt: Date | null;
  routeSnapshot: { steps?: Array<Record<string, unknown>> };
}

export function workflowEscalationObjectLink(instanceId: string): string {
  return `/approval-tasks?workflowInstanceId=${encodeURIComponent(instanceId)}`;
}

export function escalationReason(stepKey: string, escalationCount: number): string {
  return `Yêu cầu phê duyệt tại bước ${stepKey} đã được escalate (lần ${escalationCount}); vui lòng quyết định`;
}

/** Role codes the current step names; empty when the step cannot be found in the frozen route. */
export function currentStepRoleCodes(
  routeSnapshot: InstanceRow['routeSnapshot'], currentStepKey: string | null
): string[] {
  if (!currentStepKey || !Array.isArray(routeSnapshot.steps)) return [];
  const step = routeSnapshot.steps.find((candidate) => candidate.key === currentStepKey);
  if (!step) return [];
  const selector = step.approverSelector as { roleCodes?: unknown } | undefined;
  const roleCodes = Array.isArray(selector?.roleCodes)
    ? selector.roleCodes.filter((code): code is string => typeof code === 'string') : [];
  const fallback = Array.isArray(step.fallbackRoleCodes)
    ? step.fallbackRoleCodes.filter((code): code is string => typeof code === 'string') : [];
  return [...new Set([...roleCodes, ...fallback])];
}

/**
 * Projects the DB-105 APPROVAL_ESCALATED notification for `WorkflowInstance.EscalationRequested`
 * (API-113). Recipients are the CURRENT step's eligible approvers: `authorizedRecipients` proves
 * live `approval.decide` reach into the instance's project/package and excludes the requester;
 * an extra role filter narrows to holders of the step's (or fallback) role codes — exactly the
 * population API-111 would accept a decision from.
 *
 * Canonical row shape (enforced by the trigger): package NULL, priority HIGH, project = the
 * instance's project; the escalation business date fills due_at/data_date.
 */
export class WorkflowEscalationProcessor implements DomainEventProcessor {
  constructor(private readonly logger: WorkerLogger) {}

  supports(event: DomainEventJob): boolean {
    return event.aggregateType === 'WorkflowInstance'
      && event.eventType === 'WorkflowInstance.EscalationRequested';
  }

  async process(client: PoolClient, event: DomainEventJob): Promise<void> {
    if (!this.supports(event)) return;
    // The committed row is the truth; the payload is advisory only.
    const instance = await this.loadInstance(client, event.tenantId, event.aggregateId);
    if (!instance) throw new Error('Escalation event instance does not exist');

    if (instance.projectId === null) {
      // Documented V1 limit: DB-105 notifications require a project (NOT NULL + composite FK), so
      // a project-less instance cannot be projected. Skip loudly instead of failing the event.
      this.logger.warn('workflow_escalation_skipped_no_project', {
        tenantId: event.tenantId,
        workflowInstanceId: instance.id,
        eventId: event.eventId,
        correlationId: event.correlationId
      });
      return;
    }

    let inserted = 0;
    const currentDedupKeys: string[] = [];
    const terminal = (TERMINAL_STATES as readonly string[]).includes(instance.state);
    const roleCodes = currentStepRoleCodes(instance.routeSnapshot, instance.currentStepKey);

    if (!terminal && instance.currentStepKey !== null && roleCodes.length > 0) {
      const businessDate = await this.escalationBusinessDate(client, event.tenantId, instance);
      const authorized = await authorizedRecipients(client, {
        tenantId: event.tenantId,
        projectId: instance.projectId,
        packageId: instance.packageId,
        requiredPermissions: ['approval.decide'],
        fullProjectOnly: false,
        excludedUserIds: [instance.requestedBy]
      });
      const recipients = await this.holdersOfRoles(client, event.tenantId, authorized, roleCodes);
      for (const recipientId of recipients) {
        const dedupKey = notificationDedupKey({
          tenantId: event.tenantId,
          projectId: instance.projectId,
          packageId: null,
          sourceType: 'WorkflowInstance',
          sourceId: instance.id,
          recipientId,
          alertType: 'APPROVAL_ESCALATED',
          dueAt: businessDate,
          thresholdVersion: WORKFLOW_ESCALATION_THRESHOLD_VERSION
        });
        currentDedupKeys.push(dedupKey);
        const result = await upsertNotification(client, {
          tenantId: event.tenantId,
          recipientId,
          projectId: instance.projectId,
          // Canonical: an approval reminder addresses step approvers, not a package.
          packageId: null,
          activityId: null,
          sourceType: 'WorkflowInstance',
          sourceId: instance.id,
          alertType: 'APPROVAL_ESCALATED',
          priority: 'HIGH',
          objectLink: workflowEscalationObjectLink(instance.id),
          reason: escalationReason(instance.currentStepKey, instance.escalationCount),
          dueAt: businessDate,
          dataDate: businessDate,
          thresholdVersion: WORKFLOW_ESCALATION_THRESHOLD_VERSION,
          dedupKey
        });
        if (result.inserted) inserted += 1;
      }
    }

    // Reconciliation, deliberately narrowed to source_type 'WorkflowInstance' ONLY so no other
    // projector's rows are ever wiped: keep this event's fresh keys plus every key belonging to
    // OTHER non-terminal instances of the project; everything else — terminal instances' rows and
    // this instance's superseded/revoked-approver rows — is stale.
    const keepKeys = [
      ...currentDedupKeys,
      ...await this.otherLiveInstanceKeys(client, event.tenantId, instance.projectId, instance.id)
    ];
    const removed = await removeStaleNotifications(
      client, event.tenantId, instance.projectId, ['WorkflowInstance'], keepKeys
    );

    this.logger.info('workflow_escalation_projection_updated', {
      tenantId: event.tenantId,
      projectId: instance.projectId,
      workflowInstanceId: instance.id,
      eventId: event.eventId,
      correlationId: event.correlationId,
      inserted,
      removed,
      terminal
    });
  }

  private async loadInstance(
    client: PoolClient, tenantId: string, instanceId: string
  ): Promise<InstanceRow | null> {
    const result = await client.query<InstanceRow>(`
      SELECT id, project_id AS "projectId", package_id AS "packageId", state,
        current_step_key AS "currentStepKey", requested_by AS "requestedBy",
        escalation_count AS "escalationCount", last_escalated_at AS "lastEscalatedAt",
        route_snapshot AS "routeSnapshot"
      FROM workflow_instances
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, instanceId]);
    return result.rows[0] ?? null;
  }

  /**
   * The escalation business date: the last escalation instant expressed in the project's primary
   * site timezone (the same site policy every other alert source uses); UTC when the project has
   * no primary site, so a missing site never blocks a reminder.
   */
  private async escalationBusinessDate(
    client: PoolClient, tenantId: string, instance: InstanceRow
  ): Promise<string> {
    const result = await client.query<{ businessDate: string }>(`
      SELECT COALESCE(
        (SELECT ($3::timestamptz AT TIME ZONE site.timezone)::date::text
         FROM sites site
         WHERE site.tenant_id = $1 AND site.project_id = $2 AND site.is_primary = true),
        ($3::timestamptz AT TIME ZONE 'UTC')::date::text
      ) AS "businessDate"
    `, [tenantId, instance.projectId, instance.lastEscalatedAt ?? new Date()]);
    return result.rows[0].businessDate;
  }

  /** Of the permission-authorized users, keep only live holders of the step's role codes. */
  private async holdersOfRoles(
    client: PoolClient, tenantId: string, userIds: readonly string[], roleCodes: readonly string[]
  ): Promise<string[]> {
    if (userIds.length === 0 || roleCodes.length === 0) return [];
    const result = await client.query<{ userId: string }>(`
      SELECT DISTINCT assignment.user_account_id AS "userId"
      FROM role_assignments assignment
      JOIN roles role
        ON role.id = assignment.role_id AND role.tenant_id = assignment.tenant_id
      WHERE assignment.tenant_id = $1
        AND assignment.user_account_id = ANY($2::uuid[])
        AND role.code = ANY($3::text[])
        AND assignment.status = 'ACTIVE'
        AND role.status = 'ACTIVE'
        AND assignment.effective_from <= CURRENT_TIMESTAMP
        AND (assignment.effective_to IS NULL OR assignment.effective_to > CURRENT_TIMESTAMP)
      ORDER BY "userId"
    `, [tenantId, [...userIds], [...roleCodes]]);
    return result.rows.map((row) => row.userId);
  }

  /** Dedup keys of WorkflowInstance notifications that belong to other, still-open instances. */
  private async otherLiveInstanceKeys(
    client: PoolClient, tenantId: string, projectId: string, instanceId: string
  ): Promise<string[]> {
    const result = await client.query<{ dedupKey: string }>(`
      SELECT notification.dedup_key AS "dedupKey"
      FROM notifications notification
      JOIN workflow_instances instance
        ON instance.tenant_id = notification.tenant_id AND instance.id = notification.source_id
      WHERE notification.tenant_id = $1
        AND notification.project_id = $2
        AND notification.source_type = 'WorkflowInstance'
        AND instance.id <> $3
        AND instance.state NOT IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')
    `, [tenantId, projectId, instanceId]);
    return result.rows.map((row) => row.dedupKey);
  }
}
