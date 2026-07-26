export const RouteName = {
  dashboard: 'dashboard',
  login: 'login',
  projects: 'projects',
  projectCreate: 'project-create',
  projectDetail: 'project-detail',
  projectSchedule: 'project-schedule',
  projectRiskChange: 'project-risk-change',
  projectDocuments: 'project-documents',
  notifications: 'notifications',
  approvals: 'approvals'
} as const;

export const RoutePath = {
  dashboard: '/',
  login: '/login',
  projects: '/projects',
  projectCreate: '/projects/new',
  projectDetail: '/projects/:projectId',
  projectSchedule: '/projects/:projectId/schedule',
  projectRiskChange: '/projects/:projectId/risk-change',
  projectDocuments: '/projects/:projectId/documents',
  notifications: '/notifications',
  approvals: '/approvals'
} as const;
