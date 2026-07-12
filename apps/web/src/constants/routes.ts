export const RouteName = {
  dashboard: 'dashboard',
  login: 'login',
  projects: 'projects',
  projectCreate: 'project-create',
  projectDetail: 'project-detail',
  projectSchedule: 'project-schedule'
} as const;

export const RoutePath = {
  dashboard: '/',
  login: '/login',
  projects: '/projects',
  projectCreate: '/projects/new',
  projectDetail: '/projects/:projectId',
  projectSchedule: '/projects/:projectId/schedule'
} as const;
