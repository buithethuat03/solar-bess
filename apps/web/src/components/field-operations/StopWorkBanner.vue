<script setup lang="ts">
import { STOP_WORK_TARGET_LABEL } from '@/constants/field-hse';
import type { ActiveStopWork } from '@/types/field-hse.types';

/**
 * FR-088/SEC-108 — the loudest element on the screen.
 *
 * While any unlifted stop-work covers the project, a site or a workfront, this banner stands at the
 * top of the view naming the target and the reason. It is never collapsible and never auto-hides:
 * the operator has to be able to see, without scrolling or clicking, that work is stopped.
 *
 * `canLift` is `stopWork.lift` — HSE_MANAGER only. Everyone else sees the ledger entry and the
 * reason, and no lift control at all: a button the server would answer with 403 is worse than no
 * button, because it teaches the operator that lifting is their call.
 */
const props = defineProps<{
  entries: ActiveStopWork[];
  canLift: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ lift: [entry: ActiveStopWork] }>();

/** A refusal-inferred entry has no ledger id, so there is nothing `liftsActionId` could point at. */
function liftable(entry: ActiveStopWork): boolean {
  return props.canLift && entry.id !== null;
}
</script>

<template>
  <section
    v-if="entries.length"
    class="stop-work-banner"
    role="alert"
    aria-live="assertive"
    aria-labelledby="stop-work-banner-title"
  >
    <div class="stop-work-banner__head">
      <span class="stop-work-banner__glyph" aria-hidden="true">⛔</span>
      <div>
        <h2 id="stop-work-banner-title">Đang có lệnh dừng việc chưa được gỡ</h2>
        <p>
          Release workfront và cấp permit bị khóa trong phạm vi bị dừng. Báo cáo sự cố HSE vẫn luôn
          thực hiện được.
        </p>
      </div>
    </div>

    <ul class="stop-work-banner__list">
      <li v-for="(entry, index) in entries" :key="entry.id ?? `pending-${index}`" :data-target="entry.targetType">
        <div>
          <strong>{{ STOP_WORK_TARGET_LABEL[entry.targetType] }} · {{ entry.targetLabel }}</strong>
          <span class="stop-work-banner__reason">Lý do: {{ entry.reason }}</span>
          <span v-if="entry.actedAt" class="stop-work-banner__meta">Ghi nhận lúc {{ entry.actedAt }}</span>
          <span v-if="entry.pending" class="stop-work-banner__meta">
            Server từ chối lệnh vì phạm vi này đang bị dừng; ledger không có API đọc nên chưa xác
            định được bản ghi ISSUE cụ thể.
          </span>
        </div>
        <el-button
          v-if="liftable(entry)"
          type="danger"
          plain
          :loading="busy"
          @click="emit('lift', entry)"
        >
          Gỡ lệnh dừng
        </el-button>
        <span v-else-if="canLift" class="stop-work-banner__note">Chọn bản ghi ISSUE trong sổ lệnh dừng để gỡ.</span>
        <span v-else class="stop-work-banner__note">Chỉ vai trò có quyền stopWork.lift mới được gỡ.</span>
      </li>
    </ul>
  </section>
</template>
