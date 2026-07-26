import { mount } from '@vue/test-utils';
import CostSummaryPanel from './CostSummaryPanel.vue';
import type { ContractView, CostSummaryData } from '@/types/contract.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function summary(overrides: Partial<CostSummaryData> = {}): CostSummaryData {
  return {
    projectId: 'project-1', reportingCurrency: null,
    budget: [{ status: 'SUBMITTED', budgetVersion: 2, currency: 'VND', totalAmount: '150000000000' }],
    commitments: [
      { currency: 'VND', status: 'ACTIVE', costCodeId: 'cc-1', costCode: 'CAPEX.PV', amount: '120000000000.0001' },
      { currency: 'USD', status: 'ACTIVE', costCodeId: 'cc-1', costCode: 'CAPEX.PV', amount: '350000.25' }
    ],
    payments: [],
    ...overrides
  };
}

function contract(id: string, contractNo: string): ContractView {
  return {
    id, projectId: 'project-1', contractNo, title: 'Gói EPC', type: 'EPC', status: 'DRAFT',
    effectiveFrom: null, effectiveTo: null, value: '1000', currency: 'VND',
    rootDocumentId: null, legalHold: false, signedAt: null, signedBy: null, versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z'
  };
}

const companies = [
  { id: 'company-1', code: 'CTY1', name: 'Công ty X', organizationType: 'INTERNAL' as const, status: 'ACTIVE' },
  { id: 'company-2', code: 'CTY2', name: 'Công ty Y', organizationType: 'CONTRACTOR' as const, status: 'ACTIVE' }
];
const legalEntities = [
  { id: 'legal-1', companyId: 'company-1', legalName: 'Pháp nhân X', country: 'VN', registrationNo: '01', taxId: null, status: 'ACTIVE' },
  { id: 'legal-2', companyId: 'company-2', legalName: 'Pháp nhân Y', country: 'VN', registrationNo: '02', taxId: null, status: 'ACTIVE' }
];

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(CostSummaryPanel, {
    props: {
      summary: summary(), contracts: [contract('contract-1', 'EPC-2026-001')],
      companies, legalEntities, busy: false,
      permissions: { budgetSubmit: true, commitmentCreate: true, paymentCreate: true },
      lastPayment: null, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

/** Strip only the display grouping separator; every digit must survive. */
function flat(text: string): string {
  return text.replace(/\u202F/g, '');
}

describe('CostSummaryPanel — API-062…066', () => {
  it('renders each currency as its own group and never totals across currencies', () => {
    const wrapper = mountPanel();
    const groups = wrapper.findAll('.cost-currency-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].attributes('data-currency')).toBe('VND');
    expect(groups[1].attributes('data-currency')).toBe('USD');
    // Each group speaks only its own currency — the other's amount never leaks in.
    expect(flat(groups[0].text())).toContain('120000000000.0001 VND');
    expect(groups[0].text()).not.toContain('USD');
    expect(flat(groups[1].text())).toContain('350000.25 USD');
    expect(groups[1].text()).not.toContain('VND');
    // And no element anywhere carries the cross-currency arithmetic result.
    expect(flat(wrapper.text())).not.toContain('120000350000');
  });

  it('keeps a null approved/paid aggregate as a dash instead of a fabricated zero', () => {
    const wrapper = mountPanel({
      summary: summary({
        commitments: [],
        payments: [{
          currency: 'VND', status: 'DRAFT', requestedAmount: '99000.0001',
          approvedAmount: null, paidAmount: null, paymentCount: 2
        }]
      })
    });
    const group = wrapper.get('.cost-currency-group');
    expect(flat(group.text())).toContain('99000.0001 VND');
    const cells = group.findAll('tbody td');
    expect(cells[3].text()).toBe('—');
    expect(cells[4].text()).toBe('—');
  });

  it('hides every command form without its permission but keeps the read-side summary', () => {
    const wrapper = mountPanel({
      permissions: { budgetSubmit: false, commitmentCreate: false, paymentCreate: false }
    });
    expect(wrapper.findAll('form.contract-inline-form')).toHaveLength(0);
    expect(wrapper.text()).toContain('CAPEX.PV');
  });

  it('emits the budget submission with money kept as text', async () => {
    const wrapper = mountPanel();
    const form = wrapper.findAll('form.contract-inline-form')[0];
    await form.findAll('input')[1].setValue('150000000001.0001');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('submit-budget')?.[0]).toEqual([{
      currency: 'VND', totalAmount: '150000000001.0001'
    }]);
  });

  it('derives the CONTRACT commitment source from the selected contract itself', async () => {
    const wrapper = mountPanel();
    const form = wrapper.findAll('form.contract-inline-form')[1];
    await form.get('select[aria-label="Hợp đồng commitment"]').setValue('contract-1');
    await form.findAll('input')[0].setValue('cost-code-uuid');
    await form.findAll('input')[1].setValue('120000000000.0001');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create-commitment')?.[0]).toEqual([{
      contractId: 'contract-1', costCodeId: 'cost-code-uuid', amount: '120000000000.0001',
      sourceType: 'CONTRACT', sourceId: 'contract-1', sourceVersion: 1
    }]);
  });

  it('shows the exact BigInt reference sum of the component breakdown', async () => {
    const wrapper = mountPanel();
    const addButton = wrapper.findAll('button').find((item) => item.text() === 'Thêm thành phần')!;
    await addButton.trigger('click');
    await addButton.trigger('click');
    const rows = wrapper.findAll('.component-editor__row');
    // The classic float trap 0.1 + 0.2 stays exactly 0.3 because nothing becomes a Number.
    await rows[0].findAll('input')[1].setValue('0.1');
    await rows[1].findAll('input')[1].setValue('0.2');
    expect(wrapper.get('.component-editor__sum').text()).toContain('0.3');
    // An invalid entry withdraws the sum instead of guessing.
    await rows[1].findAll('input')[1].setValue('abc');
    expect(wrapper.get('.component-editor__sum').text()).toContain('chưa đủ dữ liệu hợp lệ');
  });

  it('blocks a payment whose payer and payee legal entity coincide', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.payment-form');
    await form.get('select[aria-label="Hợp đồng thanh toán"]').setValue('contract-1');
    await form.findAll('input')[0].setValue('100');
    await form.get('select[aria-label="Company chi trả"]').setValue('company-1');
    await form.get('select[aria-label="Pháp nhân chi trả"]').setValue('legal-1');
    await form.get('select[aria-label="Company thụ hưởng"]').setValue('company-1');
    await form.get('select[aria-label="Pháp nhân thụ hưởng"]').setValue('legal-1');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create-payment')).toBeUndefined();
    expect(wrapper.text()).toContain('Pháp nhân chi trả và thụ hưởng phải khác nhau');
  });

  it('emits the payment command with its contract, parties and component breakdown', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.payment-form');
    await form.get('select[aria-label="Hợp đồng thanh toán"]').setValue('contract-1');
    await form.findAll('input')[0].setValue('99000.0001');
    await form.get('select[aria-label="Company chi trả"]').setValue('company-1');
    await form.get('select[aria-label="Pháp nhân chi trả"]').setValue('legal-1');
    await form.get('select[aria-label="Company thụ hưởng"]').setValue('company-2');
    await form.get('select[aria-label="Pháp nhân thụ hưởng"]').setValue('legal-2');
    await wrapper.findAll('button').find((item) => item.text() === 'Thêm thành phần')!.trigger('click');
    const row = wrapper.get('.component-editor__row');
    await row.findAll('input')[1].setValue('99000.0001');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create-payment')?.[0]).toEqual(['contract-1', {
      payerCompanyId: 'company-1', payerLegalEntityId: 'legal-1',
      payeeCompanyId: 'company-2', payeeLegalEntityId: 'legal-2',
      requestedAmount: '99000.0001',
      components: [{
        sequenceNo: 1, componentType: 'BASE', amount: '99000.0001', ruleVersion: 'v1'
      }]
    }]);
  });
});
