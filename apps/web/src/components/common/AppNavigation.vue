<script setup lang="ts">
import { RouteName } from '@/constants/routes';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
</script>

<template>
  <nav class="app-navigation" aria-label="Điều hướng chính">
    <router-link :to="{ name: RouteName.dashboard }">Tổng quan</router-link>
    <router-link v-if="auth.can('project.read')" :to="{ name: RouteName.projects }">Dự án</router-link>
  </nav>
</template>
