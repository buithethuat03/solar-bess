<script setup lang="ts">
import { reactive } from 'vue';
import type { Company, LegalEntity, Portfolio, Project, ProjectType } from '@/types/project.types';

export interface ProjectFormValue {
  code: string;
  name: string;
  type: ProjectType;
  portfolioId: string;
  ownerLegalEntityId: string;
  customerCompanyId: string;
  contractModel: string;
  currency: string;
  plannedCod: string;
  forecastCod: string;
  primarySiteCode: string;
  primarySiteName: string;
  primarySiteLocation: string;
  primarySiteTimezone: string;
  reason: string;
}

const props = defineProps<{
  project?: Project;
  companies: Company[];
  legalEntities: LegalEntity[];
  portfolios: Portfolio[];
  submitting?: boolean;
}>();

const emit = defineEmits<{ submit: [value: ProjectFormValue] }>();

const form = reactive<ProjectFormValue>({
  code: props.project?.code ?? '',
  name: props.project?.name ?? '',
  type: props.project?.type ?? 'SOLAR',
  portfolioId: props.project?.portfolioId ?? '',
  ownerLegalEntityId: props.project?.ownerLegalEntityId ?? '',
  customerCompanyId: props.project?.customerCompanyId ?? '',
  contractModel: props.project?.contractModel ?? 'EPC',
  currency: props.project?.currency ?? 'VND',
  plannedCod: props.project?.plannedCod ?? '',
  forecastCod: props.project?.forecastCod ?? '',
  primarySiteCode: 'MAIN',
  primarySiteName: '',
  primarySiteLocation: '',
  primarySiteTimezone: 'Asia/Ho_Chi_Minh',
  reason: ''
});

function submit(): void {
  emit('submit', { ...form });
}
</script>

<template>
  <form class="project-form" @submit.prevent="submit">
    <label v-if="!project">Mã dự án<input v-model.trim="form.code" required maxlength="64" placeholder="VD: SOLAR-2026-001" /></label>
    <label>Tên dự án<input v-model.trim="form.name" required maxlength="250" /></label>
    <label>Loại dự án
      <select v-model="form.type" required><option value="SOLAR">Solar</option><option value="BESS">BESS</option><option value="HYBRID">Hybrid</option></select>
    </label>
    <label>Portfolio
      <select v-model="form.portfolioId" required><option disabled value="">Chọn portfolio</option><option v-for="item in portfolios" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select>
    </label>
    <label>Pháp nhân sở hữu
      <select v-model="form.ownerLegalEntityId" required><option disabled value="">Chọn pháp nhân</option><option v-for="item in legalEntities" :key="item.id" :value="item.id">{{ item.legalName }}</option></select>
    </label>
    <label>Khách hàng
      <select v-model="form.customerCompanyId" required><option disabled value="">Chọn khách hàng</option><option v-for="item in companies" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select>
    </label>
    <label>Mô hình hợp đồng<input v-model.trim="form.contractModel" required maxlength="80" placeholder="EPC" /></label>
    <label>Tiền tệ<input v-model.trim="form.currency" required minlength="3" maxlength="3" /></label>
    <label>COD kế hoạch<input v-model="form.plannedCod" type="date" required /></label>
    <label v-if="project">COD dự báo<input v-model="form.forecastCod" type="date" /></label>

    <fieldset v-if="!project" class="project-form__section">
      <legend>Site chính</legend>
      <label>Mã Site<input v-model.trim="form.primarySiteCode" required maxlength="64" /></label>
      <label>Tên Site<input v-model.trim="form.primarySiteName" required maxlength="200" /></label>
      <label>Địa điểm<input v-model.trim="form.primarySiteLocation" maxlength="500" /></label>
      <label>Múi giờ<input v-model.trim="form.primarySiteTimezone" required maxlength="100" /></label>
    </fieldset>

    <label v-if="project" class="project-form__reason">Lý do thay đổi<textarea v-model.trim="form.reason" required minlength="3" maxlength="500" rows="3" /></label>
    <div class="project-form__actions"><el-button native-type="submit" type="primary" :loading="submitting">{{ project ? 'Lưu thay đổi' : 'Tạo dự án' }}</el-button></div>
  </form>
</template>
