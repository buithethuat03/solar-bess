<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectApi } from '@/api/project.api';
import { ApiError } from '@/api/api-error';
import ProjectForm, { type ProjectFormValue } from '@/components/projects/ProjectForm.vue';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type { Company, LegalEntity, Portfolio, Project } from '@/types/project.types';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const project = ref<Project | null>(null);
const companies = ref<Company[]>([]);
const legalEntities = ref<LegalEntity[]>([]);
const portfolios = ref<Portfolio[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const showSiteForm = ref(false);
const showPartyForm = ref(false);
const archiveReason = ref('');
const siteForm = reactive({ code: '', name: '', location: '', timezone: 'Asia/Ho_Chi_Minh' });
const partyForm = reactive({
  companyId: '', legalEntityId: '', roleCode: 'EPC' as const,
  raci: 'RESPONSIBLE' as const, effectiveFrom: new Date().toISOString().slice(0, 10),
  contactName: '', contactEmail: '', reason: 'Gán đối tác cho dự án'
});

const companyNames = computed(() => new Map(companies.value.map((item) => [item.id, item.name])));
const legalNames = computed(() => new Map(legalEntities.value.map((item) => [item.id, item.legalName])));
const portfolioName = computed(() => portfolios.value.find((item) => item.id === project.value?.portfolioId)?.name ?? '—');

async function load(): Promise<void> {
  if (!auth.apiContext) return;
  loading.value = true;
  error.value = '';
  try {
    const [projectResult, companyResult, legalResult, portfolioResult] = await Promise.all([
      projectApi.getProject(auth.apiContext, projectId), projectApi.listCompanies(auth.apiContext),
      projectApi.listLegalEntities(auth.apiContext), projectApi.listPortfolios(auth.apiContext)
    ]);
    project.value = projectResult.data;
    companies.value = companyResult.data;
    legalEntities.value = legalResult.data;
    portfolios.value = portfolioResult.data;
  } catch (caught) {
    error.value = caught instanceof ApiError ? caught.message : 'Không thể tải dự án';
  } finally {
    loading.value = false;
  }
}

async function update(value: ProjectFormValue): Promise<void> {
  if (!auth.apiContext || !project.value) return;
  await runMutation(async () => {
    const result = await projectApi.updateProject(auth.apiContext!, projectId, {
      name: value.name, type: value.type, portfolioId: value.portfolioId,
      ownerLegalEntityId: value.ownerLegalEntityId, customerCompanyId: value.customerCompanyId,
      contractModel: value.contractModel, currency: value.currency.toUpperCase(),
      plannedCod: value.plannedCod, forecastCod: value.forecastCod || null, reason: value.reason
    }, project.value!.versionNo, crypto.randomUUID());
    project.value = result.data;
  });
}

async function changeStatus(status: 'ACTIVE' | 'ARCHIVED'): Promise<void> {
  if (!auth.apiContext || !project.value) return;
  if (archiveReason.value.trim().length < 3) {
    error.value = 'Vui lòng nhập lý do có ít nhất 3 ký tự';
    return;
  }
  await runMutation(async () => {
    const result = await projectApi.updateProject(auth.apiContext!, projectId, {
      recordStatus: status, reason: archiveReason.value.trim()
    }, project.value!.versionNo, crypto.randomUUID());
    project.value = result.data;
    archiveReason.value = '';
  });
}

async function addSite(): Promise<void> {
  if (!auth.apiContext) return;
  await runMutation(async () => {
    await projectApi.createSite(auth.apiContext!, projectId, {
      code: siteForm.code, name: siteForm.name, location: siteForm.location || undefined,
      timezone: siteForm.timezone
    }, crypto.randomUUID());
    showSiteForm.value = false;
    Object.assign(siteForm, { code: '', name: '', location: '', timezone: 'Asia/Ho_Chi_Minh' });
    await load();
  });
}

async function addParty(): Promise<void> {
  if (!auth.apiContext) return;
  await runMutation(async () => {
    await projectApi.upsertParty(auth.apiContext!, projectId, crypto.randomUUID(), {
      companyId: partyForm.companyId, legalEntityId: partyForm.legalEntityId || null,
      roleCode: partyForm.roleCode, raci: partyForm.raci, effectiveFrom: partyForm.effectiveFrom,
      effectiveTo: null, contactName: partyForm.contactName || null,
      contactEmail: partyForm.contactEmail || null, reason: partyForm.reason
    }, 0);
    showPartyForm.value = false;
    await load();
  });
}

async function runMutation(action: () => Promise<void>): Promise<void> {
  saving.value = true;
  error.value = '';
  try { await action(); }
  catch (caught) { error.value = caught instanceof ApiError ? caught.message : 'Không thể lưu thay đổi'; }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <AppLayout>
    <section class="page-heading"><div><p class="eyebrow eyebrow--accent">PROJECT MASTER</p><h1>{{ project?.name ?? 'Chi tiết dự án' }}</h1><p v-if="project" class="lead">{{ project.code }} · {{ project.type }} · {{ portfolioName }}</p></div><div class="page-heading__actions"><el-button v-if="auth.can('riskChange.read')" type="primary" @click="router.push({ name: RouteName.projectRiskChange, params: { projectId }, query: { tab: 'risks' } })">Risk &amp; Change</el-button><el-button v-if="auth.can('schedule.read')" @click="router.push({ name: RouteName.projectSchedule, params: { projectId } })">WBS &amp; Schedule</el-button><el-button @click="router.push({ name: RouteName.projects })">Danh sách</el-button></div></section>
    <el-alert v-if="error" type="error" :title="error" show-icon />
    <div v-if="loading" class="loading-panel">Đang tải dự án…</div>
    <template v-else-if="project">
      <section class="project-summary">
        <div><small>PHASE</small><strong>{{ project.phase }}</strong></div><div><small>TRẠNG THÁI</small><strong><span class="status-pill" :data-status="project.recordStatus">{{ project.recordStatus }}</span></strong></div>
        <div><small>COD KẾ HOẠCH</small><strong>{{ project.plannedCod }}</strong></div><div><small>PHIÊN BẢN</small><strong>v{{ project.versionNo }}</strong></div>
      </section>

      <section v-if="auth.can('project.update')" class="action-panel">
        <input v-model.trim="archiveReason" placeholder="Lý do kích hoạt/lưu trữ" maxlength="500" />
        <el-button v-if="project.recordStatus === 'DRAFT'" :loading="saving" @click="changeStatus('ACTIVE')">Kích hoạt</el-button>
        <el-button v-if="project.recordStatus !== 'ARCHIVED'" type="danger" plain :loading="saving" @click="changeStatus('ARCHIVED')">Lưu trữ</el-button>
      </section>

      <details v-if="auth.can('project.update')" class="detail-section"><summary>Chỉnh sửa Project Master</summary><ProjectForm :key="project.versionNo" :project="project" :companies="companies" :legal-entities="legalEntities" :portfolios="portfolios" :submitting="saving" @submit="update" /></details>

      <section class="detail-section">
        <div class="section-heading"><div><h2>Sites</h2><p>Một dự án có nhiều Site; Site chính được đánh dấu riêng.</p></div><el-button v-if="auth.can('site.create')" @click="showSiteForm = !showSiteForm">Thêm Site</el-button></div>
        <form v-if="showSiteForm" class="inline-form" @submit.prevent="addSite"><input v-model.trim="siteForm.code" required placeholder="Mã Site" /><input v-model.trim="siteForm.name" required placeholder="Tên Site" /><input v-model.trim="siteForm.location" placeholder="Địa điểm" /><input v-model.trim="siteForm.timezone" required placeholder="Múi giờ" /><el-button native-type="submit" type="primary" :loading="saving">Lưu Site</el-button></form>
        <div class="table-shell"><table class="data-table"><thead><tr><th>Mã</th><th>Tên</th><th>Địa điểm</th><th>Múi giờ</th></tr></thead><tbody><tr v-for="site in project.sites" :key="site.id"><td>{{ site.code }} <span v-if="site.isPrimary" class="primary-badge">Chính</span></td><td>{{ site.name }}</td><td>{{ site.location || '—' }}</td><td>{{ site.timezone }}</td></tr></tbody></table></div>
      </section>

      <section class="detail-section">
        <div class="section-heading"><div><h2>Pháp nhân và đối tác</h2><p>Quan hệ dùng stable Company/Legal Entity ID và vai trò chuẩn.</p></div><el-button v-if="auth.can('projectParty.manage')" @click="showPartyForm = !showPartyForm">Gán đối tác</el-button></div>
        <form v-if="showPartyForm" class="inline-form inline-form--party" @submit.prevent="addParty"><select v-model="partyForm.companyId" required><option disabled value="">Company</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option></select><select v-model="partyForm.legalEntityId"><option value="">Không chọn pháp nhân</option><option v-for="item in legalEntities.filter((legal) => legal.companyId === partyForm.companyId)" :key="item.id" :value="item.id">{{ item.legalName }}</option></select><select v-model="partyForm.roleCode"><option value="OWNER">Owner</option><option value="EPC">EPC</option><option value="VENDOR">Vendor</option><option value="LENDER">Lender</option></select><select v-model="partyForm.raci"><option value="ACCOUNTABLE">Accountable</option><option value="RESPONSIBLE">Responsible</option><option value="CONSULTED">Consulted</option><option value="INFORMED">Informed</option></select><input v-model="partyForm.effectiveFrom" type="date" required /><input v-model.trim="partyForm.contactName" placeholder="Người liên hệ" /><input v-model.trim="partyForm.contactEmail" type="email" placeholder="Email liên hệ" /><el-button native-type="submit" type="primary" :loading="saving">Lưu quan hệ</el-button></form>
        <div class="table-shell"><table class="data-table"><thead><tr><th>Company / Legal Entity</th><th>Vai trò</th><th>RACI</th><th>Hiệu lực</th><th>Liên hệ</th></tr></thead><tbody><tr v-for="party in project.parties" :key="party.id"><td><strong>{{ companyNames.get(party.companyId) }}</strong><span>{{ party.legalEntityId ? legalNames.get(party.legalEntityId) : '—' }}</span></td><td>{{ party.roleCode }}</td><td>{{ party.raci }}</td><td>{{ party.effectiveFrom }} → {{ party.effectiveTo || 'Không thời hạn' }}</td><td>{{ party.contactName || '—' }}<span>{{ party.contactEmail }}</span></td></tr><tr v-if="!project.parties?.length"><td colspan="5">Chưa có đối tác được gán.</td></tr></tbody></table></div>
      </section>
    </template>
  </AppLayout>
</template>
