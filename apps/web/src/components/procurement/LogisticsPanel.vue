<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { MONEY_PATTERN, formatMoney } from '@/constants/contracts';
import {
  BUSINESS_NUMBER_PATTERN, GOODS_RECEIPT_CONDITION_LABEL, GOODS_RECEIPT_CONDITIONS,
  GOODS_RECEIPT_STATUS_LABEL, INVENTORY_TRANSACTION_LABEL, SERIAL_PATTERN,
  SHIPMENT_MILESTONE_LABEL, SHIPMENT_MILESTONE_SEQUENCE, SHIPMENT_MILESTONE_SOURCE_LABEL,
  SHIPMENT_MILESTONE_SOURCES, SHIPMENT_MILESTONE_TYPES, SHIPMENT_STATUS_LABEL, remainingQuantity
} from '@/constants/procurement';
import type {
  CreateGoodsReceiptRequest, CreateShipmentMilestoneRequest, CreateShipmentRequest,
  GoodsReceiptCondition, GoodsReceiptWithLedgerView, PurchaseOrderLineView,
  PurchaseOrderWithLinesView, SerialInput, ShipmentMilestoneType, ShipmentMilestoneView,
  ShipmentView
} from '@/types/procurement.types';
import type { Site } from '@/types/project.types';

interface SerialDraft { serialNo: string; equipmentModelId: string }

const props = defineProps<{
  purchaseOrders: PurchaseOrderWithLinesView[];
  shipments: ShipmentView[];
  milestones: ShipmentMilestoneView[];
  receipts: GoodsReceiptWithLedgerView[];
  sites: Site[];
  busy: boolean;
  permissions: { createShipment: boolean; updateMilestone: boolean; createReceipt: boolean };
}>();
const emit = defineEmits<{
  'create-shipment': [purchaseOrderId: string, input: CreateShipmentRequest];
  'create-milestone': [shipmentId: string, input: CreateShipmentMilestoneRequest];
  'create-receipt': [purchaseOrderId: string, input: CreateGoodsReceiptRequest];
}>();

const error = ref('');
const serials = ref<SerialDraft[]>([]);
const shipmentForm = reactive({
  purchaseOrderId: '', committedDate: '', etd: '', eta: '', carrier: '', trackingNo: ''
});
const milestoneForm = reactive({
  shipmentId: '', milestoneType: 'BOOKED' as ShipmentMilestoneType, eventTime: '',
  source: 'MANUAL' as CreateShipmentMilestoneRequest['source'], notes: '', eta: ''
});
const receiptForm = reactive({
  purchaseOrderId: '', purchaseOrderLineId: '', shipmentId: '', siteId: '', receiptNo: '',
  quantity: '', condition: 'GOOD' as GoodsReceiptCondition, notes: ''
});

const orderById = computed(() => new Map(props.purchaseOrders.map((item) => [item.id, item])));

const receiptLines = computed<PurchaseOrderLineView[]>(
  () => orderById.value.get(receiptForm.purchaseOrderId)?.lines ?? []
);

const shipmentsOfReceiptOrder = computed(
  () => props.shipments.filter((item) => item.purchaseOrderId === receiptForm.purchaseOrderId)
);

/**
 * FR-070: dòng milestone của một shipment là bất biến và có thứ hạng. Timeline dựng theo đúng
 * chuỗi BOOKED → DEPARTED → ARRIVED → CUSTOMS_CLEARED → DELIVERED; EXCEPTION nằm ngoài trục vì
 * hãng vận chuyển có quyền báo bất cứ lúc nào — nó không có chỗ trong hành trình.
 */
function timelineOf(shipmentId: string): Array<{
  milestoneType: ShipmentMilestoneType;
  reached: boolean;
  recorded: ShipmentMilestoneView | null;
}> {
  const stream = props.milestones.filter((item) => item.shipmentId === shipmentId);
  return SHIPMENT_MILESTONE_SEQUENCE.map((milestoneType) => {
    const recorded = stream.find((item) => item.milestoneType === milestoneType) ?? null;
    return { milestoneType, reached: recorded !== null, recorded };
  });
}

function exceptionsOf(shipmentId: string): ShipmentMilestoneView[] {
  return props.milestones.filter(
    (item) => item.shipmentId === shipmentId && item.milestoneType === 'EXCEPTION'
  );
}

/**
 * Số lượng còn lại của một dòng PO = đã đặt − mọi phiếu nhận không bị từ chối (kể cả hàng đang
 * cách ly: nó đã về đến nơi thật). Server từ chối nhận vượt bằng 422 OVER_RECEIPT; con số này chỉ
 * để người dùng thấy giới hạn TRƯỚC khi gửi, và chỉ tính được từ những phiếu đã thấy trong phiên.
 */
function remainingOf(line: PurchaseOrderLineView): string | null {
  const received = props.receipts
    .filter((item) => item.purchaseOrderLineId === line.id && item.status !== 'REJECTED')
    .map((item) => item.quantity);
  return remainingQuantity(line.quantity, received);
}

const selectedLine = computed(
  () => receiptLines.value.find((line) => line.id === receiptForm.purchaseOrderLineId) ?? null
);

const selectedRemaining = computed(
  () => selectedLine.value === null ? null : remainingOf(selectedLine.value)
);

function addSerial(): void {
  serials.value = [...serials.value, { serialNo: '', equipmentModelId: '' }];
}

function removeSerial(index: number): void {
  serials.value = serials.value.filter((_, itemIndex) => itemIndex !== index);
}

function submitShipment(): void {
  error.value = '';
  if (!shipmentForm.purchaseOrderId) {
    error.value = 'Chọn purchase order cho lô hàng.';
    return;
  }
  if (!shipmentForm.committedDate) {
    error.value = 'Lô hàng cần ngày cam kết giao — giá trị này bị đóng băng ngay khi ghi.';
    return;
  }
  emit('create-shipment', shipmentForm.purchaseOrderId, {
    committedDate: shipmentForm.committedDate,
    ...(shipmentForm.etd ? { etd: shipmentForm.etd } : {}),
    ...(shipmentForm.eta ? { eta: shipmentForm.eta } : {}),
    ...(shipmentForm.carrier.trim() ? { carrier: shipmentForm.carrier.trim() } : {}),
    ...(shipmentForm.trackingNo.trim() ? { trackingNo: shipmentForm.trackingNo.trim() } : {})
  });
}

function submitMilestone(): void {
  error.value = '';
  if (!milestoneForm.shipmentId) {
    error.value = 'Chọn lô hàng để ghi milestone.';
    return;
  }
  if (!milestoneForm.eventTime) {
    error.value = 'Milestone cần thời điểm sự kiện.';
    return;
  }
  emit('create-milestone', milestoneForm.shipmentId, {
    milestoneType: milestoneForm.milestoneType,
    eventTime: new Date(milestoneForm.eventTime).toISOString(),
    source: milestoneForm.source,
    ...(milestoneForm.notes.trim() ? { notes: milestoneForm.notes.trim() } : {}),
    ...(milestoneForm.eta ? { eta: milestoneForm.eta } : {})
  });
}

function buildSerials(): SerialInput[] | null {
  const built: SerialInput[] = [];
  for (const draft of serials.value) {
    if (!SERIAL_PATTERN.test(draft.serialNo)) {
      error.value = 'Serial chỉ nhận ký tự ASCII in được, tối đa 120 ký tự.';
      return null;
    }
    if (!draft.equipmentModelId.trim()) {
      error.value = 'Mỗi serial cần model thiết bị tương ứng.';
      return null;
    }
    built.push({
      serialNo: draft.serialNo, equipmentModelId: draft.equipmentModelId.trim()
    });
  }
  return built;
}

function submitReceipt(): void {
  error.value = '';
  if (!receiptForm.purchaseOrderId || !receiptForm.purchaseOrderLineId) {
    error.value = 'Chọn purchase order và dòng hàng được nhận.';
    return;
  }
  if (!receiptForm.siteId) {
    error.value = 'Chọn site nhận hàng thuộc dự án của PO.';
    return;
  }
  if (!BUSINESS_NUMBER_PATTERN.test(receiptForm.receiptNo)) {
    error.value = 'Số phiếu nhận phải viết hoa, 2–80 ký tự (chữ, số, . _ / -).';
    return;
  }
  if (!MONEY_PATTERN.test(receiptForm.quantity)) {
    error.value = 'Số lượng nhận phải là số thập phân dương, tối đa 4 chữ số lẻ.';
    return;
  }
  const built = buildSerials();
  if (built === null) return;
  emit('create-receipt', receiptForm.purchaseOrderId, {
    purchaseOrderLineId: receiptForm.purchaseOrderLineId, siteId: receiptForm.siteId,
    receiptNo: receiptForm.receiptNo.trim(), quantity: receiptForm.quantity.trim(),
    condition: receiptForm.condition,
    ...(receiptForm.shipmentId ? { shipmentId: receiptForm.shipmentId } : {}),
    ...(receiptForm.notes.trim() ? { notes: receiptForm.notes.trim() } : {}),
    ...(built.length ? { serials: built } : {})
  });
}
</script>

<template>
  <section class="procurement-panel logistics-panel" aria-labelledby="logistics-panel-title">
    <div class="detail-heading">
      <div>
        <small>LOGISTICS · API-083…085 · DB-051…DB-054</small>
        <h2 id="logistics-panel-title">Lô hàng, milestone và nhận hàng</h2>
        <p class="lead">
          Trạng thái lô hàng được suy ra từ dòng milestone bất biến và chỉ tiến, không lùi. Báo sai
          trình tự bị từ chối chứ không được sắp xếp lại ngầm.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <div v-if="!shipments.length" class="empty-panel">
      <h3>Chưa có lô hàng nào</h3>
      <p>Tạo lô hàng cho một purchase order đang mở để bắt đầu theo dõi hành trình.</p>
    </div>
    <article v-for="shipment in shipments" :key="shipment.id" class="shipment-card">
      <header>
        <div>
          <strong>{{ orderById.get(shipment.purchaseOrderId)?.poNo ?? shipment.purchaseOrderId }}</strong>
          <span>{{ shipment.carrier ?? 'Chưa khai hãng vận chuyển' }} · {{ shipment.trackingNo ?? 'không có mã theo dõi' }}</span>
        </div>
        <span class="status-pill" :data-status="shipment.status">{{ SHIPMENT_STATUS_LABEL[shipment.status] }}</span>
      </header>
      <dl class="shipment-card__dates">
        <div><dt>Cam kết (đóng băng)</dt><dd>{{ shipment.committedDate }}</dd></div>
        <div><dt>ETD</dt><dd>{{ shipment.etd ?? '—' }}</dd></div>
        <div><dt>ETA</dt><dd>{{ shipment.eta ?? '—' }}</dd></div>
        <div><dt>Giao thực tế</dt><dd>{{ shipment.actualDeliveryDate ?? '—' }}</dd></div>
      </dl>
      <ol class="milestone-timeline">
        <li
          v-for="step in timelineOf(shipment.id)"
          :key="step.milestoneType"
          :data-reached="step.reached"
        >
          <strong>{{ SHIPMENT_MILESTONE_LABEL[step.milestoneType] }}</strong>
          <span>{{ step.recorded ? step.recorded.eventTime : 'chưa ghi nhận' }}</span>
          <small v-if="step.recorded">{{ SHIPMENT_MILESTONE_SOURCE_LABEL[step.recorded.source] }}</small>
        </li>
      </ol>
      <ul v-if="exceptionsOf(shipment.id).length" class="milestone-exceptions">
        <li v-for="item in exceptionsOf(shipment.id)" :key="item.id">
          <strong>{{ SHIPMENT_MILESTONE_LABEL.EXCEPTION }}</strong>
          {{ item.eventTime }} · {{ SHIPMENT_MILESTONE_SOURCE_LABEL[item.source] }}
          <span>{{ item.notes ?? 'không có ghi chú' }}</span>
        </li>
      </ul>
    </article>

    <form v-if="permissions.createShipment" class="procurement-form shipment-form" @submit.prevent="submitShipment">
      <h3 class="form-wide">Tạo lô hàng (API-083)</h3>
      <label>Purchase order<select v-model="shipmentForm.purchaseOrderId" required aria-label="Purchase order của lô hàng"><option disabled value="">Chọn PO</option><option v-for="item in purchaseOrders" :key="item.id" :value="item.id">{{ item.poNo }} rev {{ item.revision }}</option></select></label>
      <label>Ngày cam kết<input v-model="shipmentForm.committedDate" type="date" required /></label>
      <label>ETD<input v-model="shipmentForm.etd" type="date" /></label>
      <label>ETA<input v-model="shipmentForm.eta" type="date" /></label>
      <label>Hãng vận chuyển<input v-model.trim="shipmentForm.carrier" maxlength="200" /></label>
      <label>Mã theo dõi<input v-model.trim="shipmentForm.trackingNo" maxlength="200" /></label>
      <el-button native-type="submit" type="primary" :loading="busy">Lưu lô hàng</el-button>
    </form>

    <form v-if="permissions.updateMilestone" class="procurement-form milestone-form" @submit.prevent="submitMilestone">
      <h3 class="form-wide">Ghi milestone (API-084)</h3>
      <label>Lô hàng<select v-model="milestoneForm.shipmentId" required aria-label="Lô hàng ghi milestone"><option disabled value="">Chọn lô hàng</option><option v-for="item in shipments" :key="item.id" :value="item.id">{{ orderById.get(item.purchaseOrderId)?.poNo ?? item.purchaseOrderId }} · {{ item.committedDate }}</option></select></label>
      <label>Loại milestone<select v-model="milestoneForm.milestoneType" aria-label="Loại milestone"><option v-for="item in SHIPMENT_MILESTONE_TYPES" :key="item" :value="item">{{ SHIPMENT_MILESTONE_LABEL[item] }}</option></select></label>
      <label>Thời điểm sự kiện<input v-model="milestoneForm.eventTime" type="datetime-local" required /></label>
      <label>Nguồn<select v-model="milestoneForm.source" aria-label="Nguồn milestone"><option v-for="item in SHIPMENT_MILESTONE_SOURCES" :key="item" :value="item">{{ SHIPMENT_MILESTONE_SOURCE_LABEL[item] }}</option></select></label>
      <label>ETA điều chỉnh<input v-model="milestoneForm.eta" type="date" /></label>
      <label class="form-wide">Ghi chú<textarea v-model="milestoneForm.notes" rows="2" maxlength="2000"></textarea></label>
      <el-button native-type="submit" type="primary" :loading="busy">Ghi milestone</el-button>
    </form>

    <div v-if="receipts.length" class="table-shell">
      <table class="data-table procurement-table receipt-table">
        <thead>
          <tr><th>Số phiếu</th><th>Số lượng</th><th>Tình trạng hàng</th><th>Trạng thái phiếu</th><th>Serial</th><th>Bút toán kho</th></tr>
        </thead>
        <tbody>
          <tr v-for="receipt in receipts" :key="receipt.id">
            <td><strong>{{ receipt.receiptNo }}</strong></td>
            <td><span class="money">{{ formatMoney(receipt.quantity) }}</span></td>
            <td>{{ GOODS_RECEIPT_CONDITION_LABEL[receipt.condition] }}</td>
            <td><span class="status-pill" :data-status="receipt.status">{{ GOODS_RECEIPT_STATUS_LABEL[receipt.status] }}</span></td>
            <td>{{ receipt.serials.map((item) => item.serialNo).join(', ') || 'không bắt serial' }}</td>
            <td>{{ receipt.inventoryTransactions.map((item) => INVENTORY_TRANSACTION_LABEL[item.transactionType]).join(' + ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="permissions.createReceipt" class="procurement-form receipt-form" @submit.prevent="submitReceipt">
      <h3 class="form-wide">Nhận hàng và bắt serial (API-085)</h3>
      <label>Purchase order<select v-model="receiptForm.purchaseOrderId" required aria-label="Purchase order nhận hàng"><option disabled value="">Chọn PO</option><option v-for="item in purchaseOrders" :key="item.id" :value="item.id">{{ item.poNo }} rev {{ item.revision }}</option></select></label>
      <label>Dòng hàng<select v-model="receiptForm.purchaseOrderLineId" required aria-label="Dòng PO nhận hàng"><option disabled value="">Chọn dòng</option><option v-for="line in receiptLines" :key="line.id" :value="line.id">#{{ line.lineNo }} {{ line.description }} · còn lại {{ remainingOf(line) ?? '?' }} {{ line.uom }}</option></select></label>
      <label>Lô hàng<select v-model="receiptForm.shipmentId" aria-label="Lô hàng của phiếu nhận"><option value="">Không gắn lô hàng</option><option v-for="item in shipmentsOfReceiptOrder" :key="item.id" :value="item.id">{{ item.committedDate }} · {{ SHIPMENT_STATUS_LABEL[item.status] }}</option></select></label>
      <label>Site nhận<select v-model="receiptForm.siteId" required aria-label="Site nhận hàng"><option disabled value="">Chọn site</option><option v-for="item in sites" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <label>Số phiếu nhận<input v-model.trim="receiptForm.receiptNo" required maxlength="80" placeholder="GRN-2026-001" /></label>
      <label>Số lượng<input v-model.trim="receiptForm.quantity" required inputmode="decimal" /></label>
      <label>Tình trạng hàng<select v-model="receiptForm.condition" aria-label="Tình trạng hàng nhận"><option v-for="item in GOODS_RECEIPT_CONDITIONS" :key="item" :value="item">{{ GOODS_RECEIPT_CONDITION_LABEL[item] }}</option></select></label>
      <label class="form-wide">Ghi chú<textarea v-model="receiptForm.notes" rows="2" maxlength="2000"></textarea></label>

      <p v-if="selectedLine" class="receipt-remaining form-wide">
        Dòng #{{ selectedLine.lineNo }} đã đặt
        <span class="money">{{ formatMoney(selectedLine.quantity) }} {{ selectedLine.uom }}</span>
        · còn lại tối đa
        <span class="money">{{ selectedRemaining ?? 'chưa xác định' }} {{ selectedLine.uom }}</span>.
        Nhận vượt sẽ bị server từ chối toàn bộ giao dịch (OVER_RECEIPT).
      </p>

      <div class="serial-editor form-wide">
        <div class="section-heading">
          <div>
            <h4>Serial thiết bị</h4>
            <p>Serial trùng trong cùng model bị từ chối (SERIAL_CONFLICT); chuẩn hóa do database quyết.</p>
          </div>
          <el-button native-type="button" @click="addSerial">Thêm serial</el-button>
        </div>
        <div v-for="(draft, index) in serials" :key="index" class="serial-editor__row">
          <label>Serial<input v-model="draft.serialNo" maxlength="120" :aria-label="`Serial ${index + 1}`" /></label>
          <label>Model thiết bị<input v-model.trim="draft.equipmentModelId" placeholder="UUID equipment model" /></label>
          <el-button text type="danger" native-type="button" @click="removeSerial(index)">Xóa</el-button>
        </div>
      </div>

      <div class="form-actions form-wide">
        <el-button native-type="submit" type="primary" :loading="busy">Ghi phiếu nhận</el-button>
      </div>
    </form>
  </section>
</template>
