import type { RouteRecordRaw } from 'vue-router';
import { RouteName, RoutePath } from '@/constants/routes';

export const routes: RouteRecordRaw[] = [
  {
    path: RoutePath.dashboard,
    name: RouteName.dashboard,
    component: () => import('@/views/dashboard/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: RoutePath.projectCreate,
    name: RouteName.projectCreate,
    component: () => import('@/views/projects/ProjectCreateView.vue'),
    meta: { requiresAuth: true, permission: 'project.create' }
  },
  {
    path: RoutePath.projectSchedule,
    name: RouteName.projectSchedule,
    component: () => import('@/views/schedule/ProjectScheduleView.vue'),
    meta: { requiresAuth: true, permission: 'schedule.read' }
  },
  {
    path: RoutePath.projectRiskChange,
    name: RouteName.projectRiskChange,
    component: () => import('@/views/risk-change/ProjectRiskChangeView.vue'),
    meta: { requiresAuth: true, permission: 'riskChange.read' }
  },
  {
    path: RoutePath.projectDocuments,
    name: RouteName.projectDocuments,
    component: () => import('@/views/documents/ProjectDocumentsView.vue'),
    meta: { requiresAuth: true, permission: 'document.read' }
  },
  {
    // Đăng ký trước projectDetail để '/projects/:projectId/contracts' không bị nuốt bởi ':projectId'.
    path: RoutePath.projectContracts,
    name: RouteName.projectContracts,
    component: () => import('@/views/contracts/ProjectContractsView.vue'),
    meta: { requiresAuth: true, permission: 'contract.read' }
  },
  {
    path: RoutePath.projectDetail,
    name: RouteName.projectDetail,
    component: () => import('@/views/projects/ProjectDetailView.vue'),
    meta: { requiresAuth: true, permission: 'project.read' }
  },
  {
    path: RoutePath.projects,
    name: RouteName.projects,
    component: () => import('@/views/projects/ProjectListView.vue'),
    meta: { requiresAuth: true, permission: 'project.read' }
  },
  {
    path: RoutePath.notifications,
    name: RouteName.notifications,
    component: () => import('@/views/notification/NotificationInboxView.vue'),
    meta: { requiresAuth: true, permission: 'notification.read' }
  },
  {
    path: RoutePath.approvals,
    name: RouteName.approvals,
    component: () => import('@/views/workflow/ApprovalInboxView.vue'),
    meta: { requiresAuth: true, permission: 'approvalTask.read' }
  },
  {
    path: RoutePath.login,
    name: RouteName.login,
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { guestOnly: true }
  }
];
