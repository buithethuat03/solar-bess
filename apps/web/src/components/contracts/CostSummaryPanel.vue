<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  BUDGET_STATUS_LABEL, COMMITMENT_SOURCE_LABEL, COMMITMENT_SOURCE_TYPES, COMMITMENT_STATUS_LABEL,
  COMPONENT_RATE_PATTERN, CURRENCY_PATTERN, FX_RATE_PATTERN, MONEY_PATTERN,
  PAYMENT_COMPONENT_LABEL, PAYMENT_COMPONENT_TYPES, PAYMENT_STATUS_LABEL, SIGNED_MONEY_PATTERN,
  formatMoney, sumMoney
} from '@/constants/contracts';
import type {
  CommitmentSourceType, ContractView, CostSummaryData, CreateBudgetVersionRequest,
  CreateCommitmentRequest, CreatePaymentRequest, PaymentComponentInput, PaymentComponentType,
  PaymentWithComponentsView
} from '@/types/contract.types';
import type { Company, LegalEntity } from '@/types/project.types';

interface ComponentDraft {
  sequenceNo: string;
  componentType: PaymentComponentType;
  amount: string;
  basisAmount: string;
  rate: string;
  ruleVersion: string;
}

const props = defineProps<{
  summary: CostSummaryData | null;
  contracts: ContractView[];
  companies: Company[];
  legalEntities: LegalEntity[];
  busy: boolean;
  permissions: { budgetSubmit: boolean; commitmentCreate: boolean; paymentCreate: boolean };
  lastPayment: PaymentWithComponentsView | null;
}>();
const emit = defineEmits<{
  'submit-budget': [input: CreateBudgetVersionRequest];
  'create-commitment': [input: CreateCommitmentRequest];
  'create-payment': [contractId: string, input: CreatePaymentRequest];
  'reload-payment': [paymentId: string];
}>();

const error = ref('');
const budgetForm = reactive({ currency: 'VND', totalAmount: '' });
const commitmentForm = reactive({
  contractId: '', costCodeId: '', amount: '', sourceType: 'CONTRACT' as CommitmentSourceType,
  sourceId: '', sourceVersion: '1', reversesCommitmentId: ''
});
const paymentForm = reactive({
  contractId: '', payerCompanyId: '', payerLegalEntityId: '',
  payeeCompanyId: '', payeeLegalEntityId: '', requestedAmount: '', currency: '',
  milestoneRef: '', evidenceText: '', withInvoice: false, withFx: false
});
const invoiceForm = reactive({
  invoiceNo: '', invoiceDate: '', supplierCompanyId: '', supplierLegalEntityId: '',
  grossAmount: '', vatAmount: '', netAmount: ''
});
const fxForm = reactive({ baseCurrency: 'USD', quoteCurrency: 'VND', rate: '', rateDate: '', source: '' });
const components = ref<ComponentDraft[]>([]);

/**
 * Mỗi loại tiền là một nhóm hiển thị riêng. Không có "tổng chung": API trả
 * `reportingCurrency: null` đúng vì không tồn tại tỷ giá quy đổi được phê duyệt, nên UI cũng
 * tuyệt đối không cộng hai loại tiền vào một con số.
 */
function groupByCurrency<T extends { currency: string }>(
  lines: readonly T[]
): Array<{ currency: string; lines: T[] }> {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const bucket = groups.get(line.currency) ?? [];
    bucket.push(line);
    groups.set(line.currency, bucket);
  }
  return [...groups.entries()].map(([currency, groupLines]) => ({ currency, lines: groupLines }));
}

const commitmentGroups = computed(() => groupByCurrency(props.summary?.commitments ?? []));
const paymentGroups = computed(() => groupByCurrency(props.summary?.payments ?? []));

function legalOptions(companyId: string): LegalEntity[] {
  return props.legalEntities.filter((item) => item.companyId === companyId);
}

/** Tổng tham khảo, cộng chuỗi chính xác bằng BigInt; đối chiếu ràng buộc vẫn do Postgres quyết. */
const componentSum = computed(() => sumMoney(components.value.map((item) => item.amount)));

function addComponent(): void {
  components.value = [...components.value, {
    sequenceNo: String(components.value.length + 1), componentType: 'BASE',
    amount: '', basisAmount: '', rate: '', ruleVersion: 'v1'
  }];
}

function removeComponent(index: number): void {
  components.value = components.value.filter((_, itemIndex) => itemIndex !== index);
}

function submitBudget(): void {
  error.value = '';
  if (!CURRENCY_PATTERN.test(budgetForm.currency)) {
    error.value = 'Loại tiền ngân sách phải là mã ISO 3 chữ cái viết hoa.';
    return;
  }
  if (!MONEY_PATTERN.test(budgetForm.totalAmount)) {
    error.value = 'Tổng ngân sách phải là số thập phân dương, tối đa 4 chữ số lẻ.';
    return;
  }
  emit('submit-budget', {
    currency: budgetForm.currency.trim(), totalAmount: budgetForm.totalAmount.trim()
  });
}

function submitCommitment(): void {
  error.value = '';
  if (!commitmentForm.contractId || !commitmentForm.costCodeId.trim()) {
    error.value = 'Commitment cần hợp đồng và cost code (UUID cost code do PMO cấp).';
    return;
  }
  if (!SIGNED_MONEY_PATTERN.test(commitmentForm.amount)) {
    error.value = 'Số tiền commitment phải là số thập phân (âm cho bút toán đảo).';
    return;
  }
  const sourceVersion = Number.parseInt(commitmentForm.sourceVersion, 10);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
    error.value = 'Source version phải là số nguyên ≥ 1.';
    return;
  }
  // Nguồn CONTRACT phải trỏ đúng hợp đồng đã chọn — server từ chối mọi giá trị khác.
  const sourceId = commitmentForm.sourceType === 'CONTRACT'
    ? commitmentForm.contractId : commitmentForm.sourceId.trim();
  if (!sourceId) {
    error.value = 'Nguồn CONTRACT_APPENDIX cần UUID phụ lục.';
    return;
  }
  emit('create-commitment', {
    contractId: commitmentForm.contractId, costCodeId: commitmentForm.costCodeId.trim(),
    amount: commitmentForm.amount.trim(), sourceType: commitmentForm.sourceType,
    sourceId, sourceVersion,
    ...(commitmentForm.reversesCommitmentId.trim()
      ? { reversesCommitmentId: commitmentForm.reversesCommitmentId.trim() } : {})
  });
}

function buildComponents(): PaymentComponentInput[] | null {
  const built: PaymentComponentInput[] = [];
  for (const draft of components.value) {
    const sequenceNo = Number.parseInt(draft.sequenceNo, 10);
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
      error.value = 'Số thứ tự thành phần phải là số nguyên ≥ 1.';
      return null;
    }
    if (!SIGNED_MONEY_PATTERN.test(draft.amount)) {
      error.value = 'Số tiền từng thành phần phải là số thập phân (khấu trừ mang dấu âm).';
      return null;
    }
    if (draft.rate && !COMPONENT_RATE_PATTERN.test(draft.rate)) {
      error.value = 'Rate thành phần phải là số thập phân tối đa 6 chữ số lẻ.';
      return null;
    }
    if (!draft.ruleVersion.trim()) {
      error.value = 'Mỗi thành phần cần rule version.';
      return null;
    }
    built.push({
      sequenceNo, componentType: draft.componentType, amount: draft.amount.trim(),
      ruleVersion: draft.ruleVersion.trim(),
      ...(draft.basisAmount.trim() ? { basisAmount: draft.basisAmount.trim() } : {}),
      ...(draft.rate.trim() ? { rate: draft.rate.trim() } : {})
    });
  }
  return built;
}

function submitPayment(): void {
  error.value = '';
  if (!paymentForm.contractId) {
    error.value = 'Chọn hợp đồng nhận payment.';
    return;
  }
  if (!paymentForm.payerCompanyId || !paymentForm.payerLegalEntityId
    || !paymentForm.payeeCompanyId || !paymentForm.payeeLegalEntityId) {
    error.value = 'Payment cần đủ pháp nhân chi trả và pháp nhân thụ hưởng.';
    return;
  }
  if (paymentForm.payerLegalEntityId === paymentForm.payeeLegalEntityId) {
    error.value = 'Pháp nhân chi trả và thụ hưởng phải khác nhau.';
    return;
  }
  if (!MONEY_PATTERN.test(paymentForm.requestedAmount)) {
    error.value = 'Số tiền yêu cầu phải là số thập phân dương, tối đa 4 chữ số lẻ.';
    return;
  }
  if (paymentForm.currency && !CURRENCY_PATTERN.test(paymentForm.currency)) {
    error.value = 'Loại tiền payment (nếu khai) phải là mã ISO 3 chữ cái.';
    return;
  }
  if (paymentForm.withInvoice) {
    if (!invoiceForm.invoiceNo.trim() || !invoiceForm.invoiceDate
      || !invoiceForm.supplierCompanyId || !invoiceForm.supplierLegalEntityId) {
      error.value = 'Hóa đơn cần số, ngày và pháp nhân nhà cung cấp.';
      return;
    }
    for (const amount of [invoiceForm.grossAmount, invoiceForm.vatAmount, invoiceForm.netAmount]) {
      if (!MONEY_PATTERN.test(amount)) {
        error.value = 'Gross/VAT/Net của hóa đơn phải là số thập phân dương.';
        return;
      }
    }
  }
  if (paymentForm.withFx) {
    if (!CURRENCY_PATTERN.test(fxForm.baseCurrency) || !CURRENCY_PATTERN.test(fxForm.quoteCurrency)
      || fxForm.baseCurrency === fxForm.quoteCurrency) {
      error.value = 'Cặp tiền FX phải là hai mã ISO khác nhau.';
      return;
    }
    if (!FX_RATE_PATTERN.test(fxForm.rate) || !fxForm.rateDate || !fxForm.source.trim()) {
      error.value = 'FX snapshot cần tỷ giá hợp lệ, ngày và nguồn.';
      return;
    }
  }
  const builtComponents = components.value.length ? buildComponents() : [];
  if (builtComponents === null) return;
  const evidenceRefs = paymentForm.evidenceText.split('\n')
    .map((line) => line.trim()).filter((line) => line.length > 0);
  emit('create-payment', paymentForm.contractId, {
    payerCompanyId: paymentForm.payerCompanyId, payerLegalEntityId: paymentForm.payerLegalEntityId,
    payeeCompanyId: paymentForm.payeeCompanyId, payeeLegalEntityId: paymentForm.payeeLegalEntityId,
    requestedAmount: paymentForm.requestedAmount.trim(),
    ...(paymentForm.currency.trim() ? { currency: paymentForm.currency.trim() } : {}),
    ...(paymentForm.milestoneRef.trim() ? { milestoneRef: paymentForm.milestoneRef.trim() } : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {}),
    ...(builtComponents.length ? { components: builtComponents } : {}),
    ...(paymentForm.withInvoice ? {
      invoice: {
        invoiceNo: invoiceForm.invoiceNo.trim(), invoiceDate: invoiceForm.invoiceDate,
        supplierCompanyId: invoiceForm.supplierCompanyId,
        supplierLegalEntityId: invoiceForm.supplierLegalEntityId,
        grossAmount: invoiceForm.grossAmount.trim(), vatAmount: invoiceForm.vatAmount.trim(),
        netAmount: invoiceForm.netAmount.trim()
      }
    } : {}),
    ...(paymentForm.withFx ? {
      fxSnapshot: {
        baseCurrency: fxForm.baseCurrency.trim(), quoteCurrency: fxForm.quoteCurrency.trim(),
        rate: fxForm.rate.trim(), rateDate: fxForm.rateDate, source: fxForm.source.trim()
      }
    } : {})
  });
}
</script>

<template>
  <section class="contract-detail cost-summary" aria-labelledby="cost-summary-title">
    <div class="detail-heading">
      <div>
        <small>COST CONTROL · DB-033…DB-040</small>
        <h2 id="cost-summary-title">Chi phí dự án</h2>
        <p class="lead">
          Số liệu nhóm theo từng loại tiền. Không có tổng quy đổi chung vì không tồn tại tỷ giá
          báo cáo được phê duyệt — từng nhóm đọc độc lập.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <template v-if="summary">
      <div class="section-heading">
        <div>
          <h3>Ngân sách</h3>
          <p>Phiên bản mới nhất theo từng trạng thái; phiên bản mới sinh ra ở trạng thái Đã trình.</p>
        </div>
      </div>
      <div class="table-shell">
        <table class="data-table contract-table">
          <thead><tr><th>Trạng thái</th><th>Phiên bản</th><th>Loại tiền</th><th>Tổng ngân sách</th></tr></thead>
          <tbody>
            <tr v-for="line in summary.budget" :key="`${line.status}-${line.budgetVersion}`">
              <td><span class="status-pill" :data-status="line.status">{{ BUDGET_STATUS_LABEL[line.status] }}</span></td>
              <td>v{{ line.budgetVersion }}</td>
              <td>{{ line.currency }}</td>
              <td><span class="money">{{ formatMoney(line.totalAmount) }} {{ line.currency }}</span></td>
            </tr>
            <tr v-if="!summary.budget.length"><td colspan="4">Chưa có budget version nào.</td></tr>
          </tbody>
        </table>
      </div>

      <div class="section-heading">
        <div>
          <h3>Commitment theo cost code</h3>
          <p>Mỗi loại tiền một bảng riêng — không cộng chéo loại tiền.</p>
        </div>
      </div>
      <p v-if="!commitmentGroups.length" class="muted-inline">Chưa có commitment nào được ghi nhận.</p>
      <section
        v-for="group in commitmentGroups"
        :key="group.currency"
        class="cost-currency-group"
        :data-currency="group.currency"
      >
        <h4>{{ group.currency }}</h4>
        <div class="table-shell">
          <table class="data-table contract-table">
            <thead><tr><th>Cost code</th><th>Trạng thái</th><th>Số tiền</th></tr></thead>
            <tbody>
              <tr v-for="line in group.lines" :key="`${line.costCodeId}-${line.status}`">
                <td>{{ line.costCode }}</td>
                <td><span class="status-pill" :data-status="line.status">{{ COMMITMENT_STATUS_LABEL[line.status] }}</span></td>
                <td><span class="money">{{ formatMoney(line.amount) }} {{ group.currency }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="section-heading">
        <div>
          <h3>Payment theo trạng thái</h3>
          <p>Approved/Paid để trống khi chưa có giá trị — trống không phải là 0.</p>
        </div>
      </div>
      <p v-if="!paymentGroups.length" class="muted-inline">Chưa có payment nào được ghi nhận.</p>
      <section
        v-for="group in paymentGroups"
        :key="group.currency"
        class="cost-currency-group"
        :data-currency="group.currency"
      >
        <h4>{{ group.currency }}</h4>
        <div class="table-shell">
          <table class="data-table contract-table">
            <thead><tr><th>Trạng thái</th><th>Số lệnh</th><th>Yêu cầu</th><th>Đã duyệt</th><th>Đã chi</th></tr></thead>
            <tbody>
              <tr v-for="line in group.lines" :key="line.status">
                <td><span class="status-pill" :data-status="line.status">{{ PAYMENT_STATUS_LABEL[line.status] }}</span></td>
                <td>{{ line.paymentCount }}</td>
                <td><span class="money">{{ formatMoney(line.requestedAmount) }} {{ group.currency }}</span></td>
                <td><span class="money">{{ line.approvedAmount === null ? '—' : `${formatMoney(line.approvedAmount)} ${group.currency}` }}</span></td>
                <td><span class="money">{{ line.paidAmount === null ? '—' : `${formatMoney(line.paidAmount)} ${group.currency}` }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <p v-else class="muted-inline">Chưa tải được cost summary trong scope được phép.</p>

    <form v-if="permissions.budgetSubmit" class="contract-inline-form" @submit.prevent="submitBudget">
      <h3 class="form-wide">Trình budget version mới (API-063)</h3>
      <label>Loại tiền<input v-model.trim="budgetForm.currency" required maxlength="3" /></label>
      <label>Tổng ngân sách<input v-model.trim="budgetForm.totalAmount" required inputmode="decimal" /></label>
      <el-button native-type="submit" type="primary" :loading="busy">Trình ngân sách</el-button>
    </form>

    <form v-if="permissions.commitmentCreate" class="contract-inline-form" @submit.prevent="submitCommitment">
      <h3 class="form-wide">Ghi nhận commitment (API-064)</h3>
      <label>Hợp đồng<select v-model="commitmentForm.contractId" required aria-label="Hợp đồng commitment"><option disabled value="">Chọn hợp đồng</option><option v-for="item in contracts" :key="item.id" :value="item.id">{{ item.contractNo }} · {{ item.currency }}</option></select></label>
      <label>Cost code<input v-model.trim="commitmentForm.costCodeId" required placeholder="UUID cost code ACTIVE" /></label>
      <label>Số tiền<input v-model.trim="commitmentForm.amount" required inputmode="decimal" placeholder="Âm cho bút toán đảo" /></label>
      <label>Nguồn<select v-model="commitmentForm.sourceType" aria-label="Nguồn commitment"><option v-for="item in COMMITMENT_SOURCE_TYPES" :key="item" :value="item">{{ COMMITMENT_SOURCE_LABEL[item] }}</option></select></label>
      <label v-if="commitmentForm.sourceType === 'CONTRACT_APPENDIX'">Source ID<input v-model.trim="commitmentForm.sourceId" placeholder="UUID phụ lục" /></label>
      <label>Source version<input v-model.trim="commitmentForm.sourceVersion" required inputmode="numeric" /></label>
      <label>Đảo commitment<input v-model.trim="commitmentForm.reversesCommitmentId" placeholder="UUID commitment gốc (nếu đảo)" /></label>
      <el-button native-type="submit" type="primary" :loading="busy">Ghi commitment</el-button>
    </form>

    <form v-if="permissions.paymentCreate" class="contract-inline-form payment-form" @submit.prevent="submitPayment">
      <h3 class="form-wide">Tạo payment request (API-065)</h3>
      <label>Hợp đồng<select v-model="paymentForm.contractId" required aria-label="Hợp đồng thanh toán"><option disabled value="">Chọn hợp đồng</option><option v-for="item in contracts" :key="item.id" :value="item.id">{{ item.contractNo }} · {{ item.currency }}</option></select></label>
      <label>Số tiền yêu cầu<input v-model.trim="paymentForm.requestedAmount" required inputmode="decimal" /></label>
      <label>Loại tiền<input v-model.trim="paymentForm.currency" maxlength="3" placeholder="Bỏ trống = theo hợp đồng" /></label>
      <label>Milestone<input v-model.trim="paymentForm.milestoneRef" maxlength="200" /></label>
      <label>Company chi trả<select v-model="paymentForm.payerCompanyId" required aria-label="Company chi trả"><option disabled value="">Chọn company</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>Pháp nhân chi trả<select v-model="paymentForm.payerLegalEntityId" required aria-label="Pháp nhân chi trả"><option disabled value="">Chọn pháp nhân</option><option v-for="item in legalOptions(paymentForm.payerCompanyId)" :key="item.id" :value="item.id">{{ item.legalName }}</option></select></label>
      <label>Company thụ hưởng<select v-model="paymentForm.payeeCompanyId" required aria-label="Company thụ hưởng"><option disabled value="">Chọn company</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>Pháp nhân thụ hưởng<select v-model="paymentForm.payeeLegalEntityId" required aria-label="Pháp nhân thụ hưởng"><option disabled value="">Chọn pháp nhân</option><option v-for="item in legalOptions(paymentForm.payeeCompanyId)" :key="item.id" :value="item.id">{{ item.legalName }}</option></select></label>
      <label class="form-wide">Evidence (mỗi dòng một tham chiếu)<textarea v-model="paymentForm.evidenceText" rows="2"></textarea></label>

      <div class="component-editor form-wide">
        <div class="section-heading">
          <div>
            <h4>Thành phần thanh toán</h4>
            <p>Khấu trừ mang dấu âm; tổng phải khớp số tiền yêu cầu — Postgres là nơi đối chiếu cuối cùng.</p>
          </div>
          <el-button native-type="button" @click="addComponent">Thêm thành phần</el-button>
        </div>
        <div v-for="(draft, index) in components" :key="index" class="component-editor__row">
          <label>Thứ tự<input v-model.trim="draft.sequenceNo" inputmode="numeric" /></label>
          <label>Loại<select v-model="draft.componentType" :aria-label="`Loại thành phần ${index + 1}`"><option v-for="item in PAYMENT_COMPONENT_TYPES" :key="item" :value="item">{{ PAYMENT_COMPONENT_LABEL[item] }}</option></select></label>
          <label>Số tiền<input v-model.trim="draft.amount" inputmode="decimal" /></label>
          <label>Cơ sở tính<input v-model.trim="draft.basisAmount" inputmode="decimal" /></label>
          <label>Rate<input v-model.trim="draft.rate" inputmode="decimal" /></label>
          <label>Rule<input v-model.trim="draft.ruleVersion" maxlength="40" /></label>
          <el-button text type="danger" native-type="button" @click="removeComponent(index)">Xóa</el-button>
        </div>
        <p v-if="components.length" class="component-editor__sum">
          Tổng thành phần (tham khảo):
          <span class="money">{{ componentSum ?? 'chưa đủ dữ liệu hợp lệ' }}</span>
          · Số tiền yêu cầu: <span class="money">{{ paymentForm.requestedAmount || '—' }}</span>
        </p>
      </div>

      <label class="form-wide contract-toggle"><input v-model="paymentForm.withInvoice" type="checkbox" /> Kèm hóa đơn</label>
      <template v-if="paymentForm.withInvoice">
        <label>Số hóa đơn<input v-model.trim="invoiceForm.invoiceNo" maxlength="80" /></label>
        <label>Ngày hóa đơn<input v-model="invoiceForm.invoiceDate" type="date" /></label>
        <label>Company nhà cung cấp<select v-model="invoiceForm.supplierCompanyId" aria-label="Company nhà cung cấp"><option disabled value="">Chọn company</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label>Pháp nhân nhà cung cấp<select v-model="invoiceForm.supplierLegalEntityId" aria-label="Pháp nhân nhà cung cấp"><option disabled value="">Chọn pháp nhân</option><option v-for="item in legalOptions(invoiceForm.supplierCompanyId)" :key="item.id" :value="item.id">{{ item.legalName }}</option></select></label>
        <label>Gross<input v-model.trim="invoiceForm.grossAmount" inputmode="decimal" /></label>
        <label>VAT<input v-model.trim="invoiceForm.vatAmount" inputmode="decimal" /></label>
        <label>Net<input v-model.trim="invoiceForm.netAmount" inputmode="decimal" /></label>
      </template>

      <label class="form-wide contract-toggle"><input v-model="paymentForm.withFx" type="checkbox" /> Kèm FX snapshot</label>
      <template v-if="paymentForm.withFx">
        <label>Tiền gốc<input v-model.trim="fxForm.baseCurrency" maxlength="3" /></label>
        <label>Tiền quy đổi<input v-model.trim="fxForm.quoteCurrency" maxlength="3" /></label>
        <label>Tỷ giá<input v-model.trim="fxForm.rate" inputmode="decimal" /></label>
        <label>Ngày tỷ giá<input v-model="fxForm.rateDate" type="date" /></label>
        <label>Nguồn<input v-model.trim="fxForm.source" maxlength="80" /></label>
      </template>

      <div class="form-actions form-wide">
        <el-button native-type="submit" type="primary" :loading="busy">Tạo payment</el-button>
      </div>
    </form>

    <section v-if="lastPayment" class="cost-currency-group payment-receipt" :data-currency="lastPayment.currency">
      <div class="section-heading">
        <div>
          <h4>Payment vừa ghi nhận · {{ lastPayment.currency }}</h4>
          <p>
            <span class="status-pill" :data-status="lastPayment.status">{{ PAYMENT_STATUS_LABEL[lastPayment.status] }}</span>
            · Yêu cầu <span class="money">{{ formatMoney(lastPayment.requestedAmount) }} {{ lastPayment.currency }}</span>
          </p>
        </div>
        <el-button :loading="busy" @click="emit('reload-payment', lastPayment.id)">Tải lại payment</el-button>
      </div>
      <div class="table-shell">
        <table class="data-table contract-table">
          <thead><tr><th>Thứ tự</th><th>Loại thành phần</th><th>Số tiền</th><th>Rule</th></tr></thead>
          <tbody>
            <tr v-for="component in lastPayment.components" :key="component.id">
              <td>{{ component.sequenceNo }}</td>
              <td>{{ PAYMENT_COMPONENT_LABEL[component.componentType] }}</td>
              <td><span class="money">{{ formatMoney(component.amount) }} {{ component.currency }}</span></td>
              <td>{{ component.ruleVersion }}</td>
            </tr>
            <tr v-if="!lastPayment.components.length"><td colspan="4">Payment không khai thành phần.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
