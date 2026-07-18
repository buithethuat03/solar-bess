<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import AssigneePicker from './AssigneePicker.vue';
import EvidenceReferenceEditor from './EvidenceReferenceEditor.vue';
import type {
  CreateRiskRequest, EvidenceReference, Risk, RiskResponseStrategy, RiskStatus, UpdateRiskRequest
} from '@/types/risk-change.types';

const props = defineProps<{
  projectId: string;
  risk: Risk | null;
  packageOptions: Array<{ id: string; code: string; name: string }>;
  fullProject: boolean;
  editable: boolean;
  closurePermission: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  close: [];
  create: [input: CreateRiskRequest];
  update: [riskId: string, input: UpdateRiskRequest];
}>();

const error = ref('');
const residualEnabled = ref(false);
const evidenceRefs = ref<EvidenceReference[]>([]);
const closureEvidenceRefs = ref<EvidenceReference[]>([]);
const form = reactive({
  packageId: '', code: '', category: '', cause: '', event: '', impact: '',
  probability: 1, costImpactRating: 1, scheduleImpactRating: 1, hseImpactRating: 1,
  ownerId: '', reviewDate: '', responseStrategy: '' as RiskResponseStrategy | '',
  responsePlan: '', trigger: '', contingencyPlan: '', status: 'IDENTIFIED' as RiskStatus,
  occurredIssueId: '', closureReason: '', residualProbability: 1,
  residualCostImpactRating: 1, residualScheduleImpactRating: 1,
  residualHseImpactRating: 1, residualRationale: '', residualReason: ''
});

const title = computed(() => props.risk ? `${props.risk.code} · Risk detail` : 'Tạo Risk');
const canRequestClosure = computed(() => props.closurePermission && props.risk?.status === 'MONITORING');

watch(() => props.risk, (risk) => {
  error.value = '';
  residualEnabled.value = false;
  evidenceRefs.value = risk?.evidenceRefs ? [...risk.evidenceRefs] : [];
  closureEvidenceRefs.value = [];
  Object.assign(form, risk ? {
    packageId: risk.packageId ?? '', code: risk.code, category: risk.category,
    cause: risk.cause, event: risk.event, impact: risk.impact,
    probability: risk.probability, costImpactRating: risk.costImpactRating,
    scheduleImpactRating: risk.scheduleImpactRating, hseImpactRating: risk.hseImpactRating,
    ownerId: risk.ownerId, reviewDate: risk.reviewDate,
    responseStrategy: risk.responseStrategy ?? '', responsePlan: risk.responsePlan ?? '',
    trigger: risk.trigger ?? '', contingencyPlan: risk.contingencyPlan ?? '',
    status: risk.status, occurredIssueId: risk.occurredIssueId ?? '', closureReason: '',
    residualProbability: risk.residualProbability ?? risk.probability,
    residualCostImpactRating: risk.residualCostImpactRating ?? risk.costImpactRating,
    residualScheduleImpactRating: risk.residualScheduleImpactRating ?? risk.scheduleImpactRating,
    residualHseImpactRating: risk.residualHseImpactRating ?? risk.hseImpactRating,
    residualRationale: '', residualReason: ''
  } : {
    packageId: '', code: '', category: '', cause: '', event: '', impact: '',
    probability: 1, costImpactRating: 1, scheduleImpactRating: 1, hseImpactRating: 1,
    ownerId: '', reviewDate: new Date().toISOString().slice(0, 10), responseStrategy: '',
    responsePlan: '', trigger: '', contingencyPlan: '', status: 'IDENTIFIED',
    occurredIssueId: '', closureReason: '', residualProbability: 1,
    residualCostImpactRating: 1, residualScheduleImpactRating: 1,
    residualHseImpactRating: 1, residualRationale: '', residualReason: ''
  });
  if (!risk && !props.fullProject && props.packageOptions.length === 1) {
    form.packageId = props.packageOptions[0].id;
  }
}, { immediate: true });

function validate(): boolean {
  error.value = '';
  if (![form.code, form.category, form.cause, form.event, form.impact, form.ownerId, form.reviewDate].every((item) => String(item).trim())) {
    error.value = 'Vui lòng nhập đủ code, category, cause-event-impact, owner và review date.';
    return false;
  }
  if (form.status === 'OCCURRED' && !form.occurredIssueId.trim()) {
    error.value = 'Risk OCCURRED phải liên kết một Issue cùng scope.';
    return false;
  }
  if (form.status === 'CLOSURE_PENDING' && (!form.closureReason.trim() || !closureEvidenceRefs.value.length)) {
    error.value = 'Closure request bắt buộc reason và evidence.';
    return false;
  }
  if (residualEnabled.value && (!form.residualReason.trim() || !evidenceRefs.value.length)) {
    error.value = 'Authoritative residual reassessment bắt buộc reason và evidence.';
    return false;
  }
  return true;
}

function submit(): void {
  if (!validate()) return;
  const common = {
    category: form.category.trim(), cause: form.cause.trim(), event: form.event.trim(),
    impact: form.impact.trim(), probability: form.probability,
    costImpactRating: form.costImpactRating, scheduleImpactRating: form.scheduleImpactRating,
    hseImpactRating: form.hseImpactRating, ownerId: form.ownerId, reviewDate: form.reviewDate,
    responseStrategy: form.responseStrategy || undefined, responsePlan: form.responsePlan || undefined,
    trigger: form.trigger || undefined, contingencyPlan: form.contingencyPlan || undefined,
    evidenceRefs: evidenceRefs.value
  };
  if (!props.risk) {
    emit('create', { ...common, ...(form.packageId ? { packageId: form.packageId } : {}), code: form.code.trim() });
    return;
  }
  if (form.status === 'CLOSURE_PENDING') {
    const closureInput: UpdateRiskRequest = {
      expectedVersion: props.risk.versionNo,
      status: 'CLOSURE_PENDING',
      closureReason: form.closureReason.trim(),
      closureEvidenceRefs: closureEvidenceRefs.value
    };
    emit('update', props.risk.id, closureInput);
    return;
  }
  const input: UpdateRiskRequest = {
    ...common, expectedVersion: props.risk.versionNo,
    ...(form.status !== props.risk.status ? { status: form.status } : {}),
    ...(form.status === 'OCCURRED' ? { occurredIssueId: form.occurredIssueId } : {})
  };
  if (residualEnabled.value) {
    input.residualAssessment = {
      probability: form.residualProbability,
      costImpactRating: form.residualCostImpactRating,
      scheduleImpactRating: form.residualScheduleImpactRating,
      hseImpactRating: form.residualHseImpactRating,
      ...(form.residualRationale.trim() ? { rationale: form.residualRationale.trim() } : {})
    };
    input.residualAssessmentReason = form.residualReason.trim();
  }
  emit('update', props.risk.id, input);
}
</script>

<template>
  <section class="risk-change-detail" aria-labelledby="risk-form-title">
    <div class="detail-heading"><div><small>RISK · DB-065</small><h2 id="risk-form-title">{{ title }}</h2></div><button type="button" class="text-action" @click="emit('close')">Đóng</button></div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <form @submit.prevent="submit">
      <fieldset class="risk-change-form form-fieldset" :disabled="!editable">
        <label>Package<select v-model="form.packageId" :disabled="Boolean(risk)"><option value="" :disabled="!fullProject">Project-level</option><option v-for="item in packageOptions" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
        <label>Code<input v-model.trim="form.code" required :disabled="Boolean(risk)" /></label>
        <label>Category<input v-model.trim="form.category" required maxlength="100" /></label>
        <label class="form-wide">Cause<textarea v-model.trim="form.cause" required rows="2" /></label>
        <label class="form-wide">Event<textarea v-model.trim="form.event" required rows="2" /></label>
        <label class="form-wide">Impact<textarea v-model.trim="form.impact" required rows="2" /></label>
        <label>Probability<select v-model.number="form.probability"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Cost impact<select v-model.number="form.costImpactRating"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Schedule impact<select v-model.number="form.scheduleImpactRating"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
        <label>HSE impact<select v-model.number="form.hseImpactRating"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
        <label>Review date<input v-model="form.reviewDate" type="date" required /></label>
        <label>Status<select v-model="form.status" :disabled="!risk"><option v-for="item in ['IDENTIFIED','ASSESSED','TREATING','MONITORING','CLOSURE_PENDING','OCCURRED']" :key="item" :value="item" :disabled="item === 'CLOSURE_PENDING' && !canRequestClosure">{{ item }}</option></select></label>
        <label class="form-wide">Owner<AssigneePicker v-model="form.ownerId" :project-id="projectId" :package-id="form.packageId || undefined" required-permission="riskChange.manage" /></label>
        <label>Response strategy<select v-model="form.responseStrategy"><option value="">Chưa chọn</option><option v-for="item in ['AVOID','MITIGATE','TRANSFER','ACCEPT']" :key="item" :value="item">{{ item }}</option></select></label>
        <label class="form-wide">Response plan<textarea v-model.trim="form.responsePlan" rows="2" /></label>
        <label class="form-wide">Trigger<textarea v-model.trim="form.trigger" rows="2" /></label>
        <label class="form-wide">Contingency plan<textarea v-model.trim="form.contingencyPlan" rows="2" /></label>
        <label v-if="risk && form.status === 'OCCURRED'" class="form-wide">Occurred Issue ID<input v-model.trim="form.occurredIssueId" required /></label>
        <EvidenceReferenceEditor v-model="evidenceRefs" class="form-wide" />
        <template v-if="risk && form.status === 'CLOSURE_PENDING'">
          <label class="form-wide">Closure reason<textarea v-model.trim="form.closureReason" required rows="2" /></label>
          <EvidenceReferenceEditor v-model="closureEvidenceRefs" class="form-wide" required />
        </template>
        <fieldset v-if="risk && fullProject" class="form-wide residual-panel">
          <legend><label><input v-model="residualEnabled" type="checkbox" /> Authoritative residual reassessment</label></legend>
          <div v-if="residualEnabled" class="risk-change-form">
            <label>Probability<select v-model.number="form.residualProbability"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
            <label>Cost<select v-model.number="form.residualCostImpactRating"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
            <label>Schedule<select v-model.number="form.residualScheduleImpactRating"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
            <label>HSE<select v-model.number="form.residualHseImpactRating"><option v-for="value in 5" :key="value" :value="value">{{ value }}</option></select></label>
            <label class="form-wide">Rationale<textarea v-model.trim="form.residualRationale" rows="2" /></label>
            <label class="form-wide">Reason<textarea v-model.trim="form.residualReason" required rows="2" /></label>
          </div>
        </fieldset>
        <div v-if="risk" class="score-facts form-wide"><span>Inherent <strong>{{ risk.inherentExposure }} · {{ risk.inherentLevel }}</strong></span><span>Residual <strong>{{ risk.residualExposure ?? 'Chưa đánh giá' }} · {{ risk.residualLevel ?? 'N/A' }}</strong></span><span>{{ risk.scoringVersion }} · {{ risk.thresholdVersion }}</span></div>
        <div class="form-actions form-wide"><el-button native-type="button" @click="emit('close')">Hủy</el-button><el-button v-if="editable" native-type="submit" type="primary" :loading="busy">{{ risk ? 'Lưu Risk' : 'Tạo Risk' }}</el-button></div>
      </fieldset>
    </form>
  </section>
</template>
