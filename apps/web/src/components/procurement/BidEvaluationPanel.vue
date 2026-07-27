<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { CURRENCY_PATTERN, MONEY_PATTERN, formatMoney } from '@/constants/contracts';
import {
  EVALUATION_TYPE_LABEL, EVALUATION_TYPES, RFQ_STATUS_LABEL, SEALED_BID_LABEL, isBidSealed
} from '@/constants/procurement';
import { RFQ_BID_VISIBLE_STATUSES } from '@/types/procurement.types';
import type {
  CreateEvaluationRequest, EvaluationView, RfqView, SealedBidView, SubmitAwardRequest
} from '@/types/procurement.types';

const props = defineProps<{
  rfqs: RfqView[];
  bids: SealedBidView[];
  evaluations: EvaluationView[];
  busy: boolean;
  currentUserId: string | null;
  permissions: { evaluate: boolean; submitAward: boolean };
}>();
const emit = defineEmits<{
  'create-evaluation': [bidId: string, input: CreateEvaluationRequest];
  'submit-award': [rfqId: string, input: SubmitAwardRequest];
}>();

const error = ref('');
const evaluationForm = reactive({
  bidId: '', evaluationType: 'TECHNICAL' as CreateEvaluationRequest['evaluationType'],
  normalizedTotal: '', currency: '', normalizationBasis: '', overrideReason: '', notes: ''
});
const awardForm = reactive({ rfqId: '', awardedBidId: '', reason: '' });

const rfqById = computed(() => new Map(props.rfqs.map((item) => [item.id, item])));

interface BidRow {
  bid: SealedBidView;
  rfq: RfqView | null;
  sealed: boolean;
}

/**
 * Niêm phong là chuyện của TẢI TRỌNG chứ không phải của giá trị: trước khi RFQ đóng thầu, server
 * không serialize `total`/`currency`/`payloadRef` — khóa vắng mặt hoàn toàn. Vì thế hàng nào cũng
 * quyết định bằng `isBidSealed` (kiểm tra sự tồn tại của khóa), rồi in đúng một nhãn
 * "Niêm phong". In '—', '0' hay 'undefined' sẽ là một khẳng định sai về con số mà chưa ai được
 * phép thấy.
 */
const rows = computed<BidRow[]>(() => props.bids.map((bid) => ({
  bid, rfq: rfqById.value.get(bid.rfqId) ?? null, sealed: isBidSealed(bid)
})));

const sealedCount = computed(() => rows.value.filter((row) => row.sealed).length);

const evaluationsByBid = computed(() => {
  const grouped = new Map<string, EvaluationView[]>();
  for (const evaluation of props.evaluations) {
    grouped.set(evaluation.bidId, [...(grouped.get(evaluation.bidId) ?? []), evaluation]);
  }
  return grouped;
});

/** Chỉ bid thuộc RFQ đã đóng thầu mới đánh giá được — trước đó API trả 422 BID_ACCESS_DENIED. */
function evaluable(row: BidRow): boolean {
  return !row.sealed
    && row.rfq !== null
    && RFQ_BID_VISIBLE_STATUSES.includes(row.rfq.status)
    && !['AWARD_SUBMITTED', 'AWARD_APPROVED', 'REJECTED'].includes(row.rfq.status);
}

const openBids = computed(() => rows.value.filter((row) => evaluable(row)));

const awardCandidates = computed(
  () => rows.value.filter((row) => row.bid.rfqId === awardForm.rfqId)
);

const awardableRfqs = computed(() => props.rfqs.filter(
  (rfq) => ['CLOSED', 'TECHNICAL_EVALUATION', 'COMMERCIAL_EVALUATION'].includes(rfq.status)
));

/**
 * SoD API-081: ai đã chấm bất kỳ hồ sơ nào của RFQ thì không được tự trình kết quả. Chỉ những
 * đánh giá đã thấy trong phiên này mới suy ra được, nên nút bị vô hiệu kèm lý do — server vẫn là
 * nơi từ chối cuối cùng với 422 AWARD_SOD_CONFLICT.
 */
const awardSodBlocked = computed(() => {
  if (props.currentUserId === null || !awardForm.rfqId) return false;
  const bidIds = new Set(
    props.bids.filter((bid) => bid.rfqId === awardForm.rfqId).map((bid) => bid.id)
  );
  return props.evaluations.some(
    (evaluation) => bidIds.has(evaluation.bidId) && evaluation.evaluatorId === props.currentUserId
  );
});

function submitEvaluation(): void {
  error.value = '';
  if (!evaluationForm.bidId) {
    error.value = 'Chọn hồ sơ thầu đã mở niêm phong để chấm.';
    return;
  }
  if (evaluationForm.normalizedTotal && !MONEY_PATTERN.test(evaluationForm.normalizedTotal)) {
    error.value = 'Giá trị chuẩn hóa phải là số thập phân dương, tối đa 4 chữ số lẻ.';
    return;
  }
  if (evaluationForm.currency && !CURRENCY_PATTERN.test(evaluationForm.currency)) {
    error.value = 'Loại tiền chuẩn hóa phải là mã ISO 3 chữ cái viết hoa.';
    return;
  }
  emit('create-evaluation', evaluationForm.bidId, {
    evaluationType: evaluationForm.evaluationType,
    ...(evaluationForm.normalizedTotal.trim() ? { normalizedTotal: evaluationForm.normalizedTotal.trim() } : {}),
    ...(evaluationForm.currency.trim() ? { currency: evaluationForm.currency.trim() } : {}),
    ...(evaluationForm.normalizationBasis.trim() ? { normalizationBasis: evaluationForm.normalizationBasis.trim() } : {}),
    ...(evaluationForm.overrideReason.trim() ? { overrideReason: evaluationForm.overrideReason.trim() } : {}),
    ...(evaluationForm.notes.trim() ? { notes: evaluationForm.notes.trim() } : {})
  });
}

function submitAward(): void {
  error.value = '';
  if (!awardForm.rfqId || !awardForm.awardedBidId) {
    error.value = 'Chọn RFQ và hồ sơ thầu trúng thầu.';
    return;
  }
  emit('submit-award', awardForm.rfqId, {
    awardedBidId: awardForm.awardedBidId,
    ...(awardForm.reason.trim() ? { reason: awardForm.reason.trim() } : {})
  });
}
</script>

<template>
  <section class="procurement-panel evaluation-panel" aria-labelledby="evaluation-panel-title">
    <div class="detail-heading">
      <div>
        <small>ĐÁNH GIÁ VÀ TRAO THẦU · API-080 / API-081</small>
        <h2 id="evaluation-panel-title">Hồ sơ thầu, đánh giá và trình kết quả</h2>
        <p class="lead">
          Trước khi RFQ đóng thầu, giá dự thầu không tồn tại trong tải trọng phản hồi — màn hình
          hiển thị đúng trạng thái niêm phong chứ không dựng một con số thay thế.
        </p>
      </div>
      <p class="evaluation-panel__sealed-count">
        <strong>{{ sealedCount }}</strong> / {{ rows.length }} hồ sơ còn niêm phong
      </p>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p class="procurement-note">
      API-079 (nhà cung cấp tự nộp thầu) đang hoãn vì chưa có định danh nhà cung cấp bên ngoài, nên
      không có sổ hồ sơ thầu để đọc. Các hàng dưới đây là hồ sơ đi kèm phản hồi của lệnh đánh giá.
    </p>

    <div v-if="!rows.length" class="empty-panel">
      <h3>Chưa có hồ sơ thầu nào được tham chiếu</h3>
      <p>Ghi nhận một đánh giá theo bid ID để hồ sơ thầu tương ứng xuất hiện tại đây.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table procurement-table bid-table">
        <thead>
          <tr>
            <th>Hồ sơ thầu</th>
            <th>RFQ</th>
            <th>Trạng thái niêm phong</th>
            <th>Giá dự thầu</th>
            <th>Đánh giá đã ghi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.bid.id" :data-sealed="row.sealed">
            <td>
              <strong>{{ row.bid.supplierProfileId }}</strong>
              <span>rev {{ row.bid.revision }}</span>
            </td>
            <td>
              <template v-if="row.rfq">
                {{ row.rfq.number }} ·
                <span class="status-pill" :data-status="row.rfq.status">{{ RFQ_STATUS_LABEL[row.rfq.status] }}</span>
              </template>
              <template v-else>{{ row.bid.rfqId }}</template>
            </td>
            <td>{{ row.bid.sealedStatus === 'SEALED' ? 'SEALED' : 'OPENED' }}</td>
            <td class="bid-price">
              <span v-if="row.sealed" class="bid-sealed">{{ SEALED_BID_LABEL }}</span>
              <span v-else class="money">{{ formatMoney(row.bid.total ?? null) }} {{ row.bid.currency }}</span>
            </td>
            <td>{{ (evaluationsByBid.get(row.bid.id) ?? []).length }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="evaluations.length" class="table-shell">
      <table class="data-table procurement-table">
        <thead>
          <tr><th>Trục đánh giá</th><th>Phiên bản</th><th>Giá trị chuẩn hóa</th><th>Lý do override</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in evaluations" :key="row.id">
            <td>{{ EVALUATION_TYPE_LABEL[row.evaluationType] }}</td>
            <td>v{{ row.version }}</td>
            <td><span class="money">{{ row.normalizedTotal === null ? 'Không chuẩn hóa' : `${formatMoney(row.normalizedTotal)} ${row.currency}` }}</span></td>
            <td>{{ row.overrideReason ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <form v-if="permissions.evaluate" class="procurement-form evaluation-form" @submit.prevent="submitEvaluation">
      <h3 class="form-wide">Ghi nhận đánh giá (API-080)</h3>
      <label>Hồ sơ thầu<select v-model="evaluationForm.bidId" aria-label="Hồ sơ thầu cần đánh giá"><option disabled value="">Chọn hồ sơ đã mở niêm phong</option><option v-for="row in openBids" :key="row.bid.id" :value="row.bid.id">{{ row.bid.supplierProfileId }} · rev {{ row.bid.revision }}</option></select></label>
      <label>Trục đánh giá<select v-model="evaluationForm.evaluationType" aria-label="Trục đánh giá"><option v-for="item in EVALUATION_TYPES" :key="item" :value="item">{{ EVALUATION_TYPE_LABEL[item] }}</option></select></label>
      <label>Giá trị chuẩn hóa<input v-model.trim="evaluationForm.normalizedTotal" inputmode="decimal" placeholder="Bỏ trống nếu không chuẩn hóa" /></label>
      <label>Loại tiền<input v-model.trim="evaluationForm.currency" maxlength="3" placeholder="Bỏ trống = theo hồ sơ thầu" /></label>
      <label class="form-wide">Cơ sở chuẩn hóa<input v-model.trim="evaluationForm.normalizationBasis" maxlength="400" /></label>
      <label class="form-wide">Lý do override (bắt buộc khi giá trị thương mại khác giá dự thầu)<textarea v-model="evaluationForm.overrideReason" rows="2" maxlength="2000"></textarea></label>
      <label class="form-wide">Ghi chú<textarea v-model="evaluationForm.notes" rows="2" maxlength="2000"></textarea></label>
      <p v-if="!openBids.length" class="procurement-note form-wide">
        Không có hồ sơ nào đã mở niêm phong để chấm — RFQ phải đóng thầu trước.
      </p>
      <el-button native-type="submit" type="primary" :loading="busy" :disabled="!openBids.length">
        Ghi đánh giá
      </el-button>
    </form>

    <form v-if="permissions.submitAward" class="procurement-form award-form" @submit.prevent="submitAward">
      <h3 class="form-wide">Trình kết quả trao thầu (API-081)</h3>
      <label>RFQ<select v-model="awardForm.rfqId" aria-label="RFQ trình kết quả"><option disabled value="">Chọn RFQ đã đóng thầu</option><option v-for="item in awardableRfqs" :key="item.id" :value="item.id">{{ item.number }} rev {{ item.revision }}</option></select></label>
      <label>Hồ sơ trúng thầu<select v-model="awardForm.awardedBidId" aria-label="Hồ sơ trúng thầu"><option disabled value="">Chọn hồ sơ thầu</option><option v-for="row in awardCandidates" :key="row.bid.id" :value="row.bid.id">{{ row.bid.supplierProfileId }} · rev {{ row.bid.revision }}</option></select></label>
      <label class="form-wide">Lý do trao thầu<textarea v-model="awardForm.reason" rows="2" maxlength="2000"></textarea></label>
      <p v-if="awardSodBlocked" class="procurement-blocked form-wide">
        Phân tách nhiệm vụ: bạn đã chấm hồ sơ của RFQ này nên không được tự trình kết quả.
      </p>
      <el-button
        native-type="submit"
        type="primary"
        :loading="busy"
        :disabled="awardSodBlocked || !awardableRfqs.length"
      >
        Trình kết quả
      </el-button>
    </form>
  </section>
</template>
