import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssetEntity, AssetOperationalStatus, AssignmentScopeType, AuditEventEntity, BessPlantEntity,
  BillOfMaterialsEntity, BomLineEntity, CommandReceiptEntity, CompanyEntity,
  EquipmentEntity, EquipmentLifecycleStatus, EquipmentModelEntity, EquipmentModelStatus,
  LegalEntityEntity, LocalCredentialEntity, MasterRecordStatus, OrganizationType,
  PackageEntity, PackageStatus, PlantStatus, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectType, RoleAssignmentEntity, RoleEntity, SiteEntity,
  SolarPlantEntity, TenantEntity, TransactionalOutboxEventEntity, UserAccountEntity
} from 'src/database/entities';
import {
  MALWARE_SCANNER, type MalwareScanner, type ScanResult
} from 'src/modules/document-control/malware-scanner.port';
import {
  OBJECT_STORAGE, type ObjectStorage, type PutResult, type StoredObjectRef
} from 'src/modules/document-control/object-storage.port';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const uploaderId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const packageAId = randomUUID();
const siteId = randomUUID();
const auxSiteId = randomUUID();
const otherSiteId = randomUUID();
const password = 'Engineering!Integration2026';

const fileBytes = Buffer.from('bản vẽ thiết kế BOM phiên bản A', 'utf8');
const fileContent = fileBytes.toString('base64');

const demoEnvelope = {
  note: 'Demo data — advisory bounds only, never a setpoint source',
  power: { minMw: '-2.0', maxMw: '2.0' },
  stateOfCharge: { minPercent: '10', maxPercent: '90' },
  ramp: { maxMwPerMinute: '1.0' }
};

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

  private key(ref: StoredObjectRef): string {
    return `${ref.bucket}/${ref.objectKey}`;
  }
}

/** Always-clean scanner: this suite only needs CLEAN revisions to feed API-070. */
class FakeMalwareScanner implements MalwareScanner {
  async scan(_body: Buffer): Promise<ScanResult> {
    return {
      verdict: 'CLEAN', signature: null, scannedAt: new Date(), scannerVersion: 'fake-clamd/1.0'
    };
  }
}

jest.setTimeout(180_000);

describe('Engineering & Plants HTTP integration — API-067…API-070, API-072…API-075', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let managerToken: string;
  let uploaderToken: string;
  let packageToken: string;
  let otherTenantToken: string;
  let solarDraftId: string;
  let bessReleasedId: string;
  let bessDraftAuxId: string;
  let foreignSolarId: string;
  let foreignBessId: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE).useValue(new FakeObjectStorage())
      .overrideProvider(MALWARE_SCANNER).useValue(new FakeMalwareScanner())
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
    await seedFixture();
    managerToken = await login('ep-manager@example.test', 'ep-test');
    uploaderToken = await login('ep-uploader@example.test', 'ep-test');
    packageToken = await login('ep-package@example.test', 'ep-test');
    otherTenantToken = await login('ep-other@example.test', 'ep-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-068/067: registers a DRAFT model and lists APPROVED by default, widening on demand', async () => {
    const created = await api(managerToken).post('/v1/equipment-models')
      .set('Idempotency-Key', `ep-model-${randomUUID()}`)
      .send({
        equipmentClass: 'INVERTER', manufacturer: 'Fixture Inverter Co', model: 'FI-1000',
        specVersion: 'V1', ratings: { acPowerKva: '1000' }
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      equipmentClass: 'INVERTER', manufacturer: 'Fixture Inverter Co', model: 'FI-1000',
      specVersion: 'V1', status: 'DRAFT', supersededById: null, versionNo: 1
    });

    const duplicate = await api(managerToken).post('/v1/equipment-models')
      .set('Idempotency-Key', `ep-model-${randomUUID()}`)
      .send({
        equipmentClass: 'INVERTER', manufacturer: 'Fixture Inverter Co', model: 'FI-1000',
        specVersion: 'V1'
      })
      .expect(409);
    expect(duplicate.body.code).toBe('EQUIPMENT_MODEL_CONFLICT');

    const unknownCompany = await api(managerToken).post('/v1/equipment-models')
      .set('Idempotency-Key', `ep-model-${randomUUID()}`)
      .send({
        equipmentClass: 'INVERTER', manufacturer: 'Fixture Inverter Co', model: 'FI-2000',
        specVersion: 'V1', manufacturerCompanyId: randomUUID()
      })
      .expect(422);
    expect(unknownCompany.body.code).toBe('MANUFACTURER_COMPANY_NOT_FOUND');
    // The fixture seeds one APPROVED model; only FI-1000 was added since.
    expect(await count(EquipmentModelEntity)).toBe(2);

    // Default filter: only the APPROVED catalog is listed.
    const approvedOnly = await api(managerToken).get('/v1/equipment-models').expect(200);
    expect(approvedOnly.body.data.map((row: { model: string }) => row.model))
      .toEqual(['EP-550']);
    expect(approvedOnly.body.meta).toEqual({ limit: 50, nextCursor: null });

    const widened = await api(managerToken).get('/v1/equipment-models?status=ALL').expect(200);
    expect(widened.body.data).toHaveLength(2);
    const draftsOnly = await api(managerToken)
      .get('/v1/equipment-models?status=DRAFT').expect(200);
    expect(draftsOnly.body.data.map((row: { model: string }) => row.model)).toEqual(['FI-1000']);

    const byClass = await api(managerToken)
      .get('/v1/equipment-models?status=ALL&equipmentClass=PV_MODULE').expect(200);
    expect(byClass.body.data.map((row: { model: string }) => row.model)).toEqual(['EP-550']);
    const byManufacturer = await api(managerToken)
      .get('/v1/equipment-models?status=ALL&manufacturer=Fixture Inverter Co').expect(200);
    expect(byManufacturer.body.data.map((row: { model: string }) => row.model))
      .toEqual(['FI-1000']);

    // Pagination walks the widened catalog without overlap.
    const paged = await api(managerToken)
      .get('/v1/equipment-models?status=ALL&limit=1').expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(managerToken)
      .get(`/v1/equipment-models?status=ALL&limit=1&cursor=${paged.body.meta.nextCursor}`)
      .expect(200);
    expect(next.body.data[0].id).not.toBe(paged.body.data[0].id);

    // The catalog is tenant-level: a package-scoped principal reads it, another tenant reads
    // only its own (empty) catalog.
    const packageRead = await api(packageToken).get('/v1/equipment-models').expect(200);
    expect(packageRead.body.data).toHaveLength(1);
    const foreignRead = await api(otherTenantToken, otherTenantId)
      .get('/v1/equipment-models?status=ALL').expect(200);
    expect(foreignRead.body.data.map((row: { model: string }) => row.model)).toEqual(['FC-550']);
  });

  it('API-068: replays an identical command and conflicts on a reused key with new content', async () => {
    const key = `ep-replay-${randomUUID()}`;
    const payload = {
      equipmentClass: 'TRANSFORMER', manufacturer: 'Fixture Trafo Co', model: 'FT-6300',
      specVersion: 'V1'
    };
    const first = await api(managerToken).post('/v1/equipment-models')
      .set('Idempotency-Key', key).send(payload).expect(201);
    const replay = await api(managerToken).post('/v1/equipment-models')
      .set('Idempotency-Key', key).send(payload).expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await count(EquipmentModelEntity)).toBe(2);

    const conflict = await api(managerToken).post('/v1/equipment-models')
      .set('Idempotency-Key', key).send({ ...payload, model: 'FT-9999' })
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await count(EquipmentModelEntity)).toBe(2);
  });

  it('API-070/069: releases a BOM from an issued clean design revision and lists it', async () => {
    const revision = await issuedRevision();
    const released = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id))
      .expect(200);
    expect(released.body.data).toMatchObject({
      projectId, designRevisionId: revision.id, version: 1, status: 'RELEASED',
      releasedBy: managerId, lineCount: 2, supersededBomId: null
    });
    expect(released.body.data.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(released.body.data.releasedAt).toEqual(expect.any(String));
    expect(released.body.data.lines.map(
      (line: { lineNo: number; quantity: string }) => [line.lineNo, line.quantity]
    )).toEqual([[1, '120.0000'], [2, '2.5000']]);

    // The next release supersedes the first inside the same transaction.
    const second = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id, [{ lineNo: 1, itemCode: 'PV-MOD-550', quantity: '150', unit: 'pcs' }]))
      .expect(200);
    expect(second.body.data).toMatchObject({
      version: 2, status: 'RELEASED', supersededBomId: released.body.data.id
    });
    const superseded = await dataSource.getRepository(BillOfMaterialsEntity)
      .findOneByOrFail({ id: released.body.data.id, tenantId });
    expect(superseded.status).toBe('SUPERSEDED');

    // API-069: versions with line counts, newest first, embedding lines for one version.
    const listed = await api(managerToken)
      .get(`/v1/projects/${projectId}/bill-of-materials?linesForVersion=1`).expect(200);
    expect(listed.body.data.map(
      (row: { version: number; status: string; lineCount: number }) =>
        [row.version, row.status, row.lineCount]
    )).toEqual([[2, 'RELEASED', 1], [1, 'SUPERSEDED', 2]]);
    const embedded = listed.body.data.find((row: { version: number }) => row.version === 1);
    expect(embedded.lines).toHaveLength(2);
    expect(embedded.lines[0]).toMatchObject({ lineNo: 1, itemCode: 'PV-MOD-550' });
    const unembedded = listed.body.data.find((row: { version: number }) => row.version === 2);
    expect(unembedded.lines).toBeNull();
  });

  it('API-070: refuses a non-issued revision, the design author and bad lines — writing nothing', async () => {
    // A CLEAN but never-issued revision cannot back a release.
    const draftRevision = await releasedRevision('B');
    const locked = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(draftRevision.id))
      .expect(422);
    expect(locked.body.code).toBe('DESIGN_REVISION_LOCKED');

    const missing = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(randomUUID()))
      .expect(422);
    expect(missing.body.code).toBe('DESIGN_REVISION_NOT_FOUND');

    const revision = await issuedRevision();
    // RELEASE_SOD: the uploader authored the design revision, so they may not release the BOM.
    const sod = await api(uploaderToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id))
      .expect(422);
    expect(sod.body.code).toBe('RELEASE_SOD');

    const duplicateLines = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id, [
        { lineNo: 1, itemCode: 'PV-MOD-550', quantity: '10', unit: 'pcs' },
        { lineNo: 1, itemCode: 'INV-3125', quantity: '1', unit: 'pcs' }
      ]))
      .expect(422);
    expect(duplicateLines.body.code).toBe('BOM_LINE_DUPLICATE');

    const zeroQuantity = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id, [
        { lineNo: 1, itemCode: 'PV-MOD-550', quantity: '0', unit: 'pcs' }
      ]))
      .expect(422);
    expect(zeroQuantity.body.code).toBe('QUANTITY_INVALID');

    const unknownModel = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id, [{
        lineNo: 1, itemCode: 'PV-MOD-550', quantity: '10', unit: 'pcs',
        equipmentModelId: randomUUID()
      }]))
      .expect(422);
    expect(unknownModel.body.code).toBe('EQUIPMENT_MODEL_NOT_FOUND');

    // Every 4xx above wrote zero BOM rows and zero lines.
    expect(await count(BillOfMaterialsEntity)).toBe(0);
    expect(await count(BomLineEntity)).toBe(0);
  });

  it('released BOM content is immutable even through raw SQL', async () => {
    const revision = await issuedRevision();
    const released = await api(managerToken)
      .post(`/v1/projects/${projectId}/bill-of-materials:release`)
      .set('Idempotency-Key', `ep-bom-${randomUUID()}`)
      .send(bomPayload(revision.id))
      .expect(200);

    await expect(dataSource.query(
      `UPDATE bill_of_materials SET snapshot_hash = $2 WHERE id = $1`,
      [released.body.data.id, 'f'.repeat(64)]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(dataSource.query(
      'DELETE FROM bill_of_materials WHERE id = $1', [released.body.data.id]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(dataSource.query(
      'UPDATE bom_lines SET quantity = 999 WHERE tenant_id = $1 AND bill_of_materials_id = $2',
      [tenantId, released.body.data.id]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(dataSource.query(
      `INSERT INTO bom_lines (
        id, tenant_id, bill_of_materials_id, line_no, item_code, quantity, unit
      ) VALUES ($1,$2,$3,99,'SMUGGLED',1,'pcs')`,
      [randomUUID(), tenantId, released.body.data.id]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('API-072/073: reads the plant with history and releases the next configuration version', async () => {
    const before = await api(managerToken).get(`/v1/solar-plants/${solarDraftId}`).expect(200);
    expect(before.body.data).toMatchObject({
      id: solarDraftId, projectId, siteId, status: 'DRAFT', configurationVersion: 1,
      dcCapacityKwp: '5500.0000', acCapacityKw: '4000.0000'
    });
    expect(before.body.releasedConfiguration).toBeNull();
    expect(before.body.versionHistory).toHaveLength(1);

    const configuration = { arrays: [{ code: 'ARRAY-1', stringCount: 132 }] };
    const releasedResponse = await api(managerToken)
      .post(`/v1/solar-plants/${solarDraftId}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({ expectedVersion: 1, configuration })
      .expect(200);
    expect(releasedResponse.body.data).toMatchObject({
      siteId, status: 'RELEASED', configurationVersion: 2, supersededPlantId: null
    });
    expect(releasedResponse.body.data.configurationHash).toMatch(/^[0-9a-f]{64}$/);

    const after = await api(managerToken).get(`/v1/solar-plants/${solarDraftId}`).expect(200);
    expect(after.body.releasedConfiguration).toMatchObject({
      solarPlantId: releasedResponse.body.data.id, configurationVersion: 2, configuration
    });
    expect(after.body.versionHistory.map(
      (row: { configurationVersion: number; status: string }) =>
        [row.configurationVersion, row.status]
    )).toEqual([[1, 'DRAFT'], [2, 'RELEASED']]);

    // Releasing again from the current release supersedes it atomically.
    const secondRelease = await api(managerToken)
      .post(`/v1/solar-plants/${releasedResponse.body.data.id}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({
        expectedVersion: 1, configuration: { arrays: [] },
        dcCapacityKwp: '6000', acCapacityKw: '4500'
      })
      .expect(200);
    expect(secondRelease.body.data).toMatchObject({
      configurationVersion: 3, status: 'RELEASED',
      dcCapacityKwp: '6000.0000', acCapacityKw: '4500.0000',
      supersededPlantId: releasedResponse.body.data.id
    });
    const supersededRow = await dataSource.getRepository(SolarPlantEntity)
      .findOneByOrFail({ id: releasedResponse.body.data.id, tenantId });
    expect(supersededRow.status).toBe('SUPERSEDED');

    // A released row resists raw SQL edits; only the supersede transition is legal.
    await expect(dataSource.query(
      `UPDATE solar_plants SET configuration = '{"changed":true}'::jsonb WHERE id = $1`,
      [secondRelease.body.data.id]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('API-073: version conflicts, superseded anchors and zero capacities write nothing', async () => {
    const stale = await api(managerToken)
      .post(`/v1/solar-plants/${solarDraftId}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({ expectedVersion: 9, configuration: {} })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 1 });

    const first = await api(managerToken)
      .post(`/v1/solar-plants/${solarDraftId}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({ expectedVersion: 1, configuration: {} })
      .expect(200);
    await api(managerToken)
      .post(`/v1/solar-plants/${first.body.data.id}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({ expectedVersion: 1, configuration: {} })
      .expect(200);
    // The now-superseded row can no longer anchor a release.
    const fromSuperseded = await api(managerToken)
      .post(`/v1/solar-plants/${first.body.data.id}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({ expectedVersion: 2, configuration: {} })
      .expect(422);
    expect(fromSuperseded.body.code).toBe('INVALID_STATE_TRANSITION');

    const zeroCapacity = await api(managerToken)
      .post(`/v1/solar-plants/${solarDraftId}:release-configuration`)
      .set('Idempotency-Key', `ep-solar-${randomUUID()}`)
      .send({ expectedVersion: 2, configuration: {}, dcCapacityKwp: '0' })
      .expect(422);
    expect(zeroCapacity.body.code).toBe('CAPACITY_INVALID');

    // Exactly the two successful releases exist beyond the seeded draft.
    expect(await count(SolarPlantEntity)).toBe(3);
  });

  it('API-074: returns the BESS plant with envelope and explicitly null KPI/telemetry', async () => {
    const response = await api(managerToken).get(`/v1/bess-plants/${bessReleasedId}`).expect(200);
    expect(response.body.data).toMatchObject({
      id: bessReleasedId, projectId, siteId, status: 'RELEASED', hierarchyVersion: 1,
      powerMw: '2.0000', energyMwh: '4.0000', pointListVersion: null
    });
    expect(response.body.data.operatingEnvelope).toMatchObject({
      power: { minMw: '-2.0', maxMw: '2.0' }
    });
    // No telemetry tables exist; the read model says so explicitly instead of inventing data.
    expect(response.body.data.kpi).toBeNull();
    expect(response.body.data.telemetry).toBeNull();
  });

  it('API-075: verdicts are advisory, exact and persist nothing but the receipt', async () => {
    const auditBefore = await count(AuditEventEntity);
    const outboxBefore = await count(TransactionalOutboxEventEntity);
    const receiptsBefore = await count(CommandReceiptEntity);

    const feasible = await api(managerToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', `ep-sim-${randomUUID()}`)
      .send({
        intervalMinutes: 15, initialSocPercent: '50',
        steps: [{ powerMw: '1.5' }, { powerMw: '-1.5' }, { powerMw: '2.0' }]
      })
      .expect(200);
    expect(feasible.body.data).toEqual({
      bessPlantId: bessReleasedId,
      envelope: { bessPlantId: bessReleasedId, hierarchyVersion: 1 },
      advisory: true, feasible: true, evaluatedSteps: 3, intervalMinutes: 15, violations: []
    });

    const infeasible = await api(managerToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', `ep-sim-${randomUUID()}`)
      .send({
        intervalMinutes: 1, initialSocPercent: '95',
        steps: [{ powerMw: '2.5' }, { powerMw: '-2.5' }]
      })
      .expect(200);
    expect(infeasible.body.data.feasible).toBe(false);
    expect(infeasible.body.data.violations).toEqual([
      { code: 'SOC_OUT_OF_ENVELOPE', stepIndex: null, limit: '90', actual: '95' },
      { code: 'POWER_ABOVE_MAX', stepIndex: 0, limit: '2.0', actual: '2.5' },
      { code: 'POWER_BELOW_MIN', stepIndex: 1, limit: '-2.0', actual: '-2.5' },
      { code: 'RAMP_EXCEEDED', stepIndex: 1, limit: '1', actual: '5' }
    ]);

    // The aux site has only a DRAFT hierarchy: no released envelope, no simulation.
    const missing = await api(managerToken)
      .post(`/v1/bess-plants/${bessDraftAuxId}:simulate-dispatch`)
      .set('Idempotency-Key', `ep-sim-${randomUUID()}`)
      .send({ intervalMinutes: 15, steps: [{ powerMw: '1' }] })
      .expect(422);
    expect(missing.body.code).toBe('OPERATING_ENVELOPE_MISSING');

    // SEC-128 discipline: three commands, two receipts committed (the 422 rolled back), zero
    // audit rows, zero outbox events — nothing command-shaped can ever reach OT from here.
    expect(await count(AuditEventEntity)).toBe(auditBefore);
    expect(await count(TransactionalOutboxEventEntity)).toBe(outboxBefore);
    expect(await count(CommandReceiptEntity)).toBe(receiptsBefore + 2);

    // Replay returns the stored verdict instead of recomputing.
    const key = `ep-sim-${randomUUID()}`;
    const scenario = { intervalMinutes: 5, steps: [{ powerMw: '1.0' }] };
    const first = await api(managerToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', key).send(scenario).expect(200);
    const replay = await api(managerToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', key).send(scenario).expect(200);
    expect(replay.body.data).toEqual(first.body.data);
    const conflict = await api(managerToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', key)
      .send({ intervalMinutes: 5, steps: [{ powerMw: '2.0' }] })
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('scope: package-only principals and other tenants get 404, permission gaps get 403', async () => {
    // The package principal holds the codes, but BOMs and plants have no package granularity.
    const scopedList = await api(packageToken)
      .get(`/v1/projects/${projectId}/bill-of-materials`).expect(404);
    expect(scopedList.body.code).toBe('PROJECT_NOT_FOUND');
    await api(packageToken).get(`/v1/solar-plants/${solarDraftId}`).expect(404);
    await api(packageToken).get(`/v1/bess-plants/${bessReleasedId}`).expect(404);
    const scopedSimulate = await api(packageToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', `ep-scope-${randomUUID()}`)
      .send({ intervalMinutes: 15, steps: [{ powerMw: '1' }] })
      .expect(404);
    expect(scopedSimulate.body.code).toBe('BESS_PLANT_NOT_FOUND');

    // Another tenant cannot even learn that the ids exist — including its own probing ids.
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/bill-of-materials`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/solar-plants/${solarDraftId}`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/bess-plants/${bessReleasedId}`).expect(404);
    // And this tenant cannot reach the other tenant's plants either.
    await api(managerToken).get(`/v1/solar-plants/${foreignSolarId}`).expect(404);
    await api(managerToken).get(`/v1/bess-plants/${foreignBessId}`).expect(404);

    // 403 stays reserved for a true permission gap: the uploader cannot simulate or configure.
    const denied = await api(uploaderToken)
      .post(`/v1/bess-plants/${bessReleasedId}:simulate-dispatch`)
      .set('Idempotency-Key', `ep-scope-${randomUUID()}`)
      .send({ intervalMinutes: 15, steps: [{ powerMw: '1' }] })
      .expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    await api(uploaderToken)
      .post(`/v1/solar-plants/${solarDraftId}:release-configuration`)
      .set('Idempotency-Key', `ep-scope-${randomUUID()}`)
      .send({ expectedVersion: 1, configuration: {} })
      .expect(403);
    // Nothing above wrote a row: the tenant still holds only the seeded draft plant.
    expect(await count(SolarPlantEntity)).toBe(1);
  });

  it('rejects a malformed cursor and a missing Idempotency-Key without writing', async () => {
    const cursor = await api(managerToken)
      .get('/v1/equipment-models?cursor=not-a-cursor').expect(400);
    expect(cursor.body.code).toBe('INVALID_CURSOR');

    const missingKey = await api(managerToken).post('/v1/equipment-models')
      .send({
        equipmentClass: 'INVERTER', manufacturer: 'No Key Co', model: 'NK-1', specVersion: 'V1'
      })
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await count(EquipmentModelEntity)).toBe(1);
    expect(await count(BillOfMaterialsEntity)).toBe(0);
  });

  function bomPayload(designRevisionId: string, lines?: Array<Record<string, unknown>>) {
    return {
      designRevisionId,
      lines: lines ?? [
        { lineNo: 1, itemCode: 'PV-MOD-550', description: 'Tấm quang điện 550 Wp',
          quantity: '120', unit: 'pcs' },
        { lineNo: 2, itemCode: 'CABLE-DC', quantity: '2.5', unit: 'km' }
      ]
    };
  }

  async function createDocument() {
    const response = await api(managerToken).post(`/v1/projects/${projectId}/documents`)
      .set('Idempotency-Key', `ep-doc-${randomUUID()}`)
      .send({
        documentCode: `ELE-DWG-${randomUUID().slice(0, 8).toUpperCase()}`,
        title: 'Bản vẽ thiết kế hệ thống điện', discipline: 'ELECTRICAL', type: 'DRAWING',
        classification: 'INTERNAL', packageId: packageAId
      })
      .expect(201);
    return response.body.data as { id: string };
  }

  async function openUploadSession(documentId: string, revisionCode: string) {
    const response = await api(uploaderToken)
      .post(`/v1/documents/${documentId}/upload-sessions`)
      .set('Idempotency-Key', `ep-upload-${randomUUID()}`)
      .send({
        revisionCode, purpose: 'Phát hành thi công', fileName: 'thiet-ke.pdf',
        mimeType: 'application/pdf', content: fileContent
      })
      .expect(201);
    return response.body.data as { id: string; versionNo: number };
  }

  /** A DRAFT revision whose bytes passed the scanner: CLEAN but deliberately not ISSUED. */
  async function releasedRevision(revisionCode: string) {
    const document = await createDocument();
    const session = await openUploadSession(document.id, revisionCode);
    const response = await api(uploaderToken)
      .post(`/v1/upload-sessions/${session.id}:finalize`)
      .set('Idempotency-Key', `ep-finalize-${randomUUID()}`)
      .send({})
      .expect(200);
    return response.body.data as { id: string; versionNo: number };
  }

  /** The full document-control path to an ISSUED, scan-CLEAN revision uploaded by the uploader. */
  async function issuedRevision() {
    const finalized = await releasedRevision('A');
    const submitted = await api(uploaderToken)
      .post(`/v1/document-revisions/${finalized.id}:submit-review`)
      .set('Idempotency-Key', `ep-submit-${randomUUID()}`)
      .send({ expectedVersion: finalized.versionNo, note: 'Trình duyệt thiết kế' })
      .expect(200);
    const approved = await api(managerToken)
      .post(`/v1/document-revisions/${finalized.id}:approve`)
      .set('Idempotency-Key', `ep-approve-${randomUUID()}`)
      .send({ expectedVersion: submitted.body.data.versionNo, comment: 'Đồng ý phê duyệt' })
      .expect(200);
    const issued = await api(managerToken)
      .post(`/v1/document-revisions/${finalized.id}:issue`)
      .set('Idempotency-Key', `ep-issue-${randomUUID()}`)
      .send({ expectedVersion: approved.body.data.versionNo, comment: 'Phát hành cho thi công' })
      .expect(200);
    return issued.body.data as { id: string; versionNo: number };
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'ep-test', name: 'Engineering Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'ep-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'ep-manager@example.test', 'Engineering Manager'),
      user(uploaderId, tenantId, 'ep-uploader@example.test', 'Design Uploader'),
      user(packageUserId, tenantId, 'ep-package@example.test', 'Package Reader'),
      user(otherTenantUserId, otherTenantId, 'ep-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(uploaderId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const managerRole = await role(tenantId, 'EP_MANAGER', [
      'equipmentModel.read', 'equipmentModel.create', 'bom.read', 'bom.release',
      'solarPlant.read', 'solarPlant.configure', 'bessPlant.read', 'bessSimulation.run',
      'document.read', 'document.create', 'documentRevision.read',
      'documentRevision.approve', 'documentRevision.issue'
    ]);
    // The design author: may upload/submit designs and release BOMs, but the SoD check must
    // still refuse them for revisions they uploaded; no simulate/configure grant → 403 there.
    const uploaderRole = await role(tenantId, 'EP_UPLOADER', [
      'equipmentModel.read', 'bom.read', 'bom.release',
      'document.read', 'documentRevision.read', 'documentRevision.upload',
      'documentRevision.submitReview'
    ]);
    // Holds the read/simulate codes but only at package scope: the service must answer 404.
    const packageRole = await role(tenantId, 'EP_PACKAGE', [
      'equipmentModel.read', 'bom.read', 'solarPlant.read', 'bessPlant.read',
      'bessSimulation.run'
    ]);
    const otherRole = await role(otherTenantId, 'EP_OTHER', [
      'equipmentModel.read', 'bom.read', 'solarPlant.read', 'bessPlant.read',
      'bessSimulation.run'
    ]);

    await seedProject(tenantId, projectId, 'EP-PRJ', managerId);
    await seedProject(otherTenantId, otherProjectId, 'EP-OTH', otherTenantUserId);
    await dataSource.getRepository(SiteEntity).save([
      site(siteId, tenantId, projectId, 'MAIN', true),
      site(auxSiteId, tenantId, projectId, 'AUX', false),
      site(otherSiteId, otherTenantId, otherProjectId, 'MAIN', true)
    ]);
    await dataSource.getRepository(PackageEntity).save({
      id: packageAId, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
      code: 'EP-PKG-A', name: 'EP-PKG-A', packageType: 'EPC', status: PackageStatus.ACTIVE,
      versionNo: 1, idempotencyKey: null, createdBy: managerId, updatedBy: managerId
    });

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, uploaderId, uploaderRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageAId),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);

    await seedPlants();
  }

  /** Plants have no create operation (decision D1), so the fixture writes the rows directly. */
  async function seedPlants(): Promise<void> {
    const model = await dataSource.getRepository(EquipmentModelEntity).save({
      id: randomUUID(), tenantId, manufacturerCompanyId: null,
      equipmentClass: 'PV_MODULE', manufacturer: 'EP Module Co', model: 'EP-550',
      ratings: { powerWp: '550' }, specVersion: 'V1', status: EquipmentModelStatus.APPROVED,
      supersededById: null, createdBy: managerId, updatedBy: managerId
    });
    const foreignModel = await dataSource.getRepository(EquipmentModelEntity).save({
      id: randomUUID(), tenantId: otherTenantId, manufacturerCompanyId: null,
      equipmentClass: 'PV_MODULE', manufacturer: 'Foreign Co', model: 'FC-550',
      ratings: {}, specVersion: 'V1', status: EquipmentModelStatus.APPROVED,
      supersededById: null, createdBy: otherTenantUserId, updatedBy: otherTenantUserId
    });

    const equipmentRows = [
      { tenant: tenantId, project: projectId, site: siteId, model: model.id,
        type: 'SOLAR_PLANT_ROOT', code: 'EP-SOLAR-ROOT', actor: managerId },
      { tenant: tenantId, project: projectId, site: siteId, model: model.id,
        type: 'BESS_PLANT_ROOT', code: 'EP-BESS-ROOT', actor: managerId },
      { tenant: tenantId, project: projectId, site: auxSiteId, model: model.id,
        type: 'BESS_PLANT_ROOT', code: 'EP-BESS-AUX', actor: managerId },
      { tenant: otherTenantId, project: otherProjectId, site: otherSiteId,
        model: foreignModel.id, type: 'SOLAR_PLANT_ROOT', code: 'FO-SOLAR-ROOT',
        actor: otherTenantUserId },
      { tenant: otherTenantId, project: otherProjectId, site: otherSiteId,
        model: foreignModel.id, type: 'BESS_PLANT_ROOT', code: 'FO-BESS-ROOT',
        actor: otherTenantUserId }
    ];
    const assets = new Map<string, string>();
    for (const row of equipmentRows) {
      const equipment = await dataSource.getRepository(EquipmentEntity).save({
        id: randomUUID(), tenantId: row.tenant, projectId: row.project,
        equipmentModelId: row.model, serialNumberId: null, parentEquipmentId: null,
        equipmentType: row.type, siteId: row.site, systemId: null,
        lifecycleStatus: EquipmentLifecycleStatus.RECEIVED, installedAt: null,
        replacedById: null, createdBy: row.actor, updatedBy: row.actor
      });
      const asset = await dataSource.getRepository(AssetEntity).save({
        id: randomUUID(), tenantId: row.tenant, equipmentId: equipment.id,
        projectId: row.project, siteId: row.site, assetCode: row.code,
        activationDate: null, operationalStatus: AssetOperationalStatus.PENDING,
        dossierRef: null, externalFinancialAssetRef: null,
        createdBy: row.actor, updatedBy: row.actor
      });
      assets.set(row.code, asset.id);
    }

    const solarConfiguration = { note: 'fixture', arrays: [] };
    solarDraftId = (await dataSource.getRepository(SolarPlantEntity).save({
      id: randomUUID(), tenantId, projectId, siteId,
      rootAssetId: assets.get('EP-SOLAR-ROOT')!,
      dcCapacityKwp: '5500.0000', acCapacityKw: '4000.0000',
      configurationVersion: 1, configuration: solarConfiguration,
      configurationHash: createHash('sha256')
        .update(JSON.stringify(solarConfiguration)).digest('hex'),
      baselineRef: null, status: PlantStatus.DRAFT,
      createdBy: managerId, updatedBy: managerId
    })).id;
    foreignSolarId = (await dataSource.getRepository(SolarPlantEntity).save({
      id: randomUUID(), tenantId: otherTenantId, projectId: otherProjectId, siteId: otherSiteId,
      rootAssetId: assets.get('FO-SOLAR-ROOT')!,
      dcCapacityKwp: '1000.0000', acCapacityKw: '800.0000',
      configurationVersion: 1, configuration: {},
      configurationHash: createHash('sha256').update('{}').digest('hex'),
      baselineRef: null, status: PlantStatus.DRAFT,
      createdBy: otherTenantUserId, updatedBy: otherTenantUserId
    })).id;

    bessReleasedId = (await dataSource.getRepository(BessPlantEntity).save({
      id: randomUUID(), tenantId, projectId, siteId,
      rootAssetId: assets.get('EP-BESS-ROOT')!,
      powerMw: '2.0000', energyMwh: '4.0000', hierarchyVersion: 1,
      operatingEnvelope: demoEnvelope, pointListVersion: null, status: PlantStatus.RELEASED,
      createdBy: managerId, updatedBy: managerId
    })).id;
    bessDraftAuxId = (await dataSource.getRepository(BessPlantEntity).save({
      id: randomUUID(), tenantId, projectId, siteId: auxSiteId,
      rootAssetId: assets.get('EP-BESS-AUX')!,
      powerMw: '1.0000', energyMwh: '2.0000', hierarchyVersion: 1,
      operatingEnvelope: demoEnvelope, pointListVersion: null, status: PlantStatus.DRAFT,
      createdBy: managerId, updatedBy: managerId
    })).id;
    foreignBessId = (await dataSource.getRepository(BessPlantEntity).save({
      id: randomUUID(), tenantId: otherTenantId, projectId: otherProjectId, siteId: otherSiteId,
      rootAssetId: assets.get('FO-BESS-ROOT')!,
      powerMw: '1.0000', energyMwh: '2.0000', hierarchyVersion: 1,
      operatingEnvelope: demoEnvelope, pointListVersion: null, status: PlantStatus.RELEASED,
      createdBy: otherTenantUserId, updatedBy: otherTenantUserId
    })).id;
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerUserId: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code: `COMP-${code}`,
      name: `Company ${code}`, organizationType: OrganizationType.INTERNAL,
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
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
      ownerLegalEntityId: legal.id, customerCompanyId: company.id,
      projectManagerId: managerUserId, code, name: `Project ${code}`, type: ProjectType.SOLAR,
      phase: ProjectPhase.EXECUTION, recordStatus: ProjectRecordStatus.ACTIVE,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31', forecastCod: null,
      versionNo: 1, idempotencyKey: null
    });
  }

  function site(
    id: string, fixtureTenantId: string, fixtureProjectId: string,
    code: string, isPrimary: boolean
  ) {
    return {
      id, tenantId: fixtureTenantId, projectId: fixtureProjectId, code,
      name: `Site ${code}`, location: null, timezone: 'Asia/Ho_Chi_Minh',
      isPrimary, status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    };
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 8, status: MasterRecordStatus.ACTIVE
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
});
