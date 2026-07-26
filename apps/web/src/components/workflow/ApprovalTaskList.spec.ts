import { mount } from '@vue/test-utils';
import ApprovalTaskList from './ApprovalTaskList.vue';
import type {
  ApprovalDecisionView, WorkflowInstanceView, WorkflowPageMeta
} from '@/types/workflow.types';

const buttonStub = {
  props: ['loading', 'type'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function instance(overrides: Partial<WorkflowInstanceView> = {}): WorkflowInstanceView {
  return {
    id: 'instance-1', workflowDefinitionId: 'def-1', workflowVersionId: 'ver-1',
    objectType: 'ChangeRequest', objectId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    objectVersion: 1, projectId: 'project-1', packageId: null, state: 'IN_REVIEW',
    currentStepKey: 'REVIEW', currentAttemptNo: 1, routeHash: 'a'.repeat(64),
    requestedBy: 'requester-1', closedBy: null, closedAt: null, closureReason: null,
    versionNo: 2, createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z',
    ...overrides
  };
}

const decision: ApprovalDecisionView = {
  id: 'decision-1', sequenceNo: 1, stepKey: 'REVIEW', attemptNo: 1, decision: 'RETURN',
  actorId: 'approver-1', effectiveActorId: 'approver-1',
  comment: 'Thiếu đánh giá tác động', decidedAt: '2026-07-26T11:00:00.000Z'
};

const meta: WorkflowPageMeta = { nextCursor: null, limit: 50 };

function mountList(overrides: Record<string, unknown> = {}) {
  return mount(ApprovalTaskList, {
    props: {
      items: [instance()], meta, selected: null, decisions: [],
      loading: false, busy: false, error: '', canDecide: true, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: true } }
  });
}

function actionButton(wrapper: ReturnType<typeof mountList>, label: string) {
  return wrapper.findAll('button').find((item) => item.text() === label);
}

describe('ApprovalTaskList — US-015 / TEST-068…071', () => {
  it('translates the state vocabulary rather than showing raw enums', () => {
    const wrapper = mountList({ items: [instance({ state: 'RETURNED' })] });
    expect(wrapper.text()).toContain('Đã trả lại');
    expect(wrapper.text()).not.toContain('RETURNED');
  });

  it('emits open with the selected instance', async () => {
    const wrapper = mountList();
    await wrapper.get('.approval-inbox__list button').trigger('click');
    expect(wrapper.emitted('open')?.[0]?.[0]).toMatchObject({ id: 'instance-1' });
  });

  it('shows the append-only decision history for the selected instance', () => {
    const wrapper = mountList({ selected: instance(), decisions: [decision] });
    expect(wrapper.text()).toContain('#1 · Trả lại');
    expect(wrapper.text()).toContain('Thiếu đánh giá tác động');
  });

  it('emits each decision with the typed comment', async () => {
    const wrapper = mountList({ selected: instance(), decisions: [] });
    await wrapper.get('textarea[name="comment"]').setValue('  Đồng ý phê duyệt  ');
    await actionButton(wrapper, 'Phê duyệt')!.trigger('click');
    expect(wrapper.emitted('decide')?.[0]?.[0]).toEqual({
      decision: 'APPROVE', comment: 'Đồng ý phê duyệt'
    });

    await actionButton(wrapper, 'Trả lại')!.trigger('click');
    expect(wrapper.emitted('decide')?.[1]?.[0]).toMatchObject({ decision: 'RETURN' });
    await actionButton(wrapper, 'Từ chối')!.trigger('click');
    expect(wrapper.emitted('decide')?.[2]?.[0]).toMatchObject({ decision: 'REJECT' });
  });

  it('hides the decision form from an actor without the permission', () => {
    const wrapper = mountList({ selected: instance(), canDecide: false });
    expect(wrapper.find('textarea[name="comment"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Bạn không có quyền ghi quyết định phê duyệt.');
  });

  it('hides the decision form once the instance is closed', () => {
    const wrapper = mountList({
      selected: instance({ state: 'APPROVED', closedAt: '2026-07-26T12:00:00.000Z' })
    });
    expect(wrapper.find('textarea[name="comment"]').exists()).toBe(false);
  });

  it('distinguishes an empty authorized queue from hidden work', () => {
    const wrapper = mountList({ items: [] });
    expect(wrapper.text()).toContain('Không có việc chờ phê duyệt');
    expect(wrapper.text()).toContain('không được suy ra thành số đếm bằng không');
  });

  it('offers pagination only when the server returns a cursor', async () => {
    expect(actionButton(mountList(), 'Tải thêm')).toBeUndefined();
    const paged = mountList({ meta: { nextCursor: 'opaque', limit: 50 } });
    await actionButton(paged, 'Tải thêm')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });
});
