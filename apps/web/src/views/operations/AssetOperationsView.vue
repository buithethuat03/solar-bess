<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { operationsApi } from '@/api/operations.api';
import AlarmCaseList from '@/components/operations/AlarmCaseList.vue';
import AssetPerformancePanel from '@/components/operations/AssetPerformancePanel.vue';
import ServiceIncidentPanel from '@/components/operations/ServiceIncidentPanel.vue';
import WorkOrderCommandPanel from '@/components/operations/WorkOrderCommandPanel.vue';
import WorkOrderCreateForm from '@/components/operations/WorkOrderCreateForm.vue';
import WorkOrderRegisterTable from '@/components/operations/WorkOrderRegisterTable.vue';
import {
  PRIORITY_LABEL, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUSES
} from '@/constants/operations';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AcknowledgeAlarmCaseRequest, AlarmCaseView, AssetPerformanceData, CreateServiceIncidentRequest,
  CreateWorkOrderRequest, ServiceIncidentView, WorkOrderClosureCycleView, WorkOrderCommandRequest,
  WorkOrderListQuery, WorkOrderPriority, WorkOrderRegisterRow, WorkOrderStatus, WorkOrderView
} from '@/types/operations.types';

/**
 * O&M workspace for one asset (API-114…API-121).
 *
 * The asset is the entry point but half the registers are site-scoped, so the site comes from the
 * work-order register's own meta (`meta.siteId`) rather than from a second guess: `workOrder.read`
 * gates this route, so that read always happens and always names the site the asset sits on.
 *
 * Closure cycles are accumulated, never replaced. API-118 does not embed them and no list endpoint
 * exists for them, so the client keeps every cycle an API-120 response has revealed, merged by id:
 * a cycle that gets decided is updated in place, and REOPEN's new cycle is appended beside the
 * frozen one. The previous verification is never overwritten (DB-119).
 */
type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();
const route = useRoute();
const assetId = route.params.assetId as string;

const siteId = ref<string | null>(null);
const rows = ref<WorkOrderRegisterRow[]>([]);
const registerCursor = ref<string | null>(null);
const selected = ref<WorkOrderView | null>(null);
const cyclesByWorkOrder = ref<Record<string, WorkOrderClosureCycleView[]>>({});
const alarmCases = ref<AlarmCaseView[]>([]);
const alarmCursor = ref<string | null>(null);
const alarmReplayNoop = ref(false);
const incidents = ref<ServiceIncidentView[]>([]);
const incidentCursor = ref<string | null>(null);
const performance = ref<AssetPerformanceData | null>(null);
const showCreate = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const filters = reactive({ status: '', priority: '' });

const canReadAlarms = computed(() => auth.can('alarmCase.read'));
const canAcknowledge = computed(() => auth.can('alarmCase.acknowledge'));
const canReadIncidents = computed(() => auth.can('serviceIncident.read'));
const canCreateIncident = computed(() => auth.can('serviceIncident.create'));
const canCreateWorkOrder = computed(() => auth.can('workOrder.create'));
const canManageWorkOrder = computed(() => auth.can('workOrder.manage'));
const canReadPerformance = computed(() => auth.can('performance.read'));

const selectedCycles = computed(
  () => (selected.value ? cyclesByWorkOrder.value[selected.value.id] ?? [] : [])
);

function registerQuery(cursor?: string): WorkOrderListQuery {
  return {
    ...(filters.status ? { status: filters.status as WorkOrderStatus } : {}),
    ...(filters.priority ? { priority: filters.priority as WorkOrderPriority } : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

/** Merge by cycle id: a decided cycle replaces its open self, a new cycle is appended. */
function rememberCycle(workOrderId: string, cycle: WorkOrderClosureCycleView | null): void {
  if (!cycle) return;
  const existing = cyclesByWorkOrder.value[workOrderId] ?? [];
  const merged = existing.some((item) => item.id === cycle.id)
    ? existing.map((item) => (item.id === cycle.id ? cycle : item))
    : [...existing, cycle];
  cyclesByWorkOrder.value = { ...cyclesByWorkOrder.value, [workOrderId]: merged };
}

async function loadRegister(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await operationsApi.listWorkOrders(
      context, assetId, registerQuery(append ? registerCursor.value ?? undefined : undefined)
    );
    rows.value = append ? [...rows.value, ...response.data] : response.data;
    registerCursor.value = response.meta.nextCursor;
    siteId.value = response.meta.siteId;
  } finally {
    loadingMore.value = false;
  }
}

async function loadAlarmCases(append: boolean): Promise<void> {
  const context = auth.apiContext;
  const site = siteId.value;
  if (!context || !site || !canReadAlarms.value) return;
  const response = await operationsApi.listAlarmCases(context, site, {
    assetId, limit: PAGE_LIMIT,
    ...(append && alarmCursor.value ? { cursor: alarmCursor.value } : {})
  });
  alarmCases.value = append ? [...alarmCases.value, ...response.data] : response.data;
  alarmCursor.value = response.meta.nextCursor;
}

async function loadIncidents(append: boolean): Promise<void> {
  const context = auth.apiContext;
  const site = siteId.value;
  if (!context || !site || !canReadIncidents.value) return;
  const response = await operationsApi.listServiceIncidents(context, site, {
    assetId, limit: PAGE_LIMIT,
    ...(append && incidentCursor.value ? { cursor: incidentCursor.value } : {})
  });
  incidents.value = append ? [...incidents.value, ...response.data] : response.data;
  incidentCursor.value = response.meta.nextCursor;
}

async function loadPerformance(): Promise<void> {
  const context = auth.apiContext;
  if (!context || !canReadPerformance.value) return;
  performance.value = (await operationsApi.getAssetPerformance(context, assetId)).data;
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    await loadRegister(false);
    // Site-scoped registers and the performance read are optional context: a missing module
    // permission empties that panel instead of failing the whole screen.
    await Promise.allSettled([
      loadAlarmCases(false), loadIncidents(false), loadPerformance()
    ]);
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải workspace O&M của asset.';
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
    return false;
  } finally {
    busy.value = false;
  }
}

function openWorkOrder(workOrderId: string): void {
  selected.value = rows.value.find((row) => row.id === workOrderId) ?? null;
  showCreate.value = false;
  error.value = '';
}

function closeWorkOrder(): void {
  selected.value = null;
}

async function createWorkOrder(input: CreateWorkOrderRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await operationsApi.createWorkOrder(context, assetId, input, crypto.randomUUID());
    await loadRegister(false);
  }, 'Work order đã được tạo cùng audit/outbox.')) {
    showCreate.value = false;
  }
}

async function runCommand(workOrderId: string, input: WorkOrderCommandRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    const response = await operationsApi.workOrderCommand(
      context, workOrderId, input, crypto.randomUUID()
    );
    rememberCycle(workOrderId, response.data.closureCycle);
    await loadRegister(false);
    selected.value = rows.value.find((row) => row.id === workOrderId) ?? response.data;
    await loadPerformance().catch(() => undefined);
  }, `Lệnh ${input.commandType} đã được ghi nhận.`)) return;
  // A refused command still needs the screen to show the state that actually won.
  await loadRegister(false).catch(() => undefined);
  selected.value = rows.value.find((row) => row.id === workOrderId) ?? selected.value;
}

async function acknowledgeAlarm(
  alarmCaseId: string, input: AcknowledgeAlarmCaseRequest
): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    const response = await operationsApi.acknowledgeAlarmCase(
      context, alarmCaseId, input, crypto.randomUUID()
    );
    // A replay is not an error: the first acknowledgement stands and nothing new is written.
    alarmReplayNoop.value = !response.data.acknowledgementApplied;
    await loadAlarmCases(false);
    await loadPerformance().catch(() => undefined);
  }, 'Đã ghi nhận cục bộ trong PM Web; cảnh báo tại hệ thống nguồn không bị thay đổi.')) return;
  alarmReplayNoop.value = false;
}

async function createIncident(input: CreateServiceIncidentRequest): Promise<void> {
  const context = auth.apiContext;
  const site = siteId.value;
  if (!context || !site) return;
  await mutate(async () => {
    await operationsApi.createServiceIncident(context, site, input, crypto.randomUUID());
    await loadIncidents(false);
    await loadPerformance().catch(() => undefined);
  }, 'Sự cố dịch vụ đã được mở ở trạng thái OPEN.');
}

function loadMoreAlarms(): void {
  void loadAlarmCases(true).catch((caught) => {
    error.value = message(caught, 'Không thể tải thêm alarm case.');
  });
}

function loadMoreIncidents(): void {
  void loadIncidents(true).catch((caught) => {
    error.value = message(caught, 'Không thể tải thêm sự cố dịch vụ.');
  });
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-114…121 · O&amp;M</p>
        <h1>Vận hành &amp; bảo trì asset</h1>
        <p class="lead">Work order, alarm case cục bộ, sự cố dịch vụ và bối cảnh hiệu năng của một asset.</p>
      </div>
      <div class="page-heading__actions">
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Asset: {{ assetId }}</span>
      <span>Site: {{ siteId ?? 'đang xác định' }}</span>
      <strong>PM Web chỉ đọc từ OT; không có lệnh điều khiển nào ở đây.</strong>
    </div>

    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section v-if="mutationConflict" class="schedule-inline-conflict">
      <div>
        <strong>Version conflict</strong>
        <p>Work order đã đổi ở nơi khác. Tải lại phiên bản mới nhất trước khi gửi lại lệnh.</p>
      </div>
      <el-button @click="loadWorkspace">Tải version mới</el-button>
    </section>

    <div v-if="loading" class="risk-change-loading" aria-live="polite">
      <span></span><span></span><span></span>
      <p>Đang tải sổ work order trong scope được phép…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem work order của asset này</h2>
      <p>Không hiển thị bất kỳ work order, alarm case hay sự cố nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải workspace O&amp;M</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <form class="operations-toolbar" @submit.prevent="applyFilters">
        <label>
          Trạng thái work order
          <select v-model="filters.status" aria-label="Trạng thái work order">
            <option value="">Tất cả</option>
            <option v-for="item in WORK_ORDER_STATUSES" :key="item" :value="item">{{ WORK_ORDER_STATUS_LABEL[item] }}</option>
          </select>
        </label>
        <label>
          Ưu tiên
          <select v-model="filters.priority" aria-label="Ưu tiên">
            <option value="">Tất cả</option>
            <option v-for="item in WORK_ORDER_PRIORITIES" :key="item" :value="item">{{ PRIORITY_LABEL[item] }}</option>
          </select>
        </label>
        <el-button native-type="submit">Áp dụng</el-button>
        <el-button v-if="canCreateWorkOrder" type="primary" native-type="button" @click="showCreate = true">
          Tạo work order
        </el-button>
      </form>

      <WorkOrderCreateForm
        v-if="showCreate && canCreateWorkOrder"
        :incidents="incidents"
        :busy="busy"
        @close="showCreate = false"
        @create="createWorkOrder"
      />

      <WorkOrderRegisterTable
        :rows="rows"
        :next-cursor="registerCursor"
        :loading-more="loadingMore"
        :selected-id="selected?.id ?? null"
        @open="openWorkOrder"
        @more="loadRegister(true)"
      />

      <WorkOrderCommandPanel
        v-if="selected"
        :key="`${selected.id}:${selected.versionNo}`"
        :work-order="selected"
        :cycles="selectedCycles"
        :busy="busy"
        :can-manage="canManageWorkOrder"
        :actor-id="auth.user?.id ?? null"
        @close="closeWorkOrder"
        @command="runCommand"
      />

      <AlarmCaseList
        v-if="canReadAlarms"
        :cases="alarmCases"
        :next-cursor="alarmCursor"
        :busy="busy"
        :can-acknowledge="canAcknowledge"
        :last-acknowledge-noop="alarmReplayNoop"
        @more="loadMoreAlarms"
        @acknowledge="acknowledgeAlarm"
      />

      <ServiceIncidentPanel
        v-if="canReadIncidents"
        :incidents="incidents"
        :alarm-cases="alarmCases"
        :asset-id="assetId"
        :next-cursor="incidentCursor"
        :busy="busy"
        :can-create="canCreateIncident"
        @more="loadMoreIncidents"
        @create="createIncident"
      />

      <AssetPerformancePanel :performance="performance" :permitted="canReadPerformance" />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> màn hình chỉ quản lý hồ sơ vận hành trong PM Web. Không
        có lệnh charge/discharge, start/stop, reset alarm nguồn, đổi SOC limit hay setpoint nào
        được tạo, chuyển tiếp hoặc che giấu ở đây.
      </p>
    </template>
  </AppLayout>
</template>
