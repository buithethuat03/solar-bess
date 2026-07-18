<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RiskHeatmap, RiskHeatmapCell } from '@/types/risk-change.types';

const props = defineProps<{ heatmap: RiskHeatmap }>();
const mode = ref<'inherent' | 'residual'>('inherent');
const selectedVersion = ref(0);
const impacts = [1, 2, 3, 4, 5];
const probabilities = [5, 4, 3, 2, 1];

const group = computed(() => props.heatmap.versionGroups[selectedVersion.value] ?? null);
const cells = computed(() => mode.value === 'inherent'
  ? group.value?.inherentCells ?? []
  : group.value?.residualCells ?? []);
const maximum = computed(() => Math.max(1, ...cells.value.map((item) => item.count)));

watch(() => props.heatmap.versionGroups.length, () => {
  if (selectedVersion.value >= props.heatmap.versionGroups.length) selectedVersion.value = 0;
});

function at(probability: number, impactRating: number): RiskHeatmapCell {
  return cells.value.find((item) => (
    item.probability === probability && item.impactRating === impactRating
  )) ?? { probability, impactRating, count: 0 };
}

function cellStyle(count: number): Record<string, string> {
  return { '--heat-opacity': String(0.12 + (count / maximum.value) * 0.78) };
}
</script>

<template>
  <section class="risk-heatmap" aria-labelledby="risk-heatmap-title">
    <div class="section-heading">
      <div><h2 id="risk-heatmap-title">Risk heatmap 5×5</h2><p>Đủ mọi probability/impact cell trên toàn bộ filtered authorized register.</p></div>
      <strong>{{ heatmap.filteredRiskCount }} risk</strong>
    </div>
    <div v-if="heatmap.versionGroups.length" class="risk-heatmap__controls">
      <label>Scoring / threshold version
        <select v-model.number="selectedVersion">
          <option v-for="(item, index) in heatmap.versionGroups" :key="`${item.scoringVersion}-${item.thresholdVersion}`" :value="index">
            {{ item.scoringVersion }} · {{ item.thresholdVersion }}
          </option>
        </select>
      </label>
      <div class="segmented-control" role="group" aria-label="Heatmap assessment type">
        <button type="button" :aria-pressed="mode === 'inherent'" @click="mode = 'inherent'">Inherent</button>
        <button type="button" :aria-pressed="mode === 'residual'" @click="mode = 'residual'">Residual</button>
      </div>
    </div>
    <p v-if="mode === 'residual' && group" class="risk-heatmap__missing">Chưa đánh giá residual: <strong>{{ group.residualMissingCount }}</strong></p>
    <div v-if="group" class="risk-heatmap__table-shell">
      <table class="risk-heatmap__table">
        <caption class="sr-only">{{ mode === 'inherent' ? 'Inherent' : 'Residual' }} risk count theo probability và impact rating</caption>
        <thead><tr><th scope="col">P \ I</th><th v-for="impact in impacts" :key="impact" scope="col">{{ impact }}</th></tr></thead>
        <tbody>
          <tr v-for="probability in probabilities" :key="probability">
            <th scope="row">{{ probability }}</th>
            <td v-for="impact in impacts" :key="impact">
              <span :style="cellStyle(at(probability, impact).count)" :aria-label="`Probability ${probability}, impact ${impact}: ${at(probability, impact).count} risk`">
                {{ at(probability, impact).count }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty-panel"><h3>Chưa có heatmap</h3><p>Bộ lọc hiện tại không có Risk được phép hiển thị.</p></div>
  </section>
</template>
