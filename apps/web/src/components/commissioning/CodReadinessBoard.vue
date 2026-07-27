<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  BLOCKING_FINDING_LABEL, COD_GATE_CATEGORIES, COD_GATE_CATEGORY_LABEL,
  COD_GATE_REVIEW_DECISION_LABEL, COD_GATE_REVIEW_DECISIONS, COD_GATE_STATUS_LABEL,
  COD_PACKAGE_STATUS_LABEL, COMMISSIONING_CODE_PATTERN
} from '@/constants/commissioning';
import type {
  BlockingFinding, BlockingFindingType, CodGateCategory, CodGateReviewDecision, CodGateView,
  CodPackageView, CodReadinessData, CodTransitionCommandRequest
} from '@/types/commissioning.types';
import type { ProjectParty } from '@/types/project.types';

const props = defineProps<{
  readiness: CodReadinessData | null;
  /** Gates known from this session's API-105 responses; API-104 answers counts only. */
  gates: CodGateView[];
  parties: ProjectParty[];
  busy: boolean;
  currentUserId: string | null;
  permissions: { manage: boolean };
}>();
const emit = defineEmits<{ command: [input: CodTransitionCommandRequest] }>();

const error = ref('');
const gateForm = reactive({
  category: 'TECHNICAL' as CodGateCategory, code: '', title: '', mandatory: true, waivable: false,
  ownerUserId: '', dueDate: ''
});
const reviewForm = reactive({
  codGateId: '', reviewAction: 'SUBMIT' as 'SUBMIT' | 'DECIDE', evidenceText: '', evidenceExpiry: '',
  decision: 'PASS' as CodGateReviewDecision, reason: ''
});
const waiveForm = reactive({ codGateId: '', reason: '' });
const handoverForm = reactive({ fromPartyId: '', recipientPartyId: '' });
const signForm = reactive({ signedArtifactRef: '', effectiveAt: '' });

const evaluation = computed(() => props.readiness?.readiness ?? null);

function findingsOf(type: BlockingFindingType): BlockingFinding[] {
  return (evaluation.value?.blockingFindings.items ?? []).filter((item) => item.type === type);
}

const punchItems = computed(() => findingsOf('PUNCH_ITEM'));
const criticalNcrs = computed(() => findingsOf('NCR'));
const stopWorks = computed(() => findingsOf('STOP_WORK'));

/**
 * API-104 trả về SỐ ĐẾM điều kiện bắt buộc còn thiếu theo từng nhóm, không trả danh sách từng
 * gate. Bảng dưới đây vì thế nêu đúng những gì server nói: nhóm nào còn bao nhiêu điều kiện chưa
 * đạt. Các gate biết được từ lệnh trong phiên này được liệt kê thêm bên dưới, không thay thế.
 */
const outstandingCategories = computed(
  () => (evaluation.value?.categories ?? []).filter((row) => row.outstanding > 0)
);

const outstandingGates = computed(
  () => props.gates.filter((gate) => !['ACCEPTED', 'WAIVED'].includes(gate.status))
);

const expiredEvidenceGates = computed(() => {
  const ids = new Set(evaluation.value?.expiredEvidenceGateIds ?? []);
  return props.gates.filter((gate) => ids.has(gate.id));
});

/**
 * Mọi lý do đang chặn chữ ký, nêu thành câu. Nút SIGN_COD bị VÔ HIỆU kèm đúng danh sách này thay
 * vì được bật rồi để server trả 422 GATE_BLOCKED — người ký phải thấy vì sao trước khi bấm.
 */
const blockingReasons = computed<string[]>(() => {
  const current = evaluation.value;
  if (!current) return ['Chưa đọc được ma trận sẵn sàng COD.'];
  const reasons: string[] = [];
  if (current.blockingFindings.punchItems > 0) {
    reasons.push(`${current.blockingFindings.punchItems} punch item hạng A chặn COD chưa đóng`);
  }
  if (current.blockingFindings.criticalNcrs > 0) {
    reasons.push(`${current.blockingFindings.criticalNcrs} NCR nghiêm trọng còn mở`);
  }
  if (current.blockingFindings.stopWorks > 0) {
    reasons.push(`${current.blockingFindings.stopWorks} lệnh dừng việc chưa được gỡ`);
  }
  if (current.gates.mandatoryOutstanding > 0) {
    reasons.push(`${current.gates.mandatoryOutstanding} điều kiện COD bắt buộc chưa được đáp ứng`);
  }
  return reasons;
});

const packages = computed(() => props.readiness?.packages ?? []);
const activePackage = computed<CodPackageView | null>(() => packages.value[0] ?? null);

/**
 * `uq_cod_package_active` giữ chỗ cho các trạng thái chưa kết thúc (DRAFT/READY/SUBMITTED): một dự
 * án chỉ được có một hồ sơ đang bay. Điều kiện dưới đây khớp đúng ràng buộc đó thay vì đoán rộng
 * hơn hoặc hẹp hơn.
 */
const canSubmitPackage = computed(() => props.permissions.manage
  && !packages.value.some((row) => ['DRAFT', 'READY', 'SUBMITTED'].includes(row.status)));

/**
 * FR-113 SoD: người trình hồ sơ không bao giờ được ký chính hồ sơ đó (`ck_cod_package_sod`). Với
 * người trình, nút ký KHÔNG được render — không phải render rồi để server từ chối.
 */
const isSubmitter = computed(() => activePackage.value !== null
  && props.currentUserId !== null
  && activePackage.value.submittedBy === props.currentUserId);

const signable = computed(() => props.permissions.manage
  && activePackage.value !== null
  && activePackage.value.status === 'SUBMITTED'
  && !isSubmitter.value);

const signBlocked = computed(() => blockingReasons.value.length > 0);

/**
 * Hồ sơ đã ký là artefact pháp lý và bị đóng băng. Chỉ còn đúng hai lối đi: bàn giao đưa nó sang
 * HANDED_OVER, và đặt legal hold. GỠ legal hold không tồn tại ở bất kỳ đâu trong màn hình này —
 * `protect_cod_package_history` từ chối mọi chuyển true → false.
 */
const signedPackage = computed(() => activePackage.value !== null
  && ['SIGNED', 'HANDED_OVER'].includes(activePackage.value.status)
  ? activePackage.value : null);

const handoverAvailable = computed(() => props.permissions.manage
  && activePackage.value !== null
  && activePackage.value.status === 'SIGNED');

const recipientOptions = computed(
  () => props.parties.filter((party) => party.id !== handoverForm.fromPartyId)
);

function gateLabel(gate: CodGateView): string {
  return `${COD_GATE_CATEGORY_LABEL[gate.category]} · ${gate.code} · ${gate.title}`;
}

/**
 * `CategoryReadiness.category` là chuỗi thô của server. Nhãn tiếng Việt chỉ áp dụng khi giá trị
 * nằm trong từ vựng DB-076; một nhóm lạ được in nguyên văn thay vì hiển thị trống.
 */
function categoryLabel(category: string): string {
  return COD_GATE_CATEGORY_LABEL[category as CodGateCategory] ?? category;
}

function parseEvidence(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function gateById(codGateId: string): CodGateView | null {
  return props.gates.find((gate) => gate.id === codGateId) ?? null;
}

function submitDefineGate(): void {
  error.value = '';
  if (!COMMISSIONING_CODE_PATTERN.test(gateForm.code)) {
    error.value = 'Mã điều kiện COD phải viết hoa, bắt đầu bằng chữ hoặc số, tối đa 80 ký tự.';
    return;
  }
  if (gateForm.title.trim().length < 3) {
    error.value = 'Tiêu đề điều kiện COD phải có ít nhất 3 ký tự.';
    return;
  }
  emit('command', {
    commandType: 'DEFINE_GATE', category: gateForm.category, code: gateForm.code.trim(),
    title: gateForm.title.trim(), mandatory: gateForm.mandatory, waivable: gateForm.waivable,
    ...(gateForm.ownerUserId.trim() ? { ownerUserId: gateForm.ownerUserId.trim() } : {}),
    ...(gateForm.dueDate ? { dueDate: gateForm.dueDate } : {})
  });
}

function submitReview(): void {
  error.value = '';
  const gate = gateById(reviewForm.codGateId);
  if (!gate) {
    error.value = 'Chọn một điều kiện COD để nộp hoặc thẩm tra bằng chứng.';
    return;
  }
  if (reviewForm.reason.trim().length < 3) {
    error.value = 'Thuyết minh phải có ít nhất 3 ký tự.';
    return;
  }
  if (reviewForm.reviewAction === 'SUBMIT') {
    const evidenceRefs = parseEvidence(reviewForm.evidenceText);
    if (!evidenceRefs.length) {
      error.value = 'Nộp bằng chứng phải kèm ít nhất một tệp.';
      return;
    }
    emit('command', {
      commandType: 'REVIEW_EVIDENCE', codGateId: gate.id, expectedVersion: gate.versionNo,
      reviewAction: 'SUBMIT', evidenceRefs, reason: reviewForm.reason.trim(),
      ...(reviewForm.evidenceExpiry ? { evidenceExpiry: reviewForm.evidenceExpiry } : {})
    });
    return;
  }
  emit('command', {
    commandType: 'REVIEW_EVIDENCE', codGateId: gate.id, expectedVersion: gate.versionNo,
    reviewAction: 'DECIDE', decision: reviewForm.decision, reason: reviewForm.reason.trim()
  });
}

function submitWaive(): void {
  error.value = '';
  const gate = gateById(waiveForm.codGateId);
  if (!gate) {
    error.value = 'Chọn một điều kiện COD được phép miễn trừ.';
    return;
  }
  if (waiveForm.reason.trim().length < 3) {
    error.value = 'Lý do miễn trừ phải có ít nhất 3 ký tự.';
    return;
  }
  emit('command', {
    commandType: 'WAIVE_GATE', codGateId: gate.id, expectedVersion: gate.versionNo,
    reason: waiveForm.reason.trim()
  });
}

/** AC-060: chỉ gate được KHAI BÁO là waivable mới hiện trong danh sách miễn trừ. */
const waivableGates = computed(() => props.gates.filter(
  (gate) => gate.waivable && !['ACCEPTED', 'WAIVED'].includes(gate.status)
));

function submitCod(): void {
  error.value = '';
  emit('command', { commandType: 'SUBMIT_COD' });
}

function signCod(): void {
  error.value = '';
  const target = activePackage.value;
  if (!target) return;
  emit('command', {
    commandType: 'SIGN_COD', codPackageId: target.id, expectedVersion: target.versionNo,
    ...(signForm.signedArtifactRef.trim() ? { signedArtifactRef: signForm.signedArtifactRef.trim() } : {}),
    ...(signForm.effectiveAt ? { effectiveAt: new Date(signForm.effectiveAt).toISOString() } : {})
  });
}

function acceptHandover(): void {
  error.value = '';
  const target = activePackage.value;
  if (!target) return;
  if (!handoverForm.fromPartyId || !handoverForm.recipientPartyId) {
    error.value = 'Bàn giao cần cả bên bàn giao và bên nhận.';
    return;
  }
  if (handoverForm.fromPartyId === handoverForm.recipientPartyId) {
    error.value = 'Bên bàn giao và bên nhận phải khác nhau.';
    return;
  }
  emit('command', {
    commandType: 'ACCEPT_HANDOVER', codPackageId: target.id, expectedVersion: target.versionNo,
    fromPartyId: handoverForm.fromPartyId, recipientPartyId: handoverForm.recipientPartyId
  });
}
</script>

<template>
  <section class="commissioning-panel cod-board" aria-labelledby="cod-board-title">
    <div class="detail-heading">
      <div>
        <small>COD READINESS · API-104 / API-105 · DB-076/DB-077</small>
        <h2 id="cod-board-title">Bảng sẵn sàng COD</h2>
        <p class="lead">
          Mọi phát hiện đang chặn COD được liệt kê theo nhóm. Còn bất kỳ mục nào mở thì lệnh ký
          COD bị vô hiệu kèm lý do — không bao giờ bật rồi bị từ chối.
        </p>
      </div>
      <p v-if="evaluation" class="cod-board__asof">Đánh giá tại {{ evaluation.asOf }}</p>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p v-if="!evaluation" class="commissioning-note">
      Chưa đọc được ma trận sẵn sàng COD trong scope được cấp.
    </p>
    <template v-else>
      <div class="cod-board__summary" :data-ready="evaluation.readyToSign">
        <div><small>Điều kiện bắt buộc</small><strong>{{ evaluation.gates.mandatoryTotal - evaluation.gates.mandatoryOutstanding }} / {{ evaluation.gates.mandatoryTotal }}</strong></div>
        <div><small>Phát hiện chặn COD</small><strong>{{ evaluation.blockingFindings.total }}</strong></div>
        <div><small>Bằng chứng hết hiệu lực</small><strong>{{ evaluation.expiredEvidenceGateIds.length }}</strong></div>
        <div><small>Kết luận</small><strong>{{ evaluation.readyToSign ? 'Đủ điều kiện ký' : 'Chưa đủ điều kiện ký' }}</strong></div>
      </div>

      <section class="cod-blockers" aria-label="Phát hiện đang chặn COD">
        <article class="cod-blockers__group" data-group="PUNCH_ITEM" :data-open="punchItems.length > 0">
          <h3>{{ BLOCKING_FINDING_LABEL.PUNCH_ITEM }} ({{ punchItems.length }})</h3>
          <ul v-if="punchItems.length">
            <li v-for="item in punchItems" :key="item.id">
              <strong>{{ item.reference }}</strong><span>{{ item.detail }}</span>
            </li>
          </ul>
          <p v-else class="cod-blockers__clear">Không còn punch item hạng A nào chặn COD.</p>
        </article>

        <article class="cod-blockers__group" data-group="NCR" :data-open="criticalNcrs.length > 0">
          <h3>{{ BLOCKING_FINDING_LABEL.NCR }} ({{ criticalNcrs.length }})</h3>
          <ul v-if="criticalNcrs.length">
            <li v-for="item in criticalNcrs" :key="item.id">
              <strong>{{ item.reference }}</strong><span>{{ item.detail }}</span>
            </li>
          </ul>
          <p v-else class="cod-blockers__clear">Không còn NCR nghiêm trọng nào mở.</p>
        </article>

        <article class="cod-blockers__group" data-group="STOP_WORK" :data-open="stopWorks.length > 0">
          <h3>{{ BLOCKING_FINDING_LABEL.STOP_WORK }} ({{ stopWorks.length }})</h3>
          <ul v-if="stopWorks.length">
            <li v-for="item in stopWorks" :key="item.id">
              <strong>{{ item.reference }}</strong><span>{{ item.detail }}</span>
            </li>
          </ul>
          <p v-else class="cod-blockers__clear">Không còn lệnh dừng việc nào chưa được gỡ.</p>
        </article>

        <article
          class="cod-blockers__group"
          data-group="MANDATORY_GATE"
          :data-open="evaluation.gates.mandatoryOutstanding > 0"
        >
          <h3>Điều kiện COD bắt buộc chưa đáp ứng ({{ evaluation.gates.mandatoryOutstanding }})</h3>
          <ul v-if="outstandingCategories.length">
            <li v-for="row in outstandingCategories" :key="row.category">
              <strong>{{ categoryLabel(row.category) }}</strong>
              <span>còn {{ row.outstanding }} / {{ row.total }} điều kiện chưa đạt</span>
            </li>
          </ul>
          <p v-else class="cod-blockers__clear">Mọi điều kiện COD bắt buộc đã được đáp ứng.</p>
          <p class="cod-blockers__note">
            API-104 trả về số đếm theo nhóm chứ không trả từng điều kiện, nên bảng này nêu theo
            nhóm; các điều kiện ghi nhận trong phiên hiện tại được liệt kê ở phần bên dưới.
          </p>
        </article>
      </section>

      <div v-if="expiredEvidenceGates.length" class="cod-expired-evidence">
        <strong>Bằng chứng đã hết hiệu lực</strong>
        <ul>
          <li v-for="gate in expiredEvidenceGates" :key="gate.id">
            {{ gateLabel(gate) }} · hết hiệu lực {{ gate.evidenceExpiry }}
          </li>
        </ul>
      </div>

      <div v-if="gates.length" class="table-shell">
        <table class="data-table commissioning-table cod-gate-table">
          <thead>
            <tr><th>Điều kiện</th><th>Bắt buộc</th><th>Miễn trừ được</th><th>Trạng thái</th><th>Hạn</th></tr>
          </thead>
          <tbody>
            <tr v-for="gate in gates" :key="gate.id" :data-outstanding="outstandingGates.includes(gate)">
              <td><strong>{{ gate.code }}</strong><span>{{ gate.title }}</span></td>
              <td>{{ gate.mandatory ? 'Bắt buộc' : 'Không bắt buộc' }}</td>
              <td>{{ gate.waivable ? 'Có thể miễn trừ' : 'Không được miễn trừ' }}</td>
              <td><span class="status-pill" :data-status="gate.status">{{ COD_GATE_STATUS_LABEL[gate.status] }}</span></td>
              <td>{{ gate.dueDate ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="cod-package" aria-label="Hồ sơ COD">
        <h3>Hồ sơ COD</h3>
        <p v-if="!activePackage" class="commissioning-note">Dự án chưa có hồ sơ COD nào.</p>
        <template v-else>
          <dl class="cod-package__facts">
            <div><dt>Phiên bản</dt><dd>v{{ activePackage.version }}</dd></div>
            <div><dt>Trạng thái</dt><dd><span class="status-pill" :data-status="activePackage.status">{{ COD_PACKAGE_STATUS_LABEL[activePackage.status] }}</span></dd></div>
            <div><dt>Người trình</dt><dd>{{ activePackage.submittedBy ?? '—' }}</dd></div>
            <div><dt>Người ký</dt><dd>{{ activePackage.signedBy ?? 'chưa ký' }}</dd></div>
            <div><dt>Hash ảnh chụp</dt><dd>{{ activePackage.snapshotHash ?? '—' }}</dd></div>
          </dl>
          <p v-if="signedPackage" class="cod-package__immutable">
            Hồ sơ COD đã ký là artefact pháp lý và không thể sửa. Chỉ còn hai thao tác: ghi nhận bàn
            giao và đặt legal hold.
          </p>
          <p v-if="activePackage.legalHold" class="cod-package__legal-hold">
            Legal hold đang áp dụng — theo thiết kế, legal hold không bao giờ được gỡ.
          </p>
        </template>
      </section>

      <section v-if="permissions.manage" class="cod-actions" aria-label="Lệnh chuyển trạng thái COD">
        <el-button v-if="canSubmitPackage" :loading="busy" @click="submitCod">
          Trình hồ sơ COD (SUBMIT_COD)
        </el-button>

        <template v-if="activePackage && activePackage.status === 'SUBMITTED'">
          <p v-if="isSubmitter" class="cod-actions__sod">
            Phân tách nhiệm vụ: bạn là người trình hồ sơ COD này nên lệnh ký không dành cho bạn.
          </p>
          <form v-else-if="signable" class="commissioning-form cod-sign-form" @submit.prevent="signCod">
            <h4 class="form-wide">Ký hồ sơ COD (SIGN_COD)</h4>
            <label>Tham chiếu bản ký<input v-model.trim="signForm.signedArtifactRef" maxlength="500" /></label>
            <label>Hiệu lực từ<input v-model="signForm.effectiveAt" type="datetime-local" /></label>
            <ul v-if="signBlocked" class="cod-sign-blockers form-wide">
              <li v-for="reason in blockingReasons" :key="reason">{{ reason }}</li>
            </ul>
            <el-button
              native-type="submit"
              type="primary"
              :loading="busy"
              :disabled="signBlocked"
            >
              Ký COD
            </el-button>
            <p v-if="signBlocked" class="cod-actions__blocked form-wide">
              Lệnh ký bị vô hiệu vì các lý do ở trên; hãy xử lý chúng trước.
            </p>
          </form>
        </template>

        <form v-if="handoverAvailable" class="commissioning-form cod-handover-form" @submit.prevent="acceptHandover">
          <h4 class="form-wide">Ghi nhận bàn giao (ACCEPT_HANDOVER)</h4>
          <label>Bên bàn giao<select v-model="handoverForm.fromPartyId" required aria-label="Bên bàn giao"><option disabled value="">Chọn bên bàn giao</option><option v-for="party in parties" :key="party.id" :value="party.id">{{ party.roleCode }} · {{ party.companyId }}</option></select></label>
          <label>Bên nhận<select v-model="handoverForm.recipientPartyId" required aria-label="Bên nhận bàn giao"><option disabled value="">Chọn bên nhận</option><option v-for="party in recipientOptions" :key="party.id" :value="party.id">{{ party.roleCode }} · {{ party.companyId }}</option></select></label>
          <el-button native-type="submit" type="primary" :loading="busy">Ghi nhận bàn giao</el-button>
        </form>

        <div v-if="signedPackage" class="cod-legal-hold">
          <h4>Legal hold</h4>
          <p>
            Đặt legal hold lên hồ sơ đã ký là thao tác còn lại thứ hai, nhưng union lệnh đóng của
            API-105 hiện chưa có động từ nào để đặt nó, nên nút này bị vô hiệu thay vì gửi một lệnh
            chắc chắn bị từ chối.
          </p>
          <el-button disabled>Đặt legal hold</el-button>
          <p class="cod-legal-hold__note">
            Gỡ legal hold không tồn tại ở đây và sẽ không bao giờ tồn tại: database từ chối mọi
            chuyển legal hold từ bật sang tắt.
          </p>
        </div>
      </section>

      <form v-if="permissions.manage" class="commissioning-form cod-gate-form" @submit.prevent="submitDefineGate">
        <h4 class="form-wide">Khai báo điều kiện COD (DEFINE_GATE)</h4>
        <label>Nhóm<select v-model="gateForm.category" aria-label="Nhóm điều kiện COD"><option v-for="item in COD_GATE_CATEGORIES" :key="item" :value="item">{{ COD_GATE_CATEGORY_LABEL[item] }}</option></select></label>
        <label>Mã điều kiện<input v-model.trim="gateForm.code" required maxlength="80" placeholder="COD-LEGAL-01" /></label>
        <label>Tiêu đề<input v-model.trim="gateForm.title" required maxlength="400" /></label>
        <label>Người phụ trách<input v-model.trim="gateForm.ownerUserId" placeholder="UUID; bỏ trống = bạn" /></label>
        <label>Hạn hoàn thành<input v-model="gateForm.dueDate" type="date" /></label>
        <label class="cod-toggle"><input v-model="gateForm.mandatory" type="checkbox" /> Bắt buộc</label>
        <label class="cod-toggle"><input v-model="gateForm.waivable" type="checkbox" /> Có thể miễn trừ</label>
        <el-button native-type="submit" type="primary" :loading="busy">Khai báo điều kiện</el-button>
      </form>

      <form v-if="permissions.manage && gates.length" class="commissioning-form cod-review-form" @submit.prevent="submitReview">
        <h4 class="form-wide">Nộp hoặc thẩm tra bằng chứng (REVIEW_EVIDENCE)</h4>
        <label>Điều kiện<select v-model="reviewForm.codGateId" required aria-label="Điều kiện COD cần xử lý"><option disabled value="">Chọn điều kiện</option><option v-for="gate in gates" :key="gate.id" :value="gate.id">{{ gateLabel(gate) }}</option></select></label>
        <label>Thao tác<select v-model="reviewForm.reviewAction" aria-label="Thao tác thẩm tra"><option value="SUBMIT">Nộp bằng chứng</option><option value="DECIDE">Ra quyết định</option></select></label>
        <label v-if="reviewForm.reviewAction === 'DECIDE'">Quyết định<select v-model="reviewForm.decision" aria-label="Quyết định thẩm tra"><option v-for="item in COD_GATE_REVIEW_DECISIONS" :key="item" :value="item">{{ COD_GATE_REVIEW_DECISION_LABEL[item] }}</option></select></label>
        <label v-if="reviewForm.reviewAction === 'SUBMIT'">Hạn hiệu lực bằng chứng<input v-model="reviewForm.evidenceExpiry" type="date" /></label>
        <label v-if="reviewForm.reviewAction === 'SUBMIT'" class="form-wide">Bằng chứng (mỗi dòng một tham chiếu)<textarea v-model="reviewForm.evidenceText" rows="3"></textarea></label>
        <label class="form-wide">Thuyết minh<textarea v-model="reviewForm.reason" required rows="2" maxlength="2000"></textarea></label>
        <p class="commissioning-note form-wide">
          Người nộp bằng chứng không được tự thẩm tra bằng chứng đó, và bằng chứng đã hết hiệu lực
          không bao giờ kết luận Đạt được.
        </p>
        <el-button native-type="submit" type="primary" :loading="busy">Gửi lệnh</el-button>
      </form>

      <form v-if="permissions.manage && waivableGates.length" class="commissioning-form cod-waive-form" @submit.prevent="submitWaive">
        <h4 class="form-wide">Miễn trừ điều kiện (WAIVE_GATE)</h4>
        <label>Điều kiện<select v-model="waiveForm.codGateId" required aria-label="Điều kiện COD được miễn trừ"><option disabled value="">Chọn điều kiện được phép miễn trừ</option><option v-for="gate in waivableGates" :key="gate.id" :value="gate.id">{{ gateLabel(gate) }}</option></select></label>
        <label class="form-wide">Lý do miễn trừ<textarea v-model="waiveForm.reason" required rows="2" maxlength="2000"></textarea></label>
        <el-button native-type="submit" type="primary" :loading="busy">Miễn trừ điều kiện</el-button>
      </form>
    </template>
  </section>
</template>
