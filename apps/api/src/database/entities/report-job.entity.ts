import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique, UpdateDateColumn
} from 'typeorm';
import { ReportJobStatus, ReportType } from './cross-cutting.enums';

/** Where the finished export lives; written by the worker, never by the API. */
export interface ReportOutputObjectRef {
  bucket: string;
  objectKey: string;
}

/**
 * DB-107 — one asynchronous register export (FR-173, US-023).
 *
 * The API only ever inserts QUEUED rows and reads them back; the worker owns every transition.
 * A COMPLETED row's `output_object_ref`/`data_as_of` are frozen by a trigger
 * (`trg_report_job_completed_immutable`) so a published snapshot can never be silently swapped.
 * API-134 re-checks the module read permission at read time before revealing the download
 * reference, so a revoked permission hides an already-produced file.
 */
@Entity({ name: 'report_jobs' })
@Unique('uq_report_jobs_tenant_id', ['tenantId', 'id'])
@Index('idx_report_job_requester', ['tenantId', 'requestedBy', 'status', 'createdAt'])
@Check('ck_report_job_type', "report_type IN ('RISK_REGISTER_CSV','DOCUMENT_REGISTER_CSV')")
@Check('ck_report_job_status', "status IN ('QUEUED','RUNNING','COMPLETED','FAILED')")
@Check('ck_report_job_filter_object', "jsonb_typeof(filter_snapshot) = 'object'")
@Check('ck_report_job_output_object',
  "output_object_ref IS NULL OR jsonb_typeof(output_object_ref) = 'object'")
// A COMPLETED job must carry its snapshot facts; anything less is not a completion.
@Check('ck_report_job_completed_projection', `status <> 'COMPLETED' OR (
  output_object_ref IS NOT NULL AND data_as_of IS NOT NULL AND expires_at IS NOT NULL
)`)
export class ReportJobEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column({ name: 'report_type', type: 'varchar', length: 40 }) reportType!: ReportType;
  @Column({ name: 'filter_snapshot', type: 'jsonb', default: () => "'{}'::jsonb" })
  filterSnapshot!: Record<string, unknown>;
  @Column({ name: 'data_as_of', type: 'timestamptz', nullable: true }) dataAsOf!: Date | null;
  @Column({ type: 'varchar', length: 20 }) status!: ReportJobStatus;
  @Column({ name: 'output_object_ref', type: 'jsonb', nullable: true })
  outputObjectRef!: ReportOutputObjectRef | null;
  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt!: Date | null;
  @Column('uuid', { name: 'requested_by' }) requestedBy!: string;
  @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
