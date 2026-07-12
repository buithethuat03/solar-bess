<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import LoginForm from '@/components/auth/LoginForm.vue';
import { RouteName } from '@/constants/routes';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type { LoginInput } from '@/types/auth.types';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');

async function login(input: LoginInput): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(input);
    await router.replace({ name: RouteName.dashboard });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Đăng nhập thất bại';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout><LoginForm :loading="loading" :error="error" @submit="login" /></AuthLayout>
</template>
