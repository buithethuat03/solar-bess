<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  title?: string;
  primary?: boolean;
}>(), { title: '', primary: false });
</script>

<template>
  <article class="status-card" :class="{ 'status-card--primary': primary }">
    <span v-if="primary" class="status-dot"></span>
    <div>
      <small>{{ label }}</small>
      <h3>{{ title }}</h3>
      <p><slot /></p>
    </div>
  </article>
</template>
