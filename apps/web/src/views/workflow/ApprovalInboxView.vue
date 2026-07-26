<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ApiError } from '@/api/api-error';
import { workflowApi } from '@/api/workflow.api';
import ApprovalTaskList from '@/components/workflow/ApprovalTaskList.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  ApprovalDecisionView, WorkflowInstanceView, WorkflowPageMeta
} from '@/types/workflow.types';

const auth = useAuthStore();

const items = ref<WorkflowInstanceView[]>([]);
const meta = ref<WorkflowPageMeta | null>(null);
const selected = ref<WorkflowInstanceView | null>(null);
const decisions = ref<ApprovalDecisionView[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');

const canDecide = computed(() => auth.can('approval.decide'));

async function load(cursor?: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await workflowApi.listApprovalTasks(context, { cursor });
    items.value = cursor ? [...items.value, ...response.data] : response.data;
    meta.value = response.meta;
  } catch (cause) {
    error.value = message(cause, 'Không tải được hàng chờ phê duyệt.');
  } finally {
    loading.value = false;
  }
}

async function open(item: WorkflowInstanceView): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  error.value = '';
  try {
    const response = await workflowApi.getInstance(context, item.id);
    selected.value = response.data;
    decisions.value = response.decisions;
  } catch (cause) {
    error.value = message(cause, 'Không mở được workflow instance.');
  }
}

async function decide(payload: { decision: 'APPROVE' | 'REJECT' | 'RETURN'; comment: string }): Promise<void> {
  const context = auth.apiContext;
  const current = selected.value;
  if (!context || !current || busy.value) return;
  if (payload.comment.length < 3) {
    error.value = 'Lý do quyết định phải có ít nhất 3 ký tự.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await workflowApi.recordDecision(context, current.id, {
      decision: payload.decision,
      stepKey: current.currentStepKey ?? '',
      // The server rejects a stale version rather than overwriting a concurrent decision.
      expectedVersion: current.versionNo,
      comment: payload.comment
    }, crypto.randomUUID());
    await load();
    await open(current);
  } catch (cause) {
    error.value = message(cause, 'Không ghi được quyết định.');
    // Refresh so the operator sees the state that actually won the race.
    await open(current).catch(() => undefined);
  } finally {
    busy.value = false;
  }
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

function loadMore(): void {
  if (meta.value?.nextCursor) void load(meta.value.nextCursor);
}

function close(): void {
  selected.value = null;
  decisions.value = [];
}

onMounted(() => { void load(); });
</script>

<template>
  <AppLayout>
    <ApprovalTaskList
      :items="items"
      :meta="meta"
      :selected="selected"
      :decisions="decisions"
      :loading="loading"
      :busy="busy"
      :error="error"
      :can-decide="canDecide"
      @open="open"
      @decide="decide"
      @more="loadMore"
      @retry="() => load()"
      @close="close"
    />
  </AppLayout>
</template>
