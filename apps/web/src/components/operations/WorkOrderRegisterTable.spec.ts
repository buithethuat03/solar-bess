import { mount } from '@vue/test-utils';
import WorkOrderRegisterTable from './WorkOrderRegisterTable.vue';
import type { WorkOrderRegisterRow, WorkOrderStatus } from '@/types/operations.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function row(overrides: Partial<WorkOrderRegisterRow> = {}): WorkOrderRegisterRow {
  return {
    id: 'work-order-1', projectId: 'project-1', siteId: 'site-1', assetId: 'asset-1',
    serviceIncidentId: null, maintenancePlanId: null, permitToWorkId: null, code: 'WO-2026-001',
    workType: 'CORRECTIVE', title: 'Thay quạt làm mát inverter', description: null,
    priority: 'HIGH', status: 'IN_PROGRESS', requiresPermit: false, assigneeId: 'technician-user',
    scheduledAt: null, dispatchedBy: null, dispatchedAt: null, startedBy: null, startedAt: null,
    holdReason: null, completedBy: null, completedAt: null, workSummary: null, verifiedBy: null,
    verifiedAt: null, returnToServiceRef: null, closedBy: null, closedAt: null,
    cancelledBy: null, cancelledAt: null, cancelReason: null, versionNo: 1,
    createdBy: 'planner-user', updatedBy: 'planner-user',
    createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
    maintenancePlan: null, warrantyClaimCount: 0, ...overrides
  };
}

function mountTable(overrides: Record<string, unknown> = {}) {
  return mount(WorkOrderRegisterTable, {
    props: {
      rows: [row()], nextCursor: null, loadingMore: false, selectedId: null, ...overrides
    },
    global: { stubs: { ElButton: buttonStub } }
  });
}

describe('WorkOrderRegisterTable — API-118', () => {
  it.each([
    ['ON_HOLD', 'Tạm dừng'],
    ['REOPENED', 'Đã mở lại'],
    ['CLOSED', 'Đã đóng']
  ] as Array<[WorkOrderStatus, string]>)(
    'renders the %s status as its own chip and repeats it as a row marker',
    (status, label) => {
      const wrapper = mountTable({ rows: [row({ status })] });
      const chip = wrapper.findAll('tbody .status-pill')
        .find((item) => item.attributes('data-status') === status);
      expect(chip?.text()).toBe(label);
      // The row repeats the signal so it survives a greyscale print.
      expect(wrapper.get('tbody tr').attributes('data-status')).toBe(status);
    }
  );

  it('shows the permit-to-work requirement on the row, not behind a click', () => {
    const wrapper = mountTable({ rows: [row({ requiresPermit: true })] });
    expect(wrapper.get('.permit-required').text()).toBe('Bắt buộc PTW');

    const optional = mountTable({ rows: [row({ requiresPermit: false })] });
    expect(optional.find('.permit-required').exists()).toBe(false);
    expect(optional.text()).toContain('Không yêu cầu');
  });

  it('emits the work order id when a row is opened', async () => {
    const wrapper = mountTable();
    await wrapper.findAll('tbody button')
      .find((item) => item.text() === 'Mở lệnh')!.trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['work-order-1']);
  });

  it('renders the embedded maintenance plan context or says there is none', () => {
    const planned = mountTable({
      rows: [row({
        maintenancePlanId: 'plan-1',
        maintenancePlan: {
          id: 'plan-1', planType: 'PM_QUARTERLY', version: 2, triggerType: 'TIME',
          intervalValue: 3, intervalUnit: 'MONTH', status: 'PUBLISHED', nextDueAt: null
        }
      })]
    });
    expect(planned.text()).toContain('PM_QUARTERLY v2');

    expect(mountTable().text()).toContain('Không theo kế hoạch');
  });

  it('offers cursor pagination only when the server returned a cursor', async () => {
    expect(mountTable().findAll('button').some((item) => item.text() === 'Tải thêm work order'))
      .toBe(false);
    const paged = mountTable({ nextCursor: 'opaque' });
    await paged.findAll('button')
      .find((item) => item.text() === 'Tải thêm work order')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });

  it('reports an empty register as empty rather than as a failure', () => {
    const wrapper = mountTable({ rows: [] });
    expect(wrapper.text()).toContain('Chưa có work order');
    expect(wrapper.find('tbody').exists()).toBe(false);
  });
});
