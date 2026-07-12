import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectApi } from './project.api';

const auth = { accessToken: 'access-token', tenantId: 'tenant-id' };

describe('Project API — API-017…025', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes list filters and centralizes auth/tenant headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200, headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    await projectApi.listProjects(auth, { search: 'solar', type: 'SOLAR', recordStatus: 'ACTIVE' });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/projects?');
    expect(url).toContain('search=solar');
    expect(url).toContain('type=SOLAR');
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
  });

  it('sends idempotency and If-Match for project update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'project-id' } }), {
      status: 202, headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    await projectApi.updateProject(auth, 'project-id', { name: 'Updated', reason: 'Test update' }, 3, 'update-key-123');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Headers;
    expect(options.method).toBe('PATCH');
    expect(headers.get('If-Match')).toBe('3');
    expect(headers.get('Idempotency-Key')).toBe('update-key-123');
  });
});
