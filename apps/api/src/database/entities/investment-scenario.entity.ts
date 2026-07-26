import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import { InvestmentScenarioStatus, InvestmentScenarioType } from './opportunity.enums';

/**
 * DB-016 — one investment scenario version under an opportunity (API-031/API-032).
 *
 * THE SERVER COMPUTES NO FINANCIAL FIGURES (recorded decision): `capex_total`, `npv`, `irr` and
 * `payback_months` are client-supplied evidence stored verbatim together with `formula_version` and
 * both snapshots. No approved formula catalog exists and AGENTS.md forbids inventing one, so any
 * server-side recomputation would be fabricated finance.
 *
 * MONEY: numeric(19,4)/(9,6) surfaced as TypeScript strings; no JS `number` ever touches them.
 *
 * `workflow_instance_id` is a plain uuid column (relation-less) with a DDL composite FK to
 * DB-071 `workflow_instances`. The engine currently requires a non-null project on every instance
 * while opportunities are pre-project, so API-032 records submission on the aggregate itself
 * (submitted_by/at + SUBMITTED) and leaves this column NULL — the read-time projection in API-028
 * is already wired for the day the engine accepts pre-project targets.
 *
 * An APPROVED row is immutable: `trg_investment_scenario_history` refuses UPDATE and DELETE.
 */
@Entity({ name: 'investment_scenarios' })
@Unique('uq_investment_scenarios_tenant_id', ['tenantId', 'id'])
@Unique('uq_investment_scenario_version', ['tenantId', 'opportunityId', 'scenarioType', 'version'])
@Index('idx_investment_scenario_opportunity', ['tenantId', 'opportunityId', 'scenarioType'])
@Check('ck_investment_scenario_type', "scenario_type IN ('SOLAR','BESS','HYBRID')")
@Check('ck_investment_scenario_status',
  "status IN ('DRAFT','SUBMITTED','APPROVED','RETURNED','REJECTED')")
@Check('ck_investment_scenario_version_number', 'version >= 1')
@Check('ck_investment_scenario_currency', "currency ~ '^[A-Z]{3}$'")
@Check('ck_investment_scenario_capex', 'capex_total IS NULL OR capex_total >= 0')
@Check('ck_investment_scenario_payback', 'payback_months IS NULL OR payback_months >= 0')
@Check('ck_investment_scenario_input_object', "jsonb_typeof(input_snapshot) = 'object'")
@Check('ck_investment_scenario_output_object', "jsonb_typeof(output_snapshot) = 'object'")
@Check('ck_investment_scenario_submitted_pair', '(submitted_by IS NULL) = (submitted_at IS NULL)')
// Every state beyond DRAFT implies somebody submitted the scenario first.
@Check('ck_investment_scenario_submitted_status', "status = 'DRAFT' OR submitted_by IS NOT NULL")
@Check('ck_investment_scenario_version', 'version_no >= 1')
export class InvestmentScenarioEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'opportunity_id' }) opportunityId!: string;
  @Column({ name: 'scenario_type', type: 'varchar', length: 30 })
  scenarioType!: InvestmentScenarioType;
  @Column({ type: 'integer' }) version!: number;
  @Column({ type: 'varchar', length: 20 }) status!: InvestmentScenarioStatus;
  @Column({ type: 'char', length: 3 }) currency!: string;
  /** numeric(19,4) money as text — client-supplied evidence, stored verbatim. */
  @Column({ name: 'capex_total', type: 'numeric', precision: 19, scale: 4, nullable: true })
  capexTotal!: string | null;
  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true }) npv!: string | null;
  /** numeric(9,6) rate as text. */
  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true }) irr!: string | null;
  @Column({ name: 'payback_months', type: 'integer', nullable: true }) paybackMonths!: number | null;
  @Column({ name: 'input_snapshot', type: 'jsonb' }) inputSnapshot!: Record<string, unknown>;
  @Column({ name: 'output_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  outputSnapshot!: Record<string, unknown>;
  @Column({ name: 'formula_version', type: 'varchar', length: 40 }) formulaVersion!: string;
  /** Plain uuid (relation-less); composite DDL FK to workflow_instances. NULL in V1 — see header. */
  @Column('uuid', { name: 'workflow_instance_id', nullable: true })
  workflowInstanceId!: string | null;
  @Column('uuid', { name: 'submitted_by', nullable: true }) submittedBy!: string | null;
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true }) submittedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @Column('uuid', { name: 'updated_by' }) updatedBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
