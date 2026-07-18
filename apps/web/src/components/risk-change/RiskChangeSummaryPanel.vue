<script setup lang="ts">
import RiskHeatmap from './RiskHeatmap.vue';
import type { RiskChangeSummary } from '@/types/risk-change.types';

defineProps<{ summary: RiskChangeSummary }>();
const emit = defineEmits<{
  openRisk: [id: string]; openIssue: [id: string]; openAction: [id: string]; openChange: [id: string];
}>();
</script>

<template>
  <section class="risk-change-summary">
    <div class="risk-change-kpis">
      <article><span>Risk</span><strong>{{ summary.riskTotal }}</strong><small>{{ summary.highRiskCount }} high · {{ summary.criticalRiskCount }} critical</small></article>
      <article><span>Issue</span><strong>{{ summary.issueTotal }}</strong><small>{{ summary.criticalIssueCount }} critical</small></article>
      <article><span>Action quá hạn</span><strong>{{ summary.overdueActionCount }}</strong><small>Cần xử lý theo current scope</small></article>
      <article><span>Chờ quyết định Change</span><strong>{{ summary.pendingChangeDecisionCount }}</strong><small>Không tự approve</small></article>
    </div>
    <RiskHeatmap :heatmap="summary.riskHeatmap" />
    <div class="risk-change-lanes">
      <section><h3>Top Risk</h3><button v-for="item in summary.topRisks" :key="item.id" type="button" @click="emit('openRisk', item.id)"><strong>{{ item.code }}</strong><span>{{ item.effectiveLevel }} · {{ item.effectiveExposure }}</span></button><p v-if="!summary.topRisks.length">Không có Risk.</p></section>
      <section><h3>Critical Issue</h3><button v-for="item in summary.criticalIssues" :key="item.id" type="button" @click="emit('openIssue', item.id)"><strong>{{ item.code }} · {{ item.title }}</strong><span>{{ item.severity }} · target {{ item.targetDate }}</span></button><p v-if="!summary.criticalIssues.length">Không có Issue critical.</p></section>
      <section><h3>Action quá hạn</h3><button v-for="item in summary.overdueActions" :key="item.id" type="button" @click="emit('openAction', item.id)"><strong>{{ item.code }} · {{ item.title }}</strong><span>{{ item.status }} · due {{ item.dueDate }}</span></button><p v-if="!summary.overdueActions.length">Không có Action quá hạn.</p></section>
      <section><h3>Change chờ quyết định</h3><button v-for="item in summary.pendingChangeRequests" :key="item.id" type="button" @click="emit('openChange', item.id)"><strong>{{ item.code }} · {{ item.title }}</strong><span>{{ item.status }}</span></button><p v-if="!summary.pendingChangeRequests.length">Không có Change chờ quyết định.</p></section>
    </div>
  </section>
</template>
