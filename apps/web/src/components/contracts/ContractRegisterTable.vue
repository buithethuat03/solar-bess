<script setup lang="ts">
import {
  CONTRACT_STATUS_LABEL, CONTRACT_TYPE_LABEL, formatMoney
} from '@/constants/contracts';
import type { ContractView } from '@/types/contract.types';

defineProps<{
  rows: ContractView[];
  nextCursor: string | null;
  loadingMore: boolean;
  selectedId: string | null;
  /**
   * API-053 embeds no party count, so the register only learns it when a detail (API-055) has been
   * opened in this session. An unknown count renders as "—", never as 0 — absence is not zero.
   */
  partyCounts: Record<string, number>;
}>();
const emit = defineEmits<{ open: [contractId: string]; more: [] }>();
</script>

<template>
  <section class="register-panel contract-register">
    <div class="section-heading">
      <div>
        <h2>Contract Register</h2>
        <p>Số hợp đồng, loại, trạng thái và giá trị gốc theo đúng loại tiền của từng hợp đồng.</p>
      </div>
    </div>

    <div v-if="!rows.length" class="empty-panel">
      <h3>Không có hợp đồng phù hợp</h3>
      <p>Bộ lọc không khớp hợp đồng nào trong scope được phép; không suy ra thành số đếm bằng không.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table contract-table">
        <thead>
          <tr>
            <th>Số / tiêu đề</th>
            <th>Loại</th>
            <th>Trạng thái</th>
            <th>Giá trị</th>
            <th>Số bên</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :data-selected="row.id === selectedId">
            <td>
              <strong>{{ row.contractNo }}</strong>
              <span>{{ row.title }}</span>
            </td>
            <td>{{ CONTRACT_TYPE_LABEL[row.type] }}</td>
            <td>
              <span class="status-pill" :data-status="row.status">{{ CONTRACT_STATUS_LABEL[row.status] }}</span>
              <span v-if="row.legalHold" class="legal-hold-note">Legal hold</span>
            </td>
            <td><span class="money">{{ formatMoney(row.value) }} {{ row.currency }}</span></td>
            <td>{{ partyCounts[row.id] ?? '—' }}</td>
            <td><el-button text @click="emit('open', row.id)">Mở</el-button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-button v-if="nextCursor" :loading="loadingMore" @click="emit('more')">Tải thêm hợp đồng</el-button>
  </section>
</template>
