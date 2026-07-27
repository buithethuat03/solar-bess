import { mount } from '@vue/test-utils';
import PurchaseOrderPanel from './PurchaseOrderPanel.vue';
import type { PurchaseOrderWithLinesView, SupplierView } from '@/types/procurement.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function supplier(): SupplierView {
  return {
    id: 'supplier-1', companyId: 'CTY-A', legalEntityId: 'legal-1', category: 'PV_MODULE',
    qualificationStatus: 'QUALIFIED', validFrom: '2026-01-01', validTo: '2026-12-31',
    versionNo: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function order(): PurchaseOrderWithLinesView {
  return {
    id: 'po-1', projectId: 'project-1', supplierProfileId: 'supplier-1', awardedRfqId: null,
    poNo: 'PO-2026-001', revision: 1, title: 'Cung cấp module PV', status: 'ISSUED',
    totalValue: '1000000.5', currency: 'VND', issuedAt: '2026-07-26T10:00:00.000Z',
    approvedBy: 'approver-1', versionNo: 1, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z',
    commitmentId: 'commitment-1',
    lines: [{
      id: 'line-1', purchaseOrderId: 'po-1', lineNo: 1, description: 'Module 580Wp',
      quantity: '2.5', uom: 'EA', unitPrice: '400000.2', currency: 'VND',
      requisitionId: null, bomLineId: null, createdAt: '2026-07-26T10:00:00.000Z'
    }]
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(PurchaseOrderPanel, {
    props: {
      purchaseOrders: [], suppliers: [supplier()], rfqs: [], busy: false,
      currentUserId: 'user-1', permissions: { issue: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

async function addLine(wrapper: ReturnType<typeof mountPanel>): Promise<void> {
  await wrapper.findAll('button').find((item) => item.text() === 'Thêm dòng')!.trigger('click');
}

async function fillLine(
  wrapper: ReturnType<typeof mountPanel>, index: number,
  values: { description: string; quantity: string; uom: string; unitPrice: string }
): Promise<void> {
  const inputs = wrapper.findAll('.po-line-editor__row')[index].findAll('input');
  await inputs[1].setValue(values.description);
  await inputs[2].setValue(values.quantity);
  await inputs[3].setValue(values.uom);
  await inputs[4].setValue(values.unitPrice);
}

describe('PurchaseOrderPanel — API-082', () => {
  it('shows the exact BigInt extension of each line and their exact sum', async () => {
    const wrapper = mountPanel();
    await addLine(wrapper);
    await addLine(wrapper);
    // The classic float trap: 0.1 * 0.3 must stay 0.03, not 0.030000000000000006.
    await fillLine(wrapper, 0, { description: 'A', quantity: '0.1', uom: 'EA', unitPrice: '0.3' });
    await fillLine(wrapper, 1, { description: 'B', quantity: '2.5', uom: 'EA', unitPrice: '400000.2' });

    const extensions = wrapper.findAll('.po-line-editor__extension');
    expect(extensions[0].text()).toBe('0.03');
    expect(extensions[1].text()).toBe('1000000.5');
    expect(wrapper.get('.po-line-editor__sum').text()).toContain('1000000.53');
  });

  it('withdraws the reference sum instead of guessing when a line is not valid decimal text', async () => {
    const wrapper = mountPanel();
    await addLine(wrapper);
    await fillLine(wrapper, 0, { description: 'A', quantity: 'abc', uom: 'EA', unitPrice: '1' });
    expect(wrapper.get('.po-line-editor__sum').text()).toContain('chưa đủ dữ liệu hợp lệ');
  });

  it('warns when the declared total does not equal the line sum the trigger will compute', async () => {
    const wrapper = mountPanel();
    await addLine(wrapper);
    await fillLine(wrapper, 0, { description: 'A', quantity: '2', uom: 'EA', unitPrice: '50' });
    const headerInputs = wrapper.get('form.po-form').findAll('input');
    await headerInputs[3].setValue('99');
    expect(wrapper.get('.po-line-editor__sum').text()).toContain('PO_LINE_SUM_MISMATCH');
    // Trailing zeros are formatting, not a mismatch.
    await headerInputs[3].setValue('100.0000');
    expect(wrapper.get('.po-line-editor__sum').text()).not.toContain('PO_LINE_SUM_MISMATCH');
  });

  it('emits the command with quantities and prices as the exact typed strings', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.po-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('PO-2026-001');
    await inputs[1].setValue('1');
    await inputs[2].setValue('Cung cấp module PV');
    await form.get('select[aria-label="Nhà cung cấp của PO"]').setValue('supplier-1');
    await inputs[3].setValue('1000000.5');
    await inputs[4].setValue('VND');
    await inputs[5].setValue('approver-uuid');
    await inputs[6].setValue('cost-code-uuid');
    await addLine(wrapper);
    await fillLine(wrapper, 0, { description: 'Module 580Wp', quantity: '2.5', uom: 'EA', unitPrice: '400000.2' });
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('create')?.[0]).toEqual([{
      poNo: 'PO-2026-001', revision: 1, title: 'Cung cấp module PV',
      supplierProfileId: 'supplier-1', totalValue: '1000000.5', currency: 'VND',
      approvedBy: 'approver-uuid', costCodeId: 'cost-code-uuid',
      lines: [{
        lineNo: 1, description: 'Module 580Wp', quantity: '2.5', uom: 'EA', unitPrice: '400000.2'
      }]
    }]);
  });

  it('blocks self-approval before the request instead of after the 422', async () => {
    const wrapper = mountPanel({ currentUserId: 'user-1' });
    const form = wrapper.get('form.po-form');
    const inputs = form.findAll('input');
    await inputs[5].setValue('user-1');
    expect(wrapper.get('.procurement-blocked').text())
      .toContain('người phê duyệt phải khác người phát hành PO');
    const issueButton = wrapper.findAll('button').find((item) => item.text() === 'Phát hành PO')!;
    expect(issueButton.attributes('disabled')).toBeDefined();
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
  });

  it('refuses a purchase order with no line rather than letting the trigger decide', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.po-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('PO-2026-003');
    await inputs[1].setValue('1');
    await inputs[2].setValue('Không có dòng nào');
    await form.get('select[aria-label="Nhà cung cấp của PO"]').setValue('supplier-1');
    await inputs[3].setValue('100');
    await inputs[4].setValue('VND');
    await inputs[5].setValue('approver-uuid');
    await inputs[6].setValue('cost-code-uuid');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('PO phải có ít nhất một dòng hàng');
  });

  it('hides the issue form without permission but still lists issued orders', () => {
    const wrapper = mountPanel({ purchaseOrders: [order()], permissions: { issue: false } });
    expect(wrapper.findAll('form')).toHaveLength(0);
    expect(wrapper.get('.po-table').text()).toContain('PO-2026-001');
  });
});
