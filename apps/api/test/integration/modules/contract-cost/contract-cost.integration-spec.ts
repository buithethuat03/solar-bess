import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { hash as argonHash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from 'src/app.module';
import {
  AssignmentScopeType, BudgetVersionEntity, CommitmentEntity, CompanyEntity,
  ContractAppendixEntity, ContractEntity, ContractPartyEntity, ContractStatus, ContractType,
  CostCodeClass, CostCodeEntity,
  CostCodeStatus, FxSnapshotEntity, InvoiceEntity, LegalEntityEntity, LocalCredentialEntity,
  MasterRecordStatus, ObligationEntity, OrganizationType, PackageEntity, PackageStatus,
  PaymentComponentEntity, PaymentEntity, PortfolioEntity, ProjectEntity, ProjectPhase,
  ProjectRecordStatus, ProjectType, RoleAssignmentEntity, RoleEntity, TenantEntity,
  UserAccountEntity
} from 'src/database/entities';
import { runTestMigrations } from 'test/setup/run-migrations';

const tenantId = randomUUID();
const otherTenantId = randomUUID();
const managerId = randomUUID();
const deciderId = randomUUID();
const packageUserId = randomUUID();
const otherTenantUserId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const packageAId = randomUUID();
const companyId = randomUUID();
const payerEntityId = randomUUID();
const payeeEntityId = randomUUID();
const costCodeId = randomUUID();
const password = 'Contract!Integration2026';

jest.setTimeout(180_000);

describe('Contract & Cost HTTP integration — API-053…API-066', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordHash: string;
  let managerToken: string;
  let deciderToken: string;
  let packageToken: string;
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
    managerToken = await login('cc-manager@example.test', 'cc-test');
    deciderToken = await login('cc-decider@example.test', 'cc-test');
    packageToken = await login('cc-package@example.test', 'cc-test');
    otherTenantToken = await login('cc-other@example.test', 'cc-other');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('API-054/053: creates a DRAFT contract and lists the register with filters', async () => {
    const created = await createContract({ contractNo: 'CT-EPC-001' });
    expect(created).toMatchObject({
      contractNo: 'CT-EPC-001', type: 'EPC', status: 'DRAFT', currency: 'VND',
      value: '1000000.5000', legalHold: false, signedBy: null, versionNo: 1
    });
    await createContract({ contractNo: 'CT-PPA-002', type: 'PPA' });

    const duplicate = await api(managerToken).post(`/v1/projects/${projectId}/contracts`)
      .set('Idempotency-Key', `cc-dup-${randomUUID()}`)
      .send(contractPayload({ contractNo: 'CT-EPC-001' }))
      .expect(409);
    expect(duplicate.body.code).toBe('CONTRACT_NUMBER_CONFLICT');
    expect(await count(ContractEntity)).toBe(2);

    const all = await api(managerToken).get(`/v1/projects/${projectId}/contracts`).expect(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta).toEqual({ limit: 50, nextCursor: null });

    const filtered = await api(managerToken)
      .get(`/v1/projects/${projectId}/contracts?type=PPA`).expect(200);
    expect(filtered.body.data.map((row: { contractNo: string }) => row.contractNo))
      .toEqual(['CT-PPA-002']);

    const paged = await api(managerToken)
      .get(`/v1/projects/${projectId}/contracts?limit=1`).expect(200);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.nextCursor).toEqual(expect.any(String));
    const next = await api(managerToken)
      .get(`/v1/projects/${projectId}/contracts?limit=1&cursor=${paged.body.meta.nextCursor}`)
      .expect(200);
    expect(next.body.data[0].id).not.toBe(paged.body.data[0].id);
  });

  it('API-053: pages contracts stored under one now() without losing the boundary row', async () => {
    // One save() call is one transaction, and `created_at` defaults to now(), which Postgres holds
    // constant for the whole transaction — so all three rows land on the same microsecond timestamp.
    // The keyset cursor only carries millisecond precision, so a predicate that compares against the
    // cursor's ISO string instead of the stored boundary drops every row whose created_at has
    // sub-millisecond digits: page 2 would come back empty and the third contract would be lost.
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    await dataSource.getRepository(ContractEntity).save(ids.map((id, index) => ({
      id, tenantId, projectId,
      contractNo: `CT-SAME-MS-${index + 1}`,
      title: 'Hợp đồng ghi cùng một mốc thời gian',
      type: ContractType.EPC, status: ContractStatus.DRAFT,
      effectiveFrom: null, effectiveTo: null, value: '1000.0000', currency: 'VND',
      rootDocumentId: null, legalHold: false, signedAt: null, signedBy: null,
      createdBy: managerId, updatedBy: managerId
    })));

    const stored = await dataSource.query<Array<{ distinctTimes: string; subMs: boolean }>>(
      `SELECT count(DISTINCT created_at)::text AS "distinctTimes",
              bool_or(date_trunc('milliseconds', created_at) <> created_at) AS "subMs"
       FROM contracts WHERE tenant_id = $1`,
      [tenantId]
    );
    // The regression only exists when the stored timestamp is finer than a millisecond.
    expect(stored[0].distinctTimes).toBe('1');
    expect(stored[0].subMs).toBe(true);

    const first = await api(managerToken)
      .get(`/v1/projects/${projectId}/contracts?limit=2`).expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));

    const second = await api(managerToken)
      .get(`/v1/projects/${projectId}/contracts?limit=2&cursor=${first.body.meta.nextCursor}`)
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta.nextCursor).toBeNull();

    // Every row appears exactly once across the two pages: nothing fell through the boundary.
    const paged = [...first.body.data, ...second.body.data]
      .map((row: { id: string }) => row.id);
    expect([...paged].sort()).toEqual([...ids].sort());
    const expectedThird = [...ids].sort().reverse().at(-1);
    expect(second.body.data[0].id).toBe(expectedThird);
  });

  it('API-055: embeds parties, appendices and the SQL-consolidated value', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const party = await createParty(contract.id, 'OWNER', payerEntityId);
    expect(party).toMatchObject({
      partyRole: 'OWNER', legalNameSnapshot: 'Legal CC-PRJ', countrySnapshot: 'VN',
      registrationNoSnapshot: 'REG-CC-PRJ', taxIdSnapshot: null
    });
    expect(party.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    await createParty(contract.id, 'EPC', payeeEntityId);

    await createAppendix(contract.id, {
      appendixNo: 'PL-01', status: 'EFFECTIVE', effectiveDate: '2026-08-01',
      valueImpact: '250000.25'
    });
    // A DRAFT appendix must not count towards the consolidated value.
    await createAppendix(contract.id, { appendixNo: 'PL-02', valueImpact: '999999' });

    const detail = await api(managerToken).get(`/v1/contracts/${contract.id}`).expect(200);
    // 1000000.50 + 250000.25 summed by Postgres numeric, never JS.
    expect(detail.body.data.consolidatedValue).toBe('1250000.7500');
    expect(detail.body.data.value).toBe('1000000.5000');
    expect(detail.body.parties).toHaveLength(2);
    expect(detail.body.appendices).toHaveLength(2);
  });

  it('API-056: draft-only edit with version check and legal hold refusal', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const patched = await api(managerToken).patch(`/v1/contracts/${contract.id}`)
      .set('Idempotency-Key', `cc-patch-${randomUUID()}`)
      .send({ expectedVersion: 1, title: 'Hợp đồng EPC đã hiệu chỉnh', value: '2000000' })
      .expect(200);
    expect(patched.body.data).toMatchObject({
      title: 'Hợp đồng EPC đã hiệu chỉnh', value: '2000000.0000', versionNo: 2
    });

    const stale = await api(managerToken).patch(`/v1/contracts/${contract.id}`)
      .set('Idempotency-Key', `cc-patch-${randomUUID()}`)
      .send({ expectedVersion: 1, title: 'Phiên bản cũ' })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2 });

    await dataSource.query(
      'UPDATE contracts SET legal_hold = true WHERE id = $1', [contract.id]
    );
    const held = await api(managerToken).patch(`/v1/contracts/${contract.id}`)
      .set('Idempotency-Key', `cc-patch-${randomUUID()}`)
      .send({ expectedVersion: 2, title: 'Sửa khi đang hold' })
      .expect(422);
    expect(held.body.code).toBe('LEGAL_HOLD');

    await dataSource.query(
      `UPDATE contracts SET legal_hold = false WHERE id = $1`, [contract.id]
    );
    await dataSource.query(
      `UPDATE contracts SET status = 'REVIEW' WHERE id = $1`, [contract.id]
    );
    const nonDraft = await api(managerToken).patch(`/v1/contracts/${contract.id}`)
      .set('Idempotency-Key', `cc-patch-${randomUUID()}`)
      .send({ expectedVersion: 2, title: 'Sửa sau khi trình duyệt' })
      .expect(422);
    expect(nonDraft.body.code).toBe('INVALID_STATE_TRANSITION');

    const stored = await dataSource.getRepository(ContractEntity)
      .findOneByOrFail({ id: contract.id, tenantId });
    expect(stored.title).toBe('Hợp đồng EPC đã hiệu chỉnh');
  });

  it('API-057: duplicate party conflicts and an unknown legal entity writes nothing', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    await createParty(contract.id, 'OWNER', payerEntityId);

    const duplicate = await api(managerToken).post(`/v1/contracts/${contract.id}/parties`)
      .set('Idempotency-Key', `cc-party-${randomUUID()}`)
      .send({ companyId, legalEntityId: payerEntityId, partyRole: 'OWNER' })
      .expect(409);
    expect(duplicate.body.code).toBe('CONTRACT_PARTY_CONFLICT');

    const unknown = await api(managerToken).post(`/v1/contracts/${contract.id}/parties`)
      .set('Idempotency-Key', `cc-party-${randomUUID()}`)
      .send({ companyId, legalEntityId: randomUUID(), partyRole: 'VENDOR' })
      .expect(422);
    expect(unknown.body.code).toBe('LEGAL_ENTITY_NOT_FOUND');
    expect(await count(ContractPartyEntity)).toBe(1);
  });

  it('API-058: appendix preconditions — closed parent, missing date, wrong currency', async () => {
    const closedId = await seedClosedContract('CT-CLOSED');
    const closed = await api(managerToken).post(`/v1/contracts/${closedId}/appendices`)
      .set('Idempotency-Key', `cc-appx-${randomUUID()}`)
      .send({ appendixNo: 'PL-01', type: 'AMENDMENT' })
      .expect(422);
    expect(closed.body.code).toBe('INVALID_STATE_TRANSITION');

    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const missingDate = await api(managerToken).post(`/v1/contracts/${contract.id}/appendices`)
      .set('Idempotency-Key', `cc-appx-${randomUUID()}`)
      .send({ appendixNo: 'PL-01', type: 'AMENDMENT', status: 'EFFECTIVE' })
      .expect(422);
    expect(missingDate.body.code).toBe('EFFECTIVE_DATE_REQUIRED');

    const wrongCurrency = await api(managerToken).post(`/v1/contracts/${contract.id}/appendices`)
      .set('Idempotency-Key', `cc-appx-${randomUUID()}`)
      .send({ appendixNo: 'PL-01', type: 'AMENDMENT', currency: 'USD', valueImpact: '-1000' })
      .expect(422);
    expect(wrongCurrency.body.code).toBe('CURRENCY_MISMATCH');
    expect(await count(ContractAppendixEntity)).toBe(0);

    const created = await createAppendix(contract.id, {
      appendixNo: 'PL-01', valueImpact: '-1000'
    });
    expect(created).toMatchObject({
      appendixNo: 'PL-01', revisionNo: 1, status: 'DRAFT', currency: 'VND',
      valueImpact: '-1000.0000'
    });
  });

  it('API-060/059: obligations validate parties and derive DUE/OVERDUE at read time', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const obligor = await createParty(contract.id, 'EPC', payerEntityId);
    const beneficiary = await createParty(contract.id, 'OWNER', payeeEntityId);

    const same = await api(managerToken).post(`/v1/contracts/${contract.id}/obligations`)
      .set('Idempotency-Key', `cc-obl-${randomUUID()}`)
      .send(obligationPayload(obligor.id, obligor.id))
      .expect(422);
    expect(same.body.code).toBe('CONTRACT_PARTY_DUPLICATED');

    const foreignContract = await createContract({ contractNo: 'CT-EPC-002' });
    const foreignParty = await createParty(foreignContract.id, 'VENDOR', payeeEntityId);
    const wrongContract = await api(managerToken)
      .post(`/v1/contracts/${contract.id}/obligations`)
      .set('Idempotency-Key', `cc-obl-${randomUUID()}`)
      .send(obligationPayload(obligor.id, foreignParty.id))
      .expect(422);
    expect(wrongContract.body.code).toBe('CONTRACT_PARTY_NOT_FOUND');
    expect(await count(ObligationEntity)).toBe(0);

    const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000)
      .toISOString().slice(0, 10);
    await createObligation(contract.id, obligor.id, beneficiary.id, {
      clauseRef: 'DIEU-QUA-HAN', dueDate: isoDate(-1)
    });
    await createObligation(contract.id, obligor.id, beneficiary.id, {
      clauseRef: 'DIEU-DEN-HAN', dueDate: isoDate(0)
    });
    await createObligation(contract.id, obligor.id, beneficiary.id, {
      clauseRef: 'DIEU-CON-HAN', dueDate: isoDate(1)
    });

    const listed = await api(managerToken)
      .get(`/v1/contracts/${contract.id}/obligations`).expect(200);
    const byClause = new Map(listed.body.data.map(
      (row: { clauseRef: string; status: string; storedStatus: string }) => [row.clauseRef, row]
    ));
    // Derived in the SQL projection; the stored status stays OPEN for all three.
    expect(byClause.get('DIEU-QUA-HAN')).toMatchObject({ status: 'OVERDUE', storedStatus: 'OPEN' });
    expect(byClause.get('DIEU-DEN-HAN')).toMatchObject({ status: 'DUE', storedStatus: 'OPEN' });
    expect(byClause.get('DIEU-CON-HAN')).toMatchObject({ status: 'OPEN', storedStatus: 'OPEN' });
    const stored = await dataSource.getRepository(ObligationEntity).findBy({ tenantId });
    expect(new Set(stored.map((row) => row.status))).toEqual(new Set(['OPEN']));
  });

  it('API-061: SoD refuses the owner/creator; a distinct decider fulfils with evidence', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const obligor = await createParty(contract.id, 'EPC', payerEntityId);
    const beneficiary = await createParty(contract.id, 'OWNER', payeeEntityId);
    const obligation = await createObligation(contract.id, obligor.id, beneficiary.id, {
      clauseRef: 'DIEU-5.2'
    });

    // The manager both created and owns the obligation: any self-decision is refused.
    const selfDecision = await api(managerToken)
      .post(`/v1/obligations/${obligation.id}:fulfill`)
      .set('Idempotency-Key', `cc-fulfill-${randomUUID()}`)
      .send({
        expectedVersion: 1, decisionType: 'FULFILLED', reason: 'Tự xác nhận',
        evidenceRefs: ['minio://evidence/1']
      })
      .expect(422);
    expect(selfDecision.body.code).toBe('SOD_CONFLICT');
    const undecided = await dataSource.getRepository(ObligationEntity)
      .findOneByOrFail({ id: obligation.id, tenantId });
    expect(undecided.decisionBy).toBeNull();
    expect(undecided.status).toBe('OPEN');

    const noEvidence = await api(deciderToken)
      .post(`/v1/obligations/${obligation.id}:fulfill`)
      .set('Idempotency-Key', `cc-fulfill-${randomUUID()}`)
      .send({
        expectedVersion: 1, decisionType: 'FULFILLED', reason: 'Thiếu bằng chứng',
        evidenceRefs: []
      })
      .expect(400);
    expect(noEvidence.body).toBeDefined();

    const stale = await api(deciderToken)
      .post(`/v1/obligations/${obligation.id}:fulfill`)
      .set('Idempotency-Key', `cc-fulfill-${randomUUID()}`)
      .send({
        expectedVersion: 9, decisionType: 'FULFILLED', reason: 'Phiên bản sai',
        evidenceRefs: ['minio://evidence/1']
      })
      .expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');

    const fulfilled = await api(deciderToken)
      .post(`/v1/obligations/${obligation.id}:fulfill`)
      .set('Idempotency-Key', `cc-fulfill-${randomUUID()}`)
      .send({
        expectedVersion: 1, decisionType: 'FULFILLED',
        reason: 'Đã nghiệm thu theo biên bản', evidenceRefs: ['minio://evidence/1']
      })
      .expect(200);
    expect(fulfilled.body.data).toMatchObject({
      status: 'FULFILLED', decisionType: 'FULFILLED', decisionBy: deciderId,
      decisionEvidenceRefs: ['minio://evidence/1'], versionNo: 2
    });

    const again = await api(deciderToken)
      .post(`/v1/obligations/${obligation.id}:fulfill`)
      .set('Idempotency-Key', `cc-fulfill-${randomUUID()}`)
      .send({
        expectedVersion: 2, decisionType: 'WAIVED', reason: 'Đổi ý',
        evidenceRefs: ['minio://evidence/2']
      })
      .expect(422);
    expect(again.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('API-063: budget versions are numbered in-transaction and born SUBMITTED', async () => {
    const first = await api(managerToken).post(`/v1/projects/${projectId}/budget-versions`)
      .set('Idempotency-Key', `cc-budget-${randomUUID()}`)
      .send({ currency: 'VND', totalAmount: '5000000', snapshot: { note: 'demo' } })
      .expect(201);
    expect(first.body.data).toMatchObject({
      budgetVersion: 1, status: 'SUBMITTED', totalAmount: '5000000.0000',
      submittedBy: managerId
    });
    expect(first.body.data.snapshotHash).toMatch(/^[0-9a-f]{64}$/);

    const second = await api(managerToken).post(`/v1/projects/${projectId}/budget-versions`)
      .set('Idempotency-Key', `cc-budget-${randomUUID()}`)
      .send({ currency: 'VND', totalAmount: '6000000' })
      .expect(201);
    expect(second.body.data).toMatchObject({ budgetVersion: 2, snapshotHash: null });
  });

  it('API-064: a commitment replays as a conflict on its source version', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const created = await api(managerToken).post(`/v1/projects/${projectId}/commitments`)
      .set('Idempotency-Key', `cc-commit-${randomUUID()}`)
      .send({
        contractId: contract.id, costCodeId, amount: '1000000.5',
        sourceType: 'CONTRACT', sourceId: contract.id, sourceVersion: 1
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      amount: '1000000.5000', currency: 'VND', status: 'ACTIVE', sourceVersion: 1
    });

    const replay = await api(managerToken).post(`/v1/projects/${projectId}/commitments`)
      .set('Idempotency-Key', `cc-commit-${randomUUID()}`)
      .send({
        contractId: contract.id, costCodeId, amount: '1000000.5',
        sourceType: 'CONTRACT', sourceId: contract.id, sourceVersion: 1
      })
      .expect(409);
    expect(replay.body.code).toBe('COMMITMENT_SOURCE_CONFLICT');
    expect(await count(CommitmentEntity)).toBe(1);

    const badCostCode = await api(managerToken).post(`/v1/projects/${projectId}/commitments`)
      .set('Idempotency-Key', `cc-commit-${randomUUID()}`)
      .send({
        contractId: contract.id, costCodeId: randomUUID(), amount: '10',
        sourceType: 'CONTRACT', sourceId: contract.id, sourceVersion: 2
      })
      .expect(422);
    expect(badCostCode.body.code).toBe('COST_CODE_NOT_FOUND');

    const wrongCurrency = await api(managerToken).post(`/v1/projects/${projectId}/commitments`)
      .set('Idempotency-Key', `cc-commit-${randomUUID()}`)
      .send({
        contractId: contract.id, costCodeId, amount: '10', currency: 'USD',
        sourceType: 'CONTRACT', sourceId: contract.id, sourceVersion: 2
      })
      .expect(422);
    expect(wrongCurrency.body.code).toBe('CURRENCY_MISMATCH');
    expect(await count(CommitmentEntity)).toBe(1);
  });

  it('API-062: cost summary groups by currency and cost code, never converting', async () => {
    const vndContract = await createContract({ contractNo: 'CT-VND' });
    const usdContract = await createContract({ contractNo: 'CT-USD', currency: 'USD' });
    for (const [contract, amount, version] of [
      [vndContract, '1000000.5', 1], [usdContract, '2500.25', 1]
    ] as const) {
      await api(managerToken).post(`/v1/projects/${projectId}/commitments`)
        .set('Idempotency-Key', `cc-commit-${randomUUID()}`)
        .send({
          contractId: contract.id, costCodeId, amount,
          sourceType: 'CONTRACT', sourceId: contract.id, sourceVersion: version
        })
        .expect(201);
    }
    await api(managerToken).post(`/v1/projects/${projectId}/budget-versions`)
      .set('Idempotency-Key', `cc-budget-${randomUUID()}`)
      .send({ currency: 'VND', totalAmount: '9000000' })
      .expect(201);
    await createPayment(vndContract.id, { requestedAmount: '1000.5' });

    const summary = await api(managerToken)
      .get(`/v1/projects/${projectId}/cost-summary`).expect(200);
    // No conversion, no cross-currency total: reportingCurrency is explicitly null.
    expect(summary.body.data.reportingCurrency).toBeNull();
    expect(summary.body.data.budget).toEqual([{
      status: 'SUBMITTED', budgetVersion: 1, currency: 'VND', totalAmount: '9000000.0000'
    }]);
    expect(summary.body.data.commitments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        currency: 'VND', costCode: 'CAPEX-TEST', status: 'ACTIVE', amount: '1000000.5000'
      }),
      expect.objectContaining({
        currency: 'USD', costCode: 'CAPEX-TEST', status: 'ACTIVE', amount: '2500.2500'
      })
    ]));
    expect(summary.body.data.commitments).toHaveLength(2);
    expect(summary.body.data.payments).toEqual([{
      currency: 'VND', status: 'DRAFT', requestedAmount: '1000.5000',
      approvedAmount: null, paidAmount: null, paymentCount: 1
    }]);
  });

  it('API-065/066: creates the payment slice in one transaction and reads it back', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const response = await createPayment(contract.id, {
      requestedAmount: '1000.5',
      invoice: invoicePayload('INV-2026-001'),
      components: [
        { sequenceNo: 1, componentType: 'BASE', amount: '1050.5', ruleVersion: 'v1' },
        {
          sequenceNo: 1, componentType: 'RETENTION', amount: '-50',
          basisAmount: '1050.5', rate: '-0.047596', ruleVersion: 'v1'
        }
      ],
      fxSnapshot: {
        baseCurrency: 'USD', quoteCurrency: 'VND', rate: '25450.123456',
        rateDate: '2026-07-25', source: 'demo-central-bank'
      }
    });
    expect(response).toMatchObject({
      status: 'DRAFT', currency: 'VND', requestedAmount: '1000.5000',
      requestedBy: managerId, approvedBy: null
    });
    expect(response.invoiceId).toEqual(expect.any(String));
    expect(response.fxSnapshotId).toEqual(expect.any(String));
    expect(response.components).toHaveLength(2);
    expect(await count(InvoiceEntity)).toBe(1);
    expect(await count(FxSnapshotEntity)).toBe(1);

    // The same invoice facts are reused, not duplicated.
    const secondPayment = await createPayment(contract.id, {
      requestedAmount: '99.75', invoice: invoicePayload('INV-2026-001')
    });
    expect(secondPayment.invoiceId).toBe(response.invoiceId);
    expect(await count(InvoiceEntity)).toBe(1);

    const detail = await api(managerToken)
      .get(`/v1/payments/${response.id}`).expect(200);
    expect(detail.body.data.id).toBe(response.id);
    expect(detail.body.data.components).toHaveLength(2);
    expect(detail.body.data.components.map(
      (row: { componentType: string; amount: string }) => [row.componentType, row.amount]
    )).toEqual([['BASE', '1050.5000'], ['RETENTION', '-50.0000']]);

    await api(otherTenantToken, otherTenantId)
      .get(`/v1/payments/${response.id}`).expect(404);
  });

  it('API-065: the negative twins each write nothing', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    await createPayment(contract.id, {
      requestedAmount: '1000.5', invoice: invoicePayload('INV-2026-001')
    });

    // Same invoice key, different facts: the duplicate-invoice control conflicts.
    const duplicate = await api(managerToken).post(`/v1/contracts/${contract.id}/payments`)
      .set('Idempotency-Key', `cc-pay-${randomUUID()}`)
      .send(paymentPayload({
        requestedAmount: '10',
        invoice: { ...invoicePayload('INV-2026-001'), grossAmount: '999999' }
      }))
      .expect(409);
    expect(duplicate.body.code).toBe('INVOICE_DUPLICATE');
    expect(await count(PaymentEntity)).toBe(1);

    // Component sum mismatch: surfaced from the deferred trigger, and the whole slice — payment,
    // components AND the new invoice — rolls back.
    const mismatch = await api(managerToken).post(`/v1/contracts/${contract.id}/payments`)
      .set('Idempotency-Key', `cc-pay-${randomUUID()}`)
      .send(paymentPayload({
        requestedAmount: '1000.5',
        invoice: invoicePayload('INV-2026-002'),
        components: [
          { sequenceNo: 1, componentType: 'BASE', amount: '900', ruleVersion: 'v1' }
        ]
      }))
      .expect(422);
    expect(mismatch.body.code).toBe('COMPONENT_SUM_MISMATCH');
    expect(await count(PaymentEntity)).toBe(1);
    expect(await count(PaymentComponentEntity)).toBe(0);
    expect(await count(InvoiceEntity)).toBe(1);

    const samePayerPayee = await api(managerToken).post(`/v1/contracts/${contract.id}/payments`)
      .set('Idempotency-Key', `cc-pay-${randomUUID()}`)
      .send(paymentPayload({ requestedAmount: '10', payeeLegalEntityId: payerEntityId }))
      .expect(422);
    expect(samePayerPayee.body.code).toBe('PAYER_PAYEE_SAME');

    // A component in another currency violates the composite key to payments(tenant,id,currency).
    const crossCurrency = await api(managerToken).post(`/v1/contracts/${contract.id}/payments`)
      .set('Idempotency-Key', `cc-pay-${randomUUID()}`)
      .send(paymentPayload({
        requestedAmount: '10',
        components: [{
          sequenceNo: 1, componentType: 'BASE', amount: '10', currency: 'USD', ruleVersion: 'v1'
        }]
      }))
      .expect(422);
    expect(crossCurrency.body.code).toBe('CURRENCY_MISMATCH');
    expect(await count(PaymentEntity)).toBe(1);
    expect(await count(PaymentComponentEntity)).toBe(0);
  });

  it('scope: a package-only principal and a cross-tenant reader both get 404, never 403', async () => {
    const contract = await createContract({ contractNo: 'CT-EPC-001' });
    const payment = await createPayment(contract.id, { requestedAmount: '10' });

    // The package principal holds the permission codes, so the guard admits it — and the service
    // answers as if the project did not exist, because contracts have no package granularity.
    const scopedList = await api(packageToken)
      .get(`/v1/projects/${projectId}/contracts`).expect(404);
    expect(scopedList.body.code).toBe('PROJECT_NOT_FOUND');
    await api(packageToken).get(`/v1/contracts/${contract.id}`).expect(404);
    await api(packageToken).get(`/v1/projects/${projectId}/cost-summary`).expect(404);
    await api(packageToken).get(`/v1/payments/${payment.id}`).expect(404);
    const scopedCreate = await api(packageToken)
      .post(`/v1/projects/${projectId}/contracts`)
      .set('Idempotency-Key', `cc-scope-${randomUUID()}`)
      .send(contractPayload({ contractNo: 'CT-PKG-001' }))
      .expect(404);
    expect(scopedCreate.body.code).toBe('PROJECT_NOT_FOUND');
    expect(await count(ContractEntity)).toBe(1);

    // Another tenant cannot even learn that the ids exist.
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/projects/${projectId}/contracts`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/contracts/${contract.id}`).expect(404);
    await api(otherTenantToken, otherTenantId)
      .get(`/v1/payments/${payment.id}`).expect(404);

    // 403 is reserved for a true permission gap: the decider has no contract.read at all.
    const denied = await api(deciderToken)
      .get(`/v1/projects/${projectId}/contracts`).expect(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
  });

  it('replays an identical command and conflicts on a reused key with different content', async () => {
    const key = `cc-replay-${randomUUID()}`;
    const first = await api(managerToken).post(`/v1/projects/${projectId}/contracts`)
      .set('Idempotency-Key', key).send(contractPayload({ contractNo: 'CT-EPC-001' }))
      .expect(201);
    const replay = await api(managerToken).post(`/v1/projects/${projectId}/contracts`)
      .set('Idempotency-Key', key).send(contractPayload({ contractNo: 'CT-EPC-001' }))
      .expect(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await count(ContractEntity)).toBe(1);

    const conflict = await api(managerToken).post(`/v1/projects/${projectId}/contracts`)
      .set('Idempotency-Key', key).send(contractPayload({ contractNo: 'CT-EPC-999' }))
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await count(ContractEntity)).toBe(1);
  });

  it('rejects a malformed cursor and a missing Idempotency-Key without writing', async () => {
    const cursor = await api(managerToken)
      .get(`/v1/projects/${projectId}/contracts?cursor=not-a-cursor`).expect(400);
    expect(cursor.body.code).toBe('INVALID_CURSOR');

    const missingKey = await api(managerToken).post(`/v1/projects/${projectId}/contracts`)
      .send(contractPayload({ contractNo: 'CT-EPC-001' }))
      .expect(400);
    expect(missingKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await count(ContractEntity)).toBe(0);
    expect(await count(BudgetVersionEntity)).toBe(0);
  });

  function contractPayload(overrides: Partial<{
    contractNo: string; type: string; currency: string;
  }>) {
    return {
      contractNo: overrides.contractNo ?? 'CT-EPC-001',
      title: 'Hợp đồng tổng thầu EPC nhà máy điện mặt trời',
      type: overrides.type ?? 'EPC', value: '1000000.50',
      currency: overrides.currency ?? 'VND'
    };
  }

  async function createContract(overrides: Parameters<typeof contractPayload>[0]) {
    const response = await api(managerToken).post(`/v1/projects/${projectId}/contracts`)
      .set('Idempotency-Key', `cc-create-${randomUUID()}`)
      .send(contractPayload(overrides))
      .expect(201);
    return response.body.data as { id: string } & Record<string, string | number | null>;
  }

  async function createParty(contractId: string, partyRole: string, legalEntityId: string) {
    const response = await api(managerToken).post(`/v1/contracts/${contractId}/parties`)
      .set('Idempotency-Key', `cc-party-${randomUUID()}`)
      .send({
        companyId, legalEntityId, partyRole,
        representativeName: 'Nguyễn Văn A', representativeTitle: 'Giám đốc',
        authorityReference: 'Giấy ủy quyền số 01/2026'
      })
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  async function createAppendix(contractId: string, overrides: {
    appendixNo: string; status?: string; effectiveDate?: string; valueImpact?: string;
  }) {
    const response = await api(managerToken).post(`/v1/contracts/${contractId}/appendices`)
      .set('Idempotency-Key', `cc-appx-${randomUUID()}`)
      .send({
        appendixNo: overrides.appendixNo, type: 'AMENDMENT',
        ...(overrides.status ? { status: overrides.status } : {}),
        ...(overrides.effectiveDate ? { effectiveDate: overrides.effectiveDate } : {}),
        ...(overrides.valueImpact ? { valueImpact: overrides.valueImpact } : {})
      })
      .expect(201);
    return response.body.data as { id: string } & Record<string, unknown>;
  }

  function obligationPayload(obligorPartyId: string, beneficiaryPartyId: string, overrides: {
    clauseRef?: string; dueDate?: string;
  } = {}) {
    return {
      clauseRef: overrides.clauseRef ?? 'DIEU-5.2',
      title: 'Nghĩa vụ nộp bảo lãnh thực hiện hợp đồng',
      obligorPartyId, beneficiaryPartyId, triggerType: 'MILESTONE',
      ...(overrides.dueDate ? { dueDate: overrides.dueDate } : {})
    };
  }

  async function createObligation(
    contractId: string, obligorPartyId: string, beneficiaryPartyId: string,
    overrides: { clauseRef?: string; dueDate?: string } = {}
  ) {
    const response = await api(managerToken).post(`/v1/contracts/${contractId}/obligations`)
      .set('Idempotency-Key', `cc-obl-${randomUUID()}`)
      .send(obligationPayload(obligorPartyId, beneficiaryPartyId, overrides))
      .expect(201);
    return response.body.data as { id: string; versionNo: number } & Record<string, unknown>;
  }

  function invoicePayload(invoiceNo: string) {
    return {
      invoiceNo, invoiceDate: '2026-07-20',
      supplierCompanyId: companyId, supplierLegalEntityId: payeeEntityId,
      grossAmount: '1100.55', vatAmount: '100.05', netAmount: '1000.5'
    };
  }

  function paymentPayload(overrides: Partial<{
    requestedAmount: string;
    payeeLegalEntityId: string;
    invoice: Record<string, unknown>;
    components: Array<Record<string, unknown>>;
    fxSnapshot: Record<string, unknown>;
  }>) {
    return {
      payerCompanyId: companyId, payerLegalEntityId: payerEntityId,
      payeeCompanyId: companyId,
      payeeLegalEntityId: overrides.payeeLegalEntityId ?? payeeEntityId,
      requestedAmount: overrides.requestedAmount ?? '1000.5',
      ...(overrides.invoice ? { invoice: overrides.invoice } : {}),
      ...(overrides.components ? { components: overrides.components } : {}),
      ...(overrides.fxSnapshot ? { fxSnapshot: overrides.fxSnapshot } : {})
    };
  }

  async function createPayment(
    contractId: string, overrides: Parameters<typeof paymentPayload>[0]
  ) {
    const response = await api(managerToken).post(`/v1/contracts/${contractId}/payments`)
      .set('Idempotency-Key', `cc-pay-${randomUUID()}`)
      .send(paymentPayload(overrides))
      .expect(201);
    return response.body.data as {
      id: string; invoiceId: string | null; fxSnapshotId: string | null;
      components: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
  }

  async function seedClosedContract(contractNo: string): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO contracts (
        id, tenant_id, project_id, contract_no, title, type, status, value, currency,
        signed_by, signed_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Hợp đồng đã đóng','EPC','CLOSED',0,'VND',$5,now(),$5,$5)`,
      [id, tenantId, projectId, contractNo, managerId]
    );
    return id;
  }

  function count(entity: Parameters<DataSource['getRepository']>[0]): Promise<number> {
    return dataSource.getRepository(entity).countBy({ tenantId });
  }

  async function seedFixture(): Promise<void> {
    await dataSource.getRepository(TenantEntity).save([
      { id: tenantId, code: 'cc-test', name: 'Contract Tenant', status: 'ACTIVE' },
      { id: otherTenantId, code: 'cc-other', name: 'Other Tenant', status: 'ACTIVE' }
    ]);
    await dataSource.getRepository(UserAccountEntity).save([
      user(managerId, tenantId, 'cc-manager@example.test', 'Contract Manager'),
      user(deciderId, tenantId, 'cc-decider@example.test', 'Obligation Decider'),
      user(packageUserId, tenantId, 'cc-package@example.test', 'Package Reader'),
      user(otherTenantUserId, otherTenantId, 'cc-other@example.test', 'Other Tenant')
    ]);
    await dataSource.getRepository(LocalCredentialEntity).save([
      credential(managerId, tenantId), credential(deciderId, tenantId),
      credential(packageUserId, tenantId), credential(otherTenantUserId, otherTenantId)
    ]);

    const managerRole = await role(tenantId, 'CC_MANAGER', [
      'contract.read', 'contract.create', 'contract.update', 'contractParty.create',
      'contractAppendix.create', 'obligation.read', 'obligation.create', 'obligation.fulfill',
      'cost.read', 'budget.submit', 'commitment.create', 'payment.create', 'payment.read'
    ]);
    // Deliberately without contract.read, to prove 403 stays reserved for a permission gap.
    const deciderRole = await role(tenantId, 'CC_DECIDER', [
      'obligation.read', 'obligation.fulfill'
    ]);
    // Holds the read/create codes but only at package scope: the service must answer 404.
    const packageRole = await role(tenantId, 'CC_PACKAGE', [
      'contract.read', 'contract.create', 'obligation.read', 'cost.read', 'payment.read'
    ]);
    const otherRole = await role(otherTenantId, 'CC_OTHER', [
      'contract.read', 'contract.create', 'obligation.read', 'cost.read', 'payment.read'
    ]);

    await seedProject(tenantId, projectId, 'CC-PRJ', managerId, companyId, payerEntityId);
    await seedProject(
      otherTenantId, otherProjectId, 'CC-OTH', otherTenantUserId, randomUUID(), randomUUID()
    );
    await dataSource.getRepository(LegalEntityEntity).save({
      id: payeeEntityId, tenantId, companyId, legalName: 'Legal CC-PAYEE', country: 'VN',
      registrationNo: 'REG-CC-PAYEE', taxId: null, status: MasterRecordStatus.ACTIVE,
      idempotencyKey: null
    });
    await dataSource.getRepository(PackageEntity).save({
      id: packageAId, tenantId, projectId, parentPackageId: null, contractorCompanyId: null,
      code: 'CC-PKG-A', name: 'CC-PKG-A', packageType: 'EPC', status: PackageStatus.ACTIVE,
      versionNo: 1, idempotencyKey: null, createdBy: managerId, updatedBy: managerId
    });
    await dataSource.getRepository(CostCodeEntity).save({
      id: costCodeId, tenantId, parentCostCodeId: null, code: 'CAPEX-TEST',
      name: 'Test Cost Code', capexOpexClass: CostCodeClass.CAPEX,
      status: CostCodeStatus.ACTIVE, effectiveFrom: '2026-01-01', effectiveTo: null,
      createdBy: managerId, updatedBy: managerId
    });

    await dataSource.getRepository(RoleAssignmentEntity).save([
      assignment(tenantId, managerId, managerRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, deciderId, deciderRole.id, AssignmentScopeType.TENANT, null),
      assignment(tenantId, packageUserId, packageRole.id, AssignmentScopeType.PACKAGE, packageAId),
      assignment(otherTenantId, otherTenantUserId, otherRole.id, AssignmentScopeType.TENANT, null)
    ]);
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerUserId: string,
    fixtureCompanyId: string, fixtureLegalId: string
  ): Promise<void> {
    const company = await dataSource.getRepository(CompanyEntity).save({
      id: fixtureCompanyId, tenantId: fixtureTenantId, code: `COMP-${code}`,
      name: `Company ${code}`, organizationType: OrganizationType.INTERNAL,
      status: MasterRecordStatus.ACTIVE, idempotencyKey: null
    });
    const legal = await dataSource.getRepository(LegalEntityEntity).save({
      id: fixtureLegalId, tenantId: fixtureTenantId, companyId: company.id,
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

  async function role(fixtureTenantId: string, code: string, permissions: string[]) {
    return dataSource.getRepository(RoleEntity).save({
      id: randomUUID(), tenantId: fixtureTenantId, code, name: code,
      permissions, policyVersion: 7, status: MasterRecordStatus.ACTIVE
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
