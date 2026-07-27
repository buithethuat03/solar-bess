import { mount } from '@vue/test-utils';
import SupplierRegisterTable from './SupplierRegisterTable.vue';
import type { SupplierView } from '@/types/procurement.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function supplier(overrides: Partial<SupplierView> = {}): SupplierView {
  return {
    id: 'supplier-1', companyId: 'CTY-A', legalEntityId: 'legal-1', category: 'PV_MODULE',
    qualificationStatus: 'QUALIFIED', validFrom: '2026-01-01', validTo: '2026-12-31',
    versionNo: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function mountTable(overrides: Record<string, unknown> = {}) {
  return mount(SupplierRegisterTable, {
    props: {
      suppliers: [supplier()], nextCursor: null, loadingMore: false, asOf: '2026-07-26',
      ...overrides
    },
    global: { stubs: { ElButton: buttonStub } }
  });
}

describe('SupplierRegisterTable — API-076', () => {
  it('marks a lapsed qualification distinctly even while its status still reads QUALIFIED', () => {
    const wrapper = mountTable({
      suppliers: [
        supplier({ id: 'live', validTo: '2026-12-31' }),
        supplier({ id: 'lapsed', companyId: 'CTY-B', validTo: '2026-07-25' })
      ]
    });
    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].attributes('data-expired')).toBe('false');
    expect(rows[1].attributes('data-expired')).toBe('true');
    expect(rows[1].text()).toContain('Đã hết hiệu lực');
    // The stored status is unchanged; the window is what disqualifies it.
    expect(rows[1].text()).toContain('Đạt sơ tuyển');
    expect(rows[1].text()).toContain('Không được mời');
  });

  it('marks a non-qualified profile as not invitable without calling it expired', () => {
    const wrapper = mountTable({
      suppliers: [supplier({ qualificationStatus: 'PENDING', validTo: null })]
    });
    const row = wrapper.get('tbody tr');
    expect(row.attributes('data-expired')).toBe('false');
    expect(row.attributes('data-invitable')).toBe('false');
    expect(row.text()).not.toContain('Đã hết hiệu lực');
  });

  it('counts only the invitable profiles in the header', () => {
    const wrapper = mountTable({
      suppliers: [
        supplier({ id: 'a' }),
        supplier({ id: 'b', validTo: '2020-01-01' }),
        supplier({ id: 'c', qualificationStatus: 'SUSPENDED' })
      ]
    });
    expect(wrapper.get('.supplier-register__count').text()).toContain('1');
    expect(wrapper.get('.supplier-register__count').text()).toContain('3');
  });

  it('offers the next page only when the server handed back a cursor', async () => {
    const withCursor = mountTable({ nextCursor: 'opaque' });
    await withCursor.get('button').trigger('click');
    expect(withCursor.emitted('more')).toHaveLength(1);
    expect(mountTable().findAll('button')).toHaveLength(0);
  });
});
