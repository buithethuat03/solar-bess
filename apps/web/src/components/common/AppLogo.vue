<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
</script>

<template>
  <div class="app-logo" :class="{ 'app-logo--compact': compact }" aria-label="Solar and BESS">S+B</div>
</template>
