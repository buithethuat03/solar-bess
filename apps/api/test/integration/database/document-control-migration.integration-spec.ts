import { createHash, randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(120_000);

const migrationName = 'CreateDocumentControl1783740000000';
const grantMigrationName = 'GrantDocumentPermissions1783741000000';
const tables = [
  'documents', 'document_revisions', 'document_review_comments', 'transmittals',
  'transmittal_items', 'signature_envelopes', 'document_external_shares'
];

const cleanHash = createHash('sha256').update('document bytes').digest('hex');

describe('Document control migration — DB-022…DB-027, DB-114', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const authorId = randomUUID();
  const approverId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const packageId = randomUUID();

  beforeAll(async () => {
    await runTestMigrations();
    await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE tenants CASCADE');
    await seedMasterData();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('creates every table, drops them again on down and restores them on re-up', async () => {
    expect(await regclasses()).toEqual(tables);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
  });

  it('grants the document permissions and takes back exactly what it added on down', async () => {
    const roleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PACKAGE_OWNER','Package Owner',$3::jsonb,1,'ACTIVE')`,
      [roleId, tenantId, JSON.stringify(['package.read', 'document.read'])]
    );
    // Re-running the grant is what a fresh tenant seeded after the migration looks like.
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    const granted = await permissionsOf(roleId);
    expect(granted).toEqual(expect.arrayContaining([
      'document.read', 'documentRevision.read', 'documentComment.create'
    ]));
    expect(granted).not.toContain('documentRevision.issue');

    await revertThroughMigration(grantMigrationName);
    const reverted = await permissionsOf(roleId);
    // The pre-existing `document.read` was not added by this migration, so it must survive.
    expect(reverted).toEqual(['package.read', 'document.read']);

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('refuses a revision that reaches a released status without a clean scan', async () => {
    const documentId = await seedDocument();
    await expect(seedRevision(documentId, {
      revisionCode: 'A', status: 'APPROVED', scanStatus: 'QUARANTINED',
      contentHash: null, releasedObjectKey: null, approvedBy: approverId
    })).rejects.toMatchObject({ constraint: 'ck_document_revision_release_requires_clean' });

    await expect(seedRevision(documentId, {
      revisionCode: 'B', status: 'APPROVED', scanStatus: 'CLEAN',
      contentHash: cleanHash, releasedObjectKey: 'release/key', approvedBy: approverId
    })).resolves.toBeDefined();
  });

  it('refuses an ISSUED revision that is not locked and an unapproved release', async () => {
    const documentId = await seedDocument();
    await expect(seedRevision(documentId, {
      revisionCode: 'C', status: 'ISSUED', scanStatus: 'CLEAN', contentHash: cleanHash,
      releasedObjectKey: 'release/key', approvedBy: approverId, issuedBy: approverId,
      lockState: 'UNLOCKED'
    })).rejects.toMatchObject({ constraint: 'ck_document_revision_issued_locked' });

    await expect(seedRevision(documentId, {
      revisionCode: 'D', status: 'ISSUED', scanStatus: 'CLEAN', contentHash: cleanHash,
      releasedObjectKey: 'release/key', approvedBy: null, issuedBy: approverId,
      lockState: 'LOCKED'
    })).rejects.toMatchObject({ constraint: 'ck_document_revision_approved_status' });
  });

  it('keeps the content of an ISSUED revision immutable but still allows superseding it', async () => {
    const documentId = await seedDocument();
    const revisionId = await seedRevision(documentId, {
      revisionCode: 'E', status: 'ISSUED', scanStatus: 'CLEAN', contentHash: cleanHash,
      releasedObjectKey: 'release/key', approvedBy: approverId, issuedBy: approverId,
      lockState: 'LOCKED'
    });

    const tampered = createHash('sha256').update('tampered').digest('hex');
    for (const [statement, parameters] of [
      [`UPDATE document_revisions SET content_hash = $2 WHERE id = $1`, [revisionId, tampered]],
      [`UPDATE document_revisions SET released_object_key = 'other/key' WHERE id = $1`, [revisionId]],
      [`UPDATE document_revisions SET issued_by = NULL, issued_at = NULL WHERE id = $1`, [revisionId]],
      [`UPDATE document_revisions SET revision_code = 'E2' WHERE id = $1`, [revisionId]],
      [`UPDATE document_revisions SET size_bytes = 999 WHERE id = $1`, [revisionId]]
    ] as Array<[string, unknown[]]>) {
      await expect(AppDataSource.query(statement, parameters))
        .rejects.toMatchObject({ code: '55000' });
    }

    // A new revision taking over is the only legitimate change to an issued one.
    await expect(AppDataSource.query(
      `UPDATE document_revisions SET status = 'SUPERSEDED' WHERE id = $1`, [revisionId]
    )).resolves.toBeDefined();
  });

  it('makes the review comment ledger append-only', async () => {
    const documentId = await seedDocument();
    const revisionId = await seedRevision(documentId, { revisionCode: 'F' });
    await seedComment(revisionId, 1);
    await expect(seedComment(revisionId, 1)).rejects.toMatchObject({ code: '23505' });

    await expect(AppDataSource.query(
      `UPDATE document_review_comments SET body = 'đổi ý' WHERE revision_id = $1`, [revisionId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM document_review_comments WHERE revision_id = $1', [revisionId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('freezes a completed signature envelope', async () => {
    const documentId = await seedDocument();
    const revisionId = await seedRevision(documentId, {
      revisionCode: 'G', status: 'ISSUED', scanStatus: 'CLEAN', contentHash: cleanHash,
      releasedObjectKey: 'release/key', approvedBy: approverId, issuedBy: approverId,
      lockState: 'LOCKED'
    });
    const envelopeId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO signature_envelopes (
        id, tenant_id, revision_id, provider, external_id, signer_snapshot, artifact_hash,
        status, completion_hash, completed_at, created_by
      ) VALUES ($1,$2,$3,'internal','EXT-1',$4::jsonb,$5,'COMPLETED',$5,now(),$6)`,
      [envelopeId, tenantId, revisionId, JSON.stringify([
        { name: 'Người ký', email: 'signer@example.test', order: 1, role: 'OWNER' }
      ]), cleanHash, authorId]
    );
    await expect(AppDataSource.query(
      `UPDATE signature_envelopes SET status = 'VOIDED' WHERE id = $1`, [envelopeId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM signature_envelopes WHERE id = $1', [envelopeId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('refuses an envelope that leaves DRAFT without an external id or without signers', async () => {
    const documentId = await seedDocument();
    const revisionId = await seedRevision(documentId, { revisionCode: 'H' });
    await expect(AppDataSource.query(
      `INSERT INTO signature_envelopes (
        id, tenant_id, revision_id, provider, signer_snapshot, artifact_hash, status, created_by
      ) VALUES ($1,$2,$3,'internal',$4::jsonb,$5,'SENT',$6)`,
      [randomUUID(), tenantId, revisionId, JSON.stringify([
        { name: 'Người ký', email: 'signer@example.test', order: 1, role: 'OWNER' }
      ]), cleanHash, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_signature_envelope_external' });

    await expect(AppDataSource.query(
      `INSERT INTO signature_envelopes (
        id, tenant_id, revision_id, provider, signer_snapshot, artifact_hash, status, created_by
      ) VALUES ($1,$2,$3,'internal','[]'::jsonb,$4,'DRAFT',$5)`,
      [randomUUID(), tenantId, revisionId, cleanHash, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_signature_envelope_signers_present' });
  });

  it('stores only a hashed share token and refuses an expiry in the past', async () => {
    const documentId = await seedDocument();
    const revisionId = await seedRevision(documentId, { revisionCode: 'I' });
    const tokenHash = createHash('sha256').update('plaintext-token').digest('hex');
    await AppDataSource.query(
      `INSERT INTO document_external_shares (
        id, tenant_id, revision_id, token_hash, recipient_snapshot, purpose, expires_at, status, created_by
      ) VALUES ($1,$2,$3,$4,$5::jsonb,'Gửi tư vấn', now() + interval '7 days','ACTIVE',$6)`,
      [randomUUID(), tenantId, revisionId, tokenHash, JSON.stringify([
        { partyId: null, organisation: 'Tư vấn', contactName: 'A', contactEmail: 'a@example.test' }
      ]), authorId]
    );
    // Only the hash is ever stored, so the column can never hold a usable link.
    await expect(AppDataSource.query(
      `INSERT INTO document_external_shares (
        id, tenant_id, revision_id, token_hash, recipient_snapshot, purpose, expires_at, status, created_by
      ) VALUES ($1,$2,$3,'plaintext-token',$4::jsonb,'Gửi tư vấn', now() + interval '7 days','ACTIVE',$5)`,
      [randomUUID(), tenantId, revisionId, JSON.stringify([
        { partyId: null, organisation: 'Tư vấn', contactName: 'A', contactEmail: 'a@example.test' }
      ]), authorId]
    )).rejects.toMatchObject({ constraint: 'ck_document_external_share_token_format' });

    await expect(AppDataSource.query(
      `INSERT INTO document_external_shares (
        id, tenant_id, revision_id, token_hash, recipient_snapshot, purpose, expires_at, status, created_by
      ) VALUES ($1,$2,$3,$4,$5::jsonb,'Gửi tư vấn', now() - interval '1 day','ACTIVE',$6)`,
      [randomUUID(), tenantId, revisionId, createHash('sha256').update('another').digest('hex'),
        JSON.stringify([
          { partyId: null, organisation: 'Tư vấn', contactName: 'A', contactEmail: 'a@example.test' }
        ]), authorId]
    )).rejects.toMatchObject({ constraint: 'ck_document_external_share_expiry' });
  });

  it('refuses a transmittal issued without recipients and a duplicated item', async () => {
    const documentId = await seedDocument();
    const revisionId = await seedRevision(documentId, { revisionCode: 'J' });
    await expect(AppDataSource.query(
      `INSERT INTO transmittals (
        id, tenant_id, project_id, number, purpose, status, issued_by, issued_at, created_by
      ) VALUES ($1,$2,$3,'TR-001','Phát hành','ISSUED',$4,now(),$4)`,
      [randomUUID(), tenantId, projectId, authorId]
    )).rejects.toMatchObject({ constraint: 'ck_transmittal_issued_has_recipients' });

    const transmittalId = await seedTransmittal('TR-002');
    await seedTransmittalItem(transmittalId, revisionId);
    await expect(seedTransmittalItem(transmittalId, revisionId))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('cannot reference a document, revision or project from another tenant', async () => {
    const documentId = await seedDocument();
    await expect(AppDataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, document_code, title, discipline, type, classification,
        owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'DOC-X','Tài liệu','CIVIL','DRAWING','INTERNAL',$4,'ACTIVE',$4,$4)`,
      [randomUUID(), tenantId, otherProjectId, authorId]
    )).rejects.toMatchObject({ code: '23503' });

    await expect(AppDataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, scan_status, lock_state, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'DRAFT','Phát hành','a.pdf','application/pdf','QUARANTINED','UNLOCKED',$5)`,
      [randomUUID(), otherTenantId, documentId, projectId, authorId]
    )).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps document codes unique per project and revision codes unique per working version', async () => {
    await seedDocument('DOC-UQ');
    await expect(seedDocument('DOC-UQ')).rejects.toMatchObject({ code: '23505' });

    const documentId = await seedDocument('DOC-UQ-2');
    await seedRevision(documentId, { revisionCode: 'A', workingVersion: 1 });
    await expect(seedRevision(documentId, { revisionCode: 'A', workingVersion: 1 }))
      .rejects.toMatchObject({ code: '23505' });
    await expect(seedRevision(documentId, { revisionCode: 'A', workingVersion: 2 }))
      .resolves.toBeDefined();
  });

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      tables.map((table) => `to_regclass('public.${table}')::text AS ${table}`).join(', ')
        .replace(/^/, 'SELECT ')
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function seedDocument(code = `DOC-${randomUUID().slice(0, 8).toUpperCase()}`): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, package_id, document_code, title, discipline, type,
        classification, owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'Bản vẽ mặt bằng','CIVIL','DRAWING','INTERNAL',$6,'ACTIVE',$6,$6)`,
      [id, tenantId, projectId, packageId, code, authorId]
    );
    return id;
  }

  async function seedRevision(documentId: string, overrides: {
    revisionCode: string;
    workingVersion?: number;
    status?: string;
    scanStatus?: string;
    contentHash?: string | null;
    releasedObjectKey?: string | null;
    approvedBy?: string | null;
    issuedBy?: string | null;
    lockState?: string;
  }): Promise<string> {
    const id = randomUUID();
    const approvedBy = overrides.approvedBy ?? null;
    const issuedBy = overrides.issuedBy ?? null;
    await AppDataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status, purpose,
        file_name, mime_type, quarantine_object_key, released_object_key, content_hash, size_bytes,
        scan_status, lock_state, approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'Phát hành thi công','a.pdf','application/pdf',
        'quarantine/key',$8,$9,12,$10,$11,$12,$13,$14,$15,$16
      )`,
      [
        id, tenantId, documentId, projectId, overrides.revisionCode, overrides.workingVersion ?? 1,
        overrides.status ?? 'DRAFT', overrides.releasedObjectKey ?? null,
        overrides.contentHash ?? null, overrides.scanStatus ?? 'QUARANTINED',
        overrides.lockState ?? 'UNLOCKED', approvedBy, approvedBy === null ? null : new Date(),
        issuedBy, issuedBy === null ? null : new Date(), authorId
      ]
    );
    return id;
  }

  async function seedComment(revisionId: string, sequenceNo: number): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO document_review_comments (
        id, tenant_id, revision_id, sequence_no, cycle_no, author_id, severity, body,
        disposition, correlation_id
      ) VALUES ($1,$2,$3,$4,1,$5,'MAJOR','Thiếu cao độ thiết kế','OPEN',$6)`,
      [randomUUID(), tenantId, revisionId, sequenceNo, approverId, randomUUID()]
    );
  }

  async function seedTransmittal(number: string): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO transmittals (
        id, tenant_id, project_id, number, recipient_snapshot, purpose, status,
        issued_by, issued_at, created_by
      ) VALUES ($1,$2,$3,$4,$5::jsonb,'Phát hành cho nhà thầu','ISSUED',$6,now(),$6)`,
      [id, tenantId, projectId, number, JSON.stringify([
        { partyId: null, organisation: 'Nhà thầu', contactName: 'B', contactEmail: 'b@example.test' }
      ]), authorId]
    );
    return id;
  }

  async function seedTransmittalItem(transmittalId: string, revisionId: string): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO transmittal_items (
        id, tenant_id, transmittal_id, revision_id, action_code, response_status
      ) VALUES ($1,$2,$3,$4,'FOR_REVIEW','PENDING')`,
      [randomUUID(), tenantId, transmittalId, revisionId]
    );
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'doc-mig'], [otherTenantId, 'doc-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'doc-mig-author@example.test'],
      [approverId, tenantId, 'doc-mig-approver@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await AppDataSource.query(
      `INSERT INTO user_accounts (
        id, tenant_id, email, normalized_email, display_name, status
      ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`,
      [otherTenantUserId, otherTenantId, 'doc-mig-other@example.test']
    );
    await seedProject(tenantId, projectId, 'DOC-PRJ', authorId);
    // The second project lives in the other tenant, so a composite foreign key has something real
    // to refuse.
    await seedProject(otherTenantId, otherProjectId, 'DOC-PRJ-2', otherTenantUserId);
    await AppDataSource.query(
      `INSERT INTO packages (
        id, tenant_id, project_id, code, name, package_type, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'DOC-PKG','Document Package','EPC','ACTIVE',$4,$4)`,
      [packageId, tenantId, projectId, authorId]
    );
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerId: string
  ): Promise<void> {
    const companyId = randomUUID();
    const legalId = randomUUID();
    const portfolioId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,$3,'Company DOC','INTERNAL','ACTIVE')`,
      [companyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal DOC','VN',$4,'ACTIVE')`,
      [legalId, fixtureTenantId, companyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio DOC','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Document Project','SOLAR','PLANNING','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, legalId, companyId, managerId, code]
    );
  }
});
