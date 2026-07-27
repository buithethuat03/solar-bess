<script setup lang="ts">
import {
  WORKFRONT_READINESS_LABEL, WORKFRONT_STATUS_LABEL
} from '@/constants/field-hse';
import type { WorkfrontView } from '@/types/field-hse.types';

/**
 * API-086 register. Two signals matter more than the columns themselves:
 *
 * 1. A workfront covered by an unlifted stop-work must never look like a normal one — it carries a
 *    row marker, a danger chip and a release control that is present but DISABLED, so the reason it
 *    cannot be released is visible rather than merely absent.
 * 2. Release is offered only for READY + GATES_CLEARED rows the caller can actually reach; the
 *    server re-checks both, plus the ledger, before it writes anything.
 */
const props = defineProps<{
  rows: WorkfrontView[];
  nextCursor: string | null;
  loadingMore: boolean;
  selectedId: string | null;
  /** Ids covered by an unlifted stop-work through the project, the site or the workfront itself. */
  blockedIds: string[];
  /** Ids the caller holds `workfront.release` for, package scope included. */
  releasableIds: string[];
  siteNames: Record<string, string>;
  busy: boolean;
}>();
const emit = defineEmits<{
  open: [workfrontId: string];
  more: [];
  release: [workfront: WorkfrontView];
}>();

function stopped(row: WorkfrontView): boolean {
  return props.blockedIds.includes(row.id);
}

function releaseOffered(row: WorkfrontView): boolean {
  return props.releasableIds.includes(row.id)
    && row.status === 'READY' && row.readiness === 'GATES_CLEARED';
}
</script>

<template>
  <section class="register-panel workfront-register">
    <div class="section-heading">
      <div>
        <h2>Workfront Register</h2>
        <p>Mã, công trường, readiness và trạng thái của từng workfront trong scope được phép.</p>
      </div>
    </div>

    <div v-if="!rows.length" class="empty-panel">
      <h3>Không có workfront phù hợp</h3>
      <p>Bộ lọc không khớp workfront nào trong scope được phép; không suy ra thành số đếm bằng không.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table workfront-table">
        <thead>
          <tr>
            <th>Mã / tên</th>
            <th>Công trường</th>
            <th>Readiness</th>
            <th>Trạng thái</th>
            <th>Dừng việc</th>
            <th>Phiên bản</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            :data-status="row.status"
            :data-stopped="stopped(row)"
            :data-selected="row.id === selectedId"
          >
            <td><strong>{{ row.code }}</strong><span>{{ row.name }}</span></td>
            <td>{{ siteNames[row.siteId] ?? row.siteId }}</td>
            <td>
              <span class="readiness-pill" :data-readiness="row.readiness">
                {{ WORKFRONT_READINESS_LABEL[row.readiness] }}
              </span>
            </td>
            <td>
              <span class="status-pill" :data-status="row.status">{{ WORKFRONT_STATUS_LABEL[row.status] }}</span>
              <span v-if="row.suspendedReason" class="workfront-suspend-reason">{{ row.suspendedReason }}</span>
            </td>
            <td>
              <span v-if="stopped(row)" class="stop-work-chip" data-stopped="true">Đang dừng việc</span>
              <span v-else>—</span>
            </td>
            <td>v{{ row.versionNo }}</td>
            <td class="workfront-table__actions">
              <el-button text @click="emit('open', row.id)">Mở</el-button>
              <template v-if="releaseOffered(row)">
                <el-button
                  type="primary"
                  plain
                  :disabled="stopped(row)"
                  :loading="busy && !stopped(row)"
                  @click="emit('release', row)"
                >
                  Release
                </el-button>
                <span v-if="stopped(row)" class="stop-work-chip__hint">Bị khóa bởi lệnh dừng việc chưa gỡ.</span>
              </template>
              <span v-else-if="releasableIds.includes(row.id)" class="workfront-release-hint">
                Chỉ workfront READY đã thông cổng mới release được.
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-button v-if="nextCursor" :loading="loadingMore" @click="emit('more')">Tải thêm workfront</el-button>
  </section>
</template>
