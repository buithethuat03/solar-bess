<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  CYCLE_DECISIONS, CYCLE_DECISION_LABEL, HSE_SEVERITIES, HSE_SEVERITY_LABEL,
  NCR_COMMANDS_BY_STATUS, NCR_COMMAND_LABEL, NCR_DISPOSITIONS, NCR_DISPOSITION_LABEL,
  NCR_STATUS_LABEL, QUALITY_CODE_PATTERN, parseReferenceLines
} from '@/constants/field-hse';
import type {
  CapaActionView, HseSeverity, NcrCommandRequest, NcrCommandType, NcrDisposition,
  NcrDispositionCycleView, NcrView, QualityCycleDecision
} from '@/types/field-hse.types';

/**
 * API-096 — NCR register with its disposition cycles.
 *
 * Each proposal/decision pair is one cycle row (DB-116). A RETURN sends the NCR back to RETURNED and
 * the next proposal opens the NEXT cycle, so the register shows a chain of cycles rather than a
 * single mutable "current decision". Independence (approver ≠ raiser, verifier ≠ owner, decider ≠
 * proposer) is warned about here and enforced by the server and by row constraints.
 */
const props = defineProps<{
  ncrs: NcrView[];
  cycles: Record<string, NcrDispositionCycleView[]>;
  capas: CapaActionView[];
  busy: boolean;
  currentUserId: string | null;
  canManage: boolean;
}>();
const emit = defineEmits<{ command: [input: NcrCommandRequest] }>();

interface PendingAction {
  ncr: NcrView;
  command: NcrCommandType;
  /** Only VERIFY_CAPA acts on a CAPA row rather than on the NCR itself. */
  capa: CapaActionView | null;
}

const error = ref('');
const showRaise = ref(false);
const acting = ref<PendingAction | null>(null);

const raiseForm = reactive({
  code: '', title: '', description: '', severity: 'MEDIUM' as HseSeverity, ownerUserId: ''
});
const EMPTY_ACTION = {
  containmentAction: '', rootCause: '', disposition: 'REWORK' as NcrDisposition,
  decision: 'APPROVE' as QualityCycleDecision, reason: '', evidenceText: '',
  capaTitle: '', capaOwnerUserId: '', capaDueDate: '', effectivenessAssessment: ''
};
const actionForm = reactive({ ...EMPTY_ACTION });

function availableCommands(ncr: NcrView): NcrCommandType[] {
  const commands = [...NCR_COMMANDS_BY_STATUS[ncr.status]];
  // CAPA is orthogonal to the lifecycle; the API refuses it only once the NCR is CLOSED.
  if (ncr.status !== 'CLOSED') commands.push('RECORD_CAPA');
  return commands;
}

function sodWarning(ncr: NcrView, command: NcrCommandType): string {
  if (props.currentUserId === null) return '';
  if (command === 'DECIDE_DISPOSITION' && props.currentUserId === ncr.raisedBy) {
    return 'SoD: người lập NCR không được tự phê duyệt disposition.';
  }
  if (command === 'VERIFY_CLOSE' && props.currentUserId === ncr.ownerId) {
    return 'SoD: người phụ trách NCR không được tự xác nhận đóng.';
  }
  return '';
}

/** `ck_capa_verifier_independent`: the CAPA owner may never confirm its own effectiveness. */
function openCapas(ncrId: string): CapaActionView[] {
  return props.capas.filter((capa) => (
    capa.ncrId === ncrId && capa.status === 'OPEN' && capa.ownerId !== props.currentUserId
  ));
}

function submitRaise(): void {
  error.value = '';
  if (!QUALITY_CODE_PATTERN.test(raiseForm.code.trim())) {
    error.value = 'Mã NCR phải viết hoa, bắt đầu bằng chữ/số (VD: NCR-001).';
    return;
  }
  if (raiseForm.title.trim().length < 3 || raiseForm.description.trim().length < 3) {
    error.value = 'Tiêu đề và mô tả NCR phải có ít nhất 3 ký tự.';
    return;
  }
  emit('command', {
    commandType: 'RAISE', code: raiseForm.code.trim(), title: raiseForm.title.trim(),
    description: raiseForm.description.trim(), severity: raiseForm.severity,
    ...(raiseForm.ownerUserId.trim() ? { ownerUserId: raiseForm.ownerUserId.trim() } : {})
  });
  showRaise.value = false;
}

function openAction(
  ncr: NcrView, command: NcrCommandType, capa: CapaActionView | null = null
): void {
  acting.value = { ncr, command, capa };
  Object.assign(actionForm, EMPTY_ACTION);
  error.value = '';
}

function submitAction(): void {
  const current = acting.value;
  if (!current) return;
  error.value = '';
  const { ncr, command, capa } = current;
  if (command === 'VERIFY_CAPA') {
    if (!capa) return;
    if (actionForm.effectivenessAssessment.trim().length < 3) {
      error.value = 'Đánh giá hiệu quả CAPA phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', {
      commandType: 'VERIFY_CAPA', capaActionId: capa.id, expectedVersion: capa.versionNo,
      effectivenessAssessment: actionForm.effectivenessAssessment.trim()
    });
    acting.value = null;
    return;
  }
  const base: NcrCommandRequest = {
    commandType: command, ncrId: ncr.id, expectedVersion: ncr.versionNo
  };
  if (command === 'CONTAIN') {
    if (actionForm.containmentAction.trim().length < 3) {
      error.value = 'Biện pháp cô lập phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', { ...base, containmentAction: actionForm.containmentAction.trim() });
  } else if (command === 'RECORD_ROOT_CAUSE') {
    if (actionForm.rootCause.trim().length < 3) {
      error.value = 'Nguyên nhân gốc phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', { ...base, rootCause: actionForm.rootCause.trim() });
  } else if (command === 'PROPOSE_DISPOSITION') {
    if (actionForm.reason.trim().length < 3) {
      error.value = 'Thuyết minh đề xuất phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', {
      ...base, disposition: actionForm.disposition, reason: actionForm.reason.trim()
    });
  } else if (command === 'DECIDE_DISPOSITION') {
    if (actionForm.reason.trim().length < 3) {
      error.value = 'Thuyết minh quyết định phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', { ...base, decision: actionForm.decision, reason: actionForm.reason.trim() });
  } else if (command === 'VERIFY_CLOSE') {
    const evidenceRefs = parseReferenceLines(actionForm.evidenceText);
    if (!evidenceRefs.length) {
      error.value = 'Đóng NCR phải kèm ít nhất một bằng chứng.';
      return;
    }
    emit('command', { ...base, evidenceRefs });
  } else if (command === 'REOPEN') {
    if (actionForm.reason.trim().length < 3) {
      error.value = 'Lý do mở lại phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', { ...base, reason: actionForm.reason.trim() });
  } else if (command === 'RECORD_CAPA') {
    if (actionForm.capaTitle.trim().length < 3) {
      error.value = 'Tiêu đề CAPA phải có ít nhất 3 ký tự.';
      return;
    }
    emit('command', {
      ...base, capaTitle: actionForm.capaTitle.trim(),
      ...(actionForm.capaOwnerUserId.trim() ? { capaOwnerUserId: actionForm.capaOwnerUserId.trim() } : {}),
      ...(actionForm.capaDueDate ? { capaDueDate: actionForm.capaDueDate } : {})
    });
  } else {
    emit('command', base);
  }
  acting.value = null;
}
</script>

<template>
  <section class="quality-panel ncr-panel" aria-labelledby="ncr-panel-title">
    <div class="detail-heading">
      <div>
        <small>NCR · API-096</small>
        <h2 id="ncr-panel-title">Sổ NCR</h2>
        <p class="lead">
          Mỗi vòng đề xuất – quyết định là một cycle riêng; quyết định trả lại mở vòng kế tiếp thay vì
          ghi đè vòng cũ.
        </p>
      </div>
      <el-button v-if="canManage" @click="showRaise = !showRaise">Lập NCR</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="showRaise && canManage" class="quality-inline-form" @submit.prevent="submitRaise">
      <label>Mã NCR<input v-model.trim="raiseForm.code" required maxlength="80" placeholder="NCR-001" /></label>
      <label>Tiêu đề<input v-model.trim="raiseForm.title" required maxlength="400" /></label>
      <label>Mức độ<select v-model="raiseForm.severity" required aria-label="Mức độ NCR"><option v-for="item in HSE_SEVERITIES" :key="item" :value="item">{{ HSE_SEVERITY_LABEL[item] }}</option></select></label>
      <label>Người phụ trách<input v-model.trim="raiseForm.ownerUserId" placeholder="UUID; bỏ trống để lấy người lập" /></label>
      <label class="form-wide">Mô tả<textarea v-model="raiseForm.description" required rows="3" maxlength="4000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showRaise = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Lập NCR</el-button>
      </div>
    </form>

    <div v-if="!ncrs.length" class="empty-panel">
      <h3>Phiên này chưa có NCR nào</h3>
      <p>Catalog chưa có API đọc NCR; bảng dưới chỉ hiển thị các NCR phiên này đã tạo hoặc chuyển trạng thái.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table ncr-table">
        <thead>
          <tr>
            <th>Mã / tiêu đề</th>
            <th>Mức độ</th>
            <th>Trạng thái</th>
            <th>Phương án xử lý</th>
            <th>Vòng xử lý</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ncr in ncrs" :key="ncr.id" :data-status="ncr.status">
            <td><strong>{{ ncr.code }}</strong><span>{{ ncr.title }}</span></td>
            <td><span class="status-pill" :data-status="ncr.severity">{{ HSE_SEVERITY_LABEL[ncr.severity] }}</span></td>
            <td><span class="status-pill" :data-status="ncr.status">{{ NCR_STATUS_LABEL[ncr.status] }}</span></td>
            <td>{{ ncr.disposition ? NCR_DISPOSITION_LABEL[ncr.disposition] : '—' }}</td>
            <td>
              <ol v-if="cycles[ncr.id]?.length" class="cycle-list">
                <li v-for="cycle in cycles[ncr.id]" :key="cycle.id" :data-decision="cycle.decision ?? 'PENDING'">
                  <strong>Vòng {{ cycle.sequenceNo }} · {{ NCR_DISPOSITION_LABEL[cycle.proposedDisposition] }}</strong>
                  <span>{{ cycle.proposalComment }}</span>
                  <span>{{ cycle.decision ? `${CYCLE_DECISION_LABEL[cycle.decision]} · ${cycle.decisionComment}` : 'Đang chờ quyết định' }}</span>
                </li>
              </ol>
              <span v-else>—</span>
            </td>
            <td>
              <template v-if="canManage">
                <template v-for="command in availableCommands(ncr)" :key="command">
                  <el-button text @click="openAction(ncr, command)">{{ NCR_COMMAND_LABEL[command] }}</el-button>
                  <span v-if="sodWarning(ncr, command)" class="quality-sod-note">{{ sodWarning(ncr, command) }}</span>
                </template>
                <el-button v-for="capa in openCapas(ncr.id)" :key="capa.id" text @click="openAction(ncr, 'VERIFY_CAPA', capa)">Xác nhận CAPA: {{ capa.title }}</el-button>
              </template>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="acting" class="quality-inline-form ncr-action-form" @submit.prevent="submitAction">
      <h3 class="form-wide">{{ NCR_COMMAND_LABEL[acting.command] }} · {{ acting.ncr.code }}</h3>
      <p v-if="sodWarning(acting.ncr, acting.command)" class="form-wide quality-sod-note">{{ sodWarning(acting.ncr, acting.command) }}</p>
      <label v-if="acting.command === 'CONTAIN'" class="form-wide">Biện pháp cô lập<textarea v-model="actionForm.containmentAction" required rows="2" maxlength="2000"></textarea></label>
      <label v-if="acting.command === 'RECORD_ROOT_CAUSE'" class="form-wide">Nguyên nhân gốc<textarea v-model="actionForm.rootCause" required rows="3" maxlength="4000"></textarea></label>
      <label v-if="acting.command === 'PROPOSE_DISPOSITION'">Phương án đề xuất<select v-model="actionForm.disposition" required aria-label="Phương án xử lý đề xuất"><option v-for="item in NCR_DISPOSITIONS" :key="item" :value="item">{{ NCR_DISPOSITION_LABEL[item] }}</option></select></label>
      <label v-if="acting.command === 'DECIDE_DISPOSITION'">Quyết định<select v-model="actionForm.decision" required aria-label="Quyết định phương án xử lý"><option v-for="item in CYCLE_DECISIONS" :key="item" :value="item">{{ CYCLE_DECISION_LABEL[item] }}</option></select></label>
      <label v-if="['PROPOSE_DISPOSITION', 'DECIDE_DISPOSITION', 'REOPEN'].includes(acting.command)" class="form-wide">Thuyết minh<textarea v-model="actionForm.reason" required rows="2" maxlength="2000"></textarea></label>
      <label v-if="acting.command === 'VERIFY_CLOSE'" class="form-wide">Bằng chứng đóng (bắt buộc, mỗi dòng một tham chiếu)<textarea v-model="actionForm.evidenceText" required rows="3"></textarea></label>
      <template v-if="acting.command === 'RECORD_CAPA'">
        <label>Tiêu đề CAPA<input v-model.trim="actionForm.capaTitle" required maxlength="400" /></label>
        <label>Người phụ trách CAPA<input v-model.trim="actionForm.capaOwnerUserId" placeholder="UUID; bỏ trống để lấy người ghi" /></label>
        <label>Hạn hoàn thành<input v-model="actionForm.capaDueDate" type="date" /></label>
      </template>
      <label v-if="acting.command === 'VERIFY_CAPA'" class="form-wide">Đánh giá hiệu quả CAPA<textarea v-model="actionForm.effectivenessAssessment" required rows="2" maxlength="2000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="acting = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Gửi lệnh</el-button>
      </div>
    </form>
  </section>
</template>
