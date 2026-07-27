import { mount } from '@vue/test-utils';
import CommissioningSystemTree from './CommissioningSystemTree.vue';
import type { CommissioningSystemView } from '@/types/commissioning.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function system(
  id: string, code: string, parentSystemId: string | null = null
): CommissioningSystemView {
  return {
    id, projectId: 'project-1', parentSystemId, code, name: `Hệ thống ${code}`,
    systemType: 'PV_ARRAY', boundary: {}, status: 'NOT_READY', versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z'
  };
}

function mountTree(overrides: Record<string, unknown> = {}) {
  return mount(CommissioningSystemTree, {
    props: {
      systems: [
        system('root', 'PV-01'),
        system('child', 'PV-01-A', 'root'),
        system('grandchild', 'PV-01-A-1', 'child')
      ],
      selectedId: null, nextCursor: null, loadingMore: false, busy: false,
      permissions: { create: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('CommissioningSystemTree — API-098 / API-099', () => {
  it('nests sub-systems under their parent with a real depth attribute', () => {
    const wrapper = mountTree();
    const items = wrapper.findAll('.system-tree__list li');
    expect(items.map((item) => item.attributes('data-depth'))).toEqual(['0', '1', '2']);
    expect(items[0].text()).toContain('PV-01');
    expect(items[2].text()).toContain('PV-01-A-1');
  });

  it('still shows a system whose parent fell outside the loaded page', () => {
    const wrapper = mountTree({ systems: [system('child', 'PV-02-A', 'missing-parent')] });
    const item = wrapper.get('.system-tree__list li');
    expect(item.attributes('data-depth')).toBe('0');
    expect(item.text()).toContain('cha ngoài trang này');
  });

  it('emits the selected system id', async () => {
    const wrapper = mountTree();
    await wrapper.findAll('.system-tree__node')[1].trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['child']);
  });

  it('validates the code and system type before emitting the create command', async () => {
    const wrapper = mountTree();
    await wrapper.findAll('button').find((item) => item.text() === 'Thêm system')!.trigger('click');
    const form = wrapper.get('form.commissioning-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('pv-lowercase');
    await inputs[1].setValue('Dãy PV khu B');
    await inputs[2].setValue('PV_ARRAY');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('Mã system phải viết hoa');

    await inputs[0].setValue('PV-02');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')?.[0]).toEqual([{
      code: 'PV-02', name: 'Dãy PV khu B', systemType: 'PV_ARRAY'
    }]);
  });

  it('hides the create form without permission but keeps the register readable', () => {
    const wrapper = mountTree({ permissions: { create: false } });
    expect(wrapper.findAll('form')).toHaveLength(0);
    expect(wrapper.text()).toContain('PV-01');
  });
});
