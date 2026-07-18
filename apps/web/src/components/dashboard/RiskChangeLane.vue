<script setup lang="ts">
export interface DashboardRiskChangeItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  kind: 'RISK' | 'ISSUE' | 'ACTION' | 'CHANGE';
  code: string;
  title: string;
  status: string;
  priority: 'NORMAL' | 'HIGH';
}

defineProps<{ items: DashboardRiskChangeItem[]; loading: boolean; error: string }>();
const emit = defineEmits<{ open: [item: DashboardRiskChangeItem]; retry: [] }>();
</script>

<template>
  <section class="dashboard-risk-lane" aria-labelledby="dashboard-risk-title">
    <div class="section-heading"><div><p class="eyebrow eyebrow--accent">US-004 · AUTHORIZED PROJECTION</p><h2 id="dashboard-risk-title">Risk &amp; Change priority lane</h2><p>Top Risk, critical Issue, overdue Action và pending Change theo current scope.</p></div><el-button :loading="loading" @click="emit('retry')">Làm mới</el-button></div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="loading && !items.length" class="loading-panel">Đang tổng hợp Risk &amp; Change…</div>
    <div v-else-if="!items.length" class="empty-panel"><h3>Không có priority item</h3><p>Không suy hidden records thành count zero.</p></div>
    <div v-else class="dashboard-risk-lane__grid">
      <button v-for="item in items" :key="`${item.kind}-${item.id}`" type="button" :data-priority="item.priority" @click="emit('open', item)">
        <span>{{ item.kind }} · {{ item.projectCode }}</span><strong>{{ item.code }} · {{ item.title }}</strong><small>{{ item.status }} · {{ item.projectName }}</small>
      </button>
    </div>
  </section>
</template>
