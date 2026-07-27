import { mount } from '@vue/test-utils';
import AlarmCaseList from './AlarmCaseList.vue';
import type { AlarmCaseView } from '@/types/operations.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function alarmCase(overrides: Partial<AlarmCaseView> = {}): AlarmCaseView {
  return {
    id: 'case-1', projectId: 'project-1', siteId: 'site-1', assetId: 'asset-1',
    severity: 'CRITICAL', state: 'OPEN', ownerId: null,
    firstSeenAt: '2026-07-26T01:00:00.000Z', lastSeenAt: '2026-07-26T02:00:00.000Z',
    sourceEventRefs: ['ot-event-1'], sourceQuality: 'GOOD', acknowledgedBy: null,
    acknowledgedAt: null, acknowledgmentNote: null, versionNo: 2, createdBy: 'system',
    updatedBy: 'system', createdAt: '2026-07-26T01:00:00.000Z',
    updatedAt: '2026-07-26T02:00:00.000Z', ...overrides
  };
}

function mountList(overrides: Record<string, unknown> = {}) {
  return mount(AlarmCaseList, {
    props: {
      cases: [alarmCase()], nextCursor: null, busy: false, canAcknowledge: true,
      lastAcknowledgeNoop: false, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('AlarmCaseList — API-114/115', () => {
  /**
   * SEC-127/SEC-128 and AGENTS.md §11: acknowledging writes four columns on the PM Web row and
   * nothing else. Someone standing in front of a live plant must be able to read that off the
   * screen, not infer it — so the copy is asserted, not just the payload.
   */
  it('states in the UI that acknowledging does not clear, reset or suppress the source alarm', () => {
    const scope = mountList().get('[data-testid="alarm-local-scope"]').text();
    expect(scope).toContain('Chỉ ghi nhận cục bộ');
    expect(scope).toContain('không xóa');
    expect(scope).toContain('không reset');
    expect(scope).toContain('không suppress');
  });

  it('offers no control that could act on the source system', () => {
    const wrapper = mountList();
    const labels = wrapper.findAll('button').map((item) => item.text().toLowerCase());
    for (const forbidden of ['xóa cảnh báo', 'reset', 'suppress', 'clear']) {
      expect(labels.some((label) => label.includes(forbidden))).toBe(false);
    }
  });

  it('emits a local acknowledgement carrying only the lock version and an optional note', async () => {
    const wrapper = mountList();
    await wrapper.findAll('tbody button')
      .find((item) => item.text() === 'Ghi nhận cục bộ')!.trigger('click');

    const form = wrapper.get('form.operations-inline-form');
    await form.get('textarea').setValue('Đã cử kỹ thuật viên tới hiện trường');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('acknowledge')?.[0]).toEqual(['case-1', {
      expectedVersion: 2, note: 'Đã cử kỹ thuật viên tới hiện trường'
    }]);
  });

  it('omits an empty note rather than sending a value the API would reject', async () => {
    const wrapper = mountList();
    await wrapper.findAll('tbody button')
      .find((item) => item.text() === 'Ghi nhận cục bộ')!.trigger('click');
    await wrapper.get('form.operations-inline-form').trigger('submit.prevent');

    expect(wrapper.emitted('acknowledge')?.[0]).toEqual(['case-1', { expectedVersion: 2 }]);
  });

  it('refuses a one-character note instead of letting the API answer 400', async () => {
    const wrapper = mountList();
    await wrapper.findAll('tbody button')
      .find((item) => item.text() === 'Ghi nhận cục bộ')!.trigger('click');
    const form = wrapper.get('form.operations-inline-form');
    await form.get('textarea').setValue('x');
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('acknowledge')).toBeUndefined();
    expect(wrapper.text()).toContain('ít nhất 3 ký tự');
  });

  it('describes a replayed acknowledgement as a harmless no-op, not a failure', () => {
    const wrapper = mountList({ lastAcknowledgeNoop: true });
    const note = wrapper.get('[data-testid="alarm-replay-note"]').text();
    expect(note).toContain('no-op vô hại');
    expect(note).toContain('giữ nguyên');
  });

  it('offers no acknowledgement without the permission or on an already acknowledged case', () => {
    const denied = mountList({ canAcknowledge: false });
    expect(denied.findAll('tbody button')).toHaveLength(0);

    const acknowledged = mountList({
      cases: [alarmCase({
        state: 'ACKNOWLEDGED', acknowledgedBy: 'operator-user',
        acknowledgedAt: '2026-07-26T02:30:00.000Z', acknowledgmentNote: 'Ghi nhận cục bộ'
      })]
    });
    expect(acknowledged.findAll('tbody button')).toHaveLength(0);
    expect(acknowledged.text()).toContain('Đã ghi nhận');
  });

  it('shows the source only as opaque references, never as a payload', () => {
    const wrapper = mountList();
    expect(wrapper.text()).toContain('1 tham chiếu sự kiện');
    expect(wrapper.text()).not.toContain('ot-event-1');
  });
});
