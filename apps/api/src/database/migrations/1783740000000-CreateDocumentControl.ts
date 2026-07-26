import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-022…DB-027 plus DB-114 for US-005/US-019. The DDL mirrors the entity decorators one-for-one:
 * every `@Check`, `@Unique` and `@Index` appears here under the same name, so a constraint can be
 * traced from the TypeScript model to the database and back.
 *
 * Every foreign key is composite and carries `tenant_id`, which makes a cross-tenant reference
 * impossible at the database level rather than only in service code.
 */
export class CreateDocumentControl1783740000000 implements MigrationInterface {
  name = 'CreateDocumentControl1783740000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE documents (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      package_id uuid,
      document_code varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      discipline varchar(100) NOT NULL,
      type varchar(100) NOT NULL,
      classification varchar(30) NOT NULL,
      owner_id uuid NOT NULL,
      current_revision_id uuid,
      legal_hold boolean NOT NULL DEFAULT false,
      status varchar(30) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_documents PRIMARY KEY (id),
      CONSTRAINT uq_documents_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_documents_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_document_project_code UNIQUE (tenant_id, project_id, document_code),
      CONSTRAINT fk_document_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_package FOREIGN KEY (tenant_id, project_id, package_id)
        REFERENCES packages (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_owner FOREIGN KEY (tenant_id, owner_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_document_code CHECK (document_code ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_document_classification CHECK
        (classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
      CONSTRAINT ck_document_status CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
      CONSTRAINT ck_document_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_document_register
      ON documents (tenant_id, project_id, package_id, type, discipline)`);
    await queryRunner.query(`CREATE INDEX idx_document_classification
      ON documents (tenant_id, project_id, classification)`);

    await queryRunner.query(`CREATE TABLE document_revisions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      document_id uuid NOT NULL,
      project_id uuid NOT NULL,
      revision_code varchar(40) NOT NULL,
      working_version integer NOT NULL,
      status varchar(30) NOT NULL,
      purpose varchar(200) NOT NULL,
      file_name varchar(400) NOT NULL,
      mime_type varchar(200) NOT NULL,
      quarantine_object_key varchar(500),
      released_object_key varchar(500),
      content_hash varchar(64),
      size_bytes bigint,
      scan_status varchar(20) NOT NULL,
      scan_signature varchar(400),
      scanned_at timestamptz,
      scanner_version varchar(200),
      lock_state varchar(20) NOT NULL,
      review_cycle_no integer NOT NULL DEFAULT 0,
      approved_by uuid,
      approved_at timestamptz,
      issued_by uuid,
      issued_at timestamptz,
      uploaded_by uuid NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_document_revisions PRIMARY KEY (id),
      CONSTRAINT uq_document_revisions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_document_revision_code
        UNIQUE (tenant_id, document_id, revision_code, working_version),
      CONSTRAINT fk_document_revision_document FOREIGN KEY (tenant_id, project_id, document_id)
        REFERENCES documents (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_revision_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_revision_uploader FOREIGN KEY (tenant_id, uploaded_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_revision_approver FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_revision_issuer FOREIGN KEY (tenant_id, issued_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_document_revision_code CHECK (revision_code ~ '^[A-Z0-9][A-Z0-9_.-]{0,39}$'),
      CONSTRAINT ck_document_revision_working_version CHECK (working_version >= 1),
      CONSTRAINT ck_document_revision_status CHECK
        (status IN ('DRAFT','IN_REVIEW','APPROVED','ISSUED','SUPERSEDED','REJECTED')),
      CONSTRAINT ck_document_revision_scan_status CHECK
        (scan_status IN ('QUARANTINED','SCANNING','CLEAN','INFECTED','UNAVAILABLE')),
      CONSTRAINT ck_document_revision_lock CHECK (lock_state IN ('UNLOCKED','LOCKED','LEGAL_HOLD')),
      CONSTRAINT ck_document_revision_hash_format CHECK
        (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_document_revision_size CHECK (size_bytes IS NULL OR size_bytes >= 0),
      CONSTRAINT ck_document_revision_release_requires_clean CHECK (
        status NOT IN ('APPROVED','ISSUED','SUPERSEDED')
        OR (scan_status = 'CLEAN' AND content_hash IS NOT NULL AND released_object_key IS NOT NULL)),
      CONSTRAINT ck_document_revision_issue_pair CHECK ((issued_by IS NULL) = (issued_at IS NULL)),
      CONSTRAINT ck_document_revision_issued_locked CHECK (
        status <> 'ISSUED' OR (issued_by IS NOT NULL AND lock_state <> 'UNLOCKED')),
      CONSTRAINT ck_document_revision_approval_pair CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
      CONSTRAINT ck_document_revision_approved_status CHECK (
        status NOT IN ('APPROVED','ISSUED','SUPERSEDED') OR approved_by IS NOT NULL),
      CONSTRAINT ck_document_revision_scan_signature CHECK (
        scan_status <> 'INFECTED' OR scan_signature IS NOT NULL),
      CONSTRAINT ck_document_revision_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_document_revision_status
      ON document_revisions (tenant_id, document_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_document_revision_scan
      ON document_revisions (tenant_id, scan_status)`);
    await queryRunner.query(`CREATE INDEX idx_document_revision_hash
      ON document_revisions (tenant_id, content_hash)`);

    // Added only now that `document_revisions` exists; the register and the revision table point at
    // each other, so one of the two directions has to be deferred to the end of the create.
    await queryRunner.query(`ALTER TABLE documents
      ADD CONSTRAINT fk_document_current_revision FOREIGN KEY (tenant_id, current_revision_id)
      REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT`);

    await queryRunner.query(`CREATE TABLE document_review_comments (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      cycle_no integer NOT NULL,
      author_id uuid NOT NULL,
      location varchar(200),
      severity varchar(20) NOT NULL,
      body varchar(4000) NOT NULL,
      disposition varchar(20) NOT NULL,
      disposition_note varchar(2000),
      correlation_id varchar(100) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_document_review_comments PRIMARY KEY (id),
      CONSTRAINT uq_document_review_comments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_document_review_comment_sequence UNIQUE (tenant_id, revision_id, sequence_no),
      CONSTRAINT fk_document_review_comment_revision FOREIGN KEY (tenant_id, revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_review_comment_author FOREIGN KEY (tenant_id, author_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_document_review_comment_cycle CHECK (cycle_no >= 1),
      CONSTRAINT ck_document_review_comment_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_document_review_comment_severity CHECK
        (severity IN ('INFO','MINOR','MAJOR','CRITICAL')),
      CONSTRAINT ck_document_review_comment_disposition CHECK
        (disposition IN ('OPEN','ACCEPTED','REJECTED','CLOSED')),
      CONSTRAINT ck_document_review_comment_body CHECK (length(trim(body)) >= 3)
    )`);
    await queryRunner.query(`CREATE INDEX idx_document_review_comment_cycle
      ON document_review_comments (tenant_id, revision_id, cycle_no)`);

    await queryRunner.query(`CREATE TABLE transmittals (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      number varchar(80) NOT NULL,
      sender_party_id uuid,
      recipient_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
      purpose varchar(400) NOT NULL,
      due_date date,
      status varchar(20) NOT NULL,
      issued_by uuid,
      issued_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_transmittals PRIMARY KEY (id),
      CONSTRAINT uq_transmittals_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_transmittals_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_transmittal_number UNIQUE (tenant_id, project_id, number),
      CONSTRAINT fk_transmittal_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_transmittal_sender_party FOREIGN KEY (tenant_id, sender_party_id)
        REFERENCES project_parties (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_transmittal_issuer FOREIGN KEY (tenant_id, issued_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_transmittal_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_transmittal_number CHECK (number ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_transmittal_status CHECK (status IN ('DRAFT','ISSUED','CLOSED')),
      CONSTRAINT ck_transmittal_recipients_array CHECK (jsonb_typeof(recipient_snapshot) = 'array'),
      CONSTRAINT ck_transmittal_issue_pair CHECK ((issued_by IS NULL) = (issued_at IS NULL)),
      CONSTRAINT ck_transmittal_issued_has_recipients CHECK (
        status = 'DRAFT'
        OR (issued_by IS NOT NULL AND jsonb_array_length(recipient_snapshot) >= 1)),
      CONSTRAINT ck_transmittal_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE INDEX idx_transmittal_status
      ON transmittals (tenant_id, project_id, status, due_date)`);

    await queryRunner.query(`CREATE TABLE transmittal_items (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      transmittal_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      action_code varchar(40) NOT NULL,
      response_code varchar(40),
      response_due date,
      response_status varchar(20) NOT NULL,
      response_note varchar(2000),
      responded_by uuid,
      responded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_transmittal_items PRIMARY KEY (id),
      CONSTRAINT uq_transmittal_items_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_transmittal_item_revision UNIQUE (tenant_id, transmittal_id, revision_id),
      CONSTRAINT fk_transmittal_item_transmittal FOREIGN KEY (tenant_id, transmittal_id)
        REFERENCES transmittals (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_transmittal_item_revision FOREIGN KEY (tenant_id, revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_transmittal_item_responder FOREIGN KEY (tenant_id, responded_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_transmittal_item_response_status CHECK
        (response_status IN ('PENDING','RESPONDED','OVERDUE')),
      CONSTRAINT ck_transmittal_item_response_pair CHECK
        ((responded_by IS NULL) = (responded_at IS NULL)),
      CONSTRAINT ck_transmittal_item_responded CHECK (
        response_status <> 'RESPONDED'
        OR (responded_by IS NOT NULL AND response_code IS NOT NULL))
    )`);
    await queryRunner.query(`CREATE INDEX idx_transmittal_item_response
      ON transmittal_items (tenant_id, transmittal_id, response_status)`);

    await queryRunner.query(`CREATE TABLE signature_envelopes (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      provider varchar(80) NOT NULL,
      external_id varchar(200),
      signer_snapshot jsonb NOT NULL,
      artifact_hash varchar(64) NOT NULL,
      status varchar(20) NOT NULL,
      completion_hash varchar(64),
      completed_at timestamptz,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_signature_envelopes PRIMARY KEY (id),
      CONSTRAINT uq_signature_envelopes_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_signature_envelope_revision FOREIGN KEY (tenant_id, revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_signature_envelope_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_signature_envelope_status CHECK
        (status IN ('DRAFT','SENT','COMPLETED','DECLINED','VOIDED')),
      CONSTRAINT ck_signature_envelope_signers_array CHECK (jsonb_typeof(signer_snapshot) = 'array'),
      CONSTRAINT ck_signature_envelope_signers_present CHECK (jsonb_array_length(signer_snapshot) >= 1),
      CONSTRAINT ck_signature_envelope_hash_format CHECK (artifact_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_signature_envelope_completion_pair CHECK
        ((completed_at IS NULL) = (completion_hash IS NULL)),
      CONSTRAINT ck_signature_envelope_external CHECK (status = 'DRAFT' OR external_id IS NOT NULL)
    )`);
    await queryRunner.query(`CREATE INDEX idx_signature_envelope_revision
      ON signature_envelopes (tenant_id, revision_id, status)`);

    await queryRunner.query(`CREATE TABLE document_external_shares (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      token_hash varchar(64) NOT NULL,
      recipient_snapshot jsonb NOT NULL,
      purpose varchar(400) NOT NULL,
      expires_at timestamptz NOT NULL,
      watermark_required boolean NOT NULL DEFAULT true,
      download_allowed boolean NOT NULL DEFAULT false,
      download_count integer NOT NULL DEFAULT 0,
      status varchar(20) NOT NULL,
      revoked_by uuid,
      revoked_at timestamptz,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_document_external_shares PRIMARY KEY (id),
      CONSTRAINT uq_document_external_shares_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_document_external_share_token UNIQUE (token_hash),
      CONSTRAINT fk_document_external_share_revision FOREIGN KEY (tenant_id, revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_external_share_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_document_external_share_revoked_by FOREIGN KEY (tenant_id, revoked_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_document_external_share_status CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
      CONSTRAINT ck_document_external_share_token_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_document_external_share_recipients_array CHECK
        (jsonb_typeof(recipient_snapshot) = 'array'),
      CONSTRAINT ck_document_external_share_recipients_present CHECK
        (jsonb_array_length(recipient_snapshot) >= 1),
      CONSTRAINT ck_document_external_share_expiry CHECK (expires_at > created_at),
      CONSTRAINT ck_document_external_share_revoke_pair CHECK
        ((revoked_by IS NULL) = (revoked_at IS NULL)),
      CONSTRAINT ck_document_external_share_revoked_status CHECK
        (status <> 'REVOKED' OR revoked_by IS NOT NULL),
      CONSTRAINT ck_document_external_share_download_count CHECK (download_count >= 0)
    )`);
    await queryRunner.query(`CREATE INDEX idx_document_external_share_revision
      ON document_external_shares (tenant_id, revision_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_document_external_share_expiry
      ON document_external_shares (tenant_id, expires_at)`);

    // AC-020/SEC-118: review history is append-only. A correction adds a row; it never rewrites the
    // comment somebody reviewed against.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION reject_document_review_comment_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'document_review_comments is append-only; update and delete are not permitted';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_document_review_comment_append_only
      BEFORE UPDATE OR DELETE ON document_review_comments
      FOR EACH ROW EXECUTE FUNCTION reject_document_review_comment_rewrite()`);

    // AC-019: once issued, the bytes and the identity of a revision are frozen — a new revision is
    // the only way forward. The ISSUED → SUPERSEDED transition stays legal because `status` is not
    // one of the guarded columns.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION reject_issued_document_revision_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.status = 'ISSUED' AND (
        NEW.content_hash IS DISTINCT FROM OLD.content_hash
        OR NEW.released_object_key IS DISTINCT FROM OLD.released_object_key
        OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
        OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
        OR NEW.revision_code IS DISTINCT FROM OLD.revision_code
        OR NEW.working_version IS DISTINCT FROM OLD.working_version
        OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
        OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'issued document revision content is immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_document_revision_issued_immutable
      BEFORE UPDATE ON document_revisions
      FOR EACH ROW EXECUTE FUNCTION reject_issued_document_revision_rewrite()`);

    // AC-092: a completed envelope is signature evidence, so neither an edit nor a delete may
    // remove it.
    await queryRunner.query(`CREATE OR REPLACE FUNCTION reject_completed_signature_envelope_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'COMPLETED' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'completed signature envelopes cannot be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'COMPLETED' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'completed signature envelopes are immutable';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_signature_envelope_completed_immutable
      BEFORE UPDATE OR DELETE ON signature_envelopes
      FOR EACH ROW EXECUTE FUNCTION reject_completed_signature_envelope_rewrite()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_signature_envelope_completed_immutable
      ON signature_envelopes`);
    await queryRunner.query('DROP FUNCTION IF EXISTS reject_completed_signature_envelope_rewrite()');
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_document_revision_issued_immutable
      ON document_revisions`);
    await queryRunner.query('DROP FUNCTION IF EXISTS reject_issued_document_revision_rewrite()');
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_document_review_comment_append_only
      ON document_review_comments`);
    await queryRunner.query('DROP FUNCTION IF EXISTS reject_document_review_comment_rewrite()');

    await queryRunner.query('DROP TABLE IF EXISTS document_external_shares');
    await queryRunner.query('DROP TABLE IF EXISTS signature_envelopes');
    await queryRunner.query('DROP TABLE IF EXISTS transmittal_items');
    await queryRunner.query('DROP TABLE IF EXISTS transmittals');
    await queryRunner.query('DROP TABLE IF EXISTS document_review_comments');
    // The register points at the revision table, so that direction has to go before the drop.
    await queryRunner.query(`ALTER TABLE documents
      DROP CONSTRAINT IF EXISTS fk_document_current_revision`);
    await queryRunner.query('DROP TABLE IF EXISTS document_revisions');
    await queryRunner.query('DROP TABLE IF EXISTS documents');
  }
}
