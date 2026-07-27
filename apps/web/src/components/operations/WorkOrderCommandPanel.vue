<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  commandAvailable, OPERATIONS_CODE_PATTERN, PRIORITY_LABEL, verifierBlocked,
  WORK_ORDER_COMMAND_LABEL, WORK_ORDER_COMMANDS, WORK_ORDER_STATUS_LABEL
} from '@/constants/operations';
import type {
  WorkOrderClosureCycleView, WorkOrderCommandRequest, WorkOrderCommandType, WorkOrderView
} from '@/types/operations.types';

/**
 * API-120 — the closed work-order command union.
 *
 * Two rules are enforced in what this panel RENDERS, not just in what it sends:
 *
 * 1. **The verifier must be independent (SEC-108/SEC-109).** VERIFY and CLOSE are not offered to
 *    the assignee or to whoever completed the work. The service answers 422 SOD_CONFLICT and
 *    `ck_work_order_verifier_independent` refuses the same write in SQL, so a button here would be
 *    a button that always fails — and a button that always fails teaches people that errors are
 *    normal. The rule is stated on screen instead, so the blocked user knows why, not just that.
 * 2. **CLOSE needs a return-to-service reference.** The field is `required` on the form. Handing
 *    an asset back to operations without recording what authorised it is exactly the record this
 *    field exists to prevent being missing.
 *
 * Closure cycles are rendered as an append-only history. REOPEN opens the NEXT cycle and freezes
 * the previous one (DB-119): a verification that already happened is a fact, and this panel never
 * paints over it.
 */
const props = defineProps<{
  workOrder: WorkOrderView;
  /** Every cycle the client has seen for this work order, oldest first. Never replaced wholesale. */
  cycles: WorkOrderClosureCycleView[];
  busy: boolean;
  canManage: boolean;
  /** The signed-in user; `null` is treated as unable to prove independence, so VERIFY/CLOSE hide. */
  actorId: string | null;
}>();
const emit = defineEmits<{
  close: [];
  command: [workOrderId: string, input: WorkOrderCommandRequest];
}>();

const error = ref('');
const active = ref<WorkOrderCommandType | null>(null);
const form = reactive({
  reason: '', assigneeUserId: '', permitToWorkId: '', workSummary: '', evidenceText: '',
  returnToServiceRef: '', claimCode: '', failureDescription: ''
});

const available = computed(
  () => WORK_ORDER_COMMANDS.filter(
    (command) => commandAvailable(command, props.workOrder, props.actorId)
  )
);

/** True when the work order is at a point where verification matters and this user cannot do it. */
const sodExplained = computed(() => (
  ['COMPLETE', 'VERIFIED'].includes(props.workOrder.status)
  && verifierBlocked(props.workOrder, props.actorId)
));

const orderedCycles = computed(
  () => [...props.cycles].sort((left, right) => left.sequenceNo - right.sequenceNo)
);

watch(() => props.workOrder, () => { active.value = null; error.value = ''; reset(); });

function reset(): void {
  Object.assign(form, {
    reason: '', assigneeUserId: '', permitToWorkId: '', workSummary: '', evidenceText: '',
    returnToServiceRef: '', claimCode: '', failureDescription: ''
  });
}

function select(command: WorkOrderCommandType): void {
  active.value = command;
  error.value = '';
  reset();
}

/** Evidence is a list of opaque references, one per line — never bytes. */
function parseEvidence(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function submit(): void {
  const command = active.value;
  if (!command) return;
  error.value = '';
  const reason = form.reason.trim();
  const base = { commandType: command, expectedVersion: props.workOrder.versionNo };
  let input: WorkOrderCommandRequest | null = null;

  switch (command) {
    case 'DISPATCH': {
      const assigneeUserId = form.assigneeUserId.trim();
      // DISPATCH must leave the work order with somebody responsible for it.
      if (!assigneeUserId && props.workOrder.assigneeId === null) {
        error.value = 'DISPATCH phải chỉ định người thực hiện.';
        return;
      }
      input = { ...base, ...(assigneeUserId ? { assigneeUserId } : {}) };
      break;
    }
    case 'START': {
      const permitToWorkId = form.permitToWorkId.trim();
      if (props.workOrder.requiresPermit && !permitToWorkId && !props.workOrder.permitToWorkId) {
        error.value = 'Công việc yêu cầu permit to work còn hiệu lực trước khi bắt đầu.';
        return;
      }
      input = { ...base, ...(permitToWorkId ? { permitToWorkId } : {}) };
      break;
    }
    case 'HOLD':
    case 'CANCEL': {
      if (reason.length < 3) {
        error.value = `${WORK_ORDER_COMMAND_LABEL[command]} phải kèm lý do ít nhất 3 ký tự.`;
        return;
      }
      input = { ...base, reason };
      break;
    }
    case 'RESUME': {
      input = base;
      break;
    }
    case 'COMPLETE': {
      const workSummary = form.workSummary.trim();
      const evidenceRefs = parseEvidence(form.evidenceText);
      if (workSummary.length < 3) {
        error.value = 'COMPLETE phải mô tả công việc đã thực hiện (≥3 ký tự).';
        return;
      }
      if (!evidenceRefs.length) {
        error.value = 'COMPLETE phải kèm ít nhất một bằng chứng (mỗi dòng một tham chiếu).';
        return;
      }
      input = { ...base, workSummary, evidenceRefs };
      break;
    }
    case 'VERIFY': {
      if (reason.length < 3) {
        error.value = 'VERIFY phải kèm thuyết minh xác nhận (≥3 ký tự).';
        return;
      }
      input = { ...base, reason };
      break;
    }
    case 'CLOSE': {
      const returnToServiceRef = form.returnToServiceRef.trim();
      // Mandatory, not "recommended": CLOSE hands the asset back to operations.
      if (!returnToServiceRef) {
        error.value = 'CLOSE phải ghi nhận bằng chứng bàn giao trở lại vận hành.';
        return;
      }
      input = { ...base, returnToServiceRef };
      break;
    }
    case 'REOPEN': {
      if (reason.length < 3) {
        error.value = 'REOPEN phải kèm lý do ít nhất 3 ký tự.';
        return;
      }
      const evidenceRefs = parseEvidence(form.evidenceText);
      input = { ...base, reason, ...(evidenceRefs.length ? { evidenceRefs } : {}) };
      break;
    }
    case 'RAISE_WARRANTY_CLAIM': {
      const claimCode = form.claimCode.trim();
      const failureDescription = form.failureDescription.trim();
      if (!OPERATIONS_CODE_PATTERN.test(claimCode)) {
        error.value = 'Mã yêu cầu bảo hành phải viết hoa, bắt đầu bằng chữ hoặc số.';
        return;
      }
      if (failureDescription.length < 3) {
        error.value = 'Phải mô tả hư hỏng (≥3 ký tự).';
        return;
      }
      const evidenceRefs = parseEvidence(form.evidenceText);
      input = {
        ...base, claimCode, failureDescription,
        ...(evidenceRefs.length ? { evidenceRefs } : {})
      };
      break;
    }
  }

  if (!input) return;
  emit('command', props.workOrder.id, input);
  active.value = null;
}
</script>

<template>
  <section class="operations-panel work-order-command" aria-labelledby="work-order-command-title">
    <div class="detail-heading">
      <div>
        <small>WORK ORDER COMMAND · API-120</small>
        <h2 id="work-order-command-title">{{ workOrder.code }} · {{ workOrder.title }}</h2>
        <p class="lead">{{ WORK_ORDER_STATUS_LABEL[workOrder.status] }} · ưu tiên {{ PRIORITY_LABEL[workOrder.priority] }} · version {{ workOrder.versionNo }}</p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p v-if="!canManage" class="immutable-banner">
      Bạn chỉ có quyền đọc work order; không có lệnh nào được hiển thị.
    </p>
    <p v-else-if="sodExplained" class="immutable-banner" data-testid="work-order-sod-note">
      <strong>Tách trách nhiệm (SEC-108/SEC-109):</strong>
      bạn là người thực hiện hoặc người hoàn thành work order này, nên không được tự nghiệm thu
      (VERIFY) hay đóng (CLOSE). Hai lệnh đó không hiển thị vì server và ràng buộc CSDL đều sẽ từ
      chối. Một người độc lập phải thực hiện.
    </p>

    <div
      v-if="canManage && available.length"
      class="segmented-control work-order-commands"
      role="tablist"
      aria-label="Lệnh work order"
    >
      <button
        v-for="command in available"
        :key="command"
        type="button"
        :aria-pressed="active === command"
        @click="select(command)"
      >
        {{ WORK_ORDER_COMMAND_LABEL[command] }}
      </button>
    </div>
    <p v-else-if="canManage" class="muted-inline">
      Không có lệnh hợp lệ cho trạng thái {{ WORK_ORDER_STATUS_LABEL[workOrder.status] }}.
    </p>

    <form v-if="canManage && active" class="operations-inline-form" @submit.prevent="submit">
      <h3 class="form-wide">{{ WORK_ORDER_COMMAND_LABEL[active] }}</h3>

      <label v-if="active === 'DISPATCH'" class="form-wide">
        Người thực hiện (UUID)
        <input v-model.trim="form.assigneeUserId" :required="workOrder.assigneeId === null" placeholder="Bỏ trống để giữ người hiện tại" />
      </label>

      <label v-if="active === 'START'" class="form-wide">
        Permit to work (UUID)
        <input v-model.trim="form.permitToWorkId" :required="workOrder.requiresPermit && !workOrder.permitToWorkId" />
      </label>

      <label v-if="['HOLD', 'CANCEL', 'VERIFY', 'REOPEN'].includes(active)" class="form-wide">
        {{ active === 'VERIFY' ? 'Thuyết minh xác nhận' : 'Lý do' }}
        <textarea v-model="form.reason" required rows="2" minlength="3" maxlength="2000"></textarea>
      </label>

      <label v-if="active === 'COMPLETE'" class="form-wide">
        Mô tả công việc đã thực hiện
        <textarea v-model="form.workSummary" required rows="2" minlength="3" maxlength="4000"></textarea>
      </label>

      <label v-if="active === 'RAISE_WARRANTY_CLAIM'">
        Mã yêu cầu bảo hành
        <input v-model.trim="form.claimCode" required placeholder="WC-2026-001" />
      </label>
      <label v-if="active === 'RAISE_WARRANTY_CLAIM'" class="form-wide">
        Mô tả hư hỏng
        <textarea v-model="form.failureDescription" required rows="2" minlength="3" maxlength="4000"></textarea>
      </label>

      <label v-if="active === 'CLOSE'" class="form-wide">
        Bằng chứng bàn giao trở lại vận hành (bắt buộc)
        <input
          v-model.trim="form.returnToServiceRef"
          required
          maxlength="200"
          placeholder="VD: RTS-2026-014 hoặc biên bản bàn giao"
          data-testid="return-to-service-ref"
        />
      </label>

      <label v-if="['COMPLETE', 'REOPEN', 'RAISE_WARRANTY_CLAIM'].includes(active)" class="form-wide">
        Bằng chứng (mỗi dòng một tham chiếu){{ active === 'COMPLETE' ? ' — bắt buộc' : '' }}
        <textarea v-model="form.evidenceText" :required="active === 'COMPLETE'" rows="2"></textarea>
      </label>

      <p v-if="active === 'REOPEN'" class="form-wide muted-inline">
        REOPEN mở một chu kỳ nghiệm thu MỚI. Chu kỳ trước và quyết định của nó được giữ nguyên
        trong lịch sử bên dưới.
      </p>

      <div class="form-actions form-wide">
        <el-button native-type="button" @click="active = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">
          Gửi lệnh {{ WORK_ORDER_COMMAND_LABEL[active] }}
        </el-button>
      </div>
    </form>

    <div class="fact-grid work-order-facts">
      <div><span>Người thực hiện</span><strong>{{ workOrder.assigneeId ?? 'Chưa chỉ định' }}</strong></div>
      <div><span>Người hoàn thành</span><strong>{{ workOrder.completedBy ?? 'Chưa hoàn thành' }}</strong></div>
      <div><span>Người nghiệm thu</span><strong>{{ workOrder.verifiedBy ?? 'Chưa nghiệm thu' }}</strong></div>
      <div><span>Bàn giao vận hành</span><strong>{{ workOrder.returnToServiceRef ?? 'Chưa ghi nhận' }}</strong></div>
      <div><span>Lý do tạm dừng</span><strong>{{ workOrder.holdReason ?? 'Không có' }}</strong></div>
      <div><span>Permit to work</span><strong>{{ workOrder.permitToWorkId ?? (workOrder.requiresPermit ? 'BẮT BUỘC — chưa gắn' : 'Không yêu cầu') }}</strong></div>
    </div>

    <section class="closure-cycle-history" aria-labelledby="closure-cycle-title">
      <div class="section-heading">
        <div>
          <h3 id="closure-cycle-title">Lịch sử chu kỳ nghiệm thu</h3>
          <p>DB-119 append-only: REOPEN mở chu kỳ kế tiếp, không ghi đè quyết định đã có.</p>
        </div>
        <strong>{{ orderedCycles.length }} chu kỳ</strong>
      </div>
      <ol v-if="orderedCycles.length" data-testid="closure-cycles">
        <li v-for="cycle in orderedCycles" :key="cycle.id" :data-sequence="cycle.sequenceNo">
          <div>
            <strong>Chu kỳ #{{ cycle.sequenceNo }}</strong>
            <span>{{ new Date(cycle.requestedAt).toLocaleString('vi-VN') }}</span>
          </div>
          <p><b>Yêu cầu:</b> {{ cycle.requestComment }}</p>
          <p><b>Bằng chứng:</b> {{ cycle.requestEvidenceRefs.length }} tham chiếu</p>
          <div v-if="cycle.decision" class="closure-cycle-history__decision">
            <strong>{{ cycle.decision }}</strong>
            <p>{{ cycle.decisionComment }}</p>
            <small>{{ cycle.decidedAt ? new Date(cycle.decidedAt).toLocaleString('vi-VN') : '' }}</small>
          </div>
          <div v-else class="closure-cycle-history__pending">Đang chờ người nghiệm thu độc lập</div>
        </li>
      </ol>
      <p v-else class="muted-inline">
        Chưa có chu kỳ nghiệm thu nào được ghi nhận trong phiên làm việc này.
      </p>
    </section>
  </section>
</template>
