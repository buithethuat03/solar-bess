<script setup lang="ts">
import { reactive } from 'vue';
import type {
  AuditEventListQuery, AuditEventView, IdentityPermissionsData
} from '@/types/search.types';

/**
 * API-002 + API-013 — the identity context of this screen.
 *
 * `me/permissions` is what makes an empty search branch explainable: the search API silently omits
 * registers the caller cannot read, so without knowing the effective permission set an operator
 * cannot tell "no matches" from "not allowed to look". `policyVersion` names the catalog release
 * the answer came from, which is the only thing that makes an access question reproducible.
 *
 * `audit-events` is tenant-scoped by hard mandate: platform-level rows carry `tenant_id NULL` and
 * are unreachable here on purpose — a tenant administrator audits their tenant, not the platform.
 */
defineProps<{
  identity: IdentityPermissionsData | null;
  events: AuditEventView[];
  nextCursor: string | null;
  busy: boolean;
  canReadAudit: boolean;
}>();
const emit = defineEmits<{
  more: [];
  filter: [query: AuditEventListQuery];
}>();

const filters = reactive({ objectType: '', action: '' });

function applyFilters(): void {
  emit('filter', {
    ...(filters.objectType.trim() ? { objectType: filters.objectType.trim() } : {}),
    ...(filters.action.trim() ? { action: filters.action.trim() } : {})
  });
}
</script>

<template>
  <section class="search-panel identity-admin-panel" aria-labelledby="identity-admin-title">
    <div class="detail-heading">
      <div>
        <small>IDENTITY · API-002/013</small>
        <h2 id="identity-admin-title">Quyền hiệu lực &amp; vết audit</h2>
        <p class="lead">Bối cảnh quyền của chính bạn và nhật ký thao tác trong tenant.</p>
      </div>
    </div>

    <div v-if="identity" class="fact-grid" data-testid="identity-facts">
      <div><span>Vai trò</span><strong>{{ identity.roles.join(', ') || 'Không có vai trò' }}</strong></div>
      <div><span>Số quyền hiệu lực</span><strong>{{ identity.permissions.length }}</strong></div>
      <div><span>Phiên bản chính sách</span><strong>{{ identity.policyVersion }}</strong></div>
      <div><span>Số phạm vi được gán</span><strong>{{ identity.scopes.length }}</strong></div>
    </div>
    <p v-else class="muted-inline">Chưa tải được bối cảnh quyền của bạn.</p>

    <section aria-labelledby="audit-events-title">
      <div class="section-heading">
        <div>
          <h3 id="audit-events-title">Audit event của tenant</h3>
          <p>Chỉ bản ghi thuộc tenant hiện tại; bản ghi cấp nền tảng không truy cập được ở đây.</p>
        </div>
      </div>

      <p v-if="!canReadAudit" class="immutable-banner">
        Bạn không có quyền <code>audit.read</code>; nhật ký không được tải.
      </p>
      <template v-else>
        <form class="search-inline-form" @submit.prevent="applyFilters">
          <label>Loại đối tượng<input v-model.trim="filters.objectType" maxlength="80" placeholder="WorkOrder" /></label>
          <label>Hành động<input v-model.trim="filters.action" maxlength="80" placeholder="WorkOrder.Closed" /></label>
          <div class="form-actions form-wide">
            <el-button native-type="submit" :loading="busy">Lọc audit</el-button>
          </div>
        </form>

        <div v-if="!events.length" class="empty-panel">
          <h3>Chưa có audit event</h3>
          <p>Không có bản ghi nào khớp bộ lọc trong tenant hiện tại.</p>
        </div>
        <div v-else class="table-shell">
          <table class="data-table audit-table">
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Hành động</th>
                <th>Kết quả</th>
                <th>Đối tượng</th>
                <th>Correlation</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in events" :key="event.id" :data-result="event.result">
                <td>{{ new Date(event.occurredAt).toLocaleString('vi-VN') }}</td>
                <td><strong>{{ event.action }}</strong><span>{{ event.actorId ?? 'hệ thống' }}</span></td>
                <td><span class="status-pill" :data-status="event.result">{{ event.result }}</span></td>
                <td><strong>{{ event.objectType ?? '—' }}</strong><span>{{ event.objectId ?? '' }}</span></td>
                <td><code>{{ event.correlationId ?? '' }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>

        <el-button v-if="nextCursor" :loading="busy" @click="emit('more')">Tải thêm audit event</el-button>
      </template>
    </section>
  </section>
</template>
