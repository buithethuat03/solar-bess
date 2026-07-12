import type { Pinia } from 'pinia';
import type { Router } from 'vue-router';
import { RouteName } from '@/constants/routes';
import { useAuthStore } from '@/stores/auth.store';

export function installRouterGuards(router: Router, pinia: Pinia): void {
  router.beforeEach((to) => {
    const auth = useAuthStore(pinia);
    if (to.meta.requiresAuth && !auth.authenticated) return { name: RouteName.login };
    if (to.meta.guestOnly && auth.authenticated) return { name: RouteName.dashboard };
    if (to.meta.permission && !auth.can(to.meta.permission)) return { name: RouteName.dashboard };
    return true;
  });
}
