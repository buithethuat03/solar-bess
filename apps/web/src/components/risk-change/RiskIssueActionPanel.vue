<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import AssigneePicker from './AssigneePicker.vue';
import EvidenceReferenceEditor from './EvidenceReferenceEditor.vue';
import type {
  CancelRiskIssueActionRequest, CompleteRiskIssueActionRequest, CreateRiskIssueActionRequest,
  EvidenceReference, RiskIssueAction, RiskIssueActionType, UpdateRiskIssueActionFieldsRequest,
  VerifyRiskIssueActionRequest
} from '@/types/risk-change.types';

const props = defineProps<{
  projectId: string;
  parent: { type: 'RISK' | 'ISSUE'; id: string; packageId: string | null; riskVersion?: number };
  action: RiskIssueAction | null;
  fullProject: boolean;
  actorId?: string;
  canManage: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  close: [];
  create: [input: CreateRiskIssueActionRequest];
  update: [actionId: string, input: UpdateRiskIssueActionFieldsRequest];
  complete: [actionId: string, input: CompleteRiskIssueActionRequest];
  verify: [actionId: string, input: VerifyRiskIssueActionRequest];
  cancel: [actionId: string, input: CancelRiskIssueActionRequest];
}>();

const error = ref('');
const mode = ref<'EDIT' | 'COMPLETE' | 'VERIFY' | 'CANCEL'>('EDIT');
const evidenceRefs = ref<EvidenceReference[]>([]);
const terminalEvidence = ref<EvidenceReference[]>([]);
const residualEnabled = ref(false);
const form = reactive({
  code: '', actionType: 'RESPONSE' as RiskIssueActionType, title: '', description: '',
  ownerId: '', dueDate: '', status: 'OPEN' as 'OPEN' | 'IN_PROGRESS' | 'BLOCKED',
  statusReason: '', cancelReason: '', residualProbability: 1, residualCost: 1,
  residualSchedule: 1, residualHse: 1, residualRationale: ''
});

const terminal = computed(() => ['VERIFIED', 'CANCELLED'].includes(props.action?.status ?? ''));
const awaitingIndependentDecision = computed(() => props.action?.status === 'DONE');
const independentTerminalActor = computed(() => Boolean(
  props.canManage && props.fullProject && props.action && props.actorId
  && props.actorId !== props.action.ownerId && props.actorId !== props.action.completedBy
));

watch(() => props.action, (action) => {
  error.value = '';
  mode.value = action?.status === 'DONE' ? 'VERIFY' : 'EDIT';
  residualEnabled.value = false;
  evidenceRefs.value = action?.evidenceRefs ? [...action.evidenceRefs] : [];
  terminalEvidence.value = [];
  Object.assign(form, action ? {
    code: action.code, actionType: action.actionType, title: action.title,
    description: action.description ?? '', ownerId: action.ownerId, dueDate: action.dueDate,
    status: ['OPEN', 'IN_PROGRESS', 'BLOCKED'].includes(action.status) ? action.status : 'OPEN',
    statusReason: action.statusReason ?? '', cancelReason: '',
    residualProbability: action.residualAssessment?.probability ?? 1,
    residualCost: action.residualAssessment?.costImpactRating ?? 1,
    residualSchedule: action.residualAssessment?.scheduleImpactRating ?? 1,
    residualHse: action.residualAssessment?.hseImpactRating ?? 1,
    residualRationale: action.residualAssessment?.rationale ?? ''
  } : {
    code: '', actionType: 'RESPONSE', title: '', description: '', ownerId: '',
    dueDate: new Date().toISOString().slice(0, 10), status: 'OPEN', statusReason: '',
    cancelReason: '', residualProbability: 1, residualCost: 1, residualSchedule: 1,
    residualHse: 1, residualRationale: ''
  });
}, { immediate: true });

function submitEdit(): void {
  error.value = '';
  if (![form.code, form.title, form.ownerId, form.dueDate].every((value) => value.trim())) {
    error.value = 'Action bắt buộc code, title, owner và due date.';
    return;
  }
  if (!props.action) {
    const parent = props.parent.type === 'RISK'
      ? { riskId: props.parent.id }
      : { issueId: props.parent.id };
    emit('create', {
      ...parent, code: form.code.trim(), actionType: form.actionType,
      title: form.title.trim(), description: form.description.trim() || undefined,
      ownerId: form.ownerId, dueDate: form.dueDate, evidenceRefs: evidenceRefs.value
    } as CreateRiskIssueActionRequest);
    return;
  }
  emit('update', props.action.id, {
    expectedVersion: props.action.versionNo, title: form.title.trim(),
    description: form.description.trim() || null, ownerId: form.ownerId, dueDate: form.dueDate,
    status: form.status, ...(form.statusReason.trim() ? { statusReason: form.statusReason.trim() } : {}),
    evidenceRefs: evidenceRefs.value
  });
}

function complete(): void {
  if (!props.action || !terminalEvidence.value.length) {
    error.value = 'DONE bắt buộc completion evidence.';
    return;
  }
  if (residualEnabled.value) {
    if (props.parent.type !== 'RISK' || !props.parent.riskVersion) {
      error.value = 'Residual proposal chỉ áp dụng cho Risk Action và cần current Risk version.';
      return;
    }
    emit('complete', props.action.id, {
      expectedVersion: props.action.versionNo, status: 'DONE', evidenceRefs: terminalEvidence.value,
      residualAssessment: {
        probability: form.residualProbability, costImpactRating: form.residualCost,
        scheduleImpactRating: form.residualSchedule, hseImpactRating: form.residualHse,
        ...(form.residualRationale.trim() ? { rationale: form.residualRationale.trim() } : {})
      },
      residualRiskVersion: props.parent.riskVersion
    });
    return;
  }
  emit('complete', props.action.id, {
    expectedVersion: props.action.versionNo, status: 'DONE', evidenceRefs: terminalEvidence.value
  });
}

function verify(): void {
  if (!props.action || !terminalEvidence.value.length) {
    error.value = 'VERIFIED bắt buộc verification evidence.';
    return;
  }
  emit('verify', props.action.id, {
    expectedVersion: props.action.versionNo, status: 'VERIFIED', evidenceRefs: terminalEvidence.value
  });
}

function cancel(): void {
  if (!props.action || !terminalEvidence.value.length || form.cancelReason.trim().length < 3) {
    error.value = 'CANCELLED bắt buộc reason và evidence.';
    return;
  }
  emit('cancel', props.action.id, {
    expectedVersion: props.action.versionNo, status: 'CANCELLED',
    statusReason: form.cancelReason.trim(), evidenceRefs: terminalEvidence.value
  });
}
</script>

<template>
  <section class="risk-change-detail" aria-labelledby="action-panel-title">
    <div class="detail-heading"><div><small>ACTION · DB-112</small><h2 id="action-panel-title">{{ action ? `${action.code} · Action detail` : 'Tạo Action' }}</h2></div><button type="button" class="text-action" @click="emit('close')">Đóng</button></div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <p v-if="terminal" class="immutable-banner">{{ action?.status }} là terminal fact bất biến; không còn PATCH control.</p>
    <p v-else-if="awaitingIndependentDecision && !independentTerminalActor" class="immutable-banner">DONE đang chờ một full-project actor độc lập VERIFY hoặc CANCEL; routine fields đã bị khóa.</p>
    <p v-if="!canManage" class="immutable-banner">Bạn chỉ có quyền đọc Action trong scope hiện tại.</p>
    <div v-if="canManage && action && !terminal && (action.status !== 'DONE' || independentTerminalActor)" class="segmented-control action-mode" role="tablist" aria-label="Action command">
      <button v-if="action.status !== 'DONE'" type="button" :aria-pressed="mode === 'EDIT'" @click="mode = 'EDIT'">Routine update</button>
      <button v-if="action.status !== 'DONE'" type="button" :aria-pressed="mode === 'COMPLETE'" @click="mode = 'COMPLETE'">Complete</button>
      <button v-if="action.status === 'DONE' && independentTerminalActor" type="button" :aria-pressed="mode === 'VERIFY'" @click="mode = 'VERIFY'">Verify</button>
      <button v-if="independentTerminalActor" type="button" :aria-pressed="mode === 'CANCEL'" @click="mode = 'CANCEL'">Cancel</button>
    </div>
    <form v-if="canManage && !terminal && !awaitingIndependentDecision && mode === 'EDIT'" class="risk-change-form" @submit.prevent="submitEdit">
      <label>Code<input v-model.trim="form.code" required :disabled="Boolean(action)" /></label>
      <label>Action type<select v-model="form.actionType" :disabled="Boolean(action)"><option v-for="item in ['RESPONSE','CONTINGENCY','CORRECTIVE','DECISION']" :key="item" :value="item">{{ item }}</option></select></label>
      <label class="form-wide">Title<input v-model.trim="form.title" required /></label>
      <label class="form-wide">Description<textarea v-model.trim="form.description" rows="2" /></label>
      <label>Due date<input v-model="form.dueDate" type="date" required /></label>
      <label v-if="action">Status<select v-model="form.status"><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="BLOCKED">BLOCKED</option></select></label>
      <label v-if="action" class="form-wide">Status reason<textarea v-model.trim="form.statusReason" rows="2" /></label>
      <label class="form-wide">Owner<AssigneePicker v-model="form.ownerId" :project-id="projectId" :package-id="parent.packageId || undefined" required-permission="riskChange.manage" /></label>
      <EvidenceReferenceEditor v-model="evidenceRefs" class="form-wide" />
      <div class="form-actions form-wide"><el-button native-type="button" @click="emit('close')">Hủy</el-button><el-button native-type="submit" type="primary" :loading="busy">{{ action ? 'Lưu Action' : 'Tạo Action' }}</el-button></div>
    </form>
    <form v-else-if="canManage && action && !awaitingIndependentDecision && mode === 'COMPLETE'" class="risk-change-form" @submit.prevent="complete">
      <p class="form-wide">DONE lưu completion facts; không tự thay đổi authoritative Risk score.</p>
      <EvidenceReferenceEditor v-model="terminalEvidence" class="form-wide" required />
      <fieldset v-if="parent.type === 'RISK'" class="form-wide residual-panel"><legend><label><input v-model="residualEnabled" type="checkbox" /> Kèm versioned residual proposal</label></legend><div v-if="residualEnabled" class="risk-change-form"><label>Probability<select v-model.number="form.residualProbability"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label><label>Cost<select v-model.number="form.residualCost"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label><label>Schedule<select v-model.number="form.residualSchedule"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label><label>HSE<select v-model.number="form.residualHse"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label><label class="form-wide">Rationale<textarea v-model.trim="form.residualRationale" rows="2" /></label></div></fieldset>
      <div class="form-actions form-wide"><el-button native-type="submit" type="primary" :loading="busy">Complete Action</el-button></div>
    </form>
    <form v-else-if="canManage && action && independentTerminalActor && mode === 'VERIFY'" class="risk-change-form desktop-decision" @submit.prevent="verify"><p class="form-wide">Independent VERIFY chỉ gửi version, status và evidence; stored proposal mới có thể được promote.</p><EvidenceReferenceEditor v-model="terminalEvidence" class="form-wide" required /><div class="form-actions form-wide"><el-button native-type="submit" type="primary" :loading="busy">Verify độc lập</el-button></div></form>
    <form v-else-if="canManage && action && independentTerminalActor && mode === 'CANCEL'" class="risk-change-form desktop-decision" @submit.prevent="cancel"><label class="form-wide">Cancellation reason<textarea v-model.trim="form.cancelReason" required minlength="3" rows="2" /></label><EvidenceReferenceEditor v-model="terminalEvidence" class="form-wide" required /><div class="form-actions form-wide"><el-button native-type="submit" type="danger" plain :loading="busy">Cancel độc lập</el-button></div></form>
    <EvidenceReferenceEditor v-if="action && (awaitingIndependentDecision || terminal)" :model-value="action.evidenceRefs" disabled />
    <div v-if="action" class="fact-grid"><div><span>Owner</span><strong>{{ action.ownerId }}</strong></div><div><span>Completed by</span><strong>{{ action.completedBy ?? '—' }}</strong></div><div><span>Verified by</span><strong>{{ action.verifiedBy ?? '—' }}</strong></div><div><span>Residual proposal version</span><strong>{{ action.residualRiskVersion ?? '—' }}</strong></div></div>
  </section>
</template>
