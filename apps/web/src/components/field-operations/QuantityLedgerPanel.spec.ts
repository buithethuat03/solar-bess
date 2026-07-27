import { mount } from '@vue/test-utils';
import QuantityLedgerPanel from './QuantityLedgerPanel.vue';
import type { QuantityProgressView, WorkfrontView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

/** Digit grouping uses a narrow no-break space so it never reads as a decimal separator. */
const NNBSP = ' ';

const workfront: WorkfrontView = {
  id: 'workfront-1', projectId: 'project-1', siteId: 'site-1', packageId: null,
  code: 'WF-01', name: 'Dãy inverter 3', status: 'RELEASED', readiness: 'GATES_CLEARED',
  releasedBy: 'user-1', releasedAt: '2026-07-26T00:00:00.000Z', suspendedReason: null,
  versionNo: 3, createdBy: 'user-1', updatedBy: 'user-1',
  createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z'
};

function record(overrides: Partial<QuantityProgressView> = {}): QuantityProgressView {
  return {
    id: 'record-1', projectId: 'project-1', workfrontId: 'workfront-1', wbsNodeId: null,
    correctionOfId: null, certificationOfId: null, recordDate: '2026-07-25',
    quantity: '1250.5000', unit: 'm2', evidenceRefs: [], reason: null,
    sourceKey: 'offline-batch-0001', recordedBy: 'user-1',
    recordedAt: '2026-07-25T10:00:00.000Z', ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(QuantityLedgerPanel, {
    props: { workfront, records: [record()], busy: false, canRecord: true, ...overrides },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function sourceKeyInput(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('input')
    .find((item) => item.attributes('placeholder')?.includes('Khóa chống trùng'))!;
}

describe('QuantityLedgerPanel — API-090 / DB-057', () => {
  /** numeric(19,4) text must survive rendering untouched; `Number(...)` would round it away. */
  it('renders the quantity as text without ever parsing it', () => {
    const wrapper = mountPanel({ records: [record({ quantity: '123456789012.0001' })] });
    expect(wrapper.text()).toContain(
      `123${NNBSP}456${NNBSP}789${NNBSP}012.0001`
    );
  });

  /**
   * The rule the ledger exists for: a correction is a NEW row. Both the original and the correction
   * stay in the table, each with its own role marker — nothing is ever rewritten in place.
   */
  it('shows a correction as its own row beside the row it corrects', () => {
    const wrapper = mountPanel({
      records: [
        record(),
        record({
          id: 'record-2', correctionOfId: 'record-1', quantity: '1180.0000',
          reason: 'Đo lại sau nghiệm thu', sourceKey: 'correction-0001'
        })
      ]
    });
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.attributes('data-role'))).toEqual(['RECORD', 'CORRECTION']);
    expect(rows[0].text()).toContain(`1${NNBSP}250.5000`);
    expect(rows[1].text()).toContain(`1${NNBSP}180.0000`);
    expect(rows[1].text()).toContain('Đo lại sau nghiệm thu');
    expect(rows[1].text()).toContain('record-1');
    expect(wrapper.text()).toContain('một dòng sai không bị sửa mà được đính chính bằng dòng mới');
  });

  it('offers no edit or delete affordance on any stored row', () => {
    const wrapper = mountPanel({
      records: [record(), record({ id: 'record-2', certificationOfId: 'record-1' })]
    });
    expect(wrapper.findAll('tbody button')).toHaveLength(0);
    expect(wrapper.findAll('tbody input')).toHaveLength(0);
  });

  it('emits a correction carrying the mandatory reason and the original id', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('select')[0].setValue('CORRECTION');
    await wrapper.findAll('select')[1].setValue('record-1');
    await wrapper.get('input[inputmode="decimal"]').setValue('1180.25');
    await sourceKeyInput(wrapper).setValue('correction-0001');
    await wrapper.findAll('textarea')[0].setValue('Đo lại sau nghiệm thu');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('record')?.[0]?.[0]).toMatchObject({
      quantity: '1180.25', correctionOfId: 'record-1', reason: 'Đo lại sau nghiệm thu'
    });
  });

  it('refuses a correction without a reason before it reaches the server', async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('select')[0].setValue('CORRECTION');
    await wrapper.findAll('select')[1].setValue('record-1');
    await wrapper.get('input[inputmode="decimal"]').setValue('1180.25');
    await sourceKeyInput(wrapper).setValue('correction-0001');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('record')).toBeUndefined();
    expect(wrapper.text()).toContain('Đính chính bắt buộc phải có lý do');
  });

  it('rejects a quantity that is not decimal text of at most four fraction digits', async () => {
    const wrapper = mountPanel();
    await wrapper.get('input[inputmode="decimal"]').setValue('12.00001');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('record')).toBeUndefined();
    expect(wrapper.text()).toContain('Khối lượng phải là số thập phân dương');
  });

  it('hides the form without progress.record but still renders the ledger', () => {
    const wrapper = mountPanel({ canRecord: false });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain(`1${NNBSP}250.5000`);
  });

  it('asks for a workfront before it renders a ledger at all', () => {
    const wrapper = mountPanel({ workfront: null });
    expect(wrapper.text()).toContain('Chọn một workfront');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('labels every select for the accessible-name based E2E suite', async () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll('select')[0].attributes('aria-label')).toBe('Loại bản ghi khối lượng');
    await wrapper.findAll('select')[0].setValue('CERTIFICATION');
    expect(wrapper.findAll('select')[1].attributes('aria-label')).toBe('Bản ghi được nghiệm thu');
  });
});
