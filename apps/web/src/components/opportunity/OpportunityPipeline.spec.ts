import { mount } from '@vue/test-utils';
import OpportunityPipeline from './OpportunityPipeline.vue';
import type { OpportunityStage, OpportunityView } from '@/types/opportunity.types';

function opportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: 'opportunity-1', code: 'OPP-2026-001', name: 'Nhà máy 50MWp', stage: 'LEAD',
    customerCompanyId: 'company-1', siteId: null, locationText: 'Ninh Thuận',
    expectedCapacityKwp: '900719925474099.0001', duplicateKey: 'hash', ownerId: 'owner-user',
    convertedProjectId: null, versionNo: 1, createdBy: 'owner-user', updatedBy: 'owner-user',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', ...overrides
  };
}

function mountPipeline(overrides: Record<string, unknown> = {}) {
  return mount(OpportunityPipeline, {
    props: { opportunities: [opportunity()], selectedId: null, ...overrides }
  });
}

describe('OpportunityPipeline — API-026', () => {
  it('draws one lane per WF-002 stage, including the empty ones', () => {
    const lanes = mountPipeline().findAll('.opportunity-lane');
    expect(lanes).toHaveLength(9);
    expect(lanes.map((lane) => lane.attributes('data-stage'))).toEqual([
      'LEAD', 'QUALIFIED', 'SURVEYED', 'SCENARIO_READY', 'SUBMITTED',
      'APPROVED', 'RETURNED', 'REJECTED', 'CONVERTED'
    ]);
    // An empty stage is a fact about the pipeline, so the lane still says so.
    expect(lanes[1].text()).toContain('Không có cơ hội ở giai đoạn này');
  });

  it('places each opportunity in the lane of its own stage', () => {
    const wrapper = mountPipeline({
      opportunities: [
        opportunity(),
        opportunity({ id: 'opportunity-2', code: 'OPP-2026-002', stage: 'CONVERTED' })
      ]
    });
    const converted = wrapper.findAll('.opportunity-lane')
      .find((lane) => lane.attributes('data-stage') === 'CONVERTED')!;
    expect(converted.text()).toContain('OPP-2026-002');
    expect(converted.text()).not.toContain('OPP-2026-001');
  });

  it('groups the expected capacity without ever rounding it', () => {
    const card = mountPipeline().get('.opportunity-card').text().replace(/\s/g, '');
    expect(card).toContain('900719925474099.0001kWp');
  });

  it('never totals capacity across lanes', () => {
    const wrapper = mountPipeline({
      opportunities: [
        opportunity({ expectedCapacityKwp: '100.0000' }),
        opportunity({ id: 'opportunity-2', stage: 'QUALIFIED', expectedCapacityKwp: '200.0000' })
      ]
    });
    // Summing capacity across stages would invent a portfolio figure nobody asked for; the only
    // aggregate rendered is a row count per lane.
    expect(wrapper.text()).not.toContain('300');
    expect(wrapper.text()).toContain('2 cơ hội');
  });

  it('emits the opportunity id when a card is opened', async () => {
    const wrapper = mountPipeline();
    await wrapper.get('.opportunity-card').trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['opportunity-1']);
  });

  it('marks the selected card so the detail panel and the lane agree', () => {
    const wrapper = mountPipeline({ selectedId: 'opportunity-1' });
    expect(wrapper.get('.opportunity-lane li').attributes('data-selected')).toBe('true');
  });

  it('labels every lane for assistive technology', () => {
    for (const lane of mountPipeline().findAll('.opportunity-lane')) {
      expect(lane.attributes('aria-label')).toBeTruthy();
    }
  });

  it('says when an opportunity has no location instead of leaving the line blank', () => {
    const wrapper = mountPipeline({
      opportunities: [opportunity({ locationText: null } as Partial<OpportunityView>)]
    });
    expect(wrapper.get('.opportunity-card').text()).toContain('Chưa có địa điểm');
  });

  it.each(['LEAD', 'CONVERTED'] as OpportunityStage[])(
    'chips the %s lane with its own status marker',
    (stage) => {
      const lane = mountPipeline().findAll('.opportunity-lane')
        .find((item) => item.attributes('data-stage') === stage)!;
      expect(lane.get('.status-pill').attributes('data-status')).toBe(stage);
    }
  );
});
