import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-028…DB-031 and DB-034…DB-040 for the Contract & Cost slice (API-053…API-066). The DDL mirrors
 * the entity decorators one-for-one: every `@Check`, `@Unique` and `@Index` appears here under the
 * same name, so a constraint can be traced from the TypeScript model to the database and back.
 *
 * Deliberate absences: no `guarantees` (DB-032) or `permits` (DB-033) — no operation writes them;
 * no budget line-item table — headers only in V1; no `purchase_order_id` on commitments —
 * Procurement is deferred; no CHECK net = gross - vat on invoices — the tax rule is TBD.
 *
 * Money is `numeric(19,4)` (FX rates `numeric(28,12)`) and every arithmetic identity — the
 * consolidated contract value and the payment component sum — is computed in Postgres numeric.
 * Every foreign key is composite and carries `tenant_id`; the currency-carrying keys
 * (`contracts(tenant_id,id,currency)`, `payments(tenant_id,id,currency)`) make a cross-currency
 * reference structurally impossible.
 */
export class CreateContractCost1783742000000 implements MigrationInterface {
  name = 'CreateContractCost1783742000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE cost_codes (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      parent_cost_code_id uuid,
      code varchar(40) NOT NULL,
      name varchar(200) NOT NULL,
      capex_opex_class varchar(10) NOT NULL,
      status varchar(20) NOT NULL,
      effective_from date NOT NULL,
      effective_to date,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_cost_codes PRIMARY KEY (id),
      CONSTRAINT uq_cost_codes_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_cost_code_code UNIQUE (tenant_id, code),
      CONSTRAINT fk_cost_code_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_cost_code_parent FOREIGN KEY (tenant_id, parent_cost_code_id)
        REFERENCES cost_codes (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cost_code_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_cost_code_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_cost_code_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_.-]{0,39}$'),
      CONSTRAINT ck_cost_code_class CHECK (capex_opex_class IN ('CAPEX','OPEX')),
      CONSTRAINT ck_cost_code_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
      CONSTRAINT ck_cost_code_parent CHECK (parent_cost_code_id IS NULL OR parent_cost_code_id <> id),
      CONSTRAINT ck_cost_code_window CHECK (effective_to IS NULL OR effective_to > effective_from),
      CONSTRAINT ck_cost_code_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE fx_snapshots (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      base_currency char(3) NOT NULL,
      quote_currency char(3) NOT NULL,
      rate numeric(28,12) NOT NULL,
      rate_date date NOT NULL,
      source varchar(80) NOT NULL,
      captured_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid NOT NULL,
      CONSTRAINT pk_fx_snapshots PRIMARY KEY (id),
      CONSTRAINT uq_fx_snapshots_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_fx_snapshot_key UNIQUE (tenant_id, source, rate_date, base_currency, quote_currency),
      CONSTRAINT fk_fx_snapshot_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_fx_snapshot_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_fx_snapshot_base_currency CHECK (base_currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_fx_snapshot_quote_currency CHECK (quote_currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_fx_snapshot_distinct_currencies CHECK (base_currency <> quote_currency),
      CONSTRAINT ck_fx_snapshot_rate CHECK (rate > 0)
    )`);

    await queryRunner.query(`CREATE TABLE contracts (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      contract_no varchar(80) NOT NULL,
      title varchar(400) NOT NULL,
      type varchar(30) NOT NULL,
      status varchar(20) NOT NULL,
      effective_from date,
      effective_to date,
      value numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      root_document_id uuid,
      legal_hold boolean NOT NULL DEFAULT false,
      signed_at timestamptz,
      signed_by uuid,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_contracts PRIMARY KEY (id),
      CONSTRAINT uq_contracts_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_contracts_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_contracts_tenant_currency UNIQUE (tenant_id, id, currency),
      CONSTRAINT uq_contract_project_number UNIQUE (tenant_id, project_id, contract_no),
      CONSTRAINT fk_contract_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_root_document FOREIGN KEY (tenant_id, project_id, root_document_id)
        REFERENCES documents (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_signed_by FOREIGN KEY (tenant_id, signed_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_contract_number CHECK (contract_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_contract_type CHECK
        (type IN ('EPC','EQUIPMENT_LEASE','PPA','ESCO','SUBCONTRACT','EQUIPMENT_PURCHASE')),
      CONSTRAINT ck_contract_status CHECK
        (status IN ('DRAFT','REVIEW','APPROVED','SIGNED','EFFECTIVE','SUSPENDED','EXPIRED','CLOSED')),
      CONSTRAINT ck_contract_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_contract_value CHECK (value >= 0),
      CONSTRAINT ck_contract_effective_window CHECK (effective_from IS NULL OR effective_to IS NULL
        OR effective_to >= effective_from),
      CONSTRAINT ck_contract_signed_pair CHECK ((signed_by IS NULL) = (signed_at IS NULL)),
      CONSTRAINT ck_contract_signed_status CHECK
        (status NOT IN ('SIGNED','EFFECTIVE','SUSPENDED','EXPIRED','CLOSED')
        OR signed_by IS NOT NULL),
      CONSTRAINT ck_contract_effective_requires_from CHECK
        (status <> 'EFFECTIVE' OR effective_from IS NOT NULL),
      CONSTRAINT ck_contract_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE contract_parties (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      contract_id uuid NOT NULL,
      project_id uuid NOT NULL,
      company_id uuid NOT NULL,
      legal_entity_id uuid NOT NULL,
      party_role varchar(30) NOT NULL,
      legal_name_snapshot varchar(250) NOT NULL,
      country_snapshot char(2) NOT NULL,
      registration_no_snapshot varchar(100) NOT NULL,
      tax_id_snapshot varchar(100),
      representative_name varchar(200),
      representative_title varchar(200),
      authority_reference varchar(400),
      snapshot_at timestamptz NOT NULL,
      snapshot_hash char(64) NOT NULL,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_contract_parties PRIMARY KEY (id),
      CONSTRAINT uq_contract_parties_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_contract_parties_contract_id UNIQUE (tenant_id, contract_id, id),
      CONSTRAINT uq_contract_party_role_entity UNIQUE (tenant_id, contract_id, party_role, legal_entity_id),
      CONSTRAINT fk_contract_party_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_party_contract FOREIGN KEY (tenant_id, project_id, contract_id)
        REFERENCES contracts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_party_legal_entity FOREIGN KEY (tenant_id, company_id, legal_entity_id)
        REFERENCES legal_entities (tenant_id, company_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_party_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_contract_party_role CHECK
        (party_role IN ('OWNER','EPC','VENDOR','LENDER','SUBCONTRACTOR','OFFTAKER')),
      CONSTRAINT ck_contract_party_country CHECK (country_snapshot ~ '^[A-Z]{2}$'),
      CONSTRAINT ck_contract_party_hash CHECK (snapshot_hash ~ '^[0-9a-f]{64}$')
    )`);

    await queryRunner.query(`CREATE TABLE contract_appendices (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      contract_id uuid NOT NULL,
      project_id uuid NOT NULL,
      appendix_no varchar(80) NOT NULL,
      revision_no integer NOT NULL DEFAULT 1,
      type varchar(30) NOT NULL,
      effective_date date,
      value_impact numeric(19,4) NOT NULL DEFAULT 0,
      currency char(3) NOT NULL,
      document_id uuid,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_contract_appendices PRIMARY KEY (id),
      CONSTRAINT uq_contract_appendices_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_contract_appendices_contract_id UNIQUE (tenant_id, contract_id, id),
      CONSTRAINT uq_contract_appendix_revision UNIQUE (tenant_id, contract_id, appendix_no, revision_no),
      CONSTRAINT fk_contract_appendix_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_appendix_contract FOREIGN KEY (tenant_id, project_id, contract_id)
        REFERENCES contracts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_appendix_contract_currency FOREIGN KEY (tenant_id, contract_id, currency)
        REFERENCES contracts (tenant_id, id, currency) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_appendix_document FOREIGN KEY (tenant_id, project_id, document_id)
        REFERENCES documents (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_appendix_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_contract_appendix_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_contract_appendix_number CHECK (appendix_no ~ '^[A-Z0-9][A-Z0-9_./-]{1,79}$'),
      CONSTRAINT ck_contract_appendix_revision CHECK (revision_no >= 1),
      CONSTRAINT ck_contract_appendix_type CHECK (type IN ('AMENDMENT','ADDENDUM')),
      CONSTRAINT ck_contract_appendix_status CHECK
        (status IN ('DRAFT','EFFECTIVE','SUPERSEDED','CANCELLED')),
      CONSTRAINT ck_contract_appendix_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_contract_appendix_effective CHECK
        (status <> 'EFFECTIVE' OR effective_date IS NOT NULL),
      CONSTRAINT ck_contract_appendix_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE obligations (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      contract_id uuid NOT NULL,
      project_id uuid NOT NULL,
      appendix_id uuid,
      clause_ref varchar(200) NOT NULL,
      title varchar(400) NOT NULL,
      obligor_party_id uuid NOT NULL,
      beneficiary_party_id uuid NOT NULL,
      owner_user_id uuid NOT NULL,
      trigger_type varchar(30) NOT NULL,
      trigger_reference varchar(400),
      due_date date,
      status varchar(20) NOT NULL,
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      consequence varchar(2000),
      decision_type varchar(20),
      decision_by uuid,
      decision_at timestamptz,
      decision_reason varchar(2000),
      decision_evidence_refs jsonb,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_obligations PRIMARY KEY (id),
      CONSTRAINT uq_obligations_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_obligations_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT fk_obligation_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_contract FOREIGN KEY (tenant_id, project_id, contract_id)
        REFERENCES contracts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_appendix FOREIGN KEY (tenant_id, contract_id, appendix_id)
        REFERENCES contract_appendices (tenant_id, contract_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_obligor FOREIGN KEY (tenant_id, contract_id, obligor_party_id)
        REFERENCES contract_parties (tenant_id, contract_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_beneficiary FOREIGN KEY (tenant_id, contract_id, beneficiary_party_id)
        REFERENCES contract_parties (tenant_id, contract_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_owner FOREIGN KEY (tenant_id, owner_user_id)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_decision_by FOREIGN KEY (tenant_id, decision_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_obligation_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_obligation_status CHECK
        (status IN ('OPEN','DUE','OVERDUE','FULFILLED','WAIVED','CANCELLED')),
      CONSTRAINT ck_obligation_distinct_parties CHECK (obligor_party_id <> beneficiary_party_id),
      CONSTRAINT ck_obligation_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_obligation_decision_pair CHECK ((decision_by IS NULL) = (decision_at IS NULL)
        AND (decision_by IS NULL) = (decision_type IS NULL)),
      CONSTRAINT ck_obligation_decided_status CHECK
        ((status IN ('FULFILLED','WAIVED')) = (decision_by IS NOT NULL)),
      CONSTRAINT ck_obligation_decision_type CHECK (decision_type IS NULL
        OR (decision_type IN ('FULFILLED','WAIVED') AND decision_type = status)),
      CONSTRAINT ck_obligation_decision_evidence CHECK (status NOT IN ('FULFILLED','WAIVED')
        OR (decision_evidence_refs IS NOT NULL AND jsonb_typeof(decision_evidence_refs) = 'array'
          AND jsonb_array_length(decision_evidence_refs) >= 1)),
      CONSTRAINT ck_obligation_sod CHECK (decision_by IS NULL
        OR (decision_by <> owner_user_id AND decision_by <> created_by)),
      CONSTRAINT ck_obligation_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE budget_versions (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      budget_version integer NOT NULL,
      currency char(3) NOT NULL,
      total_amount numeric(19,4) NOT NULL,
      status varchar(20) NOT NULL,
      snapshot jsonb,
      snapshot_hash char(64),
      submitted_by uuid,
      submitted_at timestamptz,
      approved_by uuid,
      approved_at timestamptz,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_budget_versions PRIMARY KEY (id),
      CONSTRAINT uq_budget_versions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_budget_versions_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_budget_version_number UNIQUE (tenant_id, project_id, budget_version),
      CONSTRAINT fk_budget_version_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_budget_version_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_budget_version_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_budget_version_approved_by FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_budget_version_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_budget_version_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_budget_version_number CHECK (budget_version >= 1),
      CONSTRAINT ck_budget_version_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_budget_version_amount CHECK (total_amount >= 0),
      CONSTRAINT ck_budget_version_status CHECK
        (status IN ('DRAFT','SUBMITTED','APPROVED','SUPERSEDED')),
      CONSTRAINT ck_budget_version_snapshot_pair CHECK ((snapshot IS NULL) = (snapshot_hash IS NULL)),
      CONSTRAINT ck_budget_version_hash_format CHECK
        (snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'),
      CONSTRAINT ck_budget_version_submitted_pair CHECK
        ((submitted_by IS NULL) = (submitted_at IS NULL)),
      CONSTRAINT ck_budget_version_approved_pair CHECK
        ((approved_by IS NULL) = (approved_at IS NULL)),
      CONSTRAINT ck_budget_version_sod CHECK (approved_by IS NULL OR submitted_by IS NULL
        OR approved_by <> submitted_by),
      CONSTRAINT ck_budget_version_submitted_status CHECK
        (status = 'DRAFT' OR submitted_by IS NOT NULL),
      CONSTRAINT ck_budget_version_approved_by CHECK
        (status <> 'APPROVED' OR approved_by IS NOT NULL),
      CONSTRAINT ck_budget_version_approved_snapshot CHECK
        (status NOT IN ('APPROVED','SUPERSEDED') OR snapshot_hash IS NOT NULL),
      CONSTRAINT ck_budget_version_version CHECK (version_no >= 1)
    )`);
    // One approved baseline per project, enforced structurally rather than by service code.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_budget_version_approved
      ON budget_versions (tenant_id, project_id) WHERE status = 'APPROVED'`);

    await queryRunner.query(`CREATE TABLE commitments (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      contract_id uuid,
      cost_code_id uuid NOT NULL,
      amount numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      status varchar(20) NOT NULL,
      source_type varchar(30) NOT NULL,
      source_id uuid NOT NULL,
      source_version integer NOT NULL,
      reverses_commitment_id uuid,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_commitments PRIMARY KEY (id),
      CONSTRAINT uq_commitments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_commitments_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_commitment_source UNIQUE (tenant_id, source_type, source_id, source_version),
      CONSTRAINT fk_commitment_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_commitment_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commitment_contract FOREIGN KEY (tenant_id, project_id, contract_id)
        REFERENCES contracts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commitment_contract_currency FOREIGN KEY (tenant_id, contract_id, currency)
        REFERENCES contracts (tenant_id, id, currency) ON DELETE RESTRICT,
      CONSTRAINT fk_commitment_cost_code FOREIGN KEY (tenant_id, cost_code_id)
        REFERENCES cost_codes (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commitment_reverses FOREIGN KEY (tenant_id, reverses_commitment_id)
        REFERENCES commitments (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_commitment_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_commitment_status CHECK (status IN ('ACTIVE','REVERSED','CLOSED')),
      CONSTRAINT ck_commitment_source_type CHECK (source_type IN ('CONTRACT','CONTRACT_APPENDIX')),
      CONSTRAINT ck_commitment_contract_presence CHECK
        ((source_type IN ('CONTRACT','CONTRACT_APPENDIX')) = (contract_id IS NOT NULL)),
      CONSTRAINT ck_commitment_amount_sign CHECK ((reverses_commitment_id IS NULL AND amount > 0)
        OR (reverses_commitment_id IS NOT NULL AND amount < 0)),
      CONSTRAINT ck_commitment_source_version CHECK (source_version >= 1),
      CONSTRAINT ck_commitment_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_commitment_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE invoices (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      contract_id uuid NOT NULL,
      project_id uuid NOT NULL,
      supplier_company_id uuid NOT NULL,
      supplier_legal_entity_id uuid NOT NULL,
      invoice_no varchar(80) NOT NULL,
      invoice_date date NOT NULL,
      gross_amount numeric(19,4) NOT NULL,
      vat_amount numeric(19,4) NOT NULL,
      net_amount numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      status varchar(20) NOT NULL,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_invoices PRIMARY KEY (id),
      CONSTRAINT uq_invoices_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_invoices_contract_id UNIQUE (tenant_id, contract_id, id),
      CONSTRAINT uq_invoice_supplier_number UNIQUE (tenant_id, contract_id, supplier_legal_entity_id, invoice_no),
      CONSTRAINT fk_invoice_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_invoice_contract FOREIGN KEY (tenant_id, project_id, contract_id)
        REFERENCES contracts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_invoice_contract_currency FOREIGN KEY (tenant_id, contract_id, currency)
        REFERENCES contracts (tenant_id, id, currency) ON DELETE RESTRICT,
      CONSTRAINT fk_invoice_supplier FOREIGN KEY (tenant_id, supplier_company_id, supplier_legal_entity_id)
        REFERENCES legal_entities (tenant_id, company_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_invoice_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_invoice_gross_amount CHECK (gross_amount >= 0),
      CONSTRAINT ck_invoice_vat_amount CHECK (vat_amount >= 0),
      CONSTRAINT ck_invoice_net_amount CHECK (net_amount >= 0),
      CONSTRAINT ck_invoice_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_invoice_status CHECK (status IN ('RECEIVED','MATCHED','DISPUTED','CANCELLED')),
      CONSTRAINT ck_invoice_version CHECK (version_no >= 1)
    )`);

    await queryRunner.query(`CREATE TABLE payments (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      project_id uuid NOT NULL,
      contract_id uuid NOT NULL,
      invoice_id uuid,
      payer_company_id uuid NOT NULL,
      payer_legal_entity_id uuid NOT NULL,
      payee_company_id uuid NOT NULL,
      payee_legal_entity_id uuid NOT NULL,
      fx_snapshot_id uuid,
      milestone_ref varchar(200),
      requested_amount numeric(19,4) NOT NULL,
      approved_amount numeric(19,4),
      paid_amount numeric(19,4),
      currency char(3) NOT NULL,
      status varchar(20) NOT NULL,
      paid_at timestamptz,
      bank_reference varchar(200),
      external_posting_ref varchar(200),
      evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
      requested_by uuid NOT NULL,
      submitted_by uuid,
      approved_by uuid,
      version_no integer NOT NULL DEFAULT 1,
      created_by uuid NOT NULL,
      updated_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_payments PRIMARY KEY (id),
      CONSTRAINT uq_payments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_payments_project_id UNIQUE (tenant_id, project_id, id),
      CONSTRAINT uq_payments_tenant_currency UNIQUE (tenant_id, id, currency),
      CONSTRAINT fk_payment_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_project FOREIGN KEY (tenant_id, project_id)
        REFERENCES projects (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_contract FOREIGN KEY (tenant_id, project_id, contract_id)
        REFERENCES contracts (tenant_id, project_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_invoice FOREIGN KEY (tenant_id, contract_id, invoice_id)
        REFERENCES invoices (tenant_id, contract_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_payer FOREIGN KEY (tenant_id, payer_company_id, payer_legal_entity_id)
        REFERENCES legal_entities (tenant_id, company_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_payee FOREIGN KEY (tenant_id, payee_company_id, payee_legal_entity_id)
        REFERENCES legal_entities (tenant_id, company_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_fx_snapshot FOREIGN KEY (tenant_id, fx_snapshot_id)
        REFERENCES fx_snapshots (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_requested_by FOREIGN KEY (tenant_id, requested_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_submitted_by FOREIGN KEY (tenant_id, submitted_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_approved_by FOREIGN KEY (tenant_id, approved_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_created_by FOREIGN KEY (tenant_id, created_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_updated_by FOREIGN KEY (tenant_id, updated_by)
        REFERENCES user_accounts (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT ck_payment_status CHECK
        (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','SENT','PAID','RECONCILED','CANCELLED')),
      CONSTRAINT ck_payment_requested_amount CHECK (requested_amount > 0),
      CONSTRAINT ck_payment_approved_amount CHECK (approved_amount IS NULL OR approved_amount >= 0),
      CONSTRAINT ck_payment_paid_amount CHECK (paid_amount IS NULL OR paid_amount >= 0),
      CONSTRAINT ck_payment_currency CHECK (currency ~ '^[A-Z]{3}$'),
      CONSTRAINT ck_payment_distinct_parties CHECK (payer_legal_entity_id <> payee_legal_entity_id),
      CONSTRAINT ck_payment_sod CHECK (approved_by IS NULL OR (approved_by <> requested_by
        AND (submitted_by IS NULL OR approved_by <> submitted_by))),
      CONSTRAINT ck_payment_paid_pair CHECK ((paid_amount IS NULL) = (paid_at IS NULL)),
      CONSTRAINT ck_payment_approved_status CHECK (status <> 'APPROVED' OR approved_by IS NOT NULL),
      CONSTRAINT ck_payment_paid_status CHECK
        (status NOT IN ('PAID','RECONCILED') OR paid_amount IS NOT NULL),
      CONSTRAINT ck_payment_evidence_array CHECK (jsonb_typeof(evidence_refs) = 'array'),
      CONSTRAINT ck_payment_draft_evidence CHECK
        (status = 'DRAFT' OR jsonb_array_length(evidence_refs) >= 1),
      CONSTRAINT ck_payment_version CHECK (version_no >= 1)
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_payment_external_posting
      ON payments (tenant_id, external_posting_ref) WHERE external_posting_ref IS NOT NULL`);

    await queryRunner.query(`CREATE TABLE payment_components (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      payment_id uuid NOT NULL,
      sequence_no integer NOT NULL,
      component_type varchar(30) NOT NULL,
      basis_amount numeric(19,4),
      rate numeric(9,6),
      amount numeric(19,4) NOT NULL,
      currency char(3) NOT NULL,
      rule_version varchar(40) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_payment_components PRIMARY KEY (id),
      CONSTRAINT uq_payment_components_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_payment_component_sequence UNIQUE (tenant_id, payment_id, component_type, sequence_no),
      CONSTRAINT fk_payment_component_tenant FOREIGN KEY (tenant_id)
        REFERENCES tenants (id) ON DELETE RESTRICT,
      CONSTRAINT fk_payment_component_payment FOREIGN KEY (tenant_id, payment_id, currency)
        REFERENCES payments (tenant_id, id, currency) ON DELETE RESTRICT,
      CONSTRAINT ck_payment_component_type CHECK (component_type IN
        ('BASE','VAT','RETENTION','RETENTION_RELEASE','WITHHOLDING','ADVANCE_RECOVERY','OTHER_DEDUCTION')),
      CONSTRAINT ck_payment_component_sequence CHECK (sequence_no >= 1),
      CONSTRAINT ck_payment_component_sign CHECK (
        (component_type IN ('RETENTION','WITHHOLDING','ADVANCE_RECOVERY','OTHER_DEDUCTION') AND amount <= 0)
        OR (component_type IN ('BASE','VAT','RETENTION_RELEASE') AND amount >= 0)),
      CONSTRAINT ck_payment_component_currency CHECK (currency ~ '^[A-Z]{3}$')
    )`);

    await queryRunner.query(`CREATE INDEX idx_contract_register
      ON contracts (tenant_id, project_id, status, type)`);
    await queryRunner.query(`CREATE INDEX idx_contract_party_contract
      ON contract_parties (tenant_id, contract_id, party_role)`);
    await queryRunner.query(`CREATE INDEX idx_contract_appendix_status
      ON contract_appendices (tenant_id, contract_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_obligation_contract
      ON obligations (tenant_id, contract_id, status, due_date)`);
    await queryRunner.query(`CREATE INDEX idx_cost_code_status
      ON cost_codes (tenant_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_commitment_summary
      ON commitments (tenant_id, project_id, currency, status)`);
    await queryRunner.query(`CREATE INDEX idx_commitment_cost_code
      ON commitments (tenant_id, cost_code_id)`);
    await queryRunner.query(`CREATE INDEX idx_invoice_status
      ON invoices (tenant_id, contract_id, status)`);
    await queryRunner.query(`CREATE INDEX idx_payment_contract
      ON payments (tenant_id, contract_id, status)`);

    // FR-036: once a contract enters the signed family its commercial identity is frozen; a legal
    // hold freezes everything except the lifting of the hold itself; DELETE only ever removes an
    // unsigned draft; status never regresses.
    await queryRunner.query(`CREATE FUNCTION protect_contract_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      old_rank integer;
      new_rank integer;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'only DRAFT contracts can be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.legal_hold AND (NEW.legal_hold OR
         (to_jsonb(NEW) - ARRAY['legal_hold','version_no','updated_by','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['legal_hold','version_no','updated_by','updated_at']::text[])) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'contract under legal hold cannot be changed except to lift the hold';
      END IF;
      IF OLD.status IN ('SIGNED','EFFECTIVE','SUSPENDED','EXPIRED','CLOSED') AND (
        NEW.contract_no IS DISTINCT FROM OLD.contract_no
        OR NEW.type IS DISTINCT FROM OLD.type
        OR NEW.value IS DISTINCT FROM OLD.value
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.project_id IS DISTINCT FROM OLD.project_id
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
        OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'signed contract commercial identity is immutable';
      END IF;
      old_rank := CASE OLD.status WHEN 'DRAFT' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'APPROVED' THEN 3
        WHEN 'SIGNED' THEN 4 WHEN 'EFFECTIVE' THEN 5 WHEN 'SUSPENDED' THEN 5
        WHEN 'EXPIRED' THEN 6 ELSE 7 END;
      new_rank := CASE NEW.status WHEN 'DRAFT' THEN 1 WHEN 'REVIEW' THEN 2 WHEN 'APPROVED' THEN 3
        WHEN 'SIGNED' THEN 4 WHEN 'EFFECTIVE' THEN 5 WHEN 'SUSPENDED' THEN 5
        WHEN 'EXPIRED' THEN 6 ELSE 7 END;
      IF new_rank < old_rank THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'contract status cannot regress';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_contract_history
      BEFORE UPDATE OR DELETE ON contracts
      FOR EACH ROW EXECUTE FUNCTION protect_contract_history()`);

    // FR-037: a party row is the legal snapshot somebody contracted against. It is never edited; it
    // can only be removed while the contract is still an unsigned draft.
    await queryRunner.query(`CREATE FUNCTION protect_contract_party_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      parent_status varchar(20);
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'contract party snapshots are immutable; add a new party row instead';
      END IF;
      SELECT status INTO parent_status FROM contracts
        WHERE tenant_id = OLD.tenant_id AND id = OLD.contract_id;
      IF parent_status IS DISTINCT FROM 'DRAFT' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'contract party snapshots can only be deleted while the contract is DRAFT';
      END IF;
      RETURN OLD;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_contract_party_history
      BEFORE UPDATE OR DELETE ON contract_parties
      FOR EACH ROW EXECUTE FUNCTION protect_contract_party_history()`);

    // FR-038: an appendix that became EFFECTIVE (or was superseded by one) is contract history.
    await queryRunner.query(`CREATE FUNCTION protect_contract_appendix_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status IN ('EFFECTIVE','SUPERSEDED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'effective contract appendices are immutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_contract_appendix_history
      BEFORE UPDATE OR DELETE ON contract_appendices
      FOR EACH ROW EXECUTE FUNCTION protect_contract_appendix_history()`);

    // FR-040: a decided obligation is evidence of fulfilment or waiver and never changes again.
    await queryRunner.query(`CREATE FUNCTION protect_obligation_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF OLD.status IN ('FULFILLED','WAIVED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'decided obligations are immutable';
      END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_obligation_history
      BEFORE UPDATE OR DELETE ON obligations
      FOR EACH ROW EXECUTE FUNCTION protect_obligation_history()`);

    // FR-053: an APPROVED baseline may only be superseded, never edited; only drafts are deletable.
    await queryRunner.query(`CREATE FUNCTION protect_budget_version_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
          RAISE EXCEPTION USING ERRCODE = '55000',
            MESSAGE = 'only DRAFT budget versions can be deleted';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.status = 'APPROVED' AND (
        NEW.status <> 'SUPERSEDED'
        OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[])
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'approved budget baseline is immutable; it can only be superseded';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_budget_version_history
      BEFORE UPDATE OR DELETE ON budget_versions
      FOR EACH ROW EXECUTE FUNCTION protect_budget_version_history()`);

    // FR-054: the commitment ledger is append-only. A correction is a reversal row, never an edit.
    await queryRunner.query(`CREATE FUNCTION protect_commitment_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'commitments cannot be deleted; record a reversal instead';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['status','version_no','updated_at']::text[])
         <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_at']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'commitment amount and source are immutable; record a reversal instead';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_commitment_history
      BEFORE UPDATE OR DELETE ON commitments
      FOR EACH ROW EXECUTE FUNCTION protect_commitment_history()`);

    // FR-056/FR-060: money that left the building is history. A PAID payment may only move to
    // RECONCILED (bookkeeping columns aside); a RECONCILED one never changes; no payment row is
    // ever deleted, whatever its status.
    await queryRunner.query(`CREATE FUNCTION protect_payment_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'payments cannot be deleted';
      END IF;
      IF OLD.status = 'RECONCILED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'reconciled payments are immutable';
      END IF;
      IF OLD.status = 'PAID' AND (
        NEW.status <> 'RECONCILED'
        OR (to_jsonb(NEW) - ARRAY['status','version_no','updated_by','updated_at']::text[])
        <> (to_jsonb(OLD) - ARRAY['status','version_no','updated_by','updated_at']::text[])
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000',
          MESSAGE = 'paid payments are immutable; they may only be reconciled';
      END IF;
      RETURN NEW;
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_payment_history
      BEFORE UPDATE OR DELETE ON payments
      FOR EACH ROW EXECUTE FUNCTION protect_payment_history()`);

    // The sum identity of SEC-118: if any component exists for a payment, the components must sum
    // exactly — in Postgres numeric — to the payment's requested_amount. DEFERRABLE INITIALLY
    // DEFERRED so a payment and its breakdown can be inserted in any order inside one transaction;
    // the check runs at COMMIT (or at SET CONSTRAINTS ALL IMMEDIATE, which the API uses to surface
    // the failure as COMPONENT_SUM_MISMATCH before committing anything).
    await queryRunner.query(`CREATE FUNCTION enforce_payment_component_sum()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      target_tenant uuid;
      target_payment uuid;
      component_count bigint;
      component_total numeric;
      requested numeric;
    BEGIN
      IF TG_TABLE_NAME = 'payment_components' THEN
        IF TG_OP = 'DELETE' THEN
          target_tenant := OLD.tenant_id; target_payment := OLD.payment_id;
        ELSE
          target_tenant := NEW.tenant_id; target_payment := NEW.payment_id;
        END IF;
      ELSE
        target_tenant := NEW.tenant_id; target_payment := NEW.id;
      END IF;
      SELECT count(*), COALESCE(sum(amount), 0) INTO component_count, component_total
        FROM payment_components
        WHERE tenant_id = target_tenant AND payment_id = target_payment;
      IF component_count = 0 THEN RETURN NULL; END IF;
      SELECT requested_amount INTO requested FROM payments
        WHERE tenant_id = target_tenant AND id = target_payment;
      IF requested IS NULL THEN RETURN NULL; END IF;
      IF component_total <> requested THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'ck_payment_component_sum',
          MESSAGE = 'payment component amounts must sum to the payment requested_amount';
      END IF;
      RETURN NULL;
    END $$`);
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER trg_payment_component_sum
      AFTER INSERT OR UPDATE OR DELETE ON payment_components
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_payment_component_sum()`);
    // Mirrored on payments so editing requested_amount cannot silently break an existing breakdown.
    await queryRunner.query(`CREATE CONSTRAINT TRIGGER trg_payment_sum_mirror
      AFTER INSERT OR UPDATE ON payments
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_payment_component_sum()`);

    // DB-040: an FX observation is a fact about the past; corrections are new snapshots.
    await queryRunner.query(`CREATE FUNCTION protect_fx_snapshot_history()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'fx_snapshots are immutable; capture a new snapshot instead';
    END $$`);
    await queryRunner.query(`CREATE TRIGGER trg_fx_snapshot_history
      BEFORE UPDATE OR DELETE ON fx_snapshots
      FOR EACH ROW EXECUTE FUNCTION protect_fx_snapshot_history()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_fx_snapshot_history ON fx_snapshots');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_fx_snapshot_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_payment_sum_mirror ON payments');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_payment_component_sum ON payment_components');
    await queryRunner.query('DROP FUNCTION IF EXISTS enforce_payment_component_sum()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_payment_history ON payments');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_payment_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_commitment_history ON commitments');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_commitment_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_budget_version_history ON budget_versions');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_budget_version_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_obligation_history ON obligations');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_obligation_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_contract_appendix_history ON contract_appendices');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_contract_appendix_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_contract_party_history ON contract_parties');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_contract_party_history()');
    await queryRunner.query('DROP TRIGGER IF EXISTS trg_contract_history ON contracts');
    await queryRunner.query('DROP FUNCTION IF EXISTS protect_contract_history()');

    await queryRunner.query('DROP TABLE IF EXISTS payment_components');
    await queryRunner.query('DROP TABLE IF EXISTS payments');
    await queryRunner.query('DROP TABLE IF EXISTS invoices');
    await queryRunner.query('DROP TABLE IF EXISTS commitments');
    await queryRunner.query('DROP TABLE IF EXISTS budget_versions');
    await queryRunner.query('DROP TABLE IF EXISTS obligations');
    await queryRunner.query('DROP TABLE IF EXISTS contract_appendices');
    await queryRunner.query('DROP TABLE IF EXISTS contract_parties');
    await queryRunner.query('DROP TABLE IF EXISTS contracts');
    await queryRunner.query('DROP TABLE IF EXISTS fx_snapshots');
    await queryRunner.query('DROP TABLE IF EXISTS cost_codes');
  }
}
