<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import AssigneePicker from './AssigneePicker.vue';
import EvidenceReferenceEditor from './EvidenceReferenceEditor.vue';
import type {
  CreateIssueRequest, EvidenceReference, Issue, IssueSeverity, IssueStatus, UpdateIssueRequest
} from '@/types/risk-change.types';

const props = defineProps<{
  projectId: string;
  issue: Issue | null;
  packageOptions: Array<{ id: string; code: string; name: string }>;
  fullProject: boolean;
  editable: boolean;
  closurePermission: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  close: [];
  create: [input: CreateIssueRequest];
  update: [issueId: string, input: UpdateIssueRequest];
}>();
const error = ref('');
const evidenceRefs = ref<EvidenceReference[]>([]);
const resolutionEvidenceRefs = ref<EvidenceReference[]>([]);
const closureEvidenceRefs = ref<EvidenceReference[]>([]);
const form = reactive({
  packageId: '', code: '', title: '', description: '', occurredAt: '', rootCause: '',
  actualImpact: '', severity: 'MEDIUM' as IssueSeverity, decisionSummary: '', ownerId: '',
  targetDate: '', sourceRiskId: '', markSourceRiskOccurred: false,
  status: 'REPORTED' as IssueStatus, resolutionSummary: '', closureReason: ''
});
const title = computed(() => props.issue ? `${props.issue.code} · Issue detail` : 'Báo cáo Issue');
const canRequestClosure = computed(() => props.closurePermission && props.issue?.status === 'RESOLVED');

watch(() => props.issue, (issue) => {
  error.value = '';
  evidenceRefs.value = issue?.evidenceRefs ? [...issue.evidenceRefs] : [];
  resolutionEvidenceRefs.value = issue?.resolutionEvidenceRefs ? [...issue.resolutionEvidenceRefs] : [];
  closureEvidenceRefs.value = [];
  Object.assign(form, issue ? {
    packageId: issue.packageId ?? '', code: issue.code, title: issue.title,
    description: issue.description, occurredAt: issue.occurredAt.slice(0, 16), rootCause: issue.rootCause,
    actualImpact: issue.actualImpact, severity: issue.severity,
    decisionSummary: issue.decisionSummary ?? '', ownerId: issue.ownerId,
    targetDate: issue.targetDate, sourceRiskId: issue.sourceRiskId ?? '',
    markSourceRiskOccurred: false, status: issue.status,
    resolutionSummary: issue.resolutionSummary ?? '', closureReason: ''
  } : {
    packageId: '', code: '', title: '', description: '',
    occurredAt: new Date().toISOString().slice(0, 16), rootCause: '', actualImpact: '',
    severity: 'MEDIUM', decisionSummary: '', ownerId: '',
    targetDate: new Date().toISOString().slice(0, 10), sourceRiskId: '',
    markSourceRiskOccurred: false, status: 'REPORTED', resolutionSummary: '', closureReason: ''
  });
  if (!issue && !props.fullProject && props.packageOptions.length === 1) {
    form.packageId = props.packageOptions[0].id;
  }
}, { immediate: true });

function validate(): boolean {
  error.value = '';
  if (![form.code, form.title, form.description, form.occurredAt, form.rootCause, form.actualImpact, form.ownerId, form.targetDate].every((item) => String(item).trim())) {
    error.value = 'Issue bắt buộc code, title, description, occurred time, root cause, actual impact, owner và target date.';
    return false;
  }
  if (form.markSourceRiskOccurred && !form.sourceRiskId.trim()) {
    error.value = 'Mark source Risk occurred cần stable Risk ID.';
    return false;
  }
  if (form.status === 'RESOLVED' && (!form.resolutionSummary.trim() || !resolutionEvidenceRefs.value.length)) {
    error.value = 'RESOLVED bắt buộc resolution summary và evidence.';
    return false;
  }
  if (form.status === 'CLOSURE_PENDING' && (!form.closureReason.trim() || !closureEvidenceRefs.value.length)) {
    error.value = 'Closure request bắt buộc reason và evidence.';
    return false;
  }
  if (form.status === 'REOPENED' && !evidenceRefs.value.length) {
    error.value = 'Reopen Issue bắt buộc evidence.';
    return false;
  }
  return true;
}

function submit(): void {
  if (!validate()) return;
  const common = {
    title: form.title.trim(), description: form.description.trim(),
    occurredAt: new Date(form.occurredAt).toISOString(), rootCause: form.rootCause.trim(),
    actualImpact: form.actualImpact.trim(), severity: form.severity, ownerId: form.ownerId,
    targetDate: form.targetDate, evidenceRefs: evidenceRefs.value
  };
  if (!props.issue) {
    emit('create', {
      ...common, code: form.code.trim(), ...(form.packageId ? { packageId: form.packageId } : {}),
      ...(form.sourceRiskId ? { sourceRiskId: form.sourceRiskId } : {}),
      ...(form.markSourceRiskOccurred ? { markSourceRiskOccurred: true } : {})
    });
    return;
  }
  if (form.status === 'CLOSURE_PENDING') {
    const closureInput: UpdateIssueRequest = {
      expectedVersion: props.issue.versionNo,
      status: 'CLOSURE_PENDING',
      closureReason: form.closureReason.trim(),
      closureEvidenceRefs: closureEvidenceRefs.value
    };
    emit('update', props.issue.id, closureInput);
    return;
  }
  emit('update', props.issue.id, {
    ...common, expectedVersion: props.issue.versionNo,
    decisionSummary: form.decisionSummary.trim() || null,
    ...(form.status !== props.issue.status ? { status: form.status } : {}),
    ...(form.status === 'RESOLVED' ? {
      resolutionSummary: form.resolutionSummary.trim(), resolutionEvidenceRefs: resolutionEvidenceRefs.value
    } : {})
  });
}
</script>

<template>
  <section class="risk-change-detail" aria-labelledby="issue-form-title">
    <div class="detail-heading"><div><small>ISSUE · DB-066</small><h2 id="issue-form-title">{{ title }}</h2></div><button type="button" class="text-action" @click="emit('close')">Đóng</button></div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <form @submit.prevent="submit">
      <fieldset class="risk-change-form form-fieldset" :disabled="!editable">
        <label>Package<select v-model="form.packageId" :disabled="Boolean(issue)"><option value="" :disabled="!fullProject">Project-level</option><option v-for="item in packageOptions" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
        <label>Code<input v-model.trim="form.code" required :disabled="Boolean(issue)" /></label>
        <label class="form-wide">Title<input v-model.trim="form.title" required maxlength="250" /></label>
        <label class="form-wide">Description<textarea v-model.trim="form.description" required rows="2" /></label>
        <label>Occurred at<input v-model="form.occurredAt" type="datetime-local" required /></label>
        <label>Severity<select v-model="form.severity"><option v-for="item in ['LOW','MEDIUM','HIGH','CRITICAL']" :key="item" :value="item">{{ item }}</option></select></label>
        <label class="form-wide">Root cause<textarea v-model.trim="form.rootCause" required rows="2" /></label>
        <label class="form-wide">Actual impact<textarea v-model.trim="form.actualImpact" required rows="2" /></label>
        <label>Target date<input v-model="form.targetDate" type="date" required /></label>
        <label>Status<select v-model="form.status" :disabled="!issue"><option v-for="item in ['REPORTED','TRIAGED','IN_PROGRESS','RESOLVED','CLOSURE_PENDING','REOPENED']" :key="item" :value="item" :disabled="item === 'CLOSURE_PENDING' && !canRequestClosure">{{ item }}</option></select></label>
        <label class="form-wide">Owner<AssigneePicker v-model="form.ownerId" :project-id="projectId" :package-id="form.packageId || undefined" required-permission="riskChange.manage" /></label>
        <label v-if="!issue" class="form-wide">Source Risk ID<input v-model.trim="form.sourceRiskId" placeholder="Optional same-scope Risk UUID" /></label>
        <label v-if="!issue && form.sourceRiskId" class="check-label"><input v-model="form.markSourceRiskOccurred" type="checkbox" /> Mark source Risk OCCURRED atomically</label>
        <label v-if="issue" class="form-wide">Decision summary<textarea v-model.trim="form.decisionSummary" rows="2" /></label>
        <EvidenceReferenceEditor v-model="evidenceRefs" class="form-wide" :required="form.status === 'REOPENED'" />
        <template v-if="issue && form.status === 'RESOLVED'">
          <label class="form-wide">Resolution summary<textarea v-model.trim="form.resolutionSummary" required rows="2" /></label>
          <EvidenceReferenceEditor v-model="resolutionEvidenceRefs" class="form-wide" required />
        </template>
        <template v-if="issue && form.status === 'CLOSURE_PENDING'">
          <label class="form-wide">Closure reason<textarea v-model.trim="form.closureReason" required rows="2" /></label>
          <EvidenceReferenceEditor v-model="closureEvidenceRefs" class="form-wide" required />
        </template>
        <div class="form-actions form-wide"><el-button native-type="button" @click="emit('close')">Hủy</el-button><el-button v-if="editable" native-type="submit" type="primary" :loading="busy">{{ issue ? 'Lưu Issue' : 'Tạo Issue' }}</el-button></div>
      </fieldset>
    </form>
  </section>
</template>
