<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '@/api/api-error';
import { projectApi } from '@/api/project.api';
import { riskChangeApi } from '@/api/risk-change.api';
import { scheduleApi } from '@/api/schedule.api';
import ChangeRequestPanel from '@/components/risk-change/ChangeRequestPanel.vue';
import ClosureCycleTimeline from '@/components/risk-change/ClosureCycleTimeline.vue';
import ClosureDecisionPanel from '@/components/risk-change/ClosureDecisionPanel.vue';
import IssueForm from '@/components/risk-change/IssueForm.vue';
import RiskChangeSummaryPanel from '@/components/risk-change/RiskChangeSummaryPanel.vue';
import RiskForm from '@/components/risk-change/RiskForm.vue';
import RiskIssueActionPanel from '@/components/risk-change/RiskIssueActionPanel.vue';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type { Project } from '@/types/project.types';
import type {
  CancelRiskIssueActionRequest, ChangeDecisionRequest, ChangeListQuery,
  ChangeRequest, ChangeRequestSummary, ChangeSource, ClosureDecisionRequest,
  CompleteRiskIssueActionRequest, CreateChangeRequestRequest, CreateIssueRequest,
  CreateRiskIssueActionRequest, CreateRiskRequest, Issue, IssueListQuery, IssueSummary,
  Risk, RiskChangeHistoryItem, RiskChangeSummary, RiskIssueAction,
  RiskIssueActionSummary, RiskListQuery, RiskSummary, UpdateChangeRequestRequest,
  UpdateIssueRequest, UpdateRiskIssueActionFieldsRequest, UpdateRiskRequest,
  VerifyRiskIssueActionRequest
} from '@/types/risk-change.types';
import type { ScheduleBaseline, SchedulePackage } from '@/types/schedule.types';

type WorkspaceTab = 'risks' | 'issues' | 'changes';
type ScreenState = 'ready' | 'denied' | 'error';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const tab = ref<WorkspaceTab>(normalizeTab(route.query.tab));
const project = ref<Project | null>(null);
const packages = ref<SchedulePackage[]>([]);
const summary = ref<RiskChangeSummary | null>(null);
const risks = ref<RiskSummary[]>([]);
const issues = ref<IssueSummary[]>([]);
const changes = ref<ChangeRequestSummary[]>([]);
const riskCursor = ref<string | null>(null);
const issueCursor = ref<string | null>(null);
const changeCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const busy = ref(false);
const screenState = ref<ScreenState>('ready');
const error = ref('');
const success = ref('');
const mutationConflict = ref(false);

const showRiskForm = ref(false);
const showIssueForm = ref(false);
const showChangePanel = ref(false);
const selectedRisk = ref<Risk | null>(null);
const selectedIssue = ref<Issue | null>(null);
const selectedChange = ref<ChangeRequest | null>(null);
const closureCycles = ref<import('@/types/risk-change.types').RiskIssueClosureCycle[]>([]);
const closureCursor = ref<string | null>(null);
const closureLoading = ref(false);
const actions = ref<RiskIssueActionSummary[]>([]);
const selectedAction = ref<RiskIssueAction | null>(null);
const showActionPanel = ref(false);
const actionParent = ref<{ type: 'RISK' | 'ISSUE'; id: string; packageId: string | null; riskVersion?: number } | null>(null);
const history = ref<RiskChangeHistoryItem[]>([]);
const historyCursor = ref<string | null>(null);
const baselines = ref<ScheduleBaseline[]>([]);
const sourceSeed = ref<ChangeSource | undefined>();

const filters = reactive({
  packageId: '', ownerId: '', riskStatus: '', riskCategory: '', reviewBefore: '',
  issueStatus: '', severity: '', targetBefore: '', changeStatus: '', changeSourceType: ''
});

const fullProject = computed(() => auth.hasFullProjectPermission(
  'riskChange.read', projectId, project.value?.portfolioId
));
const packageOptions = computed(() => packages.value.map(({ id, code, name }) => ({ id, code, name })));
const canCreateFullProject = computed(() => auth.hasFullProjectPermission(
  'riskChange.create', projectId, project.value?.portfolioId
));
const createPackageOptions = computed(() => canCreateFullProject.value
  ? packageOptions.value
  : packageOptions.value.filter((item) => auth.hasPackagePermission('riskChange.create', item.id)));
const canCreate = computed(() => (
  canCreateFullProject.value || createPackageOptions.value.length > 0
));
const canManage = computed(() => {
  const hasScopedRecord = Boolean(
    (showActionPanel.value && actionParent.value)
    || (showChangePanel.value && selectedChange.value)
    || (showRiskForm.value && selectedRisk.value)
    || (showIssueForm.value && selectedIssue.value)
  );
  if (!hasScopedRecord) return auth.can('riskChange.manage');
  const packageId = showActionPanel.value ? actionParent.value?.packageId ?? null
    : showChangePanel.value ? selectedChange.value?.packageId ?? null
      : showRiskForm.value ? selectedRisk.value?.packageId ?? null
        : selectedIssue.value?.packageId ?? null;
  return auth.canAccessRecord(
    'riskChange.manage', projectId, packageId, project.value?.portfolioId
  );
});
const canManageFullProject = computed(() => auth.hasFullProjectPermission(
  'riskChange.manage', projectId, project.value?.portfolioId
));
const canSubmitChange = computed(() => auth.hasFullProjectPermission(
  'riskChange.submit', projectId, project.value?.portfolioId
));
const canApproveChange = computed(() => auth.hasFullProjectPermission(
  'riskChange.approve', projectId, project.value?.portfolioId
));
const canRebaselineChange = computed(() => (
  auth.hasFullProjectPermission('schedule.read', projectId, project.value?.portfolioId)
  && auth.hasFullProjectPermission('baseline.submit', projectId, project.value?.portfolioId)
));
const canRequestRiskClosure = computed(() => Boolean(selectedRisk.value && auth.canAccessRecord(
  'riskChange.requestClosure', projectId, selectedRisk.value.packageId,
  project.value?.portfolioId
)));
const canRequestIssueClosure = computed(() => Boolean(selectedIssue.value && auth.canAccessRecord(
  'riskChange.requestClosure', projectId, selectedIssue.value.packageId,
  project.value?.portfolioId
)));
const canDecideRiskClosure = computed(() => {
  const risk = selectedRisk.value;
  if (!risk || !auth.hasFullProjectPermission(
    'riskChange.close', projectId, project.value?.portfolioId
  )) return false;
  const independent = auth.user?.id !== risk.createdBy
    && auth.user?.id !== risk.ownerId && auth.user?.id !== risk.closureRequestedBy;
  const critical = ['HIGH', 'CRITICAL'].includes(risk.residualLevel ?? risk.inherentLevel);
  return independent && (!critical || auth.hasFullProjectPermission(
    'riskChange.closeCritical', projectId, project.value?.portfolioId
  ));
});
const canDecideIssueClosure = computed(() => {
  const issue = selectedIssue.value;
  if (!issue || !auth.hasFullProjectPermission(
    'riskChange.close', projectId, project.value?.portfolioId
  )) return false;
  const independent = auth.user?.id !== issue.createdBy
    && auth.user?.id !== issue.ownerId && auth.user?.id !== issue.closureRequestedBy;
  const critical = ['HIGH', 'CRITICAL'].includes(issue.severity);
  return independent && (!critical || auth.hasFullProjectPermission(
    'riskChange.closeCritical', projectId, project.value?.portfolioId
  ));
});

function normalizeTab(value: unknown): WorkspaceTab {
  return value === 'issues' || value === 'changes' ? value : 'risks';
}

function riskQuery(cursor?: string): RiskListQuery {
  return {
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.riskStatus ? { status: filters.riskStatus as RiskListQuery['status'] } : {}),
    ...(filters.reviewBefore ? { reviewBefore: filters.reviewBefore } : {}),
    ...(cursor ? { cursor } : {}), limit: 50
  };
}

function issueQuery(cursor?: string): IssueListQuery {
  return {
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.issueStatus ? { status: filters.issueStatus as IssueListQuery['status'] } : {}),
    ...(filters.severity ? { severity: filters.severity as IssueListQuery['severity'] } : {}),
    ...(filters.targetBefore ? { targetBefore: filters.targetBefore } : {}),
    ...(cursor ? { cursor } : {}), limit: 50
  };
}

function changeQuery(cursor?: string): ChangeListQuery {
  return {
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.changeStatus ? { status: filters.changeStatus as ChangeListQuery['status'] } : {}),
    ...(filters.changeSourceType ? { sourceType: filters.changeSourceType as ChangeListQuery['sourceType'] } : {}),
    ...(cursor ? { cursor } : {}), limit: 50
  };
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
    await Promise.all([loadSummary(), loadTab(false)]);
    screenState.value = 'ready';
    await openDeepLink();
  } catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể tải Risk & Change workspace.';
    screenState.value = apiError?.status === 403 ? 'denied' : 'error';
  } finally {
    loading.value = false;
  }
}

async function loadSummary(): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  summary.value = (await riskChangeApi.getSummary(context, projectId, {
    ...(filters.packageId ? { packageId: filters.packageId } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.riskStatus ? { riskStatus: filters.riskStatus as RiskListQuery['status'] } : {}),
    ...(filters.riskCategory ? { riskCategory: filters.riskCategory } : {}),
    ...(filters.reviewBefore ? { riskReviewBefore: filters.reviewBefore } : {})
  })).data;
}

async function loadTab(append: boolean): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  if (append) loadingMore.value = true;
  try {
    if (tab.value === 'risks') {
      const response = await riskChangeApi.listRisks(context, projectId, riskQuery(append ? riskCursor.value ?? undefined : undefined));
      risks.value = append ? [...risks.value, ...response.data] : response.data;
      riskCursor.value = response.meta.nextCursor;
    } else if (tab.value === 'issues') {
      const response = await riskChangeApi.listIssues(context, projectId, issueQuery(append ? issueCursor.value ?? undefined : undefined));
      issues.value = append ? [...issues.value, ...response.data] : response.data;
      issueCursor.value = response.meta.nextCursor;
    } else {
      const response = await riskChangeApi.listChanges(context, projectId, changeQuery(append ? changeCursor.value ?? undefined : undefined));
      changes.value = append ? [...changes.value, ...response.data] : response.data;
      changeCursor.value = response.meta.nextCursor;
    }
  } finally {
    loadingMore.value = false;
  }
}

async function applyFilters(): Promise<void> {
  error.value = '';
  try { await Promise.all([loadSummary(), loadTab(false)]); }
  catch (caught) { error.value = caught instanceof ApiError ? caught.message : 'Không thể áp dụng bộ lọc.'; }
}

async function switchTab(next: WorkspaceTab): Promise<void> {
  tab.value = next;
  closeDetails();
  await router.replace({ name: RouteName.projectRiskChange, params: { projectId }, query: { tab: next } });
  await loadTab(false);
}

async function openDeepLink(): Promise<void> {
  if (typeof route.query.riskId === 'string') await openRisk(route.query.riskId);
  else if (typeof route.query.issueId === 'string') await openIssue(route.query.issueId);
  else if (typeof route.query.changeRequestId === 'string') await openChange(route.query.changeRequestId);
  else if (typeof route.query.actionId === 'string') await openAction(route.query.actionId);
}

async function setDetailQuery(values: Record<string, string>): Promise<void> {
  await router.replace({
    name: RouteName.projectRiskChange, params: { projectId }, query: { tab: tab.value, ...values }
  });
}

async function openRisk(riskId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  error.value = '';
  try {
    const [detail, actionPage, auditPage] = await Promise.all([
      riskChangeApi.getRisk(context, projectId, riskId),
      riskChangeApi.listActions(context, projectId, { riskId, limit: 100 }),
      riskChangeApi.listHistory(context, projectId, { sourceType: 'RISK', sourceId: riskId, limit: 50 })
    ]);
    selectedRisk.value = detail.data; selectedIssue.value = null;
    closureCycles.value = detail.closureCycles; closureCursor.value = detail.closureCycleMeta.nextCursor;
    actions.value = actionPage.data; history.value = auditPage.data; historyCursor.value = auditPage.meta.nextCursor;
    showRiskForm.value = true; showIssueForm.value = false; showChangePanel.value = false;
    await setDetailQuery({ riskId });
  } catch (caught) { error.value = caught instanceof ApiError ? caught.message : 'Không thể tải Risk detail.'; }
  finally { busy.value = false; }
}

async function openIssue(issueId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  error.value = '';
  try {
    const [detail, actionPage, auditPage] = await Promise.all([
      riskChangeApi.getIssue(context, projectId, issueId),
      riskChangeApi.listActions(context, projectId, { issueId, limit: 100 }),
      riskChangeApi.listHistory(context, projectId, { sourceType: 'ISSUE', sourceId: issueId, limit: 50 })
    ]);
    selectedIssue.value = detail.data; selectedRisk.value = null;
    closureCycles.value = detail.closureCycles; closureCursor.value = detail.closureCycleMeta.nextCursor;
    actions.value = actionPage.data; history.value = auditPage.data; historyCursor.value = auditPage.meta.nextCursor;
    showIssueForm.value = true; showRiskForm.value = false; showChangePanel.value = false;
    await setDetailQuery({ issueId });
  } catch (caught) { error.value = caught instanceof ApiError ? caught.message : 'Không thể tải Issue detail.'; }
  finally { busy.value = false; }
}

async function openChange(changeId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  error.value = '';
  try {
    selectedChange.value = (await riskChangeApi.getChange(context, projectId, changeId)).data;
    showChangePanel.value = true; showRiskForm.value = false; showIssueForm.value = false;
    await setDetailQuery({ changeRequestId: changeId });
    await loadChangeBaselines(changeId);
  } catch (caught) { error.value = caught instanceof ApiError ? caught.message : 'Không thể tải Change detail.'; }
  finally { busy.value = false; }
}

async function openAction(actionId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  busy.value = true;
  try {
    selectedAction.value = (await riskChangeApi.getAction(context, projectId, actionId)).data;
    const action = selectedAction.value;
    if (action.riskId) {
      let risk = selectedRisk.value?.id === action.riskId ? selectedRisk.value : null;
      if (!risk) risk = (await riskChangeApi.getRisk(context, projectId, action.riskId)).data;
      actionParent.value = { type: 'RISK', id: action.riskId, packageId: action.packageId, riskVersion: risk.versionNo };
    } else if (action.issueId) {
      actionParent.value = { type: 'ISSUE', id: action.issueId, packageId: action.packageId };
    }
    showActionPanel.value = true;
    await setDetailQuery({ actionId });
  } catch (caught) { error.value = caught instanceof ApiError ? caught.message : 'Không thể tải Action detail.'; }
  finally { busy.value = false; }
}

function newRisk(): void { selectedRisk.value = null; showRiskForm.value = true; closeOtherDetails('RISK'); }
function newIssue(): void { selectedIssue.value = null; showIssueForm.value = true; closeOtherDetails('ISSUE'); }
function newChange(seed?: ChangeSource): void {
  selectedChange.value = null; sourceSeed.value = seed; showChangePanel.value = true;
  showRiskForm.value = false; showIssueForm.value = false;
  if (tab.value !== 'changes') void switchTab('changes').then(() => { showChangePanel.value = true; sourceSeed.value = seed; });
}
function newAction(): void {
  const parent = selectedRisk.value
    ? { type: 'RISK' as const, id: selectedRisk.value.id, packageId: selectedRisk.value.packageId, riskVersion: selectedRisk.value.versionNo }
    : selectedIssue.value
      ? { type: 'ISSUE' as const, id: selectedIssue.value.id, packageId: selectedIssue.value.packageId }
      : null;
  if (!parent) return;
  actionParent.value = parent; selectedAction.value = null; showActionPanel.value = true;
}

function closeOtherDetails(keep: 'RISK' | 'ISSUE'): void {
  if (keep !== 'RISK') showRiskForm.value = false;
  if (keep !== 'ISSUE') showIssueForm.value = false;
  showChangePanel.value = false;
}

function closeDetails(): void {
  showRiskForm.value = false; showIssueForm.value = false; showChangePanel.value = false;
  showActionPanel.value = false; selectedRisk.value = null; selectedIssue.value = null;
  selectedChange.value = null; selectedAction.value = null; sourceSeed.value = undefined;
  closureCycles.value = []; actions.value = []; history.value = []; baselines.value = [];
}

async function closeDetailAndRoute(): Promise<void> {
  closeDetails();
  await router.replace({ name: RouteName.projectRiskChange, params: { projectId }, query: { tab: tab.value } });
}

async function closeActionPanel(): Promise<void> {
  showActionPanel.value = false;
  selectedAction.value = null;
  actionParent.value = null;
  const parentQuery = selectedRisk.value ? { riskId: selectedRisk.value.id }
    : selectedIssue.value ? { issueId: selectedIssue.value.id } : {};
  await router.replace({
    name: RouteName.projectRiskChange, params: { projectId },
    query: { tab: tab.value, ...parentQuery }
  });
}

async function mutate(action: () => Promise<void>, message: string): Promise<boolean> {
  busy.value = true; error.value = ''; success.value = ''; mutationConflict.value = false;
  try { await action(); success.value = message; await Promise.all([loadSummary(), loadTab(false)]); return true; }
  catch (caught) {
    const apiError = caught instanceof ApiError ? caught : null;
    error.value = apiError?.message ?? 'Không thể hoàn thành command.';
    mutationConflict.value = apiError?.status === 409;
    return false;
  } finally { busy.value = false; }
}

async function createRisk(input: CreateRiskRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  let id = '';
  if (await mutate(async () => { id = (await riskChangeApi.createRisk(context, projectId, input, crypto.randomUUID())).data.id; }, 'Risk đã được tạo cùng audit/outbox.')) await openRisk(id);
}
async function updateRisk(id: string, input: UpdateRiskRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { selectedRisk.value = (await riskChangeApi.updateRisk(context, projectId, id, input, crypto.randomUUID())).data; }, 'Risk đã được cập nhật.')) await openRisk(id);
}
async function createIssue(input: CreateIssueRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return; let id = '';
  if (await mutate(async () => { id = (await riskChangeApi.createIssue(context, projectId, input, crypto.randomUUID())).data.id; }, 'Issue đã được tạo.')) await openIssue(id);
}
async function updateIssue(id: string, input: UpdateIssueRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { selectedIssue.value = (await riskChangeApi.updateIssue(context, projectId, id, input, crypto.randomUUID())).data; }, 'Issue đã được cập nhật.')) await openIssue(id);
}
async function decideRiskClosure(input: ClosureDecisionRequest): Promise<void> {
  const context = auth.apiContext; const risk = selectedRisk.value; if (!context || !risk) return;
  if (await mutate(async () => { await riskChangeApi.decideRiskClosure(context, projectId, risk.id, input, crypto.randomUUID()); }, 'Risk closure decision đã được ghi.')) await openRisk(risk.id);
}
async function decideIssueClosure(input: ClosureDecisionRequest): Promise<void> {
  const context = auth.apiContext; const issue = selectedIssue.value; if (!context || !issue) return;
  if (await mutate(async () => { await riskChangeApi.decideIssueClosure(context, projectId, issue.id, input, crypto.randomUUID()); }, 'Issue closure decision đã được ghi.')) await openIssue(issue.id);
}

async function createAction(input: CreateRiskIssueActionRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return; let id = '';
  if (await mutate(async () => { id = (await riskChangeApi.createAction(context, projectId, input, crypto.randomUUID())).data.id; }, 'Action đã được tạo trong parent scope.')) await openAction(id);
}
async function updateAction(id: string, input: UpdateRiskIssueActionFieldsRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.updateActionFields(context, projectId, id, input, crypto.randomUUID()); }, 'Action đã được cập nhật.')) await openAction(id);
}
async function completeAction(id: string, input: CompleteRiskIssueActionRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.completeAction(context, projectId, id, input, crypto.randomUUID()); }, 'Action DONE đã lưu completion evidence.')) await openAction(id);
}
async function verifyAction(id: string, input: VerifyRiskIssueActionRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.verifyAction(context, projectId, id, input, crypto.randomUUID()); }, 'Action VERIFIED độc lập đã được ghi.')) await openAction(id);
}
async function cancelAction(id: string, input: CancelRiskIssueActionRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.cancelAction(context, projectId, id, input, crypto.randomUUID()); }, 'Action CANCELLED độc lập đã được ghi.')) await openAction(id);
}

async function createChange(input: CreateChangeRequestRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return; let id = '';
  if (await mutate(async () => { id = (await riskChangeApi.createChange(context, projectId, input, crypto.randomUUID())).data.id; }, 'Change draft đã được tạo với source snapshot.')) await openChange(id);
}
async function updateChange(id: string, input: UpdateChangeRequestRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.updateChange(context, projectId, id, input, crypto.randomUUID()); }, 'Change assessment draft đã được lưu.')) await openChange(id);
}
async function submitChange(id: string, version: number, comment: string): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.submitChange(context, projectId, id, version, comment, crypto.randomUUID()); }, 'Change đã được submit với immutable impact snapshot.')) await openChange(id);
}
async function decideChange(id: string, input: ChangeDecisionRequest): Promise<void> {
  const context = auth.apiContext; if (!context) return;
  if (await mutate(async () => { await riskChangeApi.decideChange(context, projectId, id, input, crypto.randomUUID()); }, 'Change decision độc lập đã được ghi.')) await openChange(id);
}

async function loadMoreClosure(): Promise<void> {
  const context = auth.apiContext; if (!context || !closureCursor.value) return;
  closureLoading.value = true;
  try {
    const response = selectedRisk.value
      ? await riskChangeApi.getRisk(context, projectId, selectedRisk.value.id, closureCursor.value)
      : selectedIssue.value
        ? await riskChangeApi.getIssue(context, projectId, selectedIssue.value.id, closureCursor.value)
        : null;
    if (response) {
      const known = new Set(closureCycles.value.map((item) => item.id));
      closureCycles.value.push(...response.closureCycles.filter((item) => !known.has(item.id)));
      closureCursor.value = response.closureCycleMeta.nextCursor;
    }
  } finally { closureLoading.value = false; }
}

async function loadMoreHistory(): Promise<void> {
  const context = auth.apiContext; if (!context || !historyCursor.value) return;
  const sourceType = selectedRisk.value ? 'RISK' : selectedIssue.value ? 'ISSUE' : null;
  const sourceId = selectedRisk.value?.id ?? selectedIssue.value?.id;
  if (!sourceType || !sourceId) return;
  const response = await riskChangeApi.listHistory(context, projectId, {
    sourceType, sourceId, cursor: historyCursor.value, limit: 50
  });
  history.value.push(...response.data); historyCursor.value = response.meta.nextCursor;
}

async function loadChangeBaselines(changeId: string): Promise<void> {
  const context = auth.apiContext;
  if (!context || !auth.hasFullProjectPermission(
    'schedule.read', projectId, project.value?.portfolioId
  )) { baselines.value = []; return; }
  try { baselines.value = (await scheduleApi.listBaselinesByApprovedChange(context, projectId, changeId)).data; }
  catch { baselines.value = []; }
}

async function openRebaseline(changeId: string): Promise<void> {
  await router.push({
    name: RouteName.projectSchedule, params: { projectId },
    query: { approvedChangeRequestId: changeId }
  });
}

watch(() => route.query.tab, (value) => { tab.value = normalizeTab(value); });
onMounted(() => void loadWorkspace());
</script>

<template>
  <AppLayout>
    <section class="page-heading risk-change-heading">
      <div><p class="eyebrow eyebrow--accent">US-004 · RISK / ISSUE / CHANGE</p><h1>{{ project?.name ?? 'Risk & Change Control' }}</h1><p class="lead">Separate registers, linked traceability, independent decisions và immutable evidence history.</p></div>
      <div class="page-heading__actions"><el-button v-if="auth.can('schedule.read')" @click="router.push({ name: RouteName.projectSchedule, params: { projectId } })">WBS &amp; Schedule</el-button><el-button v-if="auth.can('project.read')" @click="router.push({ name: RouteName.projectDetail, params: { projectId } })">Project Master</el-button><el-button :loading="loading" @click="loadWorkspace">Làm mới</el-button></div>
    </section>
    <div class="scope-banner"><span>Tenant: {{ auth.tenant?.code }}</span><span>Project: {{ projectId }}</span><span>{{ fullProject ? 'Full-project UI scope' : 'Exact-package UI scope' }}</span><strong>Server luôn re-authorize command.</strong></div>
    <el-alert v-if="success" type="success" :title="success" show-icon />
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <section v-if="mutationConflict" class="schedule-inline-conflict"><div><strong>Version conflict</strong><p>Form đang nhập được giữ nguyên. Tải record mới trước khi gửi lại.</p></div><el-button @click="loadWorkspace">Tải version mới</el-button></section>

    <div v-if="loading" class="risk-change-loading" aria-live="polite"><span></span><span></span><span></span><p>Đang tải authorized Risk/Issue/Change projection…</p></div>
    <section v-else-if="screenState === 'denied'" class="schedule-state-panel"><span>🔒</span><h2>Không có quyền xem workspace</h2><p>Không hiển thị count, title hoặc filter option ngoài scope.</p></section>
    <section v-else-if="screenState === 'error'" class="schedule-state-panel"><span>!</span><h2>Không thể tải workspace</h2><p>{{ error }}</p><el-button @click="loadWorkspace">Thử lại</el-button></section>
    <template v-else>
      <form class="risk-change-toolbar" @submit.prevent="applyFilters">
        <label>Package<select v-model="filters.packageId"><option value="">Authorized scope</option><option v-for="item in packages" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
        <label>Owner ID<input v-model.trim="filters.ownerId" placeholder="Optional stable UUID" /></label>
        <label v-if="tab === 'risks'">Risk status<select v-model="filters.riskStatus"><option value="">Tất cả</option><option v-for="item in ['IDENTIFIED','ASSESSED','TREATING','MONITORING','CLOSURE_PENDING','CLOSED','OCCURRED']" :key="item" :value="item">{{ item }}</option></select></label>
        <label v-if="tab === 'risks'">Category<input v-model.trim="filters.riskCategory" /></label>
        <label v-if="tab === 'risks'">Review before<input v-model="filters.reviewBefore" type="date" /></label>
        <label v-if="tab === 'issues'">Issue status<select v-model="filters.issueStatus"><option value="">Tất cả</option><option v-for="item in ['REPORTED','TRIAGED','IN_PROGRESS','RESOLVED','CLOSURE_PENDING','CLOSED','REOPENED']" :key="item" :value="item">{{ item }}</option></select></label>
        <label v-if="tab === 'issues'">Severity<select v-model="filters.severity"><option value="">Tất cả</option><option v-for="item in ['LOW','MEDIUM','HIGH','CRITICAL']" :key="item" :value="item">{{ item }}</option></select></label>
        <label v-if="tab === 'issues'">Target before<input v-model="filters.targetBefore" type="date" /></label>
        <label v-if="tab === 'changes'">Change status<select v-model="filters.changeStatus"><option value="">Tất cả</option><option v-for="item in ['DRAFT','ASSESSED','SUBMITTED','APPROVED','RETURNED','REJECTED','IMPLEMENTED','CLOSED']" :key="item" :value="item">{{ item }}</option></select></label>
        <label v-if="tab === 'changes'">Source<select v-model="filters.changeSourceType"><option value="">Tất cả</option><option value="MANUAL">MANUAL</option><option value="RISK">RISK</option><option value="ISSUE">ISSUE</option></select></label>
        <el-button native-type="submit">Áp dụng</el-button>
      </form>

      <RiskChangeSummaryPanel v-if="summary" :summary="summary" @open-risk="openRisk" @open-issue="openIssue" @open-action="openAction" @open-change="openChange" />

      <nav class="risk-change-tabs" aria-label="Risk and Change register tabs"><button type="button" :aria-current="tab === 'risks' ? 'page' : undefined" @click="switchTab('risks')">Risk Register</button><button type="button" :aria-current="tab === 'issues' ? 'page' : undefined" @click="switchTab('issues')">Issue Register</button><button type="button" :aria-current="tab === 'changes' ? 'page' : undefined" @click="switchTab('changes')">Change Control</button></nav>

      <section v-if="tab === 'risks'" class="register-panel"><div class="section-heading"><div><h2>Risk Register</h2><p>Inherent và nullable residual score luôn tách rõ cùng version.</p></div><el-button v-if="canCreate" type="primary" @click="newRisk">Tạo Risk</el-button></div><div v-if="!risks.length" class="empty-panel"><h3>Không có Risk phù hợp</h3><p>Đổi bộ lọc hoặc tạo Risk đầu tiên.</p></div><div v-else class="table-shell"><table class="data-table"><thead><tr><th>Code / category</th><th>Owner</th><th>Inherent</th><th>Residual</th><th>Review</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="item in risks" :key="item.id"><td><strong>{{ item.code }}</strong><span>{{ item.category }} · {{ item.scoringVersion }}</span></td><td>{{ item.ownerId }}</td><td>{{ item.inherentExposure }} · {{ item.inherentLevel }}</td><td>{{ item.residualExposure ?? 'Chưa đánh giá' }}<span>{{ item.residualLevel ?? 'N/A' }}</span></td><td>{{ item.reviewDate }}</td><td><span class="status-pill" :data-status="item.status">{{ item.status }}</span></td><td><el-button text @click="openRisk(item.id)">Mở</el-button></td></tr></tbody></table></div><el-button v-if="riskCursor" :loading="loadingMore" @click="loadTab(true)">Tải thêm Risk</el-button></section>

      <section v-else-if="tab === 'issues'" class="register-panel"><div class="section-heading"><div><h2>Issue Register</h2><p>Actual impact/root cause tách khỏi Risk probability.</p></div><el-button v-if="canCreate" type="primary" @click="newIssue">Báo cáo Issue</el-button></div><div v-if="!issues.length" class="empty-panel"><h3>Không có Issue phù hợp</h3><p>Đổi bộ lọc hoặc báo cáo Issue đầu tiên.</p></div><div v-else class="table-shell"><table class="data-table"><thead><tr><th>Code / title</th><th>Severity</th><th>Owner</th><th>Target</th><th>Source Risk</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="item in issues" :key="item.id"><td><strong>{{ item.code }}</strong><span>{{ item.title }}</span></td><td>{{ item.severity }}</td><td>{{ item.ownerId }}</td><td>{{ item.targetDate }}</td><td>{{ item.sourceRiskId ?? '—' }}</td><td><span class="status-pill" :data-status="item.status">{{ item.status }}</span></td><td><el-button text @click="openIssue(item.id)">Mở</el-button></td></tr></tbody></table></div><el-button v-if="issueCursor" :loading="loadingMore" @click="loadTab(true)">Tải thêm Issue</el-button></section>

      <section v-else class="register-panel"><div class="section-heading"><div><h2>Change Control</h2><p>Six-dimension assessment, immutable approval và rebaseline provenance.</p></div><el-button v-if="canCreate" type="primary" @click="newChange()">Tạo Change</el-button></div><div v-if="!changes.length" class="empty-panel"><h3>Không có Change phù hợp</h3><p>Đổi bộ lọc hoặc tạo Change draft.</p></div><div v-else class="table-shell"><table class="data-table"><thead><tr><th>Code / title</th><th>Source</th><th>Requester / owner</th><th>Submitted</th><th>Status</th><th>Rebaseline</th><th></th></tr></thead><tbody><tr v-for="item in changes" :key="item.id"><td><strong>{{ item.code }}</strong><span>{{ item.title }}</span></td><td>{{ item.source.type }}</td><td>{{ item.requesterId }}<span>{{ item.ownerId }}</span></td><td>{{ item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('vi-VN') : '—' }}</td><td><span class="status-pill" :data-status="item.status">{{ item.status }}</span></td><td>{{ item.scheduleImpactApproved ? 'Approved impact' : '—' }}</td><td><el-button text @click="openChange(item.id)">Mở</el-button></td></tr></tbody></table></div><el-button v-if="changeCursor" :loading="loadingMore" @click="loadTab(true)">Tải thêm Change</el-button></section>

      <RiskForm v-if="showRiskForm" :project-id="projectId" :risk="selectedRisk" :package-options="selectedRisk ? packageOptions : createPackageOptions" :full-project="selectedRisk ? canManageFullProject : canCreateFullProject" :editable="selectedRisk ? canManage : canCreate" :closure-permission="canRequestRiskClosure" :busy="busy" @close="closeDetailAndRoute" @create="createRisk" @update="updateRisk" />
      <IssueForm v-if="showIssueForm" :project-id="projectId" :issue="selectedIssue" :package-options="selectedIssue ? packageOptions : createPackageOptions" :full-project="canCreateFullProject" :editable="selectedIssue ? canManage : canCreate" :closure-permission="canRequestIssueClosure" :busy="busy" @close="closeDetailAndRoute" @create="createIssue" @update="updateIssue" />

      <template v-if="selectedRisk || selectedIssue">
        <section class="linked-actions"><div class="section-heading"><div><h3>Linked Actions</h3><p>Chỉ VERIFIED hoặc authorized CANCELLED mới thỏa closure.</p></div><el-button v-if="canManage" @click="newAction">Tạo Action</el-button></div><div class="table-shell"><table class="data-table"><thead><tr><th>Code / title</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody><tr v-for="item in actions" :key="item.id"><td><strong>{{ item.code }}</strong><span>{{ item.title }}</span></td><td>{{ item.ownerId }}</td><td>{{ item.dueDate }}</td><td>{{ item.status }}</td><td><el-button text @click="openAction(item.id)">Mở</el-button></td></tr><tr v-if="!actions.length"><td colspan="5">Chưa có Action.</td></tr></tbody></table></div></section>
        <ClosureCycleTimeline :cycles="closureCycles" :next-cursor="closureCursor" :loading="closureLoading" @load-more="loadMoreClosure" />
        <ClosureDecisionPanel v-if="selectedRisk?.status === 'CLOSURE_PENDING' && canDecideRiskClosure" kind="Risk" :expected-version="selectedRisk.versionNo" :busy="busy" @decide="decideRiskClosure" />
        <ClosureDecisionPanel v-if="selectedIssue?.status === 'CLOSURE_PENDING' && canDecideIssueClosure" kind="Issue" :expected-version="selectedIssue.versionNo" :busy="busy" @decide="decideIssueClosure" />
        <section class="audit-history"><div class="section-heading"><div><h3>Redacted audit history</h3><p>DB-098 audit tách khỏi closure evidence cycles.</p></div><strong>{{ history.length }}</strong></div><ol><li v-for="item in history" :key="item.id"><strong>{{ item.eventType }} · v{{ item.versionNo }}</strong><span>{{ item.summary }}</span><small>{{ new Date(item.occurredAt).toLocaleString('vi-VN') }}</small></li></ol><el-button v-if="historyCursor" @click="loadMoreHistory">Tải thêm audit</el-button></section>
        <div class="form-actions"><el-button v-if="selectedRisk && canCreate" @click="newChange({ type: 'RISK', riskId: selectedRisk.id })">Tạo Change từ Risk</el-button><el-button v-if="selectedIssue && canCreate" @click="newChange({ type: 'ISSUE', issueId: selectedIssue.id })">Tạo Change từ Issue</el-button></div>
      </template>

      <RiskIssueActionPanel v-if="showActionPanel && actionParent" :project-id="projectId" :parent="actionParent" :action="selectedAction" :full-project="canManageFullProject" :actor-id="auth.user?.id" :can-manage="canManage" :busy="busy" @close="closeActionPanel" @create="createAction" @update="updateAction" @complete="completeAction" @verify="verifyAction" @cancel="cancelAction" />
      <ChangeRequestPanel v-if="showChangePanel" :project-id="projectId" :change="selectedChange" :source-seed="sourceSeed" :package-options="selectedChange ? packageOptions : createPackageOptions" :baselines="baselines" :full-project="canCreateFullProject" :can-rebaseline="canRebaselineChange" :actor-id="auth.user?.id" :can-manage="selectedChange ? canManage : canCreate" :can-submit="canSubmitChange" :can-approve="canApproveChange" :busy="busy" @close="closeDetailAndRoute" @create="createChange" @update="updateChange" @submit="submitChange" @decide="decideChange" @rebaseline="openRebaseline" @load-baselines="loadChangeBaselines" />
      <p class="boundary-note"><strong>Ranh giới an toàn:</strong> Workspace chỉ quản lý project risk/change và không tạo bất kỳ lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.</p>
    </template>
  </AppLayout>
</template>
