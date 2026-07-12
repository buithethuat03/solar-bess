import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('frontend project structure — ADR-001/ADR-003', () => {
  it.each(['app', 'api', 'components/common', 'components/projects', 'components/schedule', 'layouts', 'router', 'stores', 'styles', 'types', 'views/projects', 'views/schedule'])(
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
      'src/components/projects/ProjectForm.vue',
      'src/components/schedule/ScheduleGantt.vue',
      'src/components/common/AppHeader.vue'
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toContain('fetch(');
    }
  });

  it('keeps one API module per backend feature module', () => {
    expect(existsSync(join(process.cwd(), 'src/api/auth.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/project.api.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/api/schedule.api.ts'))).toBe(true);
  });
});
