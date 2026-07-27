<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney } from '@/constants/contracts';
import { OPPORTUNITY_STAGE_LABEL, OPPORTUNITY_STAGES } from '@/constants/opportunity';
import type { OpportunityStage, OpportunityView } from '@/types/opportunity.types';

/**
 * API-026 pipeline, laid out as one lane per WF-002 stage.
 *
 * `expectedCapacityKwp` is grouped for readability by `formatMoney`, the shared string formatter —
 * it never leaves the string domain, so a 4-decimal capacity survives display intact. There is no
 * capacity total across lanes: summing capacity across opportunities in different stages would
 * invent a portfolio figure nobody asked for.
 *
 * Lanes with no rows are still drawn: an empty QUALIFIED column is a fact about the pipeline, and
 * hiding it would make the pipeline look shorter than it is.
 */
const props = defineProps<{
  opportunities: OpportunityView[];
  selectedId: string | null;
}>();
const emit = defineEmits<{ open: [opportunityId: string] }>();

const lanes = computed(() => OPPORTUNITY_STAGES.map((stage: OpportunityStage) => ({
  stage,
  items: props.opportunities.filter((item) => item.stage === stage)
})));
</script>

<template>
  <section class="opportunity-pipeline" aria-labelledby="opportunity-pipeline-title">
    <div class="section-heading">
      <div>
        <h2 id="opportunity-pipeline-title">Pipeline theo giai đoạn</h2>
        <p>WF-002. Mỗi làn là một stage; số liệu công suất giữ nguyên dạng chuỗi.</p>
      </div>
      <strong>{{ opportunities.length }} cơ hội</strong>
    </div>

    <div class="opportunity-lanes">
      <section
        v-for="lane in lanes"
        :key="lane.stage"
        class="opportunity-lane"
        :data-stage="lane.stage"
        :aria-label="OPPORTUNITY_STAGE_LABEL[lane.stage]"
      >
        <header>
          <span class="status-pill" :data-status="lane.stage">{{ OPPORTUNITY_STAGE_LABEL[lane.stage] }}</span>
          <strong>{{ lane.items.length }}</strong>
        </header>
        <ul v-if="lane.items.length">
          <li
            v-for="item in lane.items"
            :key="item.id"
            :data-selected="item.id === selectedId"
          >
            <button type="button" class="opportunity-card" @click="emit('open', item.id)">
              <strong>{{ item.code }}</strong>
              <span>{{ item.name }}</span>
              <span class="money">{{ formatMoney(item.expectedCapacityKwp) }} kWp</span>
              <span>{{ item.locationText ?? 'Chưa có địa điểm' }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="muted-inline">Không có cơ hội ở giai đoạn này.</p>
      </section>
    </div>
  </section>
</template>
