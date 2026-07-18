<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError, type ApiValidationIssue } from '@/api/api-error';
import { scheduleApi } from '@/api/schedule.api';
import ProgressUpdateForm from '@/components/schedule/ProgressUpdateForm.vue';
import ScheduleBaselinePanel from '@/components/schedule/ScheduleBaselinePanel.vue';
import ScheduleDraftPanel from '@/components/schedule/ScheduleDraftPanel.vue';
import ScheduleGantt from '@/components/schedule/ScheduleGantt.vue';
import ScheduleSummaryCards from '@/components/schedule/ScheduleSummaryCards.vue';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ApplyScheduleDraftRequest,
  ApplyScheduleDraftResult,
  BaselineDecisionRequest,
  ProgressHistoryItem,
  ProgressUpdateRequest,
  ProjectSchedule,
  ScheduleActivity,
  SubmitScheduleBaselineRequest
} from '@/types/schedule.types';

type ScreenState = 'ready' | 'denied' | 'empty' | 'conflict' | 'configuration-error' | 'error';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const schedule = ref<ProjectSchedule | null>(null);
const selectedActivity = ref<ScheduleActivity | null>(null);
const progressActivity = ref<ScheduleActivity | null>(null);
const previewResult = ref<ApplyScheduleDraftResult | null>(null);
const progressHistory = ref<ProgressHistoryItem[]>([]);
const loading = ref(true);
const initialized = ref(false);
const refreshing = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);
const mutationIssues = ref<ApiValidationIssue[]>([]);
const showDraft = ref(false);
const showBaseline = ref(false);
const draftSource = ref<string | null>(null);
const dataDateOverridden = ref(false);
const approvedChangeRequestId = computed(() => typeof route.query.approvedChangeRequestId === 'string'
  ? route.query.approvedChangeRequestId
  : undefined);
const filters = reactive({
  dataDate: '',
  lookAheadDays: 21,
  baselineNumber: '' as number | '',
  packageId: '',
  search: '',
  criticalOnly: false,
  lookAheadOnly: false
});

const canManage = computed(() => auth.can('schedule.manage'));
const canImport = computed(() => auth.can('schedule.import'));
const canSubmitBaseline = computed(() => auth.hasFullProjectPermission('baseline.submit', projectId));
const hasApprovePermission = computed(() => auth.hasFullProjectPermission('baseline.approve', projectId));
const canRecordProgress = computed(() => auth.can('progress.record'));
const canCorrectProgress = computed(() => auth.can('progress.correct'));
const projectMutable = computed(() => ![
  'ARCHIVED', 'CLOSED', 'CANCELLED'
].includes(schedule.value?.projectStatus ?? 'ACTIVE'));
const canManageAllProgress = computed(() => auth.roles.some((role) => (
  ['PMO', 'PROJECT_MANAGER', 'PROJECT_CONTROLS'].includes(role)
)));
const canEditDraft = computed(() => projectMutable.value && canManage.value && ![
  'SUBMITTED', 'APPROVED'
].includes(schedule.value?.status ?? 'DRAFT'));
const progressActivityIds = computed(() => (schedule.value?.activities ?? [])
  .filter((activity) => projectMutable.value
    && (canRecordProgress.value || canCorrectProgress.value) && (
    canManageAllProgress.value || activity.ownerId === auth.user?.id
  ))
  .map((activity) => activity.id));
const canDecideBaseline = computed(() => Boolean(
  projectMutable.value
  && hasApprovePermission.value
  && schedule.value?.currentBaseline?.status === 'SUBMITTED'
  && schedule.value.currentBaseline.submittedBy !== auth.user?.id
  && schedule.value.currentBaseline.createdBy !== auth.user?.id
));
const decisionUnavailableReason = computed(() => (
  hasApprovePermission.value && schedule.value?.currentBaseline?.status === 'SUBMITTED'
    && !canDecideBaseline.value
    ? 'Bạn là người tạo/submit baseline này hoặc project không còn cho phép cập nhật; quyết định phải do approver độc lập thực hiện.'
    : undefined
));
const lookAheadIds = computed(() => new Set(schedule.value?.lookAhead.map((item) => item.id) ?? []));
const activityNames = computed(() => new Map(schedule.value?.activities.map((item) => [item.id, `${item.code} · ${item.name}`]) ?? []));

const visibleActivities = computed(() => {
  const term = filters.search.trim().toLocaleLowerCase('vi');
  return (schedule.value?.activities ?? []).filter((activity) => {
    if (filters.packageId && activity.packageId !== filters.packageId) return false;
    if (filters.criticalOnly && !activity.critical && !activity.nearCritical) return false;
    if (filters.lookAheadOnly && !lookAheadIds.value.has(activity.id)) return false;
    return !term || `${activity.code} ${activity.name}`.toLocaleLowerCase('vi').includes(term);
  });
});

const selectedDependencies = computed(() => {
  if (!schedule.value || !selectedActivity.value) return [];
  return schedule.value.dependencies.filter((item) =>
    item.predecessorId === selectedActivity.value?.id || item.successorId === selectedActivity.value?.id
  );
});

async function load(preserveNotice = false): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (!initialized.value) loading.value = true;
  else refreshing.value = true;
  error.value = '';
  if (!preserveNotice) success.value = '';
  try {
    const result = await scheduleApi.getProjectSchedule(context, projectId, {
      dataDate: dataDateOverridden.value ? filters.dataDate : undefined,
      lookAheadDays: filters.lookAheadDays,
      baselineNumber: filters.baselineNumber || undefined
    });
    schedule.value = result.data;
    if (!dataDateOverridden.value) filters.dataDate = result.data.dataDate;
    screenState.value = 'ready';
    mutationConflict.value = false;
    if (selectedActivity.value) {
      selectedActivity.value = result.data.activities.find((item) => item.id === selectedActivity.value?.id) ?? null;
    } else if (typeof route.query.activityId === 'string') {
      selectedActivity.value = result.data.activities.find((item) => (
        item.id === route.query.activityId
      )) ?? null;
    }
    if (progressActivity.value) {
      progressActivity.value = result.data.activities.find((item) => item.id === progressActivity.value?.id) ?? null;
    }
  } catch (caught) {
    if (!schedule.value) {
      selectedActivity.value = null;
      handleLoadError(caught, 'Không thể tải schedule dự án');
    } else {
      error.value = caught instanceof ApiError ? caught.message : 'Không thể làm mới schedule';
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
    initialized.value = true;
  }
}

function handleLoadError(caught: unknown, fallback: string): void {
  const apiError = caught instanceof ApiError ? caught : null;
  error.value = apiError?.message ?? fallback;
  if (apiError?.status === 403) screenState.value = 'denied';
  else if (apiError?.status === 404 && apiError.code === 'SCHEDULE_NOT_FOUND') screenState.value = 'empty';
  else if (apiError?.status === 409) screenState.value = 'conflict';
  else if (apiError?.code === 'CONFIGURATION_ERROR' || apiError?.code === 'INVALID_CALENDAR') screenState.value = 'configuration-error';
  else screenState.value = 'error';
}

function handleMutationError(caught: unknown): void {
  const apiError = caught instanceof ApiError ? caught : null;
  error.value = apiError?.message ?? 'Không thể hoàn thành thao tác schedule';
  mutationIssues.value = apiError?.issues ?? [];
  mutationConflict.value = apiError?.status === 409;
}

async function mutate(action: () => Promise<void>, message: string): Promise<boolean> {
  busy.value = true;
  error.value = '';
  success.value = '';
  mutationConflict.value = false;
  mutationIssues.value = [];
  try {
    await action();
    success.value = message;
    return true;
  } catch (caught) {
    handleMutationError(caught);
    return false;
  } finally {
    busy.value = false;
  }
}

async function applyDraft(input: ApplyScheduleDraftRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  const result = await mutate(async () => {
    const response = await scheduleApi.applyDraft(context, projectId, input, crypto.randomUUID());
    previewResult.value = response.data;
  }, input.mode === 'PREVIEW' ? 'Preview hoàn tất, chưa có dữ liệu nào được ghi.' : 'Schedule draft đã được commit nguyên tử.');
  if (result && input.mode === 'COMMIT') {
    showDraft.value = false;
    previewResult.value = null;
    await load(true);
  }
}

async function submitBaseline(input: SubmitScheduleBaselineRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await scheduleApi.submitBaseline(context, projectId, input, crypto.randomUUID());
  }, 'Baseline đã được submit cho approver độc lập.')) {
    showBaseline.value = false;
    await load(true);
  }
}

async function decideBaseline(input: BaselineDecisionRequest): Promise<void> {
  const context = auth.apiContext;
  const baseline = schedule.value?.currentBaseline;
  if (!context || !baseline || !canDecideBaseline.value) return;
  if (await mutate(async () => {
    await scheduleApi.decideBaseline(context, baseline.id, input, crypto.randomUUID());
  }, 'Quyết định baseline độc lập đã được ghi nhận.')) {
    showBaseline.value = false;
    await load(true);
  }
}

async function openProgress(activity: ScheduleActivity): Promise<void> {
  const context = auth.apiContext;
  progressHistory.value = [];
  if (context && canCorrectProgress.value) {
    busy.value = true;
    try {
      const result = await scheduleApi.listProgressHistory(context, projectId, activity.id);
      progressHistory.value = result.data;
    } catch (caught) {
      handleMutationError(caught);
      if (!canRecordProgress.value) return;
    } finally {
      busy.value = false;
    }
  }
  progressActivity.value = activity;
}

async function recordProgress(input: ProgressUpdateRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await scheduleApi.recordProgress(context, projectId, input, crypto.randomUUID());
  }, 'Tiến độ đã được ghi thành một bản ghi mới.')) {
    progressActivity.value = null;
    dataDateOverridden.value = false;
    filters.dataDate = '';
    await load(true);
  }
}

function retryLoadConflict(): void {
  if (!schedule.value) screenState.value = 'ready';
  void load(true);
}

function useCurrentDataDate(): void {
  dataDateOverridden.value = false;
  filters.dataDate = schedule.value?.dataDate ?? '';
  void load();
}

async function exportLookAhead(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const csv = await scheduleApi.exportLookAhead(context, projectId, {
      dataDate: dataDateOverridden.value ? filters.dataDate : undefined,
      lookAheadDays: filters.lookAheadDays
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `schedule-look-ahead-${projectId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, 'Look-ahead CSV theo đúng scope hiện tại đã được xuất và audit.');
}

onMounted(() => void load());
</script>

<template>
  <AppLayout>
    <section class="page-heading schedule-page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">PROJECT CONTROLS · US-003</p>
        <h1>WBS &amp; Schedule</h1>
        <p class="lead">Calendar, logic, baseline, forecast và tiến độ có truy vết.</p>
      </div>
      <div class="schedule-heading-actions">
        <el-button @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button>
        <el-button :loading="loading || refreshing" @click="load()">Làm mới</el-button>
      </div>
    </section>

    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error && screenState === 'ready'" type="error" :title="error" show-icon />

    <section v-if="mutationConflict" class="schedule-inline-conflict" role="alert">
      <div><strong>Version conflict</strong><p>{{ error }}. Nội dung đang nhập vẫn được giữ; tải version mới rồi preview/gửi lại.</p></div>
      <el-button :loading="refreshing" @click="retryLoadConflict">Tải version mới</el-button>
    </section>
    <ul v-if="mutationIssues.length" class="schedule-preview-issues schedule-mutation-issues">
      <li v-for="issue in mutationIssues" :key="`${issue.code}-${issue.path}-${issue.row}`" :data-severity="issue.severity">
        <strong>{{ issue.severity }} · {{ issue.code }}</strong><span>{{ issue.message }}</span><code>{{ issue.path }}{{ issue.row ? ` · dòng ${issue.row}` : '' }}</code>
      </li>
    </ul>

    <div v-if="loading" class="schedule-loading" aria-live="polite">
      <div v-for="index in 4" :key="index"></div><p>Đang tải schedule được phân quyền…</p>
    </div>

    <section v-else-if="screenState === 'denied'" class="schedule-state-panel" role="alert">
      <span aria-hidden="true">🔒</span><h2>Không có quyền xem schedule này</h2>
      <p>Hệ thống không hiển thị tên activity, package hay chỉ số ngoài phạm vi được giao.</p>
      <el-button @click="router.push({ name: RouteName.projects })">Về danh sách dự án</el-button>
    </section>

    <div v-else-if="screenState === 'empty'">
      <section class="schedule-state-panel">
        <span aria-hidden="true">◫</span><h2>Schedule chưa được khởi tạo</h2>
        <p>{{ error }}. Project Controls có thể khai báo calendar/timezone và nạp canonical draft đầu tiên ở phiên bản 0.</p>
        <div class="schedule-heading-actions"><el-button @click="load()">Kiểm tra lại</el-button><el-button v-if="canManage" class="desktop-command" type="primary" @click="showDraft = true">Khởi tạo schedule</el-button></div>
      </section>
      <ScheduleDraftPanel
        v-if="showDraft && canManage"
        v-model="draftSource"
        class="desktop-command"
        :expected-version="0"
        :calendar="null"
        :preview-result="previewResult"
        :busy="busy"
        :can-import="canImport"
        @close="showDraft = false"
        @preview="applyDraft"
        @commit="applyDraft"
      />
    </div>

    <section v-else-if="screenState === 'configuration-error'" class="schedule-state-panel schedule-state-panel--warning" role="alert">
      <span aria-hidden="true">⚙</span><h2>Thiếu cấu hình schedule</h2><p>{{ error }}</p>
      <p>Không tự suy diễn ngày nghỉ, timezone hoặc threshold. Vui lòng liên hệ quản trị dự án.</p>
    </section>

    <section v-else-if="screenState === 'conflict'" class="schedule-state-panel schedule-state-panel--warning" role="alert">
      <span aria-hidden="true">↻</span><h2>Dữ liệu vừa thay đổi ở phiên khác</h2><p>{{ error }}</p>
      <p>Nội dung đang nhập vẫn được giữ trên màn hình. Tải phiên bản mới trước khi gửi lại.</p>
      <el-button type="primary" @click="retryLoadConflict">Tải phiên bản mới</el-button>
    </section>

    <section v-else-if="screenState === 'error'" class="schedule-state-panel" role="alert">
      <span aria-hidden="true">!</span><h2>Không thể tải schedule</h2><p>{{ error }}</p><el-button @click="load()">Thử lại</el-button>
    </section>

    <template v-else-if="schedule">
      <section class="schedule-context" aria-label="Ngữ cảnh schedule">
        <div><span>Project</span><strong>{{ projectId }}</strong></div>
        <div><span>Timezone</span><strong>{{ schedule.calendar.timezone }}</strong></div>
        <div><span>Data date</span><strong>{{ schedule.dataDate }}</strong></div>
        <div><span>Baseline</span><strong>{{ schedule.currentBaseline ? `#${schedule.currentBaseline.baselineNumber} · ${schedule.currentBaseline.status}` : 'Chưa có' }}</strong></div>
        <div><span>Freshness</span><strong>{{ new Date(schedule.calculatedAt).toLocaleString('vi-VN') }}</strong></div>
        <div><span>Version</span><strong>v{{ schedule.versionNo }}</strong></div>
      </section>

      <ScheduleSummaryCards :schedule="schedule" />

      <form class="schedule-toolbar" aria-label="Bộ lọc schedule" @submit.prevent="load()">
        <label>Data date<input v-model="filters.dataDate" type="date" @change="dataDateOverridden = true" /></label>
        <label>Look-ahead<select v-model.number="filters.lookAheadDays"><option :value="7">7 ngày</option><option :value="21">21 ngày</option><option :value="35">35 ngày</option><option :value="90">90 ngày</option></select></label>
        <label>Baseline<input v-model.number="filters.baselineNumber" type="number" min="1" placeholder="Hiện tại" /></label>
        <label>Package<select v-model="filters.packageId"><option value="">Tất cả package</option><option v-for="item in schedule.packages" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
        <label>Tìm activity<input v-model.trim="filters.search" type="search" placeholder="Mã hoặc tên" /></label>
        <div class="schedule-toolbar__checks">
          <label><input v-model="filters.criticalOnly" type="checkbox" /> Critical / near-critical</label>
          <label><input v-model="filters.lookAheadOnly" type="checkbox" /> Look-ahead</label>
        </div>
        <el-button native-type="submit">Áp dụng snapshot</el-button>
        <el-button v-if="dataDateOverridden" native-type="button" text @click="useCurrentDataDate">Data date hiện tại</el-button>
        <el-button native-type="button" :loading="busy" @click="exportLookAhead">Xuất look-ahead CSV</el-button>
        <div class="schedule-toolbar__commands desktop-command">
          <el-button v-if="canEditDraft" @click="showDraft = !showDraft">{{ canImport ? 'Import / draft' : 'Manual draft' }}</el-button>
          <el-button v-if="projectMutable && (canSubmitBaseline || hasApprovePermission)" type="primary" @click="showBaseline = !showBaseline">Baseline</el-button>
        </div>
      </form>

      <p v-if="canManage && !canEditDraft" class="schedule-readonly-note">Draft bị khóa khi schedule đang {{ schedule.status }}; baseline đã submit/approved không được ghi đè.</p>
      <p v-if="!projectMutable" class="schedule-readonly-note">Project đang {{ schedule.projectStatus }}; mọi command schedule, baseline và progress đã được khóa.</p>

      <p class="schedule-mobile-boundary">Trên mobile: chỉ xem look-ahead và ghi progress/evidence. Chỉnh calendar/dependency hoặc quyết định baseline cần màn hình desktop.</p>

      <ScheduleDraftPanel
        v-if="showDraft && canEditDraft"
        v-model="draftSource"
        class="desktop-command"
        :expected-version="schedule.versionNo"
        :calendar="schedule.calendar"
        :preview-result="previewResult"
        :busy="busy"
        :can-import="canImport"
        @close="showDraft = false"
        @preview="applyDraft"
        @commit="applyDraft"
      />
      <ScheduleBaselinePanel
        v-if="showBaseline && projectMutable && (canSubmitBaseline || hasApprovePermission)"
        class="desktop-command"
        :baseline="schedule.currentBaseline ?? null"
        :schedule-version="schedule.versionNo"
        :data-date="schedule.dataDate"
        :can-submit="canSubmitBaseline"
        :can-rebaseline="canSubmitBaseline"
        :approved-change-request-id="approvedChangeRequestId"
        :can-decide="canDecideBaseline"
        :decision-unavailable-reason="decisionUnavailableReason"
        :busy="busy"
        @close="showBaseline = false"
        @submit="submitBaseline"
        @decide="decideBaseline"
      />

      <section v-if="schedule.validationIssues.length" class="schedule-issues" aria-labelledby="validation-title">
        <div class="section-heading"><div><h2 id="validation-title">Validation issues</h2><p>Stable code, field path và dòng import để sửa đúng nguồn.</p></div><strong>{{ schedule.validationIssues.length }}</strong></div>
        <ul><li v-for="issue in schedule.validationIssues" :key="`${issue.code}-${issue.path}-${issue.row}`" :data-severity="issue.severity"><strong>{{ issue.severity }} · {{ issue.code }}</strong><span>{{ issue.message }}</span><code>{{ issue.path }}{{ issue.row ? ` · dòng ${issue.row}` : '' }}</code></li></ul>
      </section>

      <section v-if="schedule.alerts.length" class="schedule-alerts" aria-labelledby="alerts-title">
        <div class="section-heading"><div><h2 id="alerts-title">Schedule alerts</h2><p>Alert đã materialize theo threshold {{ schedule.thresholdVersion }}.</p></div><strong>{{ schedule.alerts.length }}</strong></div>
        <div class="schedule-alerts__grid"><button v-for="alert in schedule.alerts" :key="alert.id" type="button" :data-priority="alert.priority" @click="selectedActivity = schedule.activities.find((item) => item.id === alert.activityId) ?? null"><strong>{{ alert.alertType }}</strong><span>{{ activityNames.get(alert.activityId) ?? 'Activity trong phạm vi hạn chế' }}</span><small>Due {{ alert.dueAt }} · {{ alert.priority }}</small></button></div>
      </section>

      <section class="detail-section schedule-workspace">
        <div class="section-heading">
          <div><h2>WBS &amp; Gantt-lite</h2><p>{{ visibleActivities.length }}/{{ schedule.activities.length }} activity · click một dòng để xem logic.</p></div>
          <span class="schedule-status" :data-status="schedule.status">{{ schedule.status }}</span>
        </div>
        <div v-if="visibleActivities.length === 0" class="empty-panel"><h3>Không có activity phù hợp</h3><p>Đổi bộ lọc hoặc import draft schedule đầu tiên.</p></div>
        <ScheduleGantt
          v-else
          :activities="visibleActivities"
          :wbs-nodes="schedule.wbsNodes"
          :packages="schedule.packages"
          :progress-activity-ids="progressActivityIds"
          @select="selectedActivity = $event"
          @progress="openProgress"
        />
      </section>

      <aside v-if="selectedActivity" class="schedule-activity-detail" aria-labelledby="activity-detail-title">
        <div class="schedule-command-form__heading"><div><small>ACTIVITY DETAIL</small><h2 id="activity-detail-title">{{ selectedActivity.code }} · {{ selectedActivity.name }}</h2></div><button type="button" class="text-action" @click="selectedActivity = null">Đóng</button></div>
        <div class="schedule-detail-grid">
          <div><span>Plan</span><strong>{{ selectedActivity.plannedStart }} → {{ selectedActivity.plannedFinish }}</strong></div>
          <div><span>Forecast</span><strong>{{ selectedActivity.forecastStart ?? 'N/A' }} → {{ selectedActivity.forecastFinish ?? 'N/A' }}</strong></div>
          <div><span>Actual</span><strong>{{ selectedActivity.actualStart ?? 'N/A' }} → {{ selectedActivity.actualFinish ?? 'N/A' }}</strong></div>
          <div><span>Owner</span><strong>{{ selectedActivity.ownerId }}</strong></div>
          <div><span>Weight / progress</span><strong>{{ selectedActivity.weight }}% / {{ selectedActivity.percentComplete }}%</strong></div>
          <div><span>Criticality</span><strong>{{ selectedActivity.critical ? 'Critical' : selectedActivity.nearCritical ? 'Near-critical' : 'Normal' }} · float {{ selectedActivity.totalFloatWorkDays }}</strong></div>
        </div>
        <h3>Dependencies</h3>
        <ul class="schedule-dependencies"><li v-for="dependency in selectedDependencies" :key="dependency.id"><span>{{ activityNames.get(dependency.predecessorId) }}</span><strong>{{ dependency.dependencyType }} {{ dependency.lagWorkDays >= 0 ? '+' : '' }}{{ dependency.lagWorkDays }}</strong><span>{{ activityNames.get(dependency.successorId) }}</span></li><li v-if="!selectedDependencies.length">Không có dependency.</li></ul>
        <el-button v-if="progressActivityIds.includes(selectedActivity.id)" type="primary" @click="openProgress(selectedActivity)">Ghi progress / evidence</el-button>
      </aside>

      <ProgressUpdateForm
        v-if="progressActivity && progressActivityIds.includes(progressActivity.id)"
        :key="progressActivity.id"
        :activity="progressActivity"
        :data-date="schedule.dataDate"
        :busy="busy"
        :history="progressHistory"
        :can-record="canRecordProgress"
        :can-correct="canCorrectProgress"
        @cancel="progressActivity = null"
        @submit="recordProgress"
      />
    </template>
  </AppLayout>
</template>
