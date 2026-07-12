import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth.store';

const session = {
  accessToken: 'access', tokenType: 'Bearer' as const, expiresIn: 900,
  user: { id: 'u', email: 'user@example.test', displayName: 'User' },
  tenant: { id: 't', code: 'demo', name: 'Demo' }, correlationId: 'correlation'
};
const identity = {
  user: session.user, tenant: session.tenant, roles: ['PMO'], permissions: ['project.read'],
  scopes: [{ roleCode: 'PMO', scopeType: 'TENANT' as const, scopeId: null }], correlationId: 'identity-correlation'
};

describe('auth store — TEST-230/233', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('bootstraps access state from the HttpOnly-cookie refresh endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), {
        status: 200, headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(identity), {
        status: 200, headers: { 'content-type': 'application/json' }
      })));
    const store = useAuthStore();
    await store.bootstrap();
    expect(store.authenticated).toBe(true);
    expect(store.apiContext).toEqual({ accessToken: 'access', tenantId: 't' });
    expect(store.can('project.read')).toBe(true);
    expect(store.initialized).toBe(true);
  });

  it('clears client state even when logout request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const store = useAuthStore();
    store.apply(session);
    await expect(store.logout()).resolves.toBeUndefined();
    expect(store.authenticated).toBe(false);
  });

  it('keeps refresh token outside JavaScript state', () => {
    const store = useAuthStore();
    expect(Object.keys(store.$state)).not.toContain('refreshToken');
  });
});
