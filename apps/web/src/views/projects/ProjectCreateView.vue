<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { projectApi } from '@/api/project.api';
import { ApiError } from '@/api/api-error';
import ProjectForm, { type ProjectFormValue } from '@/components/projects/ProjectForm.vue';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type { Company, LegalEntity, Portfolio } from '@/types/project.types';

const auth = useAuthStore();
const router = useRouter();
const companies = ref<Company[]>([]);
const legalEntities = ref<LegalEntity[]>([]);
const portfolios = ref<Portfolio[]>([]);
const loading = ref(true);
const submitting = ref(false);
const error = ref('');

onMounted(async () => {
  if (!auth.apiContext) return;
  try {
    const [companyResult, legalResult, portfolioResult] = await Promise.all([
      projectApi.listCompanies(auth.apiContext), projectApi.listLegalEntities(auth.apiContext), projectApi.listPortfolios(auth.apiContext)
    ]);
    companies.value = companyResult.data;
    legalEntities.value = legalResult.data;
    portfolios.value = portfolioResult.data;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Không thể tải dữ liệu nền';
  } finally {
    loading.value = false;
  }
});

async function create(value: ProjectFormValue): Promise<void> {
  if (!auth.apiContext) return;
  submitting.value = true;
  error.value = '';
  try {
    const result = await projectApi.createProject(auth.apiContext, {
      code: value.code, name: value.name, type: value.type, portfolioId: value.portfolioId,
      ownerLegalEntityId: value.ownerLegalEntityId, customerCompanyId: value.customerCompanyId,
      contractModel: value.contractModel, currency: value.currency.toUpperCase(), plannedCod: value.plannedCod,
      primarySite: {
        code: value.primarySiteCode, name: value.primarySiteName,
        location: value.primarySiteLocation || undefined, timezone: value.primarySiteTimezone
      }
    }, crypto.randomUUID());
    await router.replace({ name: RouteName.projectDetail, params: { projectId: result.data.id } });
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Không thể tạo dự án';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <AppLayout>
    <section class="page-heading"><div><p class="eyebrow eyebrow--accent">PROJECT MASTER</p><h1>Tạo dự án</h1><p class="lead">Project được tạo trong đúng tenant cùng một Site chính.</p></div><el-button @click="router.push({ name: RouteName.projects })">Quay lại</el-button></section>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="loading" class="loading-panel">Đang tải dữ liệu nền…</div>
    <ProjectForm v-else :companies="companies" :legal-entities="legalEntities" :portfolios="portfolios" :submitting="submitting" @submit="create" />
  </AppLayout>
</template>
