import { mount } from '@vue/test-utils';
import ContractRegisterTable from './ContractRegisterTable.vue';
import type { ContractView } from '@/types/contract.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function row(overrides: Partial<ContractView> = {}): ContractView {
  return {
    id: 'contract-1', projectId: 'project-1', contractNo: 'EPC-2026-001',
    title: 'Gói EPC nhà máy 50MWp', type: 'EPC', status: 'DRAFT',
    effectiveFrom: '2026-08-01', effectiveTo: null,
    value: '9007199254740993.0001', currency: 'VND', rootDocumentId: null, legalHold: false,
    signedAt: null, signedBy: null, versionNo: 1, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function mountTable(overrides: Record<string, unknown> = {}) {
  return mount(ContractRegisterTable, {
    props: {
      rows: [row()], nextCursor: null, loadingMore: false, selectedId: null,
      partyCounts: {}, ...overrides
    },
    global: { stubs: { ElButton: buttonStub } }
  });
}

describe('ContractRegisterTable — API-053', () => {
  it('renders number, title, type, status chip and the money exactly as text', () => {
    const wrapper = mountTable();
    const text = wrapper.text();
    for (const value of ['EPC-2026-001', 'Gói EPC nhà máy 50MWp', 'Tổng thầu EPC', 'Nháp']) {
      expect(text).toContain(value);
    }
    const chip = wrapper.get('.status-pill');
    expect(chip.attributes('data-status')).toBe('DRAFT');
    // Digit grouping only — every digit of the 4-dp, >2^53 value survives untouched.
    expect(wrapper.get('.money').text().replace(/\u202F/g, ''))
      .toBe('9007199254740993.0001 VND');
  });

  it('speaks the full status vocabulary without offering any transition action', () => {
    const wrapper = mountTable({
      rows: [row(), row({ id: 'contract-2', contractNo: 'PPA-01', type: 'PPA', status: 'SIGNED' })]
    });
    expect(wrapper.text()).toContain('Đã ký');
    // V1 honesty: no sign/activate operation exists, so the only row action is "Mở".
    const labels = wrapper.findAll('tbody button').map((button) => button.text());
    expect(labels).toEqual(['Mở', 'Mở']);
  });

  it('shows an unknown party count as a dash, never as zero', () => {
    const unknown = mountTable();
    expect(unknown.get('tbody tr').text()).toContain('—');
    const known = mountTable({ partyCounts: { 'contract-1': 3 } });
    expect(known.get('tbody tr').text()).toContain('3');
  });

  it('flags a legal hold on the row', () => {
    const wrapper = mountTable({ rows: [row({ legalHold: true })] });
    expect(wrapper.get('.legal-hold-note').text()).toBe('Legal hold');
  });

  it('emits open with the contract id', async () => {
    const wrapper = mountTable();
    await wrapper.get('tbody button').trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['contract-1']);
  });

  it('offers cursor pagination only when the server returned a cursor', async () => {
    expect(mountTable().findAll('button').some((item) => item.text() === 'Tải thêm hợp đồng')).toBe(false);
    const paged = mountTable({ nextCursor: 'opaque' });
    await paged.findAll('button').find((item) => item.text() === 'Tải thêm hợp đồng')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });

  it('distinguishes an empty authorized register from hidden contracts', () => {
    const wrapper = mountTable({ rows: [] });
    expect(wrapper.text()).toContain('Không có hợp đồng phù hợp');
    expect(wrapper.text()).toContain('không suy ra thành số đếm bằng không');
  });
});
