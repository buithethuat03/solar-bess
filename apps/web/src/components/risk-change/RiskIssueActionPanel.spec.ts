import { mount } from '@vue/test-utils';
import RiskIssueActionPanel from './RiskIssueActionPanel.vue';
import type { RiskIssueAction } from '@/types/risk-change.types';

const action: RiskIssueAction = {
  id: 'action-id', projectId: 'project-id', packageId: 'package-id', riskId: null,
  issueId: 'issue-id', code: 'ACT-001', actionType: 'CORRECTIVE', title: 'Khắc phục',
  description: null, ownerId: 'owner-id', dueDate: '2026-07-30', status: 'DONE',
  statusReason: null, evidenceRefs: [{ objectType: 'DOCUMENT', objectId: 'completion-id' }],
  residualAssessment: null, residualRiskVersion: null, completedBy: 'completer-id',
  completedAt: '2026-07-18T00:00:00.000Z', verifiedBy: null, verifiedAt: null,
  cancelledBy: null, cancelledAt: null, versionNo: 3,
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z'
};

const buttonStub = {
  props: ['nativeType'], emits: ['click'],
  template: '<button :type="nativeType || \'button\'" @click="$emit(\'click\')"><slot /></button>'
};

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(RiskIssueActionPanel, {
    props: {
      projectId: 'project-id',
      parent: { type: 'ISSUE' as const, id: 'issue-id', packageId: 'package-id' },
      action, fullProject: true, actorId: 'independent-id', canManage: true, busy: false,
      ...overrides
    },
    global: { stubs: {
      ElButton: buttonStub, ElAlert: true, AssigneePicker: true
    } }
  });
}

describe('RiskIssueActionPanel — TEST-015', () => {
  it('keeps DONE routine fields read-only for the owner/completer and package-only actors', () => {
    for (const wrapper of [
      mountPanel({ actorId: 'completer-id' }),
      mountPanel({ actorId: 'independent-id', fullProject: false })
    ]) {
      expect(wrapper.text()).toContain('routine fields đã bị khóa');
      expect(wrapper.find('[aria-label="Action command"]').exists()).toBe(false);
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Routine update');
      expect(wrapper.text()).not.toContain('Complete Action');
      expect(wrapper.text()).not.toContain('Verify độc lập');
      expect(wrapper.text()).not.toContain('Cancel độc lập');
      expect(wrapper.text()).toContain('completion-id');
    }
  });

  it('offers only independent terminal commands to a full-project manager', async () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[aria-label="Action command"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Verify');
    expect(wrapper.text()).toContain('Cancel');
    expect(wrapper.text()).not.toContain('Routine update');
    expect(wrapper.text()).not.toContain('Complete Action');
    expect(wrapper.get('form.desktop-decision').text()).toContain('Verify độc lập');
  });
});
