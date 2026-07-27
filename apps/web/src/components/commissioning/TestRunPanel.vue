<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  TEST_RUN_RESULT_LABEL, TEST_RUN_RESULTS, TEST_RUN_STATUS_LABEL, canRetest, isRunFrozen
} from '@/constants/commissioning';
import type {
  CompleteTestRunRequest, CreateRetestRequest, StartTestRunRequest, TestPackView, TestRunResult,
  TestRunView
} from '@/types/commissioning.types';

const props = defineProps<{
  pack: TestPackView | null;
  runs: TestRunView[];
  busy: boolean;
  permissions: { start: boolean; complete: boolean; retest: boolean };
}>();
const emit = defineEmits<{
  start: [testPackId: string, input: StartTestRunRequest];
  complete: [testRunId: string, input: CompleteTestRunRequest];
  retest: [testRunId: string, input: CreateRetestRequest];
}>();

const error = ref('');
const completing = ref<TestRunView | null>(null);
const retesting = ref<TestRunView | null>(null);
const startForm = reactive({ prerequisitesText: '' });
const completeForm = reactive({
  result: 'PASSED' as TestRunResult, evidenceText: '', rawDataRef: ''
});
const retestForm = reactive({ reason: '', prerequisitesText: '' });

const runsOfPack = computed(() => props.pack === null
  ? []
  : [...props.runs.filter((run) => run.testPackId === props.pack!.id)]
    .sort((left, right) => left.runNo - right.runNo));

const runById = computed(() => new Map(props.runs.map((run) => [run.id, run])));

/** `uq_test_run_open`: một test pack chỉ được có đúng một lần chạy chưa ghi kết quả. */
const openRun = computed(() => runsOfPack.value.find((run) => run.status === 'IN_PROGRESS') ?? null);

/** `uq_test_run_retest_once`: mỗi lần chạy chỉ được chạy lại một lần. */
function hasRetest(run: TestRunView): boolean {
  return props.runs.some((item) => item.previousRunId === run.id);
}

/**
 * Kết quả đã ghi là lịch sử: trigger đóng băng cả hàng, nên màn hình không được có bất kỳ lối nào
 * để "sửa cho đạt". Đường đi tiếp duy nhất từ một lần chạy Không đạt là chạy lại — và chạy lại là
 * một HÀNG MỚI trỏ ngược về lần thất bại; lần thất bại ở lại vĩnh viễn.
 */
function retestable(run: TestRunView): boolean {
  return props.permissions.retest && canRetest(run) && !hasRetest(run) && openRun.value === null;
}

function previousLabel(run: TestRunView): string | null {
  if (run.previousRunId === null) return null;
  const previous = runById.value.get(run.previousRunId);
  return previous ? `#${previous.runNo}` : run.previousRunId;
}

function parseLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

// Một trang vừa tải lại không được giữ form ghi kết quả mở trên một hàng có thể đã bị đóng băng.
watch(() => props.runs, () => { completing.value = null; retesting.value = null; });

function openComplete(run: TestRunView): void {
  completing.value = run;
  retesting.value = null;
  error.value = '';
  completeForm.result = 'PASSED';
  completeForm.evidenceText = '';
  completeForm.rawDataRef = '';
}

function openRetest(run: TestRunView): void {
  retesting.value = run;
  completing.value = null;
  error.value = '';
  retestForm.reason = '';
  retestForm.prerequisitesText = '';
}

function submitStart(): void {
  error.value = '';
  const pack = props.pack;
  if (!pack) {
    error.value = 'Chọn một test pack trước khi bắt đầu lần chạy.';
    return;
  }
  const satisfiedPrerequisites = parseLines(startForm.prerequisitesText);
  emit('start', pack.id, {
    ...(satisfiedPrerequisites.length ? { satisfiedPrerequisites } : {})
  });
}

function submitComplete(): void {
  const run = completing.value;
  if (!run) return;
  error.value = '';
  const evidenceRefs = parseLines(completeForm.evidenceText);
  if (!evidenceRefs.length) {
    error.value = 'Ghi nhận kết quả phải kèm ít nhất một bằng chứng, dù kết quả là gì.';
    return;
  }
  emit('complete', run.id, {
    expectedVersion: run.versionNo, result: completeForm.result, evidenceRefs,
    ...(completeForm.rawDataRef.trim() ? { rawDataRef: completeForm.rawDataRef.trim() } : {})
  });
  completing.value = null;
}

function submitRetest(): void {
  const run = retesting.value;
  if (!run) return;
  error.value = '';
  if (retestForm.reason.trim().length < 3) {
    error.value = 'Lý do chạy lại phải có ít nhất 3 ký tự.';
    return;
  }
  const satisfiedPrerequisites = parseLines(retestForm.prerequisitesText);
  emit('retest', run.id, {
    reason: retestForm.reason.trim(),
    ...(satisfiedPrerequisites.length ? { satisfiedPrerequisites } : {})
  });
  retesting.value = null;
}
</script>

<template>
  <section class="commissioning-panel test-run-panel" aria-labelledby="test-run-panel-title">
    <div class="detail-heading">
      <div>
        <small>TEST RUN · API-101…103 · DB-075</small>
        <h2 id="test-run-panel-title">Lần chạy thử nghiệm</h2>
        <p class="lead">
          Kết quả được ghi đúng một lần rồi hàng bị đóng băng. Không có thao tác sửa kết quả — một
          lần chạy Không đạt chỉ đi tiếp bằng lần chạy lại, và lần chạy lại là một hàng mới.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p v-if="!pack" class="commissioning-note">Chọn một test pack để xem các lần chạy của nó.</p>
    <template v-else>
      <div v-if="!runsOfPack.length" class="empty-panel">
        <h3>Test pack {{ pack.code }} chưa có lần chạy nào</h3>
        <p>Bắt đầu một lần chạy khi mọi điều kiện tiên quyết đã được đáp ứng.</p>
      </div>
      <div v-else class="table-shell">
        <table class="data-table commissioning-table test-run-table">
          <thead>
            <tr>
              <th>Lần chạy</th>
              <th>Trạng thái</th>
              <th>Kết quả</th>
              <th>Bằng chứng</th>
              <th>Chạy lại của</th>
              <th><span class="sr-only">Hành động</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="run in runsOfPack"
              :key="run.id"
              :data-frozen="isRunFrozen(run)"
              :data-result="run.result ?? ''"
            >
              <td><strong>#{{ run.runNo }}</strong><span>{{ run.startedAt }}</span></td>
              <td>
                <span class="status-pill" :data-status="run.status">{{ TEST_RUN_STATUS_LABEL[run.status] }}</span>
                <span v-if="isRunFrozen(run)" class="run-frozen-flag">Bất biến · chỉ đọc</span>
              </td>
              <td>
                <span v-if="run.result" class="status-pill" :data-status="run.result">{{ TEST_RUN_RESULT_LABEL[run.result] }}</span>
                <span v-else>Chưa ghi nhận</span>
              </td>
              <td>{{ run.evidenceRefs.length ? run.evidenceRefs.join(', ') : '—' }}</td>
              <td>
                <span v-if="previousLabel(run)" class="run-retest-of">
                  Chạy lại của {{ previousLabel(run) }}
                </span>
                <span v-else>—</span>
              </td>
              <td>
                <el-button
                  v-if="run.status === 'IN_PROGRESS' && permissions.complete"
                  text
                  @click="openComplete(run)"
                >
                  Ghi kết quả
                </el-button>
                <el-button v-else-if="retestable(run)" text @click="openRetest(run)">
                  Tạo lần chạy lại
                </el-button>
                <span v-else-if="isRunFrozen(run) && hasRetest(run)" class="run-locked-note">
                  Đã có lần chạy lại
                </span>
                <span v-else-if="isRunFrozen(run)" class="run-locked-note">
                  Kết quả đã đóng băng
                </span>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form
        v-if="permissions.start && !openRun"
        class="commissioning-form test-run-start-form"
        @submit.prevent="submitStart"
      >
        <h3 class="form-wide">Bắt đầu lần chạy (API-101)</h3>
        <label class="form-wide">Điều kiện tiên quyết đã đáp ứng (mỗi dòng một mã)<textarea v-model="startForm.prerequisitesText" rows="3"></textarea></label>
        <el-button native-type="submit" type="primary" :loading="busy">Bắt đầu chạy</el-button>
      </form>
      <p v-else-if="permissions.start" class="commissioning-note">
        Test pack này đang có một lần chạy chưa ghi kết quả — chỉ được mở một lần chạy tại một thời điểm.
      </p>

      <form v-if="completing" class="commissioning-form test-run-complete-form" @submit.prevent="submitComplete">
        <h3 class="form-wide">Ghi kết quả lần chạy #{{ completing.runNo }} (API-102)</h3>
        <p class="commissioning-note form-wide">
          Ghi một lần duy nhất. Sau khi ghi, hàng này trở thành lịch sử và không sửa được nữa.
        </p>
        <label>Kết quả<select v-model="completeForm.result" aria-label="Kết quả lần chạy"><option v-for="item in TEST_RUN_RESULTS" :key="item" :value="item">{{ TEST_RUN_RESULT_LABEL[item] }}</option></select></label>
        <label>Tham chiếu dữ liệu thô<input v-model.trim="completeForm.rawDataRef" maxlength="500" /></label>
        <label class="form-wide">Bằng chứng (bắt buộc, mỗi dòng một tham chiếu)<textarea v-model="completeForm.evidenceText" required rows="3"></textarea></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="completing = null">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Ghi kết quả</el-button>
        </div>
      </form>

      <form v-if="retesting" class="commissioning-form test-run-retest-form" @submit.prevent="submitRetest">
        <h3 class="form-wide">Tạo lần chạy lại từ #{{ retesting.runNo }} (API-103)</h3>
        <p class="commissioning-note form-wide">
          Lần chạy lại là một hàng mới trỏ về #{{ retesting.runNo }}. Kết quả
          {{ retesting.result ? TEST_RUN_RESULT_LABEL[retesting.result] : '' }} của lần chạy đó
          không thay đổi.
        </p>
        <label class="form-wide">Lý do chạy lại<textarea v-model="retestForm.reason" required rows="2" maxlength="2000"></textarea></label>
        <label class="form-wide">Điều kiện tiên quyết đã đáp ứng (mỗi dòng một mã)<textarea v-model="retestForm.prerequisitesText" rows="3"></textarea></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="retesting = null">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Tạo lần chạy lại</el-button>
        </div>
      </form>
    </template>
  </section>
</template>
