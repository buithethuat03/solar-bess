import { mount } from '@vue/test-utils';
import PermitToWorkPanel from './PermitToWorkPanel.vue';
import type { PermitToWorkView, WorkfrontView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

const workfront: WorkfrontView = {
  id: 'workfront-1', projectId: 'project-1', siteId: 'site-1', packageId: null,
  code: 'WF-01', name: 'Dãy inverter 3', status: 'RELEASED', readiness: 'GATES_CLEARED',
  releasedBy: 'user-1', releasedAt: '2026-07-26T00:00:00.000Z', suspendedReason: null,
  versionNo: 3, createdBy: 'user-1', updatedBy: 'user-1',
  createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z'
};

function permit(overrides: Partial<PermitToWorkView> = {}): PermitToWorkView {
  return {
    id: 'permit-1', projectId: 'project-1', siteId: 'site-1', workfrontId: 'workfront-1',
    permitType: 'HOT_WORK', description: 'Hàn khung đỡ', status: 'REQUESTED',
    validFrom: '2026-07-26T01:00:00.000Z', validTo: '2026-07-26T09:00:00.000Z',
    requestedBy: 'requester-1', issuerId: null, issuedAt: null, isolationSnapshot: null,
    versionNo: 1, createdBy: 'requester-1', updatedBy: 'requester-1',
    createdAt: '2026-07-26T00:30:00.000Z', updatedAt: '2026-07-26T00:30:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(PermitToWorkPanel, {
    props: {
      workfront, permits: [permit()], busy: false, currentUserId: 'issuer-1',
      stopWorkBlocked: false, permissions: { request: true, issue: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function issueButton(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('button').find((item) => item.text() === 'Cấp permit');
}

describe('PermitToWorkPanel — API-091/092', () => {
  /** `ck_permit_issuer_independent`: the requester can never be the issuer. */
  it('never offers issue to the requester of that permit', () => {
    const wrapper = mountPanel({ currentUserId: 'requester-1' });
    expect(issueButton(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('SoD: người yêu cầu không được tự cấp');
  });

  it('offers issue to a different holder of permitToWork.issue', async () => {
    const wrapper = mountPanel();
    await issueButton(wrapper)!.trigger('click');
    await wrapper.findAll('textarea').at(-1)!.setValue('DC-01\nAC-02');
    await wrapper.findAll('form').at(-1)!.trigger('submit');

    expect(wrapper.emitted('issue')?.[0]).toEqual([
      'permit-1',
      { expectedVersion: 1, isolationSnapshot: [{ point: 'DC-01' }, { point: 'AC-02' }] }
    ]);
  });

  /** Safety fails closed: the control stays visible so the reason is visible, but it cannot fire. */
  it('disables issue while an unlifted stop-work covers the workfront', async () => {
    const wrapper = mountPanel({ stopWorkBlocked: true });
    const button = issueButton(wrapper)!;
    expect(button.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('thao tác cấp permit bị khóa');
    await button.trigger('click');
    expect(wrapper.emitted('issue')).toBeUndefined();
  });

  it('shows the issuer beside the requester once the permit is issued', () => {
    const wrapper = mountPanel({
      permits: [permit({
        status: 'ISSUED', issuerId: 'issuer-1', issuedAt: '2026-07-26T01:05:00.000Z',
        isolationSnapshot: [{ point: 'DC-01' }], versionNo: 2
      })]
    });
    const row = wrapper.get('tbody tr');
    expect(row.text()).toContain('requester-1');
    expect(row.text()).toContain('issuer-1');
    expect(row.text()).toContain('1 điểm');
    expect(issueButton(wrapper)).toBeUndefined();
  });

  it('tells a caller without permitToWork.issue to wait instead of showing a control', () => {
    const wrapper = mountPanel({ permissions: { request: true, issue: false } });
    expect(issueButton(wrapper)).toBeUndefined();
    expect(wrapper.text()).toContain('Chờ người có quyền cấp');
  });

  it('refuses an issue with an empty isolation snapshot', async () => {
    const wrapper = mountPanel();
    await issueButton(wrapper)!.trigger('click');
    await wrapper.findAll('form').at(-1)!.trigger('submit');

    expect(wrapper.emitted('issue')).toBeUndefined();
    expect(wrapper.text()).toContain('Ảnh chụp cô lập phải có ít nhất một điểm');
  });

  it('validates the permit type and the validity window locally', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('button').find((item) => item.text() === 'Yêu cầu permit')!.trigger('click');
    const form = wrapper.get('form');
    await form.findAll('input')[0].setValue('hot work');
    await form.trigger('submit');

    expect(wrapper.emitted('request')).toBeUndefined();
    expect(wrapper.text()).toContain('Loại permit phải viết hoa');
  });

  it('asks for a workfront before it renders permits at all', () => {
    const wrapper = mountPanel({ workfront: null });
    expect(wrapper.text()).toContain('Chọn một workfront');
    expect(wrapper.find('table').exists()).toBe(false);
  });
});
