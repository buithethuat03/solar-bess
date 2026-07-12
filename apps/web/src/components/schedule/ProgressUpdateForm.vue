<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
  ProgressHistoryItem, ProgressUpdateRequest, ScheduleActivity
} from '@/types/schedule.types';

const props = withDefaults(defineProps<{
  activity: ScheduleActivity;
  dataDate: string;
  busy: boolean;
  history?: ProgressHistoryItem[];
  canRecord?: boolean;
  canCorrect?: boolean;
}>(), {
  history: () => [],
  canRecord: true,
  canCorrect: false
});
const emit = defineEmits<{ cancel: []; submit: [input: ProgressUpdateRequest] }>();

const error = ref('');
const mode = ref<'RECORD' | 'CORRECT'>(props.canRecord ? 'RECORD' : 'CORRECT');
const form = reactive({
  dataDate: props.dataDate,
  percentComplete: props.activity.percentComplete,
  remainingDurationWorkDays: props.activity.remainingDurationWorkDays,
  actualStart: props.activity.actualStart ?? '',
  actualFinish: props.activity.actualFinish ?? '',
  quantity: '',
  unit: '',
  evidence: '',
  note: '',
  correctionOfId: '',
  reason: ''
});
const correctionTarget = computed(() => (
  props.history.find((item) => item.id === form.correctionOfId) ?? null
));

watch(() => form.correctionOfId, () => {
  const target = correctionTarget.value;
  if (!target) return;
  form.dataDate = target.dataDate;
  form.percentComplete = target.percentComplete;
  form.remainingDurationWorkDays = target.remainingDurationWorkDays;
  form.actualStart = target.actualStart ?? '';
  form.actualFinish = target.actualFinish ?? '';
  form.quantity = target.quantity ?? '';
  form.unit = target.unit ?? '';
  form.evidence = target.evidenceRefs.join('\n');
  form.note = target.note ?? '';
});

function submit(): void {
  error.value = '';
  const percentage = Number(form.percentComplete);
  const evidenceRefs = form.evidence.split('\n').map((value) => value.trim()).filter(Boolean);
  if (mode.value === 'CORRECT' && (!form.correctionOfId || form.reason.trim().length < 3)) {
    error.value = 'Correction bắt buộc chọn record gốc và nhập lý do ít nhất 3 ký tự.';
    return;
  }
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    error.value = 'Phần trăm hoàn thành phải từ 0 đến 100.';
    return;
  }
  if (percentage === 100 && (!form.actualStart || !form.actualFinish || evidenceRefs.length === 0)) {
    error.value = 'Hoàn thành 100% yêu cầu actual start, actual finish và ít nhất một evidence reference.';
    return;
  }
  if (form.actualFinish && (!form.actualStart || percentage !== 100 || evidenceRefs.length === 0)) {
    error.value = 'Actual finish yêu cầu actual start, tiến độ 100% và ít nhất một evidence reference.';
    return;
  }
  emit('submit', {
    activityId: props.activity.id,
    dataDate: form.dataDate,
    percentComplete: String(percentage),
    remainingDurationWorkDays: Number(form.remainingDurationWorkDays),
    quantity: form.quantity || undefined,
    unit: form.unit || undefined,
    actualStart: mode.value === 'CORRECT' ? form.actualStart || null : form.actualStart || undefined,
    actualFinish: mode.value === 'CORRECT' ? form.actualFinish || null : form.actualFinish || undefined,
    evidenceRefs: evidenceRefs.length ? evidenceRefs : undefined,
    note: form.note || undefined,
    correctionOfId: mode.value === 'CORRECT' ? form.correctionOfId : undefined,
    reason: mode.value === 'CORRECT' ? form.reason.trim() : undefined,
    expectedActivityVersion: props.activity.versionNo
  });
}
</script>

<template>
  <form class="schedule-command-form" @submit.prevent="submit">
    <div class="schedule-command-form__heading">
      <div><small>APPEND-ONLY PROGRESS</small><h3>{{ activity.code }} · {{ activity.name }}</h3></div>
      <button type="button" class="text-action" @click="emit('cancel')">Đóng</button>
    </div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div class="schedule-form-grid">
      <label v-if="canRecord && canCorrect">Thao tác<select v-model="mode"><option value="RECORD">Ghi progress mới</option><option value="CORRECT">Correction lịch sử</option></select></label>
      <label v-if="mode === 'CORRECT'" class="schedule-form-grid__wide">Record cần correction<select v-model="form.correctionOfId" required><option value="" disabled>Chọn progress record</option><option v-for="item in history" :key="item.id" :value="item.id">{{ item.dataDate }} · {{ item.percentComplete }}% · {{ item.id.slice(0, 8) }}</option></select></label>
      <label v-if="mode === 'CORRECT'" class="schedule-form-grid__wide">Lý do correction<textarea v-model.trim="form.reason" rows="2" minlength="3" maxlength="2000" required /></label>
      <label>Data date<input v-model="form.dataDate" type="date" required /></label>
      <label>Hoàn thành (%)<input v-model="form.percentComplete" type="number" min="0" max="100" step="0.01" required /></label>
      <label>Thời lượng còn lại<input v-model.number="form.remainingDurationWorkDays" type="number" min="0" required /></label>
      <label>Actual start<input v-model="form.actualStart" type="date" /></label>
      <label>Actual finish<input v-model="form.actualFinish" type="date" /></label>
      <label>Khối lượng<input v-model.trim="form.quantity" inputmode="decimal" /></label>
      <label>Đơn vị<input v-model.trim="form.unit" maxlength="40" /></label>
      <label class="schedule-form-grid__wide">Evidence references, mỗi dòng một tham chiếu<textarea v-model="form.evidence" rows="3" placeholder="DOC-123/rev-02&#10;PHOTO-456" /></label>
      <label class="schedule-form-grid__wide">Ghi chú<textarea v-model.trim="form.note" rows="3" maxlength="2000" /></label>
      <p v-if="mode === 'CORRECT' && history.length === 0" class="schedule-readonly-note schedule-form-grid__wide">Activity chưa có progress record để correction.</p>
    </div>
    <div class="schedule-command-form__actions">
      <el-button native-type="button" @click="emit('cancel')">Hủy</el-button>
      <el-button native-type="submit" type="primary" :loading="busy" :disabled="mode === 'CORRECT' && history.length === 0">{{ mode === 'CORRECT' ? 'Ghi correction' : 'Ghi tiến độ' }}</el-button>
    </div>
  </form>
</template>
