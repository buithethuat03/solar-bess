<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  CLASSIFICATION_LABEL, DOCUMENT_CLASSIFICATIONS, DOCUMENT_CODE_PATTERN
} from '@/constants/documents';
import type { CreateDocumentRequest, DocumentClassification } from '@/types/document.types';

const props = defineProps<{
  packageOptions: Array<{ id: string; code: string; name: string }>;
  /** False when the caller may only create inside an exact package scope. */
  fullProject: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; create: [input: CreateDocumentRequest] }>();

const error = ref('');
const form = reactive({
  documentCode: '', title: '', discipline: '', type: '',
  classification: 'INTERNAL' as DocumentClassification, packageId: '', ownerId: ''
});
if (!props.fullProject && props.packageOptions.length === 1) {
  form.packageId = props.packageOptions[0].id;
}

function validate(): boolean {
  error.value = '';
  if (!DOCUMENT_CODE_PATTERN.test(form.documentCode)) {
    error.value = 'Mã tài liệu phải viết hoa, 2–80 ký tự và chỉ dùng A–Z, 0–9, _ . / -';
    return false;
  }
  if (form.title.trim().length < 3) {
    error.value = 'Tiêu đề phải có ít nhất 3 ký tự.';
    return false;
  }
  if (!form.discipline.trim() || !form.type.trim()) {
    error.value = 'Discipline và loại tài liệu là bắt buộc.';
    return false;
  }
  if (!props.fullProject && !form.packageId) {
    error.value = 'Scope hiện tại chỉ cho phép tạo tài liệu trong một gói thầu cụ thể.';
    return false;
  }
  return true;
}

function submit(): void {
  if (!validate()) return;
  emit('create', {
    documentCode: form.documentCode.trim(), title: form.title.trim(),
    discipline: form.discipline.trim(), type: form.type.trim(),
    classification: form.classification,
    ...(form.packageId ? { packageId: form.packageId } : {}),
    ...(form.ownerId.trim() ? { ownerId: form.ownerId.trim() } : {})
  });
}
</script>

<template>
  <section class="document-detail" aria-labelledby="document-create-title">
    <div class="detail-heading">
      <div>
        <small>DOCUMENT · DB-022</small>
        <h2 id="document-create-title">Tạo tài liệu</h2>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <form @submit.prevent="submit">
      <fieldset class="document-form form-fieldset">
        <label>Mã tài liệu<input v-model.trim="form.documentCode" required placeholder="VD: SLD-001" /></label>
        <label>Discipline<input v-model.trim="form.discipline" required maxlength="100" /></label>
        <label>Loại tài liệu<input v-model.trim="form.type" required maxlength="100" /></label>
        <label class="form-wide">Tiêu đề<input v-model.trim="form.title" required maxlength="400" /></label>
        <label>Phân loại<select v-model="form.classification" aria-label="Phân loại"><option v-for="item in DOCUMENT_CLASSIFICATIONS" :key="item" :value="item">{{ CLASSIFICATION_LABEL[item] }}</option></select></label>
        <label>Gói thầu<select v-model="form.packageId" aria-label="Gói thầu"><option value="" :disabled="!fullProject">Cấp dự án</option><option v-for="item in packageOptions" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
        <label>Chủ sở hữu<input v-model.trim="form.ownerId" placeholder="UUID; bỏ trống để lấy người tạo" /></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="emit('close')">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Tạo tài liệu</el-button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
