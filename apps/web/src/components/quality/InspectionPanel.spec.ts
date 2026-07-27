import { mount } from '@vue/test-utils';
import InspectionPanel from './InspectionPanel.vue';
import type { InspectionView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

function inspection(overrides: Partial<InspectionView> = {}): InspectionView {
  return {
    id: 'inspection-1', projectId: 'project-1', itpId: 'itp-1',
    itp: {
      id: 'itp-1', projectId: 'project-1', packageId: 'package-1',
      documentRevisionId: 'revision-1', version: 1
    },
    holdPointRef: 'HP-010', sequenceNo: 1, status: 'REQUESTED', result: null,
    evidenceRefs: [], witnessSnapshot: null, requestedBy: 'user-1', recordedBy: null,
    recordedAt: null, versionNo: 1, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z', ...overrides
  };
}

const recordedFail = inspection({
  id: 'inspection-1', status: 'RECORDED', result: 'FAIL', sequenceNo: 1,
  evidenceRefs: ['photo://weld-1'], recordedBy: 'qaqc-1',
  recordedAt: '2026-07-26T04:00:00.000Z', versionNo: 2
});

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(InspectionPanel, {
    props: { inspections: [inspection()], busy: false, canManage: true, ...overrides },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function labelled(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text);
}

describe('InspectionPanel — API-095', () => {
  /** A RECORDED run is written once and frozen; there is no editing path, only a new run. */
  it('renders a recorded run read-only with an explicit frozen marker', () => {
    const wrapper = mountPanel({ inspections: [recordedFail] });
    const row = wrapper.get('tbody tr');
    expect(row.attributes('data-frozen')).toBe('true');
    expect(row.text()).toContain('Đã ghi kết quả (đóng băng)');
    expect(row.text()).toContain('Chỉ đọc · không sửa được');
    expect(labelled(wrapper, 'Ghi kết quả')).toBeUndefined();
  });

  it('offers a re-inspection only after a FAIL, and only as a new request', async () => {
    const wrapper = mountPanel({ inspections: [recordedFail] });
    await labelled(wrapper, 'Yêu cầu tái kiểm tra')!.trigger('click');

    expect(wrapper.emitted('command')?.[0]).toEqual([
      'itp-1', { commandType: 'REQUEST', holdPointRef: 'HP-010' }
    ]);
  });

  it('closes the hold point after a PASS instead of offering another run', () => {
    const wrapper = mountPanel({
      inspections: [inspection({
        status: 'RECORDED', result: 'PASS', evidenceRefs: ['photo://weld-1'],
        recordedBy: 'qaqc-1', recordedAt: '2026-07-26T04:00:00.000Z', versionNo: 2
      })]
    });
    expect(labelled(wrapper, 'Yêu cầu tái kiểm tra')).toBeUndefined();
    expect(wrapper.text()).toContain('Hold point đã đạt');
  });

  /** The re-inspection is a NEW row: the failed attempt stays in the chain, untouched. */
  it('shows the re-inspection as a new row beside the run it follows', () => {
    const wrapper = mountPanel({
      inspections: [recordedFail, inspection({ id: 'inspection-2', sequenceNo: 2 })]
    });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    // Newest sequence leads its own chain, and the frozen attempt is still there below it.
    expect(rows.map((row) => row.attributes('data-frozen'))).toEqual(['false', 'true']);
    expect(rows[0].text()).toContain('#2');
    expect(rows[0].text()).toContain('Tái kiểm tra');
    expect(rows[1].text()).toContain('#1');
    expect(rows[1].text()).toContain('Không đạt');
  });

  it('records a result with the run version and at least one evidence reference', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Ghi kết quả')!.trigger('click');
    const form = wrapper.findAll('form').at(-1)!;
    await form.get('select').setValue('FAIL');
    await form.findAll('textarea')[0].setValue('photo://weld-1\nreport://ndt-7');
    await form.findAll('textarea')[1].setValue('Nguyễn Văn A');
    await form.trigger('submit');

    expect(wrapper.emitted('command')?.[0]).toEqual([
      'itp-1',
      {
        commandType: 'RECORD', inspectionId: 'inspection-1', expectedVersion: 1, result: 'FAIL',
        evidenceRefs: ['photo://weld-1', 'report://ndt-7'],
        witnesses: [{ name: 'Nguyễn Văn A' }]
      }
    ]);
  });

  it('refuses to record a result without evidence', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Ghi kết quả')!.trigger('click');
    await wrapper.findAll('form').at(-1)!.trigger('submit');

    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('ít nhất một bằng chứng');
  });

  /** `InspectionResult` and `ck_inspection_result` hold exactly two values — no CONDITIONAL_PASS. */
  it('offers only the two results the API can accept', async () => {
    const wrapper = mountPanel();
    await labelled(wrapper, 'Ghi kết quả')!.trigger('click');
    const select = wrapper.findAll('form').at(-1)!.get('select');
    expect(select.attributes('aria-label')).toBe('Kết quả kiểm tra');
    expect(select.findAll('option').map((option) => option.attributes('value')))
      .toEqual(['PASS', 'FAIL']);
  });

  it('validates the hold-point reference before opening a request', async () => {
    const wrapper = mountPanel();
    const form = wrapper.get('form');
    await form.findAll('input')[0].setValue('itp-1');
    await form.findAll('input')[1].setValue('hp 010');
    await form.trigger('submit');

    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('Hold point phải viết hoa');
  });

  it('renders the chain read-only without inspection.manage', () => {
    const wrapper = mountPanel({ inspections: [recordedFail], canManage: false });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(labelled(wrapper, 'Yêu cầu tái kiểm tra')).toBeUndefined();
    expect(wrapper.text()).toContain('HP-010');
  });
});
