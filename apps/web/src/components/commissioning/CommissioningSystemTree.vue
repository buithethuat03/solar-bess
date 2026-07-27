<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  COMMISSIONING_CODE_PATTERN, COMMISSIONING_SYSTEM_STATUS_LABEL, SYSTEM_TYPE_PATTERN
} from '@/constants/commissioning';
import type {
  CommissioningSystemView, CreateCommissioningSystemRequest
} from '@/types/commissioning.types';

const props = defineProps<{
  systems: CommissioningSystemView[];
  selectedId: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  busy: boolean;
  permissions: { create: boolean };
}>();
const emit = defineEmits<{
  select: [systemId: string];
  more: [];
  create: [input: CreateCommissioningSystemRequest];
}>();

const error = ref('');
const showCreate = ref(false);
const form = reactive({ code: '', name: '', systemType: '', parentSystemId: '' });

interface TreeNode { system: CommissioningSystemView; depth: number }

/**
 * Cây hệ thống dựng từ `parentSystemId`. Một node có cha nằm ngoài trang hiện tại vẫn phải hiển
 * thị: phân trang là chuyện của truyền tải, không phải lý do để giấu một ranh giới hệ thống. Node
 * như vậy được nâng lên gốc và đánh dấu là mồ côi trong trang.
 */
const tree = computed<TreeNode[]>(() => {
  const known = new Set(props.systems.map((system) => system.id));
  const childrenOf = new Map<string | null, CommissioningSystemView[]>();
  for (const system of props.systems) {
    const parent = system.parentSystemId !== null && known.has(system.parentSystemId)
      ? system.parentSystemId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), system]);
  }
  const ordered: TreeNode[] = [];
  const walk = (parent: string | null, depth: number): void => {
    const children = [...(childrenOf.get(parent) ?? [])]
      .sort((left, right) => left.code.localeCompare(right.code));
    for (const system of children) {
      ordered.push({ system, depth });
      walk(system.id, depth + 1);
    }
  };
  walk(null, 0);
  return ordered;
});

function isOrphan(system: CommissioningSystemView): boolean {
  return system.parentSystemId !== null
    && !props.systems.some((item) => item.id === system.parentSystemId);
}

function submit(): void {
  error.value = '';
  if (!COMMISSIONING_CODE_PATTERN.test(form.code)) {
    error.value = 'Mã system phải viết hoa, bắt đầu bằng chữ hoặc số, tối đa 80 ký tự.';
    return;
  }
  if (form.name.trim().length < 3) {
    error.value = 'Tên system phải có ít nhất 3 ký tự.';
    return;
  }
  if (!SYSTEM_TYPE_PATTERN.test(form.systemType)) {
    error.value = 'Loại system phải viết hoa, bắt đầu bằng chữ cái (VD: PV_ARRAY, BESS).';
    return;
  }
  emit('create', {
    code: form.code.trim(), name: form.name.trim(), systemType: form.systemType.trim(),
    ...(form.parentSystemId ? { parentSystemId: form.parentSystemId } : {})
  });
  showCreate.value = false;
}
</script>

<template>
  <section class="commissioning-panel system-tree" aria-labelledby="system-tree-title">
    <div class="detail-heading">
      <div>
        <small>SYSTEM REGISTER · API-098 / API-099 · DB-073</small>
        <h2 id="system-tree-title">Cây hệ thống nghiệm thu</h2>
        <p class="lead">
          Ranh giới hệ thống và hệ thống con của dự án. Hệ thống con phải nằm cùng dự án với hệ
          thống cha.
        </p>
      </div>
      <el-button v-if="permissions.create" @click="showCreate = !showCreate">Thêm system</el-button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <form v-if="showCreate && permissions.create" class="commissioning-form" @submit.prevent="submit">
      <label>Mã system<input v-model.trim="form.code" required maxlength="80" placeholder="PV-01" /></label>
      <label>Tên system<input v-model.trim="form.name" required maxlength="250" /></label>
      <label>Loại system<input v-model.trim="form.systemType" required maxlength="40" placeholder="PV_ARRAY" /></label>
      <label>System cha<select v-model="form.parentSystemId" aria-label="System cha"><option value="">Không có (hệ thống gốc)</option><option v-for="item in systems" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select></label>
      <el-button native-type="submit" type="primary" :loading="busy">Lưu system</el-button>
    </form>

    <div v-if="!tree.length" class="empty-panel">
      <h3>Chưa có hệ thống nghiệm thu nào</h3>
      <p>Không có ranh giới hệ thống nào trong scope được cấp cho bạn.</p>
    </div>
    <ul v-else class="system-tree__list">
      <li
        v-for="node in tree"
        :key="node.system.id"
        :data-depth="node.depth"
        :data-selected="node.system.id === selectedId"
      >
        <button type="button" class="system-tree__node" @click="emit('select', node.system.id)">
          <span class="system-tree__code">{{ node.system.code }}</span>
          <span class="system-tree__name">{{ node.system.name }}</span>
          <span class="system-tree__type">{{ node.system.systemType }}</span>
          <span class="status-pill" :data-status="node.system.status">
            {{ COMMISSIONING_SYSTEM_STATUS_LABEL[node.system.status] }}
          </span>
          <span v-if="isOrphan(node.system)" class="system-tree__orphan">cha ngoài trang này</span>
        </button>
      </li>
    </ul>
    <el-button v-if="nextCursor" :loading="loadingMore" @click="emit('more')">
      Tải thêm system
    </el-button>
  </section>
</template>
