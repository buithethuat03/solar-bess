<script setup lang="ts">
import type { DashboardScheduleAlert } from '@/types/schedule.types';

defineProps<{
  items: DashboardScheduleAlert[];
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{
  open: [item: DashboardScheduleAlert];
  retry: [];
}>();
</script>

<template>
  <section class="dashboard-alert-lane" aria-labelledby="schedule-alert-lane-title">
    <div class="dashboard-alert-lane__heading">
      <div>
        <p class="eyebrow eyebrow--accent">DB-105 · AUTHORIZED PROJECTION</p>
        <h2 id="schedule-alert-lane-title">Cảnh báo schedule của bạn</h2>
        <p>Overdue và near-critical được resolve theo assignment hiện hành; mở record sẽ kiểm quyền lại.</p>
      </div>
      <strong v-if="!loading">{{ items.length }}</strong>
    </div>
    <div v-if="loading" class="dashboard-alert-lane__state" aria-live="polite">Đang tổng hợp cảnh báo theo scope…</div>
    <div v-else-if="error" class="dashboard-alert-lane__state" role="alert">
      <span>{{ error }}</span><el-button @click="emit('retry')">Thử lại</el-button>
    </div>
    <div v-else-if="items.length === 0" class="dashboard-alert-lane__state">
      Không có cảnh báo schedule trong snapshot hiện tại.
    </div>
    <div v-else class="dashboard-alert-lane__grid">
      <button
        v-for="item in items"
        :key="`${item.projectId}-${item.id}`"
        type="button"
        :data-priority="item.priority"
        @click="emit('open', item)"
      >
        <span><strong>{{ item.alertType }}</strong><small>Due {{ item.dueAt }}</small></span>
        <b>{{ item.projectCode }} · {{ item.projectName }}</b>
        <span>{{ item.activityCode }} · {{ item.activityName }}</span>
      </button>
    </div>
  </section>
</template>
