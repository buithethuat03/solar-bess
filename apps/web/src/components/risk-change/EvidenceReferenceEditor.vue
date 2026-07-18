<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { EvidenceReference } from '@/types/risk-change.types';

const props = withDefaults(defineProps<{
  modelValue: EvidenceReference[];
  disabled?: boolean;
  required?: boolean;
}>(), { disabled: false, required: false });

const emit = defineEmits<{ 'update:modelValue': [value: EvidenceReference[]] }>();
const error = ref('');
const draft = reactive({ objectType: 'DOCUMENT', objectId: '', revisionId: '', label: '' });

function add(): void {
  error.value = '';
  if (!draft.objectType.trim() || !draft.objectId.trim()) {
    error.value = 'Evidence cần object type và stable object ID.';
    return;
  }
  emit('update:modelValue', [...props.modelValue, {
    objectType: draft.objectType.trim().toUpperCase(),
    objectId: draft.objectId.trim(),
    ...(draft.revisionId.trim() ? { revisionId: draft.revisionId.trim() } : {}),
    ...(draft.label.trim() ? { label: draft.label.trim() } : {})
  }]);
  Object.assign(draft, { objectType: 'DOCUMENT', objectId: '', revisionId: '', label: '' });
}

function remove(index: number): void {
  emit('update:modelValue', props.modelValue.filter((_, itemIndex) => itemIndex !== index));
}
</script>

<template>
  <fieldset class="evidence-editor" :disabled="disabled">
    <legend>Evidence references <span v-if="required">· bắt buộc</span></legend>
    <div class="evidence-editor__input">
      <input v-model.trim="draft.objectType" aria-label="Evidence object type" placeholder="DOCUMENT" />
      <input v-model.trim="draft.objectId" aria-label="Evidence object ID" placeholder="Stable UUID" />
      <input v-model.trim="draft.revisionId" aria-label="Evidence revision ID" placeholder="Revision UUID (nếu có)" />
      <input v-model.trim="draft.label" aria-label="Evidence label" placeholder="Nhãn hiển thị" />
      <el-button native-type="button" @click="add">Thêm evidence</el-button>
    </div>
    <small v-if="error" class="field-error">{{ error }}</small>
    <ul v-if="modelValue.length" class="evidence-list">
      <li v-for="(item, index) in modelValue" :key="`${item.objectType}-${item.objectId}-${index}`">
        <span><strong>{{ item.label || item.objectType }}</strong><code>{{ item.objectId }}</code></span>
        <el-button v-if="!disabled" text type="danger" native-type="button" @click="remove(index)">Xóa</el-button>
      </li>
    </ul>
    <p v-else class="muted-inline">Chưa có evidence được tham chiếu.</p>
  </fieldset>
</template>
