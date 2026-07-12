import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ScheduleDraftPanel from './ScheduleDraftPanel.vue';

const buttonStub = {
  props: ['disabled'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};

describe('ScheduleDraftPanel — AC-010/API-035', () => {
  it('requires a successful preview of the unchanged payload before commit', async () => {
    const wrapper = mount(ScheduleDraftPanel, {
      props: {
        expectedVersion: 7,
        calendar: {
          timezone: 'Asia/Ho_Chi_Minh', calendarCode: 'STANDARD',
          workingWeek: [1, 2, 3, 4, 5], exceptions: []
        },
        previewResult: null,
        busy: false,
        canImport: true,
        modelValue: null
      },
      global: { stubs: { ElButton: buttonStub, ElAlert: true } }
    });
    const buttons = wrapper.findAll('button');
    const previewButton = buttons.find((button) => button.text() === 'Preview')!;
    const commitButton = buttons.find((button) => button.text() === 'Commit draft')!;
    expect(commitButton.attributes('disabled')).toBeDefined();

    await previewButton.trigger('click');
    expect(wrapper.emitted('preview')?.[0]?.[0]).toMatchObject({ mode: 'PREVIEW', expectedVersion: 7 });

    await wrapper.setProps({
      previewResult: {
        mode: 'PREVIEW', committed: false, scheduleVersion: null,
        validationIssues: [], calculatedAt: '2026-07-12T00:00:00Z', formulaVersion: 'CPM_WORKDAY_V1'
      }
    });
    expect(commitButton.attributes('disabled')).toBeUndefined();
    await commitButton.trigger('click');
    expect(wrapper.emitted('commit')?.[0]?.[0]).toMatchObject({ mode: 'COMMIT', expectedVersion: 7 });
  });
});
