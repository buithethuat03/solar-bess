import { mount } from '@vue/test-utils';
import TestRunPanel from './TestRunPanel.vue';
import type { TestPackView, TestRunResult, TestRunView } from '@/types/commissioning.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function pack(): TestPackView {
  return {
    id: 'pack-1', projectId: 'project-1', commissioningSystemId: 'system-1', code: 'TP-01',
    title: 'Thử nghiệm chuỗi PV', procedureRevisionId: 'revision-1',
    prerequisitesSnapshot: { required: ['ISOLATION_CONFIRMED'] }, status: 'APPROVED',
    approvedBy: 'user-1', approvedAt: '2026-07-26T10:00:00.000Z', versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z'
  };
}

function run(overrides: Partial<TestRunView> = {}): TestRunView {
  return {
    id: 'run-1', projectId: 'project-1', testPackId: 'pack-1', previousRunId: null, runNo: 1,
    status: 'IN_PROGRESS', result: null, rawDataRef: null, instrumentSnapshot: null,
    witnessSnapshot: null, evidenceRefs: [], startedAt: '2026-07-26T10:00:00.000Z',
    endedAt: null, startedBy: 'user-1', recordedBy: null, recordedAt: null, versionNo: 1,
    createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function recorded(result: TestRunResult, overrides: Partial<TestRunView> = {}): TestRunView {
  return run({
    status: 'RECORDED', result, evidenceRefs: ['DOCUMENT:uuid-1'],
    endedAt: '2026-07-26T12:00:00.000Z', recordedBy: 'user-1',
    recordedAt: '2026-07-26T12:00:00.000Z', versionNo: 2, ...overrides
  });
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(TestRunPanel, {
    props: {
      pack: pack(), runs: [], busy: false,
      permissions: { start: true, complete: true, retest: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('TestRunPanel — API-101…103', () => {
  it('marks a recorded run as frozen and offers no way back into its result', () => {
    const wrapper = mountPanel({ runs: [recorded('PASSED')] });
    const row = wrapper.get('.test-run-table tbody tr');
    expect(row.attributes('data-frozen')).toBe('true');
    expect(row.text()).toContain('Bất biến · chỉ đọc');
    // No control at all in the row: not a disabled edit, not a hidden one — none exists.
    expect(row.findAll('button')).toHaveLength(0);
    expect(row.findAll('input')).toHaveLength(0);
    expect(row.findAll('select')).toHaveLength(0);
    expect(wrapper.findAll('form.test-run-complete-form')).toHaveLength(0);
  });

  it('offers a FAILED run only a retest — never an edit-to-pass path', async () => {
    const wrapper = mountPanel({ runs: [recorded('FAILED')] });
    const row = wrapper.get('.test-run-table tbody tr');
    expect(row.attributes('data-result')).toBe('FAILED');
    const actions = row.findAll('button');
    expect(actions).toHaveLength(1);
    expect(actions[0].text()).toBe('Tạo lần chạy lại');
    expect(wrapper.text()).not.toContain('Ghi kết quả lần chạy');

    await actions[0].trigger('click');
    const form = wrapper.get('form.test-run-retest-form');
    // The retest form talks about a new row and repeats that the failure stands.
    expect(form.text()).toContain('là một hàng mới trỏ về #1');
    expect(form.findAll('select')).toHaveLength(0);
  });

  it('shows a retest as a new row that references the run it followed', () => {
    const wrapper = mountPanel({
      runs: [
        recorded('FAILED'),
        run({ id: 'run-2', runNo: 2, previousRunId: 'run-1' })
      ]
    });
    const rows = wrapper.findAll('.test-run-table tbody tr');
    expect(rows).toHaveLength(2);
    // The failure stays on the board forever, with its own result intact.
    expect(rows[0].text()).toContain('Không đạt');
    expect(rows[0].attributes('data-frozen')).toBe('true');
    expect(rows[1].get('.run-retest-of').text()).toBe('Chạy lại của #1');
    // A run may be retested exactly once; the offer disappears afterwards.
    expect(rows[0].text()).toContain('Đã có lần chạy lại');
    expect(rows[0].findAll('button')).toHaveLength(0);
  });

  it('never offers a retest on a PASSED or INCONCLUSIVE run', () => {
    for (const result of ['PASSED', 'INCONCLUSIVE'] as TestRunResult[]) {
      const wrapper = mountPanel({ runs: [recorded(result)] });
      const row = wrapper.get('.test-run-table tbody tr');
      expect(row.findAll('button')).toHaveLength(0);
      expect(row.text()).toContain('Kết quả đã đóng băng');
    }
  });

  it('records a result once, with mandatory evidence and the expected version', async () => {
    const wrapper = mountPanel({ runs: [run({ versionNo: 3 })] });
    await wrapper.get('.test-run-table tbody button').trigger('click');
    const form = wrapper.get('form.test-run-complete-form');
    await form.get('select[aria-label="Kết quả lần chạy"]').setValue('FAILED');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('complete')).toBeUndefined();
    expect(wrapper.text()).toContain('phải kèm ít nhất một bằng chứng');

    await form.findAll('textarea')[0].setValue('DOCUMENT:uuid-1\nDOCUMENT:uuid-2');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('complete')?.[0]).toEqual(['run-1', {
      expectedVersion: 3, result: 'FAILED',
      evidenceRefs: ['DOCUMENT:uuid-1', 'DOCUMENT:uuid-2']
    }]);
  });

  it('emits the retest with a reason and the satisfied prerequisites', async () => {
    const wrapper = mountPanel({ runs: [recorded('ABORTED')] });
    await wrapper.get('.test-run-table tbody button').trigger('click');
    const form = wrapper.get('form.test-run-retest-form');
    const areas = form.findAll('textarea');
    await areas[0].setValue('Đã thay biến tần lỗi và hiệu chuẩn lại thiết bị đo');
    await areas[1].setValue('ISOLATION_CONFIRMED');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('retest')?.[0]).toEqual(['run-1', {
      reason: 'Đã thay biến tần lỗi và hiệu chuẩn lại thiết bị đo',
      satisfiedPrerequisites: ['ISOLATION_CONFIRMED']
    }]);
  });

  it('refuses to open a second run while one is still unrecorded', () => {
    const wrapper = mountPanel({ runs: [run()] });
    expect(wrapper.findAll('form.test-run-start-form')).toHaveLength(0);
    expect(wrapper.text()).toContain('chỉ được mở một lần chạy tại một thời điểm');
  });

  it('hides the completion and retest affordances without their permissions', () => {
    const wrapper = mountPanel({
      runs: [run(), recorded('FAILED', { id: 'run-0', runNo: 0 })],
      permissions: { start: false, complete: false, retest: false }
    });
    expect(wrapper.findAll('.test-run-table tbody button')).toHaveLength(0);
    expect(wrapper.findAll('form')).toHaveLength(0);
  });
});
