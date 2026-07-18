import { mount } from '@vue/test-utils';
import ScheduleBaselinePanel from './ScheduleBaselinePanel.vue';
import type { ScheduleBaseline } from '@/types/schedule.types';

const baseline: ScheduleBaseline = {
  id: 'baseline-id', baselineNumber: 1, baselineType: 'INITIAL', status: 'APPROVED',
  dataDate: '2026-07-18', snapshotHash: 'a'.repeat(64), approvedChangeRequestId: null,
  createdBy: 'creator', submittedBy: 'submitter', approvedBy: 'approver',
  approvedAt: '2026-07-18T00:00:00Z', versionNo: 3
};

describe('ScheduleBaselinePanel — API-036/159', () => {
  it('submits REBASELINE with only immutable Change reference and schedule facts', async () => {
    const wrapper = mount(ScheduleBaselinePanel, {
      props: {
        baseline, scheduleVersion: 8, dataDate: '2026-07-20', canSubmit: true,
        canRebaseline: true, approvedChangeRequestId: 'change-id', canDecide: false, busy: false
      },
      global: { stubs: {
        ElButton: { template: '<button><slot /></button>' },
        ElAlert: true
      } }
    });
    const rebaseline = wrapper.get('form.desktop-decision');
    await rebaseline.trigger('submit');
    const payload = wrapper.emitted('submit')?.[0]?.[0] as Record<string, unknown>;
    expect(payload).toEqual({
      baselineType: 'REBASELINE', dataDate: '2026-07-20',
      approvedChangeRequestId: 'change-id', expectedScheduleVersion: 8
    });
    expect(payload).not.toHaveProperty('reason');
    expect(payload).not.toHaveProperty('impactSummary');
  });
});
