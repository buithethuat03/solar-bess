<script setup lang="ts">
import { computed } from 'vue';
import {
  SUPPLIER_QUALIFICATION_LABEL, isQualificationExpired, isSupplierInvitable
} from '@/constants/procurement';
import type { SupplierView } from '@/types/procurement.types';

const props = defineProps<{
  suppliers: SupplierView[];
  nextCursor: string | null;
  loadingMore: boolean;
  /** yyyy-mm-dd đánh giá hiệu lực; API-078 so với CURRENT_DATE của server. */
  asOf: string;
}>();
const emit = defineEmits<{ more: [] }>();

interface SupplierRow {
  supplier: SupplierView;
  expired: boolean;
  invitable: boolean;
}

/**
 * Hết hiệu lực là một tín hiệu độc lập với trạng thái lưu trữ: một profile vẫn mang
 * `QUALIFIED` nhưng `validTo` đã qua thì API-078 vẫn từ chối lời mời. Hàng nào cũng
 * mang cả hai dữ kiện để người dùng thấy lý do, không chỉ thấy kết quả.
 */
const rows = computed<SupplierRow[]>(() => props.suppliers.map((supplier) => ({
  supplier,
  expired: isQualificationExpired(supplier, props.asOf),
  invitable: isSupplierInvitable(supplier, props.asOf)
})));

const invitableCount = computed(() => rows.value.filter((row) => row.invitable).length);
</script>

<template>
  <section class="procurement-panel supplier-register" aria-labelledby="supplier-register-title">
    <div class="detail-heading">
      <div>
        <small>SUPPLIER REGISTER · API-076 · DB-044</small>
        <h2 id="supplier-register-title">Nhà cung cấp và tình trạng sơ tuyển</h2>
        <p class="lead">
          Sổ đăng ký cấp tenant. Hồ sơ hết hiệu lực không bị xóa — chúng vẫn hiển thị nhưng được
          đánh dấu riêng và không thể được mời chào giá.
        </p>
      </div>
      <p class="supplier-register__count">
        <strong>{{ invitableCount }}</strong> / {{ rows.length }} đủ điều kiện mời thầu
      </p>
    </div>

    <div v-if="!rows.length" class="empty-panel">
      <h3>Chưa có nhà cung cấp nào trong scope</h3>
      <p>Bộ lọc hiện tại không trả về hồ sơ nào mà bạn được phép xem.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table procurement-table supplier-table">
        <thead>
          <tr>
            <th>Company / pháp nhân</th>
            <th>Nhóm hàng</th>
            <th>Tình trạng sơ tuyển</th>
            <th>Hiệu lực</th>
            <th>Mời thầu</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.supplier.id"
            :data-expired="row.expired"
            :data-invitable="row.invitable"
          >
            <td>
              <strong>{{ row.supplier.companyId }}</strong>
              <span>{{ row.supplier.legalEntityId ?? 'Không gắn pháp nhân' }}</span>
            </td>
            <td>{{ row.supplier.category }}</td>
            <td>
              <span class="status-pill" :data-status="row.supplier.qualificationStatus">
                {{ SUPPLIER_QUALIFICATION_LABEL[row.supplier.qualificationStatus] }}
              </span>
            </td>
            <td>
              {{ row.supplier.validFrom ?? '—' }} → {{ row.supplier.validTo ?? 'Không thời hạn' }}
              <span v-if="row.expired" class="supplier-expired-flag">Đã hết hiệu lực</span>
            </td>
            <td>
              <span v-if="row.invitable" class="supplier-invitable">Đủ điều kiện</span>
              <span v-else class="supplier-blocked">Không được mời</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <el-button v-if="nextCursor" :loading="loadingMore" @click="emit('more')">
      Tải thêm nhà cung cấp
    </el-button>
  </section>
</template>
