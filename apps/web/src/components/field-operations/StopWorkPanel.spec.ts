import { mount } from '@vue/test-utils';
import StopWorkPanel from './StopWorkPanel.vue';
import type { StopWorkActionView, WorkfrontView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

const sites = [{
  id: 'site-1', projectId: 'project-1', code: 'ST-01', name: 'Khu A', location: null,
  timezone: 'Asia/Ho_Chi_Minh', isPrimary: true, status: 'ACTIVE'
}];

const workfronts: WorkfrontView[] = [{
  id: 'workfront-1', projectId: 'project-1', siteId: 'site-1', packageId: null,
  code: 'WF-01', name: 'Dãy inverter 3', status: 'READY', readiness: 'GATES_CLEARED',
  releasedBy: null, releasedAt: null, suspendedReason: null, versionNo: 1,
  createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z'
}];

function action(overrides: Partial<StopWorkActionView> = {}): StopWorkActionView {
  return {
    id: 'stop-work-1', projectId: 'project-1', action: 'ISSUE', targetType: 'WORKFRONT',
    siteId: null, workfrontId: 'workfront-1', permitId: null, hseIncidentId: null,
    reason: 'Giàn giáo mất chốt an toàn', liftsActionId: null, verifiedControls: [],
    actorId: 'reporter-1', actedAt: '2026-07-26T03:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(StopWorkPanel, {
    props: {
      actions: [action()], sites, workfronts, permits: [], busy: false,
      currentUserId: 'hse-manager-1', permissions: { issue: true, lift: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function labelled(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text);
}

describe('StopWorkPanel — API-094 split permission', () => {
  /**
   * `stopWork.issue` is granted to every role; `stopWork.lift` is HSE_MANAGER's alone. Without the
   * lift half there must be no lift control anywhere — not a hidden one, not a disabled one.
   */
  it('renders no lift affordance at all without stopWork.lift', () => {
    const wrapper = mountPanel({ permissions: { issue: true, lift: false } });
    expect(labelled(wrapper, 'Gỡ lệnh dừng')).toBeUndefined();
    expect(labelled(wrapper, 'Gỡ')).toBeUndefined();
    expect(wrapper.text()).toContain('không giữ quyền');
    expect(wrapper.text()).toContain('stopWork.lift');
    expect(wrapper.text()).toContain('Chưa gỡ');
  });

  it('keeps the issue action available to everyone holding stopWork.issue', () => {
    const wrapper = mountPanel({ permissions: { issue: true, lift: false } });
    expect(labelled(wrapper, 'Ra lệnh dừng việc')).toBeDefined();
  });

  it('renders the lift action for a holder of stopWork.lift', () => {
    const wrapper = mountPanel();
    expect(labelled(wrapper, 'Gỡ lệnh dừng')).toBeDefined();
    expect(labelled(wrapper, 'Gỡ')).toBeDefined();
  });

  /** `ck_stop_work_lift_independent`: the issuer of a stop-work may never lift it. */
  it('withholds the row lift action from the actor who issued the stop-work', () => {
    const wrapper = mountPanel({ currentUserId: 'reporter-1' });
    expect(labelled(wrapper, 'Gỡ')).toBeUndefined();
    expect(wrapper.text()).toContain('SoD: người ra lệnh không được tự gỡ');
  });

  it('emits a lift carrying the issue id, a reason and the verified controls', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Gỡ')!.trigger('click');
    const form = wrapper.findAll('form').at(-1)!;
    await form.findAll('textarea')[0].setValue('Đã lắp lại chốt và kiểm tra');
    await form.findAll('textarea')[1].setValue('Kiểm tra chốt\nKý xác nhận giám sát');
    await form.trigger('submit');

    expect(wrapper.emitted('lift')?.[0]?.[0]).toEqual({
      action: 'LIFT', liftsActionId: 'stop-work-1', reason: 'Đã lắp lại chốt và kiểm tra',
      verifiedControls: ['Kiểm tra chốt', 'Ký xác nhận giám sát']
    });
  });

  it('refuses a lift with no verified controls before it reaches the server', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Gỡ')!.trigger('click');
    const form = wrapper.findAll('form').at(-1)!;
    await form.findAll('textarea')[0].setValue('Đã lắp lại chốt');
    await form.trigger('submit');

    expect(wrapper.emitted('lift')).toBeUndefined();
    expect(wrapper.text()).toContain('ít nhất một biện pháp đã kiểm chứng');
  });

  it('emits an issue naming the workfront it stops', async () => {
    const wrapper = mountPanel({ actions: [] });
    await labelled(wrapper, 'Ra lệnh dừng việc')!.trigger('click');
    const form = wrapper.get('form');
    await form.findAll('select')[1].setValue('workfront-1');
    await form.get('textarea').setValue('Giàn giáo mất chốt an toàn');
    await form.trigger('submit');

    expect(wrapper.emitted('issue')?.[0]?.[0]).toEqual({
      action: 'ISSUE', targetType: 'WORKFRONT', workfrontId: 'workfront-1',
      reason: 'Giàn giáo mất chốt an toàn'
    });
  });

  it('stops treating an issue as open once its lift is in the ledger', () => {
    const wrapper = mountPanel({
      actions: [
        action(),
        action({
          id: 'stop-work-2', action: 'LIFT', liftsActionId: 'stop-work-1',
          reason: 'Đã khắc phục', verifiedControls: ['Kiểm tra chốt'], actorId: 'hse-manager-1'
        })
      ]
    });
    expect(labelled(wrapper, 'Gỡ')).toBeUndefined();
    expect(wrapper.findAll('tbody tr').map((row) => row.attributes('data-action')))
      .toEqual(['ISSUE', 'LIFT']);
  });

  it('says the session ledger is not the project history', () => {
    const wrapper = mountPanel({ actions: [] });
    expect(wrapper.text()).toContain('không có API đọc sổ lệnh dừng');
  });

  it('labels every select for the accessible-name based E2E suite', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Ra lệnh dừng việc')!.trigger('click');
    await labelled(wrapper, 'Gỡ lệnh dừng')!.trigger('click');
    expect(wrapper.findAll('select').map((item) => item.attributes('aria-label'))).toEqual([
      'Phạm vi dừng việc', 'Workfront bị dừng', 'Lệnh dừng cần gỡ'
    ]);
  });
});
