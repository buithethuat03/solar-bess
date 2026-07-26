/** FR-036 contract taxonomy (DB-028). */
export enum ContractType {
  EPC = 'EPC',
  EQUIPMENT_LEASE = 'EQUIPMENT_LEASE',
  PPA = 'PPA',
  ESCO = 'ESCO',
  SUBCONTRACT = 'SUBCONTRACT',
  EQUIPMENT_PURCHASE = 'EQUIPMENT_PURCHASE'
}

/**
 * FR-036 lifecycle. `SIGNED_CONTRACT_STATUSES` is the "signed family": from SIGNED onwards the
 * commercial identity of the contract (number, type, value, currency, signatures) is frozen by
 * `protect_contract_history` and only a new appendix may change its value.
 */
export enum ContractStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  SIGNED = 'SIGNED',
  EFFECTIVE = 'EFFECTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  CLOSED = 'CLOSED'
}

export const SIGNED_CONTRACT_STATUSES: readonly ContractStatus[] = [
  ContractStatus.SIGNED, ContractStatus.EFFECTIVE, ContractStatus.SUSPENDED,
  ContractStatus.EXPIRED, ContractStatus.CLOSED
];

/** FR-037 party roles on one contract (DB-029). */
export enum ContractPartyRole {
  OWNER = 'OWNER',
  EPC = 'EPC',
  VENDOR = 'VENDOR',
  LENDER = 'LENDER',
  SUBCONTRACTOR = 'SUBCONTRACTOR',
  OFFTAKER = 'OFFTAKER'
}

export enum ContractAppendixType {
  AMENDMENT = 'AMENDMENT',
  ADDENDUM = 'ADDENDUM'
}

export enum ContractAppendixStatus {
  DRAFT = 'DRAFT',
  EFFECTIVE = 'EFFECTIVE',
  SUPERSEDED = 'SUPERSEDED',
  CANCELLED = 'CANCELLED'
}

/**
 * FR-039/FR-040 obligation lifecycle (DB-031). DUE and OVERDUE are legal values of the projection
 * only: they are derived at read time from `due_date` vs the current date and are never written to
 * the row, so a stored obligation is OPEN until somebody decides it.
 */
export enum ObligationStatus {
  OPEN = 'OPEN',
  DUE = 'DUE',
  OVERDUE = 'OVERDUE',
  FULFILLED = 'FULFILLED',
  WAIVED = 'WAIVED',
  CANCELLED = 'CANCELLED'
}

export enum ObligationDecisionType {
  FULFILLED = 'FULFILLED',
  WAIVED = 'WAIVED'
}

export enum CostCodeClass {
  CAPEX = 'CAPEX',
  OPEX = 'OPEX'
}

export enum CostCodeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export enum BudgetVersionStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  SUPERSEDED = 'SUPERSEDED'
}

export enum CommitmentStatus {
  ACTIVE = 'ACTIVE',
  REVERSED = 'REVERSED',
  CLOSED = 'CLOSED'
}

/** Procurement purchase orders are deferred; only contract-family sources exist in V1. */
export enum CommitmentSourceType {
  CONTRACT = 'CONTRACT',
  CONTRACT_APPENDIX = 'CONTRACT_APPENDIX'
}

export enum InvoiceStatus {
  RECEIVED = 'RECEIVED',
  MATCHED = 'MATCHED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED'
}

export enum PaymentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT = 'SENT',
  PAID = 'PAID',
  RECONCILED = 'RECONCILED',
  CANCELLED = 'CANCELLED'
}

/** DB-039: deduction types must carry amount <= 0, additive types amount >= 0. */
export enum PaymentComponentType {
  BASE = 'BASE',
  VAT = 'VAT',
  RETENTION = 'RETENTION',
  RETENTION_RELEASE = 'RETENTION_RELEASE',
  WITHHOLDING = 'WITHHOLDING',
  ADVANCE_RECOVERY = 'ADVANCE_RECOVERY',
  OTHER_DEDUCTION = 'OTHER_DEDUCTION'
}

export const DEDUCTION_COMPONENT_TYPES: readonly PaymentComponentType[] = [
  PaymentComponentType.RETENTION, PaymentComponentType.WITHHOLDING,
  PaymentComponentType.ADVANCE_RECOVERY, PaymentComponentType.OTHER_DEDUCTION
];
