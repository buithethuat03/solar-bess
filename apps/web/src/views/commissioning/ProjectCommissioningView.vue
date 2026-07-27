<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { commissioningApi } from '@/api/commissioning.api';
import { projectApi } from '@/api/project.api';
import CodReadinessBoard from '@/components/commissioning/CodReadinessBoard.vue';
import CommissioningSystemTree from '@/components/commissioning/CommissioningSystemTree.vue';
import TestPackPanel from '@/components/commissioning/TestPackPanel.vue';
import TestRunPanel from '@/components/commissioning/TestRunPanel.vue';
import {
  COMMISSIONING_SYSTEM_STATUS_LABEL, COMMISSIONING_SYSTEM_STATUSES
} from '@/constants/commissioning';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  CodGateView, CodReadinessData, CodTransitionCommandRequest, CommissioningSystemListQuery,
  CommissioningSystemStatus, CommissioningSystemView, CompleteTestRunRequest,
  CreateCommissioningSystemRequest, CreateRetestRequest, CreateTestPackRequest, StartTestRunRequest,
  TestPackView, TestRunView
} from '@/types/commissioning.types';
import type { Project } from '@/types/project.types';

type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const project = ref<Project | null>(null);
const systems = ref<CommissioningSystemView[]>([]);
const systemCursor = ref<string | null>(null);
const selectedSystemId = ref<string | null>(null);
const packs = ref<TestPackView[]>([]);
const selectedPackId = ref<string | null>(null);
const runs = ref<TestRunView[]>([]);
const readiness = ref<CodReadinessData | null>(null);
const gates = ref<CodGateView[]>([]);

const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const filters = reactive({ status: '', systemType: '' });

const portfolioId = computed(() => project.value?.portfolioId);

/**
 * Commissioning không mang chiều gói thầu — system, pack và run thuộc về cả dự án — nên cổng UI
 * dùng hasFullProjectPermission. Server vẫn re-authorize và trả 404 cho mọi thứ ngoài tầm với.
 */
function allowed(permission: string): boolean {
  return auth.hasFullProjectPermission(permission, projectId, portfolioId.value);
}

const systemPermissions = computed(() => ({ create: allowed('commissioningSystem.create') }));
const packPermissions = computed(() => ({ create: allowed('testPack.create') }));
const runPermissions = computed(() => ({
  start: allowed('testRun.start'),
  complete: allowed('testRun.complete'),
  retest: allowed('testRun.retest')
}));
const codPermissions = computed(() => ({ manage: allowed('cod.manage') }));

const selectedSystem = computed(
  () => systems.value.find((system) => system.id === selectedSystemId.value) ?? null
);
const selectedPack = computed(
  () => packs.value.find((pack) => pack.id === selectedPackId.value) ?? null
);

function systemQuery(cursor?: string): CommissioningSystemListQuery {
  return {
    ...(filters.status ? { status: filters.status as CommissioningSystemStatus } : {}),
    ...(filters.systemType ? { systemType: filters.systemType } : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

async function loadSystems(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await commissioningApi.listCommissioningSystems(
      context, projectId, systemQuery(append ? systemCursor.value ?? undefined : undefined)
    );
    systems.value = append ? [...systems.value, ...response.data] : response.data;
    systemCursor.value = response.meta.nextCursor;
  } finally {
    loadingMore.value = false;
  }
}

async function loadReadiness(): Promise<void> {
  const context = auth.apiContext;
  if (!context || !allowed('cod.read')) return;
  readiness.value = (await commissioningApi.readCodReadiness(context, projectId)).data;
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    if (auth.can('project.read')) {
      const detail = await projectApi.getProject(context, projectId).catch(() => null);
      if (detail) project.value = detail.data;
    }
    await loadSystems(false);
    await loadReadiness().catch(() => { readiness.value = null; });
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải Commissioning & COD.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  error.value = '';
  try { await loadSystems(false); }
  catch (caught) { error.value = message(caught, 'Không thể áp dụng bộ lọc.'); }
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
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

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  return list.some((item) => item.id === row.id)
    ? list.map((item) => (item.id === row.id ? row : item))
    : [...list, row];
}

function selectSystem(systemId: string): void {
  selectedSystemId.value = systemId;
  selectedPackId.value = null;
}

async function createSystem(input: CreateCommissioningSystemRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await commissioningApi.createCommissioningSystem(
      context, projectId, input, crypto.randomUUID()
    );
  }, 'Hệ thống nghiệm thu đã được tạo ở trạng thái Chưa sẵn sàng.')) {
    await loadSystems(false).catch(() => undefined);
  }
}

async function createPack(systemId: string, input: CreateTestPackRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await commissioningApi.createTestPack(
      context, systemId, input, crypto.randomUUID()
    );
    packs.value = upsert(packs.value, created.data);
    selectedPackId.value = created.data.id;
  }, 'Test pack đã được tạo và phê duyệt từ revision quy trình đã ISSUED + quét sạch.');
}

async function startRun(testPackId: string, input: StartTestRunRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await commissioningApi.startTestRun(
      context, testPackId, input, crypto.randomUUID()
    );
    runs.value = upsert(runs.value, created.data);
  }, 'Lần chạy thử nghiệm đã bắt đầu.');
}

async function completeRun(testRunId: string, input: CompleteTestRunRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const updated = await commissioningApi.completeTestRun(
      context, testRunId, input, crypto.randomUUID()
    );
    runs.value = upsert(runs.value, updated.data);
  }, 'Kết quả đã được ghi nhận một lần và hàng này đã trở thành lịch sử.');
}

async function createRetest(testRunId: string, input: CreateRetestRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await commissioningApi.createRetest(
      context, testRunId, input, crypto.randomUUID()
    );
    runs.value = upsert(runs.value, created.data);
  }, 'Lần chạy lại đã được tạo như một hàng mới trỏ về lần chạy trước.');
}

async function codCommand(input: CodTransitionCommandRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    const result = await commissioningApi.codTransitionCommand(
      context, projectId, input, crypto.randomUUID()
    );
    if (result.data.gate) gates.value = upsert(gates.value, result.data.gate);
  }, 'Lệnh COD đã được ghi nhận.')) {
    await loadReadiness().catch(() => undefined);
  }
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-098…105 · COMMISSIONING &amp; COD</p>
        <h1>{{ project?.name ?? 'Commissioning & COD' }}</h1>
        <p class="lead">
          Ranh giới hệ thống, bộ hồ sơ thử nghiệm, kết quả bất biến và bảng sẵn sàng vận hành
          thương mại.
        </p>
      </div>
      <div class="page-heading__actions">
        <el-button v-if="auth.can('project.read')" @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button>
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Project: {{ projectId }}</span>
      <span>Kết quả thử nghiệm ghi một lần, không sửa</span>
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
      <p>Đang tải cây hệ thống nghiệm thu trong scope được phép…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem dữ liệu nghiệm thu</h2>
      <p>Không hiển thị hệ thống, kết quả thử nghiệm hay hồ sơ COD nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải dữ liệu nghiệm thu</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <p class="commissioning-scope-note">
        Danh mục API-098…105 có hai thao tác đọc: sổ hệ thống và ma trận sẵn sàng COD. Test pack và
        các lần chạy xuất hiện ở đây từ phản hồi của chính các lệnh trong phiên làm việc này.
      </p>

      <form class="commissioning-toolbar" @submit.prevent="applyFilters">
        <label>Trạng thái<select v-model="filters.status" aria-label="Trạng thái hệ thống"><option value="">Tất cả</option><option v-for="item in COMMISSIONING_SYSTEM_STATUSES" :key="item" :value="item">{{ COMMISSIONING_SYSTEM_STATUS_LABEL[item] }}</option></select></label>
        <label>Loại hệ thống<input v-model.trim="filters.systemType" maxlength="40" placeholder="VD: PV_ARRAY" /></label>
        <el-button native-type="submit">Áp dụng</el-button>
      </form>

      <CommissioningSystemTree
        :systems="systems"
        :selected-id="selectedSystemId"
        :next-cursor="systemCursor"
        :loading-more="loadingMore"
        :busy="busy"
        :permissions="systemPermissions"
        @select="selectSystem"
        @more="loadSystems(true)"
        @create="createSystem"
      />

      <TestPackPanel
        :packs="packs"
        :system="selectedSystem"
        :selected-pack-id="selectedPackId"
        :busy="busy"
        :permissions="packPermissions"
        @select="selectedPackId = $event"
        @create="createPack"
      />

      <TestRunPanel
        :pack="selectedPack"
        :runs="runs"
        :busy="busy"
        :permissions="runPermissions"
        @start="startRun"
        @complete="completeRun"
        @retest="createRetest"
      />

      <CodReadinessBoard
        v-if="allowed('cod.read')"
        :readiness="readiness"
        :gates="gates"
        :parties="project?.parties ?? []"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :permissions="codPermissions"
        @command="codCommand"
      />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> Màn hình chỉ ghi nhận kết quả nghiệm thu và điều kiện
        COD; không tạo bất kỳ lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
