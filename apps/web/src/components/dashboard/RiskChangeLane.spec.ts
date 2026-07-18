import { mount } from '@vue/test-utils';
import RiskChangeLane from './RiskChangeLane.vue';

describe('RiskChangeLane — AC-015/016', () => {
  it('emits a scoped priority item without inventing hidden counts', async () => {
    const wrapper = mount(RiskChangeLane, { props: {
      loading: false, error: '', items: [{
        id: 'risk-1', projectId: 'project-1', projectCode: 'SOL-01', projectName: 'Solar',
        kind: 'RISK', code: 'RSK-01', title: 'HIGH · exposure 18', status: 'TREATING', priority: 'HIGH'
      }]
    }, global: { stubs: { ElButton: true, ElAlert: true } } });
    await wrapper.get('button[data-priority="HIGH"]').trigger('click');
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ id: 'risk-1', kind: 'RISK' });
  });
});
