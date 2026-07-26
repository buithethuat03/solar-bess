<script setup lang="ts">
import DocumentScanChip from './DocumentScanChip.vue';
import { CLASSIFICATION_LABEL, REVISION_STATUS_LABEL } from '@/constants/documents';
import type { DocumentRegisterRevisionView, DocumentRegisterRow } from '@/types/document.types';

defineProps<{
  rows: DocumentRegisterRow[];
  nextCursor: string | null;
  loadingMore: boolean;
  selectedId: string | null;
}>();
const emit = defineEmits<{ open: [documentId: string]; more: [] }>();

/**
 * The revision whose status and scan verdict the row must speak for. `currentRevision` is null until
 * something reaches ISSUED, so an INFECTED or still-quarantined upload is only ever visible through
 * `latestRevision` — falling back to it is the reason API-039 embeds both.
 */
function shown(row: DocumentRegisterRow): DocumentRegisterRevisionView | null {
  return row.currentRevision ?? row.latestRevision;
}
</script>

<template>
  <section class="register-panel document-register">
    <div class="section-heading">
      <div>
        <h2>Document Register</h2>
        <p>Mã, revision hiện hành và kết quả quét mã độc của từng tài liệu trong scope được phép.</p>
      </div>
    </div>

    <div v-if="!rows.length" class="empty-panel">
      <h3>Không có tài liệu phù hợp</h3>
      <p>Bộ lọc không khớp tài liệu nào trong scope được phép; không suy ra thành số đếm bằng không.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table document-table">
        <thead>
          <tr>
            <th>Mã / tiêu đề</th>
            <th>Discipline</th>
            <th>Loại</th>
            <th>Phân loại</th>
            <th>Revision hiện hành</th>
            <th>Trạng thái revision</th>
            <th>Trạng thái quét</th>
            <th><span class="sr-only">Hành động</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            :data-scan="shown(row)?.scanStatus ?? 'NONE'"
            :data-selected="row.id === selectedId"
          >
            <td>
              <strong>{{ row.documentCode }}</strong>
              <span>{{ row.title }}</span>
            </td>
            <td>{{ row.discipline }}</td>
            <td>{{ row.type }}</td>
            <td>{{ CLASSIFICATION_LABEL[row.classification] }}</td>
            <td>
              <template v-if="row.currentRevision">
                <strong>{{ row.currentRevision.revisionCode }}</strong>
                <span>v{{ row.currentRevision.workingVersion }}</span>
              </template>
              <template v-else-if="row.latestRevision">
                <strong>{{ row.latestRevision.revisionCode }}</strong>
                <span>v{{ row.latestRevision.workingVersion }} · chưa phát hành</span>
              </template>
              <span v-else>Chưa có revision nào</span>
            </td>
            <td>
              <span
                v-if="shown(row)"
                class="status-pill"
                :data-status="shown(row)!.status"
              >{{ REVISION_STATUS_LABEL[shown(row)!.status] }}</span>
              <span v-else>—</span>
            </td>
            <td>
              <DocumentScanChip v-if="shown(row)" :status="shown(row)!.scanStatus" hint />
              <span v-else>Chưa có kết quả quét</span>
            </td>
            <td><el-button text @click="emit('open', row.id)">Mở</el-button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <el-button v-if="nextCursor" :loading="loadingMore" @click="emit('more')">Tải thêm tài liệu</el-button>
  </section>
</template>
