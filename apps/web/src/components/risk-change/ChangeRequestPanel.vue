<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import AssigneePicker from './AssigneePicker.vue';
import ChangeImpactEditor from './ChangeImpactEditor.vue';
import EvidenceReferenceEditor from './EvidenceReferenceEditor.vue';
import type { ScheduleBaseline } from '@/types/schedule.types';
import type {
  ChangeDecisionRequest, ChangeImpactDraft, ChangeRequest, ChangeSource,
  CreateChangeRequestRequest, EvidenceReference, UpdateChangeRequestRequest
} from '@/types/risk-change.types';

const props = defineProps<{
  projectId: string;
  change: ChangeRequest | null;
  sourceSeed?: ChangeSource;
  packageOptions: Array<{ id: string; code: string; name: string }>;
  baselines: ScheduleBaseline[];
  fullProject: boolean;
  canRebaseline: boolean;
  actorId?: string;
  canManage: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  close: [];
  create: [input: CreateChangeRequestRequest];
  update: [changeId: string, input: UpdateChangeRequestRequest];
  submit: [changeId: string, expectedVersion: number, comment: string];
  decide: [changeId: string, input: ChangeDecisionRequest];
  rebaseline: [changeId: string];
  loadBaselines: [changeId: string];
}>();
const error = ref('');
const evidenceRefs = ref<EvidenceReference[]>([]);
const impact = ref<ChangeImpactDraft>({});
const mode = ref<'EDIT' | 'SUBMIT' | 'DECIDE' | 'TRACE'>('EDIT');
const form = reactive({
  packageId: '', code: '', title: '', reason: '', options: '', recommendation: '',
  ownerId: '', sourceType: 'MANUAL' as ChangeSource['type'], sourceId: '',
  sourceBaselineId: '', status: 'DRAFT' as 'DRAFT' | 'ASSESSED',
  submitComment: '', decision: 'APPROVE' as ChangeDecisionRequest['decision'], decisionComment: ''
});

const immutable = computed(() => Boolean(props.change && !['DRAFT', 'ASSESSED', 'RETURNED'].includes(props.change.status)));
const independentApprover = computed(() => Boolean(
  props.change && props.actorId
  && props.actorId !== props.change.requesterId && props.actorId !== props.change.submittedBy
));

watch(() => [props.change, props.sourceSeed] as const, ([change, sourceSeed]) => {
  error.value = '';
  mode.value = change && (immutable.value || !props.canManage) ? 'TRACE' : 'EDIT';
  evidenceRefs.value = change?.evidenceRefs ? [...change.evidenceRefs] : [];
  impact.value = change?.impactDraft ? { ...change.impactDraft } : {};
  const source = change?.source ?? sourceSeed ?? { type: 'MANUAL' as const };
  Object.assign(form, change ? {
    packageId: change.packageId ?? '', code: change.code, title: change.title, reason: change.reason,
    options: change.options.join('\n'), recommendation: change.recommendation ?? '', ownerId: change.ownerId,
    sourceType: source.type,
    sourceId: source.type === 'RISK' ? source.riskId : source.type === 'ISSUE' ? source.issueId : '',
    sourceBaselineId: change.sourceBaselineId ?? '',
    status: ['ASSESSED', 'RETURNED'].includes(change.status) ? 'ASSESSED' : 'DRAFT',
    submitComment: '',
    decision: 'APPROVE', decisionComment: ''
  } : {
    packageId: '', code: '', title: '', reason: '', options: '', recommendation: '',
    ownerId: '', sourceType: source.type,
    sourceId: source.type === 'RISK' ? source.riskId : source.type === 'ISSUE' ? source.issueId : '',
    sourceBaselineId: '', status: 'DRAFT', submitComment: '', decision: 'APPROVE', decisionComment: ''
  });
}, { immediate: true });

function source(): ChangeSource {
  if (form.sourceType === 'RISK') return { type: 'RISK', riskId: form.sourceId };
  if (form.sourceType === 'ISSUE') return { type: 'ISSUE', issueId: form.sourceId };
  return { type: 'MANUAL' };
}

function validateEdit(): boolean {
  error.value = '';
  if (![form.code, form.title, form.reason, form.ownerId].every((value) => value.trim())) {
    error.value = 'Change bắt buộc code, title, reason và owner.';
    return false;
  }
  if (form.sourceType !== 'MANUAL' && !form.sourceId.trim()) {
    error.value = 'Source Risk/Issue cần stable ID.';
    return false;
  }
  return true;
}

function save(): void {
  if (!validateEdit()) return;
  const common = {
    title: form.title.trim(), reason: form.reason.trim(),
    options: form.options.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    recommendation: form.recommendation.trim() || undefined, ownerId: form.ownerId,
    ...(form.sourceBaselineId ? { sourceBaselineId: form.sourceBaselineId } : {}),
    impact: impact.value, evidenceRefs: evidenceRefs.value
  };
  if (!props.change) {
    emit('create', {
      ...common, ...(form.packageId ? { packageId: form.packageId } : {}),
      code: form.code.trim(), source: source()
    });
    return;
  }
  emit('update', props.change.id, {
    ...common, expectedVersion: props.change.versionNo, recommendation: form.recommendation.trim() || null,
    status: form.status
  });
}

function submitForDecision(): void {
  if (!props.change) return;
  emit('submit', props.change.id, props.change.versionNo, form.submitComment.trim());
}

function decide(): void {
  if (!props.change || form.decisionComment.trim().length < 3) {
    error.value = 'Mọi Change decision bắt buộc comment ít nhất 3 ký tự.';
    return;
  }
  emit('decide', props.change.id, {
    decision: form.decision, expectedVersion: props.change.versionNo,
    comment: form.decisionComment.trim()
  });
}
</script>

<template>
  <section class="risk-change-detail" aria-labelledby="change-panel-title">
    <div class="detail-heading"><div><small>CHANGE CONTROL · DB-067</small><h2 id="change-panel-title">{{ change ? `${change.code} · Change detail` : 'Tạo Change Request' }}</h2></div><button type="button" class="text-action" @click="emit('close')">Đóng</button></div>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="change" class="segmented-control action-mode" role="tablist" aria-label="Change command">
      <button type="button" :aria-pressed="mode === 'TRACE'" @click="mode = 'TRACE'; emit('loadBaselines', change.id)">Detail &amp; trace</button>
      <button v-if="canManage && !immutable" type="button" :aria-pressed="mode === 'EDIT'" @click="mode = 'EDIT'">Assess</button>
      <button v-if="canSubmit && change.status === 'ASSESSED'" class="desktop-decision" type="button" :aria-pressed="mode === 'SUBMIT'" @click="mode = 'SUBMIT'">Submit</button>
      <button v-if="canApprove && change.status === 'SUBMITTED' && independentApprover" class="desktop-decision" type="button" :aria-pressed="mode === 'DECIDE'" @click="mode = 'DECIDE'">Decision</button>
    </div>
    <form v-if="!change || mode === 'EDIT'" class="risk-change-form" @submit.prevent="save">
      <label>Package<select v-model="form.packageId" :disabled="Boolean(change)"><option value="" :disabled="!fullProject">Project-level</option><option v-for="item in packageOptions" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <label>Code<input v-model.trim="form.code" required :disabled="Boolean(change)" /></label>
      <label class="form-wide">Title<input v-model.trim="form.title" required /></label>
      <label class="form-wide">Reason<textarea v-model.trim="form.reason" required rows="2" /></label>
      <label>Source<select v-model="form.sourceType" :disabled="Boolean(change) || Boolean(sourceSeed)"><option value="MANUAL">MANUAL</option><option value="RISK">RISK</option><option value="ISSUE">ISSUE</option></select></label>
      <label v-if="form.sourceType !== 'MANUAL'">Source ID<input v-model.trim="form.sourceId" required :disabled="Boolean(change) || Boolean(sourceSeed)" /></label>
      <label class="form-wide">Owner<AssigneePicker v-model="form.ownerId" :project-id="projectId" :package-id="form.packageId || undefined" required-permission="riskChange.manage" /></label>
      <label class="form-wide">Options, mỗi dòng một phương án<textarea v-model="form.options" rows="3" /></label>
      <label class="form-wide">Recommendation<textarea v-model.trim="form.recommendation" rows="3" /></label>
      <label>Source baseline ID<input v-model.trim="form.sourceBaselineId" placeholder="Bắt buộc nếu requires rebaseline" /></label>
      <label v-if="change">Draft state<select v-model="form.status"><option value="DRAFT">DRAFT</option><option value="ASSESSED">ASSESSED</option></select></label>
      <ChangeImpactEditor v-model="impact" class="form-wide" />
      <EvidenceReferenceEditor v-model="evidenceRefs" class="form-wide" />
      <div class="form-actions form-wide"><el-button native-type="button" @click="emit('close')">Hủy</el-button><el-button native-type="submit" type="primary" :loading="busy">{{ change ? 'Lưu assessment' : 'Tạo Change draft' }}</el-button></div>
    </form>
    <form v-else-if="change && mode === 'SUBMIT'" class="risk-change-form desktop-decision" @submit.prevent="submitForDecision"><p class="form-wide">Server chỉ submit khi recommendation và cả sáu impact dimension đã đầy đủ; snapshot/hash sẽ bị đóng băng.</p><label class="form-wide">Submit comment<textarea v-model.trim="form.submitComment" rows="2" maxlength="2000" /></label><div class="form-actions form-wide"><el-button native-type="submit" type="primary" :loading="busy">Submit Change</el-button></div></form>
    <form v-else-if="change && mode === 'DECIDE'" class="risk-change-form desktop-decision" @submit.prevent="decide"><label>Decision<select v-model="form.decision"><option value="APPROVE">APPROVE</option><option value="RETURN">RETURN</option><option value="REJECT">REJECT</option></select></label><label class="form-wide">Decision comment<textarea v-model.trim="form.decisionComment" required minlength="3" rows="3" /></label><div class="form-actions form-wide"><el-button native-type="submit" type="primary" :loading="busy">Ghi quyết định độc lập</el-button></div></form>
    <section v-else-if="change" class="change-trace">
      <div class="fact-grid"><div><span>Status</span><strong>{{ change.status }}</strong></div><div><span>Requester / submitter</span><strong>{{ change.requesterId }} / {{ change.submittedBy ?? '—' }}</strong></div><div><span>Decision version</span><strong>{{ change.decisionVersion ?? '—' }}</strong></div><div><span>Schedule impact approved</span><strong>{{ change.scheduleImpactApproved ? 'YES' : 'NO' }}</strong></div><div><span>Impact hash</span><code>{{ change.impactSnapshotHash ?? '—' }}</code></div><div><span>Approval hash</span><code>{{ change.approvalSnapshotHash ?? '—' }}</code></div></div>
      <p><strong>Source snapshot:</strong> {{ change.source.type }} · {{ change.sourceEvidenceSnapshot.length }} evidence</p>
      <div v-if="baselines.length" class="table-shell"><table class="data-table"><thead><tr><th>Baseline</th><th>Type</th><th>Status</th><th>Data date</th></tr></thead><tbody><tr v-for="item in baselines" :key="item.id"><td>#{{ item.baselineNumber }}</td><td>{{ item.baselineType }}</td><td>{{ item.status }}</td><td>{{ item.dataDate }}</td></tr></tbody></table></div>
      <p v-else class="muted-inline">Chưa có baseline reverse trace cho Change này.</p>
      <el-button v-if="change.status === 'APPROVED' && change.scheduleImpactApproved && canRebaseline" class="desktop-decision" type="primary" @click="emit('rebaseline', change.id)">Mở Schedule để rebaseline</el-button>
      <p v-if="immutable" class="immutable-banner">Submitted/approved snapshot và decision facts là bất biến.</p>
    </section>
  </section>
</template>
