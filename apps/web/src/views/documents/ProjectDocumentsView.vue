<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { documentApi } from '@/api/document.api';
import { projectApi } from '@/api/project.api';
import { scheduleApi } from '@/api/schedule.api';
import DocumentCreateForm from '@/components/documents/DocumentCreateForm.vue';
import DocumentRegisterTable from '@/components/documents/DocumentRegisterTable.vue';
import DocumentRevisionPanel from '@/components/documents/DocumentRevisionPanel.vue';
import DocumentUploadPanel from '@/components/documents/DocumentUploadPanel.vue';
import { CLASSIFICATION_LABEL, DOCUMENT_CLASSIFICATIONS } from '@/constants/documents';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ApproveRevisionRequest, CreateDocumentRequest, CreateReviewCommentRequest,
  CreateUploadSessionRequest, DocumentClassification, DocumentListQuery, DocumentRegisterRow,
  DocumentRevisionView, DocumentView, IssueRevisionRequest, SubmitRevisionReviewRequest,
  UploadOutcome
} from '@/types/document.types';
import type { Project } from '@/types/project.types';
import type { SchedulePackage } from '@/types/schedule.types';

type ScreenState = 'ready' | 'denied' | 'error';

const PAGE_LIMIT = 50;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;

const project = ref<Project | null>(null);
const packages = ref<SchedulePackage[]>([]);
const rows = ref<DocumentRegisterRow[]>([]);
const registerCursor = ref<string | null>(null);
const selected = ref<DocumentView | null>(null);
const selectedCurrentRevision = ref<DocumentRevisionView | null>(null);
const revisions = ref<DocumentRevisionView[]>([]);
const revisionCursor = ref<string | null>(null);
const uploadOutcome = ref<UploadOutcome | null>(null);
const pendingSessionId = ref<string | null>(null);
const showCreate = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const filters = reactive({ type: '', discipline: '', classification: '', packageId: '' });

const portfolioId = computed(() => project.value?.portfolioId);
const packageOptions = computed(() => packages.value.map(({ id, code, name }) => ({ id, code, name })));
const canCreateFullProject = computed(() => auth.hasFullProjectPermission(
  'document.create', projectId, portfolioId.value
));
const createPackageOptions = computed(() => canCreateFullProject.value
  ? packageOptions.value
  : packageOptions.value.filter((item) => auth.hasPackagePermission('document.create', item.id)));
const canCreate = computed(() => canCreateFullProject.value || createPackageOptions.value.length > 0);

/** Record-scoped: a package-scoped actor may act on some documents of a project but not others. */
function recordPermission(permission: string, document: DocumentView | null): boolean {
  if (!document) return false;
  return auth.canAccessRecord(permission, projectId, document.packageId, portfolioId.value);
}

const canUpload = computed(() => recordPermission('documentRevision.upload', selected.value));
const revisionPermissions = computed(() => ({
  submitReview: recordPermission('documentRevision.submitReview', selected.value),
  comment: recordPermission('documentComment.create', selected.value),
  // BR-035 keeps approve/issue with PMO/PROJECT_MANAGER; the server re-checks either way.
  approve: recordPermission('documentRevision.approve', selected.value),
  issue: recordPermission('documentRevision.issue', selected.value)
}));

function registerQuery(cursor?: string): DocumentListQuery {
  return {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.discipline ? { discipline: filters.discipline } : {}),
    ...(filters.classification
      ? { classification: filters.classification as DocumentClassification } : {}),
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(cursor ? { cursor } : {}), limit: PAGE_LIMIT
  };
}

/**
 * API-039 embeds `currentRevision` and `latestRevision` in every row, so a page costs exactly one
 * request. There is deliberately no per-row revision fetch here: the previous fan-out over API-044
 * cost up to one extra authenticated, permission-checked request per row.
 */
async function loadRegister(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    const response = await documentApi.listDocuments(
      context, projectId, registerQuery(append ? registerCursor.value ?? undefined : undefined)
    );
    rows.value = append ? [...rows.value, ...response.data] : response.data;
    registerCursor.value = response.meta.nextCursor;
  } finally {
    loadingMore.value = false;
  }
}

async function loadWorkspace(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    const optional = await Promise.allSettled([
      auth.can('project.read') ? projectApi.getProject(context, projectId) : Promise.resolve(null),
      auth.can('package.read') ? scheduleApi.listPackages(context, projectId) : Promise.resolve(null)
    ]);
    const projectResult = optional[0];
    const packageResult = optional[1];
    if (projectResult.status === 'fulfilled' && projectResult.value) project.value = projectResult.value.data;
    if (packageResult.status === 'fulfilled' && packageResult.value) packages.value = packageResult.value.data;
    await loadRegister(false);
    screenState.value = 'ready';
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải Document Register.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

async function applyFilters(): Promise<void> {
  error.value = '';
  try { await loadRegister(false); }
  catch (caught) { error.value = message(caught, 'Không thể áp dụng bộ lọc.'); }
}

async function openDocument(documentId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  error.value = '';
  try {
    const detail = await documentApi.getDocument(context, documentId, { limit: PAGE_LIMIT });
    selected.value = detail.data;
    selectedCurrentRevision.value = detail.currentRevision;
    revisions.value = detail.revisions;
    revisionCursor.value = detail.meta.nextCursor;
    showCreate.value = false;
    uploadOutcome.value = null;
    pendingSessionId.value = null;
  } catch (caught) {
    error.value = message(caught, 'Không thể mở tài liệu.');
  } finally {
    busy.value = false;
  }
}

async function loadMoreRevisions(): Promise<void> {
  const context = auth.apiContext;
  const document = selected.value;
  if (!context || !document || !revisionCursor.value) return;
  const detail = await documentApi.getDocument(context, document.id, {
    cursor: revisionCursor.value, limit: PAGE_LIMIT
  });
  revisions.value = [...revisions.value, ...detail.revisions];
  revisionCursor.value = detail.meta.nextCursor;
}

function closeDetail(): void {
  selected.value = null;
  selectedCurrentRevision.value = null;
  revisions.value = [];
  revisionCursor.value = null;
  uploadOutcome.value = null;
  pendingSessionId.value = null;
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

async function mutate(action: () => Promise<void>, note: string): Promise<boolean> {
  busy.value = true;
  error.value = '';
  success.value = '';
  mutationConflict.value = false;
  try {
    await action();
    success.value = note;
    await loadRegister(false);
    return true;
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể hoàn thành command.';
    mutationConflict.value = apiError?.status === 409;
    return false;
  } finally {
    busy.value = false;
  }
}

async function createDocument(input: CreateDocumentRequest): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  let documentId = '';
  const created = await mutate(async () => {
    documentId = (await documentApi.createDocument(
      context, projectId, input, crypto.randomUUID()
    )).data.id;
  }, 'Tài liệu đã được đăng ký cùng audit/outbox.');
  if (created) {
    showCreate.value = false;
    await openDocument(documentId);
  }
}

/**
 * The two-step upload. The session POST only parks the bytes in quarantine; the finalize POST is the
 * only thing that can produce a verdict, so both halves have to be reported separately.
 */
async function startUpload(input: CreateUploadSessionRequest): Promise<void> {
  const context = auth.apiContext;
  const document = selected.value;
  if (!context || !document) return;
  busy.value = true;
  error.value = '';
  success.value = '';
  uploadOutcome.value = null;
  pendingSessionId.value = null;
  try {
    const session = await documentApi.createUploadSession(
      context, document.id, input, crypto.randomUUID()
    );
    pendingSessionId.value = session.data.uploadSessionId;
    await finalize(session.data.uploadSessionId);
  } catch (caught) {
    error.value = message(caught, 'Không mở được upload session.');
  } finally {
    busy.value = false;
  }
}

/** A retry after an outage needs a new Idempotency-Key, otherwise the receipt replays the outage. */
async function finalize(uploadSessionId: string): Promise<void> {
  const context = auth.apiContext;
  const document = selected.value;
  if (!context || !document) return;
  try {
    const finalized = await documentApi.finalizeUploadSession(
      context, uploadSessionId, {}, crypto.randomUUID()
    );
    const clean = finalized.data.scanVerdict === 'CLEAN';
    uploadOutcome.value = {
      verdict: finalized.data.scanVerdict,
      revision: finalized.data,
      message: clean
        ? 'Đã quét sạch; revision được đưa sang release bucket và sẵn sàng trình duyệt.'
        : 'Phát hiện mã độc: tệp trong quarantine đã bị hủy và revision này không dùng được.'
    };
    pendingSessionId.value = null;
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    if (apiError?.code === 'SCANNER_UNAVAILABLE') {
      // The outage is durable server-side; the session stays finalizable under a new key.
      uploadOutcome.value = { verdict: 'UNAVAILABLE', revision: null, message: apiError.message };
    } else {
      pendingSessionId.value = null;
      error.value = message(caught, 'Không hoàn tất được upload session.');
    }
  }
  // Whatever the verdict, the revision row moved; a refresh failure must not hide it.
  await refreshSelected(document.id).catch(() => undefined);
}

async function retryFinalize(): Promise<void> {
  const uploadSessionId = pendingSessionId.value;
  if (!uploadSessionId) return;
  busy.value = true;
  try { await finalize(uploadSessionId); }
  finally { busy.value = false; }
}

async function refreshSelected(documentId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  const detail = await documentApi.getDocument(context, documentId, { limit: PAGE_LIMIT });
  selected.value = detail.data;
  selectedCurrentRevision.value = detail.currentRevision;
  revisions.value = detail.revisions;
  revisionCursor.value = detail.meta.nextCursor;
  await loadRegister(false);
}

async function runRevisionCommand(
  action: (documentId: string) => Promise<void>, note: string
): Promise<void> {
  const document = selected.value;
  if (!document) return;
  if (await mutate(() => action(document.id), note)) await refreshSelected(document.id);
}

function submitReview(revisionId: string, input: SubmitRevisionReviewRequest): void {
  const context = auth.apiContext;
  if (!context) return;
  void runRevisionCommand(
    async () => { await documentApi.submitReview(context, revisionId, input, crypto.randomUUID()); },
    'Revision đã chuyển sang IN_REVIEW.'
  );
}

function approveRevision(revisionId: string, input: ApproveRevisionRequest): void {
  const context = auth.apiContext;
  if (!context) return;
  void runRevisionCommand(
    async () => { await documentApi.approveRevision(context, revisionId, input, crypto.randomUUID()); },
    'Revision đã được phê duyệt.'
  );
}

function issueRevision(revisionId: string, input: IssueRevisionRequest): void {
  const context = auth.apiContext;
  if (!context) return;
  void runRevisionCommand(
    async () => { await documentApi.issueRevision(context, revisionId, input, crypto.randomUUID()); },
    'Revision đã phát hành; bản trước đó chuyển sang SUPERSEDED.'
  );
}

function createComment(revisionId: string, input: CreateReviewCommentRequest): void {
  const context = auth.apiContext;
  if (!context) return;
  void runRevisionCommand(
    async () => { await documentApi.createReviewComment(context, revisionId, input, crypto.randomUUID()); },
    'Ý kiến review đã được ghi vào lịch sử.'
  );
}

onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div>
        <p class="eyebrow eyebrow--accent">US-005 / US-019 · DOCUMENT CONTROL</p>
        <h1>{{ project?.name ?? 'Document Control' }}</h1>
        <p class="lead">Register tài liệu, vòng đời revision và verdict quét mã độc trong scope được phép.</p>
      </div>
      <div class="page-heading__actions">
        <el-button v-if="auth.can('project.read')" @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button>
        <el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button>
      </div>
    </section>

    <div class="scope-banner">
      <span>Tenant: {{ auth.tenant?.code }}</span>
      <span>Project: {{ projectId }}</span>
      <span>{{ canCreateFullProject ? 'Full-project UI scope' : 'Exact-package UI scope' }}</span>
      <strong>Server luôn re-authorize command.</strong>
    </div>

    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section v-if="mutationConflict" class="schedule-inline-conflict">
      <div>
        <strong>Version conflict</strong>
        <p>Revision đã đổi ở nơi khác. Tải lại tài liệu trước khi gửi lại command.</p>
      </div>
      <el-button @click="loadWorkspace">Tải version mới</el-button>
    </section>

    <div v-if="loading" class="risk-change-loading" aria-live="polite">
      <span></span><span></span><span></span>
      <p>Đang tải authorized document register…</p>
    </div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel">
      <span>🔒</span>
      <h2>Không có quyền xem document register</h2>
      <p>Không hiển thị mã, tiêu đề hay bộ lọc nào ngoài scope được cấp.</p>
    </section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel">
      <span>!</span>
      <h2>Không thể tải document register</h2>
      <p>{{ error }}</p>
      <el-button @click="loadWorkspace">Thử lại</el-button>
    </section>
    <template v-else>
      <form class="document-toolbar" @submit.prevent="applyFilters">
        <label>Loại tài liệu<input v-model.trim="filters.type" maxlength="100" placeholder="VD: DRAWING" /></label>
        <label>Discipline<input v-model.trim="filters.discipline" maxlength="100" placeholder="VD: ELECTRICAL" /></label>
        <label>Phân loại<select v-model="filters.classification" aria-label="Phân loại"><option value="">Tất cả</option><option v-for="item in DOCUMENT_CLASSIFICATIONS" :key="item" :value="item">{{ CLASSIFICATION_LABEL[item] }}</option></select></label>
        <label>Gói thầu<select v-model="filters.packageId" aria-label="Gói thầu"><option value="">Authorized scope</option><option v-for="item in packageOptions" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
        <el-button native-type="submit">Áp dụng</el-button>
        <el-button v-if="canCreate" type="primary" native-type="button" @click="showCreate = true">Tạo tài liệu</el-button>
      </form>

      <DocumentCreateForm
        v-if="showCreate"
        :package-options="createPackageOptions"
        :full-project="canCreateFullProject"
        :busy="busy"
        @close="showCreate = false"
        @create="createDocument"
      />

      <DocumentRegisterTable
        :rows="rows"
        :next-cursor="registerCursor"
        :loading-more="loadingMore"
        :selected-id="selected?.id ?? null"
        @open="openDocument"
        @more="loadRegister(true)"
      />

      <template v-if="selected">
        <DocumentRevisionPanel
          :document="selected"
          :current-revision="selectedCurrentRevision"
          :revisions="revisions"
          :next-cursor="revisionCursor"
          :busy="busy"
          :permissions="revisionPermissions"
          @close="closeDetail"
          @more="loadMoreRevisions"
          @submit-review="submitReview"
          @approve="approveRevision"
          @issue="issueRevision"
          @comment="createComment"
        />
        <DocumentUploadPanel
          v-if="canUpload"
          :document-code="selected.documentCode"
          :busy="busy"
          :outcome="uploadOutcome"
          :retryable="Boolean(pendingSessionId)"
          @upload="startUpload"
          @retry="retryFinalize"
        />
      </template>

      <p class="boundary-note">
        <strong>Ranh giới an toàn:</strong> Màn hình chỉ quản lý tài liệu dự án và không tạo bất kỳ
        lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.
      </p>
    </template>
  </AppLayout>
</template>
