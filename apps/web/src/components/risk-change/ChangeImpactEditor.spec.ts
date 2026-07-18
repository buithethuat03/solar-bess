import { mount } from '@vue/test-utils';
import ChangeImpactEditor from './ChangeImpactEditor.vue';

describe('ChangeImpactEditor — AC-016', () => {
  it('preserves numeric(19,4) amount as a string in a partial draft', async () => {
    const wrapper = mount(ChangeImpactEditor, { props: { modelValue: {} } });
    const costToggle = wrapper.findAll('input[type="checkbox"]')[2];
    await costToggle.setValue(true);
    await wrapper.get('textarea[aria-label="Cost impact summary"]').setValue('Tăng chi phí EPC');
    const amount = wrapper.get('input[inputmode="decimal"]');
    await amount.setValue('123456.7890');
    const emissions = wrapper.emitted('update:modelValue') ?? [];
    const latest = emissions.at(-1)?.[0] as { cost?: { amountDelta: unknown } };
    expect(latest.cost?.amountDelta).toBe('123456.7890');
    expect(typeof latest.cost?.amountDelta).toBe('string');
  });
});
