<script setup lang="ts">
import AppLogo from '@/components/common/AppLogo.vue';
</script>

<template>
  <main class="auth-layout">
    <section class="auth-layout__brand">
      <AppLogo />
      <p class="eyebrow">PROJECT INTELLIGENCE</p>
      <h1>Điều phối dự án năng lượng trên một nguồn sự thật.</h1>
      <p class="brand-copy">Base MVP an toàn cho danh tính, tenant và phiên làm việc. Không có đường điều khiển tới BESS/OT.</p>
      <div class="energy-line" aria-hidden="true"><span></span><span></span><span></span></div>
    </section>
    <section class="auth-layout__content"><slot /></section>
  </main>
</template>
