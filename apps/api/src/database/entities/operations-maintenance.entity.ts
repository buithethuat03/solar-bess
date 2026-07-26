import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  AlarmCaseSeverity, AlarmCaseState, MaintenancePlanStatus, MaintenancePlanTriggerType,
  ServiceIncidentSeverity, ServiceIncidentStatus, WarrantyClaimStatus, WorkOrderClosureDecision,
  WorkOrderPriority, WorkOrderStatus
} from './operations-maintenance.enums';

/**
 * O&M slice entities (API-114…API-121): DB-084…DB-088 plus DB-119 (WorkOrderClosureCycle).
 *
 * Cross-domain references (`assets` DB-080, `equipment` DB-079, `sites`, `permits_to_work` DB-062,
 * `hse_incidents` DB-063) stay RELATION-LESS on purpose: plain uuid columns here, composite foreign
 * keys in the DDL. That keeps the ORM graph from pulling another slice's aggregate into an O&M
 * query while the database still refuses a cross-tenant or cross-site row.
 *
 * NOT modelled, deliberately (see the migration header for the full record):
 * - DB-083 Warranty — no operation in the 164-operation catalog writes it, so `work_orders` has no
 *   `warranty_id` and no warranties table exists to point at.
 * - Any telemetry, meter, tag, gateway, endpoint, credential or command column. The ABSENCE is the
 *   control (SEC-127/SEC-128); a unit test guards this metadata against such a column appearing.
 */

/**
 * DB-084 — the LOCAL case opened for one or more OT alarm events (FR-118, WF-025).
 *
 * `sourceEventRefs` are LOGICAL references into DB-092 (AlarmEvent), which lives in a separate
 * append-only OT event store, not in this relational database — so there is deliberately no
 * physical foreign key and no `REFERENCES` clause for them (docs/07 §"Time-series/event": "Không
 * physical FK cross-store").
 *
 * SEC-127/SEC-128: acknowledging writes `state`, `acknowledgedBy`, `acknowledgedAt` and
 * `acknowledgmentNote` and NOTHING else. `trg_alarm_case_source_projection_immutable` freezes the
 * ingestion-owned columns so no PM Web path — including acknowledge — can rewrite, clear, reset or
 * suppress the source projection.
 *
 * No V1 operation CREATES an alarm case: the catalog exposes only API-114 (read) and API-115
 * (acknowledge); rows arrive from the read-only integration ingress. Recorded, like the
 * DDL-only `assets`/`equipment` tables of the Engineering slice.
 */
@Entity({ name: 'alarm_cases' })
@Unique('uq_alarm_cases_tenant_id', ['tenantId', 'id'])
@Unique('uq_alarm_cases_site_id', ['tenantId', 'siteId', 'id'])
@Index('idx_alarm_case_register', ['tenantId', 'siteId', 'state', 'severity', 'lastSeenAt'])
@Index('idx_alarm_case_asset', ['tenantId', 'assetId'])
@Check('ck_alarm_case_severity', "severity IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_alarm_case_state', `state IN
  ('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','CLOSED','REOPENED')`)
@Check('ck_alarm_case_seen_order', 'last_seen_at >= first_seen_at')
@Check('ck_alarm_case_source_refs', "jsonb_typeof(source_event_refs) = 'array'")
@Check('ck_alarm_case_source_quality', 'coalesce(length(trim(source_quality)), 1) > 0')
@Check('ck_alarm_case_ack_pair', '(acknowledged_by IS NULL) = (acknowledged_at IS NULL)')
@Check('ck_alarm_case_ack_required', `state IN ('OPEN') OR acknowledged_by IS NOT NULL`)
@Check('ck_alarm_case_ack_note', 'coalesce(length(trim(acknowledgment_note)), 1) > 0')
@Check('ck_alarm_case_version', 'version_no >= 1')
export class AlarmCaseEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  /** Sites are project-scoped; the project is carried so ABAC can reach the case in one predicate. */
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'asset_id', nullable: true }) assetId!: string | null;
  @Column({ type: 'varchar', length: 10 }) severity!: AlarmCaseSeverity;
  @Column({ type: 'varchar', length: 20 }) state!: AlarmCaseState;
  @Column('uuid', { name: 'owner_id', nullable: true }) ownerId!: string | null;
  @Column({ name: 'first_seen_at', type: 'timestamptz' }) firstSeenAt!: Date;
  @Column({ name: 'last_seen_at', type: 'timestamptz' }) lastSeenAt!: Date;
  /** LOGICAL refs into DB-092 only — a separate OT event store, so never a physical foreign key. */
  @Column({ name: 'source_event_refs', type: 'jsonb' }) sourceEventRefs!: string[];
  /** Verbatim from the DB-092 projection; PM Web does not own (and so does not constrain) the vocabulary. */
  @Column({ name: 'source_quality', type: 'varchar', length: 20, nullable: true })
  sourceQuality!: string | null;
  @Column('uuid', { name: 'acknowledged_by', nullable: true }) acknowledgedBy!: string | null;
  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;
  @Column({ name: 'acknowledgment_note', type: 'varchar', length: 2000, nullable: true })
  acknowledgmentNote!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-085 — a service incident with its SLA clock (FR-119, API-116/API-117).
 *
 * `alarmCaseId` and `hseIncidentId` are optional composite foreign keys: an incident raised from a
 * case can only reference a case on the SAME site, and an incident linked to an HSE event can only
 * reference an event in the same project. `ck_service_incident_downtime` refuses an end before its
 * start, and an incident cannot claim RESOLVED/CLOSED without a retained resolution summary.
 */
@Entity({ name: 'service_incidents' })
@Unique('uq_service_incidents_tenant_id', ['tenantId', 'id'])
@Unique('uq_service_incidents_site_id', ['tenantId', 'siteId', 'id'])
@Index('idx_service_incident_register', ['tenantId', 'siteId', 'status', 'severity', 'detectedAt'])
@Index('idx_service_incident_asset', ['tenantId', 'assetId'])
@Check('ck_service_incident_severity', "severity IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_service_incident_status', `status IN
  ('OPEN','INVESTIGATING','MITIGATED','RESOLVED','CLOSED')`)
@Check('ck_service_incident_title', 'coalesce(length(trim(title)), 0) > 0')
@Check('ck_service_incident_downtime', `(downtime_start IS NOT NULL OR downtime_end IS NULL)
  AND (downtime_end IS NULL OR downtime_end >= downtime_start)`)
@Check('ck_service_incident_sla_response', `sla_responded_at IS NULL
  OR sla_responded_at >= detected_at`)
@Check('ck_service_incident_sla_resolution', `sla_resolved_at IS NULL
  OR sla_resolved_at >= detected_at`)
@Check('ck_service_incident_resolution', `status NOT IN ('RESOLVED','CLOSED')
  OR coalesce(length(trim(resolution_summary)), 0) > 0`)
@Check('ck_service_incident_version', 'version_no >= 1')
export class ServiceIncidentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'asset_id', nullable: true }) assetId!: string | null;
  @Column('uuid', { name: 'alarm_case_id', nullable: true }) alarmCaseId!: string | null;
  /** Relation-less by design: the FK to DB-063 lives in the DDL, not in the ORM graph. */
  @Column('uuid', { name: 'hse_incident_id', nullable: true }) hseIncidentId!: string | null;
  @Column({ type: 'varchar', length: 10 }) severity!: ServiceIncidentSeverity;
  @Column({ type: 'varchar', length: 20 }) status!: ServiceIncidentStatus;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 4000, nullable: true }) description!: string | null;
  @Column({ name: 'detected_at', type: 'timestamptz' }) detectedAt!: Date;
  @Column({ name: 'downtime_start', type: 'timestamptz', nullable: true })
  downtimeStart!: Date | null;
  @Column({ name: 'downtime_end', type: 'timestamptz', nullable: true }) downtimeEnd!: Date | null;
  @Column({ name: 'sla_response_due_at', type: 'timestamptz', nullable: true })
  slaResponseDueAt!: Date | null;
  @Column({ name: 'sla_responded_at', type: 'timestamptz', nullable: true })
  slaRespondedAt!: Date | null;
  @Column({ name: 'sla_resolution_due_at', type: 'timestamptz', nullable: true })
  slaResolutionDueAt!: Date | null;
  @Column({ name: 'sla_resolved_at', type: 'timestamptz', nullable: true })
  slaResolvedAt!: Date | null;
  @Column({ name: 'resolution_summary', type: 'varchar', length: 4000, nullable: true })
  resolutionSummary!: string | null;
  @Column('uuid', { name: 'reported_by' }) reportedBy!: string;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-086 — the O&M work order (FR-120/FR-121, WF-024, API-118…API-120).
 *
 * The two constraints that carry the safety story:
 * - `ck_work_order_verifier_independent` — the verifier is never the assignee and never the person
 *   who recorded completion. A technician can never verify (and therefore never close) their own
 *   work, whatever the service layer does. Written with IS DISTINCT FROM so a NULL assignee cannot
 *   turn the predicate into NULL and let the row through.
 * - `ck_work_order_closed` — CLOSED structurally requires a return-to-service reference, a verifier
 *   and a closer. "Closed" cannot mean "walked away".
 *
 * `permitToWorkId` references `permits_to_work (tenant_id, id)`. The site match and the validity
 * window are checked in the service (`evaluatePermitValidity`), because a foreign key can express
 * the site but never the time window or the permit status — keeping both halves of the same rule in
 * one evaluator is worth more than splitting it across a key and a check.
 */
@Entity({ name: 'work_orders' })
@Unique('uq_work_orders_tenant_id', ['tenantId', 'id'])
@Unique('uq_work_orders_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_work_orders_asset_id', ['tenantId', 'assetId', 'id'])
@Unique('uq_work_order_code', ['tenantId', 'code'])
@Index('idx_work_order_register', ['tenantId', 'assetId', 'status', 'priority', 'scheduledAt'])
@Index('idx_work_order_site', ['tenantId', 'siteId', 'status'])
@Index('idx_work_order_assignee', ['tenantId', 'assigneeId', 'status'])
@Check('ck_work_order_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_work_order_work_type', "work_type ~ '^[A-Z][A-Z0-9_]{0,39}$'")
@Check('ck_work_order_priority', "priority IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_work_order_status', `status IN ('DRAFT','APPROVED','SCHEDULED','DISPATCHED',
  'IN_PROGRESS','ON_HOLD','COMPLETE','VERIFIED','CLOSED','REOPENED','CANCELLED')`)
@Check('ck_work_order_dispatched_pair', '(dispatched_by IS NULL) = (dispatched_at IS NULL)')
@Check('ck_work_order_started_pair', '(started_by IS NULL) = (started_at IS NULL)')
@Check('ck_work_order_completed_pair', '(completed_by IS NULL) = (completed_at IS NULL)')
@Check('ck_work_order_verified_pair', '(verified_by IS NULL) = (verified_at IS NULL)')
@Check('ck_work_order_closed_pair', '(closed_by IS NULL) = (closed_at IS NULL)')
@Check('ck_work_order_cancelled_pair', '(cancelled_by IS NULL) = (cancelled_at IS NULL)')
@Check('ck_work_order_hold_reason', `status <> 'ON_HOLD'
  OR coalesce(length(trim(hold_reason)), 0) > 0`)
@Check('ck_work_order_permit_required', `NOT requires_permit
  OR status NOT IN ('IN_PROGRESS','COMPLETE','VERIFIED','CLOSED')
  OR permit_to_work_id IS NOT NULL`)
@Check('ck_work_order_completed', `status NOT IN ('COMPLETE','VERIFIED','CLOSED')
  OR completed_by IS NOT NULL`)
@Check('ck_work_order_verified', `status NOT IN ('VERIFIED','CLOSED') OR verified_by IS NOT NULL`)
@Check('ck_work_order_closed', `status <> 'CLOSED' OR (verified_by IS NOT NULL
  AND closed_by IS NOT NULL AND coalesce(length(trim(return_to_service_ref)), 0) > 0)`)
@Check('ck_work_order_cancelled', `status <> 'CANCELLED' OR cancelled_by IS NOT NULL`)
@Check('ck_work_order_verifier_independent', `verified_by IS NULL
  OR (verified_by IS DISTINCT FROM assignee_id AND verified_by IS DISTINCT FROM completed_by)`)
@Check('ck_work_order_version', 'version_no >= 1')
export class WorkOrderEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'asset_id' }) assetId!: string;
  @Column('uuid', { name: 'service_incident_id', nullable: true })
  serviceIncidentId!: string | null;
  @Column('uuid', { name: 'maintenance_plan_id', nullable: true })
  maintenancePlanId!: string | null;
  /** Relation-less by design: the FK to DB-062 lives in the DDL, not in the ORM graph. */
  @Column('uuid', { name: 'permit_to_work_id', nullable: true }) permitToWorkId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ name: 'work_type', type: 'varchar', length: 40 }) workType!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column({ type: 'varchar', length: 4000, nullable: true }) description!: string | null;
  @Column({ type: 'varchar', length: 10 }) priority!: WorkOrderPriority;
  @Column({ type: 'varchar', length: 20 }) status!: WorkOrderStatus;
  /**
   * Declared per work order by its creator. PM Web has no work-type → permit matrix table (none is
   * specified anywhere in the approved scope). `Open Question`: HSE owns whether such a matrix
   * should exist; until it does, the declaration is the input API-119's PTW_REQUIRED gate reads.
   */
  @Column({ name: 'requires_permit', type: 'boolean', default: false }) requiresPermit!: boolean;
  @Column('uuid', { name: 'assignee_id', nullable: true }) assigneeId!: string | null;
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true }) scheduledAt!: Date | null;
  @Column('uuid', { name: 'dispatched_by', nullable: true }) dispatchedBy!: string | null;
  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;
  @Column('uuid', { name: 'started_by', nullable: true }) startedBy!: string | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt!: Date | null;
  @Column({ name: 'hold_reason', type: 'varchar', length: 2000, nullable: true })
  holdReason!: string | null;
  @Column('uuid', { name: 'completed_by', nullable: true }) completedBy!: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
  @Column({ name: 'work_summary', type: 'varchar', length: 4000, nullable: true })
  workSummary!: string | null;
  @Column('uuid', { name: 'verified_by', nullable: true }) verifiedBy!: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt!: Date | null;
  @Column({ name: 'return_to_service_ref', type: 'varchar', length: 200, nullable: true })
  returnToServiceRef!: string | null;
  @Column('uuid', { name: 'closed_by', nullable: true }) closedBy!: string | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt!: Date | null;
  @Column('uuid', { name: 'cancelled_by', nullable: true }) cancelledBy!: string | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;
  @Column({ name: 'cancel_reason', type: 'varchar', length: 2000, nullable: true })
  cancelReason!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-119 — one closure/verification cycle of a work order, allocated under the Product Owner's
 * blanket delegation for slice-local supporting entities, citing the DB-114…DB-118 precedent
 * (DocumentExternalShare, StopWorkAction, NcrDispositionCycle, PunchClosureCycle and the
 * procurement cycle entity were all allocated the same way).
 *
 * Why it has to exist: WF-024 allows VERIFIED → REOPENED. Without a cycle table the reopen would
 * overwrite `verified_by`/`verified_at` on the work order and the previous verification decision —
 * who accepted the work, when and on what evidence — would be gone. The cycle keeps every decision
 * as a frozen row and the reopen simply appends the next one.
 */
@Entity({ name: 'work_order_closure_cycles' })
@Unique('uq_work_order_closure_cycles_tenant_id', ['tenantId', 'id'])
@Unique('uq_work_order_closure_cycle_sequence', ['tenantId', 'workOrderId', 'sequenceNo'])
@Index('uq_work_order_closure_cycle_open', ['tenantId', 'workOrderId'], {
  unique: true, where: 'decision IS NULL'
})
@Index('idx_work_order_closure_cycle_history', ['tenantId', 'workOrderId', 'sequenceNo'])
@Check('ck_work_order_closure_cycle_sequence', 'sequence_no >= 1')
@Check('ck_work_order_closure_cycle_request_comment',
  'coalesce(length(trim(request_comment)), 0) >= 3')
@Check('ck_work_order_closure_cycle_request_evidence',
  "jsonb_typeof(request_evidence_refs) = 'array'")
@Check('ck_work_order_closure_cycle_decision', `(
  decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
) OR (
  decision IN ('APPROVE','RETURN') AND coalesce(length(trim(decision_comment)), 0) >= 3
  AND decided_by IS NOT NULL AND decided_at IS NOT NULL
)`)
@Check('ck_work_order_closure_cycle_sod', 'decided_by IS NULL OR decided_by <> requested_by')
export class WorkOrderClosureCycleEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'work_order_id' }) workOrderId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'request_comment', type: 'varchar', length: 2000 }) requestComment!: string;
  @Column({ name: 'request_evidence_refs', type: 'jsonb' }) requestEvidenceRefs!: string[];
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column({ name: 'requested_at', type: 'timestamptz' }) requestedAt!: Date;
  @Column({ type: 'varchar', length: 20, nullable: true })
  decision!: WorkOrderClosureDecision | null;
  @Column({ name: 'decision_comment', type: 'varchar', length: 2000, nullable: true })
  decisionComment!: string | null;
  @Column('uuid', { name: 'decided_by', nullable: true }) decidedBy!: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-087 — one version of a preventive maintenance plan for an asset (FR-121).
 *
 * DDL-only in this slice: no operation in the catalog creates or publishes a plan, but API-118/119
 * read and reference it, so the table and its keys ship now. `uq_maintenance_plan_version` gives
 * one row per (asset, plan type, version) and `trg_maintenance_plan_published_immutable` freezes a
 * PUBLISHED version — its only legal move afterwards is RETIRED.
 */
@Entity({ name: 'maintenance_plans' })
@Unique('uq_maintenance_plans_tenant_id', ['tenantId', 'id'])
@Unique('uq_maintenance_plans_asset_id', ['tenantId', 'assetId', 'id'])
@Unique('uq_maintenance_plan_version', ['tenantId', 'assetId', 'planType', 'version'])
@Index('idx_maintenance_plan_due', ['tenantId', 'assetId', 'status', 'nextDueAt'])
@Check('ck_maintenance_plan_type', "plan_type ~ '^[A-Z][A-Z0-9_]{0,39}$'")
@Check('ck_maintenance_plan_version_number', 'version >= 1')
@Check('ck_maintenance_plan_trigger', "trigger_type IN ('TIME','USAGE','CONDITION')")
@Check('ck_maintenance_plan_status', "status IN ('DRAFT','PUBLISHED','RETIRED')")
@Check('ck_maintenance_plan_task_template', "jsonb_typeof(task_template) = 'object'")
@Check('ck_maintenance_plan_interval', `(trigger_type = 'CONDITION'
    AND interval_value IS NULL AND interval_unit IS NULL)
  OR (trigger_type <> 'CONDITION' AND interval_value IS NOT NULL AND interval_value > 0
    AND coalesce(length(trim(interval_unit)), 0) > 0)`)
@Check('ck_maintenance_plan_published_pair', '(published_by IS NULL) = (published_at IS NULL)')
@Check('ck_maintenance_plan_published', `status NOT IN ('PUBLISHED','RETIRED')
  OR published_by IS NOT NULL`)
@Check('ck_maintenance_plan_row_version', 'version_no >= 1')
export class MaintenancePlanEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'asset_id' }) assetId!: string;
  @Column({ name: 'plan_type', type: 'varchar', length: 40 }) planType!: string;
  @Column({ type: 'integer' }) version!: number;
  @Column({ name: 'trigger_type', type: 'varchar', length: 20 })
  triggerType!: MaintenancePlanTriggerType;
  /** numeric(19,4) — always a string; never parse it into a JS number. */
  @Column({ name: 'interval_value', type: 'numeric', precision: 19, scale: 4, nullable: true })
  intervalValue!: string | null;
  @Column({ name: 'interval_unit', type: 'varchar', length: 20, nullable: true })
  intervalUnit!: string | null;
  @Column({ name: 'task_template', type: 'jsonb' }) taskTemplate!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20 }) status!: MaintenancePlanStatus;
  @Column({ name: 'next_due_at', type: 'timestamptz', nullable: true }) nextDueAt!: Date | null;
  @Column('uuid', { name: 'published_by', nullable: true }) publishedBy!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-088 — a warranty claim raised from a work order (FR-122, API-120 RAISE_WARRANTY_CLAIM).
 *
 * DB-083 (Warranty) is deliberately NOT created — no operation in the catalog can populate it, and
 * a table nothing can write is dead schema. The claim therefore carries NO `warranty_id`; it keys
 * on the asset and the work order that found the failure. When a Warranty slice is approved, the
 * column and its foreign key are an additive migration.
 *
 * `trg_warranty_claim_resolved_immutable` freezes a resolved claim: its resolution is retained
 * forever and can never be edited away.
 */
@Entity({ name: 'warranty_claims' })
@Unique('uq_warranty_claims_tenant_id', ['tenantId', 'id'])
@Unique('uq_warranty_claims_asset_id', ['tenantId', 'assetId', 'id'])
@Unique('uq_warranty_claim_code', ['tenantId', 'claimCode'])
@Index('idx_warranty_claim_register', ['tenantId', 'assetId', 'status', 'submittedAt'])
@Index('idx_warranty_claim_work_order', ['tenantId', 'workOrderId'])
@Check('ck_warranty_claim_code', "claim_code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_warranty_claim_status', `status IN
  ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','WITHDRAWN')`)
@Check('ck_warranty_claim_failure', 'coalesce(length(trim(failure_description)), 0) > 0')
@Check('ck_warranty_claim_evidence', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_warranty_claim_resolved_pair', '(resolved_by IS NULL) = (resolved_at IS NULL)')
@Check('ck_warranty_claim_resolved', `status NOT IN ('APPROVED','REJECTED','WITHDRAWN')
  OR (resolved_by IS NOT NULL AND coalesce(length(trim(resolution)), 0) > 0)`)
@Check('ck_warranty_claim_version', 'version_no >= 1')
export class WarrantyClaimEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'asset_id' }) assetId!: string;
  @Column('uuid', { name: 'work_order_id', nullable: true }) workOrderId!: string | null;
  @Column({ name: 'claim_code', type: 'varchar', length: 80 }) claimCode!: string;
  @Column({ name: 'failure_description', type: 'varchar', length: 4000 })
  failureDescription!: string;
  @Column({ name: 'evidence_refs', type: 'jsonb' }) evidenceRefs!: string[];
  @Column({ name: 'submitted_at', type: 'timestamptz' }) submittedAt!: Date;
  @Column('uuid', { name: 'submitted_by' }) submittedBy!: string;
  @Column({ type: 'varchar', length: 20 }) status!: WarrantyClaimStatus;
  @Column({ type: 'varchar', length: 4000, nullable: true }) resolution!: string | null;
  @Column('uuid', { name: 'resolved_by', nullable: true }) resolvedBy!: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
