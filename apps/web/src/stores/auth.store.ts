import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { authApi } from '@/api/auth.api';
import type {
  ApiAuthContext, AuthScope, AuthSession, AuthTenant, AuthUser, LoginInput
} from '@/types/auth.types';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const tenant = ref<AuthTenant | null>(null);
  const initialized = ref(false);
  const roles = ref<string[]>([]);
  const permissions = ref<string[]>([]);
  const scopes = ref<AuthScope[]>([]);

  const authenticated = computed(() => Boolean(accessToken.value && user.value && tenant.value));
  const apiContext = computed<ApiAuthContext | null>(() => accessToken.value && tenant.value
    ? { accessToken: accessToken.value, tenantId: tenant.value.id }
    : null);

  function apply(session: AuthSession): void {
    accessToken.value = session.accessToken;
    user.value = session.user;
    tenant.value = session.tenant;
  }

  function clear(): void {
    accessToken.value = null;
    user.value = null;
    tenant.value = null;
    roles.value = [];
    permissions.value = [];
    scopes.value = [];
  }

  async function hydrateAccess(): Promise<void> {
    if (!apiContext.value) return;
    const identity = await authApi.me(apiContext.value);
    roles.value = identity.roles;
    permissions.value = identity.permissions;
    scopes.value = identity.scopes;
  }

  function can(permission: string): boolean {
    return permissions.value.includes(permission);
  }

  function hasFullProjectScope(projectId: string, portfolioId?: string): boolean {
    return scopes.value.some((scope) => (
      scope.scopeType === 'TENANT'
      || (scope.scopeType === 'PROJECT' && scope.scopeId === projectId)
      || (scope.scopeType === 'PORTFOLIO' && Boolean(portfolioId) && scope.scopeId === portfolioId)
    ));
  }

  function hasFullProjectPermission(
    permission: string, projectId: string, portfolioId?: string
  ): boolean {
    return scopes.value.some((scope) => (
      scope.permissions.includes(permission)
      && (scope.scopeType === 'TENANT'
        || (scope.scopeType === 'PROJECT' && scope.scopeId === projectId)
        || (scope.scopeType === 'PORTFOLIO'
          && Boolean(portfolioId) && scope.scopeId === portfolioId))
    ));
  }

  function hasPackageScope(packageId: string): boolean {
    return scopes.value.some((scope) => scope.scopeType === 'PACKAGE' && scope.scopeId === packageId);
  }

  function hasPackagePermission(permission: string, packageId: string): boolean {
    return scopes.value.some((scope) => (
      scope.permissions.includes(permission)
      && scope.scopeType === 'PACKAGE'
      && scope.scopeId === packageId
    ));
  }

  function canAccessRecord(
    permission: string, projectId: string, packageId: string | null, portfolioId?: string
  ): boolean {
    if (hasFullProjectPermission(permission, projectId, portfolioId)) return true;
    return packageId !== null && hasPackagePermission(permission, packageId);
  }

  function canAccessRecordScope(
    projectId: string, packageId: string | null, portfolioId?: string
  ): boolean {
    if (hasFullProjectScope(projectId, portfolioId)) return true;
    return packageId !== null && hasPackageScope(packageId);
  }

  async function bootstrap(): Promise<void> {
    try {
      apply(await authApi.refresh());
      await hydrateAccess();
    } catch {
      clear();
    } finally {
      initialized.value = true;
    }
  }

  async function login(input: LoginInput): Promise<void> {
    apply(await authApi.login(input));
    await hydrateAccess();
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // Client state must be cleared even when the server/session is unavailable.
    } finally {
      clear();
    }
  }

  return {
    accessToken, user, tenant, initialized, roles, permissions, scopes,
    authenticated, apiContext,
    apply, clear, can, hasFullProjectScope, hasFullProjectPermission,
    hasPackageScope, hasPackagePermission, canAccessRecord, canAccessRecordScope,
    bootstrap, login, logout
  };
});
