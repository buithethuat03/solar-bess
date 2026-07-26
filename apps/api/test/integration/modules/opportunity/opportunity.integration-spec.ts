import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssignmentScopeType, CompanyEntity, InvestmentScenarioEntity, LegalEntityEntity,
  LocalCredentialEntity, MasterRecordStatus, OpportunityEntity, OrganizationType,
  PortfolioEntity, ProjectEntity, ProjectPhase, ProjectRecordStatus, ProjectType,
  RoleAssignmentEntity, RoleEntity, SiteEntity, SurveyPackageEntity, TenantEntity,
  UserAccountEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const pmoId = randomUUID();
const pmId = randomUUID();
const projectScopedId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const companyId = randomUUID();
const legalEntityId = randomUUID();
const portfolioId = randomUUID();
const password = 'Opportunity!Integration2026';
const RULES_HASH = 'c'.repeat(64);

jest.setTimeout(180_000);

/**
 * US-025 / WF-002 HTTP integration (API-026…API-033). The engine bridge is NOT wired (DB-071
 * instances require a project; opportunities are pre-project — recorded honest stop), so decision
 * states (APPROVED, workflow instance states) are arranged directly in the database where a test
 * needs them; everything else goes through the API.
 */
describe('Opportunity HTTP integration — API-026…API-033', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let pmoToken: string;
  let pmToken: string;
  let projectScopedToken: string;
  let otherTenantToken: string;

  beforeAll(async () => {
    await runTestMigrations();
    passwordHash = await argonHash(password);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    pmoToken = await login('opp-pmo@example.test', 'opp-test');
    pmToken = await login('opp-pm@example.test', 'opp-test');
    projectScopedToken = await login('opp-project@example.test', 'opp-test');
    otherTenantToken = await login('opp-other@example.test', 'opp-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-027/026: creates a LEAD with computed duplicate key and lists the pipeline', async () => {
    const created = await createOpportunity({ code: 'OPP-001' });
    expect(created).toMatchObject({
      code: 'OPP-001', stage: 'LEAD', customerCompanyId: companyId,
      expectedCapacityKwp: '1250.5000', ownerId: pmoId, convertedProjectId: null, versionNo: 1
    });
    // Server-computed sha256 over the normalized (customer, location) pair.
    expect(created.duplicateKey).toBe(createHash('sha256')
      .update(`${companyId.toLowerCase()}|khu cn long thành`)
      .digest('hex'));

    // No customer ⇒ no duplicate identity.
    const bare = await createOpportunity({
      code: 'OPP-002', customerCompanyId: null, locationText: null
    });
    expect(bare.duplicateKey).toBeNull();

    const duplicateCode = await api(pmoToken).post('/v1/opportunities')
      .set('Idempotency-Key', `opp-dup-${randomUUID()}`)
      .send(opportunityPayload({ code: 'OPP-001' }))
      .expect(409);
    expect(duplicateCode.body.code).toBe('OPPORTUNITY_CODE_CONFLICT');

    // Same customer + same location under different spelling ⇒ DUPLICATE_OPPORTUNITY, zero rows.
    const duplicatePair = await api(pmoToken).post('/v1/opportunities')
      .set('Idempotency-Key', `opp-dup-${randomUUID()}`)
      .send(opportunityPayload({ code: 'OPP-003', locationText: '  KHU CN   LONG THÀNH ' }))
      .expect(409);
    expect(duplicatePair.body.code).toBe('DUPLICATE_OPPORTUNITY');
    expect(await count(OpportunityEntity)).toBe(2);

    const all = await api(pmoToken).get('/v1/opportunities').expect(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta).toEqual({ limit: 50, nextCursor: null });

    const filtered = await api(pmoToken)
      .get(`/v1/opportunities?stage=LEAD&customerCompanyId=${companyId}`).expect(200);
    expect(filtered.body.data.map((row: { code: string }) => row.code)).toEqual(['OPP-001']);

    const paged = await api(pmoToken).get('/v1/opportunities?limit=1').expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(pmoToken)
      .get(`/v1/opportunities?limit=1&cursor=${paged.body.meta.nextCursor}`).expect(200);
    expect(next.body.data[0].id).not.toBe(paged.body.data[0].id);
  });

  it('keeps 403 for permission gaps and 404/empty for reach gaps (pre-project narrowing)', async () => {
    const created = await createOpportunity({ code: 'OPP-REACH' });

    // PM holds opportunity.read (tenant scope) — full read reach.
    const asPm = await api(pmToken).get(`/v1/opportunities/${created.id}`).expect(200);
    expect(asPm.body.data.id).toBe(created.id);
    // …but no opportunity.create: a permission gap answers 403.
    const forbidden = await api(pmToken).post('/v1/opportunities')
      .set('Idempotency-Key', `opp-403-${randomUUID()}`)
      .send(opportunityPayload({ code: 'OPP-403' }))
      .expect(403);
    expect(forbidden.body.code).toBe('PERMISSION_DENIED');

    // Project-scoped assignment holds the codes but grants no pre-project reach: empty list, 404.
    const scopedList = await api(projectScopedToken).get('/v1/opportunities').expect(200);
    expect(scopedList.body.data).toEqual([]);
    await api(projectScopedToken).get(`/v1/opportunities/${created.id}`).expect(404);
    const scopedCreate = await api(projectScopedToken).post('/v1/opportunities')
      .set('Idempotency-Key', `opp-scoped-${randomUUID()}`)
      .send(opportunityPayload({ code: 'OPP-SCOPED' }))
      .expect(404);
    expect(scopedCreate.body.code).toBe('OPPORTUNITY_NOT_FOUND');

    // Cross-tenant probing is indistinguishable from missing.
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/opportunities/${created.id}`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .patch(`/v1/opportunities/${created.id}`)
      .set('Idempotency-Key', `opp-cross-${randomUUID()}`)
      .send({ expectedVersion: 1, name: 'Chiếm quyền xuyên tenant' })
      .expect(404);
    expect(await count(OpportunityEntity)).toBe(1);
  });

  it('API-029: legal adjacent stage moves only; conflicts and 4xx write nothing', async () => {
    const created = await createOpportunity({ code: 'OPP-STAGE' });

    const qualified = await patchOpportunity(created.id, { expectedVersion: 1, stage: 'QUALIFIED' });
    expect(qualified.stage).toBe('QUALIFIED');
    expect(qualified.versionNo).toBe(2);

    const skip = await api(pmoToken).patch(`/v1/opportunities/${created.id}`)
      .set('Idempotency-Key', `opp-skip-${randomUUID()}`)
      .send({ expectedVersion: 2, stage: 'SCENARIO_READY' })
      .expect(422);
    expect(skip.body.code).toBe('INVALID_STAGE_TRANSITION');

    for (const commandOwned of ['SUBMITTED', 'APPROVED', 'CONVERTED']) {
      const refused = await api(pmoToken).patch(`/v1/opportunities/${created.id}`)
        .set('Idempotency-Key', `opp-direct-${randomUUID()}`)
        .send({ expectedVersion: 2, stage: commandOwned })
        .expect(422);
      expect(refused.body.code).toBe('INVALID_STAGE_TRANSITION');
    }

    const stale = await api(pmoToken).patch(`/v1/opportunities/${created.id}`)
      .set('Idempotency-Key', `opp-stale-${randomUUID()}`)
      .send({ expectedVersion: 1, name: 'Phiên bản cũ' })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2 });

    const unknownOwner = await api(pmoToken).patch(`/v1/opportunities/${created.id}`)
      .set('Idempotency-Key', `opp-owner-${randomUUID()}`)
      .send({ expectedVersion: 2, ownerId: randomUUID() })
      .expect(422);
    expect(unknownOwner.body.code).toBe('OWNER_NOT_FOUND');

    const stored = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: created.id, tenantId });
    expect(stored).toMatchObject({ stage: 'QUALIFIED', versionNo: 2 });

    // Updating the location re-computes the duplicate identity in-transaction: colliding with an
    // existing opportunity answers 409 and writes nothing.
    await createOpportunity({ code: 'OPP-STAGE-2', locationText: 'Khu CN Nhơn Trạch' });
    const collide = await api(pmoToken).patch(`/v1/opportunities/${created.id}`)
      .set('Idempotency-Key', `opp-collide-${randomUUID()}`)
      .send({ expectedVersion: 2, locationText: 'khu cn nhơn trạch' })
      .expect(409);
    expect(collide.body.code).toBe('DUPLICATE_OPPORTUNITY');
    const unchanged = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: created.id, tenantId });
    expect(unchanged).toMatchObject({ locationText: 'Khu CN Long Thành', versionNo: 2 });
  });

  it('API-030: allocates revisions in-transaction and advances QUALIFIED → SURVEYED', async () => {
    const created = await createOpportunity({ code: 'OPP-SURVEY' });

    // A survey on a LEAD records evidence without advancing the stage.
    const early = await createSurvey(created.id, {});
    expect(early).toMatchObject({ revision: 1, dataQuality: 'RAW', opportunityStage: 'LEAD' });

    await patchOpportunity(created.id, { expectedVersion: 1, stage: 'QUALIFIED' });
    const advancing = await createSurvey(created.id, {
      dataQuality: 'VALIDATED', documentRefs: ['minio://survey/topo-1'], notes: 'Đo đạc lần 2'
    });
    expect(advancing).toMatchObject({ revision: 2, opportunityStage: 'SURVEYED' });
    const stored = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: created.id, tenantId });
    expect(stored.stage).toBe('SURVEYED');

    // PM (survey.create) can contribute; cross-tenant probing writes nothing.
    const asPm = await api(pmToken).post(`/v1/opportunities/${created.id}/survey-packages`)
      .set('Idempotency-Key', `svy-pm-${randomUUID()}`)
      .send({}).expect(201);
    expect(asPm.body.data.revision).toBe(3);
    await api(otherTenantToken, otherTenantId)
      .post(`/v1/opportunities/${created.id}/survey-packages`)
      .set('Idempotency-Key', `svy-cross-${randomUUID()}`)
      .send({}).expect(404);
    expect(await count(SurveyPackageEntity)).toBe(3);
  });

  it('API-031: requires stage >= SURVEYED, versions per type, money as Postgres text', async () => {
    const created = await createOpportunity({ code: 'OPP-SCN' });

    const premature = await api(pmoToken)
      .post(`/v1/opportunities/${created.id}/investment-scenarios`)
      .set('Idempotency-Key', `scn-early-${randomUUID()}`)
      .send(scenarioPayload({}))
      .expect(422);
    expect(premature.body.code).toBe('INVALID_STAGE_TRANSITION');
    expect(await count(InvestmentScenarioEntity)).toBe(0);

    await patchOpportunity(created.id, { expectedVersion: 1, stage: 'QUALIFIED' });
    await createSurvey(created.id, {});
    const solar1 = await createScenario(created.id, {});
    expect(solar1).toMatchObject({
      scenarioType: 'SOLAR', version: 1, status: 'DRAFT', currency: 'VND',
      capexTotal: '1000000.5000', npv: '250000.2500', irr: '0.123400', paybackMonths: 96,
      formulaVersion: 'client-model-v1', workflowInstanceId: null,
      opportunityStage: 'SCENARIO_READY'
    });
    const solar2 = await createScenario(created.id, {});
    expect(solar2.version).toBe(2);
    const bess1 = await createScenario(created.id, { scenarioType: 'BESS' });
    expect(bess1.version).toBe(1);

    const stored = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: created.id, tenantId });
    expect(stored.stage).toBe('SCENARIO_READY');
  });

  it('API-032: submits on the aggregate (SoD fields), no engine instance — recorded honest stop', async () => {
    const { opportunityId, scenarioId } = await seedScenarioReady('OPP-SUBMIT');

    const submitted = await api(pmToken)
      .post(`/v1/investment-scenarios/${scenarioId}:submit`)
      .set('Idempotency-Key', `scn-submit-${randomUUID()}`)
      .send({ expectedVersion: 1, comment: 'Trình phê duyệt phương án' })
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      status: 'SUBMITTED', submittedBy: pmId, workflowInstanceId: null,
      opportunityStage: 'SUBMITTED', versionNo: 2
    });
    expect(submitted.body.data.submittedAt).toEqual(expect.any(String));
    const opportunity = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: opportunityId, tenantId });
    expect(opportunity.stage).toBe('SUBMITTED');

    // Resubmitting a SUBMITTED scenario is an invalid transition.
    const again = await api(pmToken)
      .post(`/v1/investment-scenarios/${scenarioId}:submit`)
      .set('Idempotency-Key', `scn-submit-${randomUUID()}`)
      .send({ expectedVersion: 2 })
      .expect(422);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');

    const { scenarioId: otherScenario } = await seedScenarioReady('OPP-SUBMIT-2');
    const stale = await api(pmToken)
      .post(`/v1/investment-scenarios/${otherScenario}:submit`)
      .set('Idempotency-Key', `scn-submit-${randomUUID()}`)
      .send({ expectedVersion: 9 })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 1 });

    await api(otherTenantToken, otherTenantId)
      .post(`/v1/investment-scenarios/${otherScenario}:submit`)
      .set('Idempotency-Key', `scn-submit-${randomUUID()}`)
      .send({ expectedVersion: 1 })
      .expect(404);
  });

  it('API-028: embeds surveys and presents the workflow instance state as the scenario status', async () => {
    const { opportunityId, scenarioId } = await seedScenarioReady('OPP-DETAIL');
    await api(pmToken).post(`/v1/investment-scenarios/${scenarioId}:submit`)
      .set('Idempotency-Key', `scn-submit-${randomUUID()}`)
      .send({ expectedVersion: 1 })
      .expect(200);

    const before = await api(pmoToken).get(`/v1/opportunities/${opportunityId}`).expect(200);
    expect(before.body.surveys).toHaveLength(1);
    expect(before.body.scenarios).toHaveLength(1);
    expect(before.body.scenarios[0]).toMatchObject({
      status: 'SUBMITTED', storedStatus: 'SUBMITTED', workflowInstanceId: null,
      workflowInstanceState: null, capexTotal: '1000000.5000'
    });

    // Attach a live DB-071 instance directly (the engine cannot host pre-project targets yet) and
    // decide it: the projection must present the instance state without touching the stored row.
    const instanceId = await seedWorkflowInstance(scenarioId);
    await dataSource.query(
      `UPDATE investment_scenarios SET workflow_instance_id = $1 WHERE id = $2`,
      [instanceId, scenarioId]
    );
    await dataSource.query(
      `UPDATE workflow_instances SET state = 'APPROVED', current_step_key = NULL,
        closed_by = $1, closed_at = now() WHERE id = $2`,
      [pmoId, instanceId]
    );

    const after = await api(pmoToken).get(`/v1/opportunities/${opportunityId}`).expect(200);
    expect(after.body.scenarios[0]).toMatchObject({
      status: 'APPROVED', storedStatus: 'SUBMITTED',
      workflowInstanceId: instanceId, workflowInstanceState: 'APPROVED'
    });
  });

  it('enforces the idempotency trio on commands', async () => {
    const missing = await api(pmoToken).post('/v1/opportunities')
      .send(opportunityPayload({ code: 'OPP-IDEM' }))
      .expect(400);
    expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await count(OpportunityEntity)).toBe(0);

    const key = `opp-idem-${randomUUID()}`;
    const first = await api(pmoToken).post('/v1/opportunities')
      .set('Idempotency-Key', key)
      .send(opportunityPayload({ code: 'OPP-IDEM' }))
      .expect(201);
    const replay = await api(pmoToken).post('/v1/opportunities')
      .set('Idempotency-Key', key)
      .send(opportunityPayload({ code: 'OPP-IDEM' }))
      .expect(201);
    expect(replay.body.data).toEqual(first.body.data);
    expect(await count(OpportunityEntity)).toBe(1);

    const conflicting = await api(pmoToken).post('/v1/opportunities')
      .set('Idempotency-Key', key)
      .send(opportunityPayload({ code: 'OPP-IDEM-OTHER' }))
      .expect(409);
    expect(conflicting.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await count(OpportunityEntity)).toBe(1);
  });

  it('API-033: converts only an APPROVED opportunity, replays idempotently, one project ever', async () => {
    const { opportunityId } = await seedScenarioReady('OPP-CONVERT');

    const premature = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}:convert`)
      .set('Idempotency-Key', `cvt-early-${randomUUID()}`)
      .send(convertPayload({}))
      .expect(422);
    expect(premature.body.code).toBe('INVALID_STAGE_TRANSITION');
    expect(await countConvertedProjects()).toBe(0);

    // Decision states are unreachable through the API (engine honest stop) — arrange APPROVED.
    await dataSource.query(
      `UPDATE opportunities SET stage = 'APPROVED' WHERE id = $1`, [opportunityId]
    );

    const badPortfolio = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}:convert`)
      .set('Idempotency-Key', `cvt-badref-${randomUUID()}`)
      .send(convertPayload({ portfolioId: randomUUID() }))
      .expect(422);
    expect(badPortfolio.body.code).toBe('PORTFOLIO_NOT_FOUND');
    expect(await countConvertedProjects()).toBe(0);

    const converted = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}:convert`)
      .set('Idempotency-Key', `cvt-${randomUUID()}`)
      .send(convertPayload({}))
      .expect(201);
    // Same insert invariants as project-master: born INITIATION/DRAFT with a primary site.
    expect(converted.body.data).toMatchObject({
      code: 'OPP-CONVERT', type: 'SOLAR', phase: 'INITIATION', recordStatus: 'DRAFT',
      customerCompanyId: companyId, sourceOpportunityId: opportunityId, alreadyConverted: false
    });
    expect(converted.body.data.sites).toEqual([
      expect.objectContaining({ code: 'MAIN', isPrimary: true })
    ]);
    const opportunity = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: opportunityId, tenantId });
    expect(opportunity).toMatchObject({
      stage: 'CONVERTED', convertedProjectId: converted.body.data.id
    });

    // Replay with a DIFFERENT key: 200-equivalent semantics inside the 201 envelope, zero writes.
    const replay = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}:convert`)
      .set('Idempotency-Key', `cvt-replay-${randomUUID()}`)
      .send(convertPayload({}))
      .expect(201);
    expect(replay.body.data).toMatchObject({
      id: converted.body.data.id, alreadyConverted: true
    });
    expect(await countConvertedProjects()).toBe(1);

    // A converted opportunity accepts no further pipeline writes.
    const lateSurvey = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}/survey-packages`)
      .set('Idempotency-Key', `svy-late-${randomUUID()}`)
      .send({}).expect(422);
    expect(lateSurvey.body.code).toBe('INVALID_STAGE_TRANSITION');

    // Project-code collision leaves everything untouched (opportunity stays APPROVED).
    const { opportunityId: second } = await seedScenarioReady('OPP-CONVERT-2');
    await dataSource.query(
      `UPDATE opportunities SET stage = 'APPROVED' WHERE id = $1`, [second]
    );
    const codeClash = await api(pmoToken)
      .post(`/v1/opportunities/${second}:convert`)
      .set('Idempotency-Key', `cvt-clash-${randomUUID()}`)
      .send(convertPayload({ projectCode: 'OPP-CONVERT' }))
      .expect(409);
    expect(codeClash.body.code).toBe('PROJECT_CODE_CONFLICT');
    expect(await countConvertedProjects()).toBe(1);
    const untouched = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: second, tenantId });
    expect(untouched).toMatchObject({ stage: 'APPROVED', convertedProjectId: null });
  });

  it('API-033: accepts the scenario-projection APPROVED route to convert', async () => {
    const { opportunityId, scenarioId } = await seedScenarioReady('OPP-CVT-PROJ');
    await api(pmToken).post(`/v1/investment-scenarios/${scenarioId}:submit`)
      .set('Idempotency-Key', `scn-submit-${randomUUID()}`)
      .send({ expectedVersion: 1 })
      .expect(200);
    const instanceId = await seedWorkflowInstance(scenarioId);
    await dataSource.query(
      `UPDATE investment_scenarios SET workflow_instance_id = $1 WHERE id = $2`,
      [instanceId, scenarioId]
    );
    await dataSource.query(
      `UPDATE workflow_instances SET state = 'APPROVED', current_step_key = NULL,
        closed_by = $1, closed_at = now() WHERE id = $2`,
      [pmoId, instanceId]
    );

    // Opportunity stage is still SUBMITTED — the projected scenario APPROVED carries the convert.
    const converted = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}:convert`)
      .set('Idempotency-Key', `cvt-proj-${randomUUID()}`)
      .send(convertPayload({}))
      .expect(201);
    expect(converted.body.data).toMatchObject({
      sourceOpportunityId: opportunityId, alreadyConverted: false
    });
    const opportunity = await dataSource.getRepository(OpportunityEntity)
      .findOneByOrFail({ id: opportunityId, tenantId });
    expect(opportunity.stage).toBe('CONVERTED');
  });

  function opportunityPayload(overrides: Partial<{
    code: string; customerCompanyId: string | null; locationText: string | null;
  }>) {
    return {
      code: overrides.code ?? 'OPP-001',
      name: 'Cơ hội điện mặt trời áp mái khu công nghiệp',
      ...(overrides.customerCompanyId === null ? {} : {
        customerCompanyId: overrides.customerCompanyId ?? companyId
      }),
      ...(overrides.locationText === null ? {} : {
        locationText: overrides.locationText ?? 'Khu CN Long Thành'
      }),
      expectedCapacityKwp: '1250.5'
    };
  }

  async function createOpportunity(overrides: Parameters<typeof opportunityPayload>[0]) {
    const response = await api(pmoToken).post('/v1/opportunities')
      .set('Idempotency-Key', `opp-create-${randomUUID()}`)
      .send(opportunityPayload(overrides))
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  async function patchOpportunity(id: string, body: Record<string, unknown>) {
    const response = await api(pmoToken).patch(`/v1/opportunities/${id}`)
      .set('Idempotency-Key', `opp-patch-${randomUUID()}`)
      .send(body)
      .expect(200);
    return response.body.data as { stage: string; versionNo: number } & Record<string, unknown>;
  }

  async function createSurvey(opportunityId: string, body: Record<string, unknown>) {
    const response = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}/survey-packages`)
      .set('Idempotency-Key', `svy-${randomUUID()}`)
      .send(body)
      .expect(201);
    return response.body.data as { id: string; revision: number } & Record<string, unknown>;
  }

  function scenarioPayload(overrides: Partial<{ scenarioType: string }>) {
    return {
      scenarioType: overrides.scenarioType ?? 'SOLAR', currency: 'VND',
      capexTotal: '1000000.5', npv: '250000.25', irr: '0.1234', paybackMonths: 96,
      inputSnapshot: { tariff: 'demo-input', irradiance: 'demo' },
      outputSnapshot: { lcoe: 'demo-output' },
      formulaVersion: 'client-model-v1'
    };
  }

  async function createScenario(
    opportunityId: string, overrides: Parameters<typeof scenarioPayload>[0]
  ) {
    const response = await api(pmoToken)
      .post(`/v1/opportunities/${opportunityId}/investment-scenarios`)
      .set('Idempotency-Key', `scn-${randomUUID()}`)
      .send(scenarioPayload(overrides))
      .expect(201);
    return response.body.data as { id: string; version: number } & Record<string, unknown>;
  }

  /** Opportunity taken through the API to SCENARIO_READY with one survey and one DRAFT scenario. */
  async function seedScenarioReady(code: string) {
    const created = await createOpportunity({
      code, locationText: `Địa điểm ${code}`
    });
    await patchOpportunity(created.id, { expectedVersion: 1, stage: 'QUALIFIED' });
    await createSurvey(created.id, {});
    const scenario = await createScenario(created.id, {});
    return { opportunityId: created.id, scenarioId: scenario.id };
  }

  function convertPayload(overrides: Partial<{ portfolioId: string; projectCode: string }>) {
    return {
      portfolioId: overrides.portfolioId ?? portfolioId,
      ownerLegalEntityId: legalEntityId,
      projectType: 'SOLAR', contractModel: 'EPC', currency: 'VND', plannedCod: '2027-12-31',
      ...(overrides.projectCode ? { projectCode: overrides.projectCode } : {}),
      primarySite: {
        code: 'MAIN', name: 'Site chính', timezone: 'Asia/Ho_Chi_Minh',
        location: 'Khu CN Long Thành'
      }
    };
  }

  async function countConvertedProjects(): Promise<number> {
    const [row] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM projects
       WHERE tenant_id = $1 AND source_opportunity_id IS NOT NULL`, [tenantId]
    );
    return Number(row.count);
  }

  async function seedWorkflowInstance(scenarioId: string): Promise<string> {
    const definitionId = randomUUID();
    const versionId = randomUUID();
    const instanceId = randomUUID();
    await dataSource.query(
      `INSERT INTO workflow_definitions (
        id, tenant_id, code, name, object_type, process_owner_id, status, created_by, updated_by
      ) VALUES ($1,$2,$3,'Scenario demo route','ChangeRequest',$4,'ACTIVE',$4,$4)`,
      [definitionId, tenantId, `WF-${instanceId.slice(0, 8).toUpperCase()}`, pmoId]
    );
    await dataSource.query(
      `INSERT INTO workflow_versions (
        id, tenant_id, workflow_definition_id, version, status, routing_rules, rules_hash, created_by
      ) VALUES ($1,$2,$3,1,'DRAFT','{"steps":[]}'::jsonb,$4,$5)`,
      [versionId, tenantId, definitionId, RULES_HASH, pmoId]
    );
    await dataSource.query(
      `INSERT INTO workflow_instances (
        id, tenant_id, workflow_definition_id, workflow_version_id, object_type, object_id,
        object_version, project_id, state, current_step_key, route_snapshot, route_hash,
        requested_by
      ) VALUES ($1,$2,$3,$4,'InvestmentScenario',$5,1,$6,'SUBMITTED','step-1',
        '{"steps":[]}'::jsonb,$7,$8)`,
      [instanceId, tenantId, definitionId, versionId, scenarioId, projectId, RULES_HASH, pmId]
    );
    return instanceId;
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'opp-test', name: 'Opportunity Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'opp-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(pmoId, tenantId, 'opp-pmo@example.test', 'Opportunity PMO'),
      user(pmId, tenantId, 'opp-pm@example.test', 'Opportunity PM'),
      user(projectScopedId, tenantId, 'opp-project@example.test', 'Project Scoped'),
      user(otherTenantUserId, otherTenantId, 'opp-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(pmoId, tenantId), credential(pmId, tenantId),
      credential(projectScopedId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const pmoRole = await role(tenantId, 'OPP_PMO', [
      'opportunity.read', 'opportunity.create', 'opportunity.update', 'opportunity.convert',
      'survey.create', 'scenario.create', 'scenario.submit'
    ]);
    // Contributes surveys/scenarios and reads the pipeline, but no create/update/convert: 403.
    const pmRole = await role(tenantId, 'OPP_PM', [
      'opportunity.read', 'survey.create', 'scenario.create', 'scenario.submit'
    ]);
    // Holds every code but only at PROJECT scope: pre-project records answer 404/empty.
    const projectRole = await role(tenantId, 'OPP_PROJECT', [
      'opportunity.read', 'opportunity.create', 'opportunity.update', 'opportunity.convert',
      'survey.create', 'scenario.create', 'scenario.submit'
    ]);
    const otherRole = await role(otherTenantId, 'OPP_OTHER', [
      'opportunity.read', 'opportunity.create', 'opportunity.update', 'opportunity.convert',
      'survey.create', 'scenario.create', 'scenario.submit'
    ]);

    await seedMasterData();

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, pmoId, pmoRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, pmId, pmRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, projectScopedId, projectRole.id, AssignmentScopeType.PROJECT, projectId),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  async function seedMasterData(): Promise<void> {
    await dataSource.getRepository(CompanyEntity).save({
      id: companyId, tenantId, code: 'OPP-CUSTOMER', name: 'Opportunity Customer',
      organizationType: OrganizationType.CUSTOMER, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    await dataSource.getRepository(LegalEntityEntity).save({
      id: legalEntityId, tenantId, companyId, legalName: 'Opportunity Legal', country: 'VN',
      registrationNo: 'REG-OPP', taxId: null, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    await dataSource.getRepository(PortfolioEntity).save({
      id: portfolioId, tenantId, code: 'OPP-PORT', name: 'Opportunity Portfolio',
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    // Baseline project: hosts the PROJECT-scope assignment and the DB-071 fixture instances.
    await dataSource.getRepository(ProjectEntity).save({
      id: projectId, tenantId, portfolioId, ownerLegalEntityId: legalEntityId,
      customerCompanyId: companyId, projectManagerId: pmoId, code: 'OPP-BASE',
      name: 'Baseline Project', type: ProjectType.SOLAR, phase: ProjectPhase.EXECUTION,
      recordStatus: ProjectRecordStatus.ACTIVE, contractModel: 'EPC', currency: 'VND',
      plannedCod: '2027-12-31', forecastCod: null, sourceOpportunityId: null,
      versionNo: 1, idempotencyKey: null
    });
    await dataSource.getRepository(SiteEntity).save({
      id: randomUUID(), tenantId, projectId, code: 'BASE', name: 'Baseline Site',
      location: null, timezone: 'Asia/Ho_Chi_Minh', isPrimary: true,
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
  }

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 12, status: MasterRecordStatus.ACTIVE
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
      post: (path: string) => authorized(request(app.getHttpServer()).post(path)),
      patch: (path: string) => authorized(request(app.getHttpServer()).patch(path))
    };
  }
});
