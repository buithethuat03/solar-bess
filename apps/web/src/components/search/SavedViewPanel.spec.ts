import { mount } from '@vue/test-utils';
import SavedViewPanel from './SavedViewPanel.vue';
import type { SavedViewView } from '@/types/search.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function savedView(overrides: Partial<SavedViewView> = {}): SavedViewView {
  return {
    id: 'view-1', name: 'Rủi ro cao của tôi', targetType: 'RISK',
    filterSnapshot: { severity: 'HIGH' }, columnSnapshot: ['code', 'event'], sortSnapshot: [],
    shareScope: 'PRIVATE', versionNo: 1, createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(SavedViewPanel, {
    props: {
      views: [savedView()], nextCursor: null, busy: false, canCreate: true,
      currentFilterSnapshot: { query: 'EPC', types: ['CONTRACT'] }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('SavedViewPanel — API-131/132', () => {
  /**
   * V1 knows exactly one share scope. Sharing a view would republish one person's filters to
   * another without re-evaluating that person's permissions, so the vocabulary makes it
   * impossible — and the panel must not imply otherwise with a disabled toggle.
   */
  it('offers no share control at all and explains why', () => {
    const wrapper = mountPanel();
    const note = wrapper.get('[data-testid="saved-view-private-note"]').text();
    expect(note).toContain('Chỉ riêng tư (PRIVATE)');
    expect(note).toContain('SHARE_SCOPE_NOT_SUPPORTED');

    for (const control of [...wrapper.findAll('select'), ...wrapper.findAll('input')]) {
      const label = `${control.attributes('aria-label') ?? ''}${control.attributes('name') ?? ''}`;
      expect(label.toLowerCase()).not.toContain('share');
      expect(label.toLowerCase()).not.toContain('chia sẻ');
    }
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it('never puts a share scope on the emitted create payload', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Lưu view hiện tại')!.trigger('click');
    const form = wrapper.get('form.search-inline-form');
    await form.get('input').setValue('Hợp đồng đang hiệu lực');
    await form.get('select[aria-label="Register đích của saved view"]').setValue('CONTRACT');
    await form.trigger('submit.prevent');

    const emitted = wrapper.emitted('create')?.[0]?.[0] as Record<string, unknown>;
    expect(emitted).toEqual({
      name: 'Hợp đồng đang hiệu lực', targetType: 'CONTRACT',
      filterSnapshot: { query: 'EPC', types: ['CONTRACT'] }
    });
    expect(emitted).not.toHaveProperty('shareScope');
  });

  it('refuses to emit a view without a name', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button')
      .find((item) => item.text() === 'Lưu view hiện tại')!.trigger('click');
    await wrapper.get('form.search-inline-form').trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('phải có tên');
  });

  it('emits the register filter chosen for the list', async () => {
    const wrapper = mountPanel();
    await wrapper.get('select[aria-label="Lọc saved view theo register"]').setValue('DOCUMENT');
    expect(wrapper.emitted('filter')?.[0]).toEqual(['DOCUMENT']);
  });

  it('states that another person\'s views are not listable', () => {
    expect(mountPanel({ views: [] }).text())
      .toContain('Saved view của người khác không hiển thị');
  });

  it('offers no create control without the permission', () => {
    const wrapper = mountPanel({ canCreate: false });
    expect(wrapper.findAll('button').map((item) => item.text()))
      .not.toContain('Lưu view hiện tại');
  });

  it('gives every select an explicit aria-label', () => {
    const selects = mountPanel().findAll('select');
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) expect(select.attributes('aria-label')).toBeTruthy();
  });
});
