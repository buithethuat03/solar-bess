<script setup lang="ts">
import { RouteName } from '@/constants/routes';
import { useAuthStore } from '@/stores/auth.store';

const auth = useAuthStore();
</script>

<template>
  <nav class="app-navigation" aria-label="Điều hướng chính">
    <router-link :to="{ name: RouteName.dashboard }">Tổng quan</router-link>
    <router-link v-if="auth.can('project.read')" :to="{ name: RouteName.projects }">Dự án</router-link>
    <router-link v-if="auth.can('opportunity.read')" :to="{ name: RouteName.opportunities }">Cơ hội</router-link>
    <router-link v-if="auth.can('search.execute')" :to="{ name: RouteName.search }">Tìm kiếm</router-link>
    <router-link v-if="auth.can('approvalTask.read')" :to="{ name: RouteName.approvals }">Phê duyệt</router-link>
    <router-link v-if="auth.can('notification.read')" :to="{ name: RouteName.notifications }">Thông báo</router-link>
  </nav>
</template>
