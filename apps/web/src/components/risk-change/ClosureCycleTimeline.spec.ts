import { mount } from '@vue/test-utils';
import ClosureCycleTimeline from './ClosureCycleTimeline.vue';

describe('ClosureCycleTimeline — DB-113/AC-017', () => {
  it('keeps every immutable cycle visible and requests the opaque next page', async () => {
    const wrapper = mount(ClosureCycleTimeline, { props: {
      nextCursor: 'opaque-next', loading: false,
      cycles: [1, 2].map((sequenceNo) => ({
        id: `cycle-${sequenceNo}`, projectId: 'project', packageId: null,
        riskId: 'risk', issueId: null, sequenceNo, requestReason: `Request ${sequenceNo}`,
        requestEvidenceRefs: [], requestedBy: 'requester', requestedAt: '2026-07-18T00:00:00Z',
        decision: sequenceNo === 1 ? 'RETURN' as const : null,
        decisionComment: sequenceNo === 1 ? 'Cần xử lý thêm' : null,
        decisionEvidenceRefs: [], decidedBy: sequenceNo === 1 ? 'approver' : null,
        decidedAt: sequenceNo === 1 ? '2026-07-18T01:00:00Z' : null,
        resultingStatus: sequenceNo === 1 ? 'MONITORING' as const : null,
        createdAt: '2026-07-18T00:00:00Z'
      }))
    }, global: { stubs: { ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' } } } });
    expect(wrapper.text()).toContain('Cycle #1');
    expect(wrapper.text()).toContain('Cycle #2');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('loadMore')?.length).toBeGreaterThanOrEqual(1);
  });
});
