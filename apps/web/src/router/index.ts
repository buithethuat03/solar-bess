import { createRouter, createWebHistory } from 'vue-router';
import type { Pinia } from 'pinia';
import { installRouterGuards } from './guards';
import { routes } from './routes';

export function createAppRouter(pinia: Pinia) {
  const router = createRouter({ history: createWebHistory(), routes });
  installRouterGuards(router, pinia);
  return router;
}
