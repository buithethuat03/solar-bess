import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  DocumentLockState, DocumentRevisionStatus, DocumentScanStatus
} from './document-control.enums';

/**
 * DB-023 — one uploaded version of a document.
 *
 * A revision is created the moment an upload session starts, so the quarantined bytes always have a
 * row that owns them; there is no separate upload-session table to drift out of sync. `objectKey`
 * moves from the quarantine bucket to the release bucket only after a clean scan.
 */
@Entity({ name: 'document_revisions' })
@Unique('uq_document_revisions_tenant_id', ['tenantId', 'id'])
@Unique('uq_document_revision_code', ['tenantId', 'documentId', 'revisionCode', 'workingVersion'])
@Index('idx_document_revision_status', ['tenantId', 'documentId', 'status'])
@Index('idx_document_revision_scan', ['tenantId', 'scanStatus'])
@Index('idx_document_revision_hash', ['tenantId', 'contentHash'])
@Check('ck_document_revision_code', "revision_code ~ '^[A-Z0-9][A-Z0-9_.-]{0,39}$'")
@Check('ck_document_revision_working_version', 'working_version >= 1')
@Check('ck_document_revision_status', "status IN ('DRAFT','IN_REVIEW','APPROVED','ISSUED','SUPERSEDED','REJECTED')")
@Check('ck_document_revision_scan_status', "scan_status IN ('QUARANTINED','SCANNING','CLEAN','INFECTED','UNAVAILABLE')")
@Check('ck_document_revision_lock', "lock_state IN ('UNLOCKED','LOCKED','LEGAL_HOLD')")
@Check('ck_document_revision_hash_format', "content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_document_revision_size', 'size_bytes IS NULL OR size_bytes >= 0')
// FR-029/SEC-121: nothing may leave quarantine for use unless the scan came back clean. This is the
// constraint that makes "unscanned bytes are unreachable" a database fact, not a code convention.
@Check('ck_document_revision_release_requires_clean', `status NOT IN ('APPROVED','ISSUED','SUPERSEDED')
  OR (scan_status = 'CLEAN' AND content_hash IS NOT NULL AND released_object_key IS NOT NULL)`)
@Check('ck_document_revision_issue_pair', '(issued_by IS NULL) = (issued_at IS NULL)')
@Check('ck_document_revision_issued_locked', `status <> 'ISSUED' OR (issued_by IS NOT NULL AND lock_state <> 'UNLOCKED')`)
@Check('ck_document_revision_approval_pair', '(approved_by IS NULL) = (approved_at IS NULL)')
@Check('ck_document_revision_approved_status', `status NOT IN ('APPROVED','ISSUED','SUPERSEDED') OR approved_by IS NOT NULL`)
@Check('ck_document_revision_scan_signature', `scan_status <> 'INFECTED' OR scan_signature IS NOT NULL`)
@Check('ck_document_revision_version', 'version_no >= 1')
export class DocumentRevisionEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'document_id' }) documentId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ name: 'revision_code', type: 'varchar', length: 40 }) revisionCode!: string;
  @Column({ name: 'working_version', type: 'integer' }) workingVersion!: number;
  @Column({ type: 'varchar', length: 30 }) status!: DocumentRevisionStatus;
  @Column({ type: 'varchar', length: 200 }) purpose!: string;
  @Column({ name: 'file_name', type: 'varchar', length: 400 }) fileName!: string;
  @Column({ name: 'mime_type', type: 'varchar', length: 200 }) mimeType!: string;
  @Column({ name: 'quarantine_object_key', type: 'varchar', length: 500, nullable: true }) quarantineObjectKey!: string | null;
  @Column({ name: 'released_object_key', type: 'varchar', length: 500, nullable: true }) releasedObjectKey!: string | null;
  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true }) contentHash!: string | null;
  @Column({ name: 'size_bytes', type: 'bigint', nullable: true, transformer: {
    to: (value: number | null) => value,
    from: (value: string | null) => (value === null ? null : Number(value))
  } }) sizeBytes!: number | null;
  @Column({ name: 'scan_status', type: 'varchar', length: 20 }) scanStatus!: DocumentScanStatus;
  @Column({ name: 'scan_signature', type: 'varchar', length: 400, nullable: true }) scanSignature!: string | null;
  @Column({ name: 'scanned_at', type: 'timestamptz', nullable: true }) scannedAt!: Date | null;
  @Column({ name: 'scanner_version', type: 'varchar', length: 200, nullable: true }) scannerVersion!: string | null;
  @Column({ name: 'lock_state', type: 'varchar', length: 20 }) lockState!: DocumentLockState;
  @Column({ name: 'review_cycle_no', type: 'integer', default: 0 }) reviewCycleNo!: number;
  @Column('uuid', { name: 'approved_by', nullable: true }) approvedBy!: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt!: Date | null;
  @Column('uuid', { name: 'issued_by', nullable: true }) issuedBy!: string | null;
  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt!: Date | null;
  @Column('uuid', { name: 'uploaded_by' }) uploadedBy!: string;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
