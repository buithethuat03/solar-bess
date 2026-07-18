<script setup lang="ts">
import { reactive, ref } from 'vue';
import EvidenceReferenceEditor from './EvidenceReferenceEditor.vue';
import type { ClosureDecisionRequest, EvidenceReference, RiskChangeDecision } from '@/types/risk-change.types';

const props = defineProps<{
  kind: 'Risk' | 'Issue';
  expectedVersion: number;
  busy: boolean;
}>();
const emit = defineEmits<{ decide: [input: ClosureDecisionRequest] }>();
const form = reactive({ decision: 'APPROVE' as RiskChangeDecision, comment: '' });
const evidenceRefs = ref<EvidenceReference[]>([]);
const error = ref('');

function submit(): void {
  error.value = '';
  if (form.comment.trim().length < 3 || !evidenceRefs.value.length) {
    error.value = 'Closure decision bắt buộc comment và evidence.';
    return;
  }
  emit('decide', {
    decision: form.decision, expectedVersion: props.expectedVersion,
    comment: form.comment.trim(), evidenceRefs: evidenceRefs.value
  });
}
</script>

<template>
  <form class="closure-decision risk-change-form desktop-decision" @submit.prevent="submit">
    <div class="form-wide"><h3>Independent {{ kind }} closure decision</h3><p>Server kiểm tra full-project scope, SoD, exposure/severity và mọi Action terminal.</p></div>
    <el-alert v-if="error" class="form-wide" type="error" :title="error" show-icon />
    <label>Decision<select v-model="form.decision"><option value="APPROVE">APPROVE</option><option value="RETURN">RETURN</option><option value="REJECT">REJECT</option></select></label>
    <label class="form-wide">Comment<textarea v-model.trim="form.comment" required minlength="3" rows="2" /></label>
    <EvidenceReferenceEditor v-model="evidenceRefs" class="form-wide" required />
    <div class="form-actions form-wide"><el-button native-type="submit" type="primary" :loading="busy">Ghi closure decision</el-button></div>
  </form>
</template>
