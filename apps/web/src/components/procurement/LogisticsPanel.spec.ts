import { mount } from '@vue/test-utils';
import LogisticsPanel from './LogisticsPanel.vue';
import type {
  GoodsReceiptWithLedgerView, PurchaseOrderWithLinesView, ShipmentMilestoneType,
  ShipmentMilestoneView, ShipmentView
} from '@/types/procurement.types';
import type { Site } from '@/types/project.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function order(): PurchaseOrderWithLinesView {
  return {
    id: 'po-1', projectId: 'project-1', supplierProfileId: 'supplier-1', awardedRfqId: null,
    poNo: 'PO-2026-001', revision: 1, title: 'Cung cấp module PV', status: 'ISSUED',
    totalValue: '1000', currency: 'VND', issuedAt: '2026-07-26T10:00:00.000Z',
    approvedBy: 'approver-1', versionNo: 1, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z',
    commitmentId: 'commitment-1',
    lines: [{
      id: 'line-1', purchaseOrderId: 'po-1', lineNo: 1, description: 'Module 580Wp',
      quantity: '10', uom: 'EA', unitPrice: '100', currency: 'VND',
      requisitionId: null, bomLineId: null, createdAt: '2026-07-26T10:00:00.000Z'
    }]
  };
}

function shipment(overrides: Partial<ShipmentView> = {}): ShipmentView {
  return {
    id: 'shipment-1', purchaseOrderId: 'po-1', committedDate: '2026-09-01', etd: '2026-09-02',
    eta: '2026-09-20', actualDeliveryDate: null, carrier: 'ONE', trackingNo: 'TRK-1',
    status: 'IN_TRANSIT', versionNo: 2, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function milestone(
  milestoneType: ShipmentMilestoneType, eventTime: string, id = milestoneType
): ShipmentMilestoneView {
  return {
    id, shipmentId: 'shipment-1', milestoneType, eventTime, source: 'CARRIER', notes: null,
    createdBy: 'user-1', createdAt: eventTime
  };
}

function receipt(quantity: string, overrides: Partial<GoodsReceiptWithLedgerView> = {}): GoodsReceiptWithLedgerView {
  return {
    id: `receipt-${quantity}`, projectId: 'project-1', purchaseOrderId: 'po-1',
    purchaseOrderLineId: 'line-1', shipmentId: null, siteId: 'site-1',
    receiptNo: `GRN-${quantity}`, quantity, condition: 'GOOD', status: 'ACCEPTED', notes: null,
    versionNo: 1, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z',
    inventoryTransactions: [], serials: [], ...overrides
  };
}

const sites: Site[] = [{
  id: 'site-1', projectId: 'project-1', code: 'S1', name: 'Site chính', location: null,
  timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: 'ACTIVE'
}];

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(LogisticsPanel, {
    props: {
      purchaseOrders: [order()], shipments: [shipment()],
      milestones: [
        milestone('BOOKED', '2026-09-01T02:00:00.000Z'),
        milestone('DEPARTED', '2026-09-03T02:00:00.000Z')
      ],
      receipts: [], sites, busy: false,
      permissions: { createShipment: true, updateMilestone: true, createReceipt: true },
      ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('LogisticsPanel — API-083…085', () => {
  it('renders the ranked milestone timeline in order and marks only the reached stages', () => {
    const wrapper = mountPanel();
    const steps = wrapper.findAll('.milestone-timeline li');
    expect(steps.map((step) => step.get('strong').text())).toEqual([
      'Đã đặt chỗ', 'Đã rời cảng đi', 'Đã đến cảng đích', 'Đã thông quan', 'Đã giao hàng'
    ]);
    expect(steps.map((step) => step.attributes('data-reached')))
      .toEqual(['true', 'true', 'false', 'false', 'false']);
    // Stages not yet reported stay visible and say so, rather than being silently dropped.
    expect(steps[2].text()).toContain('chưa ghi nhận');
  });

  it('keeps an EXCEPTION off the ranked axis and shows it as its own report', () => {
    const wrapper = mountPanel({
      milestones: [
        milestone('BOOKED', '2026-09-01T02:00:00.000Z'),
        {
          ...milestone('EXCEPTION', '2026-09-04T02:00:00.000Z'),
          notes: 'Tàu bị giữ lại do thời tiết'
        }
      ]
    });
    expect(wrapper.findAll('.milestone-timeline li')).toHaveLength(5);
    const exceptions = wrapper.get('.milestone-exceptions');
    expect(exceptions.text()).toContain('Sự cố vận chuyển');
    expect(exceptions.text()).toContain('Tàu bị giữ lại do thời tiết');
  });

  it('shows the remaining quantity per PO line before the receipt is submitted', async () => {
    const wrapper = mountPanel({ receipts: [receipt('2.5'), receipt('3.25')] });
    const form = wrapper.get('form.receipt-form');
    await form.get('select[aria-label="Purchase order nhận hàng"]').setValue('po-1');
    // The option itself carries the limit, so the number is visible before anything is chosen.
    expect(form.get('select[aria-label="Dòng PO nhận hàng"]').text()).toContain('còn lại 4.25 EA');
    await form.get('select[aria-label="Dòng PO nhận hàng"]').setValue('line-1');
    const note = wrapper.get('.receipt-remaining');
    expect(note.text()).toContain('4.25 EA');
    expect(note.text()).toContain('OVER_RECEIPT');
  });

  it('counts quarantined stock against the ordered quantity but never a rejected receipt', async () => {
    const wrapper = mountPanel({
      receipts: [
        receipt('4', { status: 'QUARANTINED', condition: 'DAMAGED' }),
        receipt('3', { status: 'REJECTED' })
      ]
    });
    const form = wrapper.get('form.receipt-form');
    await form.get('select[aria-label="Purchase order nhận hàng"]').setValue('po-1');
    await form.get('select[aria-label="Dòng PO nhận hàng"]').setValue('line-1');
    expect(wrapper.get('.receipt-remaining').text()).toContain('6 EA');
  });

  it('emits the receipt with its captured serials and quantity as text', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.receipt-form');
    await form.get('select[aria-label="Purchase order nhận hàng"]').setValue('po-1');
    await form.get('select[aria-label="Dòng PO nhận hàng"]').setValue('line-1');
    await form.get('select[aria-label="Site nhận hàng"]').setValue('site-1');
    const inputs = form.findAll('input');
    await inputs[0].setValue('GRN-2026-001');
    await inputs[1].setValue('2.5000');
    await wrapper.findAll('button').find((item) => item.text() === 'Thêm serial')!.trigger('click');
    const serialInputs = wrapper.get('.serial-editor__row').findAll('input');
    await serialInputs[0].setValue('SN-0001');
    await serialInputs[1].setValue('model-uuid');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('create-receipt')?.[0]).toEqual(['po-1', {
      purchaseOrderLineId: 'line-1', siteId: 'site-1', receiptNo: 'GRN-2026-001',
      quantity: '2.5000', condition: 'GOOD',
      serials: [{ serialNo: 'SN-0001', equipmentModelId: 'model-uuid' }]
    }]);
  });

  it('emits the milestone command with the type, source and event instant', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form.milestone-form');
    await form.get('select[aria-label="Lô hàng ghi milestone"]').setValue('shipment-1');
    await form.get('select[aria-label="Loại milestone"]').setValue('ARRIVED');
    await form.get('select[aria-label="Nguồn milestone"]').setValue('CARRIER');
    await form.findAll('input')[0].setValue('2026-09-18T08:00');
    await form.trigger('submit.prevent');

    const emitted = wrapper.emitted('create-milestone')?.[0] as [string, Record<string, unknown>];
    expect(emitted[0]).toBe('shipment-1');
    expect(emitted[1].milestoneType).toBe('ARRIVED');
    expect(emitted[1].source).toBe('CARRIER');
    expect(String(emitted[1].eventTime)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('hides each command form without its own permission', () => {
    const wrapper = mountPanel({
      permissions: { createShipment: false, updateMilestone: false, createReceipt: false }
    });
    expect(wrapper.findAll('form')).toHaveLength(0);
    expect(wrapper.get('.shipment-card').text()).toContain('PO-2026-001');
  });
});
