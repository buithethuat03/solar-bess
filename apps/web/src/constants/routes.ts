export const RouteName = {
  dashboard: 'dashboard',
  login: 'login',
  projects: 'projects',
  projectCreate: 'project-create',
  projectDetail: 'project-detail',
  projectSchedule: 'project-schedule',
  projectRiskChange: 'project-risk-change',
  projectFieldOperations: 'project-field-operations',
  projectQuality: 'project-quality',
  projectProcurement: 'project-procurement',
  projectCommissioning: 'project-commissioning',
  assetOperations: 'asset-operations',
  opportunities: 'opportunities',
  search: 'search',
  projectDocuments: 'project-documents',
  projectContracts: 'project-contracts',
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
  projectFieldOperations: '/projects/:projectId/field-operations',
  projectQuality: '/projects/:projectId/quality',
  projectProcurement: '/projects/:projectId/procurement',
  projectCommissioning: '/projects/:projectId/commissioning',
  /** O&M is asset-scoped: the site and project are derived from the asset by the API. */
  assetOperations: '/assets/:assetId/operations',
  /** Opportunities are pre-project records, so the route carries no project segment. */
  opportunities: '/opportunities',
  search: '/search',
  projectDocuments: '/projects/:projectId/documents',
  projectContracts: '/projects/:projectId/contracts',
  notifications: '/notifications',
  approvals: '/approvals'
} as const;
