import { mount } from '@vue/test-utils';
import RiskHeatmap from './RiskHeatmap.vue';

function cells(countAtOne = 0) {
  return Array.from({ length: 25 }, (_, index) => ({
    probability: Math.floor(index / 5) + 1,
    impactRating: (index % 5) + 1,
    count: index === 0 ? countAtOne : 0
  }));
}

describe('RiskHeatmap — API-157/AC-015', () => {
  it('renders complete inherent/residual 5x5 alternatives and residual missing facts', async () => {
    const wrapper = mount(RiskHeatmap, { props: { heatmap: {
      filteredRiskCount: 3,
      versionGroups: [{
        scoringVersion: 'S1', thresholdVersion: 'T1', inherentCells: cells(2),
        residualCells: cells(1), residualMissingCount: 2
      }]
    } } });
    expect(wrapper.findAll('tbody td')).toHaveLength(25);
    expect(wrapper.text()).toContain('S1 · T1');
    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.text()).toContain('Chưa đánh giá residual: 2');
    expect(wrapper.get('table').attributes('aria-hidden')).toBeUndefined();
  });
});
