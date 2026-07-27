<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { CURRENCY_PATTERN, MONEY_PATTERN, formatMoney } from '@/constants/contracts';
import {
  BUSINESS_NUMBER_PATTERN, PURCHASE_ORDER_STATUS_LABEL, lineExtension, purchaseOrderLineTotal
} from '@/constants/procurement';
import type {
  CreatePurchaseOrderRequest, PurchaseOrderLineInput, PurchaseOrderWithLinesView, RfqView,
  SupplierView
} from '@/types/procurement.types';

interface LineDraft {
  lineNo: string;
  description: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  requisitionId: string;
}

const props = defineProps<{
  purchaseOrders: PurchaseOrderWithLinesView[];
  suppliers: SupplierView[];
  rfqs: RfqView[];
  busy: boolean;
  currentUserId: string | null;
  permissions: { issue: boolean };
}>();
const emit = defineEmits<{ create: [input: CreatePurchaseOrderRequest] }>();

const error = ref('');
const lines = ref<LineDraft[]>([]);
const form = reactive({
  poNo: '', revision: '1', title: '', supplierProfileId: '', awardedRfqId: '',
  totalValue: '', currency: 'VND', approvedBy: '', costCodeId: ''
});

/**
 * Tổng tham khảo = SUM(quantity * unitPrice) tính chính xác bằng BigInt, đúng biểu thức mà trigger
 * `ck_purchase_order_line_sum` đánh giá. Đây là gợi ý để người dùng thấy sai lệch trước khi gửi;
 * ràng buộc thật vẫn do Postgres quyết và trả về 422 PO_LINE_SUM_MISMATCH.
 */
const referenceSum = computed(() => purchaseOrderLineTotal(
  lines.value.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice }))
));

/** Chỉ so khi cả hai vế đều là số hợp lệ; khác biệt chỉ ở số 0 đuôi không phải là sai lệch. */
const sumMatches = computed(() => {
  const declared = form.totalValue.trim();
  if (referenceSum.value === null || !MONEY_PATTERN.test(declared)) return null;
  return purchaseOrderLineTotal([{ quantity: declared, unitPrice: '1' }]) === referenceSum.value;
});

/** SoD `ck_purchase_order_sod`: người phát hành không được tự phê duyệt PO của chính mình. */
const sodBlocked = computed(
  () => props.currentUserId !== null && form.approvedBy.trim() === props.currentUserId
);

function addLine(): void {
  lines.value = [...lines.value, {
    lineNo: String(lines.value.length + 1), description: '', quantity: '', uom: 'EA',
    unitPrice: '', requisitionId: ''
  }];
}

function removeLine(index: number): void {
  lines.value = lines.value.filter((_, itemIndex) => itemIndex !== index);
}

function buildLines(): PurchaseOrderLineInput[] | null {
  const built: PurchaseOrderLineInput[] = [];
  for (const draft of lines.value) {
    const lineNo = Number.parseInt(draft.lineNo, 10);
    if (!Number.isInteger(lineNo) || lineNo < 1) {
      error.value = 'Số dòng PO phải là số nguyên ≥ 1.';
      return null;
    }
    if (!draft.description.trim()) {
      error.value = 'Mỗi dòng PO cần mô tả hàng hóa.';
      return null;
    }
    if (!MONEY_PATTERN.test(draft.quantity) || !MONEY_PATTERN.test(draft.unitPrice)) {
      error.value = 'Số lượng và đơn giá phải là số thập phân dương, tối đa 4 chữ số lẻ.';
      return null;
    }
    if (!draft.uom.trim()) {
      error.value = 'Mỗi dòng PO cần đơn vị tính.';
      return null;
    }
    built.push({
      lineNo, description: draft.description.trim(), quantity: draft.quantity.trim(),
      uom: draft.uom.trim(), unitPrice: draft.unitPrice.trim(),
      ...(draft.requisitionId.trim() ? { requisitionId: draft.requisitionId.trim() } : {})
    });
  }
  return built;
}

function submit(): void {
  error.value = '';
  if (!BUSINESS_NUMBER_PATTERN.test(form.poNo)) {
    error.value = 'Số PO phải viết hoa, 2–80 ký tự (chữ, số, . _ / -).';
    return;
  }
  const revision = Number.parseInt(form.revision, 10);
  if (!Number.isInteger(revision) || revision < 1) {
    error.value = 'Revision PO phải là số nguyên ≥ 1.';
    return;
  }
  if (form.title.trim().length < 3) {
    error.value = 'Tiêu đề PO phải có ít nhất 3 ký tự.';
    return;
  }
  if (!form.supplierProfileId) {
    error.value = 'Chọn nhà cung cấp cho purchase order.';
    return;
  }
  if (!MONEY_PATTERN.test(form.totalValue)) {
    error.value = 'Tổng giá trị PO phải là số thập phân dương, tối đa 4 chữ số lẻ.';
    return;
  }
  if (!CURRENCY_PATTERN.test(form.currency)) {
    error.value = 'Loại tiền PO phải là mã ISO 3 chữ cái viết hoa.';
    return;
  }
  if (!form.approvedBy.trim() || !form.costCodeId.trim()) {
    error.value = 'PO cần người phê duyệt và cost code ACTIVE.';
    return;
  }
  if (sodBlocked.value) {
    error.value = 'Phân tách nhiệm vụ: người phát hành PO không được tự phê duyệt chính nó.';
    return;
  }
  if (!lines.value.length) {
    error.value = 'PO phải có ít nhất một dòng hàng.';
    return;
  }
  const built = buildLines();
  if (built === null) return;
  emit('create', {
    poNo: form.poNo.trim(), revision, title: form.title.trim(),
    supplierProfileId: form.supplierProfileId, totalValue: form.totalValue.trim(),
    currency: form.currency.trim(), approvedBy: form.approvedBy.trim(),
    costCodeId: form.costCodeId.trim(), lines: built,
    ...(form.awardedRfqId ? { awardedRfqId: form.awardedRfqId } : {})
  });
}
</script>

<template>
  <section class="procurement-panel purchase-order-panel" aria-labelledby="purchase-order-title">
    <div class="detail-heading">
      <div>
        <small>PURCHASE ORDER · API-082 · DB-049/DB-050</small>
        <h2 id="purchase-order-title">Đơn đặt hàng và bảng chi tiết dòng</h2>
        <p class="lead">
          Một giao dịch duy nhất ghi PO, các dòng và commitment. Tổng các dòng phải đúng bằng tổng
          giá trị PO — Postgres là nơi đối chiếu cuối cùng.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <div v-if="purchaseOrders.length" class="table-shell">
      <table class="data-table procurement-table po-table">
        <thead>
          <tr><th>Số PO</th><th>Tiêu đề</th><th>Trạng thái</th><th>Tổng giá trị</th><th>Số dòng</th></tr>
        </thead>
        <tbody>
          <tr v-for="order in purchaseOrders" :key="order.id">
            <td><strong>{{ order.poNo }}</strong><span>rev {{ order.revision }}</span></td>
            <td>{{ order.title }}</td>
            <td><span class="status-pill" :data-status="order.status">{{ PURCHASE_ORDER_STATUS_LABEL[order.status] }}</span></td>
            <td><span class="money">{{ formatMoney(order.totalValue) }} {{ order.currency }}</span></td>
            <td>{{ order.lines.length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="permissions.issue" class="procurement-form po-form" @submit.prevent="submit">
      <h3 class="form-wide">Tạo purchase order (API-082)</h3>
      <label>Số PO<input v-model.trim="form.poNo" required maxlength="80" placeholder="PO-2026-001" /></label>
      <label>Revision<input v-model.trim="form.revision" required inputmode="numeric" /></label>
      <label>Tiêu đề<input v-model.trim="form.title" required maxlength="400" /></label>
      <label>Nhà cung cấp<select v-model="form.supplierProfileId" required aria-label="Nhà cung cấp của PO"><option disabled value="">Chọn nhà cung cấp</option><option v-for="item in suppliers" :key="item.id" :value="item.id">{{ item.companyId }} · {{ item.category }}</option></select></label>
      <label>RFQ trúng thầu<select v-model="form.awardedRfqId" aria-label="RFQ trúng thầu gắn với PO"><option value="">Không gắn RFQ</option><option v-for="item in rfqs" :key="item.id" :value="item.id">{{ item.number }} rev {{ item.revision }}</option></select></label>
      <label>Tổng giá trị<input v-model.trim="form.totalValue" required inputmode="decimal" /></label>
      <label>Loại tiền<input v-model.trim="form.currency" required maxlength="3" /></label>
      <label>Người phê duyệt<input v-model.trim="form.approvedBy" required placeholder="UUID người phê duyệt (khác bạn)" /></label>
      <label>Cost code<input v-model.trim="form.costCodeId" required placeholder="UUID cost code ACTIVE" /></label>

      <p v-if="sodBlocked" class="procurement-blocked form-wide">
        Phân tách nhiệm vụ: người phê duyệt phải khác người phát hành PO.
      </p>

      <div class="po-line-editor form-wide">
        <div class="section-heading">
          <div>
            <h4>Dòng hàng</h4>
            <p>Thành tiền mỗi dòng = số lượng × đơn giá, tính chính xác bằng BigInt trên chuỗi.</p>
          </div>
          <el-button native-type="button" @click="addLine">Thêm dòng</el-button>
        </div>
        <div v-for="(draft, index) in lines" :key="index" class="po-line-editor__row">
          <label>Dòng<input v-model.trim="draft.lineNo" inputmode="numeric" :aria-label="`Số dòng ${index + 1}`" /></label>
          <label>Mô tả<input v-model.trim="draft.description" maxlength="400" /></label>
          <label>Số lượng<input v-model.trim="draft.quantity" inputmode="decimal" /></label>
          <label>ĐVT<input v-model.trim="draft.uom" maxlength="20" /></label>
          <label>Đơn giá<input v-model.trim="draft.unitPrice" inputmode="decimal" /></label>
          <span class="po-line-editor__extension money">
            {{ lineExtension(draft.quantity, draft.unitPrice) ?? 'chưa đủ dữ liệu hợp lệ' }}
          </span>
          <el-button text type="danger" native-type="button" @click="removeLine(index)">Xóa</el-button>
        </div>
        <p v-if="lines.length" class="po-line-editor__sum">
          Tổng các dòng (tham khảo):
          <span class="money">{{ referenceSum ?? 'chưa đủ dữ liệu hợp lệ' }}</span>
          · Tổng giá trị PO khai báo: <span class="money">{{ form.totalValue || '—' }}</span>
          <span v-if="sumMatches === false" class="po-line-editor__mismatch">
            Hai giá trị chưa khớp — server sẽ từ chối với PO_LINE_SUM_MISMATCH.
          </span>
        </p>
      </div>

      <div class="form-actions form-wide">
        <el-button native-type="submit" type="primary" :loading="busy" :disabled="sodBlocked">
          Phát hành PO
        </el-button>
      </div>
    </form>
  </section>
</template>
