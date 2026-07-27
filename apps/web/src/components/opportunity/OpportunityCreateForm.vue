<script setup lang="ts">
import { reactive, ref } from 'vue';
import { OPPORTUNITY_CODE_PATTERN, OPPORTUNITY_MONEY_PATTERN } from '@/constants/opportunity';
import type { CreateOpportunityRequest } from '@/types/opportunity.types';

/**
 * API-027 — create a LEAD.
 *
 * `expectedCapacityKwp` is typed as text and emitted as text. The server computes the duplicate
 * key from customer + location and answers 409 DUPLICATE_OPPORTUNITY when one already exists; the
 * form does not try to predict that, it just reports what the server said.
 */
const emit = defineEmits<{ close: []; create: [input: CreateOpportunityRequest] }>();
defineProps<{ busy: boolean }>();

const error = ref('');
const form = reactive({
  code: '', name: '', customerCompanyId: '', siteId: '', locationText: '',
  expectedCapacityKwp: '', ownerId: ''
});

function submit(): void {
  error.value = '';
  if (!OPPORTUNITY_CODE_PATTERN.test(form.code.trim())) {
    error.value = 'Mã cơ hội phải viết hoa, bắt đầu bằng chữ hoặc số (VD: OPP-2026-001).';
    return;
  }
  if (form.name.trim().length < 3) {
    error.value = 'Tên cơ hội phải có ít nhất 3 ký tự.';
    return;
  }
  const capacity = form.expectedCapacityKwp.trim();
  if (capacity && !OPPORTUNITY_MONEY_PATTERN.test(capacity)) {
    error.value = 'Công suất dự kiến phải là số thập phân dạng chuỗi, tối đa 4 chữ số phần lẻ.';
    return;
  }
  emit('create', {
    code: form.code.trim(), name: form.name.trim(),
    ...(form.customerCompanyId.trim() ? { customerCompanyId: form.customerCompanyId.trim() } : {}),
    ...(form.siteId.trim() ? { siteId: form.siteId.trim() } : {}),
    ...(form.locationText.trim() ? { locationText: form.locationText.trim() } : {}),
    ...(capacity ? { expectedCapacityKwp: capacity } : {}),
    ...(form.ownerId.trim() ? { ownerId: form.ownerId.trim() } : {})
  });
}
</script>

<template>
  <form class="opportunity-panel opportunity-form" @submit.prevent="submit">
    <div class="detail-heading form-wide">
      <div>
        <small>OPPORTUNITY · API-027</small>
        <h2>Tạo cơ hội mới</h2>
        <p class="lead">Cơ hội sinh ra ở giai đoạn LEAD; khóa trùng lặp do server tính từ khách hàng + địa điểm.</p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <label>Mã cơ hội<input v-model.trim="form.code" required placeholder="OPP-2026-001" /></label>
    <label>Công suất dự kiến (kWp)<input v-model.trim="form.expectedCapacityKwp" inputmode="decimal" placeholder="12500.5" /></label>
    <label>Khách hàng (UUID)<input v-model.trim="form.customerCompanyId" /></label>
    <label class="form-wide">Tên cơ hội<input v-model.trim="form.name" required maxlength="400" /></label>
    <label class="form-wide">Địa điểm<input v-model.trim="form.locationText" maxlength="500" /></label>
    <label>Site ứng viên (UUID)<input v-model.trim="form.siteId" /></label>
    <label>Người phụ trách (UUID)<input v-model.trim="form.ownerId" placeholder="Bỏ trống để lấy chính bạn" /></label>

    <div class="form-actions form-wide">
      <el-button native-type="button" @click="emit('close')">Hủy</el-button>
      <el-button native-type="submit" type="primary" :loading="busy">Tạo cơ hội</el-button>
    </div>
  </form>
</template>
