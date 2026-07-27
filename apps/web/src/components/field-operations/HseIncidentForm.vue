<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  HSE_INCIDENT_TYPES, HSE_INCIDENT_TYPE_LABEL, HSE_SEVERITIES, HSE_SEVERITY_LABEL
} from '@/constants/field-hse';
import type {
  HseIncidentType, HseIncidentView, HseSeverity, ReportHseIncidentRequest
} from '@/types/field-hse.types';
import type { Site } from '@/types/project.types';

/**
 * API-093 — reporting an HSE incident is NEVER blocked.
 *
 * This component takes no permission prop, no workfront state, no permit state and no stop-work
 * gate. `stopWorkActive` exists only to say out loud that reporting still works while work is
 * stopped; it must never become a condition on rendering or on the submit control. The single
 * disabled window is the component's own in-flight submit.
 *
 * SEC-130: `restricted_facts` never leaves the row, so this form neither collects nor renders it.
 */
defineProps<{
  sites: Site[];
  /** Purely informational. NEVER gate rendering or the submit button on this. */
  stopWorkActive: boolean;
  submitting: boolean;
  lastReported: HseIncidentView | null;
}>();
const emit = defineEmits<{ report: [input: ReportHseIncidentRequest] }>();

const error = ref('');
const form = reactive({
  siteId: '', occurredAt: '', incidentType: 'NEAR_MISS' as HseIncidentType,
  actualSeverity: 'LOW' as HseSeverity, potentialSeverity: 'MEDIUM' as HseSeverity,
  narrative: '', immediateAction: ''
});

function submit(): void {
  error.value = '';
  if (!form.occurredAt) {
    error.value = 'Nhập thời điểm xảy ra sự cố.';
    return;
  }
  const occurredAt = new Date(form.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    error.value = 'Thời điểm xảy ra sự cố không hợp lệ.';
    return;
  }
  if (occurredAt.getTime() > Date.now()) {
    error.value = 'Thời điểm xảy ra sự cố không thể ở tương lai.';
    return;
  }
  if (form.narrative.trim().length < 3) {
    error.value = 'Mô tả diễn biến phải có ít nhất 3 ký tự.';
    return;
  }
  emit('report', {
    occurredAt: occurredAt.toISOString(), incidentType: form.incidentType,
    actualSeverity: form.actualSeverity, potentialSeverity: form.potentialSeverity,
    narrative: form.narrative.trim(),
    ...(form.siteId ? { siteId: form.siteId } : {}),
    ...(form.immediateAction.trim() ? { immediateAction: form.immediateAction.trim() } : {})
  });
  form.narrative = '';
  form.immediateAction = '';
}
</script>

<template>
  <section class="field-panel hse-incident-panel" aria-labelledby="hse-incident-title">
    <div class="detail-heading">
      <div>
        <small>HSE INCIDENT · API-093</small>
        <h2 id="hse-incident-title">Báo cáo sự cố HSE</h2>
        <p class="lead">
          Báo cáo sự cố không bao giờ bị chặn: không phụ thuộc trạng thái workfront, permit hay lệnh
          dừng việc.
        </p>
      </div>
    </div>

    <p v-if="stopWorkActive" class="hse-incident-open-note">
      Đang có lệnh dừng việc — biểu mẫu này vẫn hoạt động bình thường.
    </p>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form class="field-inline-form hse-incident-form" @submit.prevent="submit">
      <label>Công trường<select v-model="form.siteId" aria-label="Công trường xảy ra sự cố"><option value="">Không xác định công trường</option><option v-for="item in sites" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <label>Thời điểm xảy ra<input v-model="form.occurredAt" type="datetime-local" required /></label>
      <label>Loại sự cố<select v-model="form.incidentType" required aria-label="Loại sự cố"><option v-for="item in HSE_INCIDENT_TYPES" :key="item" :value="item">{{ HSE_INCIDENT_TYPE_LABEL[item] }}</option></select></label>
      <label>Mức độ thực tế<select v-model="form.actualSeverity" required aria-label="Mức độ thực tế"><option v-for="item in HSE_SEVERITIES" :key="item" :value="item">{{ HSE_SEVERITY_LABEL[item] }}</option></select></label>
      <label>Mức độ tiềm ẩn<select v-model="form.potentialSeverity" required aria-label="Mức độ tiềm ẩn"><option v-for="item in HSE_SEVERITIES" :key="item" :value="item">{{ HSE_SEVERITY_LABEL[item] }}</option></select></label>
      <label class="form-wide">Diễn biến<textarea v-model="form.narrative" required rows="3" maxlength="4000"></textarea></label>
      <label class="form-wide">Biện pháp xử lý ngay<textarea v-model="form.immediateAction" rows="2" maxlength="4000"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="submit" type="danger" :loading="submitting">Gửi báo cáo sự cố</el-button>
      </div>
    </form>

    <div v-if="lastReported" class="hse-incident-receipt">
      <strong>Đã ghi nhận sự cố {{ HSE_INCIDENT_TYPE_LABEL[lastReported.incidentType] }}</strong>
      <span>Mức độ thực tế {{ HSE_SEVERITY_LABEL[lastReported.actualSeverity] }} · tiềm ẩn {{ HSE_SEVERITY_LABEL[lastReported.potentialSeverity] }}</span>
      <span>Xảy ra {{ lastReported.occurredAt }} · báo cáo {{ lastReported.reportedAt }}</span>
      <p>{{ lastReported.narrative }}</p>
      <span class="hse-incident-receipt__note">
        API không trả về restricted facts (SEC-130); màn hình không hiển thị và không thu thập
        trường này.
      </span>
    </div>
  </section>
</template>
