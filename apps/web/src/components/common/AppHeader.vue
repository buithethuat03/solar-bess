<script setup lang="ts">
import AppLogo from './AppLogo.vue';
import AppNavigation from './AppNavigation.vue';
</script>

<template>
  <header class="app-header">
    <div class="app-header__brand"><div class="wordmark"><AppLogo compact /> Solar &amp; BESS</div><AppNavigation /></div>
    <div class="app-header__actions"><slot name="actions" /></div>
  </header>
</template>
