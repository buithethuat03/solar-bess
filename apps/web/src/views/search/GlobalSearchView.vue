<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ApiError } from '@/api/api-error';
import { searchApi } from '@/api/search.api';
import IdentityAdminPanel from '@/components/search/IdentityAdminPanel.vue';
import ReportJobPanel from '@/components/search/ReportJobPanel.vue';
import SavedViewPanel from '@/components/search/SavedViewPanel.vue';
import SearchResultList from '@/components/search/SearchResultList.vue';
import {
  reportJobPending, SEARCH_QUERY_MIN_LENGTH, SEARCH_RESULT_TYPE_PERMISSION, SEARCH_RESULT_TYPES
} from '@/constants/search';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AuditEventListQuery, AuditEventView, CreateReportJobRequest, CreateSavedViewRequest,
  IdentityPermissionsData, ReportJobView, SavedViewTargetType, SavedViewView, SearchResultRow,
  SearchResultType
} from '@/types/search.types';

/**
 * Cross-module search, saved views and register exports (API-130…API-134) with the identity
 * context those three need (API-002, API-013).
 *
 * Report-job polling lives here rather than in the panel because the transport does: the view owns
 * the interval, stops it as soon as every job is terminal, and clears it on unmount so a
 * navigation cannot leave a timer running against a page that is gone.
 */
const PAGE_LIMIT = 25;
const POLL_INTERVAL_MS = 4000;

const auth = useAuthStore();

const query = ref('');
const selectedTypes = ref<SearchResultType[]>([]);
const rows = ref<SearchResultRow[]>([]);
const searched = ref(false);
const searching = ref(false);

const savedViews = ref<SavedViewView[]>([]);
const savedViewCursor = ref<string | null>(null);
const savedViewFilter = ref<SavedViewTargetType | ''>('');

const reportJobs = ref<ReportJobView[]>([]);
const polling = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const identity = ref<IdentityPermissionsData | null>(null);
const auditEvents = ref<AuditEventView[]>([]);
const auditCursor = ref<string | null>(null);
const auditFilters = ref<AuditEventListQuery>({});

const loading = ref(true);
const busy = ref(false);
const error = ref('');
const success = ref('');

const canReadSavedViews = computed(() => auth.can('savedView.read'));
const canCreateSavedView = computed(() => auth.can('savedView.create'));
const canCreateReport = computed(() => auth.can('report.create'));
const canReadAudit = computed(() => auth.can('audit.read'));

/**
 * The registers the caller can actually read, taken from the effective permission set rather than
 * inferred from empty results — an empty branch and a forbidden branch look identical on the wire,
 * on purpose.
 */
const readableTypes = computed(() => {
  const permissions = identity.value?.permissions ?? auth.permissions;
  return SEARCH_RESULT_TYPES.filter(
    (type) => permissions.includes(SEARCH_RESULT_TYPE_PERMISSION[type])
  );
});

const currentFilterSnapshot = computed<Record<string, unknown>>(() => ({
  query: query.value,
  types: selectedTypes.value.length ? [...selectedTypes.value] : [...SEARCH_RESULT_TYPES]
}));

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function toggleType(type: SearchResultType): void {
  selectedTypes.value = selectedTypes.value.includes(type)
    ? selectedTypes.value.filter((item) => item !== type)
    : [...selectedTypes.value, type];
}

async function runSearch(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  const text = query.value.trim();
  error.value = '';
  if (text.length < SEARCH_QUERY_MIN_LENGTH) {
    error.value = `Từ khóa phải có ít nhất ${SEARCH_QUERY_MIN_LENGTH} ký tự.`;
    return;
  }
  searching.value = true;
  try {
    const response = await searchApi.search(context, {
      query: text, limit: PAGE_LIMIT,
      ...(selectedTypes.value.length ? { types: [...selectedTypes.value] } : {})
    });
    rows.value = response.data;
    searched.value = true;
  } catch (caught) {
    error.value = message(caught, 'Không thể thực hiện tìm kiếm.');
  } finally {
    searching.value = false;
  }
}

async function loadSavedViews(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context || !canReadSavedViews.value) return;
  const response = await searchApi.listSavedViews(context, {
    limit: PAGE_LIMIT,
    ...(savedViewFilter.value ? { targetType: savedViewFilter.value } : {}),
    ...(append && savedViewCursor.value ? { cursor: savedViewCursor.value } : {})
  });
  savedViews.value = append ? [...savedViews.value, ...response.data] : response.data;
  savedViewCursor.value = response.meta.nextCursor;
}

async function loadAuditEvents(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context || !canReadAudit.value) return;
  const response = await searchApi.listAuditEvents(context, {
    limit: PAGE_LIMIT, ...auditFilters.value,
    ...(append && auditCursor.value ? { cursor: auditCursor.value } : {})
  });
  auditEvents.value = append ? [...auditEvents.value, ...response.data] : response.data;
  auditCursor.value = response.meta.nextCursor;
}

async function loadIdentity(): Promise<void> {
  const context = auth.apiContext;
  if (!context || !auth.can('permission.read.self')) return;
  identity.value = (await searchApi.mePermissions(context)).data;
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  // Every panel is optional context: a missing module permission empties that panel instead of
  // failing the search screen, which is the one thing everybody needs.
  await Promise.allSettled([loadIdentity(), loadSavedViews(false), loadAuditEvents(false)]);
  loading.value = false;
}

async function mutate(action: () => Promise<void>, note: string): Promise<boolean> {
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    await action();
    success.value = note;
    return true;
  } catch (caught) {
    error.value = message(caught, 'Không thể hoàn thành command.');
    return false;
  } finally {
    busy.value = false;
  }
}

async function createSavedView(input: CreateSavedViewRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    await searchApi.createSavedView(context, input, crypto.randomUUID());
    await loadSavedViews(false);
  }, 'Saved view riêng tư đã được lưu.');
}

function filterSavedViews(targetType: SavedViewTargetType | ''): void {
  savedViewFilter.value = targetType;
  void loadSavedViews(false).catch((caught) => {
    error.value = message(caught, 'Không thể lọc saved view.');
  });
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  polling.value = false;
}

async function refreshJob(reportJobId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  try {
    const response = await searchApi.getReportJob(context, reportJobId);
    reportJobs.value = reportJobs.value.map(
      (job) => (job.id === reportJobId ? response.data : job)
    );
  } catch (caught) {
    error.value = message(caught, 'Không thể cập nhật trạng thái job.');
    stopPolling();
  }
}

/** Poll only while at least one job is QUEUED/RUNNING; terminal states stop the timer. */
function startPolling(): void {
  if (pollTimer !== null) return;
  polling.value = true;
  pollTimer = setInterval(() => {
    const pending = reportJobs.value.filter((job) => reportJobPending(job.status));
    if (!pending.length) {
      stopPolling();
      return;
    }
    void Promise.allSettled(pending.map((job) => refreshJob(job.id)));
  }, POLL_INTERVAL_MS);
}

async function createReportJob(input: CreateReportJobRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const response = await searchApi.createReportJob(context, input, crypto.randomUUID());
    reportJobs.value = [response.data, ...reportJobs.value];
    if (reportJobPending(response.data.status)) startPolling();
  }, 'Job xuất dữ liệu đã được xếp hàng; worker sẽ xử lý tiếp.');
}

function filterAudit(next: AuditEventListQuery): void {
  auditFilters.value = next;
  void loadAuditEvents(false).catch((caught) => {
    error.value = message(caught, 'Không thể lọc audit event.');
  });
}

function loadMoreSavedViews(): void {
  void loadSavedViews(true).catch((caught) => {
    error.value = message(caught, 'Không thể tải thêm saved view.');
  });
}

function loadMoreAudit(): void {
  void loadAuditEvents(true).catch((caught) => {
    error.value = message(caught, 'Không thể tải thêm audit event.');
  });
}

onMounted(() => void loadWorkspace());
onUnmounted(stopPolling);
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-130…134 · SEARCH &amp; REPORTING</p>
        <h1>Tìm kiếm toàn hệ thống</h1>
        <p class="lead">Tìm kiếm liên module theo quyền, saved view riêng tư và job xuất register.</p>
      </div>
      <div class="page-heading__actions">
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Register bạn đọc được: {{ readableTypes.length }}/{{ SEARCH_RESULT_TYPES.length }}</span>
      <span>Phiên bản chính sách: {{ identity?.policyVersion ?? 'chưa xác định' }}</span>
      <strong>Tìm kiếm không tiết lộ bản ghi ngoài scope.</strong>
    </div>

    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form class="search-toolbar" @submit.prevent="runSearch">
      <label class="search-toolbar__query">
        Từ khóa
        <input
          v-model="query"
          type="search"
          required
          :minlength="SEARCH_QUERY_MIN_LENGTH"
          maxlength="200"
          placeholder="Mã theo tiền tố, tiêu đề theo chuỗi con"
        />
      </label>
      <el-button native-type="submit" type="primary" :loading="searching">Tìm kiếm</el-button>
    </form>

    <SearchResultList
      :rows="rows"
      :selected-types="selectedTypes"
      :readable-types="readableTypes"
      :searched="searched"
      :loading="searching"
      @toggle-type="toggleType"
    />

    <SavedViewPanel
      v-if="canReadSavedViews"
      :views="savedViews"
      :next-cursor="savedViewCursor"
      :busy="busy"
      :can-create="canCreateSavedView"
      :current-filter-snapshot="currentFilterSnapshot"
      @more="loadMoreSavedViews"
      @create="createSavedView"
      @filter="filterSavedViews"
    />

    <ReportJobPanel
      :jobs="reportJobs"
      :busy="busy"
      :can-create="canCreateReport"
      :polling="polling"
      @create="createReportJob"
      @refresh="refreshJob"
    />

    <IdentityAdminPanel
      :identity="identity"
      :events="auditEvents"
      :next-cursor="auditCursor"
      :busy="busy"
      :can-read-audit="canReadAudit"
      @more="loadMoreAudit"
      @filter="filterAudit"
    />

    <p class="boundary-note">
      <strong>Ranh giới an toàn:</strong> tìm kiếm và báo cáo chỉ đọc dữ liệu quản lý dự án; không
      truy vấn và không phát lệnh nào tới hệ OT.
    </p>
  </AppLayout>
</template>
