import { mount } from '@vue/test-utils';
import NotificationInbox from './NotificationInbox.vue';
import type { AppNotification, NotificationPageMeta } from '@/types/notification.types';

const buttonStub = {
  props: ['loading'], emits: ['click'],
  template: '<button type="button" :disabled="loading" @click="$emit(\'click\')"><slot /></button>'
};

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'notification-1', projectId: 'project-id', packageId: null, sourceType: 'Risk',
    sourceId: 'risk-id', activityId: null, alertType: 'RISK_REVIEW_DUE', priority: 'HIGH',
    objectLink: '/projects/project-id/risk-change', reason: 'Đến hạn review Risk RSK-001',
    dueAt: '2026-07-25', dataDate: '2026-07-20', thresholdVersion: 'threshold-v1',
    status: 'UNREAD', readAt: null, createdAt: '2026-07-20T10:00:00.000Z', ...overrides
  };
}

const meta: NotificationPageMeta = {
  nextCursor: null, limit: 50, unreadTotal: 3, unreadHigh: 2, unreadNormal: 1
};

function mountInbox(overrides: Record<string, unknown> = {}) {
  return mount(NotificationInbox, {
    props: {
      items: [notification()], meta, loading: false, error: '',
      statusFilter: '', acknowledging: '', ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: true } }
  });
}

describe('NotificationInbox — US-022 / TEST-103…107', () => {
  it('shows the unread counters from meta rather than counting the visible page', () => {
    const wrapper = mountInbox({ items: [notification()] });
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('2');
    expect(wrapper.text()).toContain('Đến hạn review Risk');
  });

  it('emits open with the whole notification so the caller can follow objectLink', async () => {
    const wrapper = mountInbox();
    await wrapper.get('.notification-inbox__open').trigger('click');
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ objectLink: '/projects/project-id/risk-change' });
  });

  it('offers acknowledge only while a notification is unread', async () => {
    const unread = mountInbox();
    const button = unread.findAll('button').find((item) => item.text() === 'Đánh dấu đã đọc');
    expect(button).toBeDefined();
    await button!.trigger('click');
    expect(unread.emitted('acknowledge')?.[0]?.[0]).toMatchObject({ id: 'notification-1' });

    const read = mountInbox({
      items: [notification({ status: 'READ', readAt: '2026-07-20T11:00:00.000Z' })]
    });
    expect(read.findAll('button').some((item) => item.text() === 'Đánh dấu đã đọc')).toBe(false);
    expect(read.text()).toContain('Đã đọc');
  });

  it('distinguishes an empty authorized page from hidden work', () => {
    const wrapper = mountInbox({ items: [], meta: { ...meta, unreadTotal: 0, unreadHigh: 0, unreadNormal: 0 } });
    expect(wrapper.text()).toContain('Không có notification phù hợp');
    expect(wrapper.text()).toContain('không được suy ra thành số đếm bằng không');
  });

  it('surfaces a load failure instead of rendering an empty inbox silently', () => {
    const wrapper = mountInbox({ items: [], error: 'Không tải được notification.' });
    expect(wrapper.find('el-alert-stub').attributes('title')).toBe('Không tải được notification.');
  });

  it('exposes the pagination control only when the server offers a next cursor', async () => {
    const single = mountInbox();
    expect(single.findAll('button').some((item) => item.text() === 'Tải thêm')).toBe(false);

    const paged = mountInbox({ meta: { ...meta, nextCursor: 'opaque-cursor' } });
    const more = paged.findAll('button').find((item) => item.text() === 'Tải thêm');
    expect(more).toBeDefined();
    await more!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });

  it('propagates the status filter through the exactly labelled select', async () => {
    const wrapper = mountInbox();
    const select = wrapper.get('select[aria-label="Trạng thái"]');
    await select.setValue('UNREAD');
    expect(wrapper.emitted('update:statusFilter')?.[0]).toEqual(['UNREAD']);
  });
});
