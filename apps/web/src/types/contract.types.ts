/**
 * Contract & Cost (API-053…API-066) wire types.
 *
 * MONEY IS TEXT. Every monetary field below is a `string` because the API passes Postgres
 * `numeric` through untouched. Nothing in the web app may ever run such a value through
 * `Number()`, `parseFloat` or arithmetic — display formatting may group digits, never round.
 */
export type ContractType =
  'EPC' | 'EQUIPMENT_LEASE' | 'PPA' | 'ESCO' | 'SUBCONTRACT' | 'EQUIPMENT_PURCHASE';
/**
 * FR-036 lifecycle vocabulary. V1 honesty: no operation in the API catalog moves a contract past
 * DRAFT yet, so the UI names every status but offers no sign/activate action.
 */
export type ContractStatus =
  'DRAFT' | 'REVIEW' | 'APPROVED' | 'SIGNED' | 'EFFECTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CLOSED';
export type ContractPartyRole =
  'OWNER' | 'EPC' | 'VENDOR' | 'LENDER' | 'SUBCONTRACTOR' | 'OFFTAKER';
export type ContractAppendixType = 'AMENDMENT' | 'ADDENDUM';
export type ContractAppendixStatus = 'DRAFT' | 'EFFECTIVE' | 'SUPERSEDED' | 'CANCELLED';
/**
 * DUE and OVERDUE are read-time projections from `dueDate`; the stored row stays OPEN until
 * somebody decides it, which is why the list rows also carry `storedStatus`.
 */
export type ObligationStatus = 'OPEN' | 'DUE' | 'OVERDUE' | 'FULFILLED' | 'WAIVED' | 'CANCELLED';
export type ObligationDecisionType = 'FULFILLED' | 'WAIVED';
export type BudgetVersionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SUPERSEDED';
export type CommitmentStatus = 'ACTIVE' | 'REVERSED' | 'CLOSED';
export type CommitmentSourceType = 'CONTRACT' | 'CONTRACT_APPENDIX';
export type PaymentStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SENT' | 'PAID' | 'RECONCILED' | 'CANCELLED';
export type PaymentComponentType =
  'BASE' | 'VAT' | 'RETENTION' | 'RETENTION_RELEASE' | 'WITHHOLDING'
  | 'ADVANCE_RECOVERY' | 'OTHER_DEDUCTION';

export interface ContractView {
  id: string;
  projectId: string;
  contractNo: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** numeric(...,4) as text — never a JS number. */
  value: string;
  currency: string;
  rootDocumentId: string | null;
  legalHold: boolean;
  signedAt: string | null;
  signedBy: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** API-055 embeds the Postgres-computed value + effective appendix impacts, still as text. */
export interface ContractDetailView extends ContractView {
  consolidatedValue: string;
}

/** FR-037 legal snapshot: the master may change later, the *_Snapshot fields never do. */
export interface ContractPartyView {
  id: string;
  contractId: string;
  projectId: string;
  companyId: string;
  legalEntityId: string;
  partyRole: ContractPartyRole;
  legalNameSnapshot: string;
  countrySnapshot: string;
  registrationNoSnapshot: string;
  taxIdSnapshot: string | null;
  representativeName: string | null;
  representativeTitle: string | null;
  authorityReference: string | null;
  snapshotAt: string;
  snapshotHash: string;
  createdBy: string;
  createdAt: string;
}

export interface ContractAppendixView {
  id: string;
  contractId: string;
  projectId: string;
  appendixNo: string;
  revisionNo: number;
  type: ContractAppendixType;
  effectiveDate: string | null;
  /** Signed money text; negative impacts are legal. */
  valueImpact: string;
  currency: string;
  documentId: string | null;
  status: ContractAppendixStatus;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObligationView {
  id: string;
  contractId: string;
  projectId: string;
  appendixId: string | null;
  clauseRef: string;
  title: string;
  obligorPartyId: string;
  beneficiaryPartyId: string;
  ownerUserId: string;
  triggerType: string;
  triggerReference: string | null;
  dueDate: string | null;
  status: ObligationStatus;
  evidenceRefs: string[];
  consequence: string | null;
  decisionType: ObligationDecisionType | null;
  decisionBy: string | null;
  decisionAt: string | null;
  decisionReason: string | null;
  decisionEvidenceRefs: string[] | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One API-059 page row: `status` is the DUE/OVERDUE projection the server derives at read time,
 * `storedStatus` the raw column. Only a stored-OPEN obligation can still be decided.
 */
export interface ObligationRegisterRow extends ObligationView {
  storedStatus: ObligationStatus;
}

export interface BudgetVersionView {
  id: string;
  projectId: string;
  budgetVersion: number;
  currency: string;
  totalAmount: string;
  status: BudgetVersionStatus;
  snapshot: Record<string, unknown> | null;
  snapshotHash: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentView {
  id: string;
  projectId: string;
  contractId: string;
  costCodeId: string;
  amount: string;
  currency: string;
  status: CommitmentStatus;
  sourceType: CommitmentSourceType;
  sourceId: string;
  sourceVersion: number;
  reversesCommitmentId: string | null;
  versionNo: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentView {
  id: string;
  projectId: string;
  contractId: string;
  invoiceId: string | null;
  payerCompanyId: string;
  payerLegalEntityId: string;
  payeeCompanyId: string;
  payeeLegalEntityId: string;
  fxSnapshotId: string | null;
  milestoneRef: string | null;
  requestedAmount: string;
  approvedAmount: string | null;
  paidAmount: string | null;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  bankReference: string | null;
  externalPostingRef: string | null;
  evidenceRefs: string[];
  requestedBy: string;
  submittedBy: string | null;
  approvedBy: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentComponentView {
  id: string;
  paymentId: string;
  sequenceNo: number;
  componentType: PaymentComponentType;
  basisAmount: string | null;
  rate: string | null;
  amount: string;
  currency: string;
  ruleVersion: string;
  createdAt: string;
}

export interface PaymentWithComponentsView extends PaymentView {
  components: PaymentComponentView[];
}

/** API-062 budget line — one DISTINCT ON (status) row per status, newest version first. */
export interface CostSummaryBudgetLine {
  status: BudgetVersionStatus;
  budgetVersion: number;
  currency: string;
  totalAmount: string;
}

/** SQL aggregate per (currency, status, cost code); never combined across currencies. */
export interface CostSummaryCommitmentLine {
  currency: string;
  status: CommitmentStatus;
  costCodeId: string;
  costCode: string;
  amount: string;
}

/** SUM over nullable columns is null when nothing is approved/paid yet — keep it null, not "0". */
export interface CostSummaryPaymentLine {
  currency: string;
  status: PaymentStatus;
  requestedAmount: string;
  approvedAmount: string | null;
  paidAmount: string | null;
  paymentCount: number;
}

/** `reportingCurrency` is explicitly null: the API refuses to total across currencies, so must the UI. */
export interface CostSummaryData {
  projectId: string;
  reportingCurrency: null;
  budget: CostSummaryBudgetLine[];
  commitments: CostSummaryCommitmentLine[];
  payments: CostSummaryPaymentLine[];
}

export interface ContractPageMeta {
  nextCursor: string | null;
  limit: number;
}

export interface ContractListQuery {
  cursor?: string;
  limit?: number;
  type?: ContractType;
  status?: ContractStatus;
}

export interface ObligationListQuery {
  cursor?: string;
  limit?: number;
}

export interface CreateContractRequest {
  contractNo: string;
  title: string;
  type: ContractType;
  value: string;
  currency: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  rootDocumentId?: string;
}

/** API-056 — DRAFT-only edit; `expectedVersion` is answered with 409 VERSION_CONFLICT when stale. */
export interface UpdateContractRequest {
  expectedVersion: number;
  title?: string;
  type?: ContractType;
  value?: string;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  rootDocumentId?: string;
}

export interface CreateContractPartyRequest {
  companyId: string;
  legalEntityId: string;
  partyRole: ContractPartyRole;
  representativeName?: string;
  representativeTitle?: string;
  authorityReference?: string;
}

export interface CreateContractAppendixRequest {
  appendixNo: string;
  revisionNo?: number;
  type: ContractAppendixType;
  effectiveDate?: string;
  valueImpact?: string;
  currency?: string;
  documentId?: string;
  /** Only DRAFT or EFFECTIVE can be declared at creation; no transition operation exists. */
  status?: Extract<ContractAppendixStatus, 'DRAFT' | 'EFFECTIVE'>;
}

export interface CreateObligationRequest {
  clauseRef: string;
  title: string;
  obligorPartyId: string;
  beneficiaryPartyId: string;
  ownerUserId?: string;
  triggerType: string;
  triggerReference?: string;
  dueDate?: string;
  consequence?: string;
  appendixId?: string;
  evidenceRefs?: string[];
}

/** FR-040: no fulfilment or waiver without a reason and at least one piece of evidence. */
export interface FulfillObligationRequest {
  expectedVersion: number;
  decisionType: ObligationDecisionType;
  reason: string;
  evidenceRefs: string[];
}

export interface CreateBudgetVersionRequest {
  currency: string;
  totalAmount: string;
  snapshot?: Record<string, unknown>;
}

export interface CreateCommitmentRequest {
  contractId: string;
  costCodeId: string;
  amount: string;
  currency?: string;
  sourceType: CommitmentSourceType;
  sourceId: string;
  sourceVersion: number;
  reversesCommitmentId?: string;
}

export interface InvoiceInput {
  invoiceNo: string;
  invoiceDate: string;
  supplierCompanyId: string;
  supplierLegalEntityId: string;
  grossAmount: string;
  vatAmount: string;
  /** Stored as declared; the gross/vat/net relation is deliberately not recomputed client-side. */
  netAmount: string;
}

export interface PaymentComponentInput {
  sequenceNo: number;
  componentType: PaymentComponentType;
  basisAmount?: string;
  rate?: string;
  amount: string;
  currency?: string;
  ruleVersion: string;
}

export interface FxSnapshotInput {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  rateDate: string;
  source: string;
}

export interface CreatePaymentRequest {
  invoice?: InvoiceInput;
  payerCompanyId: string;
  payerLegalEntityId: string;
  payeeCompanyId: string;
  payeeLegalEntityId: string;
  requestedAmount: string;
  currency?: string;
  milestoneRef?: string;
  evidenceRefs?: string[];
  components?: PaymentComponentInput[];
  fxSnapshot?: FxSnapshotInput;
}

export interface ContractListResponse {
  data: ContractView[];
  meta: ContractPageMeta;
  correlationId: string;
}

export interface ContractCommandResponse {
  data: ContractView;
  correlationId: string;
}

export interface ContractDetailResponse {
  data: ContractDetailView;
  parties: ContractPartyView[];
  appendices: ContractAppendixView[];
  correlationId: string;
}

export interface ContractPartyResponse {
  data: ContractPartyView;
  correlationId: string;
}

export interface ContractAppendixResponse {
  data: ContractAppendixView;
  correlationId: string;
}

export interface ObligationListResponse {
  data: ObligationRegisterRow[];
  meta: ContractPageMeta;
  correlationId: string;
}

export interface ObligationCommandResponse {
  data: ObligationView;
  correlationId: string;
}

export interface CostSummaryResponse {
  data: CostSummaryData;
  correlationId: string;
}

export interface BudgetVersionResponse {
  data: BudgetVersionView;
  correlationId: string;
}

export interface CommitmentResponse {
  data: CommitmentView;
  correlationId: string;
}

export interface PaymentCommandResponse {
  data: PaymentWithComponentsView;
  correlationId: string;
}

export interface PaymentDetailResponse {
  data: PaymentWithComponentsView;
  correlationId: string;
}
