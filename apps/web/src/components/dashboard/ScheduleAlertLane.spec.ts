import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScheduleAlertLane from './ScheduleAlertLane.vue';
import type { DashboardScheduleAlert } from '@/types/schedule.types';

const alert: DashboardScheduleAlert = {
  id: 'alert-1', projectId: 'project-1', projectCode: 'SOL-001',
  projectName: 'Solar One', activityId: 'activity-1',
  activityCode: 'CIV-010', activityName: 'Thi công móng',
  alertType: 'OVERDUE', dataDate: '2026-07-12', priority: 'HIGH',
  dueAt: '2026-07-10', thresholdVersion: 'SCHEDULE_THRESHOLDS_V1'
};

describe('ScheduleAlertLane — AC-013', () => {
  it('renders text-based priority context and emits the scoped drill-down item', async () => {
    const wrapper = mount(ScheduleAlertLane, {
      props: { items: [alert], loading: false, error: '' },
      global: { stubs: { ElButton: { template: '<button><slot /></button>' } } }
    });

    expect(wrapper.text()).toContain('OVERDUE');
    expect(wrapper.text()).toContain('SOL-001 · Solar One');
    expect(wrapper.get('button').attributes('data-priority')).toBe('HIGH');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('open')?.[0]?.[0]).toEqual(alert);
  });
});
