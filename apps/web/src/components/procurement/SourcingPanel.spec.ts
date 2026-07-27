import { mount } from '@vue/test-utils';
import SourcingPanel from './SourcingPanel.vue';
import type { RequisitionView, SupplierView } from '@/types/procurement.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function supplier(overrides: Partial<SupplierView> = {}): SupplierView {
  return {
    id: 'supplier-qualified', companyId: 'CTY-A', legalEntityId: 'legal-1', category: 'PV_MODULE',
    qualificationStatus: 'QUALIFIED', validFrom: '2026-01-01', validTo: '2026-12-31',
    versionNo: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function requisition(): RequisitionView {
  return {
    id: 'requisition-1', projectId: 'project-1', packageId: 'package-1', wbsId: null,
    costCodeId: 'cost-code-1', number: 'PR-2026-001', title: 'Mua module PV',
    description: null, needByDate: '2026-09-30', status: 'DRAFT', versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z'
  };
}

const suppliers = [
  supplier(),
  supplier({ id: 'supplier-expired', companyId: 'CTY-B', validTo: '2026-07-25' }),
  supplier({ id: 'supplier-pending', companyId: 'CTY-C', qualificationStatus: 'PENDING' }),
  supplier({ id: 'supplier-suspended', companyId: 'CTY-D', qualificationStatus: 'SUSPENDED' })
];

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(SourcingPanel, {
    props: {
      requisitions: [requisition()], rfqs: [], suppliers, busy: false, asOf: '2026-07-26',
      permissions: { createRequisition: true, issueRfq: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('SourcingPanel — API-077 / API-078', () => {
  it('offers only qualified, unexpired suppliers in the invitee picker', () => {
    const wrapper = mountPanel();
    const options = wrapper.findAll('.invitee-picker__option');
    expect(options).toHaveLength(1);
    expect(options[0].text()).toContain('CTY-A');
    const picker = wrapper.get('.invitee-picker');
    // Not merely disabled: an ineligible supplier is not an option at all.
    expect(picker.text()).not.toContain('CTY-B');
    expect(picker.text()).not.toContain('CTY-C');
    expect(picker.text()).not.toContain('CTY-D');
    expect(picker.text()).toContain('3 hồ sơ khác bị loại');
  });

  it('emits the RFQ command with only the suppliers that were ticked', async () => {
    const wrapper = mountPanel({
      suppliers: [supplier(), supplier({ id: 'supplier-two', companyId: 'CTY-E' })]
    });
    const form = wrapper.get('form.rfq-form');
    await form.get('select[aria-label="Requisition phát hành RFQ"]').setValue('requisition-1');
    const inputs = form.findAll('input');
    await inputs[0].setValue('RFQ-2026-001');
    await inputs[1].setValue('2');
    await inputs[2].setValue('2026-08-15T09:00');
    await wrapper.findAll('.invitee-picker__option input')[1].setValue(true);
    await form.trigger('submit.prevent');

    const emitted = wrapper.emitted('create-rfq')?.[0] as [string, Record<string, unknown>];
    expect(emitted[0]).toBe('requisition-1');
    expect(emitted[1].number).toBe('RFQ-2026-001');
    expect(emitted[1].revision).toBe(2);
    expect(emitted[1].invitedSupplierIds).toEqual(['supplier-two']);
  });

  it('refuses to send an RFQ with no invitee instead of letting the server reject it', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.rfq-form');
    await form.get('select[aria-label="Requisition phát hành RFQ"]').setValue('requisition-1');
    const inputs = form.findAll('input');
    await inputs[0].setValue('RFQ-2026-001');
    await inputs[2].setValue('2026-08-15T09:00');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create-rfq')).toBeUndefined();
    expect(wrapper.text()).toContain('Phải mời ít nhất một nhà cung cấp đủ điều kiện');
  });

  it('disables issuing when no supplier in the register is eligible at all', () => {
    const wrapper = mountPanel({ suppliers: [supplier({ validTo: '2020-01-01' })] });
    expect(wrapper.get('.invitee-picker__empty').text())
      .toContain('Không có nhà cung cấp nào đủ điều kiện');
    const issueButton = wrapper.findAll('button').find((item) => item.text() === 'Phát hành RFQ')!;
    expect(issueButton.attributes('disabled')).toBeDefined();
  });

  it('emits the requisition command with the optional fields omitted when blank', async () => {
    const wrapper = mountPanel();
    const form = wrapper.findAll('form.procurement-form')[0];
    const inputs = form.findAll('input');
    await inputs[0].setValue('PR-2026-002');
    await inputs[1].setValue('Mua inverter trung tâm');
    await inputs[2].setValue('2026-10-15');
    await inputs[3].setValue('package-uuid');
    await inputs[4].setValue('cost-code-uuid');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create-requisition')?.[0]).toEqual([{
      number: 'PR-2026-002', title: 'Mua inverter trung tâm', packageId: 'package-uuid',
      costCodeId: 'cost-code-uuid', needByDate: '2026-10-15'
    }]);
  });

  it('hides every command form without its permission but keeps the registers', () => {
    const wrapper = mountPanel({
      permissions: { createRequisition: false, issueRfq: false }
    });
    expect(wrapper.findAll('form.procurement-form')).toHaveLength(0);
    expect(wrapper.text()).toContain('PR-2026-001');
  });
});
