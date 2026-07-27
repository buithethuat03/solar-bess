import { mount } from '@vue/test-utils';
import TestPackPanel from './TestPackPanel.vue';
import type { CommissioningSystemView, TestPackView } from '@/types/commissioning.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function system(id = 'system-1', code = 'PV-01'): CommissioningSystemView {
  return {
    id, projectId: 'project-1', parentSystemId: null, code, name: `Hệ thống ${code}`,
    systemType: 'PV_ARRAY', boundary: {}, status: 'READY_FOR_TEST', versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z'
  };
}

function pack(overrides: Partial<TestPackView> = {}): TestPackView {
  return {
    id: 'pack-1', projectId: 'project-1', commissioningSystemId: 'system-1', code: 'TP-01',
    title: 'Thử nghiệm chuỗi PV', procedureRevisionId: 'revision-1',
    prerequisitesSnapshot: { required: ['ISOLATION_CONFIRMED'] }, status: 'APPROVED',
    approvedBy: 'user-1', approvedAt: '2026-07-26T10:00:00.000Z', versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(TestPackPanel, {
    props: {
      packs: [pack()], system: system(), selectedPackId: null, busy: false,
      permissions: { create: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('TestPackPanel — API-100', () => {
  it('lists only the packs of the selected system with their prerequisite contract', () => {
    const wrapper = mountPanel({
      packs: [pack(), pack({ id: 'pack-2', code: 'TP-02', commissioningSystemId: 'system-2' })]
    });
    const rows = wrapper.findAll('.test-pack-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('TP-01');
    expect(rows[0].text()).toContain('ISOLATION_CONFIRMED');
    expect(rows[0].text()).toContain('Đã phê duyệt');
  });

  it('says so instead of guessing when no system is selected', () => {
    const wrapper = mountPanel({ system: null });
    expect(wrapper.text()).toContain('Chọn một hệ thống ở cây bên trên');
    expect(wrapper.findAll('form')).toHaveLength(0);
  });

  it('emits the pack command with the prerequisite lines folded into the snapshot', async () => {
    const wrapper = mountPanel({ packs: [] });
    const form = wrapper.get('form.test-pack-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('TP-02');
    await inputs[1].setValue('Thử nghiệm biến tần');
    await inputs[2].setValue('revision-uuid');
    await form.get('textarea').setValue('ISOLATION_CONFIRMED\nEARTHING_VERIFIED');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')?.[0]).toEqual(['system-1', {
      code: 'TP-02', title: 'Thử nghiệm biến tần', procedureRevisionId: 'revision-uuid',
      prerequisitesSnapshot: { required: ['ISOLATION_CONFIRMED', 'EARTHING_VERIFIED'] }
    }]);
  });

  it('refuses a pack without a procedure revision rather than letting the server explain it', async () => {
    const wrapper = mountPanel({ packs: [] });
    const form = wrapper.get('form.test-pack-form');
    const inputs = form.findAll('input');
    await inputs[0].setValue('TP-03');
    await inputs[1].setValue('Thiếu quy trình');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('create')).toBeUndefined();
    expect(wrapper.text()).toContain('revision quy trình đã ISSUED và quét sạch mã độc');
  });

  it('emits the selected pack id so the run panel can follow it', async () => {
    const wrapper = mountPanel();
    await wrapper.get('.test-pack-table tbody button').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['pack-1']);
  });
});
