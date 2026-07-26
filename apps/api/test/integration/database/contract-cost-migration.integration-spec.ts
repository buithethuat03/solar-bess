import { randomUUID } from 'node:crypto';
import AppDataSource from 'src/database/data-source';
import { revertThroughMigration, runTestMigrations } from 'test/setup/run-migrations';

jest.setTimeout(180_000);

const migrationName = 'CreateContractCost1783742000000';
const grantMigrationName = 'GrantContractCostPermissions1783743000000';
const tables = [
  'cost_codes', 'fx_snapshots', 'contracts', 'contract_parties', 'contract_appendices',
  'obligations', 'budget_versions', 'commitments', 'invoices', 'payments', 'payment_components'
];

describe('Contract & Cost migration — DB-028…DB-031, DB-034…DB-040', () => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const authorId = randomUUID();
  const deciderId = randomUUID();
  const otherTenantUserId = randomUUID();
  const projectId = randomUUID();
  const otherProjectId = randomUUID();
  const companyId = randomUUID();
  const payerEntityId = randomUUID();
  const payeeEntityId = randomUUID();
  const costCodeId = randomUUID();

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

  it('grants the contract & cost permissions and takes back exactly what it added on down', async () => {
    const roleId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO roles (id, tenant_id, code, name, permissions, policy_version, status)
       VALUES ($1,$2,'PROJECT_CONTROLS','Project Controls',$3::jsonb,1,'ACTIVE')`,
      [roleId, tenantId, JSON.stringify(['package.read', 'contract.read'])]
    );
    await revertThroughMigration(grantMigrationName);
    await AppDataSource.runMigrations({ transaction: 'all' });

    const granted = await permissionsOf(roleId);
    expect(granted).toEqual(expect.arrayContaining([
      'contract.read', 'obligation.read', 'cost.read', 'budget.submit',
      'commitment.create', 'payment.read'
    ]));
    expect(granted).not.toContain('contract.create');
    expect(granted).not.toContain('payment.create');
    const [role] = await AppDataSource.query<Array<{ policyVersion: number }>>(
      'SELECT policy_version AS "policyVersion" FROM roles WHERE id = $1', [roleId]
    );
    expect(role.policyVersion).toBe(7);

    await revertThroughMigration(grantMigrationName);
    const reverted = await permissionsOf(roleId);
    // The pre-existing `contract.read` was not added by this migration, so it must survive.
    expect(reverted).toEqual(['package.read', 'contract.read']);

    await AppDataSource.runMigrations({ transaction: 'all' });
  });

  it('protects contract history: no delete after DRAFT, frozen identity once signed, no regression', async () => {
    const draftId = await seedContract({ contractNo: 'CT-DRAFT' });
    await expect(AppDataSource.query('DELETE FROM contracts WHERE id = $1', [draftId]))
      .resolves.toBeDefined();

    const reviewId = await seedContract({ contractNo: 'CT-REVIEW', status: 'REVIEW' });
    await expect(AppDataSource.query('DELETE FROM contracts WHERE id = $1', [reviewId]))
      .rejects.toMatchObject({ code: '55000' });
    // REVIEW → DRAFT is a regression.
    await expect(AppDataSource.query(
      `UPDATE contracts SET status = 'DRAFT' WHERE id = $1`, [reviewId]
    )).rejects.toMatchObject({ code: '55000' });

    const signedId = await seedContract({ contractNo: 'CT-SIGNED', status: 'SIGNED', signed: true });
    for (const statement of [
      `UPDATE contracts SET value = 999 WHERE id = $1`,
      `UPDATE contracts SET contract_no = 'CT-RENAMED' WHERE id = $1`,
      `UPDATE contracts SET signed_by = NULL, signed_at = NULL, status = 'DRAFT' WHERE id = $1`
    ]) {
      await expect(AppDataSource.query(statement, [signedId]))
        .rejects.toMatchObject({ code: '55000' });
    }
    // Moving forward stays legal: SIGNED → EFFECTIVE with an effective date.
    await expect(AppDataSource.query(
      `UPDATE contracts SET status = 'EFFECTIVE', effective_from = '2026-01-01'
       WHERE id = $1`, [signedId]
    )).rejects.toMatchObject({ code: '55000' });
    // effective_from is part of the frozen identity, so it must be present before signing.
    const effectiveId = await seedContract({
      contractNo: 'CT-EFFECTIVE', status: 'SIGNED', signed: true, effectiveFrom: '2026-01-01'
    });
    await expect(AppDataSource.query(
      `UPDATE contracts SET status = 'EFFECTIVE' WHERE id = $1`, [effectiveId]
    )).resolves.toBeDefined();
  });

  it('freezes a contract under legal hold except for lifting the hold', async () => {
    const contractId = await seedContract({ contractNo: 'CT-HOLD' });
    await AppDataSource.query(
      'UPDATE contracts SET legal_hold = true WHERE id = $1', [contractId]
    );
    await expect(AppDataSource.query(
      `UPDATE contracts SET title = 'Đổi tên khi đang hold' WHERE id = $1`, [contractId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'UPDATE contracts SET legal_hold = false WHERE id = $1', [contractId]
    )).resolves.toBeDefined();
  });

  it('keeps party snapshots immutable and deletable only while the contract is DRAFT', async () => {
    const contractId = await seedContract({ contractNo: 'CT-PARTY' });
    const partyId = await seedParty(contractId, 'OWNER', payerEntityId);
    await expect(AppDataSource.query(
      `UPDATE contract_parties SET legal_name_snapshot = 'viết lại' WHERE id = $1`, [partyId]
    )).rejects.toMatchObject({ code: '55000' });

    await AppDataSource.query(
      `UPDATE contracts SET status = 'REVIEW' WHERE id = $1`, [contractId]
    );
    await expect(AppDataSource.query(
      'DELETE FROM contract_parties WHERE id = $1', [partyId]
    )).rejects.toMatchObject({ code: '55000' });

    const draftContractId = await seedContract({ contractNo: 'CT-PARTY-2' });
    const draftPartyId = await seedParty(draftContractId, 'OWNER', payerEntityId);
    await expect(AppDataSource.query(
      'DELETE FROM contract_parties WHERE id = $1', [draftPartyId]
    )).resolves.toBeDefined();
  });

  it('freezes EFFECTIVE appendices and binds appendix currency to the contract', async () => {
    const contractId = await seedContract({ contractNo: 'CT-APPX' });
    const appendixId = await seedAppendix(contractId, {
      appendixNo: 'PL-01', status: 'EFFECTIVE', effectiveDate: '2026-02-01'
    });
    await expect(AppDataSource.query(
      `UPDATE contract_appendices SET value_impact = 1 WHERE id = $1`, [appendixId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM contract_appendices WHERE id = $1', [appendixId]
    )).rejects.toMatchObject({ code: '55000' });

    // The composite currency foreign key refuses a cross-currency appendix outright.
    await expect(seedAppendix(contractId, { appendixNo: 'PL-02', currency: 'USD' }))
      .rejects.toMatchObject({ code: '23503' });
    // A DRAFT appendix stays editable.
    const draftAppendixId = await seedAppendix(contractId, { appendixNo: 'PL-03' });
    await expect(AppDataSource.query(
      `UPDATE contract_appendices SET value_impact = -100 WHERE id = $1`, [draftAppendixId]
    )).resolves.toBeDefined();
  });

  it('enforces obligation decision integrity: SoD, evidence and immutability', async () => {
    const contractId = await seedContract({ contractNo: 'CT-OBL' });
    const obligorId = await seedParty(contractId, 'EPC', payerEntityId);
    const beneficiaryId = await seedParty(contractId, 'OWNER', payeeEntityId);

    // The decision maker may be neither the owner nor the creator — as a row constraint.
    await expect(seedObligation(contractId, obligorId, beneficiaryId, {
      status: 'FULFILLED', decisionBy: authorId
    })).rejects.toMatchObject({ constraint: 'ck_obligation_sod' });

    // No fulfilment without at least one piece of decision evidence.
    await expect(seedObligation(contractId, obligorId, beneficiaryId, {
      status: 'FULFILLED', decisionBy: deciderId, decisionEvidence: []
    })).rejects.toMatchObject({ constraint: 'ck_obligation_decision_evidence' });

    // Obligor and beneficiary must differ.
    await expect(seedObligation(contractId, obligorId, obligorId, {}))
      .rejects.toMatchObject({ constraint: 'ck_obligation_distinct_parties' });

    const decidedId = await seedObligation(contractId, obligorId, beneficiaryId, {
      status: 'FULFILLED', decisionBy: deciderId, decisionEvidence: ['minio://evidence/1']
    });
    await expect(AppDataSource.query(
      `UPDATE obligations SET decision_reason = 'viết lại' WHERE id = $1`, [decidedId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM obligations WHERE id = $1', [decidedId]
    )).rejects.toMatchObject({ code: '55000' });

    // A party of a different contract is unreferencable thanks to the composite key.
    const otherContractId = await seedContract({ contractNo: 'CT-OBL-2' });
    await expect(seedObligation(otherContractId, obligorId, beneficiaryId, {}))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('keeps one APPROVED budget baseline per project and freezes it', async () => {
    await seedBudgetVersion(1, 'SUBMITTED');
    const approvedId = await seedBudgetVersion(2, 'APPROVED');
    await expect(seedBudgetVersion(3, 'APPROVED'))
      .rejects.toMatchObject({ code: '23505' });

    await expect(AppDataSource.query(
      `UPDATE budget_versions SET total_amount = 1 WHERE id = $1`, [approvedId]
    )).rejects.toMatchObject({ code: '55000' });
    // Superseding is the one legal exit; a second baseline can then be approved.
    await expect(AppDataSource.query(
      `UPDATE budget_versions SET status = 'SUPERSEDED' WHERE id = $1`, [approvedId]
    )).resolves.toBeDefined();
    await expect(seedBudgetVersion(3, 'APPROVED')).resolves.toBeDefined();
  });

  it('keeps the commitment ledger append-only with a unique source version', async () => {
    const contractId = await seedContract({ contractNo: 'CT-CMT' });
    const commitmentId = await seedCommitment(contractId, {
      sourceId: contractId, sourceVersion: 1
    });
    await expect(seedCommitment(contractId, { sourceId: contractId, sourceVersion: 1 }))
      .rejects.toMatchObject({ constraint: 'uq_commitment_source' });

    await expect(AppDataSource.query(
      `UPDATE commitments SET amount = 1 WHERE id = $1`, [commitmentId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM commitments WHERE id = $1', [commitmentId]
    )).rejects.toMatchObject({ code: '55000' });

    // Reversals must be negative and originals positive.
    await expect(seedCommitment(contractId, {
      sourceId: contractId, sourceVersion: 2, amount: '-10.0000'
    })).rejects.toMatchObject({ constraint: 'ck_commitment_amount_sign' });
    await expect(seedCommitment(contractId, {
      sourceId: contractId, sourceVersion: 3, amount: '-10.0000',
      reversesCommitmentId: commitmentId
    })).resolves.toBeDefined();
    // Currency is bound to the contract by the composite foreign key.
    await expect(seedCommitment(contractId, {
      sourceId: contractId, sourceVersion: 4, currency: 'USD'
    })).rejects.toMatchObject({ code: '23503' });
  });

  it('never deletes a payment and freezes it once PAID, allowing only reconciliation', async () => {
    const contractId = await seedContract({ contractNo: 'CT-PAY' });
    const draftId = await seedPayment(contractId, { status: 'DRAFT' });
    await expect(AppDataSource.query('DELETE FROM payments WHERE id = $1', [draftId]))
      .rejects.toMatchObject({ code: '55000' });

    const paidId = await seedPayment(contractId, { status: 'PAID' });
    await expect(AppDataSource.query(
      `UPDATE payments SET requested_amount = 1 WHERE id = $1`, [paidId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      `UPDATE payments SET status = 'RECONCILED' WHERE id = $1`, [paidId]
    )).resolves.toBeDefined();
    await expect(AppDataSource.query(
      `UPDATE payments SET bank_reference = 'đổi' WHERE id = $1`, [paidId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('rejects at COMMIT a component breakdown that does not sum to the requested amount', async () => {
    const contractId = await seedContract({ contractNo: 'CT-SUM' });

    // Wrong sum: the deferred constraint trigger fails the whole transaction at commit.
    await expect(AppDataSource.transaction(async (manager) => {
      const paymentId = await seedPayment(contractId, { status: 'DRAFT' }, manager);
      await seedComponent(paymentId, {
        sequenceNo: 1, componentType: 'BASE', amount: '900.0000'
      }, manager);
      await seedComponent(paymentId, {
        sequenceNo: 1, componentType: 'RETENTION', amount: '-50.0000'
      }, manager);
    })).rejects.toMatchObject({ constraint: 'ck_payment_component_sum' });
    expect(await count('payments')).toBe(0);
    expect(await count('payment_components')).toBe(0);

    // Right sum (1000.5 = 1050.5 - 50) commits.
    await AppDataSource.transaction(async (manager) => {
      const paymentId = await seedPayment(contractId, { status: 'DRAFT' }, manager);
      await seedComponent(paymentId, {
        sequenceNo: 1, componentType: 'BASE', amount: '1050.5000'
      }, manager);
      await seedComponent(paymentId, {
        sequenceNo: 1, componentType: 'RETENTION', amount: '-50.0000'
      }, manager);
    });
    expect(await count('payments')).toBe(1);
    expect(await count('payment_components')).toBe(2);

    // Component currency is bound to the payment by the composite foreign key.
    const [payment] = await AppDataSource.query<Array<{ id: string }>>(
      'SELECT id FROM payments LIMIT 1'
    );
    await expect(seedComponent(payment.id, {
      sequenceNo: 2, componentType: 'BASE', amount: '0.0000', currency: 'USD'
    })).rejects.toMatchObject({ code: '23503' });
    // Sign discipline: a deduction type can never be positive.
    await expect(seedComponent(payment.id, {
      sequenceNo: 2, componentType: 'RETENTION', amount: '10.0000'
    })).rejects.toMatchObject({ constraint: 'ck_payment_component_sign' });
  });

  it('keeps FX snapshots immutable and unique per source/date/pair', async () => {
    const snapshotId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO fx_snapshots (
        id, tenant_id, base_currency, quote_currency, rate, rate_date, source, created_by
      ) VALUES ($1,$2,'USD','VND',25450.123456789,'2026-07-25','demo-central-bank',$3)`,
      [snapshotId, tenantId, authorId]
    );
    await expect(AppDataSource.query(
      `INSERT INTO fx_snapshots (
        id, tenant_id, base_currency, quote_currency, rate, rate_date, source, created_by
      ) VALUES ($1,$2,'USD','VND',25999,'2026-07-25','demo-central-bank',$3)`,
      [randomUUID(), tenantId, authorId]
    )).rejects.toMatchObject({ constraint: 'uq_fx_snapshot_key' });
    await expect(AppDataSource.query(
      'UPDATE fx_snapshots SET rate = 1 WHERE id = $1', [snapshotId]
    )).rejects.toMatchObject({ code: '55000' });
    await expect(AppDataSource.query(
      'DELETE FROM fx_snapshots WHERE id = $1', [snapshotId]
    )).rejects.toMatchObject({ code: '55000' });
  });

  it('cannot reference a project, legal entity or contract from another tenant', async () => {
    // Contract pointing at the other tenant's project.
    await expect(seedContract({ contractNo: 'CT-X', projectId: otherProjectId }))
      .rejects.toMatchObject({ code: '23503' });

    // Party pointing at the other tenant's legal entity.
    const contractId = await seedContract({ contractNo: 'CT-XT' });
    const foreignEntityId = randomUUID();
    const foreignCompanyId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,'COMP-F','Foreign Co','INTERNAL','ACTIVE')`,
      [foreignCompanyId, otherTenantId]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Foreign Legal','VN','REG-F','ACTIVE')`,
      [foreignEntityId, otherTenantId, foreignCompanyId]
    );
    await expect(AppDataSource.query(
      `INSERT INTO contract_parties (
        id, tenant_id, contract_id, project_id, company_id, legal_entity_id, party_role,
        legal_name_snapshot, country_snapshot, registration_no_snapshot,
        snapshot_at, snapshot_hash, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,'VENDOR','Foreign Legal','VN','REG-F',now(),$7,$8)`,
      [
        randomUUID(), tenantId, contractId, projectId, foreignCompanyId, foreignEntityId,
        'a'.repeat(64), authorId
      ]
    )).rejects.toMatchObject({ code: '23503' });
  });

  async function permissionsOf(roleId: string): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<{ permissions: string[] }>>(
      'SELECT permissions FROM roles WHERE id = $1', [roleId]
    );
    return row.permissions;
  }

  async function count(table: string): Promise<number> {
    const [row] = await AppDataSource.query<Array<{ count: string }>>(
      `SELECT count(*) AS count FROM ${table}`
    );
    return Number(row.count);
  }

  async function regclasses(): Promise<string[]> {
    const [row] = await AppDataSource.query<Array<Record<string, string | null>>>(
      tables.map((table) => `to_regclass('public.${table}')::text AS ${table}`).join(', ')
        .replace(/^/, 'SELECT ')
    );
    return tables.filter((table) => row[table] !== null);
  }

  async function seedContract(overrides: {
    contractNo: string;
    status?: string;
    signed?: boolean;
    effectiveFrom?: string;
    projectId?: string;
    currency?: string;
  }): Promise<string> {
    const id = randomUUID();
    const signed = overrides.signed ?? false;
    await AppDataSource.query(
      `INSERT INTO contracts (
        id, tenant_id, project_id, contract_no, title, type, status, effective_from,
        value, currency, signed_by, signed_at, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Hợp đồng EPC','EPC',$5,$6,1000000.5,$7,$8,$9,$10,$10)`,
      [
        id, tenantId, overrides.projectId ?? projectId, overrides.contractNo,
        overrides.status ?? 'DRAFT', overrides.effectiveFrom ?? null,
        overrides.currency ?? 'VND',
        signed ? authorId : null, signed ? new Date() : null, authorId
      ]
    );
    return id;
  }

  async function seedParty(
    contractId: string, role: string, legalEntityId: string
  ): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO contract_parties (
        id, tenant_id, contract_id, project_id, company_id, legal_entity_id, party_role,
        legal_name_snapshot, country_snapshot, registration_no_snapshot,
        snapshot_at, snapshot_hash, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Demo Legal','VN','REG-CC',now(),$8,$9)`,
      [id, tenantId, contractId, projectId, companyId, legalEntityId, role, 'a'.repeat(64), authorId]
    );
    return id;
  }

  async function seedAppendix(contractId: string, overrides: {
    appendixNo: string;
    status?: string;
    effectiveDate?: string;
    currency?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO contract_appendices (
        id, tenant_id, contract_id, project_id, appendix_no, revision_no, type,
        effective_date, value_impact, currency, status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,1,'AMENDMENT',$6,250000.25,$7,$8,$9,$9)`,
      [
        id, tenantId, contractId, projectId, overrides.appendixNo,
        overrides.effectiveDate ?? null, overrides.currency ?? 'VND',
        overrides.status ?? 'DRAFT', authorId
      ]
    );
    return id;
  }

  async function seedObligation(
    contractId: string, obligorId: string, beneficiaryId: string, overrides: {
      status?: string;
      decisionBy?: string;
      decisionEvidence?: string[];
    }
  ): Promise<string> {
    const id = randomUUID();
    const status = overrides.status ?? 'OPEN';
    const decided = status === 'FULFILLED' || status === 'WAIVED';
    await AppDataSource.query(
      `INSERT INTO obligations (
        id, tenant_id, contract_id, project_id, clause_ref, title, obligor_party_id,
        beneficiary_party_id, owner_user_id, trigger_type, status,
        decision_type, decision_by, decision_at, decision_reason, decision_evidence_refs,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'Điều 5.2','Nghĩa vụ bảo lãnh',$5,$6,$7,'MILESTONE',$8,
        $9,$10,$11,$12,$13,$7,$7)`,
      [
        id, tenantId, contractId, projectId, obligorId, beneficiaryId, authorId, status,
        decided ? status : null, decided ? (overrides.decisionBy ?? deciderId) : null,
        decided ? new Date() : null, decided ? 'Đã hoàn thành theo biên bản' : null,
        decided ? JSON.stringify(overrides.decisionEvidence ?? ['minio://evidence/1']) : null
      ]
    );
    return id;
  }

  async function seedBudgetVersion(budgetVersion: number, status: string): Promise<string> {
    const id = randomUUID();
    const decided = status === 'APPROVED' || status === 'SUPERSEDED';
    await AppDataSource.query(
      `INSERT INTO budget_versions (
        id, tenant_id, project_id, budget_version, currency, total_amount, status,
        snapshot, snapshot_hash, submitted_by, submitted_at, approved_by, approved_at,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,'VND',5000000,$5,$6::jsonb,$7,$8,now(),$9,$10,$8,$8)`,
      [
        id, tenantId, projectId, budgetVersion, status,
        decided ? JSON.stringify({ totalAmount: '5000000' }) : null,
        decided ? 'b'.repeat(64) : null,
        authorId, status === 'APPROVED' ? deciderId : null,
        status === 'APPROVED' ? new Date() : null
      ]
    );
    return id;
  }

  async function seedCommitment(contractId: string, overrides: {
    sourceId: string;
    sourceVersion: number;
    amount?: string;
    currency?: string;
    reversesCommitmentId?: string;
  }): Promise<string> {
    const id = randomUUID();
    await AppDataSource.query(
      `INSERT INTO commitments (
        id, tenant_id, project_id, contract_id, cost_code_id, amount, currency, status,
        source_type, source_id, source_version, reverses_commitment_id, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE','CONTRACT',$8,$9,$10,$11)`,
      [
        id, tenantId, projectId, contractId, costCodeId,
        overrides.amount ?? '1000000.5000', overrides.currency ?? 'VND',
        overrides.sourceId, overrides.sourceVersion,
        overrides.reversesCommitmentId ?? null, authorId
      ]
    );
    return id;
  }

  async function seedPayment(
    contractId: string, overrides: { status: string },
    manager: { query: (sql: string, parameters?: unknown[]) => Promise<unknown> } = AppDataSource
  ): Promise<string> {
    const id = randomUUID();
    const paid = overrides.status === 'PAID' || overrides.status === 'RECONCILED';
    await manager.query(
      `INSERT INTO payments (
        id, tenant_id, project_id, contract_id, payer_company_id, payer_legal_entity_id,
        payee_company_id, payee_legal_entity_id, requested_amount, approved_amount, paid_amount,
        currency, status, paid_at, evidence_refs, requested_by, submitted_by, approved_by,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$5,$7,1000.5,$8,$9,'VND',$10,$11,$12::jsonb,$13,$14,$15,$13,$13)`,
      [
        id, tenantId, projectId, contractId, companyId, payerEntityId, payeeEntityId,
        paid ? '1000.5000' : null, paid ? '1000.5000' : null,
        overrides.status, paid ? new Date() : null,
        overrides.status === 'DRAFT' ? '[]' : '["minio://evidence/payment-1"]',
        authorId, paid ? authorId : null, paid ? deciderId : null
      ]
    );
    return id;
  }

  async function seedComponent(
    paymentId: string, overrides: {
      sequenceNo: number; componentType: string; amount: string; currency?: string;
    },
    manager: { query: (sql: string, parameters?: unknown[]) => Promise<unknown> } = AppDataSource
  ): Promise<void> {
    await manager.query(
      `INSERT INTO payment_components (
        id, tenant_id, payment_id, sequence_no, component_type, amount, currency, rule_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'v1')`,
      [
        randomUUID(), tenantId, paymentId, overrides.sequenceNo, overrides.componentType,
        overrides.amount, overrides.currency ?? 'VND'
      ]
    );
  }

  async function seedMasterData(): Promise<void> {
    for (const [id, code] of [[tenantId, 'cc-mig'], [otherTenantId, 'cc-mig-other']] as const) {
      await AppDataSource.query(
        `INSERT INTO tenants (id, code, name, status) VALUES ($1,$2,$2,'ACTIVE')`, [id, code]
      );
    }
    for (const [id, tenant, email] of [
      [authorId, tenantId, 'cc-mig-author@example.test'],
      [deciderId, tenantId, 'cc-mig-decider@example.test'],
      [otherTenantUserId, otherTenantId, 'cc-mig-other@example.test']
    ] as const) {
      await AppDataSource.query(
        `INSERT INTO user_accounts (
          id, tenant_id, email, normalized_email, display_name, status
        ) VALUES ($1,$2,$3,$3,'Fixture','ACTIVE')`, [id, tenant, email]
      );
    }
    await seedProject(tenantId, projectId, 'CC-PRJ', authorId, companyId, payerEntityId);
    await seedProject(
      otherTenantId, otherProjectId, 'CC-PRJ-2', otherTenantUserId, randomUUID(), randomUUID()
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Payee Legal','VN','REG-CC-2','ACTIVE')`,
      [payeeEntityId, tenantId, companyId]
    );
    await AppDataSource.query(
      `INSERT INTO cost_codes (
        id, tenant_id, code, name, capex_opex_class, status, effective_from, created_by, updated_by
      ) VALUES ($1,$2,'CAPEX-TEST','Test Cost Code','CAPEX','ACTIVE','2026-01-01',$3,$3)`,
      [costCodeId, tenantId, authorId]
    );
  }

  async function seedProject(
    fixtureTenantId: string, fixtureProjectId: string, code: string, managerId: string,
    fixtureCompanyId: string, fixtureLegalId: string
  ): Promise<void> {
    const portfolioId = randomUUID();
    await AppDataSource.query(
      `INSERT INTO companies (id, tenant_id, code, name, organization_type, status)
       VALUES ($1,$2,$3,'Company CC','INTERNAL','ACTIVE')`,
      [fixtureCompanyId, fixtureTenantId, `COMP-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO legal_entities (id, tenant_id, company_id, legal_name, country, registration_no, status)
       VALUES ($1,$2,$3,'Legal CC','VN',$4,'ACTIVE')`,
      [fixtureLegalId, fixtureTenantId, fixtureCompanyId, `REG-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO portfolios (id, tenant_id, code, name, status)
       VALUES ($1,$2,$3,'Portfolio CC','ACTIVE')`,
      [portfolioId, fixtureTenantId, `PORT-${code}`]
    );
    await AppDataSource.query(
      `INSERT INTO projects (
        id, tenant_id, portfolio_id, owner_legal_entity_id, customer_company_id,
        project_manager_id, code, name, type, phase, record_status, contract_model,
        currency, planned_cod
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'Contract Cost Project','SOLAR','PLANNING','ACTIVE','EPC','VND','2027-12-31')`,
      [fixtureProjectId, fixtureTenantId, portfolioId, fixtureLegalId, fixtureCompanyId, managerId, code]
    );
  }
});
