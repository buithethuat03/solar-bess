<script setup lang="ts">
import { computed } from 'vue';
import type { AssetPerformanceData } from '@/types/operations.types';

/**
 * API-121 asset performance.
 *
 * THE RULE THIS COMPONENT EXISTS FOR: `kpi` and `telemetry` come back as `null` because PM Web has
 * no telemetry store — DB-091/DB-092 live in a separate OT time-series/event store on the other
 * side of the read-only boundary (AGENTS.md §10). "Not measured" and "measured as zero" are
 * different facts and only the second one is a number, so this panel renders NEITHER a 0 NOR an
 * em dash NOR an empty chart frame for them: an empty axis reads as a measurement that came back
 * flat. It states, in words, that no measurement source is connected.
 *
 * The counts beside it ARE real: they are rows counted in this database. A status with no rows is
 * simply absent from the map, and the panel does not backfill it with a zero either — the same
 * distinction, one level down.
 */
const props = defineProps<{
  performance: AssetPerformanceData | null;
  /** False when the caller lacks `performance.read`; the panel then says so instead of guessing. */
  permitted: boolean;
}>();

interface CountEntry { key: string; total: number }

function entries(counts: Record<string, number>): CountEntry[] {
  return Object.entries(counts)
    .map(([key, total]) => ({ key, total }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

const workOrderCounts = computed(
  () => entries(props.performance?.workOrderCountsByStatus ?? {})
);
const incidentCounts = computed(
  () => entries(props.performance?.serviceIncidentCountsByStatus ?? {})
);
const alarmCounts = computed(() => entries(props.performance?.alarmCaseCountsByState ?? {}));
</script>

<template>
  <section class="operations-panel asset-performance" aria-labelledby="asset-performance-title">
    <div class="detail-heading">
      <div>
        <small>ASSET PERFORMANCE · API-121</small>
        <h2 id="asset-performance-title">Hiệu năng thiết bị</h2>
        <p class="lead">Số liệu đếm từ bản ghi PM Web. Chỉ số đo lường thuộc hệ OT và không có ở đây.</p>
      </div>
    </div>

    <p v-if="!permitted" class="immutable-banner">
      Bạn không có quyền <code>performance.read</code>; phần hiệu năng không được tải.
    </p>
    <p v-else-if="!performance" class="muted-inline">Chưa tải được dữ liệu hiệu năng của asset.</p>

    <template v-else>
      <div class="fact-grid">
        <div><span>Mã asset</span><strong>{{ performance.asset.assetCode }}</strong></div>
        <div><span>Trạng thái vận hành</span><strong>{{ performance.asset.operationalStatus }}</strong></div>
        <div><span>Ngày đưa vào vận hành</span><strong>{{ performance.asset.activationDate ?? 'Chưa ghi nhận' }}</strong></div>
      </div>

      <!--
        Deliberately not a chart, not a stat tile and not a dash: there is no measurement to draw.
        A zero, a placeholder dash or an empty axis would all be read as a reading that was taken.
      -->
      <div class="no-measurement" data-testid="asset-kpi">
        <h3>Chưa có nguồn đo</h3>
        <p>
          PM Web không kết nối kho telemetry/KPI. Chỉ số vận hành (sản lượng, PR, khả dụng, SOC…)
          được đo và lưu ở hệ OT, phía bên kia ranh giới chỉ đọc. Vì vậy màn hình này không hiển
          thị bất kỳ giá trị đo nào, kể cả giá trị mặc định hay ký hiệu thay thế: một con số ở đây
          sẽ bị đọc là phép đo đã thực hiện.
        </p>
      </div>
      <div class="no-measurement" data-testid="asset-telemetry">
        <h3>Chưa có nguồn đo</h3>
        <p>
          Chuỗi telemetry theo thời gian cũng không tồn tại trong PM Web. Không biểu đồ nào được vẽ
          ở đây, vì một trục rỗng cũng sẽ bị đọc là phép đo cho kết quả bằng không.
        </p>
      </div>

      <div class="count-grid" data-testid="asset-counts">
        <section aria-labelledby="count-work-orders">
          <h3 id="count-work-orders">Work order theo trạng thái</h3>
          <ul v-if="workOrderCounts.length">
            <li v-for="entry in workOrderCounts" :key="entry.key">
              <span>{{ entry.key }}</span><strong>{{ entry.total }}</strong>
            </li>
          </ul>
          <p v-else class="muted-inline">Asset chưa có work order nào được ghi nhận.</p>
        </section>
        <section aria-labelledby="count-incidents">
          <h3 id="count-incidents">Sự cố dịch vụ theo trạng thái</h3>
          <ul v-if="incidentCounts.length">
            <li v-for="entry in incidentCounts" :key="entry.key">
              <span>{{ entry.key }}</span><strong>{{ entry.total }}</strong>
            </li>
          </ul>
          <p v-else class="muted-inline">Asset chưa có sự cố dịch vụ nào được ghi nhận.</p>
        </section>
        <section aria-labelledby="count-alarms">
          <h3 id="count-alarms">Alarm case cục bộ theo trạng thái</h3>
          <ul v-if="alarmCounts.length">
            <li v-for="entry in alarmCounts" :key="entry.key">
              <span>{{ entry.key }}</span><strong>{{ entry.total }}</strong>
            </li>
          </ul>
          <p v-else class="muted-inline">Asset chưa có alarm case cục bộ nào được ghi nhận.</p>
        </section>
      </div>
    </template>
  </section>
</template>
