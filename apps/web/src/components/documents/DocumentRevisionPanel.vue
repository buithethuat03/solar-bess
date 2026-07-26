<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import DocumentScanChip from './DocumentScanChip.vue';
import { CLASSIFICATION_LABEL, REVISION_STATUS_LABEL } from '@/constants/documents';
import type {
  ApproveRevisionRequest, CreateReviewCommentRequest, DocumentRevisionView, DocumentView,
  IssueRevisionRequest, ReviewCommentSeverity, SubmitRevisionReviewRequest
} from '@/types/document.types';

type ActionKind = 'REVIEW' | 'COMMENT' | 'APPROVE' | 'ISSUE';

const props = defineProps<{
  document: DocumentView;
  currentRevision: DocumentRevisionView | null;
  revisions: DocumentRevisionView[];
  nextCursor: string | null;
  busy: boolean;
  permissions: { submitReview: boolean; comment: boolean; approve: boolean; issue: boolean };
}>();
const emit = defineEmits<{
  close: [];
  more: [];
  'submit-review': [revisionId: string, input: SubmitRevisionReviewRequest];
  approve: [revisionId: string, input: ApproveRevisionRequest];
  issue: [revisionId: string, input: IssueRevisionRequest];
  comment: [revisionId: string, input: CreateReviewCommentRequest];
}>();

const ACTION_LABEL: Record<ActionKind, string> = {
  REVIEW: 'Trình duyệt', COMMENT: 'Ghi ý kiến review',
  APPROVE: 'Phê duyệt', ISSUE: 'Phát hành'
};

const error = ref('');
const active = ref<{ revision: DocumentRevisionView; kind: ActionKind } | null>(null);
const form = reactive({
  text: '', severity: 'MAJOR' as ReviewCommentSeverity, location: ''
});

const activeTitle = computed(() => active.value
  ? `${ACTION_LABEL[active.value.kind]} · ${active.value.revision.revisionCode}`
  : '');

// A stale panel must not keep an action form open over a revision that no longer exists.
watch(() => props.revisions, () => { active.value = null; error.value = ''; });

/**
 * The server refuses every forward transition on a revision the scanner has not cleared, so the UI
 * offers no action at all rather than a button that is guaranteed to fail.
 */
function availableActions(revision: DocumentRevisionView): ActionKind[] {
  if (revision.scanStatus !== 'CLEAN') return [];
  const kinds: ActionKind[] = [];
  if (
    (revision.status === 'DRAFT' || revision.status === 'REJECTED') && props.permissions.submitReview
  ) kinds.push('REVIEW');
  if (revision.status === 'IN_REVIEW' && props.permissions.comment) kinds.push('COMMENT');
  if (revision.status === 'IN_REVIEW' && props.permissions.approve) kinds.push('APPROVE');
  if (revision.status === 'APPROVED' && props.permissions.issue) kinds.push('ISSUE');
  return kinds;
}

function openAction(revision: DocumentRevisionView, kind: ActionKind): void {
  active.value = { revision, kind };
  error.value = '';
  form.text = '';
  form.severity = 'MAJOR';
  form.location = '';
}

function submit(): void {
  const current = active.value;
  if (!current) return;
  const text = form.text.trim();
  if (text.length < 3) {
    error.value = 'Nội dung phải có ít nhất 3 ký tự để lưu vào lịch sử.';
    return;
  }
  error.value = '';
  const revisionId = current.revision.id;
  // The expected version is the one displayed; a stale one is answered with 409 by the server.
  const expectedVersion = current.revision.versionNo;
  if (current.kind === 'REVIEW') emit('submit-review', revisionId, { expectedVersion, note: text });
  else if (current.kind === 'APPROVE') emit('approve', revisionId, { expectedVersion, comment: text });
  else if (current.kind === 'ISSUE') emit('issue', revisionId, { expectedVersion, comment: text });
  else emit('comment', revisionId, {
    severity: form.severity, body: text,
    ...(form.location.trim() ? { location: form.location.trim() } : {})
  });
  active.value = null;
}
</script>

<template>
  <section class="document-detail" aria-labelledby="document-detail-title">
    <div class="detail-heading">
      <div>
        <small>DOCUMENT REVISION · DB-023</small>
        <h2 id="document-detail-title">{{ document.documentCode }} · {{ document.title }}</h2>
        <p class="lead">
          {{ document.discipline }} · {{ document.type }} ·
          {{ CLASSIFICATION_LABEL[document.classification] }}
          <template v-if="document.legalHold"> · Legal hold</template>
        </p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>

    <div class="document-current">
      <template v-if="currentRevision">
        <span>Revision hiện hành</span>
        <strong>{{ currentRevision.revisionCode }} · {{ REVISION_STATUS_LABEL[currentRevision.status] }}</strong>
        <DocumentScanChip :status="currentRevision.scanStatus" hint />
      </template>
      <template v-else>
        <span>Revision hiện hành</span>
        <strong>Chưa phát hành revision nào</strong>
      </template>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <div class="table-shell">
      <table class="data-table document-table">
        <thead>
          <tr>
            <th>Revision</th>
            <th>Mục đích</th>
            <th>Tệp</th>
            <th>Trạng thái</th>
            <th>Trạng thái quét</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="revision in revisions" :key="revision.id" :data-scan="revision.scanStatus">
            <td>
              <strong>{{ revision.revisionCode }}</strong>
              <span>v{{ revision.workingVersion }} · cycle {{ revision.reviewCycleNo }}</span>
            </td>
            <td>{{ revision.purpose }}</td>
            <td>
              <strong>{{ revision.fileName }}</strong>
              <span>{{ revision.sizeBytes === null ? 'Chưa xác định kích thước' : `${revision.sizeBytes} bytes` }}</span>
            </td>
            <td><span class="status-pill" :data-status="revision.status">{{ REVISION_STATUS_LABEL[revision.status] }}</span></td>
            <td><DocumentScanChip :status="revision.scanStatus" hint /></td>
            <td>
              <template v-if="availableActions(revision).length">
                <el-button v-for="kind in availableActions(revision)" :key="kind" text @click="openAction(revision, kind)">{{ ACTION_LABEL[kind] }}</el-button>
              </template>
              <span v-else-if="revision.scanStatus !== 'CLEAN'">Bị chặn cho tới khi quét sạch</span>
              <span v-else>Không có hành động được phép</span>
            </td>
          </tr>
          <tr v-if="!revisions.length"><td colspan="6">Chưa có revision nào.</td></tr>
        </tbody>
      </table>
    </div>
    <el-button v-if="nextCursor" @click="emit('more')">Tải thêm revision</el-button>

    <form v-if="active" class="document-action-form" @submit.prevent="submit">
      <h3>{{ activeTitle }}</h3>
      <fieldset class="document-form form-fieldset" :disabled="busy">
        <label v-if="active.kind === 'COMMENT'">Mức độ<select v-model="form.severity" aria-label="Mức độ"><option v-for="item in ['INFO','MINOR','MAJOR','CRITICAL']" :key="item" :value="item">{{ item }}</option></select></label>
        <label v-if="active.kind === 'COMMENT'">Vị trí<input v-model.trim="form.location" maxlength="200" placeholder="VD: Sheet 2" /></label>
        <label class="form-wide">Nội dung<textarea v-model="form.text" required rows="3" /></label>
        <div class="form-actions form-wide">
          <el-button native-type="button" @click="active = null">Hủy</el-button>
          <el-button native-type="submit" type="primary" :loading="busy">{{ ACTION_LABEL[active.kind] }}</el-button>
        </div>
      </fieldset>
    </form>
  </section>
</template>
