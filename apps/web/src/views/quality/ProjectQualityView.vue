<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { fieldHseApi } from '@/api/field-hse.api';
import { projectApi } from '@/api/project.api';
import { scheduleApi } from '@/api/schedule.api';
import InspectionPanel from '@/components/quality/InspectionPanel.vue';
import NcrRegisterPanel from '@/components/quality/NcrRegisterPanel.vue';
import PunchListPanel from '@/components/quality/PunchListPanel.vue';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  CapaActionView, InspectionCommandRequest, InspectionView, NcrCommandData, NcrCommandRequest,
  NcrCommandResultView, NcrDispositionCycleView, NcrView, PunchClosureCycleView,
  PunchCommandRequest, PunchItemView
} from '@/types/field-hse.types';
import type { Project } from '@/types/project.types';
import type { SchedulePackage } from '@/types/schedule.types';

type ScreenState = 'ready' | 'denied' | 'error';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const project = ref<Project | null>(null);
const packages = ref<SchedulePackage[]>([]);

/**
 * API-095/096/097 are commands only — the catalog has no read operation for inspections, NCRs or
 * punch items. Every register below is what THIS session appended, and each panel says so instead of
 * pretending to be the project's quality history.
 */
const inspections = ref<InspectionView[]>([]);
const ncrs = ref<NcrView[]>([]);
const ncrCycles = ref<Record<string, NcrDispositionCycleView[]>>({});
const capas = ref<CapaActionView[]>([]);
const punchItems = ref<PunchItemView[]>([]);
const punchCycles = ref<Record<string, PunchClosureCycleView[]>>({});

const loading = ref(true);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const portfolioId = computed(() => project.value?.portfolioId);

function allowed(permission: string): boolean {
  return auth.hasFullProjectPermission(permission, projectId, portfolioId.value)
    || packages.value.some((item) => auth.hasPackagePermission(permission, item.id));
}

const canManageInspection = computed(() => allowed('inspection.manage'));
const canManageNcr = computed(() => allowed('ncr.manage'));
const canManagePunch = computed(() => allowed('punch.manage'));

/** RECORD_CAPA/VERIFY_CAPA answer with a CAPA row; every other NCR command answers with the NCR. */
function isNcrResult(data: NcrCommandData): data is NcrCommandResultView {
  return 'code' in data;
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    // API-086 is the slice's only read operation; it doubles as the authorization probe here.
    await fieldHseApi.listWorkfronts(context, projectId, { limit: 1 });
    const optional = await Promise.allSettled([
      auth.can('project.read') ? projectApi.getProject(context, projectId) : Promise.resolve(null),
      auth.can('package.read') ? scheduleApi.listPackages(context, projectId) : Promise.resolve(null)
    ]);
    const [projectResult, packageResult] = optional;
    if (projectResult.status === 'fulfilled' && projectResult.value) project.value = projectResult.value.data;
    if (packageResult.status === 'fulfilled' && packageResult.value) packages.value = packageResult.value.data;
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải màn hình chất lượng.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

async function mutate(action: () => Promise<void>, note: string): Promise<void> {
  busy.value = true;
  error.value = '';
  success.value = '';
  mutationConflict.value = false;
  try {
    await action();
    success.value = note;
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = message(caught, 'Không thể hoàn thành command.');
    mutationConflict.value = apiError?.status === 409;
  } finally {
    busy.value = false;
  }
}

/**
 * A RECORD replaces its own run in place because that run is now frozen; a REQUEST always arrives as
 * a NEW row at `sequenceNo + 1`, so a re-inspection never overwrites the failed attempt.
 */
async function runInspectionCommand(
  itpId: string, input: InspectionCommandRequest
): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const result = await fieldHseApi.inspectionCommand(context, itpId, input, crypto.randomUUID());
    const exists = inspections.value.some((row) => row.id === result.data.id);
    inspections.value = exists
      ? inspections.value.map((row) => (row.id === result.data.id ? result.data : row))
      : [...inspections.value, result.data];
  }, input.commandType === 'REQUEST'
    ? 'Đã mở lượt kiểm tra mới cho hold point.'
    : 'Đã ghi kết quả kiểm tra; lượt này đóng băng vĩnh viễn.');
}

async function runNcrCommand(input: NcrCommandRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const result = await fieldHseApi.ncrCommand(context, projectId, input, crypto.randomUUID());
    if (!isNcrResult(result.data)) {
      const capa = result.data;
      capas.value = capas.value.some((row) => row.id === capa.id)
        ? capas.value.map((row) => (row.id === capa.id ? capa : row))
        : [...capas.value, capa];
      return;
    }
    const { dispositionCycle, ...ncr } = result.data;
    ncrs.value = ncrs.value.some((row) => row.id === ncr.id)
      ? ncrs.value.map((row) => (row.id === ncr.id ? ncr : row))
      : [ncr, ...ncrs.value];
    if (dispositionCycle) {
      const existing = ncrCycles.value[ncr.id] ?? [];
      const merged = existing.some((cycle) => cycle.id === dispositionCycle.id)
        ? existing.map((cycle) => (cycle.id === dispositionCycle.id ? dispositionCycle : cycle))
        : [...existing, dispositionCycle];
      ncrCycles.value = { ...ncrCycles.value, [ncr.id]: merged };
    }
  }, 'Lệnh NCR đã được ghi nhận.');
}

async function runPunchCommand(input: PunchCommandRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const result = await fieldHseApi.punchCommand(context, projectId, input, crypto.randomUUID());
    const { closureCycle, ...item } = result.data;
    punchItems.value = punchItems.value.some((row) => row.id === item.id)
      ? punchItems.value.map((row) => (row.id === item.id ? item : row))
      : [item, ...punchItems.value];
    if (closureCycle) {
      const existing = punchCycles.value[item.id] ?? [];
      const merged = existing.some((cycle) => cycle.id === closureCycle.id)
        ? existing.map((cycle) => (cycle.id === closureCycle.id ? closureCycle : cycle))
        : [...existing, closureCycle];
      punchCycles.value = { ...punchCycles.value, [item.id]: merged };
    }
  }, 'Lệnh punch đã được ghi nhận.');
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-095…097 · QUALITY CONTROL</p>
        <h1>{{ project?.name ?? 'Quality Control' }}</h1>
        <p class="lead">Kiểm tra hold point, sổ NCR với các vòng xử lý và punch list theo category A/B/C/D.</p>
      </div>
      <div class="page-heading__actions">
        <el-button v-if="auth.can('project.read')" @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button>
        <el-button @click="router.push({ name: RouteName.projectFieldOperations, params: { projectId } })">Thi công &amp; HSE</el-button>
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Project: {{ projectId }}</span>
      <span>Kết quả kiểm tra ghi một lần rồi đóng băng</span>
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
      <p>Đang tải authorized quality workspace…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem dữ liệu chất lượng</h2>
      <p>Không hiển thị NCR, punch item hay kết quả kiểm tra nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải màn hình chất lượng</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <InspectionPanel
        :inspections="inspections"
        :busy="busy"
        :can-manage="canManageInspection"
        @command="runInspectionCommand"
      />

      <NcrRegisterPanel
        :ncrs="ncrs"
        :cycles="ncrCycles"
        :capas="capas"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :can-manage="canManageNcr"
        @command="runNcrCommand"
      />

      <PunchListPanel
        :items="punchItems"
        :cycles="punchCycles"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :can-manage="canManagePunch"
        @command="runPunchCommand"
      />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> Màn hình chỉ quản lý chất lượng dự án; không tạo bất kỳ
        lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
