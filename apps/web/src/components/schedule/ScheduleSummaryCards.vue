<script setup lang="ts">
import type { ProjectSchedule } from '@/types/schedule.types';

defineProps<{ schedule: ProjectSchedule }>();

function percent(value: string | null): string {
  return value === null ? 'N/A' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}

function spi(value: string | null): string {
  return value === null ? 'N/A' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}
</script>

<template>
  <section class="schedule-kpis" aria-label="Chỉ số tiến độ">
    <article>
      <span>Tiến độ kế hoạch</span>
      <strong>{{ percent(schedule.plannedProgress ?? null) }}</strong>
      <small>Tại data date {{ schedule.dataDate }}</small>
    </article>
    <article>
      <span>Tiến độ thực tế</span>
      <strong>{{ percent(schedule.actualProgress ?? null) }}</strong>
      <small>Append-only progress</small>
    </article>
    <article :class="{ 'schedule-kpis__warning': schedule.spi != null && Number(schedule.spi) < 1 }">
      <span>SPI</span>
      <strong>{{ spi(schedule.spi ?? null) }}</strong>
      <small>{{ schedule.spi == null ? 'Không đủ mẫu số kế hoạch' : schedule.formulaVersion }}</small>
    </article>
    <article :class="{ 'schedule-kpis__warning': (schedule.varianceWorkDays ?? 0) > 0 }">
      <span>Dự báo hoàn thành</span>
      <strong>{{ schedule.forecastFinish ?? 'N/A' }}</strong>
      <small>{{ schedule.varianceWorkDays == null ? 'Chưa tính sai lệch' : `${schedule.varianceWorkDays >= 0 ? '+' : ''}${schedule.varianceWorkDays} ngày làm việc` }}</small>
    </article>
  </section>
</template>
