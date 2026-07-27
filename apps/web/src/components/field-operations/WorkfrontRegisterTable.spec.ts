import { mount } from '@vue/test-utils';
import WorkfrontRegisterTable from './WorkfrontRegisterTable.vue';
import type { WorkfrontView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};

function workfront(overrides: Partial<WorkfrontView> = {}): WorkfrontView {
  return {
    id: 'workfront-1', projectId: 'project-1', siteId: 'site-1', packageId: null,
    code: 'WF-01', name: 'Dãy inverter 3', status: 'READY', readiness: 'GATES_CLEARED',
    releasedBy: null, releasedAt: null, suspendedReason: null, versionNo: 2,
    createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z', ...overrides
  };
}

function mountTable(overrides: Record<string, unknown> = {}) {
  return mount(WorkfrontRegisterTable, {
    props: {
      rows: [workfront()], nextCursor: null, loadingMore: false, selectedId: null,
      blockedIds: [], releasableIds: ['workfront-1'],
      siteNames: { 'site-1': 'ST-01 · Khu A' }, busy: false, ...overrides
    },
    global: { stubs: { ElButton: buttonStub } }
  });
}

function releaseButton(wrapper: ReturnType<typeof mountTable>) {
  return wrapper.findAll('button').find((item) => item.text() === 'Release');
}

describe('WorkfrontRegisterTable — API-086/087', () => {
  it('renders the register columns from the row itself, issuing no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const text = mountTable().text();
    for (const value of ['WF-01', 'Dãy inverter 3', 'ST-01 · Khu A', 'Đã thông cổng', 'Sẵn sàng']) {
      expect(text).toContain(value);
    }
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  /** A stopped workfront must never render like a working one. */
  it('marks a stopped workfront on the row, in a chip and on the release control', () => {
    const wrapper = mountTable({ blockedIds: ['workfront-1'] });
    const row = wrapper.get('tbody tr');
    expect(row.attributes('data-stopped')).toBe('true');
    expect(wrapper.get('.stop-work-chip').text()).toContain('Đang dừng việc');
    const release = releaseButton(wrapper)!;
    expect(release.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Bị khóa bởi lệnh dừng việc chưa gỡ.');
  });

  it('keeps a normal workfront visually distinct from a stopped one', () => {
    const wrapper = mountTable({
      rows: [workfront(), workfront({ id: 'workfront-2', code: 'WF-02' })],
      blockedIds: ['workfront-2'], releasableIds: ['workfront-1', 'workfront-2']
    });
    expect(wrapper.findAll('tbody tr').map((row) => row.attributes('data-stopped')))
      .toEqual(['false', 'true']);
    expect(wrapper.findAll('.stop-work-chip')).toHaveLength(1);
    const releases = wrapper.findAll('button').filter((item) => item.text() === 'Release');
    expect(releases.map((item) => item.attributes('disabled') !== undefined))
      .toEqual([false, true]);
  });

  it('emits release with the row so the caller can send its expectedVersion', async () => {
    const wrapper = mountTable();
    await releaseButton(wrapper)!.trigger('click');
    expect(wrapper.emitted('release')?.[0]?.[0]).toMatchObject({
      id: 'workfront-1', versionNo: 2
    });
  });

  it('never emits release from a stopped row', async () => {
    const wrapper = mountTable({ blockedIds: ['workfront-1'] });
    await releaseButton(wrapper)!.trigger('click');
    expect(wrapper.emitted('release')).toBeUndefined();
  });

  it.each([
    ['PLANNED', 'GATES_CLEARED'],
    ['READY', 'PENDING'],
    ['RELEASED', 'GATES_CLEARED']
  ] as Array<[WorkfrontView['status'], WorkfrontView['readiness']]>)(
    'offers no release for %s / %s and says why',
    (status, readiness) => {
      const wrapper = mountTable({ rows: [workfront({ status, readiness })] });
      expect(releaseButton(wrapper)).toBeUndefined();
      expect(wrapper.text()).toContain('Chỉ workfront READY đã thông cổng mới release được.');
    }
  );

  it('offers no release control at all without workfront.release reach on that row', () => {
    const wrapper = mountTable({ releasableIds: [] });
    expect(releaseButton(wrapper)).toBeUndefined();
    expect(wrapper.text()).not.toContain('Chỉ workfront READY đã thông cổng mới release được.');
  });

  it('emits open with the workfront id', async () => {
    const wrapper = mountTable();
    await wrapper.findAll('button').find((item) => item.text() === 'Mở')!.trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['workfront-1']);
  });

  it('offers cursor pagination only when the server returned a cursor', async () => {
    expect(mountTable().findAll('button').some((item) => item.text() === 'Tải thêm workfront')).toBe(false);
    const paged = mountTable({ nextCursor: 'opaque' });
    await paged.findAll('button').find((item) => item.text() === 'Tải thêm workfront')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });

  it('distinguishes an empty authorized register from hidden workfronts', () => {
    const wrapper = mountTable({ rows: [] });
    expect(wrapper.text()).toContain('Không có workfront phù hợp');
    expect(wrapper.text()).toContain('không suy ra thành số đếm bằng không');
  });
});
