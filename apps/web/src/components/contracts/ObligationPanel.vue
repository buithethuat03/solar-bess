<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  OBLIGATION_DECISION_LABEL, OBLIGATION_DECISION_TYPES, OBLIGATION_STATUS_LABEL,
  TRIGGER_TYPE_PATTERN
} from '@/constants/contracts';
import type {
  ContractAppendixView, ContractPartyView, CreateObligationRequest, FulfillObligationRequest,
  ObligationDecisionType, ObligationRegisterRow
} from '@/types/contract.types';

const props = defineProps<{
  obligations: ObligationRegisterRow[];
  parties: ContractPartyView[];
  appendices: ContractAppendixView[];
  nextCursor: string | null;
  busy: boolean;
  /** Để cảnh báo SoD trước; server vẫn là nơi từ chối cuối cùng (SOD_CONFLICT). */
  currentUserId: string | null;
  permissions: { create: boolean; fulfill: boolean };
}>();
const emit = defineEmits<{
  more: [];
  create: [input: CreateObligationRequest];
  fulfill: [obligationId: string, input: FulfillObligationRequest];
}>();

const error = ref('');
const showCreate = ref(false);
const deciding = ref<ObligationRegisterRow | null>(null);

const createForm = reactive({
  clauseRef: '', title: '', obligorPartyId: '', beneficiaryPartyId: '', ownerUserId: '',
  triggerType: 'MILESTONE', triggerReference: '', dueDate: '', consequence: '', appendixId: '',
  evidenceText: ''
});
const decisionForm = reactive({
  decisionType: 'FULFILLED' as ObligationDecisionType, reason: '', evidenceText: ''
});

const partyName = computed(() => new Map(
  props.parties.map((party) => [party.id, party.legalNameSnapshot])
));

// A refreshed page must not keep a decision form open over a row that may no longer be OPEN.
watch(() => props.obligations, () => { deciding.value = null; error.value = ''; });

/** Evidence là mảng chuỗi tham chiếu (tối đa 500 ký tự/dòng); nhập mỗi dòng một tham chiếu. */
function parseEvidence(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

/**
 * Chỉ nghĩa vụ lưu trữ OPEN mới quyết định được — DUE/OVERDUE là projection hiển thị trên chính
 * hàng OPEN đó nên vẫn quyết định được; FULFILLED/WAIVED/CANCELLED thì không.
 */
function decidable(row: ObligationRegisterRow): boolean {
  return props.permissions.fulfill && row.storedStatus === 'OPEN';
}

/** SoD: người phụ trách hoặc người tạo không được tự quyết định (server trả SOD_CONFLICT). */
function sodBlocked(row: ObligationRegisterRow): boolean {
  return props.currentUserId !== null
    && (props.currentUserId === row.ownerUserId || props.currentUserId === row.createdBy);
}

function openDecision(row: ObligationRegisterRow): void {
  deciding.value = row;
  error.value = '';
  decisionForm.decisionType = 'FULFILLED';
  decisionForm.reason = '';
  decisionForm.evidenceText = '';
}

function submitCreate(): void {
  error.value = '';
  if (createForm.clauseRef.trim().length < 1 || createForm.title.trim().length < 3) {
    error.value = 'Điều khoản tham chiếu và tiêu đề (≥3 ký tự) là bắt buộc.';
    return;
  }
  if (!createForm.obligorPartyId || !createForm.beneficiaryPartyId) {
    error.value = 'Chọn bên chịu nghĩa vụ và bên thụ hưởng từ các bên của hợp đồng.';
    return;
  }
  if (createForm.obligorPartyId === createForm.beneficiaryPartyId) {
    error.value = 'Bên chịu nghĩa vụ và bên thụ hưởng phải khác nhau.';
    return;
  }
  if (!TRIGGER_TYPE_PATTERN.test(createForm.triggerType)) {
    error.value = 'Trigger type phải viết hoa, bắt đầu bằng chữ cái (VD: MILESTONE, DATE).';
    return;
  }
  const evidenceRefs = parseEvidence(createForm.evidenceText);
  emit('create', {
    clauseRef: createForm.clauseRef.trim(), title: createForm.title.trim(),
    obligorPartyId: createForm.obligorPartyId, beneficiaryPartyId: createForm.beneficiaryPartyId,
    triggerType: createForm.triggerType.trim(),
    ...(createForm.ownerUserId.trim() ? { ownerUserId: createForm.ownerUserId.trim() } : {}),
    ...(createForm.triggerReference.trim() ? { triggerReference: createForm.triggerReference.trim() } : {}),
    ...(createForm.dueDate ? { dueDate: createForm.dueDate } : {}),
    ...(createForm.consequence.trim() ? { consequence: createForm.consequence.trim() } : {}),
    ...(createForm.appendixId ? { appendixId: createForm.appendixId } : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {})
  });
  showCreate.value = false;
}

function submitDecision(): void {
  const row = deciding.value;
  if (!row) return;
  error.value = '';
  if (decisionForm.reason.trim().length < 3) {
    error.value = 'Lý do quyết định phải có ít nhất 3 ký tự.';
    return;
  }
  // FR-040: không hoàn thành/miễn trừ nếu không có ít nhất một evidence.
  const evidenceRefs = parseEvidence(decisionForm.evidenceText);
  if (!evidenceRefs.length) {
    error.value = 'Cần ít nhất một evidence (mỗi dòng một tham chiếu) để hoàn thành hoặc miễn trừ.';
    return;
  }
  emit('fulfill', row.id, {
    expectedVersion: row.versionNo, decisionType: decisionForm.decisionType,
    reason: decisionForm.reason.trim(), evidenceRefs
  });
  deciding.value = null;
}
</script>

<template>
  <section class="contract-detail obligation-panel" aria-labelledby="obligation-panel-title">
    <div class="detail-heading">
      <div>
        <small>OBLIGATION · DB-031</small>
        <h2 id="obligation-panel-title">Nghĩa vụ hợp đồng</h2>
        <p class="lead">DUE/OVERDUE do server chiếu theo ngày đáo hạn; quyết định luôn cần lý do và evidence.</p>
      </div>
      <el-button v-if="permissions.create" @click="showCreate = !showCreate">Thêm nghĩa vụ</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="showCreate && permissions.create" class="contract-inline-form" @submit.prevent="submitCreate">
      <label>Điều khoản<input v-model.trim="createForm.clauseRef" required maxlength="200" placeholder="VD: 12.3" /></label>
      <label>Tiêu đề<input v-model.trim="createForm.title" required maxlength="400" /></label>
      <label>Bên chịu nghĩa vụ<select v-model="createForm.obligorPartyId" required aria-label="Bên chịu nghĩa vụ"><option disabled value="">Chọn bên</option><option v-for="item in parties" :key="item.id" :value="item.id">{{ item.legalNameSnapshot }}</option></select></label>
      <label>Bên thụ hưởng<select v-model="createForm.beneficiaryPartyId" required aria-label="Bên thụ hưởng"><option disabled value="">Chọn bên</option><option v-for="item in parties" :key="item.id" :value="item.id">{{ item.legalNameSnapshot }}</option></select></label>
      <label>Trigger type<input v-model.trim="createForm.triggerType" required placeholder="MILESTONE" /></label>
      <label>Trigger reference<input v-model.trim="createForm.triggerReference" maxlength="400" /></label>
      <label>Ngày đáo hạn<input v-model="createForm.dueDate" type="date" /></label>
      <label>Phụ lục liên quan<select v-model="createForm.appendixId" aria-label="Phụ lục liên quan"><option value="">Không gắn phụ lục</option><option v-for="item in appendices" :key="item.id" :value="item.id">{{ item.appendixNo }} · rev {{ item.revisionNo }}</option></select></label>
      <label>Người phụ trách<input v-model.trim="createForm.ownerUserId" placeholder="UUID; bỏ trống để lấy người tạo" /></label>
      <label class="form-wide">Hệ quả nếu vi phạm<textarea v-model="createForm.consequence" rows="2" maxlength="2000"></textarea></label>
      <label class="form-wide">Evidence (mỗi dòng một tham chiếu)<textarea v-model="createForm.evidenceText" rows="2"></textarea></label>
      <el-button native-type="submit" type="primary" :loading="busy">Lưu nghĩa vụ</el-button>
    </form>

    <div v-if="!obligations.length" class="empty-panel">
      <h3>Chưa có nghĩa vụ nào</h3>
      <p>Hợp đồng chưa ghi nhận nghĩa vụ trong scope được phép.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table contract-table obligation-table">
        <thead>
          <tr>
            <th>Điều khoản / tiêu đề</th>
            <th>Bên chịu nghĩa vụ → thụ hưởng</th>
            <th>Đáo hạn</th>
            <th>Trạng thái</th>
            <th>Quyết định</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in obligations" :key="row.id" :data-status="row.status">
            <td><strong>{{ row.clauseRef }}</strong><span>{{ row.title }}</span></td>
            <td>
              <strong>{{ partyName.get(row.obligorPartyId) ?? row.obligorPartyId }}</strong>
              <span>→ {{ partyName.get(row.beneficiaryPartyId) ?? row.beneficiaryPartyId }}</span>
            </td>
            <td>{{ row.dueDate ?? '—' }}</td>
            <td><span class="status-pill" :data-status="row.status">{{ OBLIGATION_STATUS_LABEL[row.status] }}</span></td>
            <td>
              <template v-if="row.decisionType">
                <strong>{{ OBLIGATION_DECISION_LABEL[row.decisionType] }}</strong>
                <span>{{ row.decisionReason }}</span>
              </template>
              <span v-else>—</span>
            </td>
            <td>
              <el-button v-if="decidable(row) && !sodBlocked(row)" text @click="openDecision(row)">Quyết định</el-button>
              <span v-else-if="decidable(row) && sodBlocked(row)">SoD: không tự quyết định</span>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <el-button v-if="nextCursor" @click="emit('more')">Tải thêm nghĩa vụ</el-button>

    <form v-if="deciding" class="contract-inline-form obligation-decision" @submit.prevent="submitDecision">
      <h3 class="form-wide">Quyết định nghĩa vụ {{ deciding.clauseRef }} · {{ deciding.title }}</h3>
      <label>Loại quyết định<select v-model="decisionForm.decisionType" aria-label="Loại quyết định"><option v-for="item in OBLIGATION_DECISION_TYPES" :key="item" :value="item">{{ OBLIGATION_DECISION_LABEL[item] }}</option></select></label>
      <label class="form-wide">Lý do<textarea v-model="decisionForm.reason" required rows="2" maxlength="2000"></textarea></label>
      <label class="form-wide">Evidence (bắt buộc, mỗi dòng một tham chiếu)<textarea v-model="decisionForm.evidenceText" required rows="2"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="deciding = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Ghi quyết định</el-button>
      </div>
    </form>
  </section>
</template>
