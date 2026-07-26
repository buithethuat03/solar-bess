import { mount } from '@vue/test-utils';
import ObligationPanel from './ObligationPanel.vue';
import type { ContractPartyView, ObligationRegisterRow, ObligationStatus } from '@/types/contract.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function party(id: string, name: string): ContractPartyView {
  return {
    id, contractId: 'contract-1', projectId: 'project-1', companyId: 'company-1',
    legalEntityId: `legal-${id}`, partyRole: 'OWNER', legalNameSnapshot: name,
    countrySnapshot: 'VN', registrationNoSnapshot: '0100000000', taxIdSnapshot: null,
    representativeName: null, representativeTitle: null, authorityReference: null,
    snapshotAt: '2026-07-26T10:00:00.000Z', snapshotHash: 'hash', createdBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z'
  };
}

function obligation(overrides: Partial<ObligationRegisterRow> = {}): ObligationRegisterRow {
  return {
    id: 'obligation-1', contractId: 'contract-1', projectId: 'project-1', appendixId: null,
    clauseRef: '12.3', title: 'Nộp bảo lãnh thực hiện hợp đồng', obligorPartyId: 'party-epc',
    beneficiaryPartyId: 'party-owner', ownerUserId: 'owner-user', triggerType: 'MILESTONE',
    triggerReference: null, dueDate: '2026-08-15', status: 'OPEN', storedStatus: 'OPEN',
    evidenceRefs: [], consequence: null, decisionType: null, decisionBy: null, decisionAt: null,
    decisionReason: null, decisionEvidenceRefs: null, versionNo: 2, createdBy: 'creator-user',
    updatedBy: 'creator-user', createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(ObligationPanel, {
    props: {
      obligations: [obligation()],
      parties: [party('party-epc', 'Công ty EPC A'), party('party-owner', 'Chủ đầu tư B')],
      appendices: [], nextCursor: null, busy: false, currentUserId: 'decider-user',
      permissions: { create: true, fulfill: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('ObligationPanel — API-059…061', () => {
  it.each([
    ['DUE', 'Đến hạn'],
    ['OVERDUE', 'Quá hạn']
  ] as Array<[ObligationStatus, string]>)(
    'renders the server-derived %s projection as its own chip and row marker',
    (status, label) => {
      const wrapper = mountPanel({ obligations: [obligation({ status, storedStatus: 'OPEN' })] });
      const chip = wrapper.get('tbody .status-pill');
      expect(chip.text()).toBe(label);
      expect(chip.attributes('data-status')).toBe(status);
      // The row repeats the signal so DUE (warning) and OVERDUE (danger) survive a greyscale print.
      expect(wrapper.get('tbody tr').attributes('data-status')).toBe(status);
    }
  );

  it('still allows a decision on an OVERDUE projection because the stored row is OPEN', () => {
    const wrapper = mountPanel({ obligations: [obligation({ status: 'OVERDUE' })] });
    expect(wrapper.findAll('tbody button').map((item) => item.text())).toContain('Quyết định');
  });

  it('offers no decision without the fulfill permission or on a decided row', () => {
    const denied = mountPanel({ permissions: { create: false, fulfill: false } });
    expect(denied.findAll('button').map((item) => item.text())).not.toContain('Quyết định');
    expect(denied.findAll('button').map((item) => item.text())).not.toContain('Thêm nghĩa vụ');

    const decided = mountPanel({
      obligations: [obligation({
        status: 'FULFILLED', storedStatus: 'FULFILLED', decisionType: 'FULFILLED',
        decisionReason: 'Đã nộp bảo lãnh'
      })]
    });
    expect(decided.findAll('tbody button')).toHaveLength(0);
    expect(decided.text()).toContain('Xác nhận hoàn thành');
  });

  it('pre-warns the SoD rule instead of showing a button guaranteed to fail', () => {
    const asOwner = mountPanel({ currentUserId: 'owner-user' });
    expect(asOwner.text()).toContain('SoD: không tự quyết định');
    expect(asOwner.findAll('tbody button').map((item) => item.text())).not.toContain('Quyết định');

    const asCreator = mountPanel({ currentUserId: 'creator-user' });
    expect(asCreator.text()).toContain('SoD: không tự quyết định');
  });

  it('refuses to emit a decision without at least one evidence reference', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('tbody button').find((item) => item.text() === 'Quyết định')!.trigger('click');
    const form = wrapper.get('form.obligation-decision');
    await form.findAll('textarea')[0].setValue('Bảo lãnh đã nộp đủ giá trị');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('fulfill')).toBeUndefined();
    expect(wrapper.text()).toContain('Cần ít nhất một evidence');
  });

  it('emits fulfill with the displayed version, reason and one evidence per line', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('tbody button').find((item) => item.text() === 'Quyết định')!.trigger('click');
    const form = wrapper.get('form.obligation-decision');
    await form.get('select[aria-label="Loại quyết định"]').setValue('WAIVED');
    await form.findAll('textarea')[0].setValue('Miễn trừ theo phụ lục 2');
    await form.findAll('textarea')[1].setValue('DOCUMENT:uuid-1\n\nDOCUMENT:uuid-2\n');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('fulfill')?.[0]).toEqual(['obligation-1', {
      expectedVersion: 2, decisionType: 'WAIVED', reason: 'Miễn trừ theo phụ lục 2',
      evidenceRefs: ['DOCUMENT:uuid-1', 'DOCUMENT:uuid-2']
    }]);
  });

  it('refuses to create an obligation whose obligor and beneficiary are the same party', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button').find((item) => item.text() === 'Thêm nghĩa vụ')!.trigger('click');
    const form = wrapper.get('form.contract-inline-form');
    await form.findAll('input')[0].setValue('12.3');
    await form.findAll('input')[1].setValue('Bảo lãnh thực hiện');
    await form.get('select[aria-label="Bên chịu nghĩa vụ"]').setValue('party-epc');
    await form.get('select[aria-label="Bên thụ hưởng"]').setValue('party-epc');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('phải khác nhau');

    await form.get('select[aria-label="Bên thụ hưởng"]').setValue('party-owner');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')?.[0]).toEqual([{
      clauseRef: '12.3', title: 'Bảo lãnh thực hiện', obligorPartyId: 'party-epc',
      beneficiaryPartyId: 'party-owner', triggerType: 'MILESTONE'
    }]);
  });

  it('offers cursor pagination only when the server returned a cursor', async () => {
    expect(mountPanel().findAll('button').some((item) => item.text() === 'Tải thêm nghĩa vụ')).toBe(false);
    const paged = mountPanel({ nextCursor: 'opaque' });
    await paged.findAll('button').find((item) => item.text() === 'Tải thêm nghĩa vụ')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });
});
