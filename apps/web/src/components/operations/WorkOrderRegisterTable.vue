<script setup lang="ts">
import { PRIORITY_LABEL, WORK_ORDER_STATUS_LABEL } from '@/constants/operations';
import type { WorkOrderRegisterRow } from '@/types/operations.types';

/**
 * API-118 — the work-order register of one asset.
 *
 * The status chip is repeated as a row marker so the two states that mean "someone must act"
 * (ON_HOLD, REOPENED) and the two terminal ones survive a greyscale print. `requiresPermit` is
 * shown on the row rather than in the detail: whether a job needs a permit to work is a safety
 * fact, and hiding it behind a click is how it gets missed.
 */
defineProps<{
  rows: WorkOrderRegisterRow[];
  nextCursor: string | null;
  loadingMore: boolean;
  selectedId: string | null;
}>();
const emit = defineEmits<{ open: [workOrderId: string]; more: [] }>();
</script>

<template>
  <section class="operations-panel work-order-register" aria-labelledby="work-order-register-title">
    <div class="detail-heading">
      <div>
        <small>WORK ORDER · API-118</small>
        <h2 id="work-order-register-title">Sổ work order của asset</h2>
        <p class="lead">Kế hoạch bảo trì và số yêu cầu bảo hành được nhúng theo từng dòng.</p>
      </div>
    </div>

    <div v-if="!rows.length" class="empty-panel">
      <h3>Chưa có work order</h3>
      <p>Asset chưa có work order nào trong scope được phép, hoặc bộ lọc đang thu hẹp kết quả.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table operations-table work-order-table">
        <thead>
          <tr>
            <th>Mã / tiêu đề</th>
            <th>Loại công việc</th>
            <th>Ưu tiên</th>
            <th>Trạng thái</th>
            <th>Permit</th>
            <th>Kế hoạch bảo trì</th>
            <th>Bảo hành</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            :data-status="row.status"
            :data-selected="row.id === selectedId"
          >
            <td><strong>{{ row.code }}</strong><span>{{ row.title }}</span></td>
            <td>{{ row.workType }}</td>
            <td><span class="status-pill" :data-status="row.priority">{{ PRIORITY_LABEL[row.priority] }}</span></td>
            <td><span class="status-pill" :data-status="row.status">{{ WORK_ORDER_STATUS_LABEL[row.status] }}</span></td>
            <td>
              <strong v-if="row.requiresPermit" class="permit-required">Bắt buộc PTW</strong>
              <span v-else>Không yêu cầu</span>
              <span v-if="row.permitToWorkId">Đã gắn permit</span>
            </td>
            <td>
              <template v-if="row.maintenancePlan">
                <strong>{{ row.maintenancePlan.planType }} v{{ row.maintenancePlan.version }}</strong>
                <span>{{ row.maintenancePlan.triggerType }} · {{ row.maintenancePlan.status }}</span>
              </template>
              <span v-else>Không theo kế hoạch</span>
            </td>
            <td>{{ row.warrantyClaimCount }}</td>
            <td><el-button text @click="emit('open', row.id)">Mở lệnh</el-button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-button v-if="nextCursor" :loading="loadingMore" @click="emit('more')">
      Tải thêm work order
    </el-button>
  </section>
</template>
