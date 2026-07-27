<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  BUSINESS_NUMBER_PATTERN, REQUISITION_STATUS_LABEL, RFQ_STATUS_LABEL,
  SUPPLIER_QUALIFICATION_LABEL, isSupplierInvitable
} from '@/constants/procurement';
import type {
  CreateRequisitionRequest, CreateRfqRequest, RequisitionView, RfqView, SupplierView
} from '@/types/procurement.types';

const props = defineProps<{
  requisitions: RequisitionView[];
  rfqs: RfqView[];
  suppliers: SupplierView[];
  busy: boolean;
  asOf: string;
  permissions: { createRequisition: boolean; issueRfq: boolean };
}>();
const emit = defineEmits<{
  'create-requisition': [input: CreateRequisitionRequest];
  'create-rfq': [requisitionId: string, input: CreateRfqRequest];
}>();

const error = ref('');
const invited = ref<string[]>([]);

const requisitionForm = reactive({
  number: '', title: '', description: '', packageId: '', wbsId: '', costCodeId: '', needByDate: ''
});
const rfqForm = reactive({ requisitionId: '', number: '', revision: '1', dueDate: '' });

/**
 * Bộ chọn nhà thầu được mời CHỈ liệt kê hồ sơ QUALIFIED còn hiệu lực — đúng điều kiện API-078
 * kiểm tra bằng SQL trước khi tạo RFQ. Hiển thị một hồ sơ đã hết hạn rồi để server trả về 422
 * SUPPLIER_INELIGIBLE là bắt người dùng phát hiện luật chơi bằng cách vi phạm nó.
 */
const invitable = computed(
  () => props.suppliers.filter((supplier) => isSupplierInvitable(supplier, props.asOf))
);

const excludedCount = computed(() => props.suppliers.length - invitable.value.length);

const requisitionNumber = computed(
  () => new Map(props.requisitions.map((item) => [item.id, `${item.number} · ${item.title}`]))
);

function toggleInvite(supplierId: string): void {
  invited.value = invited.value.includes(supplierId)
    ? invited.value.filter((id) => id !== supplierId)
    : [...invited.value, supplierId];
}

function submitRequisition(): void {
  error.value = '';
  if (!BUSINESS_NUMBER_PATTERN.test(requisitionForm.number)) {
    error.value = 'Số requisition phải viết hoa, 2–80 ký tự (chữ, số, . _ / -).';
    return;
  }
  if (requisitionForm.title.trim().length < 3) {
    error.value = 'Tiêu đề requisition phải có ít nhất 3 ký tự.';
    return;
  }
  if (!requisitionForm.packageId.trim() || !requisitionForm.costCodeId.trim()) {
    error.value = 'Requisition cần gói thầu ACTIVE và cost code ACTIVE của dự án.';
    return;
  }
  if (!requisitionForm.needByDate) {
    error.value = 'Requisition cần ngày cần hàng (need-by date).';
    return;
  }
  emit('create-requisition', {
    number: requisitionForm.number.trim(), title: requisitionForm.title.trim(),
    packageId: requisitionForm.packageId.trim(), costCodeId: requisitionForm.costCodeId.trim(),
    needByDate: requisitionForm.needByDate,
    ...(requisitionForm.description.trim() ? { description: requisitionForm.description.trim() } : {}),
    ...(requisitionForm.wbsId.trim() ? { wbsId: requisitionForm.wbsId.trim() } : {})
  });
}

function submitRfq(): void {
  error.value = '';
  if (!rfqForm.requisitionId) {
    error.value = 'Chọn requisition để phát hành RFQ.';
    return;
  }
  if (!BUSINESS_NUMBER_PATTERN.test(rfqForm.number)) {
    error.value = 'Số RFQ phải viết hoa, 2–80 ký tự (chữ, số, . _ / -).';
    return;
  }
  const revision = Number.parseInt(rfqForm.revision, 10);
  if (!Number.isInteger(revision) || revision < 1) {
    error.value = 'Revision RFQ phải là số nguyên ≥ 1.';
    return;
  }
  if (!rfqForm.dueDate) {
    error.value = 'RFQ cần thời hạn nộp thầu.';
    return;
  }
  if (!invited.value.length) {
    error.value = 'Phải mời ít nhất một nhà cung cấp đủ điều kiện.';
    return;
  }
  emit('create-rfq', rfqForm.requisitionId, {
    number: rfqForm.number.trim(), revision,
    dueDate: new Date(rfqForm.dueDate).toISOString(),
    invitedSupplierIds: [...invited.value]
  });
}
</script>

<template>
  <section class="procurement-panel sourcing-panel" aria-labelledby="sourcing-panel-title">
    <div class="detail-heading">
      <div>
        <small>SOURCING · API-077 / API-078</small>
        <h2 id="sourcing-panel-title">Requisition và RFQ</h2>
        <p class="lead">
          Requisition sinh ra ở trạng thái Nháp; RFQ được phát hành thẳng sang ISSUED vì danh mục
          API không có thao tác nháp RFQ.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <div class="table-shell">
      <table class="data-table procurement-table">
        <thead>
          <tr><th>Số</th><th>Tiêu đề</th><th>Cần hàng</th><th>Trạng thái</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in requisitions" :key="row.id">
            <td><strong>{{ row.number }}</strong></td>
            <td>{{ row.title }}</td>
            <td>{{ row.needByDate }}</td>
            <td><span class="status-pill" :data-status="row.status">{{ REQUISITION_STATUS_LABEL[row.status] }}</span></td>
          </tr>
          <tr v-if="!requisitions.length"><td colspan="4">Chưa có requisition nào trong phiên làm việc này.</td></tr>
        </tbody>
      </table>
    </div>

    <form v-if="permissions.createRequisition" class="procurement-form" @submit.prevent="submitRequisition">
      <h3 class="form-wide">Tạo requisition (API-077)</h3>
      <label>Số requisition<input v-model.trim="requisitionForm.number" required maxlength="80" placeholder="PR-2026-001" /></label>
      <label>Tiêu đề<input v-model.trim="requisitionForm.title" required maxlength="400" /></label>
      <label>Ngày cần hàng<input v-model="requisitionForm.needByDate" type="date" required /></label>
      <label>Gói thầu<input v-model.trim="requisitionForm.packageId" required placeholder="UUID gói thầu ACTIVE" /></label>
      <label>Cost code<input v-model.trim="requisitionForm.costCodeId" required placeholder="UUID cost code ACTIVE" /></label>
      <label>WBS node<input v-model.trim="requisitionForm.wbsId" placeholder="UUID WBS (tùy chọn)" /></label>
      <label class="form-wide">Mô tả<textarea v-model="requisitionForm.description" rows="2" maxlength="2000"></textarea></label>
      <el-button native-type="submit" type="primary" :loading="busy">Lưu requisition</el-button>
    </form>

    <div class="table-shell">
      <table class="data-table procurement-table rfq-table">
        <thead>
          <tr><th>RFQ</th><th>Requisition</th><th>Hạn nộp</th><th>Số bên được mời</th><th>Trạng thái</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rfqs" :key="row.id">
            <td><strong>{{ row.number }}</strong><span>rev {{ row.revision }}</span></td>
            <td>{{ requisitionNumber.get(row.requisitionId) ?? row.requisitionId }}</td>
            <td>{{ row.dueDate }}</td>
            <td>{{ row.invitedSupplierIds.length }}</td>
            <td><span class="status-pill" :data-status="row.status">{{ RFQ_STATUS_LABEL[row.status] }}</span></td>
          </tr>
          <tr v-if="!rfqs.length"><td colspan="5">Chưa có RFQ nào trong phiên làm việc này.</td></tr>
        </tbody>
      </table>
    </div>

    <form v-if="permissions.issueRfq" class="procurement-form rfq-form" @submit.prevent="submitRfq">
      <h3 class="form-wide">Phát hành RFQ (API-078)</h3>
      <label>Requisition<select v-model="rfqForm.requisitionId" required aria-label="Requisition phát hành RFQ"><option disabled value="">Chọn requisition</option><option v-for="item in requisitions" :key="item.id" :value="item.id">{{ item.number }} · {{ item.title }}</option></select></label>
      <label>Số RFQ<input v-model.trim="rfqForm.number" required maxlength="80" placeholder="RFQ-2026-001" /></label>
      <label>Revision<input v-model.trim="rfqForm.revision" required inputmode="numeric" /></label>
      <label>Hạn nộp thầu<input v-model="rfqForm.dueDate" type="datetime-local" required /></label>

      <fieldset class="invitee-picker form-wide">
        <legend>Nhà cung cấp được mời</legend>
        <p class="invitee-picker__note">
          Chỉ hồ sơ <strong>Đạt sơ tuyển</strong> và còn hiệu lực tại {{ asOf }} mới xuất hiện ở
          đây — đúng điều kiện API-078 kiểm tra trước khi tạo RFQ.
          <span v-if="excludedCount > 0">
            {{ excludedCount }} hồ sơ khác bị loại khỏi danh sách vì chưa đạt hoặc đã hết hiệu lực.
          </span>
        </p>
        <label v-for="supplier in invitable" :key="supplier.id" class="invitee-picker__option">
          <input
            type="checkbox"
            :value="supplier.id"
            :checked="invited.includes(supplier.id)"
            @change="toggleInvite(supplier.id)"
          />
          <span>
            <strong>{{ supplier.companyId }}</strong>
            {{ supplier.category }} ·
            {{ SUPPLIER_QUALIFICATION_LABEL[supplier.qualificationStatus] }} ·
            hiệu lực đến {{ supplier.validTo ?? 'không thời hạn' }}
          </span>
        </label>
        <p v-if="!invitable.length" class="invitee-picker__empty">
          Không có nhà cung cấp nào đủ điều kiện được mời — RFQ không thể phát hành.
        </p>
      </fieldset>

      <el-button native-type="submit" type="primary" :loading="busy" :disabled="!invitable.length">
        Phát hành RFQ
      </el-button>
    </form>
  </section>
</template>
