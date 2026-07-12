export type ProjectType = 'SOLAR' | 'BESS' | 'HYBRID';
export type ProjectPhase = 'INITIATION' | 'PLANNING' | 'EXECUTION' | 'COMMISSIONING' | 'COD' | 'HANDOVER' | 'O_AND_M';
export type ProjectRecordStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'CLOSED' | 'CANCELLED' | 'ARCHIVED';

export interface Company {
  id: string;
  code: string;
  name: string;
  organizationType: 'INTERNAL' | 'CUSTOMER' | 'PARTNER' | 'CONTRACTOR' | 'VENDOR' | 'LENDER';
  status: string;
}

export interface LegalEntity {
  id: string;
  companyId: string;
  legalName: string;
  country: string;
  registrationNo: string;
  taxId: string | null;
  status: string;
}

export interface Portfolio { id: string; code: string; name: string; status: string }

export interface Site {
  id: string;
  projectId: string;
  code: string;
  name: string;
  location: string | null;
  timezone: string;
  isPrimary: boolean;
  status: string;
}

export interface ProjectParty {
  id: string;
  projectId: string;
  companyId: string;
  legalEntityId: string | null;
  roleCode: 'OWNER' | 'EPC' | 'VENDOR' | 'LENDER';
  raci: 'ACCOUNTABLE' | 'RESPONSIBLE' | 'CONSULTED' | 'INFORMED';
  effectiveFrom: string;
  effectiveTo: string | null;
  contactName: string | null;
  contactEmail: string | null;
  versionNo: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  type: ProjectType;
  phase: ProjectPhase;
  recordStatus: ProjectRecordStatus;
  portfolioId: string;
  ownerLegalEntityId: string;
  customerCompanyId: string;
  projectManagerId: string | null;
  contractModel: string;
  currency: string;
  plannedCod: string;
  forecastCod: string | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  sites?: Site[];
  parties?: ProjectParty[];
}

export interface CreateProjectInput {
  code: string;
  name: string;
  type: ProjectType;
  portfolioId: string;
  ownerLegalEntityId: string;
  customerCompanyId: string;
  projectManagerId?: string;
  contractModel: string;
  currency: string;
  plannedCod: string;
  primarySite: { code: string; name: string; location?: string; timezone: string };
}

export interface UpdateProjectInput {
  name?: string;
  type?: ProjectType;
  phase?: ProjectPhase;
  recordStatus?: ProjectRecordStatus;
  portfolioId?: string;
  ownerLegalEntityId?: string;
  customerCompanyId?: string;
  contractModel?: string;
  currency?: string;
  plannedCod?: string;
  forecastCod?: string | null;
  reason: string;
}

export interface ProjectListFilters {
  search?: string;
  type?: ProjectType;
  phase?: ProjectPhase;
  recordStatus?: ProjectRecordStatus;
  portfolioId?: string;
}

export interface ApiEnvelope<T> { data: T; correlationId: string; meta?: { total?: number; limit?: number } }
