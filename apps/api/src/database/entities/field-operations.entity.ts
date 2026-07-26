import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  DailyLogShift, DailyLogStatus, HseIncidentStatus, HseIncidentType, HseSeverity,
  PermitToWorkStatus, StopWorkAction, StopWorkTargetType, WorkfrontReadiness, WorkfrontStatus
} from './field-hse-quality.enums';

/**
 * DB-055 — a releasable front of physical work (FR-075/FR-078). Site-anchored through the
 * composite key `sites (tenant_id, project_id, id)` (added by migration 1783744000000), optionally
 * package-scoped so a package principal's ABAC reach covers it. `ck_workfront_released_requires_gates`
 * makes an ungated release structurally impossible, not merely refused by the service.
 */
@Entity({ name: 'workfronts' })
@Unique('uq_workfronts_tenant_id', ['tenantId', 'id'])
@Unique('uq_workfronts_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_workfront_project_code', ['tenantId', 'projectId', 'code'])
@Index('idx_workfront_register', ['tenantId', 'projectId', 'status', 'readiness'])
@Check('ck_workfront_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_workfront_status', "status IN ('PLANNED','READY','RELEASED','SUSPENDED','CLOSED')")
@Check('ck_workfront_readiness', "readiness IN ('PENDING','GATES_CLEARED')")
@Check('ck_workfront_released_requires_gates', `status <> 'RELEASED'
  OR (readiness = 'GATES_CLEARED' AND released_by IS NOT NULL)`)
@Check('ck_workfront_release_pair', '(released_by IS NULL) = (released_at IS NULL)')
@Check('ck_workfront_suspended_reason', `status <> 'SUSPENDED'
  OR (suspended_reason IS NOT NULL AND length(trim(suspended_reason)) > 0)`)
@Check('ck_workfront_version', 'version_no >= 1')
export class WorkfrontEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'package_id', nullable: true }) packageId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 250 }) name!: string;
  @Column({ type: 'varchar', length: 20 }) status!: WorkfrontStatus;
  @Column({ type: 'varchar', length: 20 }) readiness!: WorkfrontReadiness;
  @Column('uuid', { name: 'released_by', nullable: true }) releasedBy!: string | null;
  @Column({ name: 'released_at', type: 'timestamptz', nullable: true }) releasedAt!: Date | null;
  @Column({ name: 'suspended_reason', type: 'varchar', length: 2000, nullable: true })
  suspendedReason!: string | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-056 — one contractor shift log (FR-079/FR-080). The slot key is
 * (site, contractor company, log date, shift): `uq_daily_log_slot_revision` versions it and the
 * partial unique `uq_daily_log_slot_live` allows exactly one non-SUPERSEDED row per slot. A
 * correction is a NEW row (revision + 1, `correction_of_id`, non-empty reason) written in the same
 * transaction that supersedes the signed original — copied from document-control's issued-immutable
 * idiom, `trg_daily_log_signed_immutable` freezes every business column once SIGNED while still
 * letting status move to SUPERSEDED.
 *
 * The signer is never stored as a display string alone: `signer_snapshot` is the legal snapshot at
 * signing time and `signed_by`/`signed_at` are the stable pair (AGENTS §9).
 */
@Entity({ name: 'daily_logs' })
@Unique('uq_daily_logs_tenant_id', ['tenantId', 'id'])
@Unique('uq_daily_logs_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_daily_log_slot_revision', [
  'tenantId', 'siteId', 'contractorCompanyId', 'logDate', 'shift', 'revision'
])
@Index('uq_daily_log_slot_live', ['tenantId', 'siteId', 'contractorCompanyId', 'logDate', 'shift'], {
  unique: true, where: "status <> 'SUPERSEDED'"
})
@Index('idx_daily_log_register', ['tenantId', 'projectId', 'logDate', 'status'])
@Check('ck_daily_log_status', "status IN ('DRAFT','SUBMITTED','SIGNED','SUPERSEDED')")
@Check('ck_daily_log_shift', "shift IN ('DAY','NIGHT')")
@Check('ck_daily_log_revision', 'revision >= 1')
@Check('ck_daily_log_signed_pair', `((signed_by IS NULL) = (signed_at IS NULL))
  AND ((signed_by IS NULL) = (signer_snapshot IS NULL))`)
@Check('ck_daily_log_signed_status', "status <> 'SIGNED' OR signed_by IS NOT NULL")
@Check('ck_daily_log_correction', `correction_of_id IS NULL
  OR (correction_of_id <> id AND revision >= 2 AND coalesce(length(trim(reason)), 0) > 0)`)
export class DailyLogEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'contractor_company_id' }) contractorCompanyId!: string;
  @Column({ name: 'log_date', type: 'date' }) logDate!: string;
  @Column({ type: 'varchar', length: 10 }) shift!: DailyLogShift;
  @Column({ type: 'integer', default: 1 }) revision!: number;
  @Column({ type: 'varchar', length: 20 }) status!: DailyLogStatus;
  @Column({ type: 'varchar', length: 4000 }) summary!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) details!: Record<string, unknown>;
  @Column('uuid', { name: 'correction_of_id', nullable: true }) correctionOfId!: string | null;
  @Column({ type: 'varchar', length: 2000, nullable: true }) reason!: string | null;
  @Column({ name: 'signer_snapshot', type: 'jsonb', nullable: true })
  signerSnapshot!: Record<string, unknown> | null;
  @Column('uuid', { name: 'signed_by', nullable: true }) signedBy!: string | null;
  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true }) signedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-057 — the quantity ledger of a workfront (FR-077), modeled on `progress_updates`
 * (migration 1783730000000): append-only by trigger, deduplicated by `uq_qpr_source`
 * (tenant, source_key). A correction is a new row referencing `correction_of_id` with a non-empty
 * reason; a certification is a SEPARATE append row referencing `certification_of_id` — the original
 * row is never updated, and `uq_qpr_single_certification` allows at most one certification per
 * record.
 *
 * `quantity` is numeric(19,4) surfaced as a TypeScript string; no JS number ever touches it.
 */
@Entity({ name: 'quantity_progress_records' })
@Unique('uq_qpr_tenant_id', ['tenantId', 'id'])
@Unique('uq_qpr_workfront_id', ['tenantId', 'workfrontId', 'id'])
@Unique('uq_qpr_source', ['tenantId', 'sourceKey'])
@Index('uq_qpr_single_certification', ['tenantId', 'certificationOfId'], {
  unique: true, where: 'certification_of_id IS NOT NULL'
})
@Index('idx_qpr_workfront_date', ['tenantId', 'workfrontId', 'recordDate', 'recordedAt'])
@Check('ck_qpr_quantity_positive', 'quantity > 0')
@Check('ck_qpr_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_qpr_correction', `correction_of_id IS NULL
  OR (correction_of_id <> id AND coalesce(length(trim(reason)), 0) > 0)`)
@Check('ck_qpr_certification', 'certification_of_id IS NULL OR certification_of_id <> id')
@Check('ck_qpr_single_role', 'num_nonnulls(correction_of_id, certification_of_id) <= 1')
export class QuantityProgressRecordEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'workfront_id' }) workfrontId!: string;
  @Column('uuid', { name: 'wbs_node_id', nullable: true }) wbsNodeId!: string | null;
  @Column('uuid', { name: 'correction_of_id', nullable: true }) correctionOfId!: string | null;
  @Column('uuid', { name: 'certification_of_id', nullable: true })
  certificationOfId!: string | null;
  @Column({ name: 'record_date', type: 'date' }) recordDate!: string;
  /** numeric(19,4) as string — compared and summed only in Postgres. */
  @Column({ type: 'numeric', precision: 19, scale: 4 }) quantity!: string;
  @Column({ type: 'varchar', length: 40 }) unit!: string;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  @Column({ type: 'varchar', length: 2000, nullable: true }) reason!: string | null;
  @Column({ name: 'source_key', type: 'varchar', length: 200 }) sourceKey!: string;
  @Column('uuid', { name: 'recorded_by' }) recordedBy!: string;
  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  recordedAt!: Date;
}

/**
 * DB-062 — permit to work (FR-085/FR-086). `ck_permit_issuer_independent` is the SoD backbone: the
 * issuer can never be the requester, as a row constraint. Issued/active permits carry a non-empty
 * `isolation_snapshot` and at most one ISSUED/ACTIVE permit exists per (workfront, permit type).
 * `site_id` is denormalized from the workfront at request time and carried in
 * `uq_permits_to_work_tenant_site_id` so downstream O&M work orders can FK into permits with
 * site-scope validation (coordinator addendum, 2026-07-26).
 */
@Entity({ name: 'permits_to_work' })
@Unique('uq_permits_to_work_tenant_id', ['tenantId', 'id'])
@Unique('uq_permits_to_work_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_permits_to_work_tenant_site_id', ['tenantId', 'siteId', 'id'])
@Index('uq_permit_active_per_type', ['tenantId', 'workfrontId', 'permitType'], {
  unique: true, where: "status IN ('ISSUED','ACTIVE')"
})
@Index('idx_permit_register', ['tenantId', 'projectId', 'status'])
@Check('ck_permit_status', `status IN
  ('DRAFT','REQUESTED','VERIFIED','ISSUED','ACTIVE','SUSPENDED','EXPIRED','CLOSED')`)
@Check('ck_permit_type', "permit_type ~ '^[A-Z][A-Z0-9_]{0,39}$'")
@Check('ck_permit_window', 'valid_to > valid_from')
@Check('ck_permit_issuer_independent', 'issuer_id IS NULL OR issuer_id <> requested_by')
@Check('ck_permit_issued_requires_issuer', `status NOT IN
  ('ISSUED','ACTIVE','SUSPENDED','EXPIRED','CLOSED') OR issuer_id IS NOT NULL`)
@Check('ck_permit_issued_pair', '(issuer_id IS NULL) = (issued_at IS NULL)')
@Check('ck_permit_isolation', `status NOT IN ('ISSUED','ACTIVE')
  OR (isolation_snapshot IS NOT NULL AND jsonb_typeof(isolation_snapshot) = 'array'
    AND jsonb_array_length(isolation_snapshot) >= 1)`)
@Check('ck_permit_version', 'version_no >= 1')
export class PermitToWorkEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id' }) siteId!: string;
  @Column('uuid', { name: 'workfront_id' }) workfrontId!: string;
  @Column({ name: 'permit_type', type: 'varchar', length: 40 }) permitType!: string;
  @Column({ type: 'varchar', length: 2000, nullable: true }) description!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: PermitToWorkStatus;
  @Column({ name: 'valid_from', type: 'timestamptz' }) validFrom!: Date;
  @Column({ name: 'valid_to', type: 'timestamptz' }) validTo!: Date;
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column('uuid', { name: 'issuer_id', nullable: true }) issuerId!: string | null;
  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt!: Date | null;
  @Column({ name: 'isolation_snapshot', type: 'jsonb', nullable: true })
  isolationSnapshot!: Array<Record<string, unknown>> | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-063 — HSE incident (FR-087). The initial report is a LEGAL RECORD:
 * `trg_hse_incident_report_immutable` forbids UPDATE of every initial-report column, forbids DELETE
 * always, and forbids clearing `legal_hold`. `restricted_facts` (personal/medical detail) is never
 * serialized to any response view, audit event or outbox payload — those carry ids and
 * classification only (SEC-130).
 */
@Entity({ name: 'hse_incidents' })
@Unique('uq_hse_incidents_tenant_id', ['tenantId', 'id'])
@Unique('uq_hse_incidents_project_id', ['tenantId', 'projectId', 'id'])
@Index('idx_hse_incident_register', ['tenantId', 'projectId', 'status', 'occurredAt'])
@Check('ck_hse_incident_status', "status IN ('REPORTED','INVESTIGATING','CLOSED')")
@Check('ck_hse_incident_type', `incident_type IN ('NEAR_MISS','FIRST_AID','MEDICAL_TREATMENT',
  'LOST_TIME','FATALITY','ENVIRONMENTAL','PROPERTY_DAMAGE','SECURITY','OTHER')`)
@Check('ck_hse_incident_actual_severity', "actual_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_hse_incident_potential_severity',
  "potential_severity IN ('LOW','MEDIUM','HIGH','CRITICAL')")
@Check('ck_hse_incident_report_order', 'occurred_at <= reported_at')
@Check('ck_hse_incident_closed_pair', '(closed_by IS NULL) = (closed_at IS NULL)')
@Check('ck_hse_incident_closed_status', "status <> 'CLOSED' OR closed_by IS NOT NULL")
@Check('ck_hse_incident_closer_independent', 'closed_by IS NULL OR closed_by <> reported_by')
@Check('ck_hse_incident_version', 'version_no >= 1')
export class HseIncidentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'site_id', nullable: true }) siteId!: string | null;
  @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt!: Date;
  @Column({ name: 'reported_at', type: 'timestamptz' }) reportedAt!: Date;
  @Column('uuid', { name: 'reported_by' }) reportedBy!: string;
  @Column({ name: 'incident_type', type: 'varchar', length: 30 })
  incidentType!: HseIncidentType;
  @Column({ name: 'actual_severity', type: 'varchar', length: 10 })
  actualSeverity!: HseSeverity;
  @Column({ name: 'potential_severity', type: 'varchar', length: 10 })
  potentialSeverity!: HseSeverity;
  @Column({ type: 'varchar', length: 4000 }) narrative!: string;
  @Column({ name: 'immediate_action', type: 'varchar', length: 4000, nullable: true })
  immediateAction!: string | null;
  /** NEVER serialized to any view/audit/outbox payload (SEC-130). */
  @Column({ name: 'restricted_facts', type: 'jsonb', nullable: true })
  restrictedFacts!: Record<string, unknown> | null;
  @Column({ name: 'legal_hold', type: 'boolean', default: false }) legalHold!: boolean;
  @Column({ type: 'varchar', length: 20 }) status!: HseIncidentStatus;
  @Column('uuid', { name: 'closed_by', nullable: true }) closedBy!: string | null;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-115 — StopWorkAction (allocated under the Product Owner's blanket delegation for this slice).
 * An append-only safety ledger (FR-088): ISSUE and LIFT are separate immutable facts, never a
 * status flip on some aggregate. `trg_stop_work_append_only` raises on every UPDATE or DELETE;
 * `trg_stop_work_lift_independence` rejects a LIFT inserted by the same actor who issued the stop;
 * `uq_stop_work_single_lift` allows exactly one LIFT per ISSUE. A LIFT carries the verified
 * controls (>= 1) that justify resuming work.
 */
@Entity({ name: 'stop_work_actions' })
@Unique('uq_stop_work_actions_tenant_id', ['tenantId', 'id'])
@Unique('uq_stop_work_actions_project_id', ['tenantId', 'projectId', 'id'])
@Index('uq_stop_work_single_lift', ['tenantId', 'liftsActionId'], {
  unique: true, where: 'lifts_action_id IS NOT NULL'
})
@Index('idx_stop_work_coverage', ['tenantId', 'projectId', 'action', 'targetType'])
@Check('ck_stop_work_action', "action IN ('ISSUE','LIFT')")
@Check('ck_stop_work_target_type', "target_type IN ('PROJECT','SITE','WORKFRONT','PERMIT')")
@Check('ck_stop_work_target', `(target_type = 'PROJECT' AND site_id IS NULL
    AND workfront_id IS NULL AND permit_id IS NULL)
  OR (target_type = 'SITE' AND site_id IS NOT NULL
    AND workfront_id IS NULL AND permit_id IS NULL)
  OR (target_type = 'WORKFRONT' AND workfront_id IS NOT NULL
    AND site_id IS NULL AND permit_id IS NULL)
  OR (target_type = 'PERMIT' AND permit_id IS NOT NULL
    AND site_id IS NULL AND workfront_id IS NULL)`)
@Check('ck_stop_work_lift_reference', "(action = 'LIFT') = (lifts_action_id IS NOT NULL)")
@Check('ck_stop_work_lift_controls', `action <> 'LIFT'
  OR (jsonb_typeof(verified_controls) = 'array' AND jsonb_array_length(verified_controls) >= 1)`)
@Check('ck_stop_work_reason', 'coalesce(length(trim(reason)), 0) > 0')
export class StopWorkActionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ type: 'varchar', length: 10 }) action!: StopWorkAction;
  @Column({ name: 'target_type', type: 'varchar', length: 20 })
  targetType!: StopWorkTargetType;
  @Column('uuid', { name: 'site_id', nullable: true }) siteId!: string | null;
  @Column('uuid', { name: 'workfront_id', nullable: true }) workfrontId!: string | null;
  @Column('uuid', { name: 'permit_id', nullable: true }) permitId!: string | null;
  @Column('uuid', { name: 'hse_incident_id', nullable: true }) hseIncidentId!: string | null;
  @Column({ type: 'varchar', length: 2000 }) reason!: string;
  @Column('uuid', { name: 'lifts_action_id', nullable: true }) liftsActionId!: string | null;
  @Column({ name: 'verified_controls', type: 'jsonb', default: () => "'[]'::jsonb" })
  verifiedControls!: string[];
  @Column('uuid', { name: 'actor_id' }) actorId!: string;
  @Column({ name: 'acted_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  actedAt!: Date;
}
