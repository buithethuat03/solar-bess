<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  HOLD_POINT_PATTERN, INSPECTION_RESULTS, INSPECTION_RESULT_LABEL, INSPECTION_STATUS_LABEL,
  parseReferenceLines
} from '@/constants/field-hse';
import type {
  InspectionCommandRequest, InspectionResult, InspectionView
} from '@/types/field-hse.types';

/**
 * API-095 — hold-point inspections.
 *
 * A RECORDED inspection is frozen: the result, the evidence and the witness snapshot are written
 * exactly once and the API refuses a second RECORD with `INVALID_STATE_TRANSITION`. This panel
 * renders such a run read-only with an explicit marker and offers no editing control whatsoever —
 * the only forward move after a FAIL is a re-inspection, which the server materialises as a NEW row
 * at `sequenceNo + 1`. A PASS closes the hold point (`HOLD_POINT_ALREADY_PASSED`), so no
 * re-inspection is offered there either.
 */
const props = defineProps<{
  inspections: InspectionView[];
  busy: boolean;
  canManage: boolean;
}>();
const emit = defineEmits<{ command: [itpId: string, input: InspectionCommandRequest] }>();

const error = ref('');
const recording = ref<InspectionView | null>(null);

const requestForm = reactive({ itpId: '', holdPointRef: '' });
const recordForm = reactive({
  result: 'PASS' as InspectionResult, evidenceText: '', witnessText: ''
});

/** Newest sequence first inside each hold point, so the live run leads its own chain. */
const chains = computed(() => {
  const groups = new Map<string, InspectionView[]>();
  for (const row of props.inspections) {
    const key = `${row.itpId}::${row.holdPointRef}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, runs]) => ({
    key,
    itpId: runs[0].itpId,
    holdPointRef: runs[0].holdPointRef,
    runs: [...runs].sort((left, right) => right.sequenceNo - left.sequenceNo)
  }));
});

function frozen(run: InspectionView): boolean {
  return run.status === 'RECORDED';
}

function submitRequest(): void {
  error.value = '';
  if (!requestForm.itpId.trim()) {
    error.value = 'Nhập ITP id (lần REQUEST đầu tiên có thể dùng id của document revision đã ISSUED).';
    return;
  }
  if (!HOLD_POINT_PATTERN.test(requestForm.holdPointRef.trim())) {
    error.value = 'Hold point phải viết hoa, tối đa 80 ký tự (VD: HP-010).';
    return;
  }
  emit('command', requestForm.itpId.trim(), {
    commandType: 'REQUEST', holdPointRef: requestForm.holdPointRef.trim()
  });
}

function requestReinspection(run: InspectionView): void {
  error.value = '';
  emit('command', run.itpId, { commandType: 'REQUEST', holdPointRef: run.holdPointRef });
}

function openRecord(run: InspectionView): void {
  recording.value = run;
  recordForm.result = 'PASS';
  recordForm.evidenceText = '';
  recordForm.witnessText = '';
  error.value = '';
}

function submitRecord(): void {
  const run = recording.value;
  if (!run) return;
  error.value = '';
  const evidenceRefs = parseReferenceLines(recordForm.evidenceText);
  if (!evidenceRefs.length) {
    error.value = 'Ghi kết quả phải kèm ít nhất một bằng chứng (mỗi dòng một tham chiếu).';
    return;
  }
  const witnesses = parseReferenceLines(recordForm.witnessText).map((name) => ({ name }));
  emit('command', run.itpId, {
    commandType: 'RECORD', inspectionId: run.id, expectedVersion: run.versionNo,
    result: recordForm.result, evidenceRefs,
    ...(witnesses.length ? { witnesses } : {})
  });
  recording.value = null;
}
</script>

<template>
  <section class="quality-panel inspection-panel" aria-labelledby="inspection-panel-title">
    <div class="detail-heading">
      <div>
        <small>INSPECTION · API-095</small>
        <h2 id="inspection-panel-title">Kiểm tra hold point</h2>
        <p class="lead">
          Kết quả ghi một lần rồi đóng băng. Tái kiểm tra là một lượt mới ở trình tự kế tiếp, không
          phải sửa lượt cũ.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="canManage" class="quality-inline-form" @submit.prevent="submitRequest">
      <label>ITP id<input v-model.trim="requestForm.itpId" required placeholder="UUID của ITP hoặc document revision" /></label>
      <label>Hold point<input v-model.trim="requestForm.holdPointRef" required maxlength="80" placeholder="HP-010" /></label>
      <div class="form-actions">
        <el-button native-type="submit" type="primary" :loading="busy">Yêu cầu kiểm tra</el-button>
      </div>
    </form>

    <div v-if="!chains.length" class="empty-panel">
      <h3>Phiên này chưa có lượt kiểm tra nào</h3>
      <p>Catalog chưa có API đọc inspection; bảng dưới chỉ hiển thị các lượt phiên này đã tạo hoặc ghi.</p>
    </div>
    <div v-for="chain in chains" v-else :key="chain.key" class="inspection-chain">
      <h3>Hold point {{ chain.holdPointRef }}</h3>
      <div class="table-shell">
        <table class="data-table inspection-table">
          <thead>
            <tr>
              <th>Lượt</th>
              <th>Trạng thái</th>
              <th>Kết quả</th>
              <th>Bằng chứng</th>
              <th>Ghi bởi</th>
              <th><span class="sr-only">Hành động</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in chain.runs" :key="run.id" :data-frozen="frozen(run)" :data-result="run.result ?? 'NONE'">
              <td>
                <strong>#{{ run.sequenceNo }}</strong>
                <span v-if="run.sequenceNo > 1">Tái kiểm tra</span>
              </td>
              <td>
                <span class="status-pill" :data-status="run.status">{{ INSPECTION_STATUS_LABEL[run.status] }}</span>
                <span v-if="frozen(run)" class="inspection-frozen-flag">Chỉ đọc · không sửa được</span>
              </td>
              <td>
                <span v-if="run.result" class="inspection-result-chip" :data-result="run.result">{{ INSPECTION_RESULT_LABEL[run.result] }}</span>
                <span v-else>—</span>
              </td>
              <td>
                <ul v-if="run.evidenceRefs.length" class="reference-list">
                  <li v-for="reference in run.evidenceRefs" :key="reference">{{ reference }}</li>
                </ul>
                <span v-else>—</span>
              </td>
              <td>{{ run.recordedBy ?? '—' }}<span v-if="run.recordedAt">{{ run.recordedAt }}</span></td>
              <td>
                <el-button v-if="canManage && run.status === 'REQUESTED'" text @click="openRecord(run)">Ghi kết quả</el-button>
                <el-button v-else-if="canManage && run.result === 'FAIL'" text @click="requestReinspection(run)">Yêu cầu tái kiểm tra</el-button>
                <span v-else-if="run.result === 'PASS'">Hold point đã đạt</span>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <form v-if="recording" class="quality-inline-form inspection-record-form" @submit.prevent="submitRecord">
      <h3 class="form-wide">Ghi kết quả {{ recording.holdPointRef }} · lượt #{{ recording.sequenceNo }}</h3>
      <p class="form-wide">Kết quả ghi xong sẽ đóng băng vĩnh viễn; muốn kiểm tra lại phải mở lượt mới.</p>
      <label>Kết quả<select v-model="recordForm.result" required aria-label="Kết quả kiểm tra"><option v-for="item in INSPECTION_RESULTS" :key="item" :value="item">{{ INSPECTION_RESULT_LABEL[item] }}</option></select></label>
      <label class="form-wide">Bằng chứng (bắt buộc, mỗi dòng một tham chiếu)<textarea v-model="recordForm.evidenceText" required rows="3"></textarea></label>
      <label class="form-wide">Người chứng kiến (mỗi dòng một người)<textarea v-model="recordForm.witnessText" rows="2"></textarea></label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="recording = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Ghi kết quả</el-button>
      </div>
    </form>
  </section>
</template>
