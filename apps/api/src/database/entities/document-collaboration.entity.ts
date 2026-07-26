import {
  Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique,
  UpdateDateColumn, VersionColumn
} from 'typeorm';
import {
  ExternalShareStatus, ReviewCommentDisposition, ReviewCommentSeverity,
  SignatureEnvelopeStatus, TransmittalResponseStatus, TransmittalStatus,
  type DocumentRecipientSnapshot, type SignerSnapshotRecord
} from './document-control.enums';

/** DB-024 — append-only review history; a disposition correction adds a row, never edits one. */
@Entity({ name: 'document_review_comments' })
@Unique('uq_document_review_comments_tenant_id', ['tenantId', 'id'])
@Unique('uq_document_review_comment_sequence', ['tenantId', 'revisionId', 'sequenceNo'])
@Index('idx_document_review_comment_cycle', ['tenantId', 'revisionId', 'cycleNo'])
@Check('ck_document_review_comment_cycle', 'cycle_no >= 1')
@Check('ck_document_review_comment_sequence', 'sequence_no >= 1')
@Check('ck_document_review_comment_severity', "severity IN ('INFO','MINOR','MAJOR','CRITICAL')")
@Check('ck_document_review_comment_disposition', "disposition IN ('OPEN','ACCEPTED','REJECTED','CLOSED')")
@Check('ck_document_review_comment_body', 'length(trim(body)) >= 3')
export class DocumentReviewCommentEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'revision_id' }) revisionId!: string;
  @Column({ name: 'sequence_no', type: 'integer' }) sequenceNo!: number;
  @Column({ name: 'cycle_no', type: 'integer' }) cycleNo!: number;
  @Column('uuid', { name: 'author_id' }) authorId!: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) location!: string | null;
  @Column({ type: 'varchar', length: 20 }) severity!: ReviewCommentSeverity;
  @Column({ type: 'varchar', length: 4000 }) body!: string;
  @Column({ type: 'varchar', length: 20 }) disposition!: ReviewCommentDisposition;
  @Column({ name: 'disposition_note', type: 'varchar', length: 2000, nullable: true }) dispositionNote!: string | null;
  @Column({ name: 'correlation_id', type: 'varchar', length: 100 }) correlationId!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/** DB-025 — an issued transmittal is an immutable snapshot of who received which revision. */
@Entity({ name: 'transmittals' })
@Unique('uq_transmittals_tenant_id', ['tenantId', 'id'])
@Unique('uq_transmittals_project_id', ['tenantId', 'projectId', 'id'])
@Unique('uq_transmittal_number', ['tenantId', 'projectId', 'number'])
@Index('idx_transmittal_status', ['tenantId', 'projectId', 'status', 'dueDate'])
@Check('ck_transmittal_number', "number ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'")
@Check('ck_transmittal_status', "status IN ('DRAFT','ISSUED','CLOSED')")
@Check('ck_transmittal_recipients_array', "jsonb_typeof(recipient_snapshot) = 'array'")
@Check('ck_transmittal_issue_pair', '(issued_by IS NULL) = (issued_at IS NULL)')
@Check('ck_transmittal_issued_has_recipients', `status = 'DRAFT'
  OR (issued_by IS NOT NULL AND jsonb_array_length(recipient_snapshot) >= 1)`)
@Check('ck_transmittal_version', 'version_no >= 1')
export class TransmittalEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'project_id' }) projectId!: string;
  @Column({ type: 'varchar', length: 80 }) number!: string;
  @Column('uuid', { name: 'sender_party_id', nullable: true }) senderPartyId!: string | null;
  @Column({ name: 'recipient_snapshot', type: 'jsonb', default: () => "'[]'::jsonb" })
  recipientSnapshot!: DocumentRecipientSnapshot[];
  @Column({ type: 'varchar', length: 400 }) purpose!: string;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate!: string | null;
  @Column({ type: 'varchar', length: 20 }) status!: TransmittalStatus;
  @Column('uuid', { name: 'issued_by', nullable: true }) issuedBy!: string | null;
  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt!: Date | null;
  @VersionColumn({ name: 'version_no' }) versionNo!: number;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

/** DB-026 — one revision inside a transmittal, with its own response SLA. */
@Entity({ name: 'transmittal_items' })
@Unique('uq_transmittal_items_tenant_id', ['tenantId', 'id'])
@Unique('uq_transmittal_item_revision', ['tenantId', 'transmittalId', 'revisionId'])
@Index('idx_transmittal_item_response', ['tenantId', 'transmittalId', 'responseStatus'])
@Check('ck_transmittal_item_response_status', "response_status IN ('PENDING','RESPONDED','OVERDUE')")
@Check('ck_transmittal_item_response_pair', `(responded_by IS NULL) = (responded_at IS NULL)`)
@Check('ck_transmittal_item_responded', `response_status <> 'RESPONDED'
  OR (responded_by IS NOT NULL AND response_code IS NOT NULL)`)
export class TransmittalItemEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'transmittal_id' }) transmittalId!: string;
  @Column('uuid', { name: 'revision_id' }) revisionId!: string;
  @Column({ name: 'action_code', type: 'varchar', length: 40 }) actionCode!: string;
  @Column({ name: 'response_code', type: 'varchar', length: 40, nullable: true }) responseCode!: string | null;
  @Column({ name: 'response_due', type: 'date', nullable: true }) responseDue!: string | null;
  @Column({ name: 'response_status', type: 'varchar', length: 20 }) responseStatus!: TransmittalResponseStatus;
  @Column({ name: 'response_note', type: 'varchar', length: 2000, nullable: true }) responseNote!: string | null;
  @Column('uuid', { name: 'responded_by', nullable: true }) respondedBy!: string | null;
  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true }) respondedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-027 — e-signature envelope. Created locally with a signer snapshot and the exact artifact hash
 * being signed; no external provider is contacted because none is contracted yet, so the envelope
 * stays DRAFT and `provider` records the intent only.
 */
@Entity({ name: 'signature_envelopes' })
@Unique('uq_signature_envelopes_tenant_id', ['tenantId', 'id'])
@Index('idx_signature_envelope_revision', ['tenantId', 'revisionId', 'status'])
@Check('ck_signature_envelope_status', "status IN ('DRAFT','SENT','COMPLETED','DECLINED','VOIDED')")
@Check('ck_signature_envelope_signers_array', "jsonb_typeof(signer_snapshot) = 'array'")
@Check('ck_signature_envelope_signers_present', 'jsonb_array_length(signer_snapshot) >= 1')
@Check('ck_signature_envelope_hash_format', "artifact_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_signature_envelope_completion_pair', '(completed_at IS NULL) = (completion_hash IS NULL)')
// Without a contracted provider an envelope can never legitimately carry an external id.
@Check('ck_signature_envelope_external', "status = 'DRAFT' OR external_id IS NOT NULL")
export class SignatureEnvelopeEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'revision_id' }) revisionId!: string;
  @Column({ type: 'varchar', length: 80 }) provider!: string;
  @Column({ name: 'external_id', type: 'varchar', length: 200, nullable: true }) externalId!: string | null;
  @Column({ name: 'signer_snapshot', type: 'jsonb' }) signerSnapshot!: SignerSnapshotRecord[];
  @Column({ name: 'artifact_hash', type: 'varchar', length: 64 }) artifactHash!: string;
  @Column({ type: 'varchar', length: 20 }) status!: SignatureEnvelopeStatus;
  @Column({ name: 'completion_hash', type: 'varchar', length: 64, nullable: true }) completionHash!: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

/**
 * DB-114 — controlled external share of one issued revision. Allocated 2026-07-26 because the
 * 164-operation catalog has no download or redeem endpoint and DB-022…027 had nowhere to record
 * expiry, watermark policy or revocation.
 */
@Entity({ name: 'document_external_shares' })
@Unique('uq_document_external_shares_tenant_id', ['tenantId', 'id'])
@Unique('uq_document_external_share_token', ['tokenHash'])
@Index('idx_document_external_share_revision', ['tenantId', 'revisionId', 'status'])
@Index('idx_document_external_share_expiry', ['tenantId', 'expiresAt'])
@Check('ck_document_external_share_status', "status IN ('ACTIVE','REVOKED','EXPIRED')")
@Check('ck_document_external_share_token_format', "token_hash ~ '^[0-9a-f]{64}$'")
@Check('ck_document_external_share_recipients_array', "jsonb_typeof(recipient_snapshot) = 'array'")
@Check('ck_document_external_share_recipients_present', 'jsonb_array_length(recipient_snapshot) >= 1')
@Check('ck_document_external_share_expiry', 'expires_at > created_at')
@Check('ck_document_external_share_revoke_pair', '(revoked_by IS NULL) = (revoked_at IS NULL)')
@Check('ck_document_external_share_revoked_status', "status <> 'REVOKED' OR revoked_by IS NOT NULL")
@Check('ck_document_external_share_download_count', 'download_count >= 0')
export class DocumentExternalShareEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid', { name: 'tenant_id' }) tenantId!: string;
  @Column('uuid', { name: 'revision_id' }) revisionId!: string;
  /** Only the hash is stored, so a leaked database never yields a usable share link. */
  @Column({ name: 'token_hash', type: 'varchar', length: 64 }) tokenHash!: string;
  @Column({ name: 'recipient_snapshot', type: 'jsonb' }) recipientSnapshot!: DocumentRecipientSnapshot[];
  @Column({ type: 'varchar', length: 400 }) purpose!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'watermark_required', type: 'boolean', default: true }) watermarkRequired!: boolean;
  @Column({ name: 'download_allowed', type: 'boolean', default: false }) downloadAllowed!: boolean;
  @Column({ name: 'download_count', type: 'integer', default: 0 }) downloadCount!: number;
  @Column({ type: 'varchar', length: 20 }) status!: ExternalShareStatus;
  @Column('uuid', { name: 'revoked_by', nullable: true }) revokedBy!: string | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column('uuid', { name: 'created_by' }) createdBy!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
