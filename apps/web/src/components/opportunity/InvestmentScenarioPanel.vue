<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { formatMoney } from '@/constants/contracts';
import {
  OPPORTUNITY_CURRENCY_PATTERN, OPPORTUNITY_MONEY_PATTERN, OPPORTUNITY_RATE_PATTERN,
  OPPORTUNITY_SIGNED_MONEY_PATTERN, PAYBACK_MONTHS_PATTERN, SCENARIO_CREATABLE_STAGES,
  SCENARIO_STATUS_LABEL, SCENARIO_SUBMITTABLE_STATUSES, SCENARIO_TYPE_LABEL, SCENARIO_TYPES,
  SUBMIT_ELIGIBLE_STAGES
} from '@/constants/opportunity';
import type {
  CreateInvestmentScenarioRequest, InvestmentScenarioProjection, InvestmentScenarioType,
  OpportunityView, SubmitInvestmentScenarioRequest
} from '@/types/opportunity.types';

/**
 * API-031/API-032 — investment scenarios.
 *
 * THE FINANCIALS ARE EVIDENCE, NOT A CALCULATION. DB-016 stores NPV, IRR, capex and payback
 * exactly as the client supplied them, together with the `formulaVersion` that produced them; no
 * approved formula catalog exists and AGENTS.md §3 forbids inventing one. So:
 *
 * - the stored strings are displayed verbatim (grouped for legibility only, never rounded);
 * - `formulaVersion` is shown next to every figure, because a number without the formula behind it
 *   is not a decision input;
 * - nothing here recomputes, cross-checks or derives any of them. A payback that disagrees with
 *   the NPV is the analyst's problem to explain, not this component's to silently "fix".
 *
 * There is also no approve/reject control. API-032 records submission on the aggregate — the
 * DB-071 engine structurally cannot host a pre-project workflow target — and no V1 operation
 * approves a scenario. Rendering an approve button would promise a decision the platform cannot
 * make.
 */
const props = defineProps<{
  opportunity: OpportunityView;
  scenarios: InvestmentScenarioProjection[];
  busy: boolean;
  canCreate: boolean;
  canSubmit: boolean;
}>();
const emit = defineEmits<{
  create: [input: CreateInvestmentScenarioRequest];
  submit: [scenarioId: string, input: SubmitInvestmentScenarioRequest];
}>();

const error = ref('');
const showCreate = ref(false);
const submitting = ref<InvestmentScenarioProjection | null>(null);
const submitComment = ref('');
const form = reactive({
  scenarioType: 'SOLAR' as InvestmentScenarioType, currency: 'VND', capexTotal: '', npv: '',
  irr: '', paybackMonths: '', formulaVersion: '', inputSnapshotText: '{\n  \n}'
});

const stageAllowsCreate = computed(
  () => SCENARIO_CREATABLE_STAGES.includes(props.opportunity.stage)
);
const stageAllowsSubmit = computed(
  () => SUBMIT_ELIGIBLE_STAGES.includes(props.opportunity.stage)
);

/** Only a DRAFT/RETURNED scenario in an eligible stage can be submitted; the server agrees. */
function submittable(scenario: InvestmentScenarioProjection): boolean {
  return props.canSubmit && stageAllowsSubmit.value
    && SCENARIO_SUBMITTABLE_STATUSES.includes(scenario.storedStatus);
}

function openSubmit(scenario: InvestmentScenarioProjection): void {
  submitting.value = scenario;
  submitComment.value = '';
  error.value = '';
}

function confirmSubmit(): void {
  const scenario = submitting.value;
  if (!scenario) return;
  const comment = submitComment.value.trim();
  emit('submit', scenario.id, {
    expectedVersion: scenario.versionNo, ...(comment ? { comment } : {})
  });
  submitting.value = null;
}

function submitCreate(): void {
  error.value = '';
  if (!OPPORTUNITY_CURRENCY_PATTERN.test(form.currency.trim())) {
    error.value = 'Loại tiền phải là mã 3 chữ cái viết hoa (VD: VND).';
    return;
  }
  if (form.formulaVersion.trim().length < 1) {
    error.value = 'Phải khai báo formulaVersion — con số tài chính không có công thức là vô nghĩa.';
    return;
  }
  const capexTotal = form.capexTotal.trim();
  if (capexTotal && !OPPORTUNITY_MONEY_PATTERN.test(capexTotal)) {
    error.value = 'CAPEX phải là số thập phân dạng chuỗi, tối đa 4 chữ số phần lẻ.';
    return;
  }
  const npv = form.npv.trim();
  if (npv && !OPPORTUNITY_SIGNED_MONEY_PATTERN.test(npv)) {
    error.value = 'NPV phải là số thập phân dạng chuỗi (được phép âm), tối đa 4 chữ số phần lẻ.';
    return;
  }
  const irr = form.irr.trim();
  if (irr && !OPPORTUNITY_RATE_PATTERN.test(irr)) {
    error.value = 'IRR phải là số dạng chuỗi (được phép âm), tối đa 6 chữ số phần lẻ.';
    return;
  }
  const payback = form.paybackMonths.trim();
  if (payback && !PAYBACK_MONTHS_PATTERN.test(payback)) {
    error.value = 'Thời gian hoàn vốn phải là số nguyên tháng.';
    return;
  }
  let inputSnapshot: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(form.inputSnapshotText || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    inputSnapshot = parsed as Record<string, unknown>;
  } catch {
    error.value = 'Input snapshot phải là một object JSON hợp lệ.';
    return;
  }
  emit('create', {
    scenarioType: form.scenarioType, currency: form.currency.trim().toUpperCase(),
    formulaVersion: form.formulaVersion.trim(), inputSnapshot,
    ...(capexTotal ? { capexTotal } : {}),
    ...(npv ? { npv } : {}),
    ...(irr ? { irr } : {}),
    // The one integer on this form. DB-016 stores the payback as a whole month count, so it is
    // parsed here after a digits-only guard — every decimal field above stays text end to end.
    ...(payback ? { paybackMonths: Number.parseInt(payback, 10) } : {})
  });
  showCreate.value = false;
}
</script>

<template>
  <section class="opportunity-panel scenario-panel" aria-labelledby="scenario-panel-title">
    <div class="detail-heading">
      <div>
        <small>INVESTMENT SCENARIO · API-031/032</small>
        <h2 id="scenario-panel-title">Kịch bản đầu tư</h2>
        <p class="lead">Số liệu tài chính do client cung cấp, lưu nguyên văn kèm phiên bản công thức.</p>
      </div>
      <el-button v-if="canCreate && stageAllowsCreate" @click="showCreate = !showCreate">
        Thêm kịch bản
      </el-button>
    </div>

    <p class="local-only-banner" data-testid="scenario-evidence-note">
      <strong>Bằng chứng, không phải phép tính.</strong>
      Server không tính bất kỳ chỉ số tài chính nào và trình duyệt cũng không. NPV, IRR, CAPEX và
      thời gian hoàn vốn hiển thị đúng giá trị đã lưu, kèm <code>formulaVersion</code> đã tạo ra
      chúng.
    </p>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p v-if="canCreate && !stageAllowsCreate" class="muted-inline">
      Chỉ cơ hội ở giai đoạn SURVEYED, SCENARIO_READY hoặc RETURNED mới nhận kịch bản mới.
    </p>

    <form v-if="showCreate && canCreate && stageAllowsCreate" class="opportunity-inline-form" @submit.prevent="submitCreate">
      <label>
        Loại kịch bản
        <select v-model="form.scenarioType" aria-label="Loại kịch bản">
          <option v-for="item in SCENARIO_TYPES" :key="item" :value="item">{{ SCENARIO_TYPE_LABEL[item] }}</option>
        </select>
      </label>
      <label>Loại tiền<input v-model.trim="form.currency" required maxlength="3" placeholder="VND" /></label>
      <label>Phiên bản công thức<input v-model.trim="form.formulaVersion" required maxlength="40" placeholder="fin-model-v3" /></label>
      <label>CAPEX (chuỗi)<input v-model.trim="form.capexTotal" inputmode="decimal" placeholder="182500000000.25" /></label>
      <label>NPV (chuỗi, có thể âm)<input v-model.trim="form.npv" inputmode="decimal" placeholder="-1250000.5" /></label>
      <label>IRR (chuỗi, có thể âm)<input v-model.trim="form.irr" inputmode="decimal" placeholder="12.457" /></label>
      <label>Hoàn vốn (số tháng)<input v-model.trim="form.paybackMonths" inputmode="numeric" placeholder="84" /></label>
      <label class="form-wide">
        Input snapshot (JSON object — bằng chứng đầu vào)
        <textarea v-model="form.inputSnapshotText" rows="3"></textarea>
      </label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showCreate = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Lưu kịch bản</el-button>
      </div>
    </form>

    <div v-if="!scenarios.length" class="empty-panel">
      <h3>Chưa có kịch bản đầu tư</h3>
      <p>Cơ hội chưa ghi nhận phiên bản kịch bản nào.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table scenario-table">
        <thead>
          <tr>
            <th>Kịch bản</th>
            <th>Trạng thái</th>
            <th>CAPEX</th>
            <th>NPV</th>
            <th>IRR</th>
            <th>Hoàn vốn</th>
            <th>Phiên bản công thức</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="scenario in scenarios" :key="scenario.id" :data-status="scenario.status">
            <td>
              <strong>{{ SCENARIO_TYPE_LABEL[scenario.scenarioType] }} v{{ scenario.version }}</strong>
              <span>{{ scenario.currency }}</span>
            </td>
            <td><span class="status-pill" :data-status="scenario.status">{{ SCENARIO_STATUS_LABEL[scenario.status] }}</span></td>
            <td class="money">{{ scenario.capexTotal === null ? 'Không khai báo' : formatMoney(scenario.capexTotal) }}</td>
            <td class="money" data-testid="scenario-npv">{{ scenario.npv === null ? 'Không khai báo' : formatMoney(scenario.npv) }}</td>
            <td class="money" data-testid="scenario-irr">{{ scenario.irr ?? 'Không khai báo' }}</td>
            <td data-testid="scenario-payback">
              {{ scenario.paybackMonths === null ? 'Không khai báo' : `${scenario.paybackMonths} tháng` }}
            </td>
            <td><code data-testid="scenario-formula-version">{{ scenario.formulaVersion }}</code></td>
            <td>
              <el-button v-if="submittable(scenario)" text @click="openSubmit(scenario)">Trình duyệt</el-button>
              <span v-else-if="scenario.storedStatus === 'SUBMITTED'">Đang chờ quyết định</span>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="muted-inline" data-testid="scenario-no-approve-note">
      V1 không có thao tác phê duyệt/từ chối kịch bản qua API: submit chỉ ghi nhận trên chính bản
      ghi vì engine phê duyệt (DB-071) chưa nhận mục tiêu tiền-dự-án. Vì vậy màn hình này không
      hiển thị nút phê duyệt.
    </p>

    <form v-if="submitting" class="opportunity-inline-form" @submit.prevent="confirmSubmit">
      <h3 class="form-wide">
        Trình kịch bản {{ SCENARIO_TYPE_LABEL[submitting.scenarioType] }} v{{ submitting.version }}
      </h3>
      <label class="form-wide">
        Ghi chú trình duyệt (tùy chọn)
        <textarea v-model="submitComment" rows="2" maxlength="2000"></textarea>
      </label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="submitting = null">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Trình kịch bản</el-button>
      </div>
    </form>
  </section>
</template>
