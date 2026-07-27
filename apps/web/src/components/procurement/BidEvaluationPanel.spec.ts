import { mount } from '@vue/test-utils';
import BidEvaluationPanel from './BidEvaluationPanel.vue';
import type {
  EvaluationView, RfqStatus, RfqView, SealedBidView
} from '@/types/procurement.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function rfq(status: RfqStatus, overrides: Partial<RfqView> = {}): RfqView {
  return {
    id: 'rfq-1', requisitionId: 'requisition-1', projectId: 'project-1', number: 'RFQ-2026-001',
    revision: 1, dueDate: '2026-08-15T09:00:00.000Z', invitedSupplierIds: ['supplier-1'],
    status, awardedBidId: null, awardSubmittedBy: null, awardSubmittedAt: null, versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

/** Exactly the payload the API emits before the RFQ closes: the commercial keys are ABSENT. */
function sealedBid(overrides: Partial<SealedBidView> = {}): SealedBidView {
  return {
    id: 'bid-1', rfqId: 'rfq-1', supplierProfileId: 'supplier-1', revision: 1,
    sealedStatus: 'SEALED', submittedAt: '2026-07-20T10:00:00.000Z',
    createdAt: '2026-07-20T10:00:00.000Z', ...overrides
  };
}

function evaluation(overrides: Partial<EvaluationView> = {}): EvaluationView {
  return {
    id: 'evaluation-1', bidId: 'bid-1', evaluationType: 'TECHNICAL', version: 1,
    evaluatorId: 'user-1', normalizedTotal: null, currency: null, normalizationBasis: null,
    overrideReason: null, notes: null, createdBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

/** Strip only the U+202F display grouping separator; every digit must survive. */
function flat(text: string): string {
  return text.replace(new RegExp(String.fromCharCode(0x202F), 'g'), '');
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(BidEvaluationPanel, {
    props: {
      rfqs: [rfq('ISSUED')], bids: [sealedBid()], evaluations: [], busy: false,
      currentUserId: 'user-1', permissions: { evaluate: true, submitAward: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('BidEvaluationPanel — sealed bids, API-080 / API-081', () => {
  it('leaks no price before the RFQ closes and never fakes one with a dash or a zero', () => {
    const wrapper = mountPanel({
      bids: [sealedBid({ id: 'bid-1' }), sealedBid({ id: 'bid-2', supplierProfileId: 'supplier-2' })]
    });
    const priceCells = wrapper.findAll('.bid-table tbody .bid-price');
    expect(priceCells).toHaveLength(2);
    for (const cell of priceCells) {
      expect(cell.text()).toBe('Niêm phong');
      // No digit, no dash, no undefined — nothing that could read as a disclosed amount.
      expect(cell.text()).not.toMatch(/\d/);
      expect(cell.text()).not.toContain('—');
      expect(cell.text()).not.toContain('undefined');
      expect(cell.find('.money').exists()).toBe(false);
    }
    expect(wrapper.get('.evaluation-panel__sealed-count').text()).toContain('2');
  });

  it('discloses the price only once the payload actually carries it', () => {
    const wrapper = mountPanel({
      rfqs: [rfq('CLOSED')],
      bids: [sealedBid({
        sealedStatus: 'OPENED', total: '9007199254740993.0001', currency: 'VND'
      })]
    });
    const cell = wrapper.get('.bid-table tbody .bid-price');
    expect(flat(cell.text())).toContain('9007199254740993.0001 VND');
    expect(cell.text()).not.toContain('Niêm phong');
  });

  it('treats a disclosed zero as a real price rather than as sealed', () => {
    const wrapper = mountPanel({
      rfqs: [rfq('CLOSED')],
      bids: [sealedBid({ sealedStatus: 'OPENED', total: '0', currency: 'VND' })]
    });
    const cell = wrapper.get('.bid-table tbody .bid-price');
    expect(cell.text()).toContain('0 VND');
    expect(cell.text()).not.toContain('Niêm phong');
  });

  it('offers no sealed bid as an evaluation target', () => {
    const wrapper = mountPanel();
    const select = wrapper.get('select[aria-label="Hồ sơ thầu cần đánh giá"]');
    expect(select.findAll('option')).toHaveLength(1);
    expect(select.text()).toContain('Chọn hồ sơ đã mở niêm phong');
    expect(wrapper.text()).toContain('Không có hồ sơ nào đã mở niêm phong để chấm');
  });

  it('emits the evaluation with the money kept as text', async () => {
    const wrapper = mountPanel({
      rfqs: [rfq('COMMERCIAL_EVALUATION')],
      bids: [sealedBid({ sealedStatus: 'OPENED', total: '1000.25', currency: 'VND' })]
    });
    const form = wrapper.get('form.evaluation-form');
    await form.get('select[aria-label="Hồ sơ thầu cần đánh giá"]').setValue('bid-1');
    await form.get('select[aria-label="Trục đánh giá"]').setValue('COMMERCIAL');
    const inputs = form.findAll('input');
    await inputs[0].setValue('980.5000');
    await inputs[1].setValue('VND');
    await form.findAll('textarea')[0].setValue('Loại trừ chi phí vận chuyển đã tính riêng');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create-evaluation')?.[0]).toEqual(['bid-1', {
      evaluationType: 'COMMERCIAL', normalizedTotal: '980.5000', currency: 'VND',
      overrideReason: 'Loại trừ chi phí vận chuyển đã tính riêng'
    }]);
  });

  it('disables the award submission for whoever already evaluated a bid of that RFQ', async () => {
    const wrapper = mountPanel({
      rfqs: [rfq('COMMERCIAL_EVALUATION')],
      bids: [sealedBid({ sealedStatus: 'OPENED', total: '1000', currency: 'VND' })],
      evaluations: [evaluation({ evaluatorId: 'user-1' })],
      currentUserId: 'user-1'
    });
    const form = wrapper.get('form.award-form');
    await form.get('select[aria-label="RFQ trình kết quả"]').setValue('rfq-1');
    expect(form.text()).toContain('bạn đã chấm hồ sơ của RFQ này nên không được tự trình kết quả');
    const submitButton = form.findAll('button').find((item) => item.text() === 'Trình kết quả')!;
    expect(submitButton.attributes('disabled')).toBeDefined();
  });

  it('lets an independent submitter send the award command', async () => {
    const wrapper = mountPanel({
      rfqs: [rfq('COMMERCIAL_EVALUATION')],
      bids: [sealedBid({ sealedStatus: 'OPENED', total: '1000', currency: 'VND' })],
      evaluations: [evaluation({ evaluatorId: 'user-2' })],
      currentUserId: 'user-1'
    });
    const form = wrapper.get('form.award-form');
    await form.get('select[aria-label="RFQ trình kết quả"]').setValue('rfq-1');
    await form.get('select[aria-label="Hồ sơ trúng thầu"]').setValue('bid-1');
    await form.get('textarea').setValue('Đạt kỹ thuật và giá chuẩn hóa thấp nhất');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('submit-award')?.[0]).toEqual(['rfq-1', {
      awardedBidId: 'bid-1', reason: 'Đạt kỹ thuật và giá chuẩn hóa thấp nhất'
    }]);
  });

  it('hides both command forms without their permissions but keeps the sealed register', () => {
    const wrapper = mountPanel({ permissions: { evaluate: false, submitAward: false } });
    expect(wrapper.findAll('form')).toHaveLength(0);
    expect(wrapper.get('.bid-table tbody .bid-price').text()).toBe('Niêm phong');
  });
});
