<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import InvestmentScenarioPanel from './InvestmentScenarioPanel.vue';
import { formatMoney } from '@/constants/contracts';
import {
  convertEligible, nextStages, OPPORTUNITY_STAGE_LABEL, PROJECT_TYPE_LABEL, PROJECT_TYPES,
  OPPORTUNITY_CURRENCY_PATTERN, SURVEY_DATA_QUALITIES, SURVEY_DATA_QUALITY_LABEL
} from '@/constants/opportunity';
import type {
  ConvertOpportunityRequest, ConvertOpportunityView, CreateInvestmentScenarioRequest,
  CreateSurveyPackageRequest, InvestmentScenarioProjection, OpportunityStage, OpportunityView,
  ProjectType, SubmitInvestmentScenarioRequest, SurveyDataQuality, SurveyPackageView
} from '@/types/opportunity.types';

/**
 * API-028…API-033 detail for one opportunity.
 *
 * Two honesty rules the panel enforces in what it renders:
 *
 * 1. **No approve control.** V1 has no operation that approves an opportunity. Submit (API-032)
 *    records the decision request on the aggregate because the DB-071 engine cannot host a
 *    pre-project target; APPROVED, RETURNED and REJECTED are therefore unreachable through the API
 *    and are only ever displayed, never offered.
 * 2. **Convert only when the API says the stage allows it.** Eligibility mirrors
 *    `assertConvertEligible`: stage APPROVED, or a scenario whose projected status is APPROVED.
 *    The button appears when the loaded data satisfies that, and not on a hunch. A replayed
 *    convert comes back `alreadyConverted: true` — that is reported as "đã chuyển đổi", with the
 *    existing project, because it is a success.
 */
const props = defineProps<{
  opportunity: OpportunityView;
  surveys: SurveyPackageView[];
  scenarios: InvestmentScenarioProjection[];
  /** Set from the last API-033 response so a replay can be described honestly. */
  conversion: ConvertOpportunityView | null;
  busy: boolean;
  permissions: {
    update: boolean;
    createSurvey: boolean;
    createScenario: boolean;
    submitScenario: boolean;
    convert: boolean;
  };
}>();
const emit = defineEmits<{
  close: [];
  advanceStage: [stage: OpportunityStage];
  createSurvey: [input: CreateSurveyPackageRequest];
  createScenario: [input: CreateInvestmentScenarioRequest];
  submitScenario: [scenarioId: string, input: SubmitInvestmentScenarioRequest];
  convert: [input: ConvertOpportunityRequest];
}>();

const error = ref('');
const showSurvey = ref(false);
const showConvert = ref(false);
const surveyForm = reactive({
  dataQuality: 'RAW' as SurveyDataQuality, documentRefsText: '', notes: ''
});
const convertForm = reactive({
  portfolioId: '', ownerLegalEntityId: '', customerCompanyId: '', projectManagerId: '',
  projectCode: '', projectName: '', projectType: 'SOLAR' as ProjectType, contractModel: 'EPC',
  currency: 'VND', plannedCod: '', siteCode: '', siteName: '', siteLocation: '',
  siteTimezone: 'Asia/Ho_Chi_Minh'
});

const stageOptions = computed(() => nextStages(props.opportunity));
const canConvert = computed(
  () => props.permissions.convert && convertEligible(props.opportunity, props.scenarios)
);
const alreadyConverted = computed(() => props.opportunity.convertedProjectId !== null);

watch(() => props.opportunity, () => {
  error.value = '';
  showSurvey.value = false;
  showConvert.value = false;
});

function parseRefs(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function submitSurvey(): void {
  error.value = '';
  const documentRefs = parseRefs(surveyForm.documentRefsText);
  emit('createSurvey', {
    dataQuality: surveyForm.dataQuality,
    ...(documentRefs.length ? { documentRefs } : {}),
    ...(surveyForm.notes.trim() ? { notes: surveyForm.notes.trim() } : {})
  });
  showSurvey.value = false;
}

function submitConvert(): void {
  error.value = '';
  if (!convertForm.portfolioId.trim() || !convertForm.ownerLegalEntityId.trim()) {
    error.value = 'Chuyển đổi cần Portfolio và pháp nhân sở hữu.';
    return;
  }
  if (!OPPORTUNITY_CURRENCY_PATTERN.test(convertForm.currency.trim())) {
    error.value = 'Loại tiền của dự án phải là mã 3 chữ cái viết hoa.';
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(convertForm.plannedCod)) {
    error.value = 'COD kế hoạch phải theo định dạng YYYY-MM-DD.';
    return;
  }
  if (!convertForm.siteCode.trim() || !convertForm.siteName.trim()
    || !convertForm.siteTimezone.trim()) {
    error.value = 'Dự án bắt buộc có site chính: mã, tên và múi giờ.';
    return;
  }
  if (props.opportunity.customerCompanyId === null && !convertForm.customerCompanyId.trim()) {
    error.value = 'Cơ hội chưa có khách hàng; cần khai báo khách hàng để tạo dự án.';
    return;
  }
  emit('convert', {
    portfolioId: convertForm.portfolioId.trim(),
    ownerLegalEntityId: convertForm.ownerLegalEntityId.trim(),
    projectType: convertForm.projectType, contractModel: convertForm.contractModel.trim(),
    currency: convertForm.currency.trim().toUpperCase(), plannedCod: convertForm.plannedCod,
    primarySite: {
      code: convertForm.siteCode.trim(), name: convertForm.siteName.trim(),
      timezone: convertForm.siteTimezone.trim(),
      ...(convertForm.siteLocation.trim() ? { location: convertForm.siteLocation.trim() } : {})
    },
    ...(convertForm.customerCompanyId.trim() ? { customerCompanyId: convertForm.customerCompanyId.trim() } : {}),
    ...(convertForm.projectManagerId.trim() ? { projectManagerId: convertForm.projectManagerId.trim() } : {}),
    ...(convertForm.projectCode.trim() ? { projectCode: convertForm.projectCode.trim() } : {}),
    ...(convertForm.projectName.trim() ? { projectName: convertForm.projectName.trim() } : {})
  });
  showConvert.value = false;
}
</script>

<template>
  <section class="opportunity-panel opportunity-detail" aria-labelledby="opportunity-detail-title">
    <div class="detail-heading">
      <div>
        <small>OPPORTUNITY · API-028</small>
        <h2 id="opportunity-detail-title">{{ opportunity.code }} · {{ opportunity.name }}</h2>
        <p class="lead">
          {{ OPPORTUNITY_STAGE_LABEL[opportunity.stage] }} · version {{ opportunity.versionNo }}
        </p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <div class="fact-grid">
      <div><span>Công suất dự kiến</span><strong class="money">{{ opportunity.expectedCapacityKwp === null ? 'Chưa khai báo' : `${formatMoney(opportunity.expectedCapacityKwp)} kWp` }}</strong></div>
      <div><span>Khách hàng</span><strong>{{ opportunity.customerCompanyId ?? 'Chưa gắn' }}</strong></div>
      <div><span>Địa điểm</span><strong>{{ opportunity.locationText ?? 'Chưa khai báo' }}</strong></div>
      <div><span>Người phụ trách</span><strong>{{ opportunity.ownerId }}</strong></div>
      <div><span>Khóa trùng lặp</span><code>{{ opportunity.duplicateKey ?? 'không tính được' }}</code></div>
      <div><span>Dự án đã chuyển đổi</span><strong>{{ opportunity.convertedProjectId ?? 'Chưa chuyển đổi' }}</strong></div>
    </div>

    <div v-if="permissions.update && stageOptions.length" class="stage-advance">
      <span>Chuyển giai đoạn hợp lệ kế tiếp:</span>
      <el-button
        v-for="stage in stageOptions"
        :key="stage"
        :loading="busy"
        @click="emit('advanceStage', stage)"
      >
        → {{ OPPORTUNITY_STAGE_LABEL[stage] }}
      </el-button>
    </div>
    <p v-else-if="permissions.update" class="muted-inline" data-testid="stage-locked-note">
      Giai đoạn {{ OPPORTUNITY_STAGE_LABEL[opportunity.stage] }} không có bước chuyển trực tiếp nào:
      các giai đoạn còn lại do lệnh sở hữu (trình kịch bản, chuyển đổi) hoặc do quyết định phê duyệt
      mà API V1 chưa thực hiện được.
    </p>

    <section class="survey-list" aria-labelledby="survey-list-title">
      <div class="section-heading">
        <div>
          <h3 id="survey-list-title">Gói khảo sát</h3>
          <p>API-030. Revision do server cấp; bản APPROVED trở thành bất biến ngay khi ghi.</p>
        </div>
        <el-button v-if="permissions.createSurvey" @click="showSurvey = !showSurvey">Thêm revision</el-button>
      </div>

      <form v-if="showSurvey && permissions.createSurvey" class="opportunity-inline-form" @submit.prevent="submitSurvey">
        <label>
          Chất lượng dữ liệu
          <select v-model="surveyForm.dataQuality" aria-label="Chất lượng dữ liệu khảo sát">
            <option v-for="item in SURVEY_DATA_QUALITIES" :key="item" :value="item">{{ SURVEY_DATA_QUALITY_LABEL[item] }}</option>
          </select>
        </label>
        <label class="form-wide">
          Tham chiếu tài liệu (mỗi dòng một tham chiếu)
          <textarea v-model="surveyForm.documentRefsText" rows="2"></textarea>
        </label>
        <label class="form-wide">Ghi chú<textarea v-model="surveyForm.notes" rows="2" maxlength="4000"></textarea></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="showSurvey = false">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Lưu revision</el-button>
        </div>
      </form>

      <ol v-if="surveys.length" class="survey-revisions">
        <li v-for="survey in surveys" :key="survey.id">
          <div>
            <strong>Revision #{{ survey.revision }}</strong>
            <span class="status-pill" :data-status="survey.dataQuality">{{ SURVEY_DATA_QUALITY_LABEL[survey.dataQuality] }}</span>
          </div>
          <p>{{ survey.notes ?? 'Không có ghi chú' }}</p>
          <small>{{ survey.documentRefs.length }} tham chiếu tài liệu · {{ new Date(survey.createdAt).toLocaleString('vi-VN') }}</small>
        </li>
      </ol>
      <p v-else class="muted-inline">Chưa có gói khảo sát nào.</p>
    </section>

    <InvestmentScenarioPanel
      :opportunity="opportunity"
      :scenarios="scenarios"
      :busy="busy"
      :can-create="permissions.createScenario"
      :can-submit="permissions.submitScenario"
      @create="(input) => emit('createScenario', input)"
      @submit="(scenarioId, input) => emit('submitScenario', scenarioId, input)"
    />

    <section class="convert-section" aria-labelledby="convert-title">
      <div class="section-heading">
        <div>
          <h3 id="convert-title">Chuyển đổi thành dự án</h3>
          <p>API-033. Dự án sinh ra ở INITIATION/DRAFT kèm site chính bắt buộc.</p>
        </div>
        <el-button v-if="canConvert && !alreadyConverted" @click="showConvert = !showConvert">
          Chuyển thành dự án
        </el-button>
      </div>

      <p v-if="alreadyConverted" class="immutable-banner" data-testid="already-converted-note">
        <strong>Đã chuyển đổi.</strong>
        Cơ hội này đã trở thành dự án <code>{{ opportunity.convertedProjectId }}</code>. Gọi lại lệnh
        chuyển đổi sẽ trả về đúng dự án đó — đây là kết quả thành công, không phải lỗi.
      </p>
      <p v-else-if="permissions.convert" class="muted-inline" data-testid="convert-gate-note">
        Chỉ cơ hội đã được phê duyệt (hoặc có kịch bản được phê duyệt) mới chuyển đổi được. API V1
        không có thao tác phê duyệt nào, nên nút chuyển đổi chỉ xuất hiện khi dữ liệu tải về đã ở
        trạng thái đó.
      </p>

      <div v-if="conversion" class="conversion-result" data-testid="conversion-result">
        <strong>
          {{ conversion.alreadyConverted ? 'Đã chuyển đổi trước đó' : 'Chuyển đổi thành công' }}
        </strong>
        <p>Dự án {{ conversion.code }} · {{ conversion.name }} ({{ conversion.phase }}/{{ conversion.recordStatus }})</p>
        <p>Site chính: {{ conversion.sites.map((site) => site.code).join(', ') || 'không có' }}</p>
      </div>

      <form v-if="showConvert && canConvert && !alreadyConverted" class="opportunity-inline-form" @submit.prevent="submitConvert">
        <label>Portfolio (UUID)<input v-model.trim="convertForm.portfolioId" required /></label>
        <label>Pháp nhân sở hữu (UUID)<input v-model.trim="convertForm.ownerLegalEntityId" required /></label>
        <label>Khách hàng (UUID)<input v-model.trim="convertForm.customerCompanyId" :required="opportunity.customerCompanyId === null" /></label>
        <label>Project Manager (UUID)<input v-model.trim="convertForm.projectManagerId" /></label>
        <label>Mã dự án<input v-model.trim="convertForm.projectCode" placeholder="Bỏ trống để dùng mã cơ hội" /></label>
        <label>Tên dự án<input v-model.trim="convertForm.projectName" placeholder="Bỏ trống để dùng tên cơ hội" /></label>
        <label>
          Loại dự án
          <select v-model="convertForm.projectType" aria-label="Loại dự án">
            <option v-for="item in PROJECT_TYPES" :key="item" :value="item">{{ PROJECT_TYPE_LABEL[item] }}</option>
          </select>
        </label>
        <label>Mô hình hợp đồng<input v-model.trim="convertForm.contractModel" required maxlength="80" /></label>
        <label>Loại tiền<input v-model.trim="convertForm.currency" required maxlength="3" /></label>
        <label>COD kế hoạch<input v-model="convertForm.plannedCod" type="date" required /></label>
        <label>Mã site chính<input v-model.trim="convertForm.siteCode" required maxlength="64" /></label>
        <label>Tên site chính<input v-model.trim="convertForm.siteName" required maxlength="200" /></label>
        <label>Múi giờ site<input v-model.trim="convertForm.siteTimezone" required maxlength="100" /></label>
        <label class="form-wide">Vị trí site<input v-model.trim="convertForm.siteLocation" maxlength="500" /></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="showConvert = false">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">Chuyển thành dự án</el-button>
        </div>
      </form>
    </section>
  </section>
</template>
