<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  DAILY_LOG_SHIFTS, DAILY_LOG_SHIFT_LABEL, DAILY_LOG_STATUS_LABEL
} from '@/constants/field-hse';
import type {
  CreateDailyLogRequest, DailyLogShift, DailyLogView, SubmitDailyLogRequest
} from '@/types/field-hse.types';
import type { Company, Site } from '@/types/project.types';

/**
 * API-088/API-089 — daily log lifecycle.
 *
 * A correction is NOT an edit: the server writes a new row at revision + 1 for the same slot and
 * moves the SIGNED original to SUPERSEDED in the same transaction, so this panel never offers a way
 * to change a stored row. `reason` is mandatory on that path and is enforced here as well as by
 * `ck_daily_log_correction`.
 */
defineProps<{
  logs: DailyLogView[];
  sites: Site[];
  companies: Company[];
  busy: boolean;
  permissions: { create: boolean; submit: boolean };
}>();
const emit = defineEmits<{
  create: [input: CreateDailyLogRequest];
  submit: [dailyLogId: string, input: SubmitDailyLogRequest];
}>();

const error = ref('');
const showCreate = ref(false);
const correcting = ref<DailyLogView | null>(null);

const today = new Date().toISOString().slice(0, 10);
const createForm = reactive({
  siteId: '', contractorCompanyId: '', logDate: today, shift: 'DAY' as DailyLogShift, summary: ''
});
const correctionForm = reactive({ summary: '', reason: '' });

function submitCreate(): void {
  error.value = '';
  if (!createForm.siteId || !createForm.contractorCompanyId) {
    error.value = 'Chọn công trường và nhà thầu của ca làm việc.';
    return;
  }
  if (createForm.summary.trim().length < 3) {
    error.value = 'Tóm tắt nhật ký phải có ít nhất 3 ký tự.';
    return;
  }
  emit('create', {
    siteId: createForm.siteId, contractorCompanyId: createForm.contractorCompanyId,
    logDate: createForm.logDate, shift: createForm.shift, summary: createForm.summary.trim()
  });
  showCreate.value = false;
  createForm.summary = '';
}

function openCorrection(log: DailyLogView): void {
  correcting.value = log;
  correctionForm.summary = log.summary;
  correctionForm.reason = '';
  error.value = '';
}

function submitCorrection(): void {
  const original = correcting.value;
  if (!original) return;
  error.value = '';
  if (correctionForm.summary.trim().length < 3) {
    error.value = 'Nội dung đính chính phải có ít nhất 3 ký tự.';
    return;
  }
  // FR-080: an amendment without a stated reason is not an amendment, it is a rewrite.
  if (correctionForm.reason.trim().length < 3) {
    error.value = 'Đính chính bắt buộc phải có lý do (ít nhất 3 ký tự).';
    return;
  }
  emit('create', {
    siteId: original.siteId, contractorCompanyId: original.contractorCompanyId,
    logDate: original.logDate, shift: original.shift,
    summary: correctionForm.summary.trim(), correctionOfId: original.id,
    reason: correctionForm.reason.trim()
  });
  correcting.value = null;
}
</script>

<template>
  <section class="field-panel daily-log-panel" aria-labelledby="daily-log-title">
    <div class="detail-heading">
      <div>
        <small>DAILY LOG · API-088/089</small>
        <h2 id="daily-log-title">Nhật ký thi công</h2>
        <p class="lead">
          Một slot (công trường · nhà thầu · ngày · ca) chỉ có một bản đang hiệu lực. Đính chính là
          bản ghi mới ở revision kế tiếp, bản đã ký chuyển sang SUPERSEDED.
        </p>
      </div>
      <el-button v-if="permissions.create" @click="showCreate = !showCreate">Tạo nhật ký</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="showCreate && permissions.create" class="field-inline-form" @submit.prevent="submitCreate">
      <label>Công trường<select v-model="createForm.siteId" required aria-label="Công trường nhật ký"><option disabled value="">Chọn công trường</option><option v-for="item in sites" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <label>Nhà thầu<select v-model="createForm.contractorCompanyId" required aria-label="Nhà thầu nhật ký"><option disabled value="">Chọn nhà thầu</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>Ngày<input v-model="createForm.logDate" type="date" required /></label>
      <label>Ca<select v-model="createForm.shift" required aria-label="Ca làm việc"><option v-for="item in DAILY_LOG_SHIFTS" :key="item" :value="item">{{ DAILY_LOG_SHIFT_LABEL[item] }}</option></select></label>
      <label class="form-wide">Tóm tắt công việc<textarea v-model="createForm.summary" required rows="3" maxlength="4000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showCreate = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Lưu nhật ký</el-button>
      </div>
    </form>

    <div v-if="!logs.length" class="empty-panel">
      <h3>Phiên này chưa có nhật ký nào</h3>
      <p>Catalog chưa có API đọc nhật ký, nên bảng dưới chỉ hiển thị các bản ghi phiên này đã tạo.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table daily-log-table">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Revision</th>
            <th>Trạng thái</th>
            <th>Tóm tắt</th>
            <th>Ký</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="log.id" :data-status="log.status">
            <td><strong>{{ log.logDate }} · {{ DAILY_LOG_SHIFT_LABEL[log.shift] }}</strong><span>{{ log.siteId }}</span></td>
            <td>
              rev {{ log.revision }}
              <span v-if="log.correctionOfId" class="daily-log-correction">Đính chính · {{ log.reason }}</span>
            </td>
            <td><span class="status-pill" :data-status="log.status">{{ DAILY_LOG_STATUS_LABEL[log.status] }}</span></td>
            <td>{{ log.summary }}</td>
            <td>
              <template v-if="log.signedAt">
                <strong>Đã ký</strong><span>{{ log.signedAt }}</span>
              </template>
              <span v-else>—</span>
            </td>
            <td>
              <el-button v-if="permissions.submit && log.status === 'DRAFT'" text :loading="busy" @click="emit('submit', log.id, { expectedVersion: log.versionNo, action: 'SUBMIT' })">Trình</el-button>
              <el-button v-else-if="permissions.submit && log.status === 'SUBMITTED'" text :loading="busy" @click="emit('submit', log.id, { expectedVersion: log.versionNo, action: 'SIGN' })">Ký</el-button>
              <el-button v-else-if="permissions.create && log.status === 'SIGNED'" text @click="openCorrection(log)">Đính chính</el-button>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="correcting" class="field-inline-form daily-log-correction-form" @submit.prevent="submitCorrection">
      <h3 class="form-wide">Đính chính nhật ký {{ correcting.logDate }} · {{ DAILY_LOG_SHIFT_LABEL[correcting.shift] }} (rev {{ correcting.revision }})</h3>
      <p class="form-wide">Bản đính chính là revision {{ correcting.revision + 1 }} của cùng slot; bản đã ký được giữ nguyên và chuyển sang SUPERSEDED.</p>
      <label class="form-wide">Nội dung sau đính chính<textarea v-model="correctionForm.summary" required rows="3" maxlength="4000"></textarea></label>
      <label class="form-wide">Lý do đính chính (bắt buộc)<textarea v-model="correctionForm.reason" required rows="2" maxlength="2000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="correcting = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Ghi bản đính chính</el-button>
      </div>
    </form>
  </section>
</template>
