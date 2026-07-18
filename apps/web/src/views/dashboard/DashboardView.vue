<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { projectApi } from '@/api/project.api';
import { scheduleApi } from '@/api/schedule.api';
import { riskChangeApi } from '@/api/risk-change.api';
import RiskChangeLane, { type DashboardRiskChangeItem } from '@/components/dashboard/RiskChangeLane.vue';
import StatusCard from '@/components/common/StatusCard.vue';
import ScheduleAlertLane from '@/components/dashboard/ScheduleAlertLane.vue';
import { RouteName } from '@/constants/routes';
import AppLayout from '@/layouts/AppLayout.vue';
import { useAuthStore } from '@/stores/auth.store';
import type { DashboardScheduleAlert } from '@/types/schedule.types';

const auth = useAuthStore();
const router = useRouter();
const scheduleAlerts = ref<DashboardScheduleAlert[]>([]);
const scheduleAlertsLoading = ref(false);
const scheduleAlertsError = ref('');
const riskChangeItems = ref<DashboardRiskChangeItem[]>([]);
const riskChangeLoading = ref(false);
const riskChangeError = ref('');

async function loadScheduleAlerts(): Promise<void> {
  const context = auth.apiContext;
  if (!context || !auth.can('project.read') || !auth.can('schedule.read')) return;
  scheduleAlertsLoading.value = true;
  scheduleAlertsError.value = '';
  try {
    const projects = await projectApi.listProjects(context);
    const snapshots = await Promise.allSettled(projects.data
      .filter((project) => !['ARCHIVED', 'CANCELLED'].includes(project.recordStatus))
      .map(async (project) => ({
        project,
        schedule: (await scheduleApi.getProjectSchedule(context, project.id)).data
      })));
    scheduleAlerts.value = snapshots.flatMap((result) => {
      if (result.status !== 'fulfilled') return [];
      const activityById = new Map(result.value.schedule.activities.map((activity) => (
        [activity.id, activity]
      )));
      return result.value.schedule.alerts.map((alert) => {
        const activity = activityById.get(alert.activityId);
        return {
          ...alert,
          projectId: result.value.project.id,
          projectCode: result.value.project.code,
          projectName: result.value.project.name,
          activityCode: activity?.code ?? 'Activity',
          activityName: activity?.name ?? 'Trong phạm vi hạn chế'
        };
      });
    }).sort((left, right) => (
      (left.priority === right.priority ? 0 : left.priority === 'HIGH' ? -1 : 1)
      || left.dueAt.localeCompare(right.dueAt)
    )).slice(0, 12);
  } catch {
    scheduleAlertsError.value = 'Không thể tải danh sách project để tổng hợp cảnh báo.';
  } finally {
    scheduleAlertsLoading.value = false;
  }
}

function openScheduleAlert(item: DashboardScheduleAlert): void {
  void router.push({
    name: RouteName.projectSchedule,
    params: { projectId: item.projectId },
    query: { activityId: item.activityId }
  });
}

async function loadRiskChange(): Promise<void> {
  const context = auth.apiContext;
  if (!context || !auth.can('project.read') || !auth.can('riskChange.read')) return;
  riskChangeLoading.value = true;
  riskChangeError.value = '';
  try {
    const projects = (await projectApi.listProjects(context)).data
      .filter((item) => !['ARCHIVED', 'CANCELLED'].includes(item.recordStatus));
    const snapshots = await Promise.allSettled(projects.map(async (project) => ({
      project, summary: (await riskChangeApi.getSummary(context, project.id)).data
    })));
    riskChangeItems.value = snapshots.flatMap((result): DashboardRiskChangeItem[] => {
      if (result.status !== 'fulfilled') return [];
      const { project, summary } = result.value;
      return [
        ...summary.topRisks.map((item): DashboardRiskChangeItem => ({
          id: item.id, projectId: project.id, projectCode: project.code, projectName: project.name,
          kind: 'RISK', code: item.code,
          title: `${item.effectiveLevel} · exposure ${item.effectiveExposure}`,
          status: item.status, priority: ['HIGH', 'CRITICAL'].includes(item.effectiveLevel) ? 'HIGH' : 'NORMAL'
        })),
        ...summary.criticalIssues.map((item): DashboardRiskChangeItem => ({
          id: item.id, projectId: project.id, projectCode: project.code, projectName: project.name,
          kind: 'ISSUE', code: item.code, title: item.title, status: item.status, priority: 'HIGH'
        })),
        ...summary.overdueActions.map((item): DashboardRiskChangeItem => ({
          id: item.id, projectId: project.id, projectCode: project.code, projectName: project.name,
          kind: 'ACTION', code: item.code, title: item.title, status: item.status, priority: 'HIGH'
        })),
        ...summary.pendingChangeRequests.map((item): DashboardRiskChangeItem => ({
          id: item.id, projectId: project.id, projectCode: project.code, projectName: project.name,
          kind: 'CHANGE', code: item.code, title: item.title, status: item.status, priority: 'NORMAL'
        }))
      ];
    }).sort((left, right) => left.priority === right.priority ? 0 : left.priority === 'HIGH' ? -1 : 1).slice(0, 12);
  } catch {
    riskChangeError.value = 'Không thể tổng hợp Risk & Change priority lane.';
  } finally {
    riskChangeLoading.value = false;
  }
}

function openRiskChange(item: DashboardRiskChangeItem): void {
  const key = item.kind === 'RISK' ? 'riskId' : item.kind === 'ISSUE' ? 'issueId'
    : item.kind === 'ACTION' ? 'actionId' : 'changeRequestId';
  const tab = item.kind === 'ISSUE' ? 'issues' : item.kind === 'CHANGE' ? 'changes' : 'risks';
  void router.push({
    name: RouteName.projectRiskChange, params: { projectId: item.projectId },
    query: { tab, [key]: item.id }
  });
}

async function logout(): Promise<void> {
  await auth.logout();
  await router.replace({ name: RouteName.login });
}

onMounted(() => {
  void loadScheduleAlerts();
  void loadRiskChange();
});
</script>

<template>
  <AppLayout>
    <template #header-actions><el-button plain @click="logout">Đăng xuất</el-button></template>
    <p class="eyebrow eyebrow--accent">PROJECT DELIVERY · AUTHENTICATED</p>
    <h1>Solar &amp; BESS Project Management</h1>
    <p class="lead">Project Master và Project Controls đang chạy trên cùng tenant/scope policy.</p>
    <el-button v-if="auth.can('project.read')" type="primary" @click="router.push({ name: RouteName.projects })">Mở Project Master</el-button>
    <div class="status-grid">
      <StatusCard label="PHIÊN LÀM VIỆC" title="Đang hoạt động" primary>
        JWT access và refresh rotation đã bật.
      </StatusCard>
      <StatusCard label="NGƯỜI DÙNG" :title="auth.user?.displayName">
        {{ auth.user?.email }}
      </StatusCard>
      <StatusCard label="TENANT" :title="auth.tenant?.name">
        Mã: {{ auth.tenant?.code }}
      </StatusCard>
    </div>
    <ScheduleAlertLane
      v-if="auth.can('project.read') && auth.can('schedule.read')"
      :items="scheduleAlerts"
      :loading="scheduleAlertsLoading"
      :error="scheduleAlertsError"
      @open="openScheduleAlert"
      @retry="loadScheduleAlerts"
    />
    <RiskChangeLane
      v-if="auth.can('project.read') && auth.can('riskChange.read')"
      :items="riskChangeItems"
      :loading="riskChangeLoading"
      :error="riskChangeError"
      @open="openRiskChange"
      @retry="loadRiskChange"
    />
    <div class="boundary-note"><strong>Ranh giới an toàn:</strong> PM Web không gửi lệnh charge/discharge, start/stop, reset hoặc setpoint tới OT/BESS.</div>
  </AppLayout>
</template>
