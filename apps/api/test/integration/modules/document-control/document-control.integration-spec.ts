import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssignmentScopeType, AuditEventEntity, CompanyEntity, DocumentClassification, DocumentEntity,
  DocumentExternalShareEntity, DocumentLockState, DocumentRecordStatus,
  DocumentReviewCommentEntity, DocumentRevisionEntity, DocumentRevisionStatus, DocumentScanStatus,
  LegalEntityEntity, LocalCredentialEntity, MasterRecordStatus, OrganizationType,
  PackageEntity, PackageStatus, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectType, RoleAssignmentEntity, RoleEntity, SignatureEnvelopeEntity,
  TenantEntity, TransactionalOutboxEventEntity, TransmittalEntity, TransmittalItemEntity,
  UserAccountEntity
} from 'src/database/entities';
import {
  MALWARE_SCANNER, type MalwareScanner, type ScanResult, type ScanVerdict
} from 'src/modules/document-control/malware-scanner.port';
import {
  OBJECT_STORAGE, type ObjectStorage, type PutResult, type StoredObjectRef
} from 'src/modules/document-control/object-storage.port';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const controllerId = randomUUID();
const uploaderId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const packageAId = randomUUID();
const packageBId = randomUUID();
const password = 'Document!Integration2026';

const fileBytes = Buffer.from('bản vẽ mặt bằng phiên bản A', 'utf8');
const fileContent = fileBytes.toString('base64');
const fileHash = createHash('sha256').update(fileBytes).digest('hex');

/** In-memory object storage: the tests must never depend on a running MinIO. */
class FakeObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, Buffer>();

  quarantineBucket(): string { return 'test-quarantine'; }
  releaseBucket(): string { return 'test-release'; }

  async put(ref: StoredObjectRef, body: Buffer, contentType: string): Promise<PutResult> {
    this.objects.set(this.key(ref), Buffer.from(body));
    return {
      ...ref, sha256: createHash('sha256').update(body).digest('hex'),
      sizeBytes: body.length, contentType
    };
  }

  async get(ref: StoredObjectRef): Promise<Buffer> {
    const body = this.objects.get(this.key(ref));
    if (!body) throw new Error(`missing object ${this.key(ref)}`);
    return body;
  }

  async promote(from: StoredObjectRef, to: StoredObjectRef): Promise<StoredObjectRef> {
    this.objects.set(this.key(to), await this.get(from));
    return to;
  }

  async remove(ref: StoredObjectRef): Promise<void> {
    this.objects.delete(this.key(ref));
  }

  async exists(ref: StoredObjectRef): Promise<boolean> {
    return this.objects.has(this.key(ref));
  }

  keysIn(bucket: string): string[] {
    return [...this.objects.keys()].filter((key) => key.startsWith(`${bucket}/`));
  }

  private key(ref: StoredObjectRef): string {
    return `${ref.bucket}/${ref.objectKey}`;
  }
}

/** Scriptable scanner: each test decides the verdict the upload should meet. */
class FakeMalwareScanner implements MalwareScanner {
  verdict: ScanVerdict = 'CLEAN';
  signature: string | null = null;
  calls = 0;

  async scan(_body: Buffer): Promise<ScanResult> {
    this.calls += 1;
    return {
      verdict: this.verdict,
      signature: this.verdict === 'CLEAN' ? null : this.signature,
      scannedAt: new Date(), scannerVersion: 'fake-clamd/1.0'
    };
  }
}

jest.setTimeout(180_000);

describe('Document control HTTP integration — US-005/US-019 (API-039…API-052)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storage: FakeObjectStorage;
  let scanner: FakeMalwareScanner;
  let passwordHash: string;
  let controllerToken: string;
  let uploaderToken: string;
  let packageToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    storage = new FakeObjectStorage();
    scanner = new FakeMalwareScanner();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE).useValue(storage)
      .overrideProvider(MALWARE_SCANNER).useValue(scanner)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true
    }));
    await app.init();
    dataSource = app.get<DataSource>(getDataSourceToken());
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE tenants CASCADE');
    storage.objects.clear();
    scanner.verdict = 'CLEAN';
    scanner.signature = null;
    scanner.calls = 0;
    await seedFixture();
    controllerToken = await login('doc-controller@example.test', 'doc-test');
    uploaderToken = await login('doc-uploader@example.test', 'doc-test');
    packageToken = await login('doc-package@example.test', 'doc-test');
    otherTenantToken = await login('doc-other@example.test', 'doc-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-040/039: registers a document and lists the register with filters', async () => {
    const created = await createDocument({ documentCode: 'CIV-DWG-001' });
    expect(created).toMatchObject({
      documentCode: 'CIV-DWG-001', classification: 'INTERNAL', status: 'ACTIVE',
      currentRevisionId: null, packageId: packageAId, versionNo: 1
    });
    await createDocument({
      documentCode: 'ELE-SPC-002', discipline: 'ELECTRICAL', type: 'SPECIFICATION',
      packageId: packageBId
    });

    const all = await api(controllerToken).get(`/v1/projects/${projectId}/documents`).expect(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta).toEqual({ limit: 50, nextCursor: null });

    const filtered = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents?discipline=ELECTRICAL&type=SPECIFICATION`)
      .expect(200);
    expect(filtered.body.data.map((row: { documentCode: string }) => row.documentCode))
      .toEqual(['ELE-SPC-002']);

    const byPackage = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents?packageId=${packageAId}`).expect(200);
    expect(byPackage.body.data.map((row: { documentCode: string }) => row.documentCode))
      .toEqual(['CIV-DWG-001']);

    const paged = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents?limit=1`).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents?limit=1&cursor=${paged.body.meta.nextCursor}`)
      .expect(200);
    expect(next.body.data[0].id).not.toBe(paged.body.data[0].id);
  });

  it('API-039: the register embeds both revision summaries without a per-row read', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const issued = await issuedRevision(document.id, 'A');
    // A newer revision that has not been issued: it is the latest, never the current-for-use one.
    const draft = await openUploadSession(document.id, 'B');

    const register = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents`).expect(200);
    const row = register.body.data[0];
    expect(row.currentRevisionId).toBe(issued.id);
    expect(row.currentRevision).toEqual({
      id: issued.id, revisionCode: 'A', workingVersion: 1, status: 'ISSUED', scanStatus: 'CLEAN'
    });
    expect(row.latestRevision).toEqual({
      id: draft.id, revisionCode: 'B', workingVersion: 1, status: 'DRAFT',
      scanStatus: 'QUARANTINED'
    });
    // Compact on purpose: a register list carries no hash and no storage addressing.
    expect(row.currentRevision.contentHash).toBeUndefined();
    expect(row.currentRevision.hasReleasedObject).toBeUndefined();
    expect(row.latestRevision.scanSignature).toBeUndefined();
  });

  it('API-039: an infected upload that was never issued is still visible in the register', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const session = await openUploadSession(document.id, 'A');
    scanner.verdict = 'INFECTED';
    scanner.signature = 'Eicar-Test-Signature';
    await finalizeUploadSession(session.id, {});

    const register = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents`).expect(200);
    const row = register.body.data[0];
    // Nothing reached ISSUED, so the register pointer is still null…
    expect(row.currentRevisionId).toBeNull();
    expect(row.currentRevision).toBeNull();
    // …and latestRevision is the only thing that can tell an operator the upload came back infected.
    expect(row.latestRevision).toEqual({
      id: session.id, revisionCode: 'A', workingVersion: 1, status: 'DRAFT', scanStatus: 'INFECTED'
    });
  });

  it('API-039: a document with no revision at all embeds null for both summaries', async () => {
    await createDocument({ documentCode: 'CIV-DWG-001' });
    const register = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents`).expect(200);
    expect(register.body.data[0]).toMatchObject({
      documentCode: 'CIV-DWG-001', currentRevisionId: null,
      currentRevision: null, latestRevision: null
    });
  });

  it('API-039: the embedded revision can never be one that belongs to another tenant', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const foreignRevisionId = await seedForeignRevision();

    // First line of defence: the composite foreign key refuses the cross-tenant reference outright.
    await expect(dataSource.query(
      'UPDATE documents SET current_revision_id = $2 WHERE id = $1',
      [document.id, foreignRevisionId]
    )).rejects.toMatchObject({ code: '23503' });

    // Second line: with the key temporarily out of the way, the join predicate itself must still
    // refuse the row, so no register page can ever render another tenant's revision.
    await dataSource.query('ALTER TABLE documents DROP CONSTRAINT fk_document_current_revision');
    try {
      await dataSource.query(
        'UPDATE documents SET current_revision_id = $2 WHERE id = $1',
        [document.id, foreignRevisionId]
      );
      const register = await api(controllerToken)
        .get(`/v1/projects/${projectId}/documents`).expect(200);
      expect(register.body.data[0]).toMatchObject({
        currentRevisionId: foreignRevisionId, currentRevision: null, latestRevision: null
      });
      expect(JSON.stringify(register.body)).not.toContain('FOREIGNREV');
      expect(JSON.stringify(register.body)).not.toContain('Foreign-Tenant-Signature');
    } finally {
      await dataSource.query(
        'UPDATE documents SET current_revision_id = NULL WHERE id = $1', [document.id]
      );
      await dataSource.query(`ALTER TABLE documents
        ADD CONSTRAINT fk_document_current_revision FOREIGN KEY (tenant_id, current_revision_id)
        REFERENCES document_revisions (tenant_id, id) ON DELETE RESTRICT`);
    }
  });

  it('API-040: a duplicate document code conflicts and writes nothing extra', async () => {
    await createDocument({ documentCode: 'CIV-DWG-001' });
    const duplicate = await api(controllerToken).post(`/v1/projects/${projectId}/documents`)
      .set('Idempotency-Key', `doc-dup-${randomUUID()}`)
      .send(documentPayload({ documentCode: 'CIV-DWG-001' }))
      .expect(409);
    expect(duplicate.body.code).toBe('DOCUMENT_CODE_TAKEN');
    expect(await countDocuments()).toBe(1);
  });

  it('API-042: an upload session quarantines the bytes and stores no content hash', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const session = await openUploadSession(document.id, 'A');

    expect(session).toMatchObject({
      status: 'DRAFT', scanStatus: 'QUARANTINED', revisionCode: 'A', workingVersion: 1,
      contentHash: null, sizeBytes: null, hasQuarantinedObject: true, hasReleasedObject: false
    });
    // AC-018: the upload session id and the revision id are the same record.
    expect(session.uploadSessionId).toBe(session.id);

    const stored = await dataSource.getRepository(DocumentRevisionEntity)
      .findOneByOrFail({ id: session.id, tenantId });
    expect(stored.contentHash).toBeNull();
    expect(stored.releasedObjectKey).toBeNull();
    expect(stored.quarantineObjectKey).not.toBeNull();
    expect(storage.keysIn('test-quarantine')).toHaveLength(1);
    expect(storage.keysIn('test-release')).toHaveLength(0);
  });

  it('API-043: a clean scan hashes server side, promotes the object and releases the revision', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const session = await openUploadSession(document.id, 'A');

    const finalized = await finalizeUploadSession(session.id, {});
    expect(finalized).toMatchObject({
      scanStatus: 'CLEAN', contentHash: fileHash, sizeBytes: fileBytes.length,
      hasQuarantinedObject: false, hasReleasedObject: true, scanVerdict: 'CLEAN',
      scannerVersion: 'fake-clamd/1.0'
    });
    expect(storage.keysIn('test-quarantine')).toHaveLength(0);
    expect(storage.keysIn('test-release')).toHaveLength(1);
    expect(scanner.calls).toBe(1);
  });

  it('API-043: a client-declared hash that disagrees with the bytes is refused, writing nothing', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const session = await openUploadSession(document.id, 'A');

    const response = await api(uploaderToken)
      .post(`/v1/upload-sessions/${session.id}:finalize`)
      .set('Idempotency-Key', `doc-finalize-${randomUUID()}`)
      .send({ contentHash: createHash('sha256').update('another file').digest('hex') })
      .expect(422);
    expect(response.body.code).toBe('CONTENT_HASH_MISMATCH');

    const stored = await dataSource.getRepository(DocumentRevisionEntity)
      .findOneByOrFail({ id: session.id, tenantId });
    expect(stored.scanStatus).toBe('QUARANTINED');
    expect(stored.contentHash).toBeNull();
    expect(storage.keysIn('test-release')).toHaveLength(0);
  });

  it('API-043: an infected upload is recorded, its bytes destroyed and it can never be released', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const session = await openUploadSession(document.id, 'A');
    scanner.verdict = 'INFECTED';
    scanner.signature = 'Eicar-Test-Signature';

    const finalized = await finalizeUploadSession(session.id, {});
    expect(finalized).toMatchObject({
      scanStatus: 'INFECTED', scanSignature: 'Eicar-Test-Signature', contentHash: null,
      hasQuarantinedObject: false, hasReleasedObject: false, scanVerdict: 'INFECTED'
    });
    expect(storage.objects.size).toBe(0);

    // AC-019: nothing downstream may move an unscanned or infected revision forward.
    const submitted = await api(uploaderToken)
      .post(`/v1/document-revisions/${session.id}:submit-review`)
      .set('Idempotency-Key', `doc-submit-${randomUUID()}`)
      .send({ expectedVersion: 2, note: 'Trình duyệt' })
      .expect(422);
    expect(submitted.body.code).toBe('REVISION_NOT_SCANNED');

    const stored = await dataSource.getRepository(DocumentRevisionEntity)
      .findOneByOrFail({ id: session.id, tenantId });
    expect(stored.status).toBe('DRAFT');
  });

  it('API-043: a scanner outage answers 503, keeps the bytes quarantined and never says clean', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const session = await openUploadSession(document.id, 'A');
    scanner.verdict = 'UNAVAILABLE';
    scanner.signature = 'clamd is unreachable';

    const response = await api(uploaderToken)
      .post(`/v1/upload-sessions/${session.id}:finalize`)
      .set('Idempotency-Key', `doc-finalize-${randomUUID()}`)
      .send({})
      .expect(503);
    expect(response.body).toMatchObject({ code: 'SCANNER_UNAVAILABLE', retryable: true });

    const held = await dataSource.getRepository(DocumentRevisionEntity)
      .findOneByOrFail({ id: session.id, tenantId });
    expect(held.scanStatus).toBe('UNAVAILABLE');
    expect(held.contentHash).toBeNull();
    expect(held.releasedObjectKey).toBeNull();
    expect(storage.keysIn('test-quarantine')).toHaveLength(1);

    // The revision is still finalizable once the scanner comes back.
    scanner.verdict = 'CLEAN';
    const retried = await finalizeUploadSession(session.id, {});
    expect(retried).toMatchObject({ scanStatus: 'CLEAN', contentHash: fileHash });
  });

  it('API-045…048: reviews, approves, issues and supersedes the previous revision in one step', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const first = await releasedRevision(document.id, 'A');

    const submitted = await submitReview(first.id, first.versionNo);
    expect(submitted).toMatchObject({ status: 'IN_REVIEW', reviewCycleNo: 1 });

    const comment = await api(packageToken)
      .post(`/v1/document-revisions/${first.id}/comments`)
      .set('Idempotency-Key', `doc-comment-${randomUUID()}`)
      .send({ severity: 'MAJOR', body: 'Thiếu cao độ thiết kế', location: 'Sheet 2' })
      .expect(201);
    expect(comment.body.data).toMatchObject({
      sequenceNo: 1, cycleNo: 1, severity: 'MAJOR', disposition: 'OPEN'
    });

    const approved = await approve(first.id, submitted.versionNo);
    expect(approved).toMatchObject({ status: 'APPROVED', approvedBy: controllerId });

    const issued = await issue(first.id, approved.versionNo);
    expect(issued).toMatchObject({
      status: 'ISSUED', lockState: 'LOCKED', issuedBy: controllerId, supersededRevisionId: null
    });

    const register = await api(controllerToken).get(`/v1/documents/${document.id}`).expect(200);
    expect(register.body.data.currentRevisionId).toBe(first.id);
    expect(register.body.currentRevision).toMatchObject({ id: first.id, status: 'ISSUED' });

    // A second revision takes over: AC-019 wants exactly one current-for-use revision.
    const second = await releasedRevision(document.id, 'B');
    const secondSubmitted = await submitReview(second.id, second.versionNo);
    const secondApproved = await approve(second.id, secondSubmitted.versionNo);
    const secondIssued = await issue(second.id, secondApproved.versionNo);
    expect(secondIssued.supersededRevisionId).toBe(first.id);

    const rows = await dataSource.getRepository(DocumentRevisionEntity)
      .find({ where: { tenantId, documentId: document.id }, order: { revisionCode: 'ASC' } });
    expect(rows.map((row) => [row.revisionCode, row.status]))
      .toEqual([['A', 'SUPERSEDED'], ['B', 'ISSUED']]);
    const reloaded = await dataSource.getRepository(DocumentEntity)
      .findOneByOrFail({ id: document.id, tenantId });
    expect(reloaded.currentRevisionId).toBe(second.id);

    const events = await dataSource.getRepository(TransactionalOutboxEventEntity)
      .findBy({ tenantId, aggregateId: second.id });
    expect(events.map((row) => row.eventType)).toEqual(expect.arrayContaining([
      'DocumentRevision.UploadSessionOpened', 'DocumentRevision.ScanClean',
      'DocumentRevision.ReviewSubmitted', 'DocumentRevision.Approved', 'DocumentRevision.Issued'
    ]));
  });

  it('API-047/048: an unreviewed or stale revision is refused and writes nothing', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await releasedRevision(document.id, 'A');

    const earlyApprove = await api(controllerToken)
      .post(`/v1/document-revisions/${revision.id}:approve`)
      .set('Idempotency-Key', `doc-approve-${randomUUID()}`)
      .send({ expectedVersion: revision.versionNo, comment: 'Duyệt sớm' })
      .expect(422);
    expect(earlyApprove.body.code).toBe('INVALID_STATE_TRANSITION');

    const submitted = await submitReview(revision.id, revision.versionNo);
    const stale = await api(controllerToken)
      .post(`/v1/document-revisions/${revision.id}:approve`)
      .set('Idempotency-Key', `doc-approve-${randomUUID()}`)
      .send({ expectedVersion: revision.versionNo, comment: 'Phiên bản cũ' })
      .expect(409);
    expect(stale.body).toMatchObject({
      code: 'VERSION_CONFLICT', currentVersion: submitted.versionNo
    });

    const notApproved = await api(controllerToken)
      .post(`/v1/document-revisions/${revision.id}:issue`)
      .set('Idempotency-Key', `doc-issue-${randomUUID()}`)
      .send({ expectedVersion: submitted.versionNo, comment: 'Phát hành sớm' })
      .expect(422);
    expect(notApproved.body.code).toBe('INVALID_STATE_TRANSITION');

    const stored = await dataSource.getRepository(DocumentRevisionEntity)
      .findOneByOrFail({ id: revision.id, tenantId });
    expect(stored.status).toBe('IN_REVIEW');
    expect(stored.approvedBy).toBeNull();
    expect(stored.issuedBy).toBeNull();
  });

  it('AC-019: an issued revision and its review history cannot be rewritten', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const released = await releasedRevision(document.id, 'A');
    const submitted = await submitReview(released.id, released.versionNo);
    await api(packageToken)
      .post(`/v1/document-revisions/${released.id}/comments`)
      .set('Idempotency-Key', `doc-comment-${randomUUID()}`)
      .send({ severity: 'MINOR', body: 'Ghi chú review' })
      .expect(201);
    const approved = await approve(released.id, submitted.versionNo);
    const revision = await issue(released.id, approved.versionNo);

    await expect(dataSource.query(
      `UPDATE document_revisions SET content_hash = $2 WHERE id = $1`,
      [revision.id, createHash('sha256').update('tampered').digest('hex')]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(dataSource.query(
      `UPDATE document_review_comments SET body = 'viết lại' WHERE tenant_id = $1`, [tenantId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('API-051: the share token is returned once and only its hash is stored', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await issuedRevision(document.id, 'A');

    const response = await api(controllerToken)
      .post(`/v1/document-revisions/${revision.id}/external-shares`)
      .set('Idempotency-Key', `doc-share-${randomUUID()}`)
      .send({
        purpose: 'Gửi tư vấn thẩm tra',
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        recipients: [{
          organisation: 'Tư vấn thẩm tra', contactName: 'Nguyễn Văn A',
          contactEmail: 'reviewer@example.test'
        }]
      })
      .expect(201);
    const token = response.body.data.token as string;
    expect(token).toEqual(expect.any(String));
    // AC-089: watermark on, download off unless somebody deliberately relaxes it.
    expect(response.body.data).toMatchObject({
      watermarkRequired: true, downloadAllowed: false, downloadCount: 0, status: 'ACTIVE'
    });
    expect(response.body.data.tokenHash).toBeUndefined();

    const stored = await dataSource.getRepository(DocumentExternalShareEntity)
      .findOneByOrFail({ id: response.body.data.id, tenantId });
    expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(stored.tokenHash).not.toBe(token);

    const audit = await dataSource.getRepository(AuditEventEntity)
      .findOneByOrFail({ tenantId, objectId: stored.id });
    expect(JSON.stringify(audit.payload)).not.toContain(token);
  });

  it('API-051: a revision that is not issued cannot be shared, and nothing is written', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await releasedRevision(document.id, 'A');
    const response = await api(controllerToken)
      .post(`/v1/document-revisions/${revision.id}/external-shares`)
      .set('Idempotency-Key', `doc-share-${randomUUID()}`)
      .send({
        purpose: 'Gửi sớm', expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        recipients: [{
          organisation: 'Tư vấn', contactName: 'A', contactEmail: 'reviewer@example.test'
        }]
      })
      .expect(422);
    expect(response.body.code).toBe('REVISION_NOT_ISSUED');
    expect(await dataSource.getRepository(DocumentExternalShareEntity).countBy({ tenantId }))
      .toBe(0);
  });

  it('API-052: a signature envelope stays local, in DRAFT, over the exact artifact hash', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await issuedRevision(document.id, 'A');
    const response = await api(controllerToken)
      .post(`/v1/document-revisions/${revision.id}/signature-envelopes`)
      .set('Idempotency-Key', `doc-sign-${randomUUID()}`)
      .send({
        provider: 'internal-record-only',
        signers: [{
          name: 'Nguyễn Văn B', email: 'signer@example.test', order: 1, role: 'OWNER_REP'
        }]
      })
      .expect(201);
    expect(response.body.data).toMatchObject({
      status: 'DRAFT', externalId: null, artifactHash: fileHash, completedAt: null
    });
    const stored = await dataSource.getRepository(SignatureEnvelopeEntity)
      .findOneByOrFail({ id: response.body.data.id, tenantId });
    expect(stored.signerSnapshot).toEqual([
      { name: 'Nguyễn Văn B', email: 'signer@example.test', order: 1, role: 'OWNER_REP' }
    ]);
  });

  it('API-049/050: issues a transmittal over issued revisions and records one response', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await issuedRevision(document.id, 'A');

    const transmittal = await api(controllerToken)
      .post(`/v1/projects/${projectId}/transmittals`)
      .set('Idempotency-Key', `doc-transmittal-${randomUUID()}`)
      .send({
        number: 'TR-2026-001', purpose: 'Phát hành thi công', dueDate: '2026-09-30',
        recipients: [{
          organisation: 'Nhà thầu EPC', contactName: 'Trần C', contactEmail: 'epc@example.test'
        }],
        items: [{ revisionId: revision.id, actionCode: 'FOR_CONSTRUCTION', responseDue: '2026-09-15' }]
      })
      .expect(201);
    expect(transmittal.body.data).toMatchObject({ number: 'TR-2026-001', status: 'ISSUED' });
    expect(transmittal.body.data.items).toHaveLength(1);
    expect(transmittal.body.data.items[0]).toMatchObject({
      responseStatus: 'PENDING', actionCode: 'FOR_CONSTRUCTION'
    });

    const responded = await api(controllerToken)
      .post(`/v1/transmittals/${transmittal.body.data.id}/responses`)
      .set('Idempotency-Key', `doc-response-${randomUUID()}`)
      .send({ revisionId: revision.id, responseCode: 'ACCEPTED', responseNote: 'Đã nhận' })
      .expect(201);
    expect(responded.body.data).toMatchObject({
      responseStatus: 'RESPONDED', responseCode: 'ACCEPTED', respondedBy: controllerId
    });

    const twice = await api(controllerToken)
      .post(`/v1/transmittals/${transmittal.body.data.id}/responses`)
      .set('Idempotency-Key', `doc-response-${randomUUID()}`)
      .send({ revisionId: revision.id, responseCode: 'REJECTED' })
      .expect(409);
    expect(twice.body.code).toBe('TRANSMITTAL_ALREADY_RESPONDED');
    const items = await dataSource.getRepository(TransmittalItemEntity).findBy({ tenantId });
    expect(items.map((item) => item.responseCode)).toEqual(['ACCEPTED']);
  });

  it('API-049: a transmittal over an unissued revision is refused and writes nothing', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await releasedRevision(document.id, 'A');
    const response = await api(controllerToken)
      .post(`/v1/projects/${projectId}/transmittals`)
      .set('Idempotency-Key', `doc-transmittal-${randomUUID()}`)
      .send({
        number: 'TR-2026-002', purpose: 'Phát hành sớm',
        recipients: [{
          organisation: 'Nhà thầu EPC', contactName: 'Trần C', contactEmail: 'epc@example.test'
        }],
        items: [{ revisionId: revision.id, actionCode: 'FOR_REVIEW' }]
      })
      .expect(422);
    expect(response.body.code).toBe('REVISION_NOT_ISSUED');
    expect(await dataSource.getRepository(TransmittalEntity).countBy({ tenantId })).toBe(0);
    expect(await dataSource.getRepository(TransmittalItemEntity).countBy({ tenantId })).toBe(0);
  });

  it('scope: a cross-tenant reader and an out-of-package reader both get 404, never 403', async () => {
    const visible = await createDocument({ documentCode: 'CIV-DWG-001', packageId: packageAId });
    const hidden = await createDocument({ documentCode: 'ELE-SPC-002', packageId: packageBId });
    const revision = await issuedRevision(hidden.id, 'A');

    // Package-scoped reader holds package A only.
    await api(packageToken).get(`/v1/documents/${visible.id}`).expect(200);
    await api(packageToken).get(`/v1/documents/${hidden.id}`).expect(404);
    await api(packageToken).get(`/v1/document-revisions/${revision.id}`).expect(404);
    const scopedList = await api(packageToken)
      .get(`/v1/projects/${projectId}/documents`).expect(200);
    expect(scopedList.body.data.map((row: { documentCode: string }) => row.documentCode))
      .toEqual(['CIV-DWG-001']);

    // Another tenant cannot even learn that the id exists: not one of these answers is a 403.
    await api(otherTenantToken, otherTenantId).get(`/v1/documents/${visible.id}`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/document-revisions/${revision.id}`).expect(404);
    const crossTenantList = await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/documents`).expect(404);
    expect(crossTenantList.body.code).toBe('PROJECT_NOT_FOUND');

    // A project the package reader cannot reach at all is equally invisible.
    const unreachable = await api(packageToken)
      .get(`/v1/projects/${otherProjectId}/documents`).expect(403);
    expect(unreachable.body.code).toBe('PERMISSION_DENIED');
  });

  it('permissions: an uploader cannot approve or issue, and the attempt writes nothing', async () => {
    const document = await createDocument({ documentCode: 'CIV-DWG-001' });
    const revision = await releasedRevision(document.id, 'A');
    const submitted = await submitReview(revision.id, revision.versionNo);

    const approve = await api(uploaderToken)
      .post(`/v1/document-revisions/${revision.id}:approve`)
      .set('Idempotency-Key', `doc-approve-${randomUUID()}`)
      .send({ expectedVersion: submitted.versionNo, comment: 'Tự duyệt' })
      .expect(403);
    expect(approve.body.code).toBe('PERMISSION_DENIED');

    const issue = await api(uploaderToken)
      .post(`/v1/document-revisions/${revision.id}:issue`)
      .set('Idempotency-Key', `doc-issue-${randomUUID()}`)
      .send({ expectedVersion: submitted.versionNo, comment: 'Tự phát hành' })
      .expect(403);
    expect(issue.body.code).toBe('PERMISSION_DENIED');

    const stored = await dataSource.getRepository(DocumentRevisionEntity)
      .findOneByOrFail({ id: revision.id, tenantId });
    expect(stored.status).toBe('IN_REVIEW');
  });

  it('rejects a malformed cursor, a missing Idempotency-Key and an unknown body field', async () => {
    const cursor = await api(controllerToken)
      .get(`/v1/projects/${projectId}/documents?cursor=not-a-cursor`).expect(400);
    expect(cursor.body.code).toBe('INVALID_CURSOR');

    const missingKey = await api(controllerToken).post(`/v1/projects/${projectId}/documents`)
      .send(documentPayload({ documentCode: 'CIV-DWG-009' }))
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    await api(controllerToken).post(`/v1/projects/${projectId}/documents`)
      .set('Idempotency-Key', `doc-unknown-${randomUUID()}`)
      .send({ ...documentPayload({ documentCode: 'CIV-DWG-010' }), unexpected: true })
      .expect(400);
    expect(await countDocuments()).toBe(0);
  });

  it('replays an identical command instead of creating a second document', async () => {
    const key = `doc-replay-${randomUUID()}`;
    const first = await api(controllerToken).post(`/v1/projects/${projectId}/documents`)
      .set('Idempotency-Key', key).send(documentPayload({ documentCode: 'CIV-DWG-001' }))
      .expect(201);
    const replay = await api(controllerToken).post(`/v1/projects/${projectId}/documents`)
      .set('Idempotency-Key', key).send(documentPayload({ documentCode: 'CIV-DWG-001' }))
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await countDocuments()).toBe(1);
  });

  function documentPayload(overrides: Partial<{
    documentCode: string; discipline: string; type: string; packageId: string;
  }>) {
    return {
      documentCode: 'CIV-DWG-001', title: 'Bản vẽ mặt bằng tổng thể',
      discipline: overrides.discipline ?? 'CIVIL', type: overrides.type ?? 'DRAWING',
      classification: 'INTERNAL', packageId: overrides.packageId ?? packageAId,
      ...(overrides.documentCode ? { documentCode: overrides.documentCode } : {})
    };
  }

  async function createDocument(overrides: Parameters<typeof documentPayload>[0]) {
    const response = await api(controllerToken).post(`/v1/projects/${projectId}/documents`)
      .set('Idempotency-Key', `doc-create-${randomUUID()}`)
      .send(documentPayload(overrides))
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  async function openUploadSession(documentId: string, revisionCode: string) {
    const response = await api(uploaderToken)
      .post(`/v1/documents/${documentId}/upload-sessions`)
      .set('Idempotency-Key', `doc-upload-${randomUUID()}`)
      .send({
        revisionCode, purpose: 'Phát hành thi công', fileName: 'mat-bang.pdf',
        mimeType: 'application/pdf', content: fileContent
      })
      .expect(201);
    return response.body.data as {
      id: string; uploadSessionId: string; versionNo: number
    } & Record<string, unknown>;
  }

  async function finalizeUploadSession(sessionId: string, body: Record<string, unknown>) {
    const response = await api(uploaderToken)
      .post(`/v1/upload-sessions/${sessionId}:finalize`)
      .set('Idempotency-Key', `doc-finalize-${randomUUID()}`)
      .send(body)
      .expect(200);
    return response.body.data as { id: string; versionNo: number } & Record<string, unknown>;
  }

  /** A DRAFT revision whose bytes have passed the scanner and reached the release bucket. */
  async function releasedRevision(documentId: string, revisionCode: string) {
    const session = await openUploadSession(documentId, revisionCode);
    return finalizeUploadSession(session.id, {});
  }

  async function issuedRevision(documentId: string, revisionCode: string) {
    const released = await releasedRevision(documentId, revisionCode);
    const submitted = await submitReview(released.id, released.versionNo);
    const approved = await approve(released.id, submitted.versionNo);
    return issue(released.id, approved.versionNo);
  }

  async function submitReview(revisionId: string, expectedVersion: number) {
    const response = await api(uploaderToken)
      .post(`/v1/document-revisions/${revisionId}:submit-review`)
      .set('Idempotency-Key', `doc-submit-${randomUUID()}`)
      .send({ expectedVersion, note: 'Trình duyệt phiên bản' })
      .expect(200);
    return response.body.data as { id: string; versionNo: number } & Record<string, unknown>;
  }

  async function approve(revisionId: string, expectedVersion: number) {
    const response = await api(controllerToken)
      .post(`/v1/document-revisions/${revisionId}:approve`)
      .set('Idempotency-Key', `doc-approve-${randomUUID()}`)
      .send({ expectedVersion, comment: 'Đồng ý phê duyệt' })
      .expect(200);
    return response.body.data as { id: string; versionNo: number } & Record<string, unknown>;
  }

  async function issue(revisionId: string, expectedVersion: number) {
    const response = await api(controllerToken)
      .post(`/v1/document-revisions/${revisionId}:issue`)
      .set('Idempotency-Key', `doc-issue-${randomUUID()}`)
      .send({ expectedVersion, comment: 'Phát hành cho thi công' })
      .expect(200);
    return response.body.data as {
      id: string; versionNo: number; supersededRevisionId: string | null
    } & Record<string, unknown>;
  }

  function countDocuments(): Promise<number> {
    return dataSource.getRepository(DocumentEntity).countBy({ tenantId });
  }

  /** A revision that legitimately belongs to the other tenant, used only as join bait. */
  async function seedForeignRevision(): Promise<string> {
    const foreignDocumentId = randomUUID();
    await dataSource.getRepository(DocumentEntity).save({
      id: foreignDocumentId, tenantId: otherTenantId, projectId: otherProjectId, packageId: null,
      documentCode: 'FOREIGN-DOC-001', title: 'Tài liệu tenant khác', discipline: 'CIVIL',
      type: 'DRAWING', classification: DocumentClassification.INTERNAL,
      ownerId: otherTenantUserId, currentRevisionId: null, legalHold: false,
      status: DocumentRecordStatus.ACTIVE,
      createdBy: otherTenantUserId, updatedBy: otherTenantUserId
    });
    const foreignRevisionId = randomUUID();
    await dataSource.getRepository(DocumentRevisionEntity).save({
      id: foreignRevisionId, tenantId: otherTenantId, documentId: foreignDocumentId,
      projectId: otherProjectId, revisionCode: 'FOREIGNREV', workingVersion: 1,
      status: DocumentRevisionStatus.DRAFT, purpose: 'Chỉ dùng làm mồi cho join',
      fileName: 'foreign.pdf', mimeType: 'application/pdf',
      quarantineObjectKey: null, releasedObjectKey: null,
      contentHash: null, sizeBytes: null, scanStatus: DocumentScanStatus.INFECTED,
      scanSignature: 'Foreign-Tenant-Signature', scannedAt: new Date(), scannerVersion: 'fake',
      lockState: DocumentLockState.UNLOCKED, reviewCycleNo: 0, approvedBy: null, approvedAt: null,
      issuedBy: null, issuedAt: null, uploadedBy: otherTenantUserId
    });
    return foreignRevisionId;
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'doc-test', name: 'Document Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'doc-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(controllerId, tenantId, 'doc-controller@example.test', 'Document Controller'),
      user(uploaderId, tenantId, 'doc-uploader@example.test', 'Document Uploader'),
      user(packageUserId, tenantId, 'doc-package@example.test', 'Package Reader'),
      user(otherTenantUserId, otherTenantId, 'doc-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(controllerId, tenantId), credential(uploaderId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const controllerRole = await role(tenantId, 'DOC_CONTROLLER', [
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentRevision.approve', 'documentRevision.issue',
      'documentComment.create', 'transmittal.issue', 'transmittal.respond',
      'documentShare.create', 'documentSignature.start'
    ]);
    // Deliberately has no approve/issue grant, to prove the guard denies before any write.
    const uploaderRole = await role(tenantId, 'DOC_UPLOADER', [
      'document.read', 'document.create', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview', 'documentComment.create'
    ]);
    const packageRole = await role(tenantId, 'DOC_PACKAGE', [
      'document.read', 'documentRevision.read', 'documentComment.create'
    ]);
    const otherRole = await role(otherTenantId, 'DOC_OTHER', [
      'document.read', 'document.create', 'documentRevision.read'
    ]);

    await seedProject(tenantId, projectId, 'DOCP', controllerId);
    await seedProject(otherTenantId, otherProjectId, 'DOCO', otherTenantUserId);
    await dataSource.getRepository(PackageEntity).save([
      packageRow(packageAId, 'DOC-PKG-A'), packageRow(packageBId, 'DOC-PKG-B')
    ]);

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, controllerId, controllerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, uploaderId, uploaderRole.id, AssignmentScopeType.TENANT, null),
      // Package-scoped: only package A is reachable, so package B documents must be invisible.
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageAId),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  function packageRow(id: string, code: string) {
    return {
      id, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
      code, name: code, packageType: 'EPC', status: PackageStatus.ACTIVE, versionNo: 1,
      idempotencyKey: null, createdBy: controllerId, updatedBy: controllerId
    };
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerId: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `COMP-${code}`, name: `Company ${code}`,
      organizationType: OrganizationType.INTERNAL, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    const legal = await dataSource.getRepository(LegalEntityEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, companyId: company.id,
      legalName: `Legal ${code}`, country: 'VN', registrationNo: `REG-${code}`,
      taxId: null, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const portfolio = await dataSource.getRepository(PortfolioEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `PORT-${code}`,
      name: `Portfolio ${code}`, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    await dataSource.getRepository(ProjectEntity).save({
      id: fixtureProjectId, tenantId: fixtureTenantId, portfolioId: portfolio.id,
      ownerLegalEntityId: legal.id, customerCompanyId: company.id, projectManagerId: managerId,
      code, name: `Project ${code}`, type: ProjectType.SOLAR, phase: ProjectPhase.EXECUTION,
      recordStatus: ProjectRecordStatus.ACTIVE, contractModel: 'EPC', currency: 'VND',
      plannedCod: '2027-12-31', forecastCod: null, versionNo: 1, idempotencyKey: null
    });
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 6, status: MasterRecordStatus.ACTIVE
    });
  }

  function assignment(
    fixtureTenantId: string, userAccountId: string, roleId: string,
    scopeType: AssignmentScopeType, scopeId: string | null
  ) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId, roleId,
      scopeType, scopeId, effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: null, status: MasterRecordStatus.ACTIVE
    };
  }

  function user(id: string, fixtureTenantId: string, email: string, displayName: string) {
    return {
      id, tenantId: fixtureTenantId, email, normalizedEmail: email,
      displayName, status: MasterRecordStatus.ACTIVE, lastLoginAt: null
    };
  }

  function credential(userAccountId: string, fixtureTenantId: string) {
    return {
      id: randomUUID(), tenantId: fixtureTenantId, userAccountId,
      passwordHash, algorithm: 'argon2id', credentialVersion: 1, changedAt: new Date()
    };
  }

  async function login(email: string, tenantCode: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/v1/auth/login')
      .send({ tenantCode, email, password }).expect(200);
    return response.body.accessToken as string;
  }

  function api(token: string, headerTenantId = tenantId) {
    const authorized = (test: request.Test) => test
      .set('Authorization', `Bearer ${token}`).set('X-Tenant-Id', headerTenantId);
    return {
      get: (path: string) => authorized(request(app.getHttpServer()).get(path)),
      post: (path: string) => authorized(request(app.getHttpServer()).post(path))
    };
  }

  void DocumentReviewCommentEntity;
});
