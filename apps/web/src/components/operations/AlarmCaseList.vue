<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ALARM_CASE_STATE_LABEL, SEVERITY_LABEL } from '@/constants/operations';
import type { AcknowledgeAlarmCaseRequest, AlarmCaseView } from '@/types/operations.types';

/**
 * API-114/API-115 — the LOCAL alarm-case register.
 *
 * Acknowledging here writes four columns on the PM Web row and nothing else. It does not clear,
 * reset or suppress the alarm in the source system, and it cannot: no request field, no code path
 * and no credential in PM Web can address OT (SEC-127/SEC-128, AGENTS.md §11). The copy says so
 * next to the button rather than in a tooltip, because someone standing in front of a live plant
 * needs to know that this button changed a record and not the plant.
 *
 * A replay is a harmless no-op: the server keeps the first acknowledgement, does not bump the
 * version and answers `acknowledgementApplied: false`.
 */
const props = defineProps<{
  cases: AlarmCaseView[];
  nextCursor: string | null;
  busy: boolean;
  canAcknowledge: boolean;
  /** Set by the view from the last API-115 response so a replay reads as a no-op, not an error. */
  lastAcknowledgeNoop: boolean;
}>();
const emit = defineEmits<{
  more: [];
  acknowledge: [alarmCaseId: string, input: AcknowledgeAlarmCaseRequest];
}>();

const error = ref('');
const acknowledging = ref<AlarmCaseView | null>(null);
const form = reactive({ note: '' });

// A refreshed page must not leave the form open over a row that has already been acknowledged.
watch(() => props.cases, () => { acknowledging.value = null; error.value = ''; });

function open(row: AlarmCaseView): void {
  acknowledging.value = row;
  form.note = '';
  error.value = '';
}

function submit(): void {
  const row = acknowledging.value;
  if (!row) return;
  const note = form.note.trim();
  // The API accepts 3–2000 characters or nothing at all; a one-character note is a 400.
  if (note.length > 0 && note.length < 3) {
    error.value = 'Ghi chú phải có ít nhất 3 ký tự, hoặc để trống.';
    return;
  }
  emit('acknowledge', row.id, {
    expectedVersion: row.versionNo, ...(note ? { note } : {})
  });
  acknowledging.value = null;
}
</script>

<template>
  <section class="operations-panel alarm-case-list" aria-labelledby="alarm-case-title">
    <div class="detail-heading">
      <div>
        <small>ALARM CASE · API-114/115</small>
        <h2 id="alarm-case-title">Alarm case cục bộ</h2>
        <p class="lead">Hồ sơ cảnh báo của PM Web. Trạng thái ở đây không mô tả trạng thái nhà máy.</p>
      </div>
    </div>

    <p class="local-only-banner" data-testid="alarm-local-scope">
      <strong>Chỉ ghi nhận cục bộ.</strong>
      Ghi nhận (acknowledge) chỉ cập nhật hồ sơ trong PM Web. Thao tác này
      <b>không xóa, không reset và không suppress</b> cảnh báo tại hệ thống nguồn (SCADA/EMS/BMS).
      Muốn tác động tới nguồn phải thực hiện tại chính hệ thống đó.
    </p>
    <p v-if="lastAcknowledgeNoop" class="immutable-banner" data-testid="alarm-replay-note">
      Case này đã được ghi nhận trước đó. Lần gọi lại là no-op vô hại: bản ghi, version và vết
      audit giữ nguyên như lần ghi nhận đầu tiên.
    </p>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <div v-if="!cases.length" class="empty-panel">
      <h3>Chưa có alarm case</h3>
      <p>Site chưa có case cục bộ nào trong scope được phép, hoặc bộ lọc đang thu hẹp kết quả.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table operations-table">
        <thead>
          <tr>
            <th>Mức độ</th>
            <th>Trạng thái cục bộ</th>
            <th>Lần đầu → gần nhất</th>
            <th>Nguồn OT</th>
            <th>Ghi nhận</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in cases" :key="row.id" :data-severity="row.severity">
            <td><span class="status-pill" :data-status="row.severity">{{ SEVERITY_LABEL[row.severity] }}</span></td>
            <td><span class="status-pill" :data-status="row.state">{{ ALARM_CASE_STATE_LABEL[row.state] }}</span></td>
            <td>
              <strong>{{ new Date(row.firstSeenAt).toLocaleString('vi-VN') }}</strong>
              <span>→ {{ new Date(row.lastSeenAt).toLocaleString('vi-VN') }}</span>
            </td>
            <td>
              <strong>{{ row.sourceEventRefs.length }} tham chiếu sự kiện</strong>
              <span>Chất lượng nguồn: {{ row.sourceQuality ?? 'không được khai báo' }}</span>
            </td>
            <td>
              <template v-if="row.acknowledgedBy">
                <strong>{{ new Date(row.acknowledgedAt ?? row.updatedAt).toLocaleString('vi-VN') }}</strong>
                <span>{{ row.acknowledgmentNote ?? 'Không kèm ghi chú' }}</span>
              </template>
              <span v-else>Chưa ghi nhận</span>
            </td>
            <td>
              <el-button v-if="canAcknowledge && !row.acknowledgedBy" text @click="open(row)">
                Ghi nhận cục bộ
              </el-button>
              <span v-else-if="row.acknowledgedBy">Đã ghi nhận</span>
              <span v-else>Không có quyền</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-button v-if="nextCursor" :loading="busy" @click="emit('more')">Tải thêm alarm case</el-button>

    <form v-if="acknowledging" class="operations-inline-form" @submit.prevent="submit">
      <h3 class="form-wide">Ghi nhận cục bộ case {{ acknowledging.severity }}</h3>
      <p class="form-wide muted-inline">
        Chỉ ghi vào hồ sơ PM Web (state, người ghi nhận, thời điểm, ghi chú). Cảnh báo tại hệ thống
        nguồn giữ nguyên.
      </p>
      <label class="form-wide">
        Ghi chú cục bộ (tùy chọn, ≥3 ký tự)
        <textarea v-model="form.note" rows="2" maxlength="2000"></textarea>
      </label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="acknowledging = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Ghi nhận (chỉ cục bộ)</el-button>
      </div>
    </form>
  </section>
</template>
