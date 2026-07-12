import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { authApi } from '@/api/auth.api';
import type { ApiAuthContext, AuthSession, AuthTenant, AuthUser, LoginInput } from '@/types/auth.types';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const tenant = ref<AuthTenant | null>(null);
  const initialized = ref(false);
  const roles = ref<string[]>([]);
  const permissions = ref<string[]>([]);

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
  }

  async function hydrateAccess(): Promise<void> {
    if (!apiContext.value) return;
    const identity = await authApi.me(apiContext.value);
    roles.value = identity.roles;
    permissions.value = identity.permissions;
  }

  function can(permission: string): boolean {
    return permissions.value.includes(permission);
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
    accessToken, user, tenant, initialized, roles, permissions,
    authenticated, apiContext,
    apply, clear, can, bootstrap, login, logout
  };
});
