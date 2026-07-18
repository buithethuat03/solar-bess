import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import IssueForm from './IssueForm.vue';
import type { EvidenceReference, Issue, UpdateIssueRequest } from '@/types/risk-change.types';

const routineEvidence: EvidenceReference = {
  objectType: 'DOCUMENT', objectId: '33333333-3333-4333-8333-333333333333'
};
const resolutionEvidence: EvidenceReference = {
  objectType: 'DOCUMENT', objectId: '44444444-4444-4444-8444-444444444444'
};
const closureEvidence: EvidenceReference = {
  objectType: 'DOCUMENT', objectId: '55555555-5555-4555-8555-555555555555'
};

const issue: Issue = {
  id: 'issue-id', projectId: 'project-id', packageId: 'package-id', code: 'ISS-001',
  title: 'Thiếu đầu vào thiết kế', description: 'Đầu vào chưa được bàn giao đúng hạn',
  occurredAt: '2026-07-18T08:00:00.000Z', rootCause: 'Chậm phê duyệt',
  actualImpact: 'Trễ công việc đường găng', severity: 'HIGH',
  decisionSummary: 'Đã thống nhất biện pháp', ownerId: 'owner-id', targetDate: '2026-07-30',
  sourceRiskId: 'source-risk-id', evidenceRefs: [routineEvidence], status: 'RESOLVED',
  resolutionSummary: 'Đầu vào đã được phê duyệt', resolutionEvidenceRefs: [resolutionEvidence],
  resolvedBy: 'resolver-id', resolvedAt: '2026-07-18T09:00:00.000Z', createdBy: 'creator-id',
  closureRequestedBy: null, closureRequestedAt: null, closureReason: null,
  closureRequestEvidenceRefs: [], closureDecision: null, closureDecisionEvidenceRefs: [],
  closureDecidedBy: null, closureDecidedAt: null, closureDecisionComment: null,
  versionNo: 9, createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-18T09:00:00.000Z'
};

const evidenceEditorStub = defineComponent({
  props: { modelValue: { type: Array, required: true } }, emits: ['update:modelValue'],
  setup(_props, { emit }) {
    return { injectEvidence: () => emit('update:modelValue', [closureEvidence]) };
  },
  template: '<button type="button" class="inject-evidence" @click="injectEvidence">Inject evidence</button>'
});
const buttonStub = {
  props: ['nativeType'],
  template: '<button :type="nativeType || \'button\'"><slot /></button>'
};

function mountIssue(current: Issue = issue) {
  return mount(IssueForm, {
    props: {
      projectId: 'project-id', issue: current, packageOptions: [], fullProject: false,
      editable: true, closurePermission: true, busy: false
    },
    global: { stubs: {
      ElButton: buttonStub, ElAlert: true, AssigneePicker: true,
      EvidenceReferenceEditor: evidenceEditorStub
    } }
  });
}

describe('IssueForm closure command — TEST-017', () => {
  it('emits an exact closure-only payload without Issue management fields', async () => {
    const wrapper = mountIssue();
    const statusLabel = wrapper.findAll('label').find((label) => label.text().startsWith('Status'));
    if (!statusLabel) throw new Error('Issue status control is missing');
    await statusLabel.get('select').setValue('CLOSURE_PENDING');
    const reasonLabel = wrapper.findAll('label').find((label) => label.text().startsWith('Closure reason'));
    if (!reasonLabel) throw new Error('Issue closure reason control is missing');
    await reasonLabel.get('textarea').setValue('Issue đã resolved và đủ evidence để đóng');
    await wrapper.findAll('.inject-evidence').at(-1)?.trigger('click');
    await wrapper.get('form').trigger('submit');

    const payload = wrapper.emitted('update')?.[0]?.[1] as UpdateIssueRequest;
    expect(Object.keys(payload).sort()).toEqual([
      'closureEvidenceRefs', 'closureReason', 'expectedVersion', 'status'
    ]);
    expect(payload).toEqual({
      expectedVersion: 9,
      status: 'CLOSURE_PENDING',
      closureReason: 'Issue đã resolved và đủ evidence để đóng',
      closureEvidenceRefs: [closureEvidence]
    });
  });

  it('preserves the existing routine management update payload', async () => {
    const wrapper = mountIssue({
      ...issue, status: 'IN_PROGRESS', resolutionSummary: null,
      resolutionEvidenceRefs: [], resolvedBy: null, resolvedAt: null
    });
    const titleLabel = wrapper.findAll('label').find((label) => label.text().startsWith('Title'));
    if (!titleLabel) throw new Error('Issue title control is missing');
    await titleLabel.get('input').setValue('Thiếu đầu vào thiết kế đã cập nhật');
    await wrapper.get('form').trigger('submit');

    const payload = wrapper.emitted('update')?.[0]?.[1] as UpdateIssueRequest;
    expect(payload).toEqual({
      title: 'Thiếu đầu vào thiết kế đã cập nhật',
      description: 'Đầu vào chưa được bàn giao đúng hạn',
      occurredAt: new Date('2026-07-18T08:00').toISOString(),
      rootCause: 'Chậm phê duyệt', actualImpact: 'Trễ công việc đường găng',
      severity: 'HIGH', ownerId: 'owner-id', targetDate: '2026-07-30',
      evidenceRefs: [routineEvidence], expectedVersion: 9,
      decisionSummary: 'Đã thống nhất biện pháp'
    });
  });
});
