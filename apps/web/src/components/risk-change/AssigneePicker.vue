<script setup lang="ts">
import { ref, watch } from 'vue';
import { ApiError } from '@/api/api-error';
import { userApi } from '@/api/user.api';
import { useAuthStore } from '@/stores/auth.store';
import type { UserAssignee } from '@/types/user.types';

const props = defineProps<{
  modelValue: string;
  projectId: string;
  packageId?: string;
  requiredPermission: 'riskChange.read' | 'riskChange.manage';
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const auth = useAuthStore();
const search = ref('');
const items = ref<UserAssignee[]>([]);
const loading = ref(false);
const error = ref('');

async function load(): Promise<void> {
  if (!auth.apiContext || !auth.can('user.read')) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await userApi.listAssignees(auth.apiContext, {
      projectId: props.projectId,
      ...(props.packageId ? { packageId: props.packageId } : {}),
      requiredPermission: props.requiredPermission,
      ...(search.value.trim() ? { search: search.value.trim() } : {}),
      limit: 50
    });
    items.value = response.data;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Không thể tải assignee trong scope.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.packageId, () => {
  items.value = [];
  emit('update:modelValue', '');
});
</script>

<template>
  <div class="assignee-picker">
    <div v-if="auth.can('user.read')" class="assignee-picker__search">
      <input v-model.trim="search" aria-label="Tìm assignee" placeholder="Tìm tên assignee" :disabled="disabled" @keyup.enter="load" />
      <el-button native-type="button" :loading="loading" :disabled="disabled" @click="load">Tìm</el-button>
    </div>
    <select
      :value="modelValue"
      aria-label="Assignee"
      required
      :disabled="disabled"
      @focus="items.length || load()"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option disabled value="">Chọn assignee trong scope</option>
      <option v-for="item in items" :key="item.id" :value="item.id">{{ item.displayName }}</option>
      <option v-if="modelValue && !items.some((item) => item.id === modelValue)" :value="modelValue">Assignee hiện tại</option>
    </select>
    <small v-if="error" class="field-error">{{ error }}</small>
    <small v-else-if="!auth.can('user.read')" class="muted-inline">Bạn không có quyền tìm directory; stable owner ID hiện tại vẫn được giữ.</small>
  </div>
</template>
