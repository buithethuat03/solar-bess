<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  SERVICE_INCIDENT_STATUS_LABEL, SEVERITIES, SEVERITY_LABEL
} from '@/constants/operations';
import type {
  AlarmCaseView, CreateServiceIncidentRequest, ServiceIncidentSeverity, ServiceIncidentView
} from '@/types/operations.types';

/**
 * API-116/API-117 — the service-incident and SLA register of one site.
 *
 * An incident is born OPEN. The downtime window and both SLA clocks are optional because a field
 * report routinely arrives before either is known, and the API refuses a downtime end without a
 * start (DOWNTIME_START_REQUIRED) or an end before its start (DOWNTIME_WINDOW_INVALID) — both are
 * pre-checked here so the operator is not told about it after the round trip.
 *
 * There is no status transition control: the V1 catalog has no operation that moves an incident
 * past OPEN, so the panel names the vocabulary without offering a button nothing can honour.
 */
const props = defineProps<{
  incidents: ServiceIncidentView[];
  /** Cases of this site, offered as the incident's origin; the API validates the link. */
  alarmCases: AlarmCaseView[];
  assetId: string;
  nextCursor: string | null;
  busy: boolean;
  canCreate: boolean;
}>();
const emit = defineEmits<{
  more: [];
  create: [input: CreateServiceIncidentRequest];
}>();

const error = ref('');
const showCreate = ref(false);
const form = reactive({
  severity: 'MEDIUM' as ServiceIncidentSeverity,
  title: '', description: '', detectedAt: '', downtimeStart: '', downtimeEnd: '',
  slaResponseDueAt: '', slaResolutionDueAt: '', alarmCaseId: '', linkAsset: true
});

/** `datetime-local` gives no zone; the API wants ISO-8601, so the local value is normalised. */
function isoOrUndefined(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function submit(): void {
  error.value = '';
  if (form.title.trim().length < 3) {
    error.value = 'Tiêu đề sự cố phải có ít nhất 3 ký tự.';
    return;
  }
  const detectedAt = isoOrUndefined(form.detectedAt);
  if (!detectedAt) {
    error.value = 'Thời điểm phát hiện là bắt buộc.';
    return;
  }
  const downtimeStart = isoOrUndefined(form.downtimeStart);
  const downtimeEnd = isoOrUndefined(form.downtimeEnd);
  if (downtimeEnd && !downtimeStart) {
    error.value = 'Phải khai báo thời điểm bắt đầu gián đoạn trước khi khai báo thời điểm kết thúc.';
    return;
  }
  if (downtimeStart && downtimeEnd && new Date(downtimeEnd) < new Date(downtimeStart)) {
    error.value = 'Thời điểm kết thúc gián đoạn phải sau thời điểm bắt đầu.';
    return;
  }
  emit('create', {
    severity: form.severity, title: form.title.trim(), detectedAt,
    ...(form.linkAsset ? { assetId: props.assetId } : {}),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(downtimeStart ? { downtimeStart } : {}),
    ...(downtimeEnd ? { downtimeEnd } : {}),
    ...(isoOrUndefined(form.slaResponseDueAt) ? { slaResponseDueAt: isoOrUndefined(form.slaResponseDueAt)! } : {}),
    ...(isoOrUndefined(form.slaResolutionDueAt) ? { slaResolutionDueAt: isoOrUndefined(form.slaResolutionDueAt)! } : {}),
    ...(form.alarmCaseId ? { alarmCaseId: form.alarmCaseId } : {})
  });
  showCreate.value = false;
}
</script>

<template>
  <section class="operations-panel service-incident-panel" aria-labelledby="service-incident-title">
    <div class="detail-heading">
      <div>
        <small>SERVICE INCIDENT · API-116/117</small>
        <h2 id="service-incident-title">Sự cố dịch vụ &amp; SLA</h2>
        <p class="lead">Sự cố mở ở trạng thái OPEN; đồng hồ SLA và cửa sổ gián đoạn có thể bổ sung sau.</p>
      </div>
      <el-button v-if="canCreate" @click="showCreate = !showCreate">Mở sự cố</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="showCreate && canCreate" class="operations-inline-form" @submit.prevent="submit">
      <label>
        Mức độ
        <select v-model="form.severity" aria-label="Mức độ sự cố">
          <option v-for="item in SEVERITIES" :key="item" :value="item">{{ SEVERITY_LABEL[item] }}</option>
        </select>
      </label>
      <label>Thời điểm phát hiện<input v-model="form.detectedAt" type="datetime-local" required /></label>
      <label>
        Alarm case nguồn
        <select v-model="form.alarmCaseId" aria-label="Alarm case nguồn">
          <option value="">Không gắn case</option>
          <option v-for="item in alarmCases" :key="item.id" :value="item.id">
            {{ SEVERITY_LABEL[item.severity] }} · {{ new Date(item.firstSeenAt).toLocaleString('vi-VN') }}
          </option>
        </select>
      </label>
      <label class="form-wide">Tiêu đề<input v-model.trim="form.title" required maxlength="400" /></label>
      <label class="form-wide">Mô tả<textarea v-model="form.description" rows="2" maxlength="4000"></textarea></label>
      <label>Bắt đầu gián đoạn<input v-model="form.downtimeStart" type="datetime-local" /></label>
      <label>Kết thúc gián đoạn<input v-model="form.downtimeEnd" type="datetime-local" /></label>
      <label>Hạn phản hồi SLA<input v-model="form.slaResponseDueAt" type="datetime-local" /></label>
      <label>Hạn khắc phục SLA<input v-model="form.slaResolutionDueAt" type="datetime-local" /></label>
      <label class="check-label form-wide">
        <input v-model="form.linkAsset" type="checkbox" />
        Gắn sự cố vào asset đang xem ({{ assetId }})
      </label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showCreate = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Mở sự cố</el-button>
      </div>
    </form>

    <div v-if="!incidents.length" class="empty-panel">
      <h3>Chưa có sự cố dịch vụ</h3>
      <p>Site chưa ghi nhận sự cố nào trong scope được phép.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table operations-table">
        <thead>
          <tr>
            <th>Sự cố</th>
            <th>Mức độ</th>
            <th>Trạng thái</th>
            <th>Phát hiện</th>
            <th>Gián đoạn</th>
            <th>SLA</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in incidents" :key="row.id" :data-severity="row.severity">
            <td><strong>{{ row.title }}</strong><span>{{ row.description ?? 'Không có mô tả' }}</span></td>
            <td><span class="status-pill" :data-status="row.severity">{{ SEVERITY_LABEL[row.severity] }}</span></td>
            <td><span class="status-pill" :data-status="row.status">{{ SERVICE_INCIDENT_STATUS_LABEL[row.status] }}</span></td>
            <td>{{ new Date(row.detectedAt).toLocaleString('vi-VN') }}</td>
            <td>
              <template v-if="row.downtimeStart">
                <strong>{{ new Date(row.downtimeStart).toLocaleString('vi-VN') }}</strong>
                <span>{{ row.downtimeEnd ? `→ ${new Date(row.downtimeEnd).toLocaleString('vi-VN')}` : 'chưa kết thúc' }}</span>
              </template>
              <span v-else>Chưa khai báo</span>
            </td>
            <td>
              <strong>Phản hồi: {{ row.slaResponseDueAt ? new Date(row.slaResponseDueAt).toLocaleString('vi-VN') : 'chưa đặt' }}</strong>
              <span>Khắc phục: {{ row.slaResolutionDueAt ? new Date(row.slaResolutionDueAt).toLocaleString('vi-VN') : 'chưa đặt' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-button v-if="nextCursor" :loading="busy" @click="emit('more')">Tải thêm sự cố</el-button>
  </section>
</template>
