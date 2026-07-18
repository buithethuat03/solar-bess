import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import RiskForm from './RiskForm.vue';
import type { EvidenceReference, Risk, UpdateRiskRequest } from '@/types/risk-change.types';

const routineEvidence: EvidenceReference = {
  objectType: 'DOCUMENT', objectId: '11111111-1111-4111-8111-111111111111'
};
const closureEvidence: EvidenceReference = {
  objectType: 'DOCUMENT', objectId: '22222222-2222-4222-8222-222222222222'
};

const risk: Risk = {
  id: 'risk-id', projectId: 'project-id', packageId: 'package-id', code: 'RSK-001',
  category: 'SCHEDULE', cause: 'Thiếu đầu vào', event: 'Trễ thiết kế',
  impact: 'Ảnh hưởng đường găng', probability: 3, costImpactRating: 2,
  scheduleImpactRating: 4, hseImpactRating: 1, impactRating: 4,
  inherentExposure: 12, inherentLevel: 'HIGH', residualProbability: 2,
  residualCostImpactRating: 1, residualScheduleImpactRating: 3,
  residualHseImpactRating: 1, residualImpactRating: 3, residualExposure: 6,
  residualLevel: 'MEDIUM', scoringVersion: 'RISK_SCORE_V1', thresholdVersion: 'RISK_THRESHOLD_V1',
  ownerId: 'owner-id', reviewDate: '2026-07-30', responseStrategy: 'MITIGATE',
  responsePlan: 'Theo dõi đường găng', trigger: 'Mốc thiết kế trễ',
  contingencyPlan: 'Bổ sung nguồn lực', evidenceRefs: [routineEvidence], status: 'MONITORING',
  occurredIssueId: null, createdBy: 'creator-id', closureRequestedBy: null,
  closureRequestedAt: null, closureReason: null, closureRequestEvidenceRefs: [],
  closureDecision: null, closureDecisionEvidenceRefs: [], closureDecidedBy: null,
  closureDecidedAt: null, closureDecisionComment: null, versionNo: 7,
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z'
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

function mountRisk(current: Risk = risk) {
  return mount(RiskForm, {
    props: {
      projectId: 'project-id', risk: current, packageOptions: [], fullProject: false,
      editable: true, closurePermission: true, busy: false
    },
    global: { stubs: {
      ElButton: buttonStub, ElAlert: true, AssigneePicker: true,
      EvidenceReferenceEditor: evidenceEditorStub
    } }
  });
}

describe('RiskForm closure command — TEST-017', () => {
  it('emits an exact closure-only payload without Risk management fields', async () => {
    const wrapper = mountRisk();
    const statusLabel = wrapper.findAll('label').find((label) => label.text().startsWith('Status'));
    if (!statusLabel) throw new Error('Risk status control is missing');
    await statusLabel.get('select').setValue('CLOSURE_PENDING');
    const reasonLabel = wrapper.findAll('label').find((label) => label.text().startsWith('Closure reason'));
    if (!reasonLabel) throw new Error('Risk closure reason control is missing');
    await reasonLabel.get('textarea').setValue('Đã xử lý xong Risk và đủ evidence');
    await wrapper.findAll('.inject-evidence').at(-1)?.trigger('click');
    await wrapper.get('form').trigger('submit');

    const payload = wrapper.emitted('update')?.[0]?.[1] as UpdateRiskRequest;
    expect(Object.keys(payload).sort()).toEqual([
      'closureEvidenceRefs', 'closureReason', 'expectedVersion', 'status'
    ]);
    expect(payload).toEqual({
      expectedVersion: 7,
      status: 'CLOSURE_PENDING',
      closureReason: 'Đã xử lý xong Risk và đủ evidence',
      closureEvidenceRefs: [closureEvidence]
    });
  });

  it('preserves the existing routine management update payload', async () => {
    const wrapper = mountRisk();
    const categoryLabel = wrapper.findAll('label').find((label) => label.text().startsWith('Category'));
    if (!categoryLabel) throw new Error('Risk category control is missing');
    await categoryLabel.get('input').setValue('UPDATED SCHEDULE');
    await wrapper.get('form').trigger('submit');

    const payload = wrapper.emitted('update')?.[0]?.[1] as UpdateRiskRequest;
    expect(payload).toEqual({
      category: 'UPDATED SCHEDULE', cause: 'Thiếu đầu vào', event: 'Trễ thiết kế',
      impact: 'Ảnh hưởng đường găng', probability: 3, costImpactRating: 2,
      scheduleImpactRating: 4, hseImpactRating: 1, ownerId: 'owner-id',
      reviewDate: '2026-07-30', responseStrategy: 'MITIGATE',
      responsePlan: 'Theo dõi đường găng', trigger: 'Mốc thiết kế trễ',
      contingencyPlan: 'Bổ sung nguồn lực', evidenceRefs: [routineEvidence],
      expectedVersion: 7
    });
  });
});
