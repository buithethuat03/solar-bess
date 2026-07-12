import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { installElementPlus } from './plugins/element-plus';
import { createAppRouter } from '@/router';
import { useAuthStore } from '@/stores/auth.store';
import '@/styles/index.css';

export async function bootstrapApplication(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  const router = createAppRouter(pinia);
  app.use(pinia);
  installElementPlus(app);
  await useAuthStore(pinia).bootstrap();
  app.use(router);
  await router.replace(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  await router.isReady();
  app.mount('#app');
}
