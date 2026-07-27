import { mount } from '@vue/test-utils';
import InvestmentScenarioPanel from './InvestmentScenarioPanel.vue';
import type {
  InvestmentScenarioProjection, OpportunityStage, OpportunityView
} from '@/types/opportunity.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function opportunity(stage: OpportunityStage = 'SCENARIO_READY'): OpportunityView {
  return {
    id: 'opportunity-1', code: 'OPP-2026-001', name: 'Nhà máy 50MWp', stage,
    customerCompanyId: 'company-1', siteId: null, locationText: 'Ninh Thuận',
    expectedCapacityKwp: '50000.0000', duplicateKey: 'hash', ownerId: 'owner-user',
    convertedProjectId: null, versionNo: 3, createdBy: 'owner-user', updatedBy: 'owner-user',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z'
  };
}

function scenario(
  overrides: Partial<InvestmentScenarioProjection> = {}
): InvestmentScenarioProjection {
  return {
    id: 'scenario-1', opportunityId: 'opportunity-1', scenarioType: 'HYBRID', version: 2,
    status: 'DRAFT', storedStatus: 'DRAFT', workflowInstanceState: null, currency: 'VND',
    // 19 significant digits at the DTO's 15-integer-digit ceiling: more than a double can hold,
    // so any float round-trip would corrupt these.
    capexTotal: '900719925474099.2500', npv: '-900719925474099.5001', irr: '12.457891',
    paybackMonths: 84, inputSnapshot: {}, outputSnapshot: {}, formulaVersion: 'fin-model-v3',
    workflowInstanceId: null, submittedBy: null, submittedAt: null, versionNo: 1,
    createdBy: 'analyst-user', updatedBy: 'analyst-user',
    createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(InvestmentScenarioPanel, {
    props: {
      opportunity: opportunity(), scenarios: [scenario()], busy: false,
      canCreate: true, canSubmit: true, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('InvestmentScenarioPanel — API-031/032', () => {
  /**
   * DB-016 stores client-supplied evidence verbatim. The browser must therefore display the stored
   * strings, not a re-derived figure — and must show the formula version that produced them,
   * because a financial number without its formula is not a decision input.
   */
  it('displays NPV, IRR and payback as the stored values beside their formula version', () => {
    const wrapper = mountPanel();

    // Grouping separators only (narrow no-break spaces); every significant digit survives.
    expect(wrapper.get('[data-testid="scenario-npv"]').text().replace(/\s/g, ''))
      .toBe('-900719925474099.5001');
    expect(wrapper.get('[data-testid="scenario-irr"]').text()).toBe('12.457891');
    expect(wrapper.get('[data-testid="scenario-payback"]').text()).toBe('84 tháng');
    expect(wrapper.get('[data-testid="scenario-formula-version"]').text()).toBe('fin-model-v3');
  });

  it('says a financial figure was not declared instead of showing a zero', () => {
    const wrapper = mountPanel({
      scenarios: [scenario({ capexTotal: null, npv: null, irr: null, paybackMonths: null })]
    });
    expect(wrapper.get('[data-testid="scenario-npv"]').text()).toBe('Không khai báo');
    expect(wrapper.get('[data-testid="scenario-irr"]').text()).toBe('Không khai báo');
    expect(wrapper.get('[data-testid="scenario-payback"]').text()).toBe('Không khai báo');
  });

  it('states that the figures are stored evidence and are never recomputed', () => {
    const note = mountPanel().get('[data-testid="scenario-evidence-note"]').text();
    expect(note).toContain('Bằng chứng, không phải phép tính');
    expect(note).toContain('formulaVersion');
  });

  /**
   * V1 has no approve/reject operation for a pre-project scenario: submit records on the aggregate
   * because the DB-071 engine cannot host the target. An approve button would promise a decision
   * the platform cannot make.
   */
  it('offers no approve or reject control anywhere', () => {
    const wrapper = mountPanel({
      scenarios: [scenario({ status: 'SUBMITTED', storedStatus: 'SUBMITTED' })]
    });
    const labels = wrapper.findAll('button').map((item) => item.text());
    expect(labels).not.toContain('Phê duyệt');
    expect(labels).not.toContain('Từ chối');
    expect(wrapper.get('[data-testid="scenario-no-approve-note"]').text())
      .toContain('không có thao tác phê duyệt');
    expect(wrapper.text()).toContain('Đang chờ quyết định');
  });

  it('offers submit only for a DRAFT/RETURNED scenario in an eligible stage', async () => {
    const draft = mountPanel();
    expect(draft.findAll('tbody button').map((item) => item.text())).toContain('Trình duyệt');

    const wrongStage = mountPanel({ opportunity: opportunity('SURVEYED') });
    expect(wrongStage.findAll('tbody button')).toHaveLength(0);

    const submitted = mountPanel({
      scenarios: [scenario({ status: 'SUBMITTED', storedStatus: 'SUBMITTED' })]
    });
    expect(submitted.findAll('tbody button')).toHaveLength(0);

    const denied = mountPanel({ canSubmit: false });
    expect(denied.findAll('tbody button')).toHaveLength(0);
  });

  it('emits submit with the scenario version the row displayed', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('tbody button')
      .find((item) => item.text() === 'Trình duyệt')!.trigger('click');
    const form = wrapper.get('form.opportunity-inline-form');
    await form.get('textarea').setValue('Trình hội đồng đầu tư');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('submit')?.[0]).toEqual(['scenario-1', {
      expectedVersion: 1, comment: 'Trình hội đồng đầu tư'
    }]);
  });

  it('refuses to create a scenario without a formula version', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Thêm kịch bản')!.trigger('click');
    const form = wrapper.get('form.opportunity-inline-form');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('formulaVersion');
  });

  it('emits create with every decimal still a string', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Thêm kịch bản')!.trigger('click');
    const form = wrapper.get('form.opportunity-inline-form');
    const inputs = form.findAll('input');
    // currency, formulaVersion, capexTotal, npv, irr, paybackMonths
    await inputs[1].setValue('fin-model-v3');
    await inputs[2].setValue('900719925474099.2500');
    await inputs[3].setValue('-1250000.5001');
    await inputs[4].setValue('12.457891');
    await inputs[5].setValue('84');
    await form.trigger('submit.prevent');

    const emitted = wrapper.emitted('create')?.[0]?.[0] as Record<string, unknown>;
    expect(emitted.capexTotal).toBe('900719925474099.2500');
    expect(emitted.npv).toBe('-1250000.5001');
    expect(emitted.irr).toBe('12.457891');
    // The one integer field the API validates as an int; every decimal above stays text.
    expect(emitted.paybackMonths).toBe(84);
  });

  it('hides the create form when the stage cannot accept a new scenario', () => {
    const wrapper = mountPanel({ opportunity: opportunity('SUBMITTED') });
    expect(wrapper.findAll('button').map((item) => item.text())).not.toContain('Thêm kịch bản');
    expect(wrapper.text()).toContain('SURVEYED, SCENARIO_READY hoặc RETURNED');
  });

  it('gives every select an explicit aria-label', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Thêm kịch bản')!.trigger('click');
    const selects = wrapper.findAll('select');
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) expect(select.attributes('aria-label')).toBeTruthy();
  });
});
