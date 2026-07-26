<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  CONTRACT_NO_PATTERN, CONTRACT_TYPE_LABEL, CONTRACT_TYPES, CURRENCY_PATTERN, MONEY_PATTERN
} from '@/constants/contracts';
import type { ContractType, CreateContractRequest } from '@/types/contract.types';

defineProps<{ busy: boolean }>();
const emit = defineEmits<{ close: []; create: [input: CreateContractRequest] }>();

const error = ref('');
const form = reactive({
  contractNo: '', title: '', type: 'EPC' as ContractType, value: '', currency: 'VND',
  effectiveFrom: '', effectiveTo: '', rootDocumentId: ''
});

function validate(): boolean {
  error.value = '';
  if (!CONTRACT_NO_PATTERN.test(form.contractNo)) {
    error.value = 'Số hợp đồng phải viết hoa, 2–80 ký tự và chỉ dùng A–Z, 0–9, _ . / -';
    return false;
  }
  if (form.title.trim().length < 3) {
    error.value = 'Tiêu đề phải có ít nhất 3 ký tự.';
    return false;
  }
  // Money is checked as text against the API pattern; it is never parsed into a number.
  if (!MONEY_PATTERN.test(form.value)) {
    error.value = 'Giá trị hợp đồng phải là số thập phân dương, tối đa 4 chữ số lẻ (VD: 1250000.5).';
    return false;
  }
  if (!CURRENCY_PATTERN.test(form.currency)) {
    error.value = 'Loại tiền phải là mã ISO 3 chữ cái viết hoa (VD: VND, USD).';
    return false;
  }
  // String compare on YYYY-MM-DD, mirroring CONTRACT_DATES_INVALID server-side.
  if (form.effectiveFrom && form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
    error.value = 'Ngày hết hiệu lực phải không sớm hơn ngày hiệu lực.';
    return false;
  }
  return true;
}

function submit(): void {
  if (!validate()) return;
  emit('create', {
    contractNo: form.contractNo.trim(), title: form.title.trim(), type: form.type,
    value: form.value.trim(), currency: form.currency.trim(),
    ...(form.effectiveFrom ? { effectiveFrom: form.effectiveFrom } : {}),
    ...(form.effectiveTo ? { effectiveTo: form.effectiveTo } : {}),
    ...(form.rootDocumentId.trim() ? { rootDocumentId: form.rootDocumentId.trim() } : {})
  });
}
</script>

<template>
  <section class="contract-detail" aria-labelledby="contract-create-title">
    <div class="detail-heading">
      <div>
        <small>CONTRACT · DB-028</small>
        <h2 id="contract-create-title">Tạo hợp đồng</h2>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <form @submit.prevent="submit">
      <fieldset class="contract-form form-fieldset" :disabled="busy">
        <label>Số hợp đồng<input v-model.trim="form.contractNo" required placeholder="VD: EPC-2026-001" /></label>
        <label>Loại hợp đồng<select v-model="form.type" aria-label="Loại hợp đồng"><option v-for="item in CONTRACT_TYPES" :key="item" :value="item">{{ CONTRACT_TYPE_LABEL[item] }}</option></select></label>
        <label class="form-wide">Tiêu đề<input v-model.trim="form.title" required maxlength="400" /></label>
        <label>Giá trị<input v-model.trim="form.value" required inputmode="decimal" placeholder="VD: 1250000000.5" /></label>
        <label>Loại tiền<input v-model.trim="form.currency" required maxlength="3" placeholder="VND" /></label>
        <label>Hiệu lực từ<input v-model="form.effectiveFrom" type="date" /></label>
        <label>Hiệu lực đến<input v-model="form.effectiveTo" type="date" /></label>
        <label class="form-wide">Tài liệu gốc<input v-model.trim="form.rootDocumentId" placeholder="UUID tài liệu trong dự án (nếu có)" /></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="emit('close')">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Tạo hợp đồng</el-button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
