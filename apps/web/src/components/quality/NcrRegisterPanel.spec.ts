import { mount } from '@vue/test-utils';
import NcrRegisterPanel from './NcrRegisterPanel.vue';
import type { NcrDispositionCycleView, NcrStatus, NcrView } from '@/types/field-hse.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'plain', 'disabled'], emits: ['click'],
  template: '<button :type="$attrs[\'native-type\'] || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title', 'type'], template: '<div class="alert">{{ title }}</div>' };

function ncr(overrides: Partial<NcrView> = {}): NcrView {
  return {
    id: 'ncr-1', projectId: 'project-1', packageId: null, code: 'NCR-001',
    title: 'Mối hàn không đạt', description: 'Kiểm tra NDT phát hiện rỗ khí',
    severity: 'HIGH', status: 'OPEN', raisedBy: 'qaqc-1', ownerId: 'contractor-1',
    containmentAction: null, rootCause: null, disposition: null, dispositionApprovedBy: null,
    verifiedBy: null, verifiedAt: null, closureEvidenceRefs: [], versionNo: 1,
    createdBy: 'qaqc-1', updatedBy: 'qaqc-1', createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z', ...overrides
  };
}

function cycle(overrides: Partial<NcrDispositionCycleView> = {}): NcrDispositionCycleView {
  return {
    id: 'cycle-1', ncrId: 'ncr-1', sequenceNo: 1, proposedDisposition: 'REPAIR',
    proposalComment: 'Mài và hàn lại', proposedBy: 'contractor-1',
    proposedAt: '2026-07-26T05:00:00.000Z', decision: null, decisionComment: null,
    decidedBy: null, decidedAt: null, ...overrides
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(NcrRegisterPanel, {
    props: {
      ncrs: [ncr()], cycles: {}, capas: [], busy: false, currentUserId: 'qaqc-1',
      canManage: true, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

function labelled(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((item) => item.text() === text);
}

describe('NcrRegisterPanel — API-096', () => {
  /** The client mirrors `NCR_TRANSITIONS`, so the register never offers an illegal command. */
  it.each([
    ['OPEN', 'Ghi biện pháp cô lập'],
    ['CONTAINED', 'Ghi nguyên nhân gốc'],
    ['ROOT_CAUSE', 'Đề xuất phương án xử lý'],
    ['RETURNED', 'Đề xuất phương án xử lý'],
    ['DISPOSITION_PROPOSED', 'Quyết định phương án xử lý'],
    ['READY_FOR_VERIFICATION', 'Xác nhận và đóng'],
    ['CLOSED', 'Mở lại']
  ] as Array<[NcrStatus, string]>)('offers only the legal command from %s', (status, command) => {
    const wrapper = mountPanel({ ncrs: [ncr({ status })] });
    // CAPA is orthogonal to the lifecycle, so it is excluded before the transition is checked.
    const lifecycle = wrapper.findAll('tbody button').map((item) => item.text())
      .filter((label) => label !== 'Ghi hành động CAPA');
    expect(lifecycle).toEqual([command]);
  });

  it('never offers CAPA on a closed NCR', () => {
    expect(labelled(mountPanel({ ncrs: [ncr({ status: 'CLOSED' })] }), 'Ghi hành động CAPA'))
      .toBeUndefined();
    expect(labelled(mountPanel(), 'Ghi hành động CAPA')).toBeDefined();
  });

  /** Every proposal/decision pair is its own cycle row; a RETURN opens the next one. */
  it('renders the disposition cycles as a chain, not one mutable decision', () => {
    const wrapper = mountPanel({
      ncrs: [ncr({ status: 'DISPOSITION_PROPOSED', versionNo: 5 })],
      cycles: {
        'ncr-1': [
          cycle({ decision: 'RETURN', decisionComment: 'Thiếu tính toán', decidedBy: 'qaqc-1' }),
          cycle({ id: 'cycle-2', sequenceNo: 2, proposedDisposition: 'REWORK' })
        ]
      }
    });
    const cycles = wrapper.findAll('.cycle-list li');
    expect(cycles).toHaveLength(2);
    expect(cycles.map((item) => item.attributes('data-decision'))).toEqual(['RETURN', 'PENDING']);
    expect(cycles[0].text()).toContain('Sửa chữa');
    expect(cycles[1].text()).toContain('Làm lại');
    expect(cycles[1].text()).toContain('Đang chờ quyết định');
  });

  it('warns the raiser that they cannot approve their own disposition', () => {
    const wrapper = mountPanel({
      ncrs: [ncr({ status: 'DISPOSITION_PROPOSED', raisedBy: 'qaqc-1' })]
    });
    expect(wrapper.text()).toContain('SoD: người lập NCR không được tự phê duyệt disposition.');
  });

  it('warns the owner that they cannot verify their own closure', () => {
    const wrapper = mountPanel({
      ncrs: [ncr({ status: 'READY_FOR_VERIFICATION', ownerId: 'qaqc-1' })]
    });
    expect(wrapper.text()).toContain('SoD: người phụ trách NCR không được tự xác nhận đóng.');
  });

  it('withholds CAPA verification from the CAPA owner', () => {
    const capa = {
      id: 'capa-1', projectId: 'project-1', hseIncidentId: null, ncrId: 'ncr-1',
      title: 'Đào tạo lại thợ hàn', ownerId: 'qaqc-1', dueDate: null, status: 'OPEN' as const,
      effectivenessAssessment: null, verifiedBy: null, verifiedAt: null, versionNo: 1,
      createdBy: 'qaqc-1', updatedBy: 'qaqc-1', createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    };
    expect(labelled(mountPanel({ capas: [capa] }), 'Xác nhận CAPA: Đào tạo lại thợ hàn'))
      .toBeUndefined();
    expect(labelled(
      mountPanel({ capas: [{ ...capa, ownerId: 'contractor-1' }] }),
      'Xác nhận CAPA: Đào tạo lại thợ hàn'
    )).toBeDefined();
  });

  it('emits a decision carrying the NCR version and the mandatory comment', async () => {
    const wrapper = mountPanel({
      ncrs: [ncr({ status: 'DISPOSITION_PROPOSED', raisedBy: 'other-1', versionNo: 5 })]
    });
    await labelled(wrapper, 'Quyết định phương án xử lý')!.trigger('click');
    const form = wrapper.findAll('form').at(-1)!;
    await form.get('select').setValue('RETURN');
    await form.get('textarea').setValue('Chưa đủ căn cứ kỹ thuật');
    await form.trigger('submit');

    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      commandType: 'DECIDE_DISPOSITION', ncrId: 'ncr-1', expectedVersion: 5,
      decision: 'RETURN', reason: 'Chưa đủ căn cứ kỹ thuật'
    });
  });

  it('refuses to close an NCR without evidence', async () => {
    const wrapper = mountPanel({
      ncrs: [ncr({ status: 'READY_FOR_VERIFICATION', ownerId: 'other-1' })]
    });
    await labelled(wrapper, 'Xác nhận và đóng')!.trigger('click');
    await wrapper.findAll('form').at(-1)!.trigger('submit');

    expect(wrapper.emitted('command')).toBeUndefined();
    expect(wrapper.text()).toContain('ít nhất một bằng chứng');
  });

  it('renders the register read-only without ncr.manage', () => {
    const wrapper = mountPanel({ canManage: false });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(labelled(wrapper, 'Lập NCR')).toBeUndefined();
    expect(wrapper.text()).toContain('NCR-001');
  });

  it('labels every select for the accessible-name based E2E suite', async () => {
    const wrapper = mountPanel({ ncrs: [ncr({ status: 'ROOT_CAUSE' })] });
    await labelled(wrapper, 'Lập NCR')!.trigger('click');
    await labelled(wrapper, 'Đề xuất phương án xử lý')!.trigger('click');
    expect(wrapper.findAll('select').map((item) => item.attributes('aria-label')))
      .toEqual(['Mức độ NCR', 'Phương án xử lý đề xuất']);
  });
});
