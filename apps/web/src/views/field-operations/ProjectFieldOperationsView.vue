<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { fieldHseApi } from '@/api/field-hse.api';
import { projectApi } from '@/api/project.api';
import { scheduleApi } from '@/api/schedule.api';
import DailyLogPanel from '@/components/field-operations/DailyLogPanel.vue';
import HseIncidentForm from '@/components/field-operations/HseIncidentForm.vue';
import PermitToWorkPanel from '@/components/field-operations/PermitToWorkPanel.vue';
import QuantityLedgerPanel from '@/components/field-operations/QuantityLedgerPanel.vue';
import StopWorkBanner from '@/components/field-operations/StopWorkBanner.vue';
import StopWorkPanel from '@/components/field-operations/StopWorkPanel.vue';
import WorkfrontRegisterTable from '@/components/field-operations/WorkfrontRegisterTable.vue';
import {
  STOP_WORK_TARGET_LABEL, WORKFRONT_STATUSES, WORKFRONT_STATUS_LABEL
} from '@/constants/field-hse';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ActiveStopWork, CreateDailyLogRequest, CreatePermitToWorkRequest, DailyLogView,
  HseIncidentView, IssuePermitToWorkRequest, PermitToWorkView, QuantityProgressView,
  RecordQuantityProgressRequest, ReportHseIncidentRequest, StopWorkActionRequest,
  StopWorkActionView, SubmitDailyLogRequest, WorkfrontListQuery, WorkfrontStatus, WorkfrontView
} from '@/types/field-hse.types';
import type { Company, Project } from '@/types/project.types';
import type { SchedulePackage } from '@/types/schedule.types';

type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const stopWorkPanel = ref<InstanceType<typeof StopWorkPanel> | null>(null);
const project = ref<Project | null>(null);
const companies = ref<Company[]>([]);
const packages = ref<SchedulePackage[]>([]);
const rows = ref<WorkfrontView[]>([]);
const registerCursor = ref<string | null>(null);
const selected = ref<WorkfrontView | null>(null);

/**
 * API-086 is the only read operation in this slice: daily logs, quantity rows, permits, incidents
 * and the stop-work ledger have no GET in the catalog. Everything below is therefore what THIS
 * session appended, and every panel says so rather than presenting itself as the project history.
 */
const dailyLogs = ref<DailyLogView[]>([]);
const quantityRecords = ref<QuantityProgressView[]>([]);
const permits = ref<PermitToWorkView[]>([]);
const stopWorkActions = ref<StopWorkActionView[]>([]);
const lastIncident = ref<HseIncidentView | null>(null);

const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
/** The incident form owns its own in-flight flag; nothing else may ever disable it. */
const incidentBusy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

/**
 * Raised when the server refuses a command with `STOP_WORK_ACTIVE`. The ledger cannot be read, so a
 * refusal is the only evidence the browser gets that a stop-work it never saw is standing — and
 * safety fails closed: the banner goes up and stays up until this screen is reloaded.
 */
const stopWorkRefusal = ref<string>('');

const filters = reactive({ status: '' });

const portfolioId = computed(() => project.value?.portfolioId);
const sites = computed(() => project.value?.sites ?? []);
const siteNames = computed(() => Object.fromEntries(
  sites.value.map((site) => [site.id, `${site.code} · ${site.name}`])
));

/** Project-level reach, package-scoped assignments included (the API guard accepts both). */
function allowed(permission: string): boolean {
  return auth.hasFullProjectPermission(permission, projectId, portfolioId.value)
    || packages.value.some((item) => auth.hasPackagePermission(permission, item.id));
}

/** Record-level reach: a package principal may act on some workfronts of a project but not others. */
function allowedOn(permission: string, workfront: WorkfrontView | null): boolean {
  if (!workfront) return false;
  return auth.canAccessRecord(permission, projectId, workfront.packageId, portfolioId.value);
}

const canIssueStopWork = computed(() => allowed('stopWork.issue'));
/** SEC: HSE_MANAGER only. A lift control is never rendered without it. */
const canLiftStopWork = computed(() => allowed('stopWork.lift'));
const releasableIds = computed(() => rows.value
  .filter((row) => allowedOn('workfront.release', row)).map((row) => row.id));
const dailyLogPermissions = computed(() => ({
  create: allowed('dailyLog.create'), submit: allowed('dailyLog.submit')
}));
const permitPermissions = computed(() => ({
  request: allowedOn('permitToWork.request', selected.value),
  issue: allowedOn('permitToWork.issue', selected.value)
}));
const canRecordQuantity = computed(() => allowedOn('progress.record', selected.value));

/** An ISSUE with no LIFT pointing at it is still standing. */
const openIssues = computed(() => {
  const lifted = new Set(
    stopWorkActions.value.filter((row) => row.action === 'LIFT' && row.liftsActionId)
      .map((row) => row.liftsActionId!)
  );
  return stopWorkActions.value.filter((row) => row.action === 'ISSUE' && !lifted.has(row.id));
});

function stopWorkLabel(row: StopWorkActionView): string {
  if (row.targetType === 'SITE' && row.siteId) return siteNames.value[row.siteId] ?? row.siteId;
  if (row.targetType === 'WORKFRONT' && row.workfrontId) {
    const workfront = rows.value.find((item) => item.id === row.workfrontId);
    return workfront ? `${workfront.code} · ${workfront.name}` : row.workfrontId;
  }
  if (row.targetType === 'PERMIT' && row.permitId) return row.permitId;
  return project.value?.name ?? projectId;
}

const activeStopWorks = computed<ActiveStopWork[]>(() => {
  const entries: ActiveStopWork[] = openIssues.value.map((row) => ({
    id: row.id, targetType: row.targetType, targetLabel: stopWorkLabel(row),
    reason: row.reason, actorId: row.actorId, actedAt: row.actedAt, pending: false
  }));
  if (stopWorkRefusal.value) {
    entries.push({
      id: null, targetType: 'PROJECT', targetLabel: project.value?.name ?? projectId,
      reason: stopWorkRefusal.value, actorId: null, actedAt: null, pending: true
    });
  }
  return entries;
});

const stopWorkActive = computed(() => activeStopWorks.value.length > 0);

/**
 * A workfront is blocked when an unlifted stop-work covers the project, the workfront's site or the
 * workfront itself — the same reach `assertNoActiveStopWork` applies server-side. A refusal-inferred
 * entry blocks everything, because the client cannot know which target it named.
 */
const blockedWorkfrontIds = computed(() => {
  if (stopWorkRefusal.value || openIssues.value.some((row) => row.targetType === 'PROJECT')) {
    return rows.value.map((row) => row.id);
  }
  const stoppedSites = new Set(openIssues.value
    .filter((row) => row.targetType === 'SITE' && row.siteId).map((row) => row.siteId!));
  const stoppedWorkfronts = new Set(openIssues.value
    .filter((row) => row.targetType === 'WORKFRONT' && row.workfrontId)
    .map((row) => row.workfrontId!));
  // A stop-work on a permit reaches the workfront that permit belongs to.
  for (const row of openIssues.value) {
    if (row.targetType !== 'PERMIT' || !row.permitId) continue;
    const permit = permits.value.find((item) => item.id === row.permitId);
    if (permit) stoppedWorkfronts.add(permit.workfrontId);
  }
  return rows.value
    .filter((row) => stoppedWorkfronts.has(row.id) || stoppedSites.has(row.siteId))
    .map((row) => row.id);
});

const selectedBlocked = computed(() => (
  selected.value !== null && blockedWorkfrontIds.value.includes(selected.value.id)
));

function registerQuery(cursor?: string): WorkfrontListQuery {
  return {
    ...(filters.status ? { status: filters.status as WorkfrontStatus } : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

async function loadRegister(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await fieldHseApi.listWorkfronts(
      context, projectId, registerQuery(append ? registerCursor.value ?? undefined : undefined)
    );
    rows.value = append ? [...rows.value, ...response.data] : response.data;
    registerCursor.value = response.meta.nextCursor;
    if (selected.value) {
      selected.value = rows.value.find((row) => row.id === selected.value!.id) ?? selected.value;
    }
  } finally {
    loadingMore.value = false;
  }
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    // Master data is auxiliary (site/contractor pickers); missing permission just leaves it empty.
    const optional = await Promise.allSettled([
      auth.can('project.read') ? projectApi.getProject(context, projectId) : Promise.resolve(null),
      auth.can('organization.read') ? projectApi.listCompanies(context) : Promise.resolve(null),
      auth.can('package.read') ? scheduleApi.listPackages(context, projectId) : Promise.resolve(null)
    ]);
    const [projectResult, companyResult, packageResult] = optional;
    if (projectResult.status === 'fulfilled' && projectResult.value) project.value = projectResult.value.data;
    if (companyResult.status === 'fulfilled' && companyResult.value) companies.value = companyResult.value.data;
    if (packageResult.status === 'fulfilled' && packageResult.value) packages.value = packageResult.value.data;
    await loadRegister(false);
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải Workfront Register.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  error.value = '';
  try { await loadRegister(false); }
  catch (caught) { error.value = message(caught, 'Không thể áp dụng bộ lọc.'); }
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function openWorkfront(workfrontId: string): void {
  selected.value = rows.value.find((row) => row.id === workfrontId) ?? null;
}

async function mutate(action: () => Promise<void>, note: string): Promise<boolean> {
  busy.value = true;
  error.value = '';
  success.value = '';
  mutationConflict.value = false;
  try {
    await action();
    success.value = note;
    return true;
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể hoàn thành command.';
    mutationConflict.value = apiError?.status === 409;
    // Safety fails closed: a refusal we cannot corroborate still raises the banner.
    if (apiError?.code === 'STOP_WORK_ACTIVE') stopWorkRefusal.value = apiError.message;
    return false;
  } finally {
    busy.value = false;
  }
}

async function releaseWorkfront(workfront: WorkfrontView): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await fieldHseApi.releaseWorkfront(
      context, workfront.id, { expectedVersion: workfront.versionNo }, crypto.randomUUID()
    );
  }, `Workfront ${workfront.code} đã được release.`)) {
    await loadRegister(false).catch(() => undefined);
  }
}

async function createDailyLog(input: CreateDailyLogRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await fieldHseApi.createDailyLog(context, projectId, input, crypto.randomUUID());
    // A correction supersedes its original server-side; reflect that instead of dropping the row.
    if (input.correctionOfId) {
      dailyLogs.value = dailyLogs.value.map((log) => (
        log.id === input.correctionOfId ? { ...log, status: 'SUPERSEDED' as const } : log
      ));
    }
    dailyLogs.value = [created.data, ...dailyLogs.value];
  }, input.correctionOfId
    ? 'Bản đính chính đã được ghi ở revision kế tiếp; bản gốc chuyển sang SUPERSEDED.'
    : 'Nhật ký thi công đã được tạo ở trạng thái DRAFT.');
}

async function submitDailyLog(dailyLogId: string, input: SubmitDailyLogRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const updated = await fieldHseApi.submitDailyLog(context, dailyLogId, input, crypto.randomUUID());
    dailyLogs.value = dailyLogs.value.map((log) => (log.id === dailyLogId ? updated.data : log));
  }, input.action === 'SUBMIT' ? 'Nhật ký đã được trình.' : 'Nhật ký đã được ký kèm snapshot pháp lý.');
}

async function recordQuantity(input: RecordQuantityProgressRequest): Promise<void> {
  const context = auth.apiContext;
  const workfront = selected.value;
  if (!context || !workfront) return;
  await mutate(async () => {
    const created = await fieldHseApi.recordQuantityProgress(
      context, workfront.id, input, crypto.randomUUID()
    );
    // Append-only: the new row joins the ledger, nothing already in it changes.
    quantityRecords.value = [...quantityRecords.value, created.data];
  }, 'Đã ghi thêm một dòng vào sổ khối lượng.');
}

async function requestPermit(input: CreatePermitToWorkRequest): Promise<void> {
  const context = auth.apiContext;
  const workfront = selected.value;
  if (!context || !workfront) return;
  await mutate(async () => {
    const created = await fieldHseApi.createPermitToWork(
      context, workfront.id, input, crypto.randomUUID()
    );
    permits.value = [created.data, ...permits.value];
  }, 'Permit đã được yêu cầu ở trạng thái REQUESTED.');
}

async function issuePermit(permitId: string, input: IssuePermitToWorkRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const issued = await fieldHseApi.issuePermitToWork(context, permitId, input, crypto.randomUUID());
    permits.value = permits.value.map((permit) => (permit.id === permitId ? issued.data : permit));
  }, 'Permit đã được cấp kèm ảnh chụp cô lập.');
}

/**
 * API-093 never fails on aggregate state, so it does not go through `mutate`: it must not share the
 * screen-wide busy flag with commands that a stop-work can block.
 */
async function reportIncident(input: ReportHseIncidentRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  incidentBusy.value = true;
  error.value = '';
  success.value = '';
  try {
    const reported = await fieldHseApi.reportHseIncident(
      context, projectId, input, crypto.randomUUID()
    );
    lastIncident.value = reported.data;
    success.value = 'Sự cố HSE đã được ghi nhận.';
  } catch (caught) {
    error.value = message(caught, 'Không thể gửi báo cáo sự cố.');
  } finally {
    incidentBusy.value = false;
  }
}

async function recordStopWork(input: StopWorkActionRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    const recorded = await fieldHseApi.recordStopWorkAction(
      context, projectId, input, crypto.randomUUID()
    );
    stopWorkActions.value = [recorded.data, ...stopWorkActions.value];
    // A recorded LIFT is the only thing that can clear a refusal-inferred banner entry.
    if (recorded.data.action === 'LIFT') stopWorkRefusal.value = '';
  }, input.action === 'ISSUE'
    ? `Đã ghi lệnh dừng việc cho ${STOP_WORK_TARGET_LABEL[input.targetType ?? 'PROJECT']}.`
    : 'Đã ghi lệnh gỡ dừng việc kèm các biện pháp đã kiểm chứng.')) {
    await loadRegister(false).catch(() => undefined);
  }
}

function liftFromBanner(entry: ActiveStopWork): void {
  if (!entry.id) return;
  const issue = stopWorkActions.value.find((row) => row.id === entry.id);
  if (issue) stopWorkPanel.value?.openLift(issue.id);
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <StopWorkBanner
      :entries="activeStopWorks"
      :can-lift="canLiftStopWork"
      :busy="busy"
      @lift="liftFromBanner"
    />

    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-086…094 · FIELD OPERATIONS &amp; HSE</p>
        <h1>{{ project?.name ?? 'Field Operations & HSE' }}</h1>
        <p class="lead">Workfront, nhật ký thi công, sổ khối lượng, giấy phép làm việc và lệnh dừng việc.</p>
      </div>
      <div class="page-heading__actions">
        <el-button v-if="auth.can('project.read')" @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button>
        <el-button @click="router.push({ name: RouteName.projectQuality, params: { projectId } })">Chất lượng</el-button>
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Project: {{ projectId }}</span>
      <span>Khối lượng giữ nguyên dạng chuỗi, không quy đổi</span>
      <strong>Server luôn re-authorize command.</strong>
    </div>

    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section v-if="mutationConflict" class="schedule-inline-conflict">
      <div>
        <strong>Version conflict</strong>
        <p>Bản ghi đã đổi ở nơi khác. Tải lại phiên bản mới nhất trước khi gửi lại command.</p>
      </div>
      <el-button @click="loadWorkspace">Tải version mới</el-button>
    </section>

    <div v-if="loading" class="risk-change-loading" aria-live="polite">
      <span></span><span></span><span></span>
      <p>Đang tải authorized workfront register…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem workfront register</h2>
      <p>Không hiển thị mã, công trường hay bộ lọc nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải workfront register</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <form class="field-toolbar" @submit.prevent="applyFilters">
        <label>Trạng thái<select v-model="filters.status" aria-label="Trạng thái workfront"><option value="">Tất cả</option><option v-for="item in WORKFRONT_STATUSES" :key="item" :value="item">{{ WORKFRONT_STATUS_LABEL[item] }}</option></select></label>
        <el-button native-type="submit">Áp dụng</el-button>
      </form>

      <WorkfrontRegisterTable
        :rows="rows"
        :next-cursor="registerCursor"
        :loading-more="loadingMore"
        :selected-id="selected?.id ?? null"
        :blocked-ids="blockedWorkfrontIds"
        :releasable-ids="releasableIds"
        :site-names="siteNames"
        :busy="busy"
        @open="openWorkfront"
        @more="loadRegister(true)"
        @release="releaseWorkfront"
      />

      <StopWorkPanel
        ref="stopWorkPanel"
        :actions="stopWorkActions"
        :sites="sites"
        :workfronts="rows"
        :permits="permits"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :permissions="{ issue: canIssueStopWork, lift: canLiftStopWork }"
        @issue="recordStopWork"
        @lift="recordStopWork"
      />

      <HseIncidentForm
        :sites="sites"
        :stop-work-active="stopWorkActive"
        :submitting="incidentBusy"
        :last-reported="lastIncident"
        @report="reportIncident"
      />

      <DailyLogPanel
        :logs="dailyLogs"
        :sites="sites"
        :companies="companies"
        :busy="busy"
        :permissions="dailyLogPermissions"
        @create="createDailyLog"
        @submit="submitDailyLog"
      />

      <QuantityLedgerPanel
        :workfront="selected"
        :records="quantityRecords"
        :busy="busy"
        :can-record="canRecordQuantity"
        @record="recordQuantity"
      />

      <PermitToWorkPanel
        :workfront="selected"
        :permits="permits"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :stop-work-blocked="selectedBlocked"
        :permissions="permitPermissions"
        @request="requestPermit"
        @issue="issuePermit"
      />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> Màn hình chỉ quản lý thi công, HSE và giấy phép làm việc;
        không tạo bất kỳ lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
