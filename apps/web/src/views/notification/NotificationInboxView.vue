<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { notificationApi } from '@/api/notification.api';
import { ApiError } from '@/api/api-error';
import NotificationInbox from '@/components/notification/NotificationInbox.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AppNotification, NotificationPageMeta, NotificationStatus
} from '@/types/notification.types';

const auth = useAuthStore();
const router = useRouter();

const items = ref<AppNotification[]>([]);
const meta = ref<NotificationPageMeta | null>(null);
const loading = ref(false);
const error = ref('');
const statusFilter = ref<NotificationStatus | ''>('');
const acknowledging = ref('');

async function load(cursor?: string): Promise<void> {
  const context = auth.apiContext;
  if (!context) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await notificationApi.list(context, {
      cursor,
      status: statusFilter.value || undefined
    });
    items.value = cursor ? [...items.value, ...response.data] : response.data;
    meta.value = response.meta;
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'Không tải được notification.';
  } finally {
    loading.value = false;
  }
}

async function acknowledge(item: AppNotification): Promise<void> {
  const context = auth.apiContext;
  if (!context || acknowledging.value) return;
  acknowledging.value = item.id;
  error.value = '';
  try {
    const response = await notificationApi.acknowledge(context, item.id, crypto.randomUUID());
    // Replace in place so the reader keeps their scroll position, then refresh the badge counters
    // from the server rather than decrementing locally, because another session may have changed
    // them too.
    items.value = items.value.map((row) => (row.id === item.id ? response.data : row));
    await load();
  } catch (cause) {
    error.value = cause instanceof ApiError
      ? cause.message
      : 'Không đánh dấu được notification.';
  } finally {
    acknowledging.value = '';
  }
}

function open(item: AppNotification): void {
  void router.push(item.objectLink);
}

function loadMore(): void {
  if (meta.value?.nextCursor) void load(meta.value.nextCursor);
}

watch(statusFilter, () => { void load(); });
onMounted(() => { void load(); });
</script>

<template>
  <AppLayout>
    <NotificationInbox
      v-model:status-filter="statusFilter"
      :items="items"
      :meta="meta"
      :loading="loading"
      :error="error"
      :acknowledging="acknowledging"
      @open="open"
      @acknowledge="acknowledge"
      @more="loadMore"
      @retry="() => load()"
    />
  </AppLayout>
</template>
