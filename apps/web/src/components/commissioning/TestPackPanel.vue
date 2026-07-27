<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { COMMISSIONING_CODE_PATTERN, TEST_PACK_STATUS_LABEL } from '@/constants/commissioning';
import type {
  CommissioningSystemView, CreateTestPackRequest, TestPackView
} from '@/types/commissioning.types';

const props = defineProps<{
  packs: TestPackView[];
  system: CommissioningSystemView | null;
  selectedPackId: string | null;
  busy: boolean;
  permissions: { create: boolean };
}>();
const emit = defineEmits<{
  select: [packId: string];
  create: [systemId: string, input: CreateTestPackRequest];
}>();

const error = ref('');
const form = reactive({ code: '', title: '', procedureRevisionId: '', prerequisitesText: '' });

const packsOfSystem = computed(() => props.system === null
  ? []
  : props.packs.filter((pack) => pack.commissioningSystemId === props.system!.id));

/** `required` trong snapshot là hợp đồng điều kiện tiên quyết; phần còn lại chỉ mang tính mô tả. */
function requiredOf(pack: TestPackView): string[] {
  const declared = pack.prerequisitesSnapshot?.required;
  return Array.isArray(declared)
    ? declared.filter((item): item is string => typeof item === 'string')
    : [];
}

function submit(): void {
  error.value = '';
  const system = props.system;
  if (!system) {
    error.value = 'Chọn một hệ thống trước khi tạo test pack.';
    return;
  }
  if (!COMMISSIONING_CODE_PATTERN.test(form.code)) {
    error.value = 'Mã test pack phải viết hoa, bắt đầu bằng chữ hoặc số, tối đa 80 ký tự.';
    return;
  }
  if (form.title.trim().length < 3) {
    error.value = 'Tiêu đề test pack phải có ít nhất 3 ký tự.';
    return;
  }
  if (!form.procedureRevisionId.trim()) {
    error.value = 'Test pack cần revision quy trình đã ISSUED và quét sạch mã độc.';
    return;
  }
  const required = form.prerequisitesText.split('\n')
    .map((line) => line.trim()).filter((line) => line.length > 0);
  emit('create', system.id, {
    code: form.code.trim(), title: form.title.trim(),
    procedureRevisionId: form.procedureRevisionId.trim(),
    ...(required.length ? { prerequisitesSnapshot: { required } } : {})
  });
}
</script>

<template>
  <section class="commissioning-panel test-pack-panel" aria-labelledby="test-pack-panel-title">
    <div class="detail-heading">
      <div>
        <small>TEST PACK · API-100 · DB-074</small>
        <h2 id="test-pack-panel-title">Bộ hồ sơ thử nghiệm</h2>
        <p class="lead">
          Test pack chỉ tạo được từ revision quy trình đã ISSUED và quét sạch mã độc; nó sinh ra đã
          ở trạng thái Đã phê duyệt và bị đóng băng ngay sau đó — quy trình đổi thì tạo pack mới.
        </p>
      </div>
    </div>

    <el-alert v-if="error" type="error" :title="error" show-icon />

    <p v-if="!system" class="commissioning-note">
      Chọn một hệ thống ở cây bên trên để xem và tạo test pack của hệ thống đó.
    </p>
    <template v-else>
      <div v-if="!packsOfSystem.length" class="empty-panel">
        <h3>Hệ thống {{ system.code }} chưa có test pack</h3>
        <p>Chưa có bộ hồ sơ thử nghiệm nào được ghi nhận trong phiên làm việc này.</p>
      </div>
      <div v-else class="table-shell">
        <table class="data-table commissioning-table test-pack-table">
          <thead>
            <tr><th>Mã</th><th>Tiêu đề</th><th>Trạng thái</th><th>Điều kiện tiên quyết</th><th><span class="sr-only">Chọn</span></th></tr>
          </thead>
          <tbody>
            <tr
              v-for="pack in packsOfSystem"
              :key="pack.id"
              :data-selected="pack.id === selectedPackId"
            >
              <td><strong>{{ pack.code }}</strong></td>
              <td>{{ pack.title }}</td>
              <td><span class="status-pill" :data-status="pack.status">{{ TEST_PACK_STATUS_LABEL[pack.status] }}</span></td>
              <td>{{ requiredOf(pack).join(', ') || 'không khai điều kiện' }}</td>
              <td><el-button text @click="emit('select', pack.id)">Mở lần chạy</el-button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <form v-if="permissions.create" class="commissioning-form test-pack-form" @submit.prevent="submit">
        <h3 class="form-wide">Tạo test pack cho {{ system.code }} (API-100)</h3>
        <label>Mã test pack<input v-model.trim="form.code" required maxlength="80" placeholder="TP-PV-01" /></label>
        <label>Tiêu đề<input v-model.trim="form.title" required maxlength="400" /></label>
        <label>Revision quy trình<input v-model.trim="form.procedureRevisionId" required placeholder="UUID revision ISSUED + CLEAN" /></label>
        <label class="form-wide">Điều kiện tiên quyết (mỗi dòng một mã)<textarea v-model="form.prerequisitesText" rows="3"></textarea></label>
        <el-button native-type="submit" type="primary" :loading="busy">Tạo và phê duyệt pack</el-button>
      </form>
    </template>
  </section>
</template>
