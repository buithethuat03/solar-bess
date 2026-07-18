<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type {
  BaselineDecisionRequest,
  ScheduleBaseline,
  SubmitScheduleBaselineRequest
} from '@/types/schedule.types';

const props = defineProps<{
  baseline: ScheduleBaseline | null;
  scheduleVersion: number;
  dataDate: string;
  canSubmit: boolean;
  canRebaseline: boolean;
  approvedChangeRequestId?: string;
  canDecide: boolean;
  decisionUnavailableReason?: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: SubmitScheduleBaselineRequest];
  decide: [input: BaselineDecisionRequest];
}>();

const error = ref('');
const submitForm = reactive({
  dataDate: props.dataDate,
  reason: '',
  impactSummary: ''
});
const decisionForm = reactive({ decision: 'APPROVE' as BaselineDecisionRequest['decision'], comment: '' });

const submittedBaseline = computed(() => props.baseline?.status === 'SUBMITTED');

function submitBaseline(): void {
  error.value = '';
  if (submitForm.reason.trim().length < 3 || submitForm.impactSummary.trim().length < 3) {
    error.value = 'Lý do và tóm tắt tác động phải có ít nhất 3 ký tự.';
    return;
  }
  emit('submit', {
    baselineType: 'INITIAL',
    dataDate: submitForm.dataDate,
    reason: submitForm.reason.trim(),
    impactSummary: submitForm.impactSummary.trim(),
    expectedScheduleVersion: props.scheduleVersion
  });
}

function submitRebaseline(): void {
  error.value = '';
  if (!props.approvedChangeRequestId) {
    error.value = 'Rebaseline cần immutable approved Change reference.';
    return;
  }
  emit('submit', {
    baselineType: 'REBASELINE',
    dataDate: submitForm.dataDate,
    approvedChangeRequestId: props.approvedChangeRequestId,
    expectedScheduleVersion: props.scheduleVersion
  });
}

function decide(): void {
  error.value = '';
  if (!props.baseline) return;
  if (decisionForm.decision !== 'APPROVE' && decisionForm.comment.trim().length < 3) {
    error.value = 'Return hoặc Reject bắt buộc có nhận xét ít nhất 3 ký tự.';
    return;
  }
  emit('decide', {
    decision: decisionForm.decision,
    comment: decisionForm.comment.trim() || undefined,
    expectedVersion: props.baseline.versionNo
  });
}
</script>

<template>
  <section class="schedule-command-form" aria-labelledby="baseline-panel-title">
    <div class="schedule-command-form__heading">
      <div>
        <small>WF-003 · IMMUTABLE SNAPSHOT</small>
        <h3 id="baseline-panel-title">Baseline schedule</h3>
        <p>Người tạo/người submit không được tự duyệt. Server luôn kiểm tra lại scope và SoD.</p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="baseline" class="baseline-snapshot">
      <div><span>Baseline</span><strong>#{{ baseline.baselineNumber }} · {{ baseline.baselineType }}</strong></div>
      <div><span>Trạng thái</span><strong>{{ baseline.status }}</strong></div>
      <div><span>Data date</span><strong>{{ baseline.dataDate }}</strong></div>
      <div><span>Snapshot hash</span><code>{{ baseline.snapshotHash.slice(0, 16) }}…</code></div>
    </div>
    <form v-if="canSubmit && !baseline" class="schedule-form-grid" @submit.prevent="submitBaseline">
      <label>Loại baseline<input value="INITIAL" disabled /></label>
      <label>Data date<input v-model="submitForm.dataDate" type="date" required /></label>
      <label class="schedule-form-grid__wide">Lý do<textarea v-model.trim="submitForm.reason" rows="3" minlength="3" maxlength="2000" required /></label>
      <label class="schedule-form-grid__wide">Tóm tắt tác động<textarea v-model.trim="submitForm.impactSummary" rows="3" minlength="3" maxlength="4000" required /></label>
      <div class="schedule-command-form__actions schedule-form-grid__wide"><el-button native-type="submit" type="primary" :loading="busy">Submit baseline</el-button></div>
    </form>
    <form v-if="canSubmit && canRebaseline && baseline?.status === 'APPROVED' && approvedChangeRequestId" class="schedule-form-grid desktop-decision" @submit.prevent="submitRebaseline">
      <label>Loại baseline<input value="REBASELINE" disabled /></label>
      <label>Data date<input v-model="submitForm.dataDate" type="date" required /></label>
      <label class="schedule-form-grid__wide">Approved Change reference<input :value="approvedChangeRequestId" disabled /></label>
      <p class="schedule-readonly-note schedule-form-grid__wide">Reason và impact được server lấy từ immutable approved Change snapshot; browser không được gửi free-text thay thế.</p>
      <div class="schedule-command-form__actions schedule-form-grid__wide"><el-button native-type="submit" type="primary" :loading="busy">Submit rebaseline</el-button></div>
    </form>
    <p v-else-if="canSubmit && baseline?.status === 'APPROVED'" class="schedule-readonly-note">Mở Schedule từ một approved Change có schedule impact để tạo rebaseline.</p>
    <form v-if="canDecide && submittedBaseline" class="schedule-form-grid schedule-decision-form" @submit.prevent="decide">
      <label>Quyết định<select v-model="decisionForm.decision"><option value="APPROVE">Approve</option><option value="RETURN">Return</option><option value="REJECT">Reject</option></select></label>
      <label class="schedule-form-grid__wide">Nhận xét<textarea v-model.trim="decisionForm.comment" rows="3" maxlength="2000" :required="decisionForm.decision !== 'APPROVE'" /></label>
      <div class="schedule-command-form__actions schedule-form-grid__wide"><el-button native-type="submit" type="primary" :loading="busy">Ghi quyết định độc lập</el-button></div>
    </form>
    <p v-if="decisionUnavailableReason" class="schedule-readonly-note">{{ decisionUnavailableReason }}</p>
    <p v-else-if="!canSubmit && !canDecide" class="schedule-readonly-note">Bạn chỉ có quyền đọc baseline trong phạm vi hiện tại.</p>
  </section>
</template>
