import { mount } from '@vue/test-utils';
import PunchListPanel from './PunchListPanel.vue';
import type { PunchCategory, PunchItemView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

function punch(overrides: Partial<PunchItemView> = {}): PunchItemView {
  return {
    id: 'punch-1', projectId: 'project-1', code: 'PL-001', title: 'Thiếu tiếp địa tủ inverter',
    description: null, category: 'B', codBlocking: false, waivable: true, status: 'OPEN',
    raisedBy: 'qaqc-1', ownerId: 'contractor-1', waivedBy: null, waivedReason: null,
    verifiedBy: null, verifiedAt: null, closureEvidenceRefs: [], versionNo: 1,
    createdBy: 'qaqc-1', updatedBy: 'qaqc-1', createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z', ...overrides
  };
}

const categoryA = punch({
  id: 'punch-a', code: 'PL-A01', category: 'A', codBlocking: true, waivable: false,
  title: 'Chưa có bảo vệ chạm đất phía DC'
});

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(PunchListPanel, {
    props: {
      items: [punch()], cycles: {}, busy: false, currentUserId: 'qaqc-1',
      canManage: true, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function labelled(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text);
}

describe('PunchListPanel — API-097 category A', () => {
  /** `ck_punch_category_a_blocking` / `ck_punch_category_a_not_waivable` are database rules. */
  it('marks a category A item as COD-blocking and non-waivable on its own row', () => {
    const wrapper = mountPanel({ items: [categoryA] });
    const row = wrapper.get('tbody tr');
    expect(row.attributes('data-category')).toBe('A');
    expect(wrapper.get('.punch-category-chip').attributes('data-category')).toBe('A');
    expect(row.text()).toContain('Chặn COD');
    expect(row.text()).toContain('Không được miễn trừ');
  });

  it('keeps a category A row distinct from every other category', () => {
    const wrapper = mountPanel({ items: [categoryA, punch(), punch({ id: 'punch-c', code: 'PL-C01', category: 'C' })] });
    expect(wrapper.findAll('.punch-category-chip').map((chip) => chip.attributes('data-category')))
      .toEqual(['A', 'B', 'C']);
    expect(wrapper.findAll('tbody tr').map((row) => row.attributes('data-category')))
      .toEqual(['A', 'B', 'C']);
  });

  it('offers no waive command for a category A item', () => {
    const wrapper = mountPanel({ items: [categoryA] });
    expect(labelled(wrapper, 'Miễn trừ')).toBeUndefined();
    expect(labelled(wrapper, 'Đề nghị đóng')).toBeDefined();
    expect(wrapper.text()).toContain('Không có thao tác miễn trừ');
  });

  it('offers waive for a waivable item', () => {
    expect(labelled(mountPanel(), 'Miễn trừ')).toBeDefined();
  });

  it('locks the two flags when category A is chosen instead of asking for them', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Tạo punch item')!.trigger('click');
    const form = wrapper.get('form');
    expect(form.findAll('input[type="checkbox"]')).toHaveLength(2);

    await form.get('select').setValue('A');
    expect(form.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect(wrapper.text()).toContain('luôn chặn COD');
    expect(wrapper.text()).toContain('không thể miễn trừ');
  });

  it('sends the category A item with the flags the database will enforce anyway', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Tạo punch item')!.trigger('click');
    const form = wrapper.get('form');
    await form.findAll('input')[0].setValue('PL-A01');
    await form.findAll('input')[1].setValue('Chưa có bảo vệ chạm đất phía DC');
    await form.get('select').setValue('A');
    await form.trigger('submit');

    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
      commandType: 'CREATE', code: 'PL-A01', category: 'A', codBlocking: true, waivable: false
    });
  });

  it.each(['B', 'C', 'D'] as PunchCategory[])(
    'lets category %s choose its own COD and waiver flags',
    async (category) => {
      const wrapper = mountPanel();
      await labelled(wrapper, 'Tạo punch item')!.trigger('click');
      const form = wrapper.get('form');
      await form.findAll('input')[0].setValue('PL-002');
      await form.findAll('input')[1].setValue('Thiếu nhãn cảnh báo');
      await form.get('select').setValue(category);
      await form.findAll('input[type="checkbox"]')[0].setValue(true);
      await form.trigger('submit');

      expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
        category, codBlocking: true, waivable: true
      });
    }
  );

  /** `ck_punch_verifier_independent`: the owner may not approve the closure of their own item. */
  it('warns the owner that they cannot decide their own closure', () => {
    const wrapper = mountPanel({
      items: [punch({ status: 'READY_FOR_VERIFICATION', ownerId: 'qaqc-1' })]
    });
    expect(wrapper.text()).toContain('SoD: người phụ trách không được tự xác nhận đóng.');
  });

  it('renders the closure cycles as a chain rather than one mutable decision', () => {
    const wrapper = mountPanel({
      items: [punch({ status: 'OPEN', versionNo: 3 })],
      cycles: {
        'punch-1': [
          {
            id: 'cycle-1', punchItemId: 'punch-1', sequenceNo: 1, requestComment: 'Đã khắc phục',
            requestEvidenceRefs: ['photo://a'], requestedBy: 'contractor-1',
            requestedAt: '2026-07-26T05:00:00.000Z', decision: 'RETURN',
            decisionComment: 'Chưa đạt', decidedBy: 'qaqc-1',
            decidedAt: '2026-07-26T06:00:00.000Z'
          },
          {
            id: 'cycle-2', punchItemId: 'punch-1', sequenceNo: 2, requestComment: 'Đã làm lại',
            requestEvidenceRefs: ['photo://b'], requestedBy: 'contractor-1',
            requestedAt: '2026-07-26T07:00:00.000Z', decision: null, decisionComment: null,
            decidedBy: null, decidedAt: null
          }
        ]
      }
    });
    const cycles = wrapper.findAll('.cycle-list li');
    expect(cycles).toHaveLength(2);
    expect(cycles.map((item) => item.attributes('data-decision'))).toEqual(['RETURN', 'PENDING']);
    expect(cycles[0].text()).toContain('Trả lại');
    expect(cycles[1].text()).toContain('Đang chờ quyết định');
  });

  it('validates the punch code before spending a round trip', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Tạo punch item')!.trigger('click');
    const form = wrapper.get('form');
    await form.findAll('input')[0].setValue('pl 001');
    await form.trigger('submit');

    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('Mã punch phải viết hoa');
  });

  it('labels every select for the accessible-name based E2E suite', async () => {
    const wrapper = mountPanel({
      items: [punch({ status: 'READY_FOR_VERIFICATION', ownerId: 'contractor-1' })]
    });
    await labelled(wrapper, 'Quyết định đóng')!.trigger('click');
    expect(wrapper.findAll('select').map((item) => item.attributes('aria-label')))
      .toEqual(['Quyết định đóng punch']);
  });
});
