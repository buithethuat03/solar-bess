<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  APPENDIX_CREATABLE_STATUSES, APPENDIX_STATUS_LABEL, APPENDIX_TYPE_LABEL, APPENDIX_TYPES,
  CONTRACT_NO_PATTERN, CONTRACT_STATUS_LABEL, CONTRACT_TYPE_LABEL, CONTRACT_TYPES,
  CONTRACT_PARTY_ROLES, CURRENCY_PATTERN, MONEY_PATTERN, PARTY_ROLE_LABEL, SIGNED_MONEY_PATTERN,
  formatMoney
} from '@/constants/contracts';
import type {
  ContractAppendixView, ContractDetailView, ContractPartyRole, ContractPartyView, ContractType,
  CreateContractAppendixRequest, CreateContractPartyRequest, UpdateContractRequest
} from '@/types/contract.types';
import type { Company, LegalEntity } from '@/types/project.types';

const props = defineProps<{
  contract: ContractDetailView;
  parties: ContractPartyView[];
  appendices: ContractAppendixView[];
  companies: Company[];
  legalEntities: LegalEntity[];
  busy: boolean;
  permissions: { update: boolean; addParty: boolean; addAppendix: boolean };
}>();
const emit = defineEmits<{
  close: [];
  update: [input: UpdateContractRequest];
  'add-party': [input: CreateContractPartyRequest];
  'add-appendix': [input: CreateContractAppendixRequest];
}>();

const error = ref('');
const showPartyForm = ref(false);
const showAppendixForm = ref(false);

const partyForm = reactive({
  companyId: '', legalEntityId: '', partyRole: 'OWNER' as ContractPartyRole,
  representativeName: '', representativeTitle: '', authorityReference: ''
});
const appendixForm = reactive({
  appendixNo: '', revisionNo: '1', type: 'AMENDMENT' as CreateContractAppendixRequest['type'],
  status: 'DRAFT' as 'DRAFT' | 'EFFECTIVE', effectiveDate: '', valueImpact: '', documentId: ''
});
const editForm = reactive({
  title: props.contract.title, type: props.contract.type as ContractType,
  value: props.contract.value, currency: props.contract.currency,
  effectiveFrom: props.contract.effectiveFrom ?? '', effectiveTo: props.contract.effectiveTo ?? ''
});

const legalEntityOptions = computed(() => props.legalEntities
  .filter((item) => item.companyId === partyForm.companyId));

/**
 * V1 honesty: API-056 chỉ sửa được hợp đồng DRAFT chưa legal hold, và catalog chưa có thao tác
 * ký/kích hoạt nào — nên panel không render nút chuyển trạng thái, chỉ đọc từ vựng trạng thái.
 */
const canEditDraft = computed(() => props.permissions.update
  && props.contract.status === 'DRAFT' && !props.contract.legalHold);

function submitEdit(): void {
  error.value = '';
  if (editForm.title.trim().length < 3) {
    error.value = 'Tiêu đề phải có ít nhất 3 ký tự.';
    return;
  }
  if (!MONEY_PATTERN.test(editForm.value)) {
    error.value = 'Giá trị hợp đồng phải là số thập phân dương, tối đa 4 chữ số lẻ.';
    return;
  }
  if (!CURRENCY_PATTERN.test(editForm.currency)) {
    error.value = 'Loại tiền phải là mã ISO 3 chữ cái viết hoa.';
    return;
  }
  if (editForm.effectiveFrom && editForm.effectiveTo && editForm.effectiveTo < editForm.effectiveFrom) {
    error.value = 'Ngày hết hiệu lực phải không sớm hơn ngày hiệu lực.';
    return;
  }
  // The expected version is the one displayed; a stale one is answered with 409 by the server.
  emit('update', {
    expectedVersion: props.contract.versionNo,
    title: editForm.title.trim(), type: editForm.type,
    value: editForm.value.trim(), currency: editForm.currency.trim(),
    ...(editForm.effectiveFrom ? { effectiveFrom: editForm.effectiveFrom } : {}),
    ...(editForm.effectiveTo ? { effectiveTo: editForm.effectiveTo } : {})
  });
}

function submitParty(): void {
  error.value = '';
  if (!partyForm.companyId || !partyForm.legalEntityId) {
    error.value = 'Bên tham gia cần Company và pháp nhân ổn định; snapshot pháp lý chụp từ master.';
    return;
  }
  emit('add-party', {
    companyId: partyForm.companyId, legalEntityId: partyForm.legalEntityId,
    partyRole: partyForm.partyRole,
    ...(partyForm.representativeName.trim() ? { representativeName: partyForm.representativeName.trim() } : {}),
    ...(partyForm.representativeTitle.trim() ? { representativeTitle: partyForm.representativeTitle.trim() } : {}),
    ...(partyForm.authorityReference.trim() ? { authorityReference: partyForm.authorityReference.trim() } : {})
  });
  showPartyForm.value = false;
}

function submitAppendix(): void {
  error.value = '';
  if (!CONTRACT_NO_PATTERN.test(appendixForm.appendixNo)) {
    error.value = 'Số phụ lục phải viết hoa, 2–80 ký tự và chỉ dùng A–Z, 0–9, _ . / -';
    return;
  }
  if (appendixForm.valueImpact && !SIGNED_MONEY_PATTERN.test(appendixForm.valueImpact)) {
    error.value = 'Tác động giá trị phải là số thập phân (âm hoặc dương), tối đa 4 chữ số lẻ.';
    return;
  }
  // Mirrors EFFECTIVE_DATE_REQUIRED: an appendix declared EFFECTIVE must carry its date.
  if (appendixForm.status === 'EFFECTIVE' && !appendixForm.effectiveDate) {
    error.value = 'Phụ lục EFFECTIVE cần ngày hiệu lực.';
    return;
  }
  const revisionNo = Number.parseInt(appendixForm.revisionNo, 10);
  emit('add-appendix', {
    appendixNo: appendixForm.appendixNo.trim(), type: appendixForm.type,
    status: appendixForm.status,
    ...(Number.isInteger(revisionNo) && revisionNo >= 1 ? { revisionNo } : {}),
    ...(appendixForm.effectiveDate ? { effectiveDate: appendixForm.effectiveDate } : {}),
    ...(appendixForm.valueImpact.trim() ? { valueImpact: appendixForm.valueImpact.trim() } : {}),
    ...(appendixForm.documentId.trim() ? { documentId: appendixForm.documentId.trim() } : {})
  });
  showAppendixForm.value = false;
}
</script>

<template>
  <section class="contract-detail" aria-labelledby="contract-detail-title">
    <div class="detail-heading">
      <div>
        <small>CONTRACT · DB-028…DB-031</small>
        <h2 id="contract-detail-title">{{ contract.contractNo }} · {{ contract.title }}</h2>
        <p class="lead">
          {{ CONTRACT_TYPE_LABEL[contract.type] }} ·
          <span class="status-pill" :data-status="contract.status">{{ CONTRACT_STATUS_LABEL[contract.status] }}</span>
          <template v-if="contract.legalHold"> · Legal hold</template>
        </p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>

    <!-- Giá trị do Postgres hợp nhất (gốc + phụ lục EFFECTIVE), hiển thị nguyên văn theo loại tiền. -->
    <div class="contract-consolidated">
      <span>Giá trị hợp nhất</span>
      <strong class="money">{{ formatMoney(contract.consolidatedValue) }} {{ contract.currency }}</strong>
      <span>Giá trị gốc</span>
      <strong class="money">{{ formatMoney(contract.value) }} {{ contract.currency }}</strong>
      <span>Hiệu lực</span>
      <strong>{{ contract.effectiveFrom ?? '—' }} → {{ contract.effectiveTo ?? '—' }}</strong>
      <strong class="contract-version">v{{ contract.versionNo }}</strong>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <details v-if="canEditDraft" class="contract-edit">
      <summary>Chỉnh sửa bản nháp (API-056)</summary>
      <form @submit.prevent="submitEdit">
        <fieldset class="contract-form form-fieldset" :disabled="busy">
          <label class="form-wide">Tiêu đề<input v-model.trim="editForm.title" required maxlength="400" /></label>
          <label>Loại hợp đồng<select v-model="editForm.type" aria-label="Loại hợp đồng nháp"><option v-for="item in CONTRACT_TYPES" :key="item" :value="item">{{ CONTRACT_TYPE_LABEL[item] }}</option></select></label>
          <label>Giá trị<input v-model.trim="editForm.value" required inputmode="decimal" /></label>
          <label>Loại tiền<input v-model.trim="editForm.currency" required maxlength="3" /></label>
          <label>Hiệu lực từ<input v-model="editForm.effectiveFrom" type="date" /></label>
          <label>Hiệu lực đến<input v-model="editForm.effectiveTo" type="date" /></label>
          <div class="form-actions form-wide">
            <el-button native-type="submit" type="primary" :loading="busy">Lưu bản nháp</el-button>
          </div>
        </fieldset>
      </form>
    </details>

    <div class="section-heading">
      <div>
        <h3>Các bên tham gia</h3>
        <p>Snapshot pháp lý tại thời điểm ghi nhận — master đổi tên cũng không viết lại lịch sử.</p>
      </div>
      <el-button v-if="permissions.addParty" @click="showPartyForm = !showPartyForm">Thêm bên tham gia</el-button>
    </div>
    <form v-if="showPartyForm && permissions.addParty" class="contract-inline-form" @submit.prevent="submitParty">
      <label>Company<select v-model="partyForm.companyId" required aria-label="Company"><option disabled value="">Chọn company</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>Pháp nhân<select v-model="partyForm.legalEntityId" required aria-label="Pháp nhân"><option disabled value="">Chọn pháp nhân</option><option v-for="item in legalEntityOptions" :key="item.id" :value="item.id">{{ item.legalName }}</option></select></label>
      <label>Vai trò<select v-model="partyForm.partyRole" aria-label="Vai trò bên tham gia"><option v-for="item in CONTRACT_PARTY_ROLES" :key="item" :value="item">{{ PARTY_ROLE_LABEL[item] }}</option></select></label>
      <label>Người đại diện<input v-model.trim="partyForm.representativeName" maxlength="200" /></label>
      <label>Chức danh<input v-model.trim="partyForm.representativeTitle" maxlength="200" /></label>
      <label>Căn cứ ủy quyền<input v-model.trim="partyForm.authorityReference" maxlength="400" /></label>
      <el-button native-type="submit" type="primary" :loading="busy">Lưu bên tham gia</el-button>
    </form>
    <div class="table-shell">
      <table class="data-table contract-table">
        <thead>
          <tr><th>Pháp nhân (snapshot)</th><th>Vai trò</th><th>Đăng ký / thuế</th><th>Người đại diện</th></tr>
        </thead>
        <tbody>
          <tr v-for="party in parties" :key="party.id">
            <td><strong>{{ party.legalNameSnapshot }}</strong><span>{{ party.countrySnapshot }}</span></td>
            <td>{{ PARTY_ROLE_LABEL[party.partyRole] }}</td>
            <td>{{ party.registrationNoSnapshot }}<span>{{ party.taxIdSnapshot ?? '—' }}</span></td>
            <td>{{ party.representativeName ?? '—' }}<span>{{ party.representativeTitle ?? '' }}</span></td>
          </tr>
          <tr v-if="!parties.length"><td colspan="4">Chưa có bên tham gia nào được ghi nhận.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section-heading">
      <div>
        <h3>Phụ lục</h3>
        <p>Chỉ phụ lục EFFECTIVE mới cộng vào giá trị hợp nhất; loại tiền phải trùng hợp đồng.</p>
      </div>
      <el-button v-if="permissions.addAppendix" @click="showAppendixForm = !showAppendixForm">Thêm phụ lục</el-button>
    </div>
    <form v-if="showAppendixForm && permissions.addAppendix" class="contract-inline-form" @submit.prevent="submitAppendix">
      <label>Số phụ lục<input v-model.trim="appendixForm.appendixNo" required placeholder="VD: PL-01" /></label>
      <label>Revision<input v-model.trim="appendixForm.revisionNo" inputmode="numeric" /></label>
      <label>Loại<select v-model="appendixForm.type" aria-label="Loại phụ lục"><option v-for="item in APPENDIX_TYPES" :key="item" :value="item">{{ APPENDIX_TYPE_LABEL[item] }}</option></select></label>
      <label>Trạng thái<select v-model="appendixForm.status" aria-label="Trạng thái phụ lục"><option v-for="item in APPENDIX_CREATABLE_STATUSES" :key="item" :value="item">{{ APPENDIX_STATUS_LABEL[item] }}</option></select></label>
      <label>Ngày hiệu lực<input v-model="appendixForm.effectiveDate" type="date" /></label>
      <label>Tác động giá trị<input v-model.trim="appendixForm.valueImpact" inputmode="decimal" :placeholder="`0 (${contract.currency})`" /></label>
      <label>Tài liệu<input v-model.trim="appendixForm.documentId" placeholder="UUID tài liệu (nếu có)" /></label>
      <el-button native-type="submit" type="primary" :loading="busy">Lưu phụ lục</el-button>
    </form>
    <div class="table-shell">
      <table class="data-table contract-table">
        <thead>
          <tr><th>Số phụ lục</th><th>Loại</th><th>Trạng thái</th><th>Ngày hiệu lực</th><th>Tác động giá trị</th></tr>
        </thead>
        <tbody>
          <tr v-for="appendix in appendices" :key="appendix.id">
            <td><strong>{{ appendix.appendixNo }}</strong><span>rev {{ appendix.revisionNo }}</span></td>
            <td>{{ APPENDIX_TYPE_LABEL[appendix.type] }}</td>
            <td><span class="status-pill" :data-status="appendix.status">{{ APPENDIX_STATUS_LABEL[appendix.status] }}</span></td>
            <td>{{ appendix.effectiveDate ?? '—' }}</td>
            <td><span class="money">{{ formatMoney(appendix.valueImpact) }} {{ appendix.currency }}</span></td>
          </tr>
          <tr v-if="!appendices.length"><td colspan="5">Chưa có phụ lục nào.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
