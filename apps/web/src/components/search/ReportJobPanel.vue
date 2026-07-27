<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  REPORT_JOB_STATUS_LABEL, REPORT_TYPE_LABEL, REPORT_TYPE_PERMISSION, REPORT_TYPES,
  reportJobPending
} from '@/constants/search';
import type { CreateReportJobRequest, ReportJobView, ReportType } from '@/types/search.types';

/**
 * API-133/API-134 — register exports.
 *
 * A COMPLETED job resolves to a stable OBJECT REFERENCE, not a download URL: no S3 presigner is
 * installed in this build, so the API returns `{ bucket, objectKey }` and this panel renders
 * exactly that. It does not build an href out of the pair, because a link that cannot be
 * authenticated is worse than no link — it looks like the file is one click away and fails
 * silently, or worse, appears clickable to someone whose permission was revoked after the export
 * ran.
 *
 * `download` being null on a COMPLETED job is itself information: API-134 re-checks the module
 * permission and the retention window at read time, so a completed export can legitimately stop
 * being retrievable.
 */
defineProps<{
  jobs: ReportJobView[];
  busy: boolean;
  canCreate: boolean;
  /** True while the view is polling a pending job, so the operator knows the status is live. */
  polling: boolean;
}>();
const emit = defineEmits<{
  create: [input: CreateReportJobRequest];
  refresh: [reportJobId: string];
}>();

const error = ref('');
const form = reactive({ reportType: 'RISK_REGISTER_CSV' as ReportType, projectId: '' });

function submit(): void {
  error.value = '';
  if (!form.projectId.trim()) {
    error.value = 'Cần chỉ định dự án để xuất register.';
    return;
  }
  emit('create', { reportType: form.reportType, projectId: form.projectId.trim() });
}
</script>

<template>
  <section class="search-panel report-job-panel" aria-labelledby="report-job-title">
    <div class="detail-heading">
      <div>
        <small>REPORT JOB · API-133/134</small>
        <h2 id="report-job-title">Xuất register</h2>
        <p class="lead">Job được xếp hàng sau khi server xác nhận bạn đọc được register đó ngay lúc này.</p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="canCreate" class="search-inline-form" @submit.prevent="submit">
      <label>
        Loại báo cáo
        <select v-model="form.reportType" aria-label="Loại báo cáo">
          <option v-for="item in REPORT_TYPES" :key="item" :value="item">{{ REPORT_TYPE_LABEL[item] }}</option>
        </select>
      </label>
      <label>Dự án (UUID)<input v-model.trim="form.projectId" required /></label>
      <div class="form-actions form-wide">
        <el-button native-type="submit" type="primary" :loading="busy">Tạo job xuất dữ liệu</el-button>
      </div>
    </form>
    <p v-else class="muted-inline">Bạn không có quyền <code>report.create</code>.</p>

    <p class="muted-inline">
      Quyền được kiểm tra hai lần: <code>{{ REPORT_TYPE_PERMISSION[form.reportType] }}</code> khi
      xếp hàng và một lần nữa khi đọc kết quả.
    </p>

    <div v-if="!jobs.length" class="empty-panel">
      <h3>Chưa có job xuất dữ liệu</h3>
      <p>Job chỉ hiển thị cho chính người đã yêu cầu; báo cáo không phải kênh chia sẻ.</p>
    </div>
    <ul v-else class="report-job-list" data-testid="report-jobs">
      <li v-for="job in jobs" :key="job.id" :data-status="job.status">
        <div>
          <strong>{{ REPORT_TYPE_LABEL[job.reportType] }}</strong>
          <span class="status-pill" :data-status="job.status">{{ REPORT_JOB_STATUS_LABEL[job.status] }}</span>
        </div>
        <small>Yêu cầu lúc {{ new Date(job.createdAt).toLocaleString('vi-VN') }}</small>

        <p v-if="reportJobPending(job.status)" class="muted-inline">
          Worker đang xử lý. {{ polling ? 'Trạng thái đang được cập nhật tự động.' : '' }}
        </p>
        <p v-else-if="job.status === 'FAILED'" class="field-error">
          Thất bại{{ job.errorCode ? ` (${job.errorCode})` : '' }}.
        </p>
        <template v-else-if="job.status === 'COMPLETED'">
          <!--
            Rendered as a reference, deliberately not as a link: there is no presigner in this
            build, so no URL exists to point at.
          -->
          <div v-if="job.download" class="object-reference" data-testid="report-object-ref">
            <span>Tham chiếu đối tượng (không phải liên kết tải)</span>
            <code>bucket: {{ job.download.bucket }}</code>
            <code>objectKey: {{ job.download.objectKey }}</code>
            <small>
              Tải qua hạ tầng có thể xác thực với kho đối tượng. PM Web chưa cài trình ký URL nên
              không phát hành liên kết tải trực tiếp.
            </small>
          </div>
          <p v-else class="muted-inline" data-testid="report-download-withheld">
            Đã hoàn thành nhưng không phát hành tham chiếu: quyền đọc register đã bị thu hồi, hoặc
            thời hạn lưu trữ đã hết.
          </p>
        </template>

        <el-button text @click="emit('refresh', job.id)">Cập nhật trạng thái</el-button>
      </li>
    </ul>
  </section>
</template>
