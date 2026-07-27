import { mount } from '@vue/test-utils';
import OpportunityDetailPanel from './OpportunityDetailPanel.vue';
import type {
  ConvertOpportunityView, InvestmentScenarioProjection, OpportunityStage, OpportunityView
} from '@/types/opportunity.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function opportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: 'opportunity-1', code: 'OPP-2026-001', name: 'Nhà máy 50MWp', stage: 'SCENARIO_READY',
    customerCompanyId: 'company-1', siteId: null, locationText: 'Ninh Thuận',
    expectedCapacityKwp: '50000.0000', duplicateKey: 'hash', ownerId: 'owner-user',
    convertedProjectId: null, versionNo: 3, createdBy: 'owner-user', updatedBy: 'owner-user',
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', ...overrides
  };
}

function scenario(
  overrides: Partial<InvestmentScenarioProjection> = {}
): InvestmentScenarioProjection {
  return {
    id: 'scenario-1', opportunityId: 'opportunity-1', scenarioType: 'SOLAR', version: 1,
    status: 'DRAFT', storedStatus: 'DRAFT', workflowInstanceState: null, currency: 'VND',
    capexTotal: '1000.0000', npv: '10.0000', irr: '9.500000', paybackMonths: 60,
    inputSnapshot: {}, outputSnapshot: {}, formulaVersion: 'fin-model-v3',
    workflowInstanceId: null, submittedBy: null, submittedAt: null, versionNo: 1,
    createdBy: 'analyst-user', updatedBy: 'analyst-user',
    createdAt: '2026-07-10T00:00:00.000Z', updatedAt: '2026-07-10T00:00:00.000Z', ...overrides
  };
}

const allPermissions = {
  update: true, createSurvey: true, createScenario: true, submitScenario: true, convert: true
};

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(OpportunityDetailPanel, {
    props: {
      opportunity: opportunity(), surveys: [], scenarios: [scenario()], conversion: null,
      busy: false, permissions: { ...allPermissions }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function labels(wrapper: ReturnType<typeof mountPanel>): string[] {
  return wrapper.findAll('button').map((item) => item.text());
}

describe('OpportunityDetailPanel — API-028…033', () => {
  /**
   * Stage APPROVED is unreachable through the V1 API: submit records on the aggregate and no
   * operation approves an opportunity. An approve button would promise a decision the platform
   * cannot make.
   */
  it('offers no approve control in any stage', () => {
    for (const stage of ['SCENARIO_READY', 'SUBMITTED', 'RETURNED'] as OpportunityStage[]) {
      const wrapper = mountPanel({ opportunity: opportunity({ stage }) });
      expect(labels(wrapper)).not.toContain('Phê duyệt');
      expect(labels(wrapper)).not.toContain('Từ chối');
    }
  });

  it('offers only the adjacent WF-002 stage moves API-029 accepts', () => {
    expect(labels(mountPanel({ opportunity: opportunity({ stage: 'LEAD' }) })))
      .toContain('→ Đã sàng lọc');
    expect(labels(mountPanel({ opportunity: opportunity({ stage: 'RETURNED' }) })))
      .toContain('→ Sẵn kịch bản');

    // SCENARIO_READY has no direct move: the remaining stages are command-owned.
    const locked = mountPanel({ opportunity: opportunity({ stage: 'SCENARIO_READY' }) });
    expect(locked.get('[data-testid="stage-locked-note"]').text())
      .toContain('do lệnh sở hữu');
  });

  it('emits the stage move the button named', async () => {
    const wrapper = mountPanel({ opportunity: opportunity({ stage: 'LEAD' }) });
    await wrapper.findAll('button')
      .find((item) => item.text() === '→ Đã sàng lọc')!.trigger('click');
    expect(wrapper.emitted('advanceStage')?.[0]).toEqual(['QUALIFIED']);
  });

  /**
   * Convert eligibility mirrors `assertConvertEligible`: stage APPROVED, or a scenario whose
   * PROJECTED status is APPROVED. The control appears only when the loaded data satisfies it.
   */
  it('offers convert only when the API reports the stage allows it', () => {
    expect(labels(mountPanel())).not.toContain('Chuyển thành dự án');
    expect(mountPanel().get('[data-testid="convert-gate-note"]').text())
      .toContain('API V1 không có thao tác phê duyệt nào');

    const byStage = mountPanel({ opportunity: opportunity({ stage: 'APPROVED' }) });
    expect(labels(byStage)).toContain('Chuyển thành dự án');

    const byScenario = mountPanel({
      scenarios: [scenario({ status: 'APPROVED', storedStatus: 'APPROVED' })]
    });
    expect(labels(byScenario)).toContain('Chuyển thành dự án');

    const denied = mountPanel({
      opportunity: opportunity({ stage: 'APPROVED' }),
      permissions: { ...allPermissions, convert: false }
    });
    expect(labels(denied)).not.toContain('Chuyển thành dự án');
  });

  it('reports an already converted opportunity as converted, not as an error', () => {
    const wrapper = mountPanel({
      opportunity: opportunity({ stage: 'CONVERTED', convertedProjectId: 'project-9' })
    });
    const note = wrapper.get('[data-testid="already-converted-note"]').text();
    expect(note).toContain('Đã chuyển đổi');
    expect(note).toContain('project-9');
    expect(note).toContain('không phải lỗi');
    expect(labels(wrapper)).not.toContain('Chuyển thành dự án');
  });

  it('describes a replayed convert response as a prior conversion, not a failure', () => {
    const conversion: ConvertOpportunityView = {
      id: 'project-9', code: 'OPP-2026-001', name: 'Nhà máy 50MWp', type: 'SOLAR',
      phase: 'INITIATION', recordStatus: 'DRAFT', portfolioId: 'portfolio-1',
      ownerLegalEntityId: 'legal-1', customerCompanyId: 'company-1', projectManagerId: null,
      contractModel: 'EPC', currency: 'VND', plannedCod: '2027-06-30', forecastCod: null,
      sourceOpportunityId: 'opportunity-1', versionNo: 1,
      sites: [{
        id: 'site-1', projectId: 'project-9', code: 'S-01', name: 'Site chính',
        location: null, timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: 'ACTIVE'
      }],
      opportunityId: 'opportunity-1', alreadyConverted: true
    };
    const wrapper = mountPanel({ conversion });
    const result = wrapper.get('[data-testid="conversion-result"]').text();
    expect(result).toContain('Đã chuyển đổi trước đó');
    expect(result).toContain('S-01');
  });

  it('emits a survey revision with one document reference per line', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Thêm revision')!.trigger('click');
    const form = wrapper.get('form.opportunity-inline-form');
    await form.get('select[aria-label="Chất lượng dữ liệu khảo sát"]').setValue('VALIDATED');
    await form.findAll('textarea')[0].setValue('DOCUMENT:uuid-1\n\nDOCUMENT:uuid-2\n');
    await form.findAll('textarea')[1].setValue('Khảo sát địa hình đợt 2');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('createSurvey')?.[0]).toEqual([{
      dataQuality: 'VALIDATED',
      documentRefs: ['DOCUMENT:uuid-1', 'DOCUMENT:uuid-2'],
      notes: 'Khảo sát địa hình đợt 2'
    }]);
  });

  it('keeps the expected capacity as text and says so when it is absent', () => {
    expect(mountPanel().text().replace(/\s/g, '')).toContain('50000.0000kWp');
    const undeclared = mountPanel({
      opportunity: opportunity({ expectedCapacityKwp: null })
    });
    expect(undeclared.text()).toContain('Chưa khai báo');
  });

  it('gives every select an explicit aria-label', async () => {
    const wrapper = mountPanel({ opportunity: opportunity({ stage: 'APPROVED' }) });
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Thêm revision')!.trigger('click');
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Chuyển thành dự án')!.trigger('click');
    const selects = wrapper.findAll('select');
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) expect(select.attributes('aria-label')).toBeTruthy();
  });
});
