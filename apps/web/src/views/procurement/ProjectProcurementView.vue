<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { procurementApi } from '@/api/procurement.api';
import { projectApi } from '@/api/project.api';
import BidEvaluationPanel from '@/components/procurement/BidEvaluationPanel.vue';
import LogisticsPanel from '@/components/procurement/LogisticsPanel.vue';
import PurchaseOrderPanel from '@/components/procurement/PurchaseOrderPanel.vue';
import SourcingPanel from '@/components/procurement/SourcingPanel.vue';
import SupplierRegisterTable from '@/components/procurement/SupplierRegisterTable.vue';
import {
  SUPPLIER_QUALIFICATION_LABEL, SUPPLIER_QUALIFICATION_STATUSES
} from '@/constants/procurement';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  CreateEvaluationRequest, CreateGoodsReceiptRequest, CreatePurchaseOrderRequest,
  CreateRequisitionRequest, CreateRfqRequest, CreateShipmentMilestoneRequest, CreateShipmentRequest,
  EvaluationView, GoodsReceiptWithLedgerView, PurchaseOrderWithLinesView, RequisitionView, RfqView,
  SealedBidView, ShipmentMilestoneView, ShipmentView, SupplierListQuery,
  SupplierQualificationStatus, SupplierView
} from '@/types/procurement.types';
import type { Project } from '@/types/project.types';

type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const project = ref<Project | null>(null);
const suppliers = ref<SupplierView[]>([]);
const supplierCursor = ref<string | null>(null);
const requisitions = ref<RequisitionView[]>([]);
const rfqs = ref<RfqView[]>([]);
const bids = ref<SealedBidView[]>([]);
const evaluations = ref<EvaluationView[]>([]);
const purchaseOrders = ref<PurchaseOrderWithLinesView[]>([]);
const shipments = ref<ShipmentView[]>([]);
const milestones = ref<ShipmentMilestoneView[]>([]);
const receipts = ref<GoodsReceiptWithLedgerView[]>([]);

const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const filters = reactive({ category: '', qualificationStatus: '' });

const portfolioId = computed(() => project.value?.portfolioId);

/** Ngày đánh giá hiệu lực sơ tuyển; API-078 so cùng ý nghĩa với CURRENT_DATE của server. */
const asOf = computed(() => new Date().toISOString().slice(0, 10));

/**
 * Mua sắm không có granularity theo gói thầu ở phía đọc (API-076 là register cấp tenant), nên cổng
 * UI đi qua hasFullProjectPermission. Server luôn re-authorize từng command và trả 404 cho những
 * gì ngoài scope.
 */
function allowed(permission: string): boolean {
  return auth.hasFullProjectPermission(permission, projectId, portfolioId.value);
}

const sourcingPermissions = computed(() => ({
  createRequisition: allowed('requisition.create'),
  issueRfq: allowed('rfq.issue')
}));
const evaluationPermissions = computed(() => ({
  evaluate: allowed('bid.evaluate'),
  submitAward: allowed('award.submit')
}));
const purchaseOrderPermissions = computed(() => ({ issue: allowed('purchaseOrder.issue') }));
const logisticsPermissions = computed(() => ({
  createShipment: allowed('shipment.create'),
  updateMilestone: allowed('shipment.updateMilestone'),
  createReceipt: allowed('goodsReceipt.create')
}));

function supplierQuery(cursor?: string): SupplierListQuery {
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.qualificationStatus
      ? { qualificationStatus: filters.qualificationStatus as SupplierQualificationStatus }
      : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

async function loadSuppliers(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await procurementApi.listSuppliers(
      context, supplierQuery(append ? supplierCursor.value ?? undefined : undefined)
    );
    suppliers.value = append ? [...suppliers.value, ...response.data] : response.data;
    supplierCursor.value = response.meta.nextCursor;
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
    // Project master chỉ phụ trợ (site cho phiếu nhận); thiếu quyền thì form vẫn render rỗng.
    if (auth.can('project.read')) {
      const detail = await projectApi.getProject(context, projectId).catch(() => null);
      if (detail) project.value = detail.data;
    }
    await loadSuppliers(false);
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải Procurement & Logistics.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  error.value = '';
  try { await loadSuppliers(false); }
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

/** Thay thế theo id nếu đã có, ngược lại nối thêm — mọi command đều trả về bản ghi mới nhất. */
function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  return list.some((item) => item.id === row.id)
    ? list.map((item) => (item.id === row.id ? row : item))
    : [...list, row];
}

async function createRequisition(input: CreateRequisitionRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createRequisition(
      context, projectId, input, crypto.randomUUID()
    );
    requisitions.value = upsert(requisitions.value, created.data);
  }, 'Requisition đã được ghi nhận ở trạng thái Nháp cùng audit/outbox.');
}

async function createRfq(requisitionId: string, input: CreateRfqRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createRfq(
      context, requisitionId, input, crypto.randomUUID()
    );
    rfqs.value = upsert(rfqs.value, created.data);
  }, 'RFQ đã được phát hành tới các nhà cung cấp đủ điều kiện.');
}

async function createEvaluation(bidId: string, input: CreateEvaluationRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createEvaluation(
      context, bidId, input, crypto.randomUUID()
    );
    const { bid, ...evaluation } = created.data;
    evaluations.value = upsert(evaluations.value, evaluation);
    bids.value = upsert(bids.value, bid);
  }, 'Đánh giá đã được ghi nhận với phiên bản do server cấp.');
}

async function submitAward(rfqId: string, input: { awardedBidId: string; reason?: string }): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const updated = await procurementApi.submitAward(context, rfqId, input, crypto.randomUUID());
    rfqs.value = upsert(rfqs.value, updated.data);
  }, 'Kết quả trao thầu đã được trình.');
}

async function createPurchaseOrder(input: CreatePurchaseOrderRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createPurchaseOrder(
      context, projectId, input, crypto.randomUUID()
    );
    purchaseOrders.value = upsert(purchaseOrders.value, created.data);
  }, 'Purchase order, các dòng hàng và commitment đã được ghi trong cùng một giao dịch.');
}

async function createShipment(
  purchaseOrderId: string, input: CreateShipmentRequest
): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createShipment(
      context, purchaseOrderId, input, crypto.randomUUID()
    );
    shipments.value = upsert(shipments.value, created.data);
  }, 'Lô hàng đã được lên kế hoạch; ngày cam kết đã bị đóng băng.');
}

async function createMilestone(
  shipmentId: string, input: CreateShipmentMilestoneRequest
): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createShipmentMilestone(
      context, shipmentId, input, crypto.randomUUID()
    );
    const { shipment, ...milestone } = created.data;
    milestones.value = upsert(milestones.value, milestone);
    shipments.value = upsert(shipments.value, shipment);
  }, 'Milestone đã được ghi và trạng thái lô hàng được suy ra lại.');
}

async function createReceipt(
  purchaseOrderId: string, input: CreateGoodsReceiptRequest
): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  await mutate(async () => {
    const created = await procurementApi.createGoodsReceipt(
      context, purchaseOrderId, input, crypto.randomUUID()
    );
    receipts.value = upsert(receipts.value, created.data);
  }, 'Phiếu nhận, bút toán kho và serial đã được ghi trong cùng một giao dịch.');
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">API-076…085 · PROCUREMENT &amp; LOGISTICS</p>
        <h1>{{ project?.name ?? 'Procurement & Logistics' }}</h1>
        <p class="lead">
          Sổ nhà cung cấp, requisition, RFQ niêm phong, đơn đặt hàng và hành trình lô hàng tới khi
          nhận hàng.
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
      <span>Số lượng và tiền giữ nguyên dạng chuỗi, không quy đổi</span>
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
      <p>Đang tải sổ nhà cung cấp trong scope được phép…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem dữ liệu mua sắm</h2>
      <p>Không hiển thị nhà cung cấp, giá dự thầu hay đơn đặt hàng nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải dữ liệu mua sắm</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <p class="procurement-scope-note">
        Trong danh mục API-076…085 chỉ có một thao tác đọc là sổ nhà cung cấp. Requisition, RFQ, PO,
        lô hàng và phiếu nhận xuất hiện ở đây từ phản hồi của chính các lệnh bạn vừa gửi trong phiên
        làm việc này — không có endpoint liệt kê nào để tải lại chúng.
      </p>

      <form class="procurement-toolbar" @submit.prevent="applyFilters">
        <label>Nhóm hàng<input v-model.trim="filters.category" maxlength="80" placeholder="VD: PV_MODULE" /></label>
        <label>Tình trạng sơ tuyển<select v-model="filters.qualificationStatus" aria-label="Tình trạng sơ tuyển"><option value="">Tất cả</option><option v-for="item in SUPPLIER_QUALIFICATION_STATUSES" :key="item" :value="item">{{ SUPPLIER_QUALIFICATION_LABEL[item] }}</option></select></label>
        <el-button native-type="submit">Áp dụng</el-button>
      </form>

      <SupplierRegisterTable
        :suppliers="suppliers"
        :next-cursor="supplierCursor"
        :loading-more="loadingMore"
        :as-of="asOf"
        @more="loadSuppliers(true)"
      />

      <SourcingPanel
        :requisitions="requisitions"
        :rfqs="rfqs"
        :suppliers="suppliers"
        :busy="busy"
        :as-of="asOf"
        :permissions="sourcingPermissions"
        @create-requisition="createRequisition"
        @create-rfq="createRfq"
      />

      <BidEvaluationPanel
        :rfqs="rfqs"
        :bids="bids"
        :evaluations="evaluations"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :permissions="evaluationPermissions"
        @create-evaluation="createEvaluation"
        @submit-award="submitAward"
      />

      <PurchaseOrderPanel
        :purchase-orders="purchaseOrders"
        :suppliers="suppliers"
        :rfqs="rfqs"
        :busy="busy"
        :current-user-id="auth.user?.id ?? null"
        :permissions="purchaseOrderPermissions"
        @create="createPurchaseOrder"
      />

      <LogisticsPanel
        :purchase-orders="purchaseOrders"
        :shipments="shipments"
        :milestones="milestones"
        :receipts="receipts"
        :sites="project?.sites ?? []"
        :busy="busy"
        :permissions="logisticsPermissions"
        @create-shipment="createShipment"
        @create-milestone="createMilestone"
        @create-receipt="createReceipt"
      />

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> Màn hình chỉ quản lý mua sắm và logistics của dự án;
        không tạo bất kỳ lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
