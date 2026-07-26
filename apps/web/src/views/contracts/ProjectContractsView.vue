<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { contractApi } from '@/api/contract.api';
import { projectApi } from '@/api/project.api';
import ContractCreateForm from '@/components/contracts/ContractCreateForm.vue';
import ContractDetailPanel from '@/components/contracts/ContractDetailPanel.vue';
import ContractRegisterTable from '@/components/contracts/ContractRegisterTable.vue';
import CostSummaryPanel from '@/components/contracts/CostSummaryPanel.vue';
import ObligationPanel from '@/components/contracts/ObligationPanel.vue';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUSES, CONTRACT_TYPE_LABEL, CONTRACT_TYPES } from '@/constants/contracts';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ContractAppendixView, ContractDetailView, ContractListQuery, ContractPartyView, ContractStatus,
  ContractType, ContractView, CostSummaryData, CreateBudgetVersionRequest, CreateCommitmentRequest,
  CreateContractAppendixRequest, CreateContractPartyRequest, CreateContractRequest,
  CreateObligationRequest, CreatePaymentRequest, FulfillObligationRequest, ObligationRegisterRow,
  PaymentWithComponentsView, UpdateContractRequest
} from '@/types/contract.types';
import type { Company, LegalEntity, Project } from '@/types/project.types';

type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const project = ref<Project | null>(null);
const companies = ref<Company[]>([]);
const legalEntities = ref<LegalEntity[]>([]);
const rows = ref<ContractView[]>([]);
const registerCursor = ref<string | null>(null);
const partyCounts = ref<Record<string, number>>({});
const selected = ref<ContractDetailView | null>(null);
const parties = ref<ContractPartyView[]>([]);
const appendices = ref<ContractAppendixView[]>([]);
const obligations = ref<ObligationRegisterRow[]>([]);
const obligationCursor = ref<string | null>(null);
const costSummary = ref<CostSummaryData | null>(null);
const lastPayment = ref<PaymentWithComponentsView | null>(null);
const showCreate = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const filters = reactive({ type: '', status: '' });

const portfolioId = computed(() => project.value?.portfolioId);

/**
 * Hợp đồng không có granularity theo gói thầu: scope hữu hiệu là tenant/portfolio/project, nên
 * mọi cổng UI đi qua hasFullProjectPermission. Server luôn re-authorize từng command.
 */
function allowed(permission: string): boolean {
  return auth.hasFullProjectPermission(permission, projectId, portfolioId.value);
}

const canCreate = computed(() => allowed('contract.create'));
const canReadCost = computed(() => allowed('cost.read'));
const detailPermissions = computed(() => ({
  update: allowed('contract.update'),
  addParty: allowed('contractParty.create'),
  addAppendix: allowed('contractAppendix.create')
}));
const obligationPermissions = computed(() => ({
  create: allowed('obligation.create'),
  fulfill: allowed('obligation.fulfill')
}));
const costPermissions = computed(() => ({
  budgetSubmit: allowed('budget.submit'),
  commitmentCreate: allowed('commitment.create'),
  paymentCreate: allowed('payment.create')
}));

function registerQuery(cursor?: string): ContractListQuery {
  return {
    ...(filters.type ? { type: filters.type as ContractType } : {}),
    ...(filters.status ? { status: filters.status as ContractStatus } : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

async function loadRegister(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await contractApi.listContracts(
      context, projectId, registerQuery(append ? registerCursor.value ?? undefined : undefined)
    );
    rows.value = append ? [...rows.value, ...response.data] : response.data;
    registerCursor.value = response.meta.nextCursor;
  } finally {
    loadingMore.value = false;
  }
}

async function loadCostSummary(): Promise<void> {
  const context = auth.apiContext;
  if (!context || !canReadCost.value) return;
  costSummary.value = (await contractApi.getCostSummary(context, projectId)).data;
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    // Master data là phụ trợ (form bên tham gia/payment); thiếu quyền thì form vẫn render rỗng.
    const optional = await Promise.allSettled([
      auth.can('project.read') ? projectApi.getProject(context, projectId) : Promise.resolve(null),
      auth.can('organization.read') ? projectApi.listCompanies(context) : Promise.resolve(null),
      auth.can('legalEntity.read') ? projectApi.listLegalEntities(context) : Promise.resolve(null)
    ]);
    const [projectResult, companyResult, legalResult] = optional;
    if (projectResult.status === 'fulfilled' && projectResult.value) project.value = projectResult.value.data;
    if (companyResult.status === 'fulfilled' && companyResult.value) companies.value = companyResult.value.data;
    if (legalResult.status === 'fulfilled' && legalResult.value) legalEntities.value = legalResult.value.data;
    await loadRegister(false);
    await loadCostSummary().catch(() => { costSummary.value = null; });
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải Contract Register.';
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

async function loadObligations(contractId: string, append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context || !allowed('obligation.read')) return;
  const response = await contractApi.listObligations(context, contractId, {
    ...(append && obligationCursor.value ? { cursor: obligationCursor.value } : {}),
    limit: PAGE_LIMIT
  });
  obligations.value = append ? [...obligations.value, ...response.data] : response.data;
  obligationCursor.value = response.meta.nextCursor;
}

async function openContract(contractId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  error.value = '';
  try {
    const detail = await contractApi.getContract(context, contractId);
    selected.value = detail.data;
    parties.value = detail.parties;
    appendices.value = detail.appendices;
    // Register (API-053) không nhúng số bên; chỉ khi mở detail mới biết chắc để hiển thị.
    partyCounts.value = { ...partyCounts.value, [contractId]: detail.parties.length };
    showCreate.value = false;
    await loadObligations(contractId, false).catch(() => { obligations.value = []; });
  } catch (caught) {
    error.value = message(caught, 'Không thể mở hợp đồng.');
  } finally {
    busy.value = false;
  }
}

function closeDetail(): void {
  selected.value = null;
  parties.value = [];
  appendices.value = [];
  obligations.value = [];
  obligationCursor.value = null;
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

async function refreshSelected(): Promise<void> {
  const contract = selected.value;
  if (!contract) return;
  await openContract(contract.id);
  await loadRegister(false);
}

async function createContract(input: CreateContractRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  let contractId = '';
  const created = await mutate(async () => {
    contractId = (await contractApi.createContract(
      context, projectId, input, crypto.randomUUID()
    )).data.id;
    await loadRegister(false);
  }, 'Hợp đồng đã được đăng ký ở trạng thái DRAFT cùng audit/outbox.');
  if (created) {
    showCreate.value = false;
    await openContract(contractId);
  }
}

async function updateContract(input: UpdateContractRequest): Promise<void> {
  const context = auth.apiContext;
  const contract = selected.value;
  if (!context || !contract) return;
  if (await mutate(async () => {
    await contractApi.updateContract(context, contract.id, input, crypto.randomUUID());
  }, 'Bản nháp hợp đồng đã được cập nhật.')) await refreshSelected();
}

async function addParty(input: CreateContractPartyRequest): Promise<void> {
  const context = auth.apiContext;
  const contract = selected.value;
  if (!context || !contract) return;
  if (await mutate(async () => {
    await contractApi.createContractParty(context, contract.id, input, crypto.randomUUID());
  }, 'Bên tham gia đã được ghi nhận kèm snapshot pháp lý.')) await refreshSelected();
}

async function addAppendix(input: CreateContractAppendixRequest): Promise<void> {
  const context = auth.apiContext;
  const contract = selected.value;
  if (!context || !contract) return;
  if (await mutate(async () => {
    await contractApi.createContractAppendix(context, contract.id, input, crypto.randomUUID());
  }, 'Phụ lục đã được ghi nhận; giá trị hợp nhất tính lại từ phụ lục EFFECTIVE.')) {
    await refreshSelected();
  }
}

async function createObligation(input: CreateObligationRequest): Promise<void> {
  const context = auth.apiContext;
  const contract = selected.value;
  if (!context || !contract) return;
  if (await mutate(async () => {
    await contractApi.createObligation(context, contract.id, input, crypto.randomUUID());
  }, 'Nghĩa vụ đã được ghi nhận ở trạng thái OPEN.')) {
    await loadObligations(contract.id, false).catch(() => undefined);
  }
}

async function fulfillObligation(
  obligationId: string, input: FulfillObligationRequest
): Promise<void> {
  const context = auth.apiContext;
  const contract = selected.value;
  if (!context || !contract) return;
  if (await mutate(async () => {
    await contractApi.fulfillObligation(context, obligationId, input, crypto.randomUUID());
  }, 'Quyết định nghĩa vụ đã được ghi cùng lý do và evidence.')) {
    await loadObligations(contract.id, false).catch(() => undefined);
  }
}

async function submitBudget(input: CreateBudgetVersionRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await contractApi.createBudgetVersion(context, projectId, input, crypto.randomUUID());
  }, 'Budget version mới đã được trình (SUBMITTED).')) {
    await loadCostSummary().catch(() => undefined);
  }
}

async function createCommitment(input: CreateCommitmentRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    await contractApi.createCommitment(context, projectId, input, crypto.randomUUID());
  }, 'Commitment đã được ghi nhận theo đúng loại tiền của hợp đồng.')) {
    await loadCostSummary().catch(() => undefined);
  }
}

async function createPayment(contractId: string, input: CreatePaymentRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (await mutate(async () => {
    lastPayment.value = (await contractApi.createPayment(
      context, contractId, input, crypto.randomUUID()
    )).data;
  }, 'Payment request đã được tạo ở trạng thái DRAFT cùng breakdown thành phần.')) {
    await loadCostSummary().catch(() => undefined);
  }
}

async function reloadPayment(paymentId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  try {
    lastPayment.value = (await contractApi.getPayment(context, paymentId)).data;
  } catch (caught) {
    error.value = message(caught, 'Không thể tải payment.');
  } finally {
    busy.value = false;
  }
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-053…066 · CONTRACT &amp; COST</p>
        <h1>{{ project?.name ?? 'Contract & Cost' }}</h1>
        <p class="lead">Register hợp đồng, nghĩa vụ theo dõi DUE/OVERDUE và chi phí nhóm theo từng loại tiền.</p>
      </div>
      <div class="page-heading__actions">
        <el-button v-if="auth.can('project.read')" @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button>
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Project: {{ projectId }}</span>
      <span>Tiền tệ giữ nguyên dạng chuỗi, không quy đổi</span>
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
      <p>Đang tải authorized contract register…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem contract register</h2>
      <p>Không hiển thị số hợp đồng, giá trị hay bộ lọc nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải contract register</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <form class="contract-toolbar" @submit.prevent="applyFilters">
        <label>Loại hợp đồng<select v-model="filters.type" aria-label="Loại hợp đồng"><option value="">Tất cả</option><option v-for="item in CONTRACT_TYPES" :key="item" :value="item">{{ CONTRACT_TYPE_LABEL[item] }}</option></select></label>
        <label>Trạng thái<select v-model="filters.status" aria-label="Trạng thái hợp đồng"><option value="">Tất cả</option><option v-for="item in CONTRACT_STATUSES" :key="item" :value="item">{{ CONTRACT_STATUS_LABEL[item] }}</option></select></label>
        <el-button native-type="submit">Áp dụng</el-button>
        <el-button v-if="canCreate" type="primary" native-type="button" @click="showCreate = true">Tạo hợp đồng</el-button>
      </form>

      <ContractCreateForm
        v-if="showCreate"
        :busy="busy"
        @close="showCreate = false"
        @create="createContract"
      />

      <ContractRegisterTable
        :rows="rows"
        :next-cursor="registerCursor"
        :loading-more="loadingMore"
        :selected-id="selected?.id ?? null"
        :party-counts="partyCounts"
        @open="openContract"
        @more="loadRegister(true)"
      />

      <template v-if="selected">
        <ContractDetailPanel
          :key="`${selected.id}:${selected.versionNo}`"
          :contract="selected"
          :parties="parties"
          :appendices="appendices"
          :companies="companies"
          :legal-entities="legalEntities"
          :busy="busy"
          :permissions="detailPermissions"
          @close="closeDetail"
          @update="updateContract"
          @add-party="addParty"
          @add-appendix="addAppendix"
        />
        <ObligationPanel
          v-if="allowed('obligation.read')"
          :obligations="obligations"
          :parties="parties"
          :appendices="appendices"
          :next-cursor="obligationCursor"
          :busy="busy"
          :current-user-id="auth.user?.id ?? null"
          :permissions="obligationPermissions"
          @more="loadObligations(selected.id, true)"
          @create="createObligation"
          @fulfill="fulfillObligation"
        />
      </template>

      <CostSummaryPanel
        v-if="canReadCost"
        :summary="costSummary"
        :contracts="rows"
        :companies="companies"
        :legal-entities="legalEntities"
        :busy="busy"
        :permissions="costPermissions"
        :last-payment="lastPayment"
        @submit-budget="submitBudget"
        @create-commitment="createCommitment"
        @create-payment="createPayment"
        @reload-payment="reloadPayment"
      />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> Màn hình chỉ quản lý hợp đồng và chi phí dự án; không
        tạo bất kỳ lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
