import type { MigrationInterface, QueryRunner } from 'typeorm';

const marker = 'solar-bess:migration:1783735000000:reconciled';

const constraints = [
  {
    table: 'risks', name: 'ck_risk_closure_decision_request',
    expression: 'closure_decision IS NULL OR closure_requested_by IS NOT NULL'
  },
  {
    table: 'risks', name: 'ck_risk_closure_pending_projection',
    expression: "status <> 'CLOSURE_PENDING' OR (closure_requested_by IS NOT NULL AND closure_decision IS NULL)"
  },
  {
    table: 'issues', name: 'ck_issue_closure_decision_request',
    expression: 'closure_decision IS NULL OR closure_requested_by IS NOT NULL'
  },
  {
    table: 'issues', name: 'ck_issue_closure_pending_projection',
    expression: "status <> 'CLOSURE_PENDING' OR (closure_requested_by IS NOT NULL AND closure_decision IS NULL)"
  },
  {
    table: 'change_requests', name: 'ck_change_request_approval_status',
    expression: "approved_by IS NULL OR status IN ('APPROVED','IMPLEMENTED','CLOSED')"
  },
  {
    table: 'change_requests', name: 'ck_change_request_schedule_approval_status',
    expression: "schedule_impact_approved = false OR status IN ('APPROVED','IMPLEMENTED','CLOSED')"
  }
] as const;

const desiredParentScopeFunction = `CREATE OR REPLACE FUNCTION enforce_risk_issue_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_package_id uuid;
DECLARE parent_risk_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'issues' THEN
    IF NEW.source_risk_id IS NOT NULL THEN
      SELECT package_id INTO parent_package_id FROM risks
        WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.source_risk_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_issues_tenant_source_risk',
          MESSAGE = 'source Risk does not exist in Issue tenant/project scope';
      END IF;
      IF parent_package_id IS DISTINCT FROM NEW.package_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_issue_source_risk_package_scope',
          MESSAGE = 'Issue package scope must match source Risk';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'risks' THEN
    IF NEW.occurred_issue_id IS NOT NULL THEN
      SELECT package_id, source_risk_id INTO parent_package_id, parent_risk_id FROM issues
        WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.occurred_issue_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_risks_tenant_occurred_issue',
          MESSAGE = 'occurred Issue does not exist in Risk tenant/project scope';
      END IF;
      IF parent_package_id IS DISTINCT FROM NEW.package_id OR parent_risk_id IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_risk_occurred_issue_scope',
          MESSAGE = 'occurred Issue must link the same Risk and package scope';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$`;

const legacyParentScopeFunction = `CREATE OR REPLACE FUNCTION enforce_risk_issue_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_package_id uuid;
DECLARE parent_risk_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'issues' AND NEW.source_risk_id IS NOT NULL THEN
    SELECT package_id INTO parent_package_id FROM risks
      WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.source_risk_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_issues_tenant_source_risk',
        MESSAGE = 'source Risk does not exist in Issue tenant/project scope';
    END IF;
    IF parent_package_id IS DISTINCT FROM NEW.package_id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_issue_source_risk_package_scope',
        MESSAGE = 'Issue package scope must match source Risk';
    END IF;
  ELSIF TG_TABLE_NAME = 'risks' AND NEW.occurred_issue_id IS NOT NULL THEN
    SELECT package_id, source_risk_id INTO parent_package_id, parent_risk_id FROM issues
      WHERE tenant_id = NEW.tenant_id AND project_id = NEW.project_id AND id = NEW.occurred_issue_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', CONSTRAINT = 'fk_risks_tenant_occurred_issue',
        MESSAGE = 'occurred Issue does not exist in Risk tenant/project scope';
    END IF;
    IF parent_package_id IS DISTINCT FROM NEW.package_id OR parent_risk_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_risk_occurred_issue_scope',
        MESSAGE = 'occurred Issue must link the same Risk and package scope';
    END IF;
  END IF;
  RETURN NEW;
END $$`;

const desiredChangeHistoryFunction = `CREATE OR REPLACE FUNCTION protect_change_request_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED','IMPLEMENTED','CLOSED') AND
     (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
     <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved Change snapshot is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    (OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED','IMPLEMENTED','CLOSED'))
    OR (OLD.status = 'IMPLEMENTED' AND NEW.status NOT IN ('IMPLEMENTED','CLOSED'))
    OR (OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved Change status cannot regress';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED' AND
     (to_jsonb(NEW) - ARRAY['status','decision_version','decided_by','decided_at','approved_by','approved_at',
      'decision_comment','schedule_impact_approved','version_no','updated_by','updated_at']::text[])
     <> (to_jsonb(OLD) - ARRAY['status','decision_version','decided_by','decided_at','approved_by','approved_at',
      'decision_comment','schedule_impact_approved','version_no','updated_by','updated_at']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change source/reason/impact snapshot is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED'
     AND NEW.status NOT IN ('APPROVED','RETURNED','REJECTED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change requires an explicit decision';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'REJECTED' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'rejected Change decision is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$`;

const legacyChangeHistoryFunction = `CREATE OR REPLACE FUNCTION protect_change_request_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change history cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED','IMPLEMENTED','CLOSED') AND
     (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
     <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'approved Change snapshot is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'SUBMITTED' AND
     (to_jsonb(NEW) - ARRAY['status','decision_version','decided_by','decided_at','approved_by','approved_at',
      'decision_comment','schedule_impact_approved','version_no','updated_by','updated_at']::text[])
     <> (to_jsonb(OLD) - ARRAY['status','decision_version','decided_by','decided_at','approved_by','approved_at',
      'decision_comment','schedule_impact_approved','version_no','updated_by','updated_at']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted Change source/reason/impact snapshot is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$`;

export class ReconcileRiskChangeRuntimeDrift1783735000000 implements MigrationInterface {
  name = 'ReconcileRiskChangeRuntimeDrift1783735000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const constraint of constraints) {
      const rows = await queryRunner.query(
        `SELECT obj_description(oid, 'pg_constraint') AS comment
         FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`,
        [constraint.table, constraint.name]
      ) as Array<{ comment: string | null }>;
      if (rows.length > 0) continue;
      await queryRunner.query(
        `ALTER TABLE ${constraint.table} ADD CONSTRAINT ${constraint.name}
         CHECK (${constraint.expression})`
      );
      await queryRunner.query(
        `COMMENT ON CONSTRAINT ${constraint.name} ON ${constraint.table} IS '${marker}'`
      );
    }
    await reconcileFunction(
      queryRunner, 'enforce_risk_issue_parent_scope()', desiredParentScopeFunction,
      "IF TG_TABLE_NAME = 'issues' THEN"
    );
    await reconcileFunction(
      queryRunner, 'protect_change_request_history()', desiredChangeHistoryFunction,
      'approved Change status cannot regress'
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await restoreLegacyFunction(
      queryRunner, 'protect_change_request_history()', legacyChangeHistoryFunction
    );
    await restoreLegacyFunction(
      queryRunner, 'enforce_risk_issue_parent_scope()', legacyParentScopeFunction
    );
    for (const constraint of [...constraints].reverse()) {
      const rows = await queryRunner.query(
        `SELECT obj_description(oid, 'pg_constraint') AS comment
         FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`,
        [constraint.table, constraint.name]
      ) as Array<{ comment: string | null }>;
      if (rows[0]?.comment !== marker) continue;
      await queryRunner.query(
        `ALTER TABLE ${constraint.table} DROP CONSTRAINT ${constraint.name}`
      );
    }
  }
}

async function reconcileFunction(
  queryRunner: QueryRunner, signature: string, desiredDefinition: string,
  desiredMarker: string
): Promise<void> {
  const rows = await queryRunner.query(
    `SELECT p.prosrc AS source, obj_description(p.oid, 'pg_proc') AS comment
     FROM pg_proc p WHERE p.oid = $1::regprocedure`, [signature]
  ) as Array<{ source: string; comment: string | null }>;
  const current = rows[0];
  const mustRestoreLegacy = current.comment === marker || !current.source.includes(desiredMarker);
  await queryRunner.query(desiredDefinition);
  if (mustRestoreLegacy) {
    await queryRunner.query(`COMMENT ON FUNCTION ${signature} IS '${marker}'`);
  }
}

async function restoreLegacyFunction(
  queryRunner: QueryRunner, signature: string, legacyDefinition: string
): Promise<void> {
  const rows = await queryRunner.query(
    `SELECT obj_description(p.oid, 'pg_proc') AS comment
     FROM pg_proc p WHERE p.oid = $1::regprocedure`, [signature]
  ) as Array<{ comment: string | null }>;
  if (rows[0]?.comment !== marker) return;
  await queryRunner.query(legacyDefinition);
  await queryRunner.query(`COMMENT ON FUNCTION ${signature} IS NULL`);
}
