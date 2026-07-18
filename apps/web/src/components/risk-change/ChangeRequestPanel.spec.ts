import { mount } from '@vue/test-utils';
import ChangeRequestPanel from './ChangeRequestPanel.vue';
import type { ChangeRequest } from '@/types/risk-change.types';

const change: ChangeRequest = {
  id: 'change-id', projectId: 'project-id', packageId: 'package-id', code: 'CHG-001',
  title: 'Điều chỉnh trình tự', reason: 'Đường găng thay đổi', options: ['Điều chỉnh'],
  recommendation: 'Điều chỉnh có kiểm soát', ownerId: 'owner-id', requesterId: 'requester-id',
  sourceBaselineId: null, source: { type: 'MANUAL' }, evidenceRefs: [],
  sourceEvidenceSnapshot: [], impactDraft: {}, impactSnapshot: null,
  impactSnapshotHash: null, approvalSnapshotHash: null, status: 'RETURNED',
  submittedBy: 'submitter-id', submittedAt: '2026-07-18T00:00:00.000Z',
  decisionVersion: 1, decidedBy: 'approver-id', decidedAt: '2026-07-18T01:00:00.000Z',
  approvedBy: null, approvedAt: null, decisionComment: 'Bổ sung assessment',
  scheduleImpactApproved: false, versionNo: 4,
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-18T01:00:00.000Z'
};

const buttonStub = {
  props: ['nativeType'], emits: ['click'],
  template: '<button :type="nativeType || \'button\'" @click="$emit(\'click\')"><slot /></button>'
};

function mountPanel(current: ChangeRequest, overrides: Record<string, unknown> = {}) {
  return mount(ChangeRequestPanel, {
    props: {
      projectId: 'project-id', change: current, packageOptions: [], baselines: [],
      fullProject: false, canRebaseline: false, actorId: 'actor-id', canManage: true,
      canSubmit: true, canApprove: false, busy: false, ...overrides
    },
    global: { stubs: {
      ElButton: buttonStub, ElAlert: true, AssigneePicker: true,
      ChangeImpactEditor: true, EvidenceReferenceEditor: true
    } }
  });
}

function buttonWithText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text);
}

describe('ChangeRequestPanel — TEST-016', () => {
  it('requires RETURNED to be saved as ASSESSED before exposing submit', async () => {
    const wrapper = mountPanel(change);
    const stateLabel = wrapper.findAll('label').find((label) => label.text().includes('Draft state'));
    expect(stateLabel?.get('select').element.value).toBe('ASSESSED');
    expect(buttonWithText(wrapper, 'Submit')).toBeUndefined();

    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('update')?.[0]).toEqual([
      'change-id', expect.objectContaining({ expectedVersion: 4, status: 'ASSESSED' })
    ]);

    await wrapper.setProps({ change: { ...change, status: 'ASSESSED', versionNo: 5 } });
    const submitMode = buttonWithText(wrapper, 'Submit');
    expect(submitMode).toBeDefined();
    await submitMode?.trigger('click');
    await wrapper.get('form.desktop-decision').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]).toEqual(['change-id', 5, '']);
  });

  it('binds submit/decision to their scoped command grants, not the read-scope flag', async () => {
    const assessed = mountPanel({ ...change, status: 'ASSESSED' }, { fullProject: false });
    expect(buttonWithText(assessed, 'Submit')).toBeDefined();

    const submitted = mountPanel({
      ...change, status: 'SUBMITTED', requesterId: 'requester-id', submittedBy: 'submitter-id'
    }, {
      fullProject: false, canSubmit: false, canApprove: true, actorId: 'independent-id'
    });
    expect(buttonWithText(submitted, 'Decision')).toBeDefined();
  });
});
