import {
  ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Brackets, In, Repository, type EntityManager, type SelectQueryBuilder } from 'typeorm';
import {
  AuditEventEntity, DocumentEntity, DocumentExternalShareEntity, DocumentLockState,
  DocumentRecordStatus, DocumentReviewCommentEntity, DocumentRevisionEntity,
  DocumentRevisionStatus, DocumentScanStatus, ExternalShareStatus, PackageEntity,
  ProjectEntity, ProjectPartyEntity, ReviewCommentDisposition, SignatureEnvelopeEntity,
  SignatureEnvelopeStatus, TransmittalEntity, TransmittalItemEntity,
  TransmittalResponseStatus, TransmittalStatus, UserAccountEntity,
  type DocumentClassification, type DocumentRecipientSnapshot, type SignerSnapshotRecord
} from '../../database/entities';
import type { AuthContext } from '../identity-access/auth.types';
import type { AccessScopeSets } from '../identity-access/permission.service';
import { PermissionService } from '../identity-access/permission.service';
import { CommandReceiptService } from '../operational-foundation/command-receipt.service';
import { OutboxService } from '../operational-foundation/outbox.service';
import { decodeDocumentCursor, encodeDocumentCursor } from './domain/cursor';
import type {
  ApproveRevisionDto, CreateDocumentDto, CreateExternalShareDto, CreateReviewCommentDto,
  CreateUploadSessionDto, DocumentDetailQueryDto, DocumentListQueryDto,
  FinalizeUploadSessionDto, IssueRevisionDto,
  IssueTransmittalDto, RecipientDto, RecordTransmittalResponseDto, StartSignatureEnvelopeDto,
  SubmitRevisionReviewDto
} from './dto/document-control.dto';
import { MALWARE_SCANNER, type MalwareScanner } from './malware-scanner.port';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.port';

export interface RequestContext extends AuthContext { correlationId: string }

/** A revision always answers to the register row that owns it, which is where its package lives. */
interface RevisionContext {
  revision: DocumentRevisionEntity;
  document: DocumentEntity;
}

/**
 * The revision facts the register table actually renders. Deliberately not a whole revision: content
 * hashes, object-key flags, signatures and scanner versions belong to API-041/API-044, not to a list.
 */
export interface RegisterRevisionSummary {
  id: string;
  revisionCode: string;
  workingVersion: number;
  status: DocumentRevisionStatus;
  scanStatus: DocumentScanStatus;
}

/** One raw row of the API-039 page: the register columns plus the two embedded summaries. */
interface DocumentRegisterRecord {
  id: string;
  projectId: string;
  packageId: string | null;
  documentCode: string;
  title: string;
  discipline: string;
  type: string;
  classification: DocumentClassification;
  ownerId: string;
  currentRevisionId: string | null;
  legalHold: boolean;
  status: DocumentRecordStatus;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  currentRevision: RegisterRevisionSummary | null;
  latestRevision: RegisterRevisionSummary | null;
}

/** Aliased in camelCase so `to_jsonb` emits the wire shape without a second mapping step. */
const REGISTER_REVISION_COLUMNS = `revision.id AS "id",
         revision.revision_code AS "revisionCode",
         revision.working_version AS "workingVersion",
         revision.status AS "status",
         revision.scan_status AS "scanStatus"`;

/**
 * API-039 in one pass.
 *
 * Both laterals are keyed on `tenant_id` as well as the record id. The composite `tenant_id` foreign
 * keys exist to make cross-tenant reachability impossible, and a join is exactly where that guarantee
 * would otherwise be lost. `LIMIT 1` on the second lateral keeps the row count equal to the number of
 * documents, so the keyset page size stays exact.
 */
const REGISTER_PAGE_SQL = `SELECT
    document.id AS "id",
    document.project_id AS "projectId",
    document.package_id AS "packageId",
    document.document_code AS "documentCode",
    document.title AS "title",
    document.discipline AS "discipline",
    document.type AS "type",
    document.classification AS "classification",
    document.owner_id AS "ownerId",
    document.current_revision_id AS "currentRevisionId",
    document.legal_hold AS "legalHold",
    document.status AS "status",
    document.version_no AS "versionNo",
    document.created_by AS "createdBy",
    document.updated_by AS "updatedBy",
    document.created_at AS "createdAt",
    document.updated_at AS "updatedAt",
    to_jsonb(current_revision) AS "currentRevision",
    to_jsonb(latest_revision) AS "latestRevision"
  FROM documents document
  LEFT JOIN LATERAL (
    SELECT ${REGISTER_REVISION_COLUMNS}
    FROM document_revisions revision
    WHERE revision.tenant_id = document.tenant_id
      AND revision.id = document.current_revision_id
  ) current_revision ON TRUE
  LEFT JOIN LATERAL (
    SELECT ${REGISTER_REVISION_COLUMNS}
    FROM document_revisions revision
    WHERE revision.tenant_id = document.tenant_id
      AND revision.document_id = document.id
    ORDER BY revision.created_at DESC, revision.id DESC
    LIMIT 1
  ) latest_revision ON TRUE`;

/** ClamAV reports a signature on every detection; the fallback only guards the NOT NULL check. */
const UNNAMED_SIGNATURE = 'UNNAMED_DETECTION';

/**
 * US-005/US-019 document control (API-039…API-052).
 *
 * The rule the whole module is built around: bytes land in a quarantine bucket, the server — never
 * the client — computes their hash, and nothing reaches the release bucket or an APPROVED/ISSUED
 * status until a scanner has said CLEAN. A scanner outage holds the revision; it never releases it.
 *
 * Out of scope here and deliberately not stubbed: full-text/OCR search (AC-021), watermarked
 * download/preview rendering and external-link redemption (no endpoint exists in the operation
 * catalog), and e-signature provider callbacks (no provider is contracted).
 */
@Injectable()
export class DocumentControlService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(DocumentRevisionEntity)
    private readonly revisions: Repository<DocumentRevisionEntity>,
    private readonly permissions: PermissionService,
    private readonly commands: CommandReceiptService,
    private readonly outbox: OutboxService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner
  ) {}

  /**
   * API-039 — the project document register.
   *
   * The list embeds the revision summaries the register renders, in the same statement that pages the
   * documents. Fetching them per row was a real N+1: a 50-row page cost 50 further authorised reads.
   *
   * `latestRevision` is the half that matters most. `current_revision_id` is only written when a
   * revision reaches ISSUED, so a document whose uploads are still DRAFT — or came back INFECTED —
   * has no pointer at all, and a register built on `currentRevision` alone would show an operator
   * nothing wrong. The newest revision by `(created_at, id)` is what makes that upload visible.
   */
  async listDocuments(
    context: RequestContext, projectId: string, query: DocumentListQueryDto
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'document.read');
    await this.assertProjectVisible(this.documents.manager, context, projectId, scope);
    const cursor = decodeDocumentCursor(query.cursor);
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => `$${parameters.push(value)}`;
    const predicates = [
      `document.tenant_id = ${bind(context.tenantId)}::uuid`,
      `document.project_id = ${bind(projectId)}::uuid`,
      this.scopePredicate(scope, projectId, bind)
    ];
    if (query.type) predicates.push(`document.type = ${bind(query.type)}`);
    if (query.discipline) predicates.push(`document.discipline = ${bind(query.discipline)}`);
    if (query.classification) {
      predicates.push(`document.classification = ${bind(query.classification)}`);
    }
    if (query.packageId) predicates.push(`document.package_id = ${bind(query.packageId)}::uuid`);
    if (cursor) {
      const at = `${bind(cursor.createdAt)}::timestamptz`;
      const id = `${bind(cursor.id)}::uuid`;
      predicates.push(
        `(document.created_at < ${at} OR (document.created_at = ${at} AND document.id < ${id}))`
      );
    }
    const rows: DocumentRegisterRecord[] = await this.documents.manager.query(
      `${REGISTER_PAGE_SQL}
  WHERE ${predicates.join('\n    AND ')}
  ORDER BY document.created_at DESC, document.id DESC
  LIMIT ${bind(query.limit + 1)}`,
      parameters
    );
    const page = rows.slice(0, query.limit);
    return {
      items: page.map((row) => this.registerRowView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /** API-040 — register a logical document; its bytes arrive later as revisions. */
  async createDocument(
    context: RequestContext, projectId: string, input: CreateDocumentDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'document.create');
    return this.commands.execute({
      context, operation: 'API-040:create-document', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'Document',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Document', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const packageId = input.packageId ?? null;
        await this.assertProjectVisible(manager, context, projectId, scope);
        this.assertProjectScope(scope, projectId, packageId);
        await this.assertPackageBelongsToProject(manager, context, projectId, packageId);
        const ownerId = input.ownerId ?? context.userId;
        await this.assertTenantUser(manager, context, ownerId);

        const row = manager.getRepository(DocumentEntity).create({
          id: randomUUID(), tenantId: context.tenantId, projectId, packageId,
          documentCode: input.documentCode, title: input.title, discipline: input.discipline,
          type: input.type, classification: input.classification, ownerId,
          currentRevisionId: null, legalHold: false, status: DocumentRecordStatus.ACTIVE,
          createdBy: context.userId, updatedBy: context.userId
        });
        const saved = await this.rethrowUnique(
          () => manager.getRepository(DocumentEntity).save(row),
          'DOCUMENT_CODE_TAKEN', 'Mã tài liệu đã tồn tại trong dự án'
        );
        await this.emit(manager, context, 'Document', saved.id, saved.versionNo,
          'Document.Created', {
            projectId, packageId, documentCode: saved.documentCode,
            classification: saved.classification,
            summary: `Document ${saved.documentCode} created`
          });
        return this.documentView(saved);
      }
    });
  }

  /** API-041 — register entry, the current-for-use revision and the revision history. */
  async getDocument(context: RequestContext, documentId: string, query: DocumentDetailQueryDto) {
    const scope = await this.permissions.accessScopeSets(context, 'document.read');
    const document = await this.documents.findOneBy({ id: documentId, tenantId: context.tenantId });
    if (!document || !this.inScope(document.projectId, document.packageId, scope)) {
      throw this.notFound('DOCUMENT_NOT_FOUND', 'Không tìm thấy tài liệu');
    }
    const cursor = decodeDocumentCursor(query.cursor);
    const builder = this.revisions.createQueryBuilder('revision')
      .where('revision.tenantId = :tenantId AND revision.documentId = :documentId', {
        tenantId: context.tenantId, documentId: document.id
      });
    if (cursor) this.applyCursor(builder, 'revision', cursor);
    const rows = await builder
      .orderBy('revision.createdAt', 'DESC').addOrderBy('revision.id', 'DESC')
      .take(query.limit + 1).getMany();
    const page = rows.slice(0, query.limit);
    const current = document.currentRevisionId === null ? null : await this.revisions.findOneBy({
      id: document.currentRevisionId, tenantId: context.tenantId
    });
    return {
      data: this.documentView(document),
      currentRevision: current === null ? null : this.revisionView(current),
      revisions: page.map((row) => this.revisionView(row)),
      meta: this.pageMeta(rows, page, query.limit)
    };
  }

  /**
   * API-042 — open an upload session (AC-018/SEC-121).
   *
   * The session *is* the revision: the bytes get a row that owns them the moment they land, so there
   * is no upload-session table that can drift away from what is actually in the bucket. The row is
   * created without a content hash on purpose — only API-043 may write one, and only after hashing
   * the bytes the server itself read back out of quarantine.
   */
  async createUploadSession(
    context: RequestContext, documentId: string,
    input: CreateUploadSessionDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentRevision.upload');
    return this.commands.execute({
      context, operation: 'API-042:create-upload-session', idempotencyKey,
      request: { documentId, input }, responseStatus: 201, resourceType: 'DocumentRevision',
      resultReference: (result: { id: string }) => ({
        resourceType: 'DocumentRevision', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const document = await manager.getRepository(DocumentEntity).findOneBy({
          id: documentId, tenantId: context.tenantId
        });
        if (!document || !this.inScope(document.projectId, document.packageId, scope)) {
          throw this.notFound('DOCUMENT_NOT_FOUND', 'Không tìm thấy tài liệu');
        }
        if (document.status !== DocumentRecordStatus.ACTIVE) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ tài liệu ACTIVE mới nhận revision mới'
          );
        }

        const body = Buffer.from(input.content, 'base64');
        if (body.length === 0) {
          throw this.unprocessable('EMPTY_UPLOAD', 'Nội dung tải lên rỗng');
        }
        const workingVersion = await manager.getRepository(DocumentRevisionEntity).countBy({
          tenantId: context.tenantId, documentId: document.id, revisionCode: input.revisionCode
        }) + 1;

        const revisionId = randomUUID();
        const objectKey = this.objectKey(context.tenantId, document.id, revisionId);
        await this.storage.put(
          { bucket: this.storage.quarantineBucket(), objectKey }, body, input.mimeType
        );

        const row = manager.getRepository(DocumentRevisionEntity).create({
          id: revisionId, tenantId: context.tenantId, documentId: document.id,
          projectId: document.projectId, revisionCode: input.revisionCode, workingVersion,
          status: DocumentRevisionStatus.DRAFT, purpose: input.purpose,
          fileName: input.fileName, mimeType: input.mimeType,
          quarantineObjectKey: objectKey, releasedObjectKey: null,
          // No hash and no size until the server has read the bytes back and scanned them.
          contentHash: null, sizeBytes: null,
          scanStatus: DocumentScanStatus.QUARANTINED, scanSignature: null,
          scannedAt: null, scannerVersion: null, lockState: DocumentLockState.UNLOCKED,
          reviewCycleNo: 0, approvedBy: null, approvedAt: null, issuedBy: null, issuedAt: null,
          uploadedBy: context.userId
        });
        const saved = await this.rethrowUnique(
          () => manager.getRepository(DocumentRevisionEntity).save(row),
          'REVISION_CODE_TAKEN', 'Revision code và working version đã tồn tại'
        );
        await this.emit(manager, context, 'DocumentRevision', saved.id, saved.versionNo,
          'DocumentRevision.UploadSessionOpened', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, revisionCode: saved.revisionCode,
            scanStatus: saved.scanStatus,
            summary: `Upload session opened for ${document.documentCode}`
          });
        return { ...this.revisionView(saved), uploadSessionId: saved.id };
      }
    });
  }

  /**
   * API-043 — hash, scan and release (AC-018/SEC-121).
   *
   * The verdict is decided by the scanner, not by the caller: CLEAN promotes the object into the
   * release bucket, INFECTED destroys the quarantined bytes, and UNAVAILABLE keeps them quarantined
   * and answers 503. There is no path where an unscanned or unreachable-scanner upload is treated
   * as clean.
   */
  async finalizeUploadSession(
    context: RequestContext, uploadSessionId: string,
    input: FinalizeUploadSessionDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentRevision.upload');
    const result = await this.commands.execute({
      context, operation: 'API-043:finalize-upload-session', idempotencyKey,
      request: { uploadSessionId, input }, responseStatus: 200,
      resourceType: 'DocumentRevision', resourceId: uploadSessionId,
      execute: async (manager) => {
        const { revision, document } = await this.lockRevision(
          manager, context, uploadSessionId, scope
        );
        if (
          revision.status !== DocumentRevisionStatus.DRAFT
          || (revision.scanStatus !== DocumentScanStatus.QUARANTINED
            && revision.scanStatus !== DocumentScanStatus.UNAVAILABLE)
          || revision.quarantineObjectKey === null
        ) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Upload session không còn ở trạng thái chờ quét'
          );
        }

        const quarantine = {
          bucket: this.storage.quarantineBucket(), objectKey: revision.quarantineObjectKey
        };
        const body = await this.storage.get(quarantine);
        // SEC-120: the hash of record is computed here, over the bytes the server stored.
        const contentHash = createHash('sha256').update(body).digest('hex');
        if (input.contentHash && input.contentHash !== contentHash) {
          throw this.unprocessable(
            'CONTENT_HASH_MISMATCH', 'Hash do client khai báo không khớp với nội dung đã lưu'
          );
        }

        const scan = await this.scanner.scan(body);
        const patch = {
          scannedAt: scan.scannedAt, scannerVersion: scan.scannerVersion,
          versionNo: revision.versionNo + 1
        };
        if (scan.verdict === 'CLEAN') {
          const released = { bucket: this.storage.releaseBucket(), objectKey: quarantine.objectKey };
          await this.storage.promote(quarantine, released);
          // The quarantine copy is destroyed once the release copy exists, so the released bytes
          // live in exactly one place. An adapter whose `promote` already moved the object sees an
          // idempotent no-op here.
          await this.storage.remove(quarantine);
          await manager.getRepository(DocumentRevisionEntity).update(
            { id: revision.id, tenantId: context.tenantId },
            {
              ...patch, scanStatus: DocumentScanStatus.CLEAN, scanSignature: null,
              quarantineObjectKey: null, releasedObjectKey: released.objectKey,
              contentHash, sizeBytes: body.length
            }
          );
        } else if (scan.verdict === 'INFECTED') {
          await this.storage.remove(quarantine);
          await manager.getRepository(DocumentRevisionEntity).update(
            { id: revision.id, tenantId: context.tenantId },
            {
              ...patch, scanStatus: DocumentScanStatus.INFECTED,
              scanSignature: scan.signature ?? UNNAMED_SIGNATURE,
              quarantineObjectKey: null
            }
          );
        } else {
          // Outage: keep the bytes quarantined and keep the revision unreleasable.
          await manager.getRepository(DocumentRevisionEntity).update(
            { id: revision.id, tenantId: context.tenantId },
            {
              ...patch, scanStatus: DocumentScanStatus.UNAVAILABLE,
              scanSignature: scan.signature
            }
          );
        }

        const updated = await manager.getRepository(DocumentRevisionEntity)
          .findOneByOrFail({ id: revision.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'DocumentRevision', updated.id, updated.versionNo,
          `DocumentRevision.Scan${this.titleCase(scan.verdict)}`, {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, scanStatus: updated.scanStatus,
            summary: `Revision scan verdict ${scan.verdict}`
          });
        return { ...this.revisionView(updated), scanVerdict: scan.verdict };
      }
    });
    if (result.scanVerdict === 'UNAVAILABLE') {
      // Reported after the transaction so the UNAVAILABLE verdict is durable; a retry needs a new
      // Idempotency-Key, which is what re-runs the scan.
      throw new ServiceUnavailableException({
        code: 'SCANNER_UNAVAILABLE',
        message: 'Không liên hệ được trình quét mã độc; tệp vẫn bị giữ trong quarantine',
        retryable: true
      });
    }
    return result;
  }

  /** API-044 — revision metadata, scan state and hash. */
  async getRevision(context: RequestContext, revisionId: string) {
    const scope = await this.permissions.accessScopeSets(context, 'documentRevision.read');
    const { revision, document } = await this.loadRevision(
      this.revisions.manager, context, revisionId, scope
    );
    return { data: this.revisionView(revision), document: this.documentView(document) };
  }

  /** API-045 — open a review cycle. */
  async submitRevisionReview(
    context: RequestContext, revisionId: string,
    input: SubmitRevisionReviewDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentRevision.submitReview');
    return this.commands.execute({
      context, operation: 'API-045:submit-revision-review', idempotencyKey,
      request: { revisionId, input }, responseStatus: 200,
      resourceType: 'DocumentRevision', resourceId: revisionId,
      execute: async (manager) => {
        const { revision, document } = await this.lockRevision(manager, context, revisionId, scope);
        if (
          revision.status !== DocumentRevisionStatus.DRAFT
          && revision.status !== DocumentRevisionStatus.REJECTED
        ) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ revision DRAFT hoặc REJECTED mới được trình duyệt'
          );
        }
        this.assertVersion(revision, input.expectedVersion);
        this.assertScanned(revision);

        await manager.getRepository(DocumentRevisionEntity).update(
          { id: revision.id, tenantId: context.tenantId },
          {
            status: DocumentRevisionStatus.IN_REVIEW,
            reviewCycleNo: revision.reviewCycleNo + 1,
            versionNo: revision.versionNo + 1
          }
        );
        const updated = await manager.getRepository(DocumentRevisionEntity)
          .findOneByOrFail({ id: revision.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'DocumentRevision', updated.id, updated.versionNo,
          'DocumentRevision.ReviewSubmitted', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, cycleNo: updated.reviewCycleNo, note: input.note,
            summary: `Revision submitted for review cycle ${updated.reviewCycleNo}`
          });
        return this.revisionView(updated);
      }
    });
  }

  /** API-046 — append a review comment; the history is never rewritten. */
  async createReviewComment(
    context: RequestContext, revisionId: string,
    input: CreateReviewCommentDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentComment.create');
    return this.commands.execute({
      context, operation: 'API-046:create-review-comment', idempotencyKey,
      request: { revisionId, input }, responseStatus: 201,
      resourceType: 'DocumentReviewComment',
      resultReference: (result: { id: string }) => ({
        resourceType: 'DocumentReviewComment', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const { revision, document } = await this.lockRevision(manager, context, revisionId, scope);
        if (revision.status !== DocumentRevisionStatus.IN_REVIEW) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ revision đang IN_REVIEW mới nhận ý kiến review'
          );
        }
        const comments = manager.getRepository(DocumentReviewCommentEntity);
        const sequenceNo = await comments.countBy({
          tenantId: context.tenantId, revisionId: revision.id
        }) + 1;
        const id = randomUUID();
        await this.rethrowUnique(
          () => comments.insert({
            id, tenantId: context.tenantId, revisionId: revision.id, sequenceNo,
            cycleNo: revision.reviewCycleNo, authorId: context.userId,
            location: input.location ?? null, severity: input.severity, body: input.body,
            disposition: ReviewCommentDisposition.OPEN, dispositionNote: null,
            correlationId: context.correlationId
          }),
          'REVIEW_COMMENT_SEQUENCE_TAKEN', 'Ý kiến review khác đã dùng số thứ tự này'
        );
        const saved = await comments.findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'DocumentRevision', revision.id, revision.versionNo,
          'DocumentRevision.ReviewCommented', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, commentId: saved.id, sequenceNo,
            cycleNo: saved.cycleNo, severity: saved.severity,
            summary: `Review comment ${sequenceNo} recorded`
          });
        return this.commentView(saved);
      }
    });
  }

  /** API-047 — approve; AC-019 refuses anything the scanner has not cleared. */
  async approveRevision(
    context: RequestContext, revisionId: string,
    input: ApproveRevisionDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentRevision.approve');
    return this.commands.execute({
      context, operation: 'API-047:approve-revision', idempotencyKey,
      request: { revisionId, input }, responseStatus: 200,
      resourceType: 'DocumentRevision', resourceId: revisionId,
      execute: async (manager) => {
        const { revision, document } = await this.lockRevision(manager, context, revisionId, scope);
        if (revision.status !== DocumentRevisionStatus.IN_REVIEW) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ revision đang IN_REVIEW mới được phê duyệt'
          );
        }
        this.assertVersion(revision, input.expectedVersion);
        // Checked here so the caller gets a domain error instead of a raw constraint violation from
        // ck_document_revision_release_requires_clean.
        this.assertScanned(revision);

        await manager.getRepository(DocumentRevisionEntity).update(
          { id: revision.id, tenantId: context.tenantId },
          {
            status: DocumentRevisionStatus.APPROVED, approvedBy: context.userId,
            approvedAt: new Date(), versionNo: revision.versionNo + 1
          }
        );
        const updated = await manager.getRepository(DocumentRevisionEntity)
          .findOneByOrFail({ id: revision.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'DocumentRevision', updated.id, updated.versionNo,
          'DocumentRevision.Approved', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, comment: input.comment,
            summary: `Revision ${updated.revisionCode} approved`
          });
        return this.revisionView(updated);
      }
    });
  }

  /**
   * API-048 — issue (AC-019).
   *
   * Locking the new revision, superseding the outgoing one and moving the register pointer happen in
   * the one transaction, so a reader can never observe two current-for-use revisions.
   */
  async issueRevision(
    context: RequestContext, revisionId: string,
    input: IssueRevisionDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentRevision.issue');
    return this.commands.execute({
      context, operation: 'API-048:issue-revision', idempotencyKey,
      request: { revisionId, input }, responseStatus: 200,
      resourceType: 'DocumentRevision', resourceId: revisionId,
      execute: async (manager) => {
        const { revision, document } = await this.lockRevision(manager, context, revisionId, scope);
        if (revision.status !== DocumentRevisionStatus.APPROVED) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ revision APPROVED mới được phát hành'
          );
        }
        this.assertVersion(revision, input.expectedVersion);
        this.assertScanned(revision);

        const issuedAt = new Date();
        const repository = manager.getRepository(DocumentRevisionEntity);
        const previousId = document.currentRevisionId;
        if (previousId !== null && previousId !== revision.id) {
          const previous = await repository.findOneByOrFail({
            id: previousId, tenantId: context.tenantId
          });
          await repository.update(
            { id: previous.id, tenantId: context.tenantId },
            {
              status: DocumentRevisionStatus.SUPERSEDED,
              versionNo: previous.versionNo + 1
            }
          );
        }
        await repository.update(
          { id: revision.id, tenantId: context.tenantId },
          {
            status: DocumentRevisionStatus.ISSUED, lockState: DocumentLockState.LOCKED,
            issuedBy: context.userId, issuedAt, versionNo: revision.versionNo + 1
          }
        );
        await manager.getRepository(DocumentEntity).update(
          { id: document.id, tenantId: context.tenantId },
          { currentRevisionId: revision.id, updatedBy: context.userId, versionNo: document.versionNo + 1 }
        );

        const updated = await repository.findOneByOrFail({
          id: revision.id, tenantId: context.tenantId
        });
        await this.emit(manager, context, 'DocumentRevision', updated.id, updated.versionNo,
          'DocumentRevision.Issued', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, supersededRevisionId: previousId,
            contentHash: updated.contentHash, comment: input.comment,
            summary: `Revision ${updated.revisionCode} issued`
          });
        return { ...this.revisionView(updated), supersededRevisionId: previousId };
      }
    });
  }

  /** API-049 — issue a transmittal over already-issued revisions. */
  async issueTransmittal(
    context: RequestContext, projectId: string,
    input: IssueTransmittalDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'transmittal.issue');
    return this.commands.execute({
      context, operation: 'API-049:issue-transmittal', idempotencyKey,
      request: { projectId, input }, responseStatus: 201, resourceType: 'Transmittal',
      resultReference: (result: { id: string }) => ({
        resourceType: 'Transmittal', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        await this.assertProjectVisible(manager, context, projectId, scope);
        const revisionIds = input.items.map((item) => item.revisionId);
        if (new Set(revisionIds).size !== revisionIds.length) {
          throw this.unprocessable(
            'TRANSMITTAL_ITEM_DUPLICATED', 'Một revision chỉ được xuất hiện một lần trong transmittal'
          );
        }
        if (input.senderPartyId) {
          const senderExists = await manager.getRepository(ProjectPartyEntity).existsBy({
            id: input.senderPartyId, tenantId: context.tenantId, projectId
          });
          if (!senderExists) {
            throw this.unprocessable('SENDER_PARTY_NOT_FOUND', 'Bên gửi không thuộc dự án này');
          }
        }

        const transmittalId = randomUUID();
        const issuedAt = new Date();
        const transmittals = manager.getRepository(TransmittalEntity);
        const row = transmittals.create({
          id: transmittalId, tenantId: context.tenantId, projectId, number: input.number,
          senderPartyId: input.senderPartyId ?? null,
          recipientSnapshot: this.recipientSnapshot(input.recipients),
          purpose: input.purpose, dueDate: input.dueDate ?? null,
          status: TransmittalStatus.ISSUED, issuedBy: context.userId, issuedAt,
          createdBy: context.userId
        });
        const saved = await this.rethrowUnique(
          () => transmittals.save(row),
          'TRANSMITTAL_NUMBER_TAKEN', 'Số transmittal đã tồn tại trong dự án'
        );

        const items = manager.getRepository(TransmittalItemEntity);
        for (const item of input.items) {
          const { revision } = await this.loadRevision(manager, context, item.revisionId, scope);
          if (revision.projectId !== projectId) {
            throw this.notFound('DOCUMENT_REVISION_NOT_FOUND', 'Không tìm thấy revision');
          }
          if (revision.status !== DocumentRevisionStatus.ISSUED) {
            throw this.unprocessable(
              'REVISION_NOT_ISSUED', 'Chỉ revision đã ISSUED mới được phát hành qua transmittal'
            );
          }
          await items.insert({
            id: randomUUID(), tenantId: context.tenantId, transmittalId: saved.id,
            revisionId: revision.id, actionCode: item.actionCode, responseCode: null,
            responseDue: item.responseDue ?? null,
            responseStatus: TransmittalResponseStatus.PENDING, responseNote: null,
            respondedBy: null, respondedAt: null
          });
        }

        const stored = await items.findBy({ tenantId: context.tenantId, transmittalId: saved.id });
        await this.emit(manager, context, 'Transmittal', saved.id, saved.versionNo,
          'Transmittal.Issued', {
            projectId, number: saved.number, itemCount: stored.length,
            recipientCount: saved.recipientSnapshot.length,
            summary: `Transmittal ${saved.number} issued`
          });
        return {
          ...this.transmittalView(saved),
          items: stored.map((item) => this.transmittalItemView(item))
        };
      }
    });
  }

  /** API-050 — record the recipient response against one transmitted revision. */
  async recordTransmittalResponse(
    context: RequestContext, transmittalId: string,
    input: RecordTransmittalResponseDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'transmittal.respond');
    return this.commands.execute({
      context, operation: 'API-050:record-transmittal-response', idempotencyKey,
      request: { transmittalId, input }, responseStatus: 201, resourceType: 'TransmittalItem',
      resultReference: (result: { id: string }) => ({
        resourceType: 'TransmittalItem', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const transmittal = await manager.getRepository(TransmittalEntity).findOneBy({
          id: transmittalId, tenantId: context.tenantId
        });
        if (!transmittal || !this.inScope(transmittal.projectId, null, scope)) {
          throw this.notFound('TRANSMITTAL_NOT_FOUND', 'Không tìm thấy transmittal');
        }
        if (transmittal.status !== TransmittalStatus.ISSUED) {
          throw this.unprocessable(
            'INVALID_STATE_TRANSITION', 'Chỉ transmittal đã ISSUED mới nhận phản hồi'
          );
        }
        const items = manager.getRepository(TransmittalItemEntity);
        const item = await items.createQueryBuilder('item')
          .setLock('pessimistic_write')
          .where('item.tenantId = :tenantId AND item.transmittalId = :transmittalId', {
            tenantId: context.tenantId, transmittalId: transmittal.id
          })
          .andWhere('item.revisionId = :revisionId', { revisionId: input.revisionId })
          .getOne();
        if (!item) {
          throw this.notFound('TRANSMITTAL_ITEM_NOT_FOUND', 'Không tìm thấy mục transmittal');
        }
        if (item.responseStatus === TransmittalResponseStatus.RESPONDED) {
          throw new ConflictException({
            code: 'TRANSMITTAL_ALREADY_RESPONDED',
            message: 'Mục transmittal này đã được phản hồi', retryable: false
          });
        }

        await items.update(
          { id: item.id, tenantId: context.tenantId },
          {
            responseCode: input.responseCode, responseNote: input.responseNote ?? null,
            responseStatus: TransmittalResponseStatus.RESPONDED,
            respondedBy: context.userId, respondedAt: new Date()
          }
        );
        const updated = await items.findOneByOrFail({ id: item.id, tenantId: context.tenantId });
        await this.emit(manager, context, 'Transmittal', transmittal.id, transmittal.versionNo,
          'Transmittal.Responded', {
            projectId: transmittal.projectId, transmittalItemId: updated.id,
            revisionId: updated.revisionId, responseCode: updated.responseCode,
            summary: `Transmittal ${transmittal.number} response recorded`
          });
        return this.transmittalItemView(updated);
      }
    });
  }

  /**
   * API-051 — controlled external share (AC-089/AC-090).
   *
   * The plaintext token is returned exactly once and only its SHA-256 is stored, so a database leak
   * yields no usable link. Redemption itself has no endpoint in the operation catalog and is
   * therefore not implemented here.
   */
  async createExternalShare(
    context: RequestContext, revisionId: string,
    input: CreateExternalShareDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentShare.create');
    return this.commands.execute({
      context, operation: 'API-051:create-external-share', idempotencyKey,
      request: { revisionId, input }, responseStatus: 201,
      resourceType: 'DocumentExternalShare',
      resultReference: (result: { id: string }) => ({
        resourceType: 'DocumentExternalShare', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const { revision, document } = await this.loadRevision(manager, context, revisionId, scope);
        if (revision.status !== DocumentRevisionStatus.ISSUED) {
          throw this.unprocessable(
            'REVISION_NOT_ISSUED', 'Chỉ revision đã ISSUED mới được chia sẻ ra ngoài'
          );
        }
        const expiresAt = new Date(input.expiresAt);
        if (expiresAt.getTime() <= Date.now()) {
          throw this.unprocessable('SHARE_EXPIRY_INVALID', 'Thời điểm hết hạn phải ở tương lai');
        }

        const token = randomBytes(32).toString('base64url');
        const id = randomUUID();
        const shares = manager.getRepository(DocumentExternalShareEntity);
        await this.rethrowUnique(
          () => shares.insert({
            id, tenantId: context.tenantId, revisionId: revision.id,
            tokenHash: createHash('sha256').update(token).digest('hex'),
            recipientSnapshot: this.recipientSnapshot(input.recipients), purpose: input.purpose,
            expiresAt, watermarkRequired: input.watermarkRequired ?? true,
            downloadAllowed: input.downloadAllowed ?? false, downloadCount: 0,
            status: ExternalShareStatus.ACTIVE, revokedBy: null, revokedAt: null,
            createdBy: context.userId
          }),
          'SHARE_TOKEN_COLLISION', 'Không tạo được token chia sẻ; hãy thử lại'
        );
        const saved = await shares.findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'DocumentExternalShare', saved.id, 1,
          'DocumentExternalShare.Created', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, revisionId: revision.id,
            recipientCount: saved.recipientSnapshot.length,
            watermarkRequired: saved.watermarkRequired, downloadAllowed: saved.downloadAllowed,
            expiresAt: saved.expiresAt.toISOString(),
            summary: `External share created for revision ${revision.revisionCode}`
          });
        // The only time the plaintext token ever leaves this process.
        return { ...this.shareView(saved), token };
      }
    });
  }

  /**
   * API-052 — open a signature envelope (AC-092).
   *
   * No external provider is contacted: none is contracted, so the envelope is created locally in
   * DRAFT with the signer snapshot and the exact artifact hash being signed. `provider` records the
   * intent only, and `ck_signature_envelope_external` keeps an external id impossible until an
   * envelope legitimately leaves DRAFT.
   */
  async startSignatureEnvelope(
    context: RequestContext, revisionId: string,
    input: StartSignatureEnvelopeDto, idempotencyKey: string
  ) {
    const scope = await this.permissions.accessScopeSets(context, 'documentSignature.start');
    return this.commands.execute({
      context, operation: 'API-052:start-signature-envelope', idempotencyKey,
      request: { revisionId, input }, responseStatus: 201, resourceType: 'SignatureEnvelope',
      resultReference: (result: { id: string }) => ({
        resourceType: 'SignatureEnvelope', resourceId: result.id, responseStatus: 201
      }),
      execute: async (manager) => {
        const { revision, document } = await this.loadRevision(manager, context, revisionId, scope);
        this.assertScanned(revision);

        const id = randomUUID();
        const envelopes = manager.getRepository(SignatureEnvelopeEntity);
        await envelopes.insert({
          id, tenantId: context.tenantId, revisionId: revision.id, provider: input.provider,
          externalId: null, signerSnapshot: this.signerSnapshot(input.signers),
          artifactHash: revision.contentHash!, status: SignatureEnvelopeStatus.DRAFT,
          completionHash: null, completedAt: null, createdBy: context.userId
        });
        const saved = await envelopes.findOneByOrFail({ id, tenantId: context.tenantId });
        await this.emit(manager, context, 'SignatureEnvelope', saved.id, 1,
          'SignatureEnvelope.Created', {
            documentId: document.id, projectId: document.projectId,
            packageId: document.packageId, revisionId: revision.id,
            provider: saved.provider, signerCount: saved.signerSnapshot.length,
            artifactHash: saved.artifactHash,
            summary: `Signature envelope created for revision ${revision.revisionCode}`
          });
        return this.envelopeView(saved);
      }
    });
  }

  private async lockRevision(
    manager: EntityManager, context: RequestContext, revisionId: string, scope: AccessScopeSets
  ): Promise<RevisionContext> {
    const revision = await manager.getRepository(DocumentRevisionEntity)
      .createQueryBuilder('revision')
      .setLock('pessimistic_write')
      .where('revision.id = :id AND revision.tenantId = :tenantId', {
        id: revisionId, tenantId: context.tenantId
      })
      .getOne();
    return this.resolveRevision(manager, context, revision, scope);
  }

  private async loadRevision(
    manager: EntityManager, context: RequestContext, revisionId: string, scope: AccessScopeSets
  ): Promise<RevisionContext> {
    const revision = await manager.getRepository(DocumentRevisionEntity).findOneBy({
      id: revisionId, tenantId: context.tenantId
    });
    return this.resolveRevision(manager, context, revision, scope);
  }

  /**
   * Scope comes from the register row that owns the revision, never from the request. Out of scope
   * is indistinguishable from missing, so a revision id cannot be probed from another project.
   */
  private async resolveRevision(
    manager: EntityManager, context: RequestContext,
    revision: DocumentRevisionEntity | null, scope: AccessScopeSets
  ): Promise<RevisionContext> {
    if (!revision) {
      throw this.notFound('DOCUMENT_REVISION_NOT_FOUND', 'Không tìm thấy revision');
    }
    const document = await manager.getRepository(DocumentEntity).findOneBy({
      id: revision.documentId, tenantId: context.tenantId
    });
    if (!document || !this.inScope(document.projectId, document.packageId, scope)) {
      throw this.notFound('DOCUMENT_REVISION_NOT_FOUND', 'Không tìm thấy revision');
    }
    return { revision, document };
  }

  private assertVersion(revision: DocumentRevisionEntity, expectedVersion: number): void {
    if (revision.versionNo !== expectedVersion) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Resource đã thay đổi; hãy tải lại phiên bản mới nhất',
        retryable: false, currentVersion: revision.versionNo
      });
    }
  }

  /** AC-019: the scanner verdict, not the caller, decides whether a revision may move forward. */
  private assertScanned(revision: DocumentRevisionEntity): void {
    if (
      revision.scanStatus !== DocumentScanStatus.CLEAN
      || revision.contentHash === null
      || revision.releasedObjectKey === null
    ) {
      throw this.unprocessable(
        'REVISION_NOT_SCANNED', 'Revision chưa được quét sạch nên không thể sử dụng'
      );
    }
  }

  private assertProjectScope(
    scope: AccessScopeSets, projectId: string, packageId: string | null
  ): void {
    if (this.inScope(projectId, packageId, scope)) return;
    throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
  }

  /**
   * A project the caller cannot reach — including one that belongs to another tenant — answers 404,
   * so a project id cannot be probed through a collection route either.
   */
  private async assertProjectVisible(
    manager: EntityManager, context: RequestContext, projectId: string, scope: AccessScopeSets
  ): Promise<void> {
    const exists = await manager.getRepository(ProjectEntity).existsBy({
      id: projectId, tenantId: context.tenantId
    });
    if (!exists) throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return;
    if (scope.packageIds.length > 0 && await manager.getRepository(PackageEntity).existsBy({
      tenantId: context.tenantId, projectId, id: In(scope.packageIds)
    })) return;
    throw this.notFound('PROJECT_NOT_FOUND', 'Không tìm thấy dự án');
  }

  private async assertPackageBelongsToProject(
    manager: EntityManager, context: RequestContext, projectId: string, packageId: string | null
  ): Promise<void> {
    if (packageId === null) return;
    const exists = await manager.getRepository(PackageEntity).existsBy({
      id: packageId, tenantId: context.tenantId, projectId
    });
    if (!exists) {
      throw this.unprocessable('PACKAGE_NOT_FOUND', 'Gói thầu không thuộc dự án này');
    }
  }

  private async assertTenantUser(
    manager: EntityManager, context: RequestContext, userId: string
  ): Promise<void> {
    const exists = await manager.getRepository(UserAccountEntity).existsBy({
      id: userId, tenantId: context.tenantId
    });
    if (!exists) {
      throw this.unprocessable('OWNER_NOT_FOUND', 'Chủ sở hữu tài liệu không thuộc tenant này');
    }
  }

  private recipientSnapshot(recipients: RecipientDto[]): DocumentRecipientSnapshot[] {
    return recipients.map((recipient) => ({
      partyId: recipient.partyId ?? null, organisation: recipient.organisation,
      contactName: recipient.contactName, contactEmail: recipient.contactEmail
    }));
  }

  private signerSnapshot(signers: StartSignatureEnvelopeDto['signers']): SignerSnapshotRecord[] {
    return signers.map((signer) => ({
      name: signer.name, email: signer.email, order: signer.order, role: signer.role
    }));
  }

  private objectKey(tenantId: string, documentId: string, revisionId: string): string {
    // Built from identifiers only: a client-supplied file name never reaches the object key.
    return `${tenantId}/${documentId}/${revisionId}`;
  }

  /**
   * ABAC stays a SQL predicate. Dropping unauthorised rows after the keyset page was cut would return
   * short pages while authorised documents sit behind the cursor, so this is never a JS filter.
   */
  private scopePredicate(
    scope: AccessScopeSets, projectId: string, bind: (value: unknown) => string
  ): string {
    if (scope.tenantWide || scope.projectIds.includes(projectId)) return 'TRUE';
    if (scope.packageIds.length === 0) return 'FALSE';
    return `document.package_id = ANY(${bind(scope.packageIds)}::uuid[])`;
  }

  private applyCursor<T extends { createdAt: Date; id: string }>(
    builder: SelectQueryBuilder<T>, alias: string, cursor: { createdAt: string; id: string }
  ): void {
    builder.andWhere(new Brackets((where) => where
      .where(`${alias}.createdAt < :cursorTime`, { cursorTime: cursor.createdAt })
      .orWhere(`${alias}.createdAt = :cursorTime AND ${alias}.id < :cursorId`, {
        cursorTime: cursor.createdAt, cursorId: cursor.id
      })));
  }

  private pageMeta<T extends { createdAt: Date; id: string }>(
    rows: T[], page: T[], limit: number
  ) {
    const last = page.at(-1);
    return {
      limit,
      nextCursor: rows.length > limit && last
        ? encodeDocumentCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    };
  }

  private inScope(projectId: string, packageId: string | null, scope: AccessScopeSets): boolean {
    if (scope.tenantWide) return true;
    if (scope.projectIds.includes(projectId)) return true;
    return packageId !== null && scope.packageIds.includes(packageId);
  }

  private documentView(row: DocumentEntity) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      documentCode: row.documentCode, title: row.title, discipline: row.discipline,
      type: row.type, classification: row.classification, ownerId: row.ownerId,
      currentRevisionId: row.currentRevisionId, legalHold: row.legalHold, status: row.status,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  /**
   * A register row is a document view plus the two embedded summaries the table renders. The summary
   * objects arrive already shaped from `to_jsonb`, and are `null` when the lateral matched nothing.
   */
  private registerRowView(row: DocumentRegisterRecord) {
    return {
      id: row.id, projectId: row.projectId, packageId: row.packageId,
      documentCode: row.documentCode, title: row.title, discipline: row.discipline,
      type: row.type, classification: row.classification, ownerId: row.ownerId,
      currentRevisionId: row.currentRevisionId, legalHold: row.legalHold, status: row.status,
      versionNo: row.versionNo, createdBy: row.createdBy, updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      currentRevision: row.currentRevision, latestRevision: row.latestRevision
    };
  }

  private revisionView(row: DocumentRevisionEntity) {
    return {
      id: row.id, documentId: row.documentId, projectId: row.projectId,
      revisionCode: row.revisionCode, workingVersion: row.workingVersion, status: row.status,
      purpose: row.purpose, fileName: row.fileName, mimeType: row.mimeType,
      // Object keys are internal storage addresses and never leave the service boundary.
      hasQuarantinedObject: row.quarantineObjectKey !== null,
      hasReleasedObject: row.releasedObjectKey !== null,
      contentHash: row.contentHash, sizeBytes: row.sizeBytes, scanStatus: row.scanStatus,
      scanSignature: row.scanSignature,
      scannedAt: row.scannedAt === null ? null : row.scannedAt.toISOString(),
      scannerVersion: row.scannerVersion, lockState: row.lockState,
      reviewCycleNo: row.reviewCycleNo, approvedBy: row.approvedBy,
      approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
      issuedBy: row.issuedBy,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      uploadedBy: row.uploadedBy, versionNo: row.versionNo,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private commentView(row: DocumentReviewCommentEntity) {
    return {
      id: row.id, revisionId: row.revisionId, sequenceNo: row.sequenceNo, cycleNo: row.cycleNo,
      authorId: row.authorId, location: row.location, severity: row.severity, body: row.body,
      disposition: row.disposition, dispositionNote: row.dispositionNote,
      createdAt: row.createdAt.toISOString()
    };
  }

  private transmittalView(row: TransmittalEntity) {
    return {
      id: row.id, projectId: row.projectId, number: row.number,
      senderPartyId: row.senderPartyId, recipientSnapshot: row.recipientSnapshot,
      purpose: row.purpose, dueDate: row.dueDate, status: row.status,
      issuedBy: row.issuedBy,
      issuedAt: row.issuedAt === null ? null : row.issuedAt.toISOString(),
      versionNo: row.versionNo, createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
    };
  }

  private transmittalItemView(row: TransmittalItemEntity) {
    return {
      id: row.id, transmittalId: row.transmittalId, revisionId: row.revisionId,
      actionCode: row.actionCode, responseCode: row.responseCode, responseDue: row.responseDue,
      responseStatus: row.responseStatus, responseNote: row.responseNote,
      respondedBy: row.respondedBy,
      respondedAt: row.respondedAt === null ? null : row.respondedAt.toISOString(),
      createdAt: row.createdAt.toISOString()
    };
  }

  /** Never exposes `tokenHash`: the hash is the credential material, not a display field. */
  private shareView(row: DocumentExternalShareEntity) {
    return {
      id: row.id, revisionId: row.revisionId, recipientSnapshot: row.recipientSnapshot,
      purpose: row.purpose, expiresAt: row.expiresAt.toISOString(),
      watermarkRequired: row.watermarkRequired, downloadAllowed: row.downloadAllowed,
      downloadCount: row.downloadCount, status: row.status, revokedBy: row.revokedBy,
      revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
      createdBy: row.createdBy, createdAt: row.createdAt.toISOString()
    };
  }

  private envelopeView(row: SignatureEnvelopeEntity) {
    return {
      id: row.id, revisionId: row.revisionId, provider: row.provider, externalId: row.externalId,
      signerSnapshot: row.signerSnapshot, artifactHash: row.artifactHash, status: row.status,
      completionHash: row.completionHash,
      completedAt: row.completedAt === null ? null : row.completedAt.toISOString(),
      createdBy: row.createdBy, createdAt: row.createdAt.toISOString()
    };
  }

  private titleCase(verdict: string): string {
    return verdict.charAt(0) + verdict.slice(1).toLowerCase();
  }

  private async emit(
    manager: EntityManager, context: RequestContext, aggregateType: string,
    aggregateId: string, aggregateVersion: number, eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const safePayload = { ...payload, versionNo: aggregateVersion, effectiveActorId: context.userId };
    await manager.getRepository(AuditEventEntity).insert({
      id: randomUUID(), tenantId: context.tenantId, actorId: context.userId,
      action: eventType, result: 'SUCCEEDED', reasonCode: null,
      correlationId: context.correlationId, ipHash: null,
      objectType: aggregateType, objectId: aggregateId, payload: safePayload
    });
    await this.outbox.append(manager, context, {
      aggregateType, aggregateId, aggregateVersion, eventType,
      eventKey: createHash('sha256')
        .update(`${aggregateType}:${aggregateId}:${aggregateVersion}:${eventType}`)
        .digest('hex'),
      payload: safePayload
    });
  }

  private async rethrowUnique<T>(action: () => Promise<T>, code: string, message: string): Promise<T> {
    try {
      return await action();
    } catch (cause) {
      const candidate = cause as { code?: string; driverError?: { code?: string } };
      if ((candidate.code ?? candidate.driverError?.code) === '23505') {
        throw new ConflictException({ code, message, retryable: false });
      }
      throw cause;
    }
  }

  private notFound(code: string, message: string): NotFoundException {
    return new NotFoundException({ code, message, retryable: false });
  }

  private unprocessable(code: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code, message, retryable: false });
  }
}
