<script setup lang="ts">
import AppHeader from '@/components/common/AppHeader.vue';
</script>

<template>
  <main class="app-layout">
    <AppHeader><template #actions><slot name="header-actions" /></template></AppHeader>
    <section class="app-layout__content"><slot /></section>
  </main>
</template>
