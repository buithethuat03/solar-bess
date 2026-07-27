<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  PERMIT_STATUS_LABEL, PERMIT_TYPE_PATTERN, parseReferenceLines
} from '@/constants/field-hse';
import type {
  CreatePermitToWorkRequest, IssuePermitToWorkRequest, PermitToWorkView, WorkfrontView
} from '@/types/field-hse.types';

/**
 * API-091/API-092 — permit to work.
 *
 * Two refusals the UI must speak before the server has to: the requester can never be the issuer
 * (`ck_permit_issuer_independent`), and an unlifted stop-work over the permit's reach refuses the
 * issue (`STOP_WORK_ACTIVE`). The issue control is therefore never offered to the requester, and it
 * is rendered DISABLED — not hidden — while a stop-work stands, so the reason stays visible.
 */
const props = defineProps<{
  workfront: WorkfrontView | null;
  permits: PermitToWorkView[];
  busy: boolean;
  currentUserId: string | null;
  stopWorkBlocked: boolean;
  permissions: { request: boolean; issue: boolean };
}>();
const emit = defineEmits<{
  request: [input: CreatePermitToWorkRequest];
  issue: [permitId: string, input: IssuePermitToWorkRequest];
}>();

const error = ref('');
const showRequest = ref(false);
const issuing = ref<PermitToWorkView | null>(null);

const requestForm = reactive({ permitType: 'HOT_WORK', description: '', validFrom: '', validTo: '' });
const issueForm = reactive({ isolationText: '' });

/** REQUESTED/VERIFIED are the only states API-092 accepts. */
function issuable(permit: PermitToWorkView): boolean {
  return permit.status === 'REQUESTED' || permit.status === 'VERIFIED';
}

function isRequester(permit: PermitToWorkView): boolean {
  return props.currentUserId !== null && props.currentUserId === permit.requestedBy;
}

function submitRequest(): void {
  error.value = '';
  if (!PERMIT_TYPE_PATTERN.test(requestForm.permitType.trim())) {
    error.value = 'Loại permit phải viết hoa, bắt đầu bằng chữ cái (VD: HOT_WORK, LOTO).';
    return;
  }
  if (!requestForm.validFrom || !requestForm.validTo) {
    error.value = 'Nhập thời hạn hiệu lực của permit.';
    return;
  }
  const from = new Date(requestForm.validFrom);
  const to = new Date(requestForm.validTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    error.value = 'Thời hạn permit phải kết thúc sau khi bắt đầu.';
    return;
  }
  emit('request', {
    permitType: requestForm.permitType.trim(),
    validFrom: from.toISOString(), validTo: to.toISOString(),
    ...(requestForm.description.trim() ? { description: requestForm.description.trim() } : {})
  });
  showRequest.value = false;
}

function openIssue(permit: PermitToWorkView): void {
  issuing.value = permit;
  issueForm.isolationText = '';
  error.value = '';
}

function submitIssue(): void {
  const permit = issuing.value;
  if (!permit) return;
  error.value = '';
  const points = parseReferenceLines(issueForm.isolationText);
  if (!points.length) {
    error.value = 'Ảnh chụp cô lập phải có ít nhất một điểm (mỗi dòng một điểm).';
    return;
  }
  emit('issue', permit.id, {
    expectedVersion: permit.versionNo,
    isolationSnapshot: points.map((point) => ({ point }))
  });
  issuing.value = null;
}
</script>

<template>
  <section class="field-panel permit-panel" aria-labelledby="permit-panel-title">
    <div class="detail-heading">
      <div>
        <small>PERMIT TO WORK · API-091/092</small>
        <h2 id="permit-panel-title">Giấy phép làm việc {{ workfront ? `· ${workfront.code}` : '' }}</h2>
        <p class="lead">
          Người yêu cầu permit không bao giờ là người cấp permit; ảnh chụp cô lập được ghi tại thời
          điểm cấp.
        </p>
      </div>
      <el-button
        v-if="workfront && permissions.request"
        @click="showRequest = !showRequest"
      >
        Yêu cầu permit
      </el-button>
    </div>

    <div v-if="!workfront" class="empty-panel">
      <h3>Chọn một workfront</h3>
      <p>Permit gắn với một workfront cụ thể; mở một dòng trong register để yêu cầu hoặc cấp permit.</p>
    </div>
    <template v-else>
      <el-alert v-if="error" type="error" :title="error" show-icon />

      <p v-if="stopWorkBlocked" class="permit-blocked-note">
        Đang có lệnh dừng việc chưa gỡ trong phạm vi này — thao tác cấp permit bị khóa.
      </p>

      <form v-if="showRequest && permissions.request" class="field-inline-form" @submit.prevent="submitRequest">
        <label>Loại permit<input v-model.trim="requestForm.permitType" required maxlength="40" placeholder="HOT_WORK" /></label>
        <label>Hiệu lực từ<input v-model="requestForm.validFrom" type="datetime-local" required /></label>
        <label>Hiệu lực đến<input v-model="requestForm.validTo" type="datetime-local" required /></label>
        <label class="form-wide">Mô tả công việc<textarea v-model="requestForm.description" rows="2" maxlength="2000"></textarea></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="showRequest = false">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Gửi yêu cầu</el-button>
        </div>
      </form>

      <div v-if="!permits.length" class="empty-panel">
        <h3>Phiên này chưa có permit nào</h3>
        <p>Catalog chưa có API đọc permit; bảng dưới chỉ hiển thị các permit phiên này đã tạo hoặc cấp.</p>
      </div>
      <div v-else class="table-shell">
        <table class="data-table permit-table">
          <thead>
            <tr>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>Hiệu lực</th>
              <th>Người yêu cầu</th>
              <th>Người cấp</th>
              <th>Điểm cô lập</th>
              <th><span class="sr-only">Hành động</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="permit in permits" :key="permit.id" :data-status="permit.status">
              <td><strong>{{ permit.permitType }}</strong><span>{{ permit.description ?? '—' }}</span></td>
              <td><span class="status-pill" :data-status="permit.status">{{ PERMIT_STATUS_LABEL[permit.status] }}</span></td>
              <td>{{ permit.validFrom }}<span>→ {{ permit.validTo }}</span></td>
              <td>{{ permit.requestedBy }}</td>
              <td>
                <template v-if="permit.issuerId">
                  <strong>{{ permit.issuerId }}</strong><span>{{ permit.issuedAt }}</span>
                </template>
                <span v-else>Chưa cấp</span>
              </td>
              <td>{{ permit.isolationSnapshot ? `${permit.isolationSnapshot.length} điểm` : '—' }}</td>
              <td>
                <template v-if="issuable(permit)">
                  <span v-if="isRequester(permit)" class="permit-sod-note">SoD: người yêu cầu không được tự cấp</span>
                  <template v-else-if="permissions.issue">
                    <el-button
                      type="primary"
                      plain
                      :disabled="stopWorkBlocked"
                      :loading="busy && !stopWorkBlocked"
                      @click="openIssue(permit)"
                    >
                      Cấp permit
                    </el-button>
                    <span v-if="stopWorkBlocked" class="stop-work-chip__hint">Bị khóa bởi lệnh dừng việc chưa gỡ.</span>
                  </template>
                  <span v-else>Chờ người có quyền cấp</span>
                </template>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form v-if="issuing" class="field-inline-form permit-issue-form" @submit.prevent="submitIssue">
        <h3 class="form-wide">Cấp permit {{ issuing.permitType }}</h3>
        <label class="form-wide">Điểm cô lập đã kiểm chứng (bắt buộc, mỗi dòng một điểm)<textarea v-model="issueForm.isolationText" required rows="3"></textarea></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="issuing = null">Hủy</el-button>
          <el-button native-type="submit" type="primary" :disabled="stopWorkBlocked" :loading="busy && !stopWorkBlocked">Ghi nhận cấp permit</el-button>
        </div>
      </form>
    </template>
  </section>
</template>
