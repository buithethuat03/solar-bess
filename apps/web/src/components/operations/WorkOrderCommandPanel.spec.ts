import { mount } from '@vue/test-utils';
import WorkOrderCommandPanel from './WorkOrderCommandPanel.vue';
import type { WorkOrderClosureCycleView, WorkOrderView } from '@/types/operations.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

function workOrder(overrides: Partial<WorkOrderView> = {}): WorkOrderView {
  return {
    id: 'work-order-1', projectId: 'project-1', siteId: 'site-1', assetId: 'asset-1',
    serviceIncidentId: null, maintenancePlanId: null, permitToWorkId: null, code: 'WO-2026-001',
    workType: 'CORRECTIVE', title: 'Thay quạt làm mát inverter', description: null,
    priority: 'HIGH', status: 'COMPLETE', requiresPermit: false, assigneeId: 'technician-user',
    scheduledAt: null, dispatchedBy: 'planner-user', dispatchedAt: '2026-07-20T01:00:00.000Z',
    startedBy: 'technician-user', startedAt: '2026-07-20T02:00:00.000Z', holdReason: null,
    completedBy: 'technician-user', completedAt: '2026-07-20T06:00:00.000Z',
    workSummary: 'Đã thay quạt', verifiedBy: null, verifiedAt: null, returnToServiceRef: null,
    closedBy: null, closedAt: null, cancelledBy: null, cancelledAt: null, cancelReason: null,
    versionNo: 5, createdBy: 'planner-user', updatedBy: 'technician-user',
    createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T06:00:00.000Z', ...overrides
  };
}

function cycle(overrides: Partial<WorkOrderClosureCycleView> = {}): WorkOrderClosureCycleView {
  return {
    id: 'cycle-1', workOrderId: 'work-order-1', sequenceNo: 1,
    requestComment: 'Đã thay quạt và chạy thử', requestEvidenceRefs: ['DOCUMENT:uuid-1'],
    requestedBy: 'technician-user', requestedAt: '2026-07-20T06:00:00.000Z',
    decision: null, decisionComment: null, decidedBy: null, decidedAt: null, ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(WorkOrderCommandPanel, {
    props: {
      workOrder: workOrder(), cycles: [], busy: false, canManage: true,
      actorId: 'supervisor-user', ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function commandButtons(wrapper: ReturnType<typeof mountPanel>): string[] {
  return wrapper.findAll('.work-order-commands button').map((item) => item.text());
}

describe('WorkOrderCommandPanel — API-120', () => {
  it('offers VERIFY to an independent user on a COMPLETE work order', () => {
    expect(commandButtons(mountPanel())).toContain('Nghiệm thu');
  });

  /**
   * SEC-108/SEC-109. The service answers 422 SOD_CONFLICT and `ck_work_order_verifier_independent`
   * refuses the same write in SQL, so the button would always fail — it is not rendered at all,
   * and the reason is stated instead.
   */
  it('hides VERIFY and CLOSE from the assignee and from the completer', () => {
    const asAssignee = mountPanel({
      workOrder: workOrder({ assigneeId: 'technician-user', completedBy: 'other-user' }),
      actorId: 'technician-user'
    });
    expect(commandButtons(asAssignee)).not.toContain('Nghiệm thu');
    expect(asAssignee.get('[data-testid="work-order-sod-note"]').text())
      .toContain('không được tự nghiệm thu');

    const asCompleter = mountPanel({
      workOrder: workOrder({ assigneeId: 'other-user', completedBy: 'technician-user' }),
      actorId: 'technician-user'
    });
    expect(commandButtons(asCompleter)).not.toContain('Nghiệm thu');

    const closeAsCompleter = mountPanel({
      workOrder: workOrder({ status: 'VERIFIED', completedBy: 'technician-user' }),
      actorId: 'technician-user'
    });
    expect(commandButtons(closeAsCompleter)).not.toContain('Đóng');
    // A reopen is still legitimate for the same person; only the verification pair is restricted.
    expect(commandButtons(closeAsCompleter)).toContain('Mở lại');
  });

  it('hides VERIFY and CLOSE when the caller is unknown, because independence cannot be proven', () => {
    const anonymous = mountPanel({ actorId: null });
    expect(commandButtons(anonymous)).not.toContain('Nghiệm thu');
  });

  it('offers only the commands WF-024 allows from the current status', () => {
    expect(commandButtons(mountPanel({ workOrder: workOrder({ status: 'DRAFT' }) })))
      .toEqual(['Điều phối', 'Hủy']);
    expect(commandButtons(mountPanel({ workOrder: workOrder({ status: 'ON_HOLD' }) })))
      .toEqual(['Tiếp tục', 'Lập yêu cầu bảo hành']);
    expect(commandButtons(mountPanel({ workOrder: workOrder({ status: 'CANCELLED' }) })))
      .toEqual([]);
  });

  it('makes the return-to-service reference mandatory on CLOSE and refuses to emit without it', async () => {
    const wrapper = mountPanel({
      workOrder: workOrder({ status: 'VERIFIED', completedBy: 'technician-user' }),
      actorId: 'supervisor-user'
    });
    await wrapper.findAll('.work-order-commands button')
      .find((item) => item.text() === 'Đóng')!.trigger('click');

    const field = wrapper.get('[data-testid="return-to-service-ref"]');
    expect(field.attributes('required')).toBeDefined();

    await wrapper.get('form.operations-inline-form').trigger('submit.prevent');
    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('bàn giao trở lại vận hành');

    await field.setValue('RTS-2026-014');
    await wrapper.get('form.operations-inline-form').trigger('submit.prevent');
    expect(wrapper.emitted('command')?.[0]).toEqual(['work-order-1', {
      commandType: 'CLOSE', expectedVersion: 5, returnToServiceRef: 'RTS-2026-014'
    }]);
  });

  it('refuses to complete without a work summary and at least one evidence reference', async () => {
    const wrapper = mountPanel({ workOrder: workOrder({ status: 'IN_PROGRESS' }) });
    await wrapper.findAll('.work-order-commands button')
      .find((item) => item.text() === 'Hoàn thành')!.trigger('click');

    const form = wrapper.get('form.operations-inline-form');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('mô tả công việc');

    await form.findAll('textarea')[0].setValue('Đã thay quạt làm mát');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('ít nhất một bằng chứng');

    await form.findAll('textarea')[1].setValue('DOCUMENT:uuid-1\n\nDOCUMENT:uuid-2\n');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('command')?.[0]).toEqual(['work-order-1', {
      commandType: 'COMPLETE', expectedVersion: 5, workSummary: 'Đã thay quạt làm mát',
      evidenceRefs: ['DOCUMENT:uuid-1', 'DOCUMENT:uuid-2']
    }]);
  });

  /**
   * DB-119: REOPEN opens the NEXT cycle and the previous decision is frozen. The panel renders the
   * cycles as history, so a verification that already happened is never painted over by the reopen
   * that followed it.
   */
  it('renders closure cycles as history and keeps a decided cycle beside the reopened one', () => {
    const wrapper = mountPanel({
      workOrder: workOrder({ status: 'REOPENED' }),
      cycles: [
        cycle({
          id: 'cycle-2', sequenceNo: 2, requestComment: 'Sự cố tái diễn sau hai ngày',
          requestedBy: 'supervisor-user', requestedAt: '2026-07-24T03:00:00.000Z'
        }),
        cycle({
          decision: 'APPROVE', decisionComment: 'Đã kiểm tra dòng và nhiệt độ',
          decidedBy: 'supervisor-user', decidedAt: '2026-07-21T02:00:00.000Z'
        })
      ]
    });

    const items = wrapper.get('[data-testid="closure-cycles"]').findAll('li');
    expect(items).toHaveLength(2);
    // Oldest first, whatever order the responses arrived in.
    expect(items[0].attributes('data-sequence')).toBe('1');
    expect(items[1].attributes('data-sequence')).toBe('2');
    // The first cycle's verification survives the reopen intact.
    expect(items[0].text()).toContain('APPROVE');
    expect(items[0].text()).toContain('Đã kiểm tra dòng và nhiệt độ');
    expect(items[1].text()).toContain('Đang chờ người nghiệm thu độc lập');
    expect(items[1].text()).toContain('Sự cố tái diễn sau hai ngày');
  });

  it('shows no command at all without the manage permission', () => {
    const wrapper = mountPanel({ canManage: false });
    expect(wrapper.find('.work-order-commands').exists()).toBe(false);
    expect(wrapper.text()).toContain('chỉ có quyền đọc work order');
  });

  it('requires an assignee on DISPATCH when the work order has none', async () => {
    const wrapper = mountPanel({
      workOrder: workOrder({ status: 'DRAFT', assigneeId: null, completedBy: null })
    });
    await wrapper.findAll('.work-order-commands button')
      .find((item) => item.text() === 'Điều phối')!.trigger('click');

    await wrapper.get('form.operations-inline-form').trigger('submit.prevent');
    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('phải chỉ định người thực hiện');
  });
});
