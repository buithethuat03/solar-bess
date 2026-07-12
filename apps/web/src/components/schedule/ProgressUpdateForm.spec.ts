import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProgressUpdateForm from './ProgressUpdateForm.vue';
import type { ProgressHistoryItem, ScheduleActivity } from '@/types/schedule.types';

const activity: ScheduleActivity = {
  id: 'activity-1', wbsId: 'wbs-1', packageId: 'package-1', ownerId: 'user-1',
  code: 'CON-010', name: 'Lắp đặt inverter', activityType: 'TASK', weight: '30',
  plannedStart: '2026-07-01', plannedFinish: '2026-07-20', forecastStart: null,
  forecastFinish: null, actualStart: null, actualFinish: null, durationWorkDays: 15,
  remainingDurationWorkDays: 15, percentComplete: '0', status: 'READY', totalFloatWorkDays: 2,
  critical: false, nearCritical: true, versionNo: 4
};

function mountForm() {
  return mount(ProgressUpdateForm, {
    props: { activity, dataDate: '2026-07-12', busy: false },
    global: {
      stubs: {
        ElAlert: { props: ['title'], template: '<div data-test="alert">{{ title }}</div>' },
        ElButton: { template: '<button><slot /></button>' }
      }
    }
  });
}

describe('ProgressUpdateForm — AC-011', () => {
  it('blocks actual finish without 100 percent, actual start and evidence', async () => {
    const wrapper = mountForm();
    await wrapper.findAll('input[type="date"]')[2]!.setValue('2026-07-12');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('[data-test="alert"]').text()).toContain('Actual finish yêu cầu');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('emits an append-only command with the activity expected version', async () => {
    const wrapper = mountForm();
    const numberInputs = wrapper.findAll('input[type="number"]');
    await numberInputs[0]!.setValue('55');
    await numberInputs[1]!.setValue('7');
    await wrapper.get('textarea').setValue('PHOTO-100\nDOC-200');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      activityId: 'activity-1', percentComplete: '55', remainingDurationWorkDays: 7,
      evidenceRefs: ['PHOTO-100', 'DOC-200'], expectedActivityVersion: 4
    });
  });

  it('selects a stable history record and emits an explicit nullable correction', async () => {
    const history: ProgressHistoryItem[] = [{
      id: 'progress-1', activityId: activity.id, dataDate: '2026-07-10',
      percentComplete: '20.00', remainingDurationWorkDays: 10,
      correctionOfId: null, quantity: null, unit: null,
      actualStart: null, actualFinish: null, evidenceRefs: ['PHOTO-OLD'],
      note: null, reason: null, recordedBy: 'user-1',
      recordedAt: '2026-07-10T10:00:00.000Z'
    }];
    const wrapper = mount(ProgressUpdateForm, {
      props: {
        activity, dataDate: '2026-07-12', busy: false,
        history, canRecord: true, canCorrect: true
      },
      global: {
        stubs: {
          ElAlert: { props: ['title'], template: '<div data-test="alert">{{ title }}</div>' },
          ElButton: { template: '<button><slot /></button>' }
        }
      }
    });
    await wrapper.findAll('select')[0]!.setValue('CORRECT');
    await wrapper.findAll('select')[1]!.setValue('progress-1');
    const reason = wrapper.findAll('label').find((label) => label.text().includes('Lý do correction'))!;
    await reason.get('textarea').setValue('Sửa biên bản nghiệm thu');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      correctionOfId: 'progress-1', reason: 'Sửa biên bản nghiệm thu',
      dataDate: '2026-07-10', percentComplete: '20',
      actualStart: null, actualFinish: null, expectedActivityVersion: 4
    });
  });

});
