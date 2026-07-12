export enum OrganizationType {
  INTERNAL = 'INTERNAL',
  CUSTOMER = 'CUSTOMER',
  PARTNER = 'PARTNER',
  CONTRACTOR = 'CONTRACTOR',
  VENDOR = 'VENDOR',
  LENDER = 'LENDER'
}

export enum MasterRecordStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export enum ProjectType {
  SOLAR = 'SOLAR',
  BESS = 'BESS',
  HYBRID = 'HYBRID'
}

export enum ProjectPhase {
  INITIATION = 'INITIATION',
  PLANNING = 'PLANNING',
  EXECUTION = 'EXECUTION',
  COMMISSIONING = 'COMMISSIONING',
  COD = 'COD',
  HANDOVER = 'HANDOVER',
  O_AND_M = 'O_AND_M'
}

export enum ProjectRecordStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  ARCHIVED = 'ARCHIVED'
}

export enum ProjectPartyRole {
  OWNER = 'OWNER',
  EPC = 'EPC',
  VENDOR = 'VENDOR',
  LENDER = 'LENDER'
}

export enum RaciRole {
  ACCOUNTABLE = 'ACCOUNTABLE',
  RESPONSIBLE = 'RESPONSIBLE',
  CONSULTED = 'CONSULTED',
  INFORMED = 'INFORMED'
}

export enum AssignmentScopeType {
  TENANT = 'TENANT',
  PORTFOLIO = 'PORTFOLIO',
  PROJECT = 'PROJECT',
  PACKAGE = 'PACKAGE'
}
