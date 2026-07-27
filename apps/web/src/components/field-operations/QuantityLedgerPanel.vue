<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  QUANTITY_PATTERN, SOURCE_KEY_MAX_LENGTH, SOURCE_KEY_MIN_LENGTH, formatQuantity,
  parseReferenceLines
} from '@/constants/field-hse';
import type {
  QuantityProgressView, RecordQuantityProgressRequest, WorkfrontView
} from '@/types/field-hse.types';

type LedgerRole = 'RECORD' | 'CORRECTION' | 'CERTIFICATION';

/**
 * API-090 — the quantity ledger of one workfront. DB-057 is append-only by trigger: a correction and
 * a certification are SEPARATE rows referencing the original, and the original never changes. This
 * panel therefore has no edit affordance at all — every action produces a new row, and the table
 * renders the whole chain including the row a correction supersedes in meaning but not in storage.
 *
 * `quantity` is `numeric(19,4)` text: it is validated as text, sent as text and displayed as text.
 */
const props = defineProps<{
  workfront: WorkfrontView | null;
  records: QuantityProgressView[];
  busy: boolean;
  canRecord: boolean;
}>();
const emit = defineEmits<{ record: [input: RecordQuantityProgressRequest] }>();

const error = ref('');
const form = reactive({
  role: 'RECORD' as LedgerRole, targetId: '', recordDate: new Date().toISOString().slice(0, 10),
  quantity: '', unit: 'm2', sourceKey: '', wbsNodeId: '', reason: '', evidenceText: ''
});

const ROLE_LABEL: Record<LedgerRole, string> = {
  RECORD: 'Ghi nhận khối lượng',
  CORRECTION: 'Đính chính (dòng mới)',
  CERTIFICATION: 'Nghiệm thu (dòng mới)'
};

/** Only a plain record can be certified, and at most once (`uq_qpr_single_certification`). */
const certifiable = computed(() => props.records.filter((row) => row.certificationOfId === null
  && !props.records.some((other) => other.certificationOfId === row.id)));

function roleOf(row: QuantityProgressView): LedgerRole {
  if (row.certificationOfId !== null) return 'CERTIFICATION';
  if (row.correctionOfId !== null) return 'CORRECTION';
  return 'RECORD';
}

function submit(): void {
  error.value = '';
  if (!QUANTITY_PATTERN.test(form.quantity.trim())) {
    error.value = 'Khối lượng phải là số thập phân dương, tối đa 4 chữ số sau dấu chấm.';
    return;
  }
  if (!form.unit.trim()) {
    error.value = 'Nhập đơn vị đo.';
    return;
  }
  const sourceKey = form.sourceKey.trim();
  if (sourceKey.length < SOURCE_KEY_MIN_LENGTH || sourceKey.length > SOURCE_KEY_MAX_LENGTH) {
    error.value = `Source key phải có ${SOURCE_KEY_MIN_LENGTH}–${SOURCE_KEY_MAX_LENGTH} ký tự.`;
    return;
  }
  if (form.role !== 'RECORD' && !form.targetId) {
    error.value = 'Chọn bản ghi gốc mà dòng mới này tham chiếu tới.';
    return;
  }
  if (form.role === 'CORRECTION' && form.reason.trim().length < 3) {
    error.value = 'Đính chính bắt buộc phải có lý do (ít nhất 3 ký tự).';
    return;
  }
  const evidenceRefs = parseReferenceLines(form.evidenceText);
  emit('record', {
    recordDate: form.recordDate, quantity: form.quantity.trim(), unit: form.unit.trim(),
    sourceKey,
    ...(form.wbsNodeId.trim() ? { wbsNodeId: form.wbsNodeId.trim() } : {}),
    ...(form.role === 'CORRECTION'
      ? { correctionOfId: form.targetId, reason: form.reason.trim() } : {}),
    ...(form.role === 'CERTIFICATION' ? { certificationOfId: form.targetId } : {}),
    ...(evidenceRefs.length ? { evidenceRefs } : {})
  });
  form.quantity = '';
  form.sourceKey = '';
  form.reason = '';
  form.evidenceText = '';
}
</script>

<template>
  <section class="field-panel quantity-ledger-panel" aria-labelledby="quantity-ledger-title">
    <div class="detail-heading">
      <div>
        <small>QUANTITY LEDGER · API-090</small>
        <h2 id="quantity-ledger-title">Sổ khối lượng {{ workfront ? `· ${workfront.code}` : '' }}</h2>
        <p class="lead">
          Sổ chỉ thêm dòng. Đính chính và nghiệm thu là bản ghi mới tham chiếu bản gốc; không dòng nào
          từng được sửa hay xóa.
        </p>
      </div>
    </div>

    <div v-if="!workfront" class="empty-panel">
      <h3>Chọn một workfront</h3>
      <p>Sổ khối lượng thuộc về một workfront cụ thể; mở một dòng trong register để xem và ghi.</p>
    </div>
    <template v-else>
      <el-alert v-if="error" type="error" :title="error" show-icon />

      <form v-if="canRecord" class="field-inline-form" @submit.prevent="submit">
        <label>Loại bản ghi<select v-model="form.role" aria-label="Loại bản ghi khối lượng"><option v-for="(label, value) in ROLE_LABEL" :key="value" :value="value">{{ label }}</option></select></label>
        <label v-if="form.role === 'CORRECTION'">Đính chính cho<select v-model="form.targetId" required aria-label="Bản ghi được đính chính"><option disabled value="">Chọn bản ghi gốc</option><option v-for="item in records" :key="item.id" :value="item.id">{{ item.recordDate }} · {{ item.quantity }} {{ item.unit }}</option></select></label>
        <label v-if="form.role === 'CERTIFICATION'">Nghiệm thu cho<select v-model="form.targetId" required aria-label="Bản ghi được nghiệm thu"><option disabled value="">Chọn bản ghi gốc</option><option v-for="item in certifiable" :key="item.id" :value="item.id">{{ item.recordDate }} · {{ item.quantity }} {{ item.unit }}</option></select></label>
        <label>Ngày ghi nhận<input v-model="form.recordDate" type="date" required /></label>
        <label>Khối lượng<input v-model.trim="form.quantity" required inputmode="decimal" placeholder="VD: 1250.5000" /></label>
        <label>Đơn vị<input v-model.trim="form.unit" required maxlength="40" /></label>
        <label>Source key<input v-model.trim="form.sourceKey" required :maxlength="SOURCE_KEY_MAX_LENGTH" placeholder="Khóa chống trùng, 8–200 ký tự" /></label>
        <label>WBS node<input v-model.trim="form.wbsNodeId" placeholder="UUID (không bắt buộc)" /></label>
        <label v-if="form.role === 'CORRECTION'" class="form-wide">Lý do đính chính (bắt buộc)<textarea v-model="form.reason" required rows="2" maxlength="2000"></textarea></label>
        <label class="form-wide">Bằng chứng (mỗi dòng một tham chiếu)<textarea v-model="form.evidenceText" rows="2"></textarea></label>
        <div class="form-actions form-wide">
          <el-button native-type="submit" type="primary" :loading="busy">Ghi thêm dòng</el-button>
        </div>
      </form>

      <div v-if="!records.length" class="empty-panel">
        <h3>Phiên này chưa ghi dòng khối lượng nào</h3>
        <p>Catalog chưa có API đọc sổ khối lượng; bảng dưới chỉ hiển thị các dòng phiên này đã ghi.</p>
      </div>
      <div v-else class="table-shell">
        <table class="data-table quantity-table">
          <thead>
            <tr>
              <th>Vai trò</th>
              <th>Ngày</th>
              <th>Khối lượng</th>
              <th>Tham chiếu gốc</th>
              <th>Lý do</th>
              <th>Source key</th>
              <th>Bằng chứng</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in records" :key="row.id" :data-role="roleOf(row)">
              <td><span class="ledger-role-chip" :data-role="roleOf(row)">{{ ROLE_LABEL[roleOf(row)] }}</span></td>
              <td>{{ row.recordDate }}</td>
              <td class="money">{{ formatQuantity(row.quantity) }} {{ row.unit }}</td>
              <td>{{ row.correctionOfId ?? row.certificationOfId ?? '—' }}</td>
              <td>{{ row.reason ?? '—' }}</td>
              <td>{{ row.sourceKey }}</td>
              <td>
                <ul v-if="row.evidenceRefs.length" class="reference-list">
                  <li v-for="reference in row.evidenceRefs" :key="reference">{{ reference }}</li>
                </ul>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="ledger-append-note">
        Sổ append-only: một dòng sai không bị sửa mà được đính chính bằng dòng mới, và cả hai đều ở
        lại trong sổ.
      </p>
    </template>
  </section>
</template>
