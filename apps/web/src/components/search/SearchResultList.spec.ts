import { mount } from '@vue/test-utils';
import SearchResultList from './SearchResultList.vue';
import type { SearchResultRow, SearchResultType } from '@/types/search.types';

function row(overrides: Partial<SearchResultRow> = {}): SearchResultRow {
  return {
    type: 'CONTRACT', id: 'contract-1', code: 'EPC-2026-001',
    title: 'Gói EPC nhà máy 50MWp', projectId: 'project-1', ...overrides
  };
}

const ALL_TYPES: SearchResultType[] =
  ['PROJECT', 'DOCUMENT', 'RISK', 'ISSUE', 'CHANGE_REQUEST', 'CONTRACT'];

function mountList(overrides: Record<string, unknown> = {}) {
  return mount(SearchResultList, {
    props: {
      rows: [row()], selectedTypes: [], readableTypes: [...ALL_TYPES],
      searched: true, loading: false, ...overrides
    }
  });
}

describe('SearchResultList — API-130', () => {
  it('renders one toggleable chip per result type with its own count', () => {
    const wrapper = mountList({
      rows: [row(), row({ type: 'RISK', id: 'risk-1', code: 'R-014', title: 'Chậm cấp module' })]
    });
    const chips = wrapper.findAll('.search-chip');
    expect(chips).toHaveLength(6);
    expect(chips.map((chip) => chip.attributes('data-type'))).toEqual(ALL_TYPES);

    const contractChip = chips.find((chip) => chip.attributes('data-type') === 'CONTRACT')!;
    expect(contractChip.text()).toContain('Hợp đồng');
    expect(contractChip.get('span').text()).toBe('1');
  });

  it('marks a chip pressed only while its type is selected and emits the toggle', async () => {
    const wrapper = mountList({ selectedTypes: ['RISK'] as SearchResultType[] });
    const risk = wrapper.findAll('.search-chip')
      .find((chip) => chip.attributes('data-type') === 'RISK')!;
    const contract = wrapper.findAll('.search-chip')
      .find((chip) => chip.attributes('data-type') === 'CONTRACT')!;
    expect(risk.attributes('aria-pressed')).toBe('true');
    expect(contract.attributes('aria-pressed')).toBe('false');

    await contract.trigger('click');
    expect(wrapper.emitted('toggleType')?.[0]).toEqual(['CONTRACT']);
  });

  /**
   * Search omits a register the caller cannot read instead of answering 403, so an empty branch is
   * indistinguishable from an absent one on the wire. The list therefore names the difference
   * rather than letting "0" be read as "nothing exists".
   */
  it('names the registers the caller cannot read instead of implying they are empty', () => {
    const wrapper = mountList({
      readableTypes: ['PROJECT', 'CONTRACT'] as SearchResultType[]
    });
    const note = wrapper.get('[data-testid="unreadable-types"]').text();
    expect(note).toContain('Tài liệu');
    expect(note).toContain('Rủi ro');
    expect(note).toContain('không phải kết luận rằng dữ liệu không tồn tại');
    expect(note).not.toContain('Hợp đồng');
  });

  it('says nothing about permissions when every requested type is readable', () => {
    expect(mountList().find('[data-testid="unreadable-types"]').exists()).toBe(false);
  });

  it('limits the permission note to the types actually requested', () => {
    const wrapper = mountList({
      selectedTypes: ['CONTRACT'] as SearchResultType[],
      readableTypes: ['CONTRACT'] as SearchResultType[]
    });
    expect(wrapper.find('[data-testid="unreadable-types"]').exists()).toBe(false);
  });

  it('shows only register identity columns, never content', () => {
    const wrapper = mountList();
    const headers = wrapper.findAll('thead th').map((item) => item.text());
    expect(headers).toEqual(['Loại', 'Mã', 'Tiêu đề', 'Dự án']);
  });

  it('distinguishes "not searched yet" from "no results"', () => {
    expect(mountList({ searched: false, rows: [] }).text())
      .toContain('Nhập từ khóa để tìm kiếm');
    expect(mountList({ searched: true, rows: [] }).text())
      .toContain('Không có kết quả trong scope được phép');
  });
});
