import { mount } from '@vue/test-utils';
import StopWorkBanner from './StopWorkBanner.vue';
import type { ActiveStopWork } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'plain'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function entry(overrides: Partial<ActiveStopWork> = {}): ActiveStopWork {
  return {
    id: 'stop-work-1', targetType: 'WORKFRONT', targetLabel: 'WF-01 · Dãy inverter 3',
    reason: 'Giàn giáo mất chốt an toàn', actorId: 'user-1',
    actedAt: '2026-07-26T03:00:00.000Z', pending: false, ...overrides
  };
}

function mountBanner(overrides: Record<string, unknown> = {}) {
  return mount(StopWorkBanner, {
    props: { entries: [entry()], canLift: false, busy: false, ...overrides },
    global: { stubs: { ElButton: buttonStub } }
  });
}

describe('StopWorkBanner — FR-088 / SEC-108', () => {
  it('stays silent when nothing is stopped', () => {
    expect(mountBanner({ entries: [] }).find('.stop-work-banner').exists()).toBe(false);
  });

  it('names the target and the reason in an assertive alert', () => {
    const wrapper = mountBanner();
    const banner = wrapper.get('.stop-work-banner');
    expect(banner.attributes('role')).toBe('alert');
    expect(banner.attributes('aria-live')).toBe('assertive');
    expect(banner.text()).toContain('Đang có lệnh dừng việc chưa được gỡ');
    expect(banner.text()).toContain('Workfront');
    expect(banner.text()).toContain('WF-01 · Dãy inverter 3');
    expect(banner.text()).toContain('Giàn giáo mất chốt an toàn');
    // The banner must also say what is now blocked, not just that something happened.
    expect(banner.text()).toContain('Release workfront và cấp permit bị khóa');
  });

  it('lists every unlifted stop-work, each tagged with its own target type', () => {
    const wrapper = mountBanner({
      entries: [
        entry({ id: 'stop-work-1', targetType: 'PROJECT', targetLabel: 'Nhà máy Ninh Thuận' }),
        entry({ id: 'stop-work-2', targetType: 'SITE', targetLabel: 'ST-02 · Khu B' })
      ]
    });
    const items = wrapper.findAll('.stop-work-banner__list li');
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.attributes('data-target'))).toEqual(['PROJECT', 'SITE']);
    expect(wrapper.text()).toContain('Toàn dự án');
    expect(wrapper.text()).toContain('Công trường');
  });

  /**
   * The rule the screen exists to keep: only `stopWork.lift` (HSE_MANAGER) may lift. Rendering the
   * control for anyone else would teach the operator an authority the server will refuse.
   */
  it('renders no lift control at all without stopWork.lift', () => {
    const wrapper = mountBanner({ canLift: false });
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.text()).toContain('Chỉ vai trò có quyền stopWork.lift mới được gỡ.');
  });

  it('renders the lift control only for a holder of stopWork.lift', async () => {
    const wrapper = mountBanner({ canLift: true });
    const button = wrapper.get('button');
    expect(button.text()).toBe('Gỡ lệnh dừng');
    await button.trigger('click');
    expect(wrapper.emitted('lift')?.[0]?.[0]).toMatchObject({ id: 'stop-work-1' });
  });

  /**
   * A refusal-inferred entry has no ledger id, so there is nothing `liftsActionId` could reference.
   * Even a lift holder must not be shown a button that could not produce a valid command.
   */
  it('offers no lift button for a refusal-inferred entry, even to a lift holder', () => {
    const wrapper = mountBanner({
      canLift: true,
      entries: [entry({
        id: null, pending: true, targetType: 'PROJECT', targetLabel: 'Nhà máy Ninh Thuận',
        reason: 'Đang có lệnh dừng việc chưa được gỡ trong phạm vi này', actedAt: null
      })]
    });
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.text()).toContain('Chọn bản ghi ISSUE trong sổ lệnh dừng để gỡ.');
    expect(wrapper.text()).toContain('ledger không có API đọc');
  });
});
