<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  STOP_WORK_TARGET_LABEL, STOP_WORK_TARGET_TYPES, parseReferenceLines
} from '@/constants/field-hse';
import type {
  PermitToWorkView, StopWorkActionRequest, StopWorkActionView, StopWorkTargetType, WorkfrontView
} from '@/types/field-hse.types';
import type { Site } from '@/types/project.types';

/**
 * API-094 — the stop-work ledger, two facts and nothing else: ISSUE and LIFT.
 *
 * The split permission is the whole point. `permissions.issue` is granted to every role — anyone may
 * stop unsafe work — while `permissions.lift` is HSE_MANAGER's alone. The lift form therefore renders
 * only under `permissions.lift`; nothing here degrades a missing lift permission into a disabled
 * button, because a visible lift control implies an authority the holder does not have.
 *
 * The ledger has no read operation in the catalog, so `actions` is what this session appended. It is
 * labelled as such instead of being presented as the project's full stop-work history.
 */
const props = defineProps<{
  actions: StopWorkActionView[];
  sites: Site[];
  workfronts: WorkfrontView[];
  permits: PermitToWorkView[];
  busy: boolean;
  currentUserId: string | null;
  permissions: { issue: boolean; lift: boolean };
}>();
const emit = defineEmits<{
  issue: [input: StopWorkActionRequest];
  lift: [input: StopWorkActionRequest];
}>();

const error = ref('');
const showIssue = ref(false);
const showLift = ref(false);

const issueForm = reactive({
  targetType: 'WORKFRONT' as StopWorkTargetType, siteId: '', workfrontId: '', permitId: '',
  hseIncidentId: '', reason: ''
});
const liftForm = reactive({ liftsActionId: '', reason: '', verifiedControlsText: '' });

/** An ISSUE with no LIFT pointing at it is still standing. */
const openIssues = computed(() => {
  const lifted = new Set(
    props.actions.filter((row) => row.action === 'LIFT' && row.liftsActionId)
      .map((row) => row.liftsActionId!)
  );
  return props.actions.filter((row) => row.action === 'ISSUE' && !lifted.has(row.id));
});

const siteNames = computed(() => Object.fromEntries(
  props.sites.map((site) => [site.id, `${site.code} · ${site.name}`])
));
const workfrontNames = computed(() => Object.fromEntries(
  props.workfronts.map((row) => [row.id, `${row.code} · ${row.name}`])
));

function targetLabel(row: StopWorkActionView): string {
  if (row.targetType === 'SITE' && row.siteId) return siteNames.value[row.siteId] ?? row.siteId;
  if (row.targetType === 'WORKFRONT' && row.workfrontId) {
    return workfrontNames.value[row.workfrontId] ?? row.workfrontId;
  }
  if (row.targetType === 'PERMIT' && row.permitId) return row.permitId;
  return 'Toàn dự án';
}

/** DB-115: the issuer of a stop-work may never lift it — the server answers SOD_CONFLICT. */
function selfIssued(row: StopWorkActionView): boolean {
  return props.currentUserId !== null && props.currentUserId === row.actorId;
}

function submitIssue(): void {
  error.value = '';
  if (issueForm.reason.trim().length < 3) {
    error.value = 'Lý do dừng việc phải có ít nhất 3 ký tự.';
    return;
  }
  const target = issueForm.targetType;
  if (target === 'SITE' && !issueForm.siteId) {
    error.value = 'Chọn công trường bị dừng.';
    return;
  }
  if (target === 'WORKFRONT' && !issueForm.workfrontId) {
    error.value = 'Chọn workfront bị dừng.';
    return;
  }
  if (target === 'PERMIT' && !issueForm.permitId) {
    error.value = 'Chọn permit bị dừng.';
    return;
  }
  emit('issue', {
    action: 'ISSUE', targetType: target, reason: issueForm.reason.trim(),
    ...(target === 'SITE' ? { siteId: issueForm.siteId } : {}),
    ...(target === 'WORKFRONT' ? { workfrontId: issueForm.workfrontId } : {}),
    ...(target === 'PERMIT' ? { permitId: issueForm.permitId } : {}),
    ...(issueForm.hseIncidentId.trim() ? { hseIncidentId: issueForm.hseIncidentId.trim() } : {})
  });
  showIssue.value = false;
}

function submitLift(): void {
  error.value = '';
  if (!liftForm.liftsActionId) {
    error.value = 'Chọn lệnh dừng ISSUE cần gỡ.';
    return;
  }
  if (liftForm.reason.trim().length < 3) {
    error.value = 'Lý do gỡ lệnh dừng phải có ít nhất 3 ký tự.';
    return;
  }
  const verifiedControls = parseReferenceLines(liftForm.verifiedControlsText);
  if (!verifiedControls.length) {
    error.value = 'Phải ghi ít nhất một biện pháp đã kiểm chứng (mỗi dòng một biện pháp).';
    return;
  }
  emit('lift', {
    action: 'LIFT', liftsActionId: liftForm.liftsActionId,
    reason: liftForm.reason.trim(), verifiedControls
  });
  showLift.value = false;
}

function openLift(actionId: string): void {
  liftForm.liftsActionId = actionId;
  liftForm.reason = '';
  liftForm.verifiedControlsText = '';
  showLift.value = true;
  error.value = '';
}

defineExpose({ openLift });
</script>

<template>
  <section class="field-panel stop-work-panel" aria-labelledby="stop-work-panel-title">
    <div class="detail-heading">
      <div>
        <small>STOP-WORK LEDGER · API-094</small>
        <h2 id="stop-work-panel-title">Lệnh dừng việc</h2>
        <p class="lead">
          Ai cũng có thể ra lệnh dừng khi thấy mất an toàn; chỉ vai trò giữ quyền stopWork.lift mới
          được gỡ. Sổ dưới đây là các bản ghi phiên làm việc này đã ghi nhận.
        </p>
      </div>
      <div class="field-panel__actions">
        <el-button v-if="permissions.issue" type="danger" @click="showIssue = !showIssue">Ra lệnh dừng việc</el-button>
        <el-button v-if="permissions.lift" plain @click="showLift = !showLift">Gỡ lệnh dừng</el-button>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p v-if="!permissions.lift" class="stop-work-lift-note">
      Tài khoản này không giữ quyền <strong>stopWork.lift</strong>; màn hình không hiển thị thao tác
      gỡ lệnh dừng.
    </p>

    <form v-if="showIssue && permissions.issue" class="field-inline-form" @submit.prevent="submitIssue">
      <label>Phạm vi dừng<select v-model="issueForm.targetType" aria-label="Phạm vi dừng việc"><option v-for="item in STOP_WORK_TARGET_TYPES" :key="item" :value="item">{{ STOP_WORK_TARGET_LABEL[item] }}</option></select></label>
      <label v-if="issueForm.targetType === 'SITE'">Công trường<select v-model="issueForm.siteId" required aria-label="Công trường bị dừng"><option disabled value="">Chọn công trường</option><option v-for="item in sites" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <label v-if="issueForm.targetType === 'WORKFRONT'">Workfront<select v-model="issueForm.workfrontId" required aria-label="Workfront bị dừng"><option disabled value="">Chọn workfront</option><option v-for="item in workfronts" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <label v-if="issueForm.targetType === 'PERMIT'">Permit<select v-model="issueForm.permitId" required aria-label="Permit bị dừng"><option disabled value="">Chọn permit</option><option v-for="item in permits" :key="item.id" :value="item.id">{{ item.permitType }} · {{ item.id }}</option></select></label>
      <label>Sự cố HSE liên quan<input v-model.trim="issueForm.hseIncidentId" placeholder="UUID sự cố (không bắt buộc)" /></label>
      <label class="form-wide">Lý do dừng việc<textarea v-model="issueForm.reason" required rows="2" maxlength="2000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showIssue = false">Hủy</el-button>
        <el-button native-type="submit" type="danger" :loading="busy">Ghi lệnh dừng</el-button>
      </div>
    </form>

    <form v-if="showLift && permissions.lift" class="field-inline-form stop-work-lift-form" @submit.prevent="submitLift">
      <h3 class="form-wide">Gỡ lệnh dừng việc</h3>
      <label class="form-wide">Lệnh dừng cần gỡ<select v-model="liftForm.liftsActionId" required aria-label="Lệnh dừng cần gỡ"><option disabled value="">Chọn bản ghi ISSUE</option><option v-for="item in openIssues" :key="item.id" :value="item.id">{{ STOP_WORK_TARGET_LABEL[item.targetType] }} · {{ targetLabel(item) }} · {{ item.reason }}</option></select></label>
      <label class="form-wide">Lý do gỡ<textarea v-model="liftForm.reason" required rows="2" maxlength="2000"></textarea></label>
      <label class="form-wide">Biện pháp đã kiểm chứng (bắt buộc, mỗi dòng một biện pháp)<textarea v-model="liftForm.verifiedControlsText" required rows="3"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showLift = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Ghi lệnh gỡ</el-button>
      </div>
    </form>

    <div v-if="!actions.length" class="empty-panel">
      <h3>Phiên này chưa ghi nhận lệnh dừng nào</h3>
      <p>
        Catalog không có API đọc sổ lệnh dừng, nên đây không phải toàn bộ lịch sử dừng việc của dự
        án. Server vẫn từ chối release/cấp permit nếu còn lệnh dừng chưa gỡ.
      </p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table stop-work-table">
        <thead>
          <tr>
            <th>Loại</th>
            <th>Phạm vi</th>
            <th>Lý do</th>
            <th>Biện pháp kiểm chứng</th>
            <th>Thời điểm</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in actions" :key="row.id" :data-action="row.action">
            <td><span class="status-pill" :data-status="row.action">{{ row.action === 'ISSUE' ? 'Dừng việc' : 'Gỡ lệnh dừng' }}</span></td>
            <td><strong>{{ STOP_WORK_TARGET_LABEL[row.targetType] }}</strong><span>{{ targetLabel(row) }}</span></td>
            <td>{{ row.reason }}</td>
            <td>
              <ul v-if="row.verifiedControls.length" class="reference-list">
                <li v-for="control in row.verifiedControls" :key="control">{{ control }}</li>
              </ul>
              <span v-else>—</span>
            </td>
            <td>{{ row.actedAt }}</td>
            <td>
              <template v-if="row.action === 'ISSUE' && openIssues.some((item) => item.id === row.id)">
                <el-button v-if="permissions.lift && !selfIssued(row)" text @click="openLift(row.id)">Gỡ</el-button>
                <span v-else-if="permissions.lift">SoD: người ra lệnh không được tự gỡ</span>
                <span v-else>Chưa gỡ</span>
              </template>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
