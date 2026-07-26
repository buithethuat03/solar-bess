import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  CommissioningSystemStatus, TestPackStatus, TestRunResult, TestRunStatus
} from './commissioning-cod.enums';

/**
 * DB-073 — CommissioningSystem (FR-106). Project-scoped systemization tree: `parent_system_id` is a
 * self reference constrained to the SAME tenant and project, and `ck_commissioning_system_parent`
 * refuses a row that is its own parent.
 *
 * Both `uq_commissioning_systems_tenant_id` and `uq_commissioning_systems_project_id` ship on
 * purpose: Field/HSE punch items and the O&M slice will hang composite foreign keys off this table
 * from both directions, and adding a unique key later is a migration on a populated table.
 */
@Entity({ name: 'commissioning_systems' })
@Unique('uq_commissioning_systems_tenant_id', ['tenantId', 'id'])
@Unique('uq_commissioning_systems_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_commissioning_system_code', ['tenantId', 'projectId', 'code'])
@Index('idx_commissioning_system_register', ['tenantId', 'projectId', 'status'])
@Check('ck_commissioning_system_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_commissioning_system_type', "system_type ~ '^[A-Z][A-Z0-9_]{0,39}$'")
@Check('ck_commissioning_system_status',
  "status IN ('NOT_READY','READY_FOR_TEST','TESTING','PASSED','FAILED')")
@Check('ck_commissioning_system_parent', 'parent_system_id IS NULL OR parent_system_id <> id')
@Check('ck_commissioning_system_boundary', "jsonb_typeof(boundary) = 'object'")
@Check('ck_commissioning_system_version', 'version_no >= 1')
export class CommissioningSystemEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'parent_system_id', nullable: true }) parentSystemId!: string | null;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 250 }) name!: string;
  @Column({ name: 'system_type', type: 'varchar', length: 40 }) systemType!: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) boundary!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20 }) status!: CommissioningSystemStatus;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-074 — TestPack (FR-107). The procedure is not a display string: `procedure_revision_id` is a
 * composite foreign key into `document_revisions (tenant_id, id)`, and API-100 refuses a revision
 * that is not ISSUED with a CLEAN malware scan (`PROCEDURE_REVISION_LOCKED`).
 *
 * `uq_test_pack_code_revision` keys the pack by (system, code, procedure revision) exactly as the
 * data dictionary specifies, so a re-issued procedure produces a NEW pack row rather than an edit
 * of the approved one — which `trg_test_pack_approved_immutable` would refuse anyway.
 */
@Entity({ name: 'test_packs' })
@Unique('uq_test_packs_tenant_id', ['tenantId', 'id'])
@Unique('uq_test_packs_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_test_packs_system_id', ['tenantId', 'commissioningSystemId', 'id'])
@Unique('uq_test_pack_code_revision',
  ['tenantId', 'commissioningSystemId', 'code', 'procedureRevisionId'])
@Index('idx_test_pack_register', ['tenantId', 'projectId', 'status'])
@Check('ck_test_pack_code', "code ~ '^[A-Z0-9][A-Z0-9_.-]{0,79}$'")
@Check('ck_test_pack_status', "status IN ('DRAFT','APPROVED','SUPERSEDED')")
@Check('ck_test_pack_prerequisites', "jsonb_typeof(prerequisites_snapshot) = 'object'")
@Check('ck_test_pack_approved_pair', '(approved_by IS NULL) = (approved_at IS NULL)')
@Check('ck_test_pack_approved',
  "status NOT IN ('APPROVED','SUPERSEDED') OR approved_by IS NOT NULL")
@Check('ck_test_pack_version', 'version_no >= 1')
export class TestPackEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'commissioning_system_id' }) commissioningSystemId!: string;
  @Column({ type: 'varchar', length: 80 }) code!: string;
  @Column({ type: 'varchar', length: 400 }) title!: string;
  @Column('uuid', { name: 'procedure_revision_id' }) procedureRevisionId!: string;
  @Column({ name: 'prerequisites_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  prerequisitesSnapshot!: Record<string, unknown>;
  @Column({ type: 'varchar', length: 20 }) status!: TestPackStatus;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/**
 * DB-075 — TestRun (FR-108…FR-111). The result is a permanent fact:
 * `ck_test_run_recorded` refuses RECORDED without a result, a recorder pair and at least one piece
 * of evidence, and `trg_test_run_result_immutable` freezes the row afterwards — a FAILED run can
 * never become PASSED. A retest is a new row carrying `previous_run_id`, and
 * `uq_test_run_retest_once` keeps one retest per run so a failure cannot be re-run into silence.
 */
@Entity({ name: 'test_runs' })
@Unique('uq_test_runs_tenant_id', ['tenantId', 'id'])
@Unique('uq_test_runs_pack_id', ['tenantId', 'testPackId', 'id'])
@Unique('uq_test_run_pack_run_no', ['tenantId', 'testPackId', 'runNo'])
@Index('uq_test_run_open', ['tenantId', 'testPackId'], {
  unique: true, where: "status = 'IN_PROGRESS'"
})
@Index('uq_test_run_retest_once', ['tenantId', 'previousRunId'], {
  unique: true, where: 'previous_run_id IS NOT NULL'
})
@Index('idx_test_run_register', ['tenantId', 'projectId', 'result'])
@Check('ck_test_run_status', "status IN ('IN_PROGRESS','RECORDED')")
@Check('ck_test_run_result',
  "result IS NULL OR result IN ('PASSED','FAILED','ABORTED','INCONCLUSIVE')")
@Check('ck_test_run_run_no', 'run_no >= 1')
@Check('ck_test_run_previous', 'previous_run_id IS NULL OR previous_run_id <> id')
@Check('ck_test_run_evidence_array', "jsonb_typeof(evidence_refs) = 'array'")
@Check('ck_test_run_recorded', `status <> 'RECORDED'
  OR (result IS NOT NULL AND recorded_by IS NOT NULL AND recorded_at IS NOT NULL
    AND jsonb_array_length(evidence_refs) >= 1)`)
@Check('ck_test_run_open_has_no_result', "status = 'RECORDED' OR result IS NULL")
@Check('ck_test_run_recorded_pair', '(recorded_by IS NULL) = (recorded_at IS NULL)')
@Check('ck_test_run_window', 'ended_at IS NULL OR ended_at >= started_at')
@Check('ck_test_run_version', 'version_no >= 1')
export class TestRunEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column('uuid', { name: 'test_pack_id' }) testPackId!: string;
  @Column('uuid', { name: 'previous_run_id', nullable: true }) previousRunId!: string | null;
  @Column({ name: 'run_no', type: 'integer' }) runNo!: number;
  @Column({ type: 'varchar', length: 20 }) status!: TestRunStatus;
  @Column({ type: 'varchar', length: 20, nullable: true }) result!: TestRunResult | null;
  @Column({ name: 'raw_data_ref', type: 'varchar', length: 500, nullable: true })
  rawDataRef!: string | null;
  @Column({ name: 'instrument_snapshot', type: 'jsonb', nullable: true })
  instrumentSnapshot!: Record<string, unknown> | null;
  @Column({ name: 'witness_snapshot', type: 'jsonb', nullable: true })
  witnessSnapshot!: Record<string, unknown> | null;
  @Column({ name: 'evidence_refs', type: 'jsonb', default: () => "'[]'::jsonb" })
  evidenceRefs!: string[];
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true }) endedAt!: Date | null;
  @Column('uuid', { name: 'started_by' }) startedBy!: string;
  @Column('uuid', { name: 'recorded_by', nullable: true }) recordedBy!: string | null;
  @Column({ name: 'recorded_at', type: 'timestamptz', nullable: true }) recordedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
