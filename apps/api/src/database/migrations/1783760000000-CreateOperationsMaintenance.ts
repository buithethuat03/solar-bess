import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * O&M slice (API-114…API-121): DB-084 (AlarmCase), DB-085 (ServiceIncident), DB-086 (WorkOrder),
 * DB-087 (MaintenancePlan), DB-088 (WarrantyClaim) plus DB-119 (WorkOrderClosureCycle) — the one
 * new id allocated under the Product Owner's blanket delegation for slice-local supporting
 * entities, citing the DB-114…DB-118 precedent (DocumentExternalShare, StopWorkAction,
 * NcrDispositionCycle, PunchClosureCycle and the procurement cycle entity were allocated the same
 * way). The DDL mirrors the entity decorators one-for-one.
 *
 * Cross-slice keys this migration RELIES ON but does not create:
 * - `sites (tenant_id, project_id, id)` via `uq_sites_tenant_project_id` (migration 1783744000000);
 * - `assets (tenant_id, site_id, id)` via `uq_assets_site_id` (DB-080, migration 1783744000000);
 * - `permits_to_work (tenant_id, id)` via `uq_permits_to_work_tenant_id` (DB-062, 1783746000000);
 * - `hse_incidents (tenant_id, project_id, id)` (DB-063, migration 1783746000000).
 * `equipment` (DB-079) is reached transitively through `assets.equipment_id`; nothing here
 * duplicates it.
 *
 * TWO DELIBERATE ABSENCES, both recorded:
 *
 * 1. DB-083 (Warranty) IS NOT CREATED. No operation in the 164-operation catalog writes a warranty
 *    row — API-118/API-119 only mention warranty *context* and API-120 raises a *claim*. A table
 *    that nothing can populate is dead schema that would make every warranty join return nothing
 *    while looking implemented, so `work_orders` carries NO `warranty_id` and `warranty_claims`
 *    carries NO `warranty_id` either (DB-088's data-dictionary row lists one; it is omitted here
 *    together with its parent). When a Warranty slice is approved, both columns and their foreign
 *    keys are a purely additive migration.
 *
 * 2. NO telemetry, meter, tag, gateway, endpoint, URL, credential, token or command column exists
 *    anywhere in this slice, and `alarm_cases.source_event_refs` is a jsonb array of LOGICAL
 *    references into DB-092 (AlarmEvent) — a separate append-only OT event store — with NO physical
 *    foreign key, because docs/07 fixes DB-091/DB-092 in a different store ("Không physical FK
 *    cross-store"). The absence of any connectivity column IS the SEC-127/SEC-128 control: PM Web
 *    cannot even store the coordinates of an OT write path.
 */
export class CreateOperationsMaintenance1783760000000 implements MigrationInterface {
  name = 'CreateOperationsMaintenance1783760000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE alarm_cases (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      asset_id uuid,
      severity varchar(10) NOT NULL,
      state varchar(20) NOT NULL,
      owner_id uuid,
      first_seen_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      source_event_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      source_quality varchar(20),
      acknowledged_by uuid,
      acknowledged_at timestamptz,
      acknowledgment_note varchar(2000),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_alarm_cases PRIMARY KEY (id),
      CONSTRAINT uq_alarm_cases_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_alarm_cases_site_id UNIQUE (tenant_id, site_id, id),
      CONSTRAINT fk_alarm_case_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_alarm_case_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_alarm_case_asset FOREIGN KEY (tenant_id, site_id, asset_id)
        REFERENCES assets (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_alarm_case_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_alarm_case_acknowledged_by FOREIGN KEY (tenant_id, acknowledged_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_alarm_case_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_alarm_case_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_alarm_case_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_alarm_case_state CHECK (state IN
        ('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','CLOSED','REOPENED')),
      CONSTRAINT ck_alarm_case_seen_order CHECK (last_seen_at >= first_seen_at),
      CONSTRAINT ck_alarm_case_source_refs CHECK (jsonb_typeof(source_event_refs) = 'array'),
      -- coalesce(..., 1): a NULL column is "absent", not "empty". Without the coalesce the
      -- expression would be NULL and a CHECK only rejects on FALSE, so the rule would never fire.
      CONSTRAINT ck_alarm_case_source_quality CHECK
        (coalesce(length(trim(source_quality)), 1) > 0),
      CONSTRAINT ck_alarm_case_ack_pair CHECK
        ((acknowledged_by IS NULL) = (acknowledged_at IS NULL)),
      CONSTRAINT ck_alarm_case_ack_required CHECK (state IN ('OPEN') OR acknowledged_by IS NOT NULL),
      CONSTRAINT ck_alarm_case_ack_note CHECK (coalesce(length(trim(acknowledgment_note)), 1) > 0),
      CONSTRAINT ck_alarm_case_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_alarm_case_register
      ON alarm_cases (tenant_id, site_id, state, severity, last_seen_at)`);
    await queryRunner.query(`CREATE INDEX idx_alarm_case_asset
      ON alarm_cases (tenant_id, asset_id)`);
    await queryRunner.query(`COMMENT ON COLUMN alarm_cases.source_event_refs IS
      'Logical references into DB-092 (AlarmEvent), an append-only OT event store outside this database. No physical foreign key exists by design (docs/07: no physical FK cross-store); PM Web never mutates the source.'`);

    await queryRunner.query(`CREATE TABLE service_incidents (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      asset_id uuid,
      alarm_case_id uuid,
      hse_incident_id uuid,
      severity varchar(10) NOT NULL,
      status varchar(20) NOT NULL,
      title varchar(400) NOT NULL,
      description varchar(4000),
      detected_at timestamptz NOT NULL,
      downtime_start timestamptz,
      downtime_end timestamptz,
      sla_response_due_at timestamptz,
      sla_responded_at timestamptz,
      sla_resolution_due_at timestamptz,
      sla_resolved_at timestamptz,
      resolution_summary varchar(4000),
      reported_by uuid NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_service_incidents PRIMARY KEY (id),
      CONSTRAINT uq_service_incidents_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_service_incidents_site_id UNIQUE (tenant_id, site_id, id),
      CONSTRAINT fk_service_incident_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_asset FOREIGN KEY (tenant_id, site_id, asset_id)
        REFERENCES assets (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_alarm_case FOREIGN KEY (tenant_id, site_id, alarm_case_id)
        REFERENCES alarm_cases (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_hse_incident
        FOREIGN KEY (tenant_id, project_id, hse_incident_id)
        REFERENCES hse_incidents (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_reported_by FOREIGN KEY (tenant_id, reported_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_service_incident_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_service_incident_severity CHECK
        (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_service_incident_status CHECK
        (status IN ('OPEN','INVESTIGATING','MITIGATED','RESOLVED','CLOSED')),
      CONSTRAINT ck_service_incident_title CHECK (coalesce(length(trim(title)), 0) > 0),
      CONSTRAINT ck_service_incident_downtime CHECK
        ((downtime_start IS NOT NULL OR downtime_end IS NULL)
          AND (downtime_end IS NULL OR downtime_end >= downtime_start)),
      CONSTRAINT ck_service_incident_sla_response CHECK
        (sla_responded_at IS NULL OR sla_responded_at >= detected_at),
      CONSTRAINT ck_service_incident_sla_resolution CHECK
        (sla_resolved_at IS NULL OR sla_resolved_at >= detected_at),
      CONSTRAINT ck_service_incident_resolution CHECK (status NOT IN ('RESOLVED','CLOSED')
        OR coalesce(length(trim(resolution_summary)), 0) > 0),
      CONSTRAINT ck_service_incident_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_service_incident_register
      ON service_incidents (tenant_id, site_id, status, severity, detected_at)`);
    await queryRunner.query(`CREATE INDEX idx_service_incident_asset
      ON service_incidents (tenant_id, asset_id)`);

    await queryRunner.query(`CREATE TABLE maintenance_plans (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      asset_id uuid NOT NULL,
      plan_type varchar(40) NOT NULL,
      version integer NOT NULL,
      trigger_type varchar(20) NOT NULL,
      interval_value numeric(19,4),
      interval_unit varchar(20),
      task_template jsonb NOT NULL DEFAULT '{}'::jsonb,
      status varchar(20) NOT NULL,
      next_due_at timestamptz,
      published_by uuid,
      published_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_maintenance_plans PRIMARY KEY (id),
      CONSTRAINT uq_maintenance_plans_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_maintenance_plans_asset_id UNIQUE (tenant_id, asset_id, id),
      CONSTRAINT uq_maintenance_plan_version UNIQUE (tenant_id, asset_id, plan_type, version),
      CONSTRAINT fk_maintenance_plan_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_maintenance_plan_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_maintenance_plan_asset FOREIGN KEY (tenant_id, site_id, asset_id)
        REFERENCES assets (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_maintenance_plan_published_by FOREIGN KEY (tenant_id, published_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_maintenance_plan_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_maintenance_plan_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_maintenance_plan_type CHECK (plan_type ~ '^[A-Z][A-Z0-9_]{0,39}$'),
      CONSTRAINT ck_maintenance_plan_version_number CHECK (version >= 1),
      CONSTRAINT ck_maintenance_plan_trigger CHECK
        (trigger_type IN ('TIME','USAGE','CONDITION')),
      CONSTRAINT ck_maintenance_plan_status CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
      CONSTRAINT ck_maintenance_plan_task_template CHECK (jsonb_typeof(task_template) = 'object'),
      CONSTRAINT ck_maintenance_plan_interval CHECK ((trigger_type = 'CONDITION'
          AND interval_value IS NULL AND interval_unit IS NULL)
        OR (trigger_type <> 'CONDITION' AND interval_value IS NOT NULL AND interval_value > 0
          AND coalesce(length(trim(interval_unit)), 0) > 0)),
      CONSTRAINT ck_maintenance_plan_published_pair CHECK
        ((published_by IS NULL) = (published_at IS NULL)),
      CONSTRAINT ck_maintenance_plan_published CHECK (status NOT IN ('PUBLISHED','RETIRED')
        OR published_by IS NOT NULL),
      CONSTRAINT ck_maintenance_plan_row_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_maintenance_plan_due
      ON maintenance_plans (tenant_id, asset_id, status, next_due_at)`);

    await queryRunner.query(`CREATE TABLE work_orders (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      asset_id uuid NOT NULL,
      service_incident_id uuid,
      maintenance_plan_id uuid,
      permit_to_work_id uuid,
      code varchar(80) NOT NULL,
      work_type varchar(40) NOT NULL,
      title varchar(400) NOT NULL,
      description varchar(4000),
      priority varchar(10) NOT NULL,
      status varchar(20) NOT NULL,
      requires_permit boolean NOT NULL DEFAULT false,
      assignee_id uuid,
      scheduled_at timestamptz,
      dispatched_by uuid,
      dispatched_at timestamptz,
      started_by uuid,
      started_at timestamptz,
      hold_reason varchar(2000),
      completed_by uuid,
      completed_at timestamptz,
      work_summary varchar(4000),
      verified_by uuid,
      verified_at timestamptz,
      return_to_service_ref varchar(200),
      closed_by uuid,
      closed_at timestamptz,
      cancelled_by uuid,
      cancelled_at timestamptz,
      cancel_reason varchar(2000),
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_work_orders PRIMARY KEY (id),
      CONSTRAINT uq_work_orders_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_work_orders_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_work_orders_asset_id UNIQUE (tenant_id, asset_id, id),
      CONSTRAINT uq_work_order_code UNIQUE (tenant_id, code),
      CONSTRAINT fk_work_order_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_asset FOREIGN KEY (tenant_id, site_id, asset_id)
        REFERENCES assets (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_service_incident
        FOREIGN KEY (tenant_id, site_id, service_incident_id)
        REFERENCES service_incidents (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_maintenance_plan
        FOREIGN KEY (tenant_id, asset_id, maintenance_plan_id)
        REFERENCES maintenance_plans (tenant_id, asset_id, id) ON DELETE RESTRICT,
      -- DB-062 lives in the Field/HSE slice. The key carries (tenant, permit) only; the permit's
      -- SITE match and its validity WINDOW are one rule that no foreign key can express, so both
      -- halves live together in the service evaluator and answer 422 PTW_NOT_VALID.
      CONSTRAINT fk_work_order_permit FOREIGN KEY (tenant_id, permit_to_work_id)
        REFERENCES permits_to_work (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_assignee FOREIGN KEY (tenant_id, assignee_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_dispatched_by FOREIGN KEY (tenant_id, dispatched_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_started_by FOREIGN KEY (tenant_id, started_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_completed_by FOREIGN KEY (tenant_id, completed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_verified_by FOREIGN KEY (tenant_id, verified_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_closed_by FOREIGN KEY (tenant_id, closed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_cancelled_by FOREIGN KEY (tenant_id, cancelled_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_work_order_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_work_order_work_type CHECK (work_type ~ '^[A-Z][A-Z0-9_]{0,39}$'),
      CONSTRAINT ck_work_order_priority CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      CONSTRAINT ck_work_order_status CHECK (status IN ('DRAFT','APPROVED','SCHEDULED',
        'DISPATCHED','IN_PROGRESS','ON_HOLD','COMPLETE','VERIFIED','CLOSED','REOPENED',
        'CANCELLED')),
      CONSTRAINT ck_work_order_dispatched_pair CHECK
        ((dispatched_by IS NULL) = (dispatched_at IS NULL)),
      CONSTRAINT ck_work_order_started_pair CHECK ((started_by IS NULL) = (started_at IS NULL)),
      CONSTRAINT ck_work_order_completed_pair CHECK
        ((completed_by IS NULL) = (completed_at IS NULL)),
      CONSTRAINT ck_work_order_verified_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
      CONSTRAINT ck_work_order_closed_pair CHECK ((closed_by IS NULL) = (closed_at IS NULL)),
      CONSTRAINT ck_work_order_cancelled_pair CHECK
        ((cancelled_by IS NULL) = (cancelled_at IS NULL)),
      CONSTRAINT ck_work_order_hold_reason CHECK (status <> 'ON_HOLD'
        OR coalesce(length(trim(hold_reason)), 0) > 0),
      CONSTRAINT ck_work_order_permit_required CHECK (NOT requires_permit
        OR status NOT IN ('IN_PROGRESS','COMPLETE','VERIFIED','CLOSED')
        OR permit_to_work_id IS NOT NULL),
      CONSTRAINT ck_work_order_completed CHECK (status NOT IN ('COMPLETE','VERIFIED','CLOSED')
        OR completed_by IS NOT NULL),
      CONSTRAINT ck_work_order_verified CHECK (status NOT IN ('VERIFIED','CLOSED')
        OR verified_by IS NOT NULL),
      -- "Closed" can never mean "walked away": a closed work order structurally carries the
      -- return-to-service reference, the verifier and the closer.
      CONSTRAINT ck_work_order_closed CHECK (status <> 'CLOSED' OR (verified_by IS NOT NULL
        AND closed_by IS NOT NULL AND coalesce(length(trim(return_to_service_ref)), 0) > 0)),
      CONSTRAINT ck_work_order_cancelled CHECK (status <> 'CANCELLED' OR cancelled_by IS NOT NULL),
      -- SEC-108/SEC-109: a technician can never verify — and therefore never close — their own
      -- work. IS DISTINCT FROM keeps the predicate FALSE (not NULL) when the assignee is unset.
      CONSTRAINT ck_work_order_verifier_independent CHECK (verified_by IS NULL
        OR (verified_by IS DISTINCT FROM assignee_id
          AND verified_by IS DISTINCT FROM completed_by)),
      CONSTRAINT ck_work_order_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_work_order_register
      ON work_orders (tenant_id, asset_id, status, priority, scheduled_at)`);
    await queryRunner.query(`CREATE INDEX idx_work_order_site
      ON work_orders (tenant_id, site_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_work_order_assignee
      ON work_orders (tenant_id, assignee_id, status)`);

    await queryRunner.query(`CREATE TABLE work_order_closure_cycles (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      work_order_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      request_comment varchar(2000) NOT NULL,
      request_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      requested_by uuid NOT NULL,
      requested_at timestamptz NOT NULL,
      decision varchar(20),
      decision_comment varchar(2000),
      decided_by uuid,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_work_order_closure_cycles PRIMARY KEY (id),
      CONSTRAINT uq_work_order_closure_cycles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_work_order_closure_cycle_sequence UNIQUE
        (tenant_id, work_order_id, sequence_no),
      CONSTRAINT fk_work_order_closure_cycle_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_closure_cycle_work_order
        FOREIGN KEY (tenant_id, project_id, work_order_id)
        REFERENCES work_orders (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_closure_cycle_requested_by FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_work_order_closure_cycle_decided_by FOREIGN KEY (tenant_id, decided_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_work_order_closure_cycle_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_work_order_closure_cycle_request_comment CHECK
        (coalesce(length(trim(request_comment)), 0) >= 3),
      CONSTRAINT ck_work_order_closure_cycle_request_evidence CHECK
        (jsonb_typeof(request_evidence_refs) = 'array'),
      CONSTRAINT ck_work_order_closure_cycle_decision CHECK ((
        decision IS NULL AND decision_comment IS NULL AND decided_by IS NULL AND decided_at IS NULL
      ) OR (
        decision IN ('APPROVE','RETURN') AND coalesce(length(trim(decision_comment)), 0) >= 3
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL
      )),
      CONSTRAINT ck_work_order_closure_cycle_sod CHECK
        (decided_by IS NULL OR decided_by <> requested_by)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_work_order_closure_cycle_open
      ON work_order_closure_cycles (tenant_id, work_order_id) WHERE decision IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_work_order_closure_cycle_history
      ON work_order_closure_cycles (tenant_id, work_order_id, sequence_no)`);

    await queryRunner.query(`CREATE TABLE warranty_claims (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      site_id uuid NOT NULL,
      asset_id uuid NOT NULL,
      work_order_id uuid,
      claim_code varchar(80) NOT NULL,
      failure_description varchar(4000) NOT NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      submitted_at timestamptz NOT NULL,
      submitted_by uuid NOT NULL,
      status varchar(20) NOT NULL,
      resolution varchar(4000),
      resolved_by uuid,
      resolved_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_warranty_claims PRIMARY KEY (id),
      CONSTRAINT uq_warranty_claims_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_warranty_claims_asset_id UNIQUE (tenant_id, asset_id, id),
      CONSTRAINT uq_warranty_claim_code UNIQUE (tenant_id, claim_code),
      CONSTRAINT fk_warranty_claim_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_site FOREIGN KEY (tenant_id, project_id, site_id)
        REFERENCES sites (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_asset FOREIGN KEY (tenant_id, site_id, asset_id)
        REFERENCES assets (tenant_id, site_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_work_order FOREIGN KEY (tenant_id, asset_id, work_order_id)
        REFERENCES work_orders (tenant_id, asset_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_resolved_by FOREIGN KEY (tenant_id, resolved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_warranty_claim_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_warranty_claim_code CHECK (claim_code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'),
      CONSTRAINT ck_warranty_claim_status CHECK (status IN
        ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','WITHDRAWN')),
      CONSTRAINT ck_warranty_claim_failure CHECK
        (coalesce(length(trim(failure_description)), 0) > 0),
      CONSTRAINT ck_warranty_claim_evidence CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_warranty_claim_resolved_pair CHECK
        ((resolved_by IS NULL) = (resolved_at IS NULL)),
      CONSTRAINT ck_warranty_claim_resolved CHECK (status NOT IN
        ('APPROVED','REJECTED','WITHDRAWN')
        OR (resolved_by IS NOT NULL AND coalesce(length(trim(resolution)), 0) > 0)),
      CONSTRAINT ck_warranty_claim_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_warranty_claim_register
      ON warranty_claims (tenant_id, asset_id, status, submitted_at)`);
    await queryRunner.query(`CREATE INDEX idx_warranty_claim_work_order
      ON warranty_claims (tenant_id, work_order_id)`);
    await queryRunner.query(`COMMENT ON TABLE warranty_claims IS
      'DB-088. No warranty_id column: DB-083 (Warranty) is intentionally not created because no operation in the catalog can populate it. Adding it later is a purely additive migration.'`);

    // SEC-127/SEC-128 — the acknowledge path is LOCAL ONLY. An update that touches the
    // acknowledgment columns may touch nothing but the local case fields, so no acknowledge can
    // ever smuggle a rewrite of the source projection (event refs, quality, first/last seen,
    // site/asset mapping) into the same statement. An acknowledged case can never be
    // un-acknowledged, and a case can never be deleted: it is the local record of a real event.
    await queryRunner.query(`CREATE FUNCTION enforce_alarm_case_local_acknowledge()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      local_columns text[] := ARRAY['state','owner_id','acknowledged_by','acknowledged_at',
        'acknowledgment_note','version_no','updated_by','updated_at'];
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'alarm cases cannot be deleted; they are the local record of a source event';
      END IF;
      IF OLD.acknowledged_by IS NOT NULL AND NEW.acknowledged_by IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'an acknowledged alarm case can never be un-acknowledged';
      END IF;
      IF (NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
        OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
        OR NEW.acknowledgment_note IS DISTINCT FROM OLD.acknowledgment_note
        OR NEW.state IS DISTINCT FROM OLD.state)
        AND (to_jsonb(NEW) - local_columns) <> (to_jsonb(OLD) - local_columns)
      THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'acknowledging an alarm case may only write local case fields; the source projection is read-only';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_alarm_case_local_acknowledge
      BEFORE UPDATE OR DELETE ON alarm_cases
      FOR EACH ROW EXECUTE FUNCTION enforce_alarm_case_local_acknowledge()`);

    // FR-121: a published maintenance plan version is what the field executed against. It never
    // changes; the only legal move is RETIRED, and a retired version is frozen history.
    await queryRunner.query(`CREATE FUNCTION protect_maintenance_plan_published()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'maintenance plan versions cannot be deleted; retire them instead';
      END IF;
      IF OLD.status = 'RETIRED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'retired maintenance plan versions are immutable history';
      END IF;
      IF OLD.status = 'PUBLISHED' THEN
        IF NEW.status <> 'RETIRED'
          OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
          <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'a published maintenance plan version is immutable; publish a new version';
        END IF;
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_maintenance_plan_published_immutable
      BEFORE UPDATE OR DELETE ON maintenance_plans
      FOR EACH ROW EXECUTE FUNCTION protect_maintenance_plan_published()`);

    // FR-122: a resolved warranty claim and its resolution are retained. Neither can be edited
    // away and the row can never be deleted.
    await queryRunner.query(`CREATE FUNCTION protect_warranty_claim_resolution()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'warranty claims cannot be deleted';
      END IF;
      IF OLD.status IN ('APPROVED','REJECTED','WITHDRAWN') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'a resolved warranty claim is immutable; its resolution is retained';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_warranty_claim_resolved_immutable
      BEFORE UPDATE OR DELETE ON warranty_claims
      FOR EACH ROW EXECUTE FUNCTION protect_warranty_claim_resolution()`);

    // DB-119 mirrors punch_closure_cycles (DB-117): an undecided cycle may only be completed with
    // its decision, a decided cycle is frozen forever, and no cycle row is ever deleted. That is
    // what keeps a VERIFIED → REOPENED transition from erasing the previous verification.
    await queryRunner.query(`CREATE FUNCTION protect_work_order_closure_cycle()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'work order closure cycles cannot be deleted';
      END IF;
      IF OLD.decision IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'decided work order closure cycles are immutable';
      END IF;
      IF NEW.decision IS NULL OR
        (to_jsonb(NEW) - ARRAY['decision','decision_comment','decided_by','decided_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['decision','decision_comment','decided_by','decided_at']::text[])
      THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'a work order closure cycle update may only complete its decision';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_work_order_closure_cycle_protect
      BEFORE UPDATE OR DELETE ON work_order_closure_cycles
      FOR EACH ROW EXECUTE FUNCTION protect_work_order_closure_cycle()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_work_order_closure_cycle_protect ON work_order_closure_cycles'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_work_order_closure_cycle()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_warranty_claim_resolved_immutable ON warranty_claims'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_warranty_claim_resolution()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_maintenance_plan_published_immutable ON maintenance_plans'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_maintenance_plan_published()');
    await queryRunner.query(
      'DROP TRIGGER IF EXISTS trg_alarm_case_local_acknowledge ON alarm_cases'
    );
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_alarm_case_local_acknowledge()');

    await queryRunner.query('DROP TABLE IF EXISTS warranty_claims');
    await queryRunner.query('DROP TABLE IF EXISTS work_order_closure_cycles');
    await queryRunner.query('DROP TABLE IF EXISTS work_orders');
    await queryRunner.query('DROP TABLE IF EXISTS maintenance_plans');
    await queryRunner.query('DROP TABLE IF EXISTS service_incidents');
    await queryRunner.query('DROP TABLE IF EXISTS alarm_cases');
  }
}
