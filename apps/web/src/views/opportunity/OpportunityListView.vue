<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ApiError } from '@/api/api-error';
import { opportunityApi } from '@/api/opportunity.api';
import OpportunityCreateForm from '@/components/opportunity/OpportunityCreateForm.vue';
import OpportunityDetailPanel from '@/components/opportunity/OpportunityDetailPanel.vue';
import OpportunityPipeline from '@/components/opportunity/OpportunityPipeline.vue';
import { OPPORTUNITY_STAGE_LABEL, OPPORTUNITY_STAGES } from '@/constants/opportunity';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ConvertOpportunityRequest, ConvertOpportunityView, CreateInvestmentScenarioRequest,
  CreateOpportunityRequest, CreateSurveyPackageRequest, InvestmentScenarioProjection,
  OpportunityListQuery, OpportunityStage, OpportunityView, SubmitInvestmentScenarioRequest,
  SurveyPackageView
} from '@/types/opportunity.types';

/**
 * Opportunity pipeline workspace (API-026…API-033).
 *
 * Opportunities are PRE-PROJECT records: only a tenant-scoped assignment reaches them, and an
 * unreachable pipeline answers with an empty page rather than a 403. The screen therefore treats
 * "empty" as a legitimate answer and says so, instead of implying a failure.
 *
 * No approve action exists anywhere on this screen because none exists in the API — see
 * `OpportunityDetailPanel`. A replayed convert returns the existing project and is reported as a
 * success.
 */
type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();

const opportunities = ref<OpportunityView[]>([]);
const nextCursor = ref<string | null>(null);
const selected = ref<OpportunityView | null>(null);
const surveys = ref<SurveyPackageView[]>([]);
const scenarios = ref<InvestmentScenarioProjection[]>([]);
const conversion = ref<ConvertOpportunityView | null>(null);
const showCreate = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const filters = reactive({ stage: '', customerCompanyId: '' });

const permissions = computed(() => ({
  update: auth.can('opportunity.update'),
  createSurvey: auth.can('survey.create'),
  createScenario: auth.can('scenario.create'),
  submitScenario: auth.can('scenario.submit'),
  convert: auth.can('opportunity.convert')
}));
const canCreate = computed(() => auth.can('opportunity.create'));

function listQuery(cursor?: string): OpportunityListQuery {
  return {
    ...(filters.stage ? { stage: filters.stage as OpportunityStage } : {}),
    ...(filters.customerCompanyId.trim()
      ? { customerCompanyId: filters.customerCompanyId.trim() } : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

async function loadPipeline(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await opportunityApi.listOpportunities(
      context, listQuery(append ? nextCursor.value ?? undefined : undefined)
    );
    opportunities.value = append
      ? [...opportunities.value, ...response.data] : response.data;
    nextCursor.value = response.meta.nextCursor;
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
    await loadPipeline(false);
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải pipeline cơ hội.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  error.value = '';
  try { await loadPipeline(false); }
  catch (caught) { error.value = message(caught, 'Không thể áp dụng bộ lọc.'); }
}

async function openOpportunity(opportunityId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  error.value = '';
  conversion.value = null;
  try {
    const detail = await opportunityApi.getOpportunity(context, opportunityId);
    selected.value = detail.data;
    surveys.value = detail.surveys;
    scenarios.value = detail.scenarios;
    showCreate.value = false;
  } catch (caught) {
    error.value = message(caught, 'Không thể mở cơ hội.');
  } finally {
    busy.value = false;
  }
}

function closeDetail(): void {
  selected.value = null;
  surveys.value = [];
  scenarios.value = [];
  conversion.value = null;
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

async function refreshSelected(): Promise<void> {
  const current = selected.value;
  if (!current) return;
  await openOpportunity(current.id);
  await loadPipeline(false).catch(() => undefined);
}

async function createOpportunity(input: CreateOpportunityRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  let createdId = '';
  const created = await mutate(async () => {
    createdId = (await opportunityApi.createOpportunity(
      context, input, crypto.randomUUID()
    )).data.id;
    await loadPipeline(false);
  }, 'Cơ hội đã được tạo ở giai đoạn LEAD.');
  if (created) {
    showCreate.value = false;
    await openOpportunity(createdId);
  }
}

async function advanceStage(stage: OpportunityStage): Promise<void> {
  const context = auth.apiContext;
  const current = selected.value;
  if (!context || !current) return;
  if (await mutate(async () => {
    await opportunityApi.updateOpportunity(context, current.id, {
      expectedVersion: current.versionNo, stage
    }, crypto.randomUUID());
  }, `Cơ hội đã chuyển sang ${OPPORTUNITY_STAGE_LABEL[stage]}.`)) await refreshSelected();
}

async function createSurvey(input: CreateSurveyPackageRequest): Promise<void> {
  const context = auth.apiContext;
  const current = selected.value;
  if (!context || !current) return;
  if (await mutate(async () => {
    await opportunityApi.createSurveyPackage(context, current.id, input, crypto.randomUUID());
  }, 'Gói khảo sát đã được ghi nhận với revision do server cấp.')) await refreshSelected();
}

async function createScenario(input: CreateInvestmentScenarioRequest): Promise<void> {
  const context = auth.apiContext;
  const current = selected.value;
  if (!context || !current) return;
  if (await mutate(async () => {
    await opportunityApi.createInvestmentScenario(context, current.id, input, crypto.randomUUID());
  }, 'Kịch bản đã được lưu nguyên văn kèm phiên bản công thức.')) await refreshSelected();
}

async function submitScenario(
  scenarioId: string, input: SubmitInvestmentScenarioRequest
): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await opportunityApi.submitInvestmentScenario(context, scenarioId, input, crypto.randomUUID());
  }, 'Kịch bản đã được trình; quyết định phê duyệt chưa khả dụng trong V1.')) {
    await refreshSelected();
  }
}

async function convertOpportunity(input: ConvertOpportunityRequest): Promise<void> {
  const context = auth.apiContext;
  const current = selected.value;
  if (!context || !current) return;
  let replayed = false;
  if (await mutate(async () => {
    const response = await opportunityApi.convertOpportunity(
      context, current.id, input, crypto.randomUUID()
    );
    conversion.value = response.data;
    replayed = response.data.alreadyConverted;
  }, 'Cơ hội đã được chuyển thành dự án.')) {
    // A replay is a success with a different story: the project already existed.
    if (replayed) {
      success.value = 'Cơ hội này đã chuyển đổi trước đó; lệnh trả về đúng dự án đã tạo.';
    }
    await refreshSelected();
  }
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-026…033 · OPPORTUNITY</p>
        <h1>Pipeline cơ hội</h1>
        <p class="lead">Cơ hội tiền-dự-án, khảo sát, kịch bản đầu tư và chuyển đổi thành dự án.</p>
      </div>
      <div class="page-heading__actions">
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Cơ hội là bản ghi cấp tenant, chưa thuộc dự án nào</span>
      <span>Số liệu tài chính giữ nguyên dạng chuỗi</span>
      <strong>Server luôn re-authorize command.</strong>
    </div>

    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section v-if="mutationConflict" class="schedule-inline-conflict">
      <div>
        <strong>Version conflict</strong>
        <p>Cơ hội đã đổi ở nơi khác. Tải lại phiên bản mới nhất trước khi gửi lại command.</p>
      </div>
      <el-button @click="loadWorkspace">Tải version mới</el-button>
    </section>

    <div v-if="loading" class="risk-change-loading" aria-live="polite">
      <span></span><span></span><span></span>
      <p>Đang tải pipeline cơ hội trong scope được phép…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem pipeline cơ hội</h2>
      <p>Cơ hội chỉ hiển thị cho vai trò được cấp ở phạm vi toàn tenant.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải pipeline cơ hội</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <form class="opportunity-toolbar" @submit.prevent="applyFilters">
        <label>
          Giai đoạn
          <select v-model="filters.stage" aria-label="Giai đoạn cơ hội">
            <option value="">Tất cả</option>
            <option v-for="item in OPPORTUNITY_STAGES" :key="item" :value="item">{{ OPPORTUNITY_STAGE_LABEL[item] }}</option>
          </select>
        </label>
        <label>Khách hàng (UUID)<input v-model.trim="filters.customerCompanyId" /></label>
        <el-button native-type="submit">Áp dụng</el-button>
        <el-button v-if="canCreate" type="primary" native-type="button" @click="showCreate = true">
          Tạo cơ hội
        </el-button>
      </form>

      <OpportunityCreateForm
        v-if="showCreate && canCreate"
        :busy="busy"
        @close="showCreate = false"
        @create="createOpportunity"
      />

      <OpportunityPipeline
        :opportunities="opportunities"
        :selected-id="selected?.id ?? null"
        @open="openOpportunity"
      />

      <el-button v-if="nextCursor" :loading="loadingMore" @click="loadPipeline(true)">
        Tải thêm cơ hội
      </el-button>

      <OpportunityDetailPanel
        v-if="selected"
        :key="`${selected.id}:${selected.versionNo}`"
        :opportunity="selected"
        :surveys="surveys"
        :scenarios="scenarios"
        :conversion="conversion"
        :busy="busy"
        :permissions="permissions"
        @close="closeDetail"
        @advance-stage="advanceStage"
        @create-survey="createSurvey"
        @create-scenario="createScenario"
        @submit-scenario="submitScenario"
        @convert="convertOpportunity"
      />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> màn hình quản lý cơ hội thương mại tiền-dự-án; không tạo
        bất kỳ lệnh điều khiển nào tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
