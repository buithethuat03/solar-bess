<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { projectApi } from '@/api/project.api';
import { ApiError } from '@/api/api-error';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type { Project, ProjectListFilters } from '@/types/project.types';

const auth = useAuthStore();
const router = useRouter();
const projects = ref<Project[]>([]);
const loading = ref(true);
const error = ref('');
const filters = reactive<ProjectListFilters>({ search: '', type: undefined, recordStatus: undefined });

async function load(): Promise<void> {
  if (!auth.apiContext) return;
  loading.value = true;
  error.value = '';
  try {
    projects.value = (await projectApi.listProjects(auth.apiContext, filters)).data;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Không thể tải danh sách dự án';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppLayout>
    <section class="page-heading">
      <div><p class="eyebrow eyebrow--accent">PROJECT MASTER</p><h1>Danh mục dự án</h1><p class="lead">Nguồn dữ liệu thống nhất theo tenant, portfolio và pháp nhân.</p></div>
      <el-button v-if="auth.can('project.create')" type="primary" @click="router.push({ name: RouteName.projectCreate })">Tạo dự án</el-button>
    </section>
    <form class="filter-bar" @submit.prevent="load">
      <input v-model.trim="filters.search" aria-label="Tìm dự án" placeholder="Tìm theo mã hoặc tên" />
      <select v-model="filters.type" aria-label="Loại dự án"><option :value="undefined">Tất cả loại</option><option value="SOLAR">Solar</option><option value="BESS">BESS</option><option value="HYBRID">Hybrid</option></select>
      <select v-model="filters.recordStatus" aria-label="Trạng thái"><option :value="undefined">Tất cả trạng thái</option><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ON_HOLD">On hold</option><option value="CLOSED">Closed</option><option value="ARCHIVED">Archived</option></select>
      <el-button native-type="submit" :loading="loading">Lọc</el-button>
    </form>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-else-if="loading" class="loading-panel">Đang tải dữ liệu…</div>
    <div v-else-if="projects.length === 0" class="empty-panel"><h2>Chưa có dự án phù hợp</h2><p>Thay đổi bộ lọc hoặc tạo Project Master đầu tiên.</p></div>
    <div v-else class="table-shell">
      <table class="data-table">
        <thead><tr><th>Mã / Tên</th><th>Loại</th><th>Phase</th><th>Trạng thái</th><th>COD kế hoạch</th><th></th></tr></thead>
        <tbody>
          <tr v-for="project in projects" :key="project.id">
            <td><strong>{{ project.code }}</strong><span>{{ project.name }}</span></td><td>{{ project.type }}</td><td>{{ project.phase }}</td>
            <td><span class="status-pill" :data-status="project.recordStatus">{{ project.recordStatus }}</span></td><td>{{ project.plannedCod }}</td>
            <td><el-button text @click="router.push({ name: RouteName.projectDetail, params: { projectId: project.id } })">Mở</el-button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppLayout>
</template>
