<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  OPERATIONS_CODE_PATTERN, PRIORITY_LABEL, WORK_ORDER_PRIORITIES, WORK_TYPE_PATTERN
} from '@/constants/operations';
import type {
  CreateWorkOrderRequest, ServiceIncidentView, WorkOrderPriority
} from '@/types/operations.types';

/**
 * API-119 — create a work order on the asset.
 *
 * `requiresPermit` is a safety declaration, not a preference: when it is on, the referenced permit
 * must be live, in window and on the asset's own site or the API refuses with 422 PTW_REQUIRED and
 * writes nothing. The form makes the permit field required in that case so the refusal happens
 * before anyone believes the job was raised.
 *
 * There is no status field: the row is born DRAFT, or SCHEDULED when a schedule time is given.
 * No V1 operation approves or schedules a work order, so offering either would be fiction.
 */
const props = defineProps<{
  incidents: ServiceIncidentView[];
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; create: [input: CreateWorkOrderRequest] }>();

const error = ref('');
const form = reactive({
  code: '', workType: 'CORRECTIVE', title: '', description: '',
  priority: 'MEDIUM' as WorkOrderPriority, requiresPermit: false, permitToWorkId: '',
  assigneeUserId: '', scheduledAt: '', serviceIncidentId: ''
});

function submit(): void {
  error.value = '';
  if (!OPERATIONS_CODE_PATTERN.test(form.code.trim())) {
    error.value = 'Mã work order phải viết hoa, bắt đầu bằng chữ hoặc số (VD: WO-2026-001).';
    return;
  }
  if (!WORK_TYPE_PATTERN.test(form.workType.trim())) {
    error.value = 'Loại công việc phải viết hoa, bắt đầu bằng chữ cái (VD: CORRECTIVE).';
    return;
  }
  if (form.title.trim().length < 3) {
    error.value = 'Tiêu đề work order phải có ít nhất 3 ký tự.';
    return;
  }
  const permitToWorkId = form.permitToWorkId.trim();
  if (form.requiresPermit && !permitToWorkId) {
    error.value = 'Công việc yêu cầu permit to work phải tham chiếu permit còn hiệu lực.';
    return;
  }
  const scheduledAt = form.scheduledAt ? new Date(form.scheduledAt) : null;
  emit('create', {
    code: form.code.trim(), workType: form.workType.trim(), title: form.title.trim(),
    priority: form.priority, requiresPermit: form.requiresPermit,
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(permitToWorkId ? { permitToWorkId } : {}),
    ...(form.assigneeUserId.trim() ? { assigneeUserId: form.assigneeUserId.trim() } : {}),
    ...(scheduledAt && !Number.isNaN(scheduledAt.getTime())
      ? { scheduledAt: scheduledAt.toISOString() } : {}),
    ...(form.serviceIncidentId ? { serviceIncidentId: form.serviceIncidentId } : {})
  });
}
</script>

<template>
  <form class="operations-panel operations-form" @submit.prevent="submit">
    <div class="detail-heading form-wide">
      <div>
        <small>WORK ORDER · API-119</small>
        <h2>Tạo work order</h2>
        <p class="lead">Bản ghi sinh ra ở DRAFT, hoặc SCHEDULED nếu khai báo thời điểm theo lịch.</p>
      </div>
      <button type="button" class="text-action" @click="emit('close')">Đóng</button>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <label>Mã work order<input v-model.trim="form.code" required placeholder="WO-2026-001" /></label>
    <label>Loại công việc<input v-model.trim="form.workType" required placeholder="CORRECTIVE" /></label>
    <label>
      Ưu tiên
      <select v-model="form.priority" aria-label="Ưu tiên work order">
        <option v-for="item in WORK_ORDER_PRIORITIES" :key="item" :value="item">{{ PRIORITY_LABEL[item] }}</option>
      </select>
    </label>
    <label class="form-wide">Tiêu đề<input v-model.trim="form.title" required maxlength="400" /></label>
    <label class="form-wide">Mô tả<textarea v-model="form.description" rows="2" maxlength="4000"></textarea></label>
    <label>Người thực hiện (UUID)<input v-model.trim="form.assigneeUserId" /></label>
    <label>Thời điểm theo lịch<input v-model="form.scheduledAt" type="datetime-local" /></label>
    <label>
      Sự cố dịch vụ liên quan
      <select v-model="form.serviceIncidentId" aria-label="Sự cố dịch vụ liên quan">
        <option value="">Không gắn sự cố</option>
        <option v-for="item in props.incidents" :key="item.id" :value="item.id">{{ item.title }}</option>
      </select>
    </label>
    <label class="check-label form-wide">
      <input v-model="form.requiresPermit" type="checkbox" />
      Công việc yêu cầu permit to work (PTW)
    </label>
    <label class="form-wide">
      Permit to work (UUID){{ form.requiresPermit ? ' — bắt buộc' : '' }}
      <input v-model.trim="form.permitToWorkId" :required="form.requiresPermit" />
    </label>

    <div class="form-actions form-wide">
      <el-button native-type="button" @click="emit('close')">Hủy</el-button>
      <el-button native-type="submit" type="primary" :loading="busy">Tạo work order</el-button>
    </div>
  </form>
</template>
