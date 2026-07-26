import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('frontend project structure — ADR-001/ADR-003', () => {
  it.each(['app', 'api', 'components/common', 'components/projects', 'components/schedule', 'components/risk-change', 'layouts', 'router', 'stores', 'styles', 'types', 'views/projects', 'views/schedule', 'views/risk-change',
    'components/notification', 'views/notification', 'components/auth',
    'components/workflow', 'views/workflow', 'components/documents', 'views/documents'])(
    'contains src/%s',
    (directory) => expect(existsSync(join(process.cwd(), 'src', directory))).toBe(true)
  );

  it('keeps transport calls out of stores, views and shared components', () => {
    for (const file of [
      'src/stores/auth.store.ts',
      'src/views/auth/LoginView.vue',
      'src/views/dashboard/DashboardView.vue',
      'src/views/projects/ProjectListView.vue',
      'src/views/projects/ProjectCreateView.vue',
      'src/views/projects/ProjectDetailView.vue',
      'src/views/schedule/ProjectScheduleView.vue',
      'src/views/risk-change/ProjectRiskChangeView.vue',
      'src/views/notification/NotificationInboxView.vue',
      'src/components/notification/NotificationInbox.vue',
      'src/views/workflow/ApprovalInboxView.vue',
      'src/components/workflow/ApprovalTaskList.vue',
      'src/views/documents/ProjectDocumentsView.vue',
      'src/components/documents/DocumentRegisterTable.vue',
      'src/components/documents/DocumentUploadPanel.vue',
      'src/components/projects/ProjectForm.vue',
      'src/components/schedule/ScheduleGantt.vue',
      'src/components/risk-change/RiskHeatmap.vue',
      'src/components/common/AppHeader.vue'
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toContain('fetch(');
    }
  });

  it('keeps one API module per backend feature module', () => {
    expect(existsSync(join(process.cwd(), 'src/api/auth.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/project.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/schedule.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/risk-change.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/user.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/notification.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/workflow.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/document.api.ts'))).toBe(true);
  });
});
