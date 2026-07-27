<script setup lang="ts">
import { computed } from 'vue';
import { SEARCH_RESULT_TYPE_LABEL, SEARCH_RESULT_TYPES } from '@/constants/search';
import type { SearchResultRow, SearchResultType } from '@/types/search.types';

/**
 * API-130 results.
 *
 * Search is ACL-aware inside the SQL: a register the caller cannot read contributes no branch, so
 * its rows are absent rather than forbidden. That is a deliberate design choice — search must not
 * become a 403 oracle that confirms a record exists — but it means an empty type chip is
 * ambiguous, so the list says which types were asked for and which of those the caller can
 * actually read, instead of leaving "0 results" to be misread as "nothing exists".
 *
 * Only register identity columns cross the wire: type, id, code, title, project. No file content
 * and no snippet is ever returned, so none can be displayed.
 */
const props = defineProps<{
  rows: SearchResultRow[];
  /** Types the operator selected; empty means "all six". */
  selectedTypes: SearchResultType[];
  /** Types the caller holds the module read permission for, as reported by API-002. */
  readableTypes: SearchResultType[];
  searched: boolean;
  loading: boolean;
}>();
const emit = defineEmits<{ toggleType: [type: SearchResultType] }>();

const countsByType = computed(() => {
  const counts = new Map<SearchResultType, number>();
  for (const row of props.rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  return counts;
});

const requestedTypes = computed<readonly SearchResultType[]>(
  () => (props.selectedTypes.length ? props.selectedTypes : SEARCH_RESULT_TYPES)
);

const unreadableRequested = computed(
  () => requestedTypes.value.filter((type) => !props.readableTypes.includes(type))
);
</script>

<template>
  <section class="search-results" aria-labelledby="search-results-title">
    <div class="section-heading">
      <div>
        <h2 id="search-results-title">Kết quả tìm kiếm</h2>
        <p>Chỉ trả về cột định danh của register; không có nội dung tệp hay trích đoạn nào.</p>
      </div>
      <strong>{{ rows.length }} kết quả</strong>
    </div>

    <div class="search-chip-row" role="group" aria-label="Lọc theo loại kết quả">
      <button
        v-for="type in SEARCH_RESULT_TYPES"
        :key="type"
        type="button"
        class="search-chip"
        :data-type="type"
        :aria-pressed="selectedTypes.includes(type)"
        @click="emit('toggleType', type)"
      >
        {{ SEARCH_RESULT_TYPE_LABEL[type] }}
        <span>{{ countsByType.get(type) ?? 0 }}</span>
      </button>
    </div>

    <p v-if="unreadableRequested.length" class="muted-inline" data-testid="unreadable-types">
      Bạn không có quyền đọc:
      {{ unreadableRequested.map((type) => SEARCH_RESULT_TYPE_LABEL[type]).join(', ') }}.
      Các nhánh này bị bỏ khỏi truy vấn nên luôn trả về 0 kết quả — đó là giới hạn quyền, không phải
      kết luận rằng dữ liệu không tồn tại.
    </p>

    <div v-if="loading" class="loading-panel" aria-live="polite">Đang tìm kiếm…</div>
    <div v-else-if="!searched" class="empty-panel">
      <h3>Nhập từ khóa để tìm kiếm</h3>
      <p>Mã được so khớp theo tiền tố, tiêu đề so khớp theo chuỗi con. Tối thiểu 2 ký tự.</p>
    </div>
    <div v-else-if="!rows.length" class="empty-panel">
      <h3>Không có kết quả trong scope được phép</h3>
      <p>Kết quả chỉ gồm các register bạn có quyền đọc và các bản ghi thuộc scope được cấp.</p>
    </div>
    <div v-else class="table-shell">
      <table class="data-table search-table">
        <thead>
          <tr>
            <th>Loại</th>
            <th>Mã</th>
            <th>Tiêu đề</th>
            <th>Dự án</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.type}:${row.id}`" :data-type="row.type">
            <td><span class="status-pill" :data-status="row.type">{{ SEARCH_RESULT_TYPE_LABEL[row.type] }}</span></td>
            <td><strong>{{ row.code }}</strong></td>
            <td>{{ row.title }}</td>
            <td><code>{{ row.projectId }}</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
