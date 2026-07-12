import { httpClient } from './http-client';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ApiEnvelope, Company, CreateProjectInput, LegalEntity, Portfolio, Project,
  ProjectListFilters, ProjectParty, Site, UpdateProjectInput
} from '@/types/project.types';

function queryString(filters: ProjectListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function commandHeaders(idempotencyKey: string): HeadersInit {
  return { 'Idempotency-Key': idempotencyKey };
}

export const projectApi = {
  listCompanies(auth: ApiAuthContext): Promise<ApiEnvelope<Company[]>> {
    return httpClient.request('/v1/companies', { method: 'GET', auth });
  },

  listLegalEntities(auth: ApiAuthContext): Promise<ApiEnvelope<LegalEntity[]>> {
    return httpClient.request('/v1/legal-entities', { method: 'GET', auth });
  },

  listPortfolios(auth: ApiAuthContext): Promise<ApiEnvelope<Portfolio[]>> {
    return httpClient.request('/v1/portfolios', { method: 'GET', auth });
  },

  listProjects(auth: ApiAuthContext, filters: ProjectListFilters = {}): Promise<ApiEnvelope<Project[]>> {
    return httpClient.request(`/v1/projects${queryString(filters)}`, { method: 'GET', auth });
  },

  getProject(auth: ApiAuthContext, projectId: string): Promise<ApiEnvelope<Project>> {
    return httpClient.request(`/v1/projects/${projectId}`, { method: 'GET', auth });
  },

  createProject(
    auth: ApiAuthContext, input: CreateProjectInput, idempotencyKey: string
  ): Promise<ApiEnvelope<Project>> {
    return httpClient.request('/v1/projects', {
      method: 'POST', auth, headers: commandHeaders(idempotencyKey), body: input
    });
  },

  updateProject(
    auth: ApiAuthContext, projectId: string, input: UpdateProjectInput,
    expectedVersion: number, idempotencyKey: string
  ): Promise<ApiEnvelope<Project>> {
    return httpClient.request(`/v1/projects/${projectId}`, {
      method: 'PATCH', auth,
      headers: { ...commandHeaders(idempotencyKey), 'If-Match': String(expectedVersion) }, body: input
    });
  },

  createSite(
    auth: ApiAuthContext, projectId: string,
    input: { code: string; name: string; location?: string; timezone: string }, idempotencyKey: string
  ): Promise<ApiEnvelope<Site>> {
    return httpClient.request(`/v1/projects/${projectId}/sites`, {
      method: 'POST', auth, headers: commandHeaders(idempotencyKey), body: input
    });
  },

  upsertParty(
    auth: ApiAuthContext, projectId: string, partyId: string,
    input: Omit<ProjectParty, 'id' | 'projectId' | 'versionNo'> & { reason: string }, expectedVersion: number
  ): Promise<ApiEnvelope<ProjectParty>> {
    return httpClient.request(`/v1/projects/${projectId}/parties/${partyId}`, {
      method: 'PUT', auth, headers: { 'If-Match': String(expectedVersion), 'Idempotency-Key': crypto.randomUUID() }, body: input
    });
  }
};
