import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScheduleGantt from './ScheduleGantt.vue';
import type { ScheduleActivity } from '@/types/schedule.types';

const activity: ScheduleActivity = {
  id: 'activity-1',
  wbsId: 'wbs-1',
  packageId: 'package-1',
  ownerId: 'user-1',
  code: 'ENG-010',
  name: 'Chốt thiết kế cơ sở',
  activityType: 'TASK',
  weight: '20',
  plannedStart: '2026-07-01',
  plannedFinish: '2026-07-10',
  forecastStart: '2026-07-02',
  forecastFinish: '2026-07-14',
  actualStart: '2026-07-02',
  actualFinish: null,
  durationWorkDays: 8,
  remainingDurationWorkDays: 4,
  percentComplete: '50',
  status: 'IN_PROGRESS',
  totalFloatWorkDays: 0,
  critical: true,
  nearCritical: false,
  versionNo: 3
};

describe('ScheduleGantt — AC-010/011', () => {
  it('renders non-colour critical semantics and emits scoped progress action', async () => {
    const wrapper = mount(ScheduleGantt, {
      props: {
        activities: [activity],
        wbsNodes: [{
          id: 'wbs-1', packageId: 'package-1', parentWbsId: null, ownerId: 'user-1',
          code: '1.1', name: 'Engineering', description: null, weight: '100', sortOrder: 1,
          status: 'ACTIVE', versionNo: 1
        }],
        packages: [{
          id: 'package-1', projectId: 'project-1', parentPackageId: null,
          contractorCompanyId: null, code: 'EPC', name: 'EPC package', packageType: 'EPC',
          status: 'ACTIVE', versionNo: 1
        }],
        progressActivityIds: ['activity-1']
      },
      global: {
        stubs: {
          ElButton: { template: '<button type="button" data-test="progress-button" @click="$emit(\'click\', $event)"><slot /></button>' }
        }
      }
    });

    expect(wrapper.get('[role="button"]').attributes('aria-label')).toContain('đường găng');
    expect(wrapper.find('.schedule-gantt__forecast.is-critical').exists()).toBe(true);
    await wrapper.get('[data-test="progress-button"]').trigger('click');
    expect(wrapper.emitted('progress')?.[0]).toEqual([activity]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
