import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateEngineeringPlants1783744000000';
const grantMigrationName = 'GrantEngineeringPermissions1783745000000';
const tables = [
  'equipment_models', 'bill_of_materials', 'bom_lines',
  'equipment', 'assets', 'solar_plants', 'bess_plants'
];
const sharedConstraints = ['uq_sites_tenant_project_id', 'uq_wbs_nodes_tenant_project_id'];

describe('Engineering & Plants migration — DB-041…DB-043, DB-079…DB-082', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const uploaderId = randomUUID();
  const releaserId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const revisionId = randomUUID();

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

  it('creates every table and both shared candidate keys, drops them on down, restores on re-up', async () => {
    expect(await regclasses()).toEqual(tables);
    expect(await sharedConstraintCount()).toBe(2);

    await revertThroughMigration(migrationName);
    expect(await regclasses()).toEqual([]);
    expect(await sharedConstraintCount()).toBe(0);

    await AppDataSource.runMigrations({ transaction: 'all' });
    expect(await regclasses()).toEqual(tables);
    expect(await sharedConstraintCount()).toBe(2);
  });

  it('grants the engineering permissions at policy 8 and takes back exactly what it added', async () => {
    const roleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_CONTROLS','Project Controls',$3::jsonb,1,'ACTIVE')`,
      [roleId, tenantId, JSON.stringify(['package.read', 'bom.read'])]
    );
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    const granted = await permissionsOf(roleId);
    expect(granted).toEqual(expect.arrayContaining([
      'equipmentModel.read', 'equipmentModel.create', 'bom.read',
      'solarPlant.read', 'bessPlant.read', 'bessSimulation.run'
    ]));
    // Controls neither releases a BOM nor configures a plant.
    expect(granted).not.toContain('bom.release');
    expect(granted).not.toContain('solarPlant.configure');
    const [role] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
    );
    // Floor, not equality: the full migration chain runs later grant slices that raise the same
    // role's policy version, so an exact match would break every time a slice lands.
    expect(role.policyVersion).toBeGreaterThanOrEqual(8);

    await revertThroughMigration(grantMigrationName);
    const reverted = await permissionsOf(roleId);
    // The pre-existing `bom.read` was not added by this migration, so it must survive.
    expect(reverted).toEqual(['package.read', 'bom.read']);

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('freezes APPROVED equipment models except the supersede transition', async () => {
    const draftId = await seedEquipmentModel({ model: 'DM-DRAFT', status: 'DRAFT' });
    await expect(AppDataSource.query(
      `UPDATE equipment_models SET manufacturer = 'Renamed Co' WHERE id = $1`, [draftId]
    )).resolves.toBeDefined();
    await expect(AppDataSource.query(
      'DELETE FROM equipment_models WHERE id = $1', [draftId]
    )).resolves.toBeDefined();

    const approvedId = await seedEquipmentModel({ model: 'DM-APPROVED', status: 'APPROVED' });
    for (const statement of [
      `UPDATE equipment_models SET ratings = '{"changed":true}'::jsonb WHERE id = $1`,
      `UPDATE equipment_models SET model = 'DM-RENAMED' WHERE id = $1`,
      `UPDATE equipment_models SET status = 'DRAFT' WHERE id = $1`,
      'DELETE FROM equipment_models WHERE id = $1'
    ]) {
      await expect(AppDataSource.query(statement, [approvedId]))
        .rejects.toMatchObject({ code: '55000' });
    }

    // The one legal exit: APPROVED → SUPERSEDED writing the successor pointer.
    const successorId = await seedEquipmentModel({ model: 'DM-NEXT', status: 'APPROVED' });
    await expect(AppDataSource.query(
      `UPDATE equipment_models SET status = 'SUPERSEDED', superseded_by_id = $2 WHERE id = $1`,
      [approvedId, successorId]
    )).resolves.toBeDefined();
    // SUPERSEDED is terminal.
    await expect(AppDataSource.query(
      `UPDATE equipment_models SET superseded_by_id = NULL, status = 'DRAFT' WHERE id = $1`,
      [approvedId]
    )).rejects.toMatchObject({ code: '55000' });

    // The catalog identity is unique per tenant.
    await expect(seedEquipmentModel({ model: 'DM-NEXT', status: 'DRAFT' }))
      .rejects.toMatchObject({ constraint: 'uq_equipment_model_identity' });
    // A supersede pointer requires SUPERSEDED status.
    await expect(AppDataSource.query(
      `UPDATE equipment_models SET superseded_by_id = $2 WHERE id = $1`,
      [successorId, draftId]
    )).rejects.toMatchObject({ constraint: 'ck_equipment_model_superseded_status' });
  });

  it('keeps one RELEASED BOM per project and freezes released content including lines', async () => {
    // Lines can only enter while the parent is DRAFT; the release then freezes them with it.
    const releasedId = await seedBom({ version: 1, status: 'DRAFT' });
    const lineId = await seedBomLine(releasedId, 1, 'ITEM-FIRST');
    await AppDataSource.query(
      `UPDATE bill_of_materials SET status = 'RELEASED', snapshot_hash = $2,
        released_by = $3, released_at = now() WHERE id = $1`,
      [releasedId, 'a'.repeat(64), releaserId]
    );

    await expect(seedBom({ version: 2, status: 'RELEASED' }))
      .rejects.toMatchObject({ code: '23505' });

    // Released header: only the supersede transition may touch it.
    await expect(AppDataSource.query(
      `UPDATE bill_of_materials SET snapshot_hash = $2 WHERE id = $1`,
      [releasedId, 'f'.repeat(64)]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM bill_of_materials WHERE id = $1', [releasedId]
    )).rejects.toMatchObject({ code: '55000' });

    // Released lines: no update, no delete, no smuggled insert.
    await expect(AppDataSource.query(
      'UPDATE bom_lines SET quantity = 999 WHERE id = $1', [lineId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM bom_lines WHERE id = $1', [lineId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(seedBomLine(releasedId, 2, 'SMUGGLED'))
      .rejects.toMatchObject({ code: '55000' });

    // Supersede, then the next release becomes legal.
    await expect(AppDataSource.query(
      `UPDATE bill_of_materials SET status = 'SUPERSEDED' WHERE id = $1`, [releasedId]
    )).resolves.toBeDefined();
    await expect(seedBom({ version: 2, status: 'RELEASED' })).resolves.toBeDefined();
    // Superseded stays frozen.
    await expect(AppDataSource.query(
      `UPDATE bill_of_materials SET status = 'DRAFT' WHERE id = $1`, [releasedId]
    )).rejects.toMatchObject({ code: '55000' });

    // RELEASED requires its release evidence.
    await expect(seedBom({ version: 3, status: 'RELEASED', withoutHash: true }))
      .rejects.toMatchObject({ constraint: 'ck_bom_released_fields' });
    // Draft lines stay editable and line numbers are unique per BOM.
    const draftId = await seedBom({ version: 4, status: 'DRAFT' });
    await seedBomLine(draftId, 1, 'ITEM-A');
    await expect(seedBomLine(draftId, 1, 'ITEM-B'))
      .rejects.toMatchObject({ constraint: 'uq_bom_line_number' });
    await expect(AppDataSource.query(
      `INSERT INTO bom_lines (
        id, tenant_id, bill_of_materials_id, line_no, item_code, quantity, unit
      ) VALUES ($1,$2,$3,9,'ITEM-ZERO',0,'pcs')`,
      [randomUUID(), tenantId, draftId]
    )).rejects.toMatchObject({ constraint: 'ck_bom_line_quantity' });
  });

  it('never deletes equipment, terminates at RETIRED and pins sites to the project', async () => {
    const modelId = await seedEquipmentModel({ model: 'DM-EQ', status: 'APPROVED' });
    const equipmentId = await seedEquipment(modelId, { serialNumberId: randomUUID() });

    await expect(AppDataSource.query('DELETE FROM equipment WHERE id = $1', [equipmentId]))
      .rejects.toMatchObject({ code: '55000' });
    // The serial claim is unique while present.
    const [{ serial }] = await AppDataSource.query<Array<{ serial: string }>>(
      'SELECT serial_number_id AS serial FROM equipment WHERE id = $1', [equipmentId]
    );
    await expect(seedEquipment(modelId, { serialNumberId: serial }))
      .rejects.toMatchObject({ code: '23505' });

    await AppDataSource.query(
      `UPDATE equipment SET lifecycle_status = 'RETIRED' WHERE id = $1`, [equipmentId]
    );
    await expect(AppDataSource.query(
      `UPDATE equipment SET lifecycle_status = 'RECEIVED' WHERE id = $1`, [equipmentId]
    )).rejects.toMatchObject({ code: '55000' });

    // The composite (tenant, project, site) key refuses another project's site outright.
    await expect(seedEquipment(modelId, { siteId: otherSiteId }))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('keeps one live asset per equipment and refuses asset deletion', async () => {
    const modelId = await seedEquipmentModel({ model: 'DM-ASSET', status: 'APPROVED' });
    const equipmentId = await seedEquipment(modelId, {});
    const assetId = await seedAsset(equipmentId, 'AST-001');

    await expect(AppDataSource.query('DELETE FROM assets WHERE id = $1', [assetId]))
      .rejects.toMatchObject({ code: '55000' });
    await expect(seedAsset(equipmentId, 'AST-002'))
      .rejects.toMatchObject({ code: '23505' });
    // Archiving frees the slot.
    await AppDataSource.query(
      `UPDATE assets SET operational_status = 'ARCHIVED' WHERE id = $1`, [assetId]
    );
    await expect(seedAsset(equipmentId, 'AST-002')).resolves.toBeDefined();
    // Asset codes stay unique tenant-wide.
    await expect(seedAsset(equipmentId, 'AST-002'))
      .rejects.toMatchObject({ constraint: 'uq_asset_code' });
  });

  it('versions plant configurations per site with a single release and frozen history', async () => {
    const modelId = await seedEquipmentModel({ model: 'DM-PLANT', status: 'APPROVED' });
    const equipmentId = await seedEquipment(modelId, {});
    const assetId = await seedAsset(equipmentId, 'AST-PLANT');

    const releasedId = await seedSolarPlant(assetId, { version: 1, status: 'RELEASED' });
    await expect(seedSolarPlant(assetId, { version: 2, status: 'RELEASED' }))
      .rejects.toMatchObject({ code: '23505' });
    await expect(seedSolarPlant(assetId, { version: 1, status: 'DRAFT' }))
      .rejects.toMatchObject({ constraint: 'uq_solar_plant_config_version' });

    await expect(AppDataSource.query(
      `UPDATE solar_plants SET configuration = '{"changed":true}'::jsonb WHERE id = $1`,
      [releasedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM solar_plants WHERE id = $1', [releasedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE solar_plants SET status = 'SUPERSEDED' WHERE id = $1`, [releasedId]
    )).resolves.toBeDefined();
    await expect(seedSolarPlant(assetId, { version: 2, status: 'RELEASED' }))
      .resolves.toBeDefined();

    // The same discipline holds for BESS hierarchies.
    const bessReleasedId = await seedBessPlant(assetId, { version: 1, status: 'RELEASED' });
    await expect(seedBessPlant(assetId, { version: 2, status: 'RELEASED' }))
      .rejects.toMatchObject({ code: '23505' });
    await expect(AppDataSource.query(
      `UPDATE bess_plants SET operating_envelope = '{"power":{}}'::jsonb WHERE id = $1`,
      [bessReleasedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE bess_plants SET status = 'SUPERSEDED' WHERE id = $1`, [bessReleasedId]
    )).resolves.toBeDefined();
    await expect(seedBessPlant(assetId, { version: 2, status: 'RELEASED' }))
      .resolves.toBeDefined();
  });

  it('cannot reference another tenant across any engineering foreign key', async () => {
    // BOM referencing the other tenant's project.
    await expect(seedBom({ version: 1, status: 'DRAFT', projectId: otherProjectId }))
      .rejects.toMatchObject({ code: '23503' });

    // BOM line referencing the other tenant's equipment model.
    const foreignModelId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO equipment_models (
        id, tenant_id, equipment_class, manufacturer, model, spec_version, status,
        created_by, updated_by
      ) VALUES ($1,$2,'PV_MODULE','Foreign Co','FM-1','V1','APPROVED',$3,$3)`,
      [foreignModelId, otherTenantId, otherTenantUserId]
    );
    const draftBomId = await seedBom({ version: 1, status: 'DRAFT' });
    await expect(AppDataSource.query(
      `INSERT INTO bom_lines (
        id, tenant_id, bill_of_materials_id, equipment_model_id, line_no, item_code,
        quantity, unit
      ) VALUES ($1,$2,$3,$4,1,'ITEM-X',1,'pcs')`,
      [randomUUID(), tenantId, draftBomId, foreignModelId]
    )).rejects.toMatchObject({ code: '23503' });

    // Equipment referencing the other tenant's model.
    await expect(seedEquipment(foreignModelId, {}))
      .rejects.toMatchObject({ code: '23503' });

    // BOM referencing the other tenant's design revision.
    const foreignRevisionId = await seedForeignRevision();
    await expect(seedBom({ version: 2, status: 'DRAFT', designRevisionId: foreignRevisionId }))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('SEC-127/SEC-128: the plant tables carry no credential-shaped column', async () => {
    for (const table of ['bess_plants', 'solar_plants']) {
      const columns = await AppDataSource.query<Array<{ columnName: string }>>(
        `SELECT column_name AS "columnName" FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`, [table]
      );
      expect(columns.length).toBeGreaterThan(0);
      const offending = columns
        .map((row) => row.columnName)
        .filter((name) => /host|password|secret|token|credential|url|endpoint|username|api_key|apikey/i.test(name));
      expect(offending).toEqual([]);
    }
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

  async function sharedConstraintCount(): Promise<number> {
    const [row] = await AppDataSource.query<Array<{ count: string }>>(
      'SELECT count(*)::text AS count FROM pg_constraint WHERE conname = ANY($1::text[])',
      [sharedConstraints]
    );
    return Number(row.count);
  }

  async function seedEquipmentModel(overrides: {
    model: string; status: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO equipment_models (
        id, tenant_id, equipment_class, manufacturer, model, spec_version, status,
        ratings, created_by, updated_by
      ) VALUES ($1,$2,'PV_MODULE','Demo Co',$3,'V1',$4,'{"note":"fixture"}'::jsonb,$5,$5)`,
      [id, tenantId, overrides.model, overrides.status, uploaderId]
    );
    return id;
  }

  async function seedBom(overrides: {
    version: number; status: string; projectId?: string; designRevisionId?: string;
    withoutHash?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    const released = overrides.status === 'RELEASED' || overrides.status === 'SUPERSEDED';
    const withHash = released && overrides.withoutHash !== true;
    await AppDataSource.query(
      `INSERT INTO bill_of_materials (
        id, tenant_id, project_id, design_revision_id, version, status,
        released_by, released_at, snapshot_hash, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [
        id, tenantId, overrides.projectId ?? projectId,
        overrides.designRevisionId ?? revisionId, overrides.version, overrides.status,
        withHash ? releaserId : null, withHash ? new Date() : null,
        withHash ? 'a'.repeat(64) : null, releaserId
      ]
    );
    return id;
  }

  async function seedBomLine(bomId: string, lineNo: number, itemCode: string): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO bom_lines (
        id, tenant_id, bill_of_materials_id, line_no, item_code, quantity, unit
      ) VALUES ($1,$2,$3,$4,$5,'10.5000','pcs')`,
      [id, tenantId, bomId, lineNo, itemCode]
    );
    return id;
  }

  async function seedEquipment(modelId: string, overrides: {
    serialNumberId?: string; siteId?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO equipment (
        id, tenant_id, project_id, equipment_model_id, serial_number_id, equipment_type,
        site_id, lifecycle_status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,'INVERTER',$6,'RECEIVED',$7,$7)`,
      [
        id, tenantId, projectId, modelId, overrides.serialNumberId ?? null,
        overrides.siteId ?? siteId, uploaderId
      ]
    );
    return id;
  }

  async function seedAsset(equipmentId: string, assetCode: string): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO assets (
        id, tenant_id, equipment_id, project_id, site_id, asset_code, operational_status,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$7)`,
      [id, tenantId, equipmentId, projectId, siteId, assetCode, uploaderId]
    );
    return id;
  }

  async function seedSolarPlant(assetId: string, overrides: {
    version: number; status: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO solar_plants (
        id, tenant_id, project_id, site_id, root_asset_id, dc_capacity_kwp, ac_capacity_kw,
        configuration_version, configuration, configuration_hash, status,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,5500,4000,$6,'{"note":"fixture"}'::jsonb,$7,$8,$9,$9)`,
      [
        id, tenantId, projectId, siteId, assetId, overrides.version,
        'b'.repeat(64), overrides.status, uploaderId
      ]
    );
    return id;
  }

  async function seedBessPlant(assetId: string, overrides: {
    version: number; status: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO bess_plants (
        id, tenant_id, project_id, site_id, root_asset_id, power_mw, energy_mwh,
        hierarchy_version, operating_envelope, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,2,4,$6,
        '{"power":{"minMw":"-2.0","maxMw":"2.0"}}'::jsonb,$7,$8,$8)`,
      [id, tenantId, projectId, siteId, assetId, overrides.version, overrides.status, uploaderId]
    );
    return id;
  }

  async function seedForeignRevision(): Promise<string> {
    const documentId = randomUUID();
    const foreignRevisionId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, document_code, title, discipline, type, classification,
        owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'FOREIGN-DOC-001','Foreign design','ELECTRICAL','DRAWING','INTERNAL',
        $4,'ACTIVE',$4,$4)`,
      [documentId, otherTenantId, otherProjectId, otherTenantUserId]
    );
    await AppDataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status,
        purpose, file_name, mime_type, released_object_key, content_hash, scan_status,
        lock_state, approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'ISSUED','For construction','foreign.pdf','application/pdf',
        'release/foreign.pdf',$5,'CLEAN','LOCKED',$6,now(),$6,now(),$6)`,
      [
        foreignRevisionId, otherTenantId, documentId, otherProjectId,
        'c'.repeat(64), otherTenantUserId
      ]
    );
    return foreignRevisionId;
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'ep-mig'], [otherTenantId, 'ep-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [uploaderId, tenantId, 'ep-mig-uploader@example.test'],
      [releaserId, tenantId, 'ep-mig-releaser@example.test'],
      [otherTenantUserId, otherTenantId, 'ep-mig-other@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await seedProject(tenantId, projectId, 'EP-PRJ', uploaderId, siteId);
    await seedProject(otherTenantId, otherProjectId, 'EP-OTH', otherTenantUserId, otherSiteId);

    const documentId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO documents (
        id, tenant_id, project_id, document_code, title, discipline, type, classification,
        owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'ELE-DWG-001','Design package','ELECTRICAL','DRAWING','INTERNAL',
        $4,'ACTIVE',$4,$4)`,
      [documentId, tenantId, projectId, uploaderId]
    );
    await AppDataSource.query(
      `INSERT INTO document_revisions (
        id, tenant_id, document_id, project_id, revision_code, working_version, status,
        purpose, file_name, mime_type, released_object_key, content_hash, scan_status,
        lock_state, approved_by, approved_at, issued_by, issued_at, uploaded_by
      ) VALUES ($1,$2,$3,$4,'A',1,'ISSUED','For construction','design.pdf','application/pdf',
        'release/design.pdf',$5,'CLEAN','LOCKED',$6,now(),$6,now(),$6)`,
      [revisionId, tenantId, documentId, projectId, 'd'.repeat(64), uploaderId]
    );
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerId: string,
    fixtureSiteId: string
  ): Promise<void> {
    const companyId = randomUUID();
    const legalId = randomUUID();
    const portfolioId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,$3,'Company EP','INTERNAL','ACTIVE')`,
      [companyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal EP','VN',$4,'ACTIVE')`,
      [legalId, fixtureTenantId, companyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio EP','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Engineering Project','SOLAR','PLANNING','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, legalId, companyId, managerId, code]
    );
    await AppDataSource.query(
      `INSERT INTO sites (id, tenant_id, project_id, code, name, timezone, is_primary, status)
       VALUES ($1,$2,$3,'MAIN','Site EP','Asia/Ho_Chi_Minh',true,'ACTIVE')`,
      [fixtureSiteId, fixtureTenantId, fixtureProjectId]
    );
  }
});
