<script setup lang="ts">
import { computed } from 'vue';
import type {
  AppNotification, NotificationPageMeta, NotificationStatus
} from '@/types/notification.types';

const props = defineProps<{
  items: AppNotification[];
  meta: NotificationPageMeta | null;
  loading: boolean;
  error: string;
  statusFilter: NotificationStatus | '';
  acknowledging: string;
}>();

const emit = defineEmits<{
  open: [item: AppNotification];
  acknowledge: [item: AppNotification];
  'update:statusFilter': [value: NotificationStatus | ''];
  more: [];
  retry: [];
}>();

const alertLabels: Record<string, string> = {
  OVERDUE: 'Quá hạn',
  NEAR_CRITICAL: 'Sát đường găng',
  RISK_REVIEW_DUE: 'Đến hạn review Risk',
  ISSUE_TARGET_DUE: 'Đến hạn xử lý Issue',
  ACTION_OVERDUE: 'Action quá hạn',
  CHANGE_DECISION_PENDING: 'Change chờ quyết định'
};

const unreadTotal = computed(() => props.meta?.unreadTotal ?? 0);
const unreadHigh = computed(() => props.meta?.unreadHigh ?? 0);
const hasMore = computed(() => Boolean(props.meta?.nextCursor));

function alertLabel(item: AppNotification): string {
  return alertLabels[item.alertType] ?? item.alertType;
}
</script>

<template>
  <section class="notification-inbox" aria-labelledby="notification-inbox-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow eyebrow--accent">US-022 · DB-105 PROJECTION</p>
        <h2 id="notification-inbox-title">Notification inbox</h2>
        <p>
          Cảnh báo schedule, Risk, Issue, Action và Change gửi tới bạn.
          <strong>{{ unreadTotal }}</strong> chưa đọc, trong đó
          <strong>{{ unreadHigh }}</strong> ưu tiên cao.
        </p>
      </div>
      <div class="notification-inbox__controls">
        <label>
          Trạng thái
          <select
            aria-label="Trạng thái"
            :value="statusFilter"
            @change="emit('update:statusFilter', ($event.target as HTMLSelectElement).value as NotificationStatus | '')"
          >
            <option value="">Tất cả</option>
            <option value="UNREAD">UNREAD</option>
            <option value="READ">READ</option>
          </select>
        </label>
        <el-button :loading="loading" @click="emit('retry')">Làm mới</el-button>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="loading && !items.length" class="loading-panel">
      Đang tải notification trong scope được phép…
    </div>
    <div v-else-if="!items.length" class="empty-panel">
      <h3>Không có notification phù hợp</h3>
      <p>Bản ghi ngoài scope hiện tại không được suy ra thành số đếm bằng không.</p>
    </div>
    <ul v-else class="notification-inbox__list">
      <li
        v-for="item in items"
        :key="item.id"
        :data-priority="item.priority"
        :data-status="item.status"
      >
        <button type="button" class="notification-inbox__open" @click="emit('open', item)">
          <span class="notification-inbox__alert">{{ alertLabel(item) }}</span>
          <strong>{{ item.reason }}</strong>
          <small>{{ item.sourceType }} · hạn {{ item.dueAt }} · dữ liệu {{ item.dataDate }}</small>
        </button>
        <el-button
          v-if="item.status === 'UNREAD'"
          :loading="acknowledging === item.id"
          @click="emit('acknowledge', item)"
        >
          Đánh dấu đã đọc
        </el-button>
        <small v-else class="notification-inbox__read">Đã đọc</small>
      </li>
    </ul>

    <el-button v-if="hasMore" :loading="loading" @click="emit('more')">Tải thêm</el-button>
  </section>
</template>
