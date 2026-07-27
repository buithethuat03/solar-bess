<script setup lang="ts">
import { reactive, ref } from 'vue';
import { SAVED_VIEW_TARGET_LABEL, SAVED_VIEW_TARGET_TYPES } from '@/constants/search';
import type {
  CreateSavedViewRequest, SavedViewTargetType, SavedViewView
} from '@/types/search.types';

/**
 * API-131/API-132 — saved views.
 *
 * THERE IS NO SHARE CONTROL, and its absence is the feature. V1 knows exactly one share scope,
 * PRIVATE, enforced by `ck_saved_view_share_scope` and refused with 422 SHARE_SCOPE_NOT_SUPPORTED
 * before a row is written. Sharing a view would republish one person's filter set to another
 * without re-evaluating that person's permissions — so the vocabulary itself makes it impossible,
 * and this panel does not offer a toggle that would suggest otherwise. The panel says so out loud
 * rather than leaving the missing control to be read as an oversight.
 *
 * A saved view stores presentation state (filters, columns, sort). It never stores permission:
 * reopening one re-runs the register query under the caller's own scope.
 */
const props = defineProps<{
  views: SavedViewView[];
  nextCursor: string | null;
  busy: boolean;
  canCreate: boolean;
  /** The current search filters, offered as the snapshot to save. */
  currentFilterSnapshot: Record<string, unknown>;
}>();
const emit = defineEmits<{
  more: [];
  create: [input: CreateSavedViewRequest];
  filter: [targetType: SavedViewTargetType | ''];
}>();

const error = ref('');
const showCreate = ref(false);
const form = reactive({
  name: '', targetType: 'PROJECT' as SavedViewTargetType, targetFilter: '' as SavedViewTargetType | ''
});

function submit(): void {
  error.value = '';
  if (form.name.trim().length < 1) {
    error.value = 'Saved view phải có tên.';
    return;
  }
  // `shareScope` is deliberately never sent: the server assigns PRIVATE and refuses anything else.
  emit('create', {
    name: form.name.trim(), targetType: form.targetType,
    filterSnapshot: props.currentFilterSnapshot
  });
  showCreate.value = false;
  form.name = '';
}
</script>

<template>
  <section class="search-panel saved-view-panel" aria-labelledby="saved-view-title">
    <div class="detail-heading">
      <div>
        <small>SAVED VIEW · API-131/132</small>
        <h2 id="saved-view-title">Saved view của bạn</h2>
        <p class="lead">Lưu bộ lọc, cột và thứ tự sắp xếp — không lưu quyền truy cập.</p>
      </div>
      <el-button v-if="canCreate" @click="showCreate = !showCreate">Lưu view hiện tại</el-button>
    </div>

    <p class="local-only-banner" data-testid="saved-view-private-note">
      <strong>Chỉ riêng tư (PRIVATE).</strong>
      V1 không hỗ trợ chia sẻ saved view và cố tình không có công tắc chia sẻ: chia sẻ sẽ tái phát
      hành bộ lọc của một người cho người khác mà không thẩm định lại quyền của họ. Server từ chối
      mọi phạm vi khác bằng lỗi 422 SHARE_SCOPE_NOT_SUPPORTED.
    </p>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <label class="saved-view-filter">
      Lọc theo register
      <select v-model="form.targetFilter" aria-label="Lọc saved view theo register" @change="emit('filter', form.targetFilter)">
        <option value="">Tất cả register</option>
        <option v-for="item in SAVED_VIEW_TARGET_TYPES" :key="item" :value="item">{{ SAVED_VIEW_TARGET_LABEL[item] }}</option>
      </select>
    </label>

    <form v-if="showCreate && canCreate" class="search-inline-form" @submit.prevent="submit">
      <label>Tên view<input v-model.trim="form.name" required maxlength="200" /></label>
      <label>
        Register đích
        <select v-model="form.targetType" aria-label="Register đích của saved view">
          <option v-for="item in SAVED_VIEW_TARGET_TYPES" :key="item" :value="item">{{ SAVED_VIEW_TARGET_LABEL[item] }}</option>
        </select>
      </label>
      <div class="form-actions form-wide">
        <el-button native-type="button" @click="showCreate = false">Hủy</el-button>
        <el-button native-type="submit" type="primary" :loading="busy">Lưu view riêng tư</el-button>
      </div>
    </form>

    <div v-if="!views.length" class="empty-panel">
      <h3>Chưa có saved view</h3>
      <p>Bạn chưa lưu bộ lọc nào. Saved view của người khác không hiển thị ở đây và không thể hiển thị.</p>
    </div>
    <ul v-else class="saved-view-list">
      <li v-for="view in views" :key="view.id">
        <div>
          <strong>{{ view.name }}</strong>
          <span class="status-pill" :data-status="view.targetType">{{ SAVED_VIEW_TARGET_LABEL[view.targetType] }}</span>
        </div>
        <small>
          {{ view.shareScope }} · {{ view.columnSnapshot.length }} cột ·
          {{ new Date(view.createdAt).toLocaleString('vi-VN') }}
        </small>
      </li>
    </ul>

    <el-button v-if="nextCursor" :loading="busy" @click="emit('more')">Tải thêm saved view</el-button>
  </section>
</template>
