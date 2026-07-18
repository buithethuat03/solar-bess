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
  scopes: [{
    roleCode: 'PMO', permissions: ['project.read'],
    scopeType: 'TENANT' as const, scopeId: null
  }], correlationId: 'identity-correlation'
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
    expect(store.scopes).toEqual(identity.scopes);
    expect(store.hasFullProjectScope('any-project')).toBe(true);
    expect(store.initialized).toBe(true);
  });

  it('distinguishes full-project and exact-package UI scope without elevating package assignments', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), {
        status: 200, headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...identity,
        scopes: [{
          roleCode: 'PACKAGE_OWNER', permissions: ['project.read'],
          scopeType: 'PACKAGE', scopeId: 'package-a'
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const store = useAuthStore();
    await store.bootstrap();
    expect(store.hasFullProjectScope('project-a')).toBe(false);
    expect(store.hasPackageScope('package-a')).toBe(true);
    expect(store.canAccessRecordScope('project-a', 'package-a')).toBe(true);
    expect(store.canAccessRecordScope('project-a', null)).toBe(false);
  });

  it('binds each permission to its own assignment scope instead of using tenant-wide unions', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), {
        status: 200, headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...identity,
        permissions: ['riskChange.read', 'riskChange.approve'],
        scopes: [
          {
            roleCode: 'READER', permissions: ['riskChange.read'],
            scopeType: 'TENANT', scopeId: null
          },
          {
            roleCode: 'APPROVER', permissions: ['riskChange.approve'],
            scopeType: 'PROJECT', scopeId: 'project-b'
          }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const store = useAuthStore();
    await store.bootstrap();
    expect(store.can('riskChange.approve')).toBe(true);
    expect(store.hasFullProjectPermission('riskChange.read', 'project-a')).toBe(true);
    expect(store.hasFullProjectPermission('riskChange.approve', 'project-a')).toBe(false);
    expect(store.hasFullProjectPermission('riskChange.approve', 'project-b')).toBe(true);
    expect(store.canAccessRecord('riskChange.approve', 'project-a', null)).toBe(false);
    expect(store.canAccessRecord('riskChange.approve', 'project-b', null)).toBe(true);
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
