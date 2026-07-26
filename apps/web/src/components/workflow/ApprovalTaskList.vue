<script setup lang="ts">
import { computed } from 'vue';
import type {
  ApprovalDecisionView, WorkflowInstanceView, WorkflowPageMeta
} from '@/types/workflow.types';

const props = defineProps<{
  items: WorkflowInstanceView[];
  meta: WorkflowPageMeta | null;
  selected: WorkflowInstanceView | null;
  decisions: ApprovalDecisionView[];
  loading: boolean;
  busy: boolean;
  error: string;
  canDecide: boolean;
}>();

const emit = defineEmits<{
  open: [item: WorkflowInstanceView];
  decide: [payload: { decision: 'APPROVE' | 'REJECT' | 'RETURN'; comment: string }];
  more: [];
  retry: [];
  close: [];
}>();

const stateLabels: Record<string, string> = {
  SUBMITTED: 'Chờ tiếp nhận',
  IN_REVIEW: 'Đang xem xét',
  RETURNED: 'Đã trả lại',
  CONDITIONALLY_APPROVED: 'Duyệt có điều kiện',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  CONFIGURATION_ERROR: 'Lỗi cấu hình',
  EXPIRED: 'Hết hạn'
};

const decisionLabels: Record<string, string> = {
  APPROVE: 'Phê duyệt', REJECT: 'Từ chối', RETURN: 'Trả lại',
  CONDITIONAL_APPROVE: 'Duyệt có điều kiện'
};

const hasMore = computed(() => Boolean(props.meta?.nextCursor));

function stateLabel(state: string): string {
  return stateLabels[state] ?? state;
}

function submit(decision: 'APPROVE' | 'REJECT' | 'RETURN', event: Event): void {
  const form = (event.target as HTMLElement).closest('form');
  const field = form?.querySelector<HTMLTextAreaElement>('textarea[name="comment"]');
  emit('decide', { decision, comment: field?.value.trim() ?? '' });
}
</script>

<template>
  <section class="approval-inbox" aria-labelledby="approval-inbox-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow eyebrow--accent">US-015 · APPROVAL ENGINE</p>
        <h2 id="approval-inbox-title">Hàng chờ phê duyệt</h2>
        <p>
          Chỉ hiển thị workflow instance còn mở trong phạm vi bạn được phép.
          Mọi quyết định đều cần lý do và được ghi bất biến.
        </p>
      </div>
      <el-button :loading="loading" @click="emit('retry')">Làm mới</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="loading && !items.length" class="loading-panel">Đang tải hàng chờ phê duyệt…</div>
    <div v-else-if="!items.length" class="empty-panel">
      <h3>Không có việc chờ phê duyệt</h3>
      <p>Bản ghi ngoài phạm vi hiện tại không được suy ra thành số đếm bằng không.</p>
    </div>

    <div v-else class="approval-inbox__layout">
      <ul class="approval-inbox__list">
        <li v-for="item in items" :key="item.id" :data-state="item.state">
          <button
            type="button"
            :aria-current="selected?.id === item.id ? 'true' : undefined"
            @click="emit('open', item)"
          >
            <span class="approval-inbox__state">{{ stateLabel(item.state) }}</span>
            <strong>{{ item.objectType }} · {{ item.objectId.slice(0, 8) }}</strong>
            <small>Bước {{ item.currentStepKey ?? '—' }} · lần {{ item.currentAttemptNo }}</small>
          </button>
        </li>
      </ul>

      <div v-if="selected" class="approval-inbox__detail">
        <div class="detail-heading">
          <div>
            <small>WORKFLOW INSTANCE</small>
            <h3>{{ selected.objectType }} · {{ selected.objectId }}</h3>
          </div>
          <button type="button" class="text-action" @click="emit('close')">Đóng</button>
        </div>

        <dl class="approval-inbox__facts">
          <div><dt>Trạng thái</dt><dd>{{ stateLabel(selected.state) }}</dd></div>
          <div><dt>Bước hiện tại</dt><dd>{{ selected.currentStepKey ?? '—' }}</dd></div>
          <div><dt>Lần thử</dt><dd>{{ selected.currentAttemptNo }}</dd></div>
          <div><dt>Phiên bản</dt><dd>{{ selected.versionNo }}</dd></div>
        </dl>

        <h4>Lịch sử quyết định</h4>
        <ol v-if="decisions.length" class="approval-inbox__history">
          <li v-for="entry in decisions" :key="entry.id">
            <strong>#{{ entry.sequenceNo }} · {{ decisionLabels[entry.decision] ?? entry.decision }}</strong>
            <small>{{ entry.stepKey }} · lần {{ entry.attemptNo }} · {{ entry.decidedAt }}</small>
            <p>{{ entry.comment }}</p>
          </li>
        </ol>
        <p v-else class="muted">Chưa có quyết định nào được ghi.</p>

        <form v-if="canDecide && !selected.closedAt" class="approval-inbox__decide" @submit.prevent>
          <label>
            Lý do quyết định
            <textarea
              name="comment"
              rows="3"
              required
              minlength="3"
              placeholder="Bắt buộc với mọi quyết định, kể cả phê duyệt"
            />
          </label>
          <div class="approval-inbox__actions">
            <el-button type="primary" :loading="busy" @click="submit('APPROVE', $event)">Phê duyệt</el-button>
            <el-button :loading="busy" @click="submit('RETURN', $event)">Trả lại</el-button>
            <el-button :loading="busy" @click="submit('REJECT', $event)">Từ chối</el-button>
          </div>
        </form>
        <p v-else-if="!canDecide" class="muted">Bạn không có quyền ghi quyết định phê duyệt.</p>
      </div>
    </div>

    <el-button v-if="hasMore" :loading="loading" @click="emit('more')">Tải thêm</el-button>
  </section>
</template>
