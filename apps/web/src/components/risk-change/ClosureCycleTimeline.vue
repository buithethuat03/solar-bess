<script setup lang="ts">
import type { RiskIssueClosureCycle } from '@/types/risk-change.types';

defineProps<{
  cycles: RiskIssueClosureCycle[];
  nextCursor: string | null;
  loading?: boolean;
}>();
const emit = defineEmits<{ loadMore: [] }>();
</script>

<template>
  <section class="closure-timeline" aria-labelledby="closure-timeline-title">
    <div class="section-heading"><div><h3 id="closure-timeline-title">Closure evidence cycles</h3><p>Append-only DB-113 history; phần “Latest” trên record chỉ là projection.</p></div><strong>{{ cycles.length }} cycle</strong></div>
    <ol v-if="cycles.length">
      <li v-for="cycle in cycles" :key="cycle.id">
        <div><strong>Cycle #{{ cycle.sequenceNo }}</strong><span>{{ new Date(cycle.requestedAt).toLocaleString('vi-VN') }}</span></div>
        <p><b>Yêu cầu:</b> {{ cycle.requestReason }}</p>
        <p><b>Evidence:</b> {{ cycle.requestEvidenceRefs.length }} reference</p>
        <div v-if="cycle.decision" class="closure-timeline__decision">
          <strong>{{ cycle.decision }} → {{ cycle.resultingStatus }}</strong>
          <p>{{ cycle.decisionComment }}</p>
          <small>{{ cycle.decidedAt ? new Date(cycle.decidedAt).toLocaleString('vi-VN') : '' }} · {{ cycle.decisionEvidenceRefs.length }} evidence</small>
        </div>
        <div v-else class="closure-timeline__pending">Đang chờ approver độc lập</div>
      </li>
    </ol>
    <p v-else class="muted-inline">Chưa có closure cycle.</p>
    <el-button v-if="nextCursor" :loading="loading" @click="emit('loadMore')">Tải thêm cycle</el-button>
  </section>
</template>
