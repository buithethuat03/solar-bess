<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  CYCLE_DECISIONS, CYCLE_DECISION_LABEL, PUNCH_CATEGORIES, PUNCH_CATEGORY_LABEL,
  PUNCH_COMMANDS_BY_STATUS, PUNCH_COMMAND_LABEL, PUNCH_STATUS_LABEL, QUALITY_CODE_PATTERN,
  parseReferenceLines
} from '@/constants/field-hse';
import type {
  PunchCategory, PunchClosureCycleView, PunchCommandRequest, PunchCommandType, PunchItemView,
  QualityCycleDecision
} from '@/types/field-hse.types';

/**
 * API-097 — punch list.
 *
 * Category A is not a convention, it is a database rule: `ck_punch_category_a_blocking` and
 * `ck_punch_category_a_not_waivable` make an A item COD-blocking and non-waivable no matter what the
 * request says. The create form therefore does not offer those two switches for A at all — it states
 * the outcome — and the register marks every A row so the constraint is legible from the table.
 */
const props = defineProps<{
  items: PunchItemView[];
  cycles: Record<string, PunchClosureCycleView[]>;
  busy: boolean;
  currentUserId: string | null;
  canManage: boolean;
}>();
const emit = defineEmits<{ command: [input: PunchCommandRequest] }>();

const error = ref('');
const showCreate = ref(false);
const acting = ref<{ item: PunchItemView; command: PunchCommandType } | null>(null);

const createForm = reactive({
  code: '', title: '', description: '', category: 'B' as PunchCategory,
  codBlocking: false, waivable: true, ownerUserId: ''
});
const actionForm = reactive({
  reason: '', decision: 'APPROVE' as QualityCycleDecision, evidenceText: ''
});

const categoryA = computed(() => createForm.category === 'A');

function availableCommands(item: PunchItemView): PunchCommandType[] {
  return PUNCH_COMMANDS_BY_STATUS[item.status]
    .filter((command) => command !== 'WAIVE' || item.waivable);
}

/** `ck_punch_verifier_independent`: the owner may not approve the closure of their own item. */
function sodBlocked(item: PunchItemView): boolean {
  return props.currentUserId !== null && props.currentUserId === item.ownerId;
}

function submitCreate(): void {
  error.value = '';
  if (!QUALITY_CODE_PATTERN.test(createForm.code.trim())) {
    error.value = 'Mã punch phải viết hoa, bắt đầu bằng chữ/số (VD: PL-001).';
    return;
  }
  if (createForm.title.trim().length < 3) {
    error.value = 'Tiêu đề punch phải có ít nhất 3 ký tự.';
    return;
  }
  emit('command', {
    commandType: 'CREATE', code: createForm.code.trim(), title: createForm.title.trim(),
    category: createForm.category,
    // Category A is fixed by the database; sending anything else would only earn a 422.
    codBlocking: categoryA.value ? true : createForm.codBlocking,
    waivable: categoryA.value ? false : createForm.waivable,
    ...(createForm.description.trim() ? { description: createForm.description.trim() } : {}),
    ...(createForm.ownerUserId.trim() ? { ownerUserId: createForm.ownerUserId.trim() } : {})
  });
  showCreate.value = false;
}

function openAction(item: PunchItemView, command: PunchCommandType): void {
  acting.value = { item, command };
  actionForm.reason = '';
  actionForm.decision = 'APPROVE';
  actionForm.evidenceText = '';
  error.value = '';
}

function submitAction(): void {
  const current = acting.value;
  if (!current) return;
  error.value = '';
  const { item, command } = current;
  if (actionForm.reason.trim().length < 3) {
    error.value = 'Thuyết minh phải có ít nhất 3 ký tự.';
    return;
  }
  const evidenceRefs = parseReferenceLines(actionForm.evidenceText);
  if (command === 'REQUEST_CLOSURE' && !evidenceRefs.length) {
    error.value = 'Đề nghị đóng phải kèm ít nhất một bằng chứng.';
    return;
  }
  emit('command', {
    commandType: command, punchItemId: item.id, expectedVersion: item.versionNo,
    reason: actionForm.reason.trim(),
    ...(command === 'DECIDE_CLOSURE' ? { decision: actionForm.decision } : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {})
  });
  acting.value = null;
}
</script>

<template>
  <section class="quality-panel punch-panel" aria-labelledby="punch-panel-title">
    <div class="detail-heading">
      <div>
        <small>PUNCH LIST · API-097</small>
        <h2 id="punch-panel-title">Punch list</h2>
        <p class="lead">
          Punch category A chặn COD và không bao giờ được miễn trừ — ràng buộc này do cơ sở dữ liệu
          giữ, không phải quy ước hiển thị.
        </p>
      </div>
      <el-button v-if="canManage" @click="showCreate = !showCreate">Tạo punch item</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="showCreate && canManage" class="quality-inline-form" @submit.prevent="submitCreate">
      <label>Mã punch<input v-model.trim="createForm.code" required maxlength="80" placeholder="PL-001" /></label>
      <label>Tiêu đề<input v-model.trim="createForm.title" required maxlength="400" /></label>
      <label>Category<select v-model="createForm.category" required aria-label="Category punch"><option v-for="item in PUNCH_CATEGORIES" :key="item" :value="item">{{ PUNCH_CATEGORY_LABEL[item] }}</option></select></label>
      <label>Người phụ trách<input v-model.trim="createForm.ownerUserId" placeholder="UUID; bỏ trống để lấy người tạo" /></label>
      <p v-if="categoryA" class="form-wide punch-category-a-note">
        Category A: <strong>luôn chặn COD</strong> và <strong>không thể miễn trừ</strong>. Hai thuộc
        tính này bị khóa và không nhận giá trị khác.
      </p>
      <template v-else>
        <label class="check-label">
          <input v-model="createForm.codBlocking" type="checkbox" />
          Chặn COD
        </label>
        <label class="check-label">
          <input v-model="createForm.waivable" type="checkbox" />
          Có thể miễn trừ
        </label>
      </template>
      <label class="form-wide">Mô tả<textarea v-model="createForm.description" rows="2" maxlength="4000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showCreate = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Tạo punch item</el-button>
      </div>
    </form>

    <div v-if="!items.length" class="empty-panel">
      <h3>Phiên này chưa có punch item nào</h3>
      <p>Catalog chưa có API đọc punch list; bảng dưới chỉ hiển thị các item phiên này đã tạo hoặc chuyển trạng thái.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table punch-table">
        <thead>
          <tr>
            <th>Mã / tiêu đề</th>
            <th>Category</th>
            <th>Ràng buộc</th>
            <th>Trạng thái</th>
            <th>Vòng đóng</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" :data-category="item.category" :data-status="item.status">
            <td><strong>{{ item.code }}</strong><span>{{ item.title }}</span></td>
            <td><span class="punch-category-chip" :data-category="item.category">{{ item.category }}</span></td>
            <td>
              <span v-if="item.codBlocking" class="punch-flag" data-flag="cod">Chặn COD</span>
              <span v-if="!item.waivable" class="punch-flag" data-flag="no-waiver">Không được miễn trừ</span>
              <span v-if="!item.codBlocking && item.waivable">Không chặn COD · có thể miễn trừ</span>
            </td>
            <td>
              <span class="status-pill" :data-status="item.status">{{ PUNCH_STATUS_LABEL[item.status] }}</span>
              <span v-if="item.waivedReason" class="punch-waived-reason">{{ item.waivedReason }}</span>
            </td>
            <td>
              <ol v-if="cycles[item.id]?.length" class="cycle-list">
                <li v-for="cycle in cycles[item.id]" :key="cycle.id" :data-decision="cycle.decision ?? 'PENDING'">
                  <strong>Vòng {{ cycle.sequenceNo }}</strong>
                  <span>{{ cycle.requestComment }}</span>
                  <span>{{ cycle.decision ? `${CYCLE_DECISION_LABEL[cycle.decision]} · ${cycle.decisionComment}` : 'Đang chờ quyết định' }}</span>
                </li>
              </ol>
              <span v-else>—</span>
            </td>
            <td>
              <template v-if="canManage">
                <el-button v-for="command in availableCommands(item)" :key="command" text @click="openAction(item, command)">{{ PUNCH_COMMAND_LABEL[command] }}</el-button>
                <span v-if="item.status === 'OPEN' && !item.waivable" class="punch-flag" data-flag="no-waiver">Không có thao tác miễn trừ</span>
                <span v-if="item.status === 'READY_FOR_VERIFICATION' && sodBlocked(item)" class="quality-sod-note">SoD: người phụ trách không được tự xác nhận đóng.</span>
              </template>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="acting" class="quality-inline-form punch-action-form" @submit.prevent="submitAction">
      <h3 class="form-wide">{{ PUNCH_COMMAND_LABEL[acting.command] }} · {{ acting.item.code }}</h3>
      <label v-if="acting.command === 'DECIDE_CLOSURE'">Quyết định<select v-model="actionForm.decision" required aria-label="Quyết định đóng punch"><option v-for="item in CYCLE_DECISIONS" :key="item" :value="item">{{ CYCLE_DECISION_LABEL[item] }}</option></select></label>
      <label class="form-wide">Thuyết minh<textarea v-model="actionForm.reason" required rows="2" maxlength="2000"></textarea></label>
      <label v-if="acting.command !== 'WAIVE'" class="form-wide">Bằng chứng (mỗi dòng một tham chiếu)<textarea v-model="actionForm.evidenceText" rows="2"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="acting = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Gửi lệnh</el-button>
      </div>
    </form>
  </section>
</template>
