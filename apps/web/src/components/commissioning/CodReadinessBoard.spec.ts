import { mount } from '@vue/test-utils';
import CodReadinessBoard from './CodReadinessBoard.vue';
import type {
  BlockingFinding, CodGateView, CodPackageView, CodReadinessData, ReadinessEvaluation
} from '@/types/commissioning.types';
import type { ProjectParty } from '@/types/project.types';

const buttonStub = {
  props: ['loading', 'type', 'text', 'disabled'], emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
};
const alertStub = { props: ['title'], template: '<div class="alert">{{ title }}</div>' };

const BLOCKED_FINDINGS: BlockingFinding[] = [
  { type: 'PUNCH_ITEM', id: 'punch-1', reference: 'PUNCH-A-001', detail: 'category A punch item is OPEN' },
  { type: 'NCR', id: 'ncr-1', reference: 'NCR-007', detail: 'critical NCR is OPEN' },
  { type: 'STOP_WORK', id: 'stop-1', reference: 'WORKFRONT', detail: 'unlifted stop-work covering WORKFRONT' }
];

function evaluation(overrides: Partial<ReadinessEvaluation> = {}): ReadinessEvaluation {
  return {
    asOf: '2026-07-26T10:00:00.000Z',
    gates: {
      total: 4, accepted: 2, waived: 0, pending: 2, underReview: 0, rejected: 0,
      mandatoryTotal: 4, mandatoryOutstanding: 2
    },
    categories: [
      { category: 'LEGAL', total: 2, satisfied: 1, outstanding: 1 },
      { category: 'SAFETY', total: 2, satisfied: 1, outstanding: 1 }
    ],
    expiredEvidenceGateIds: [],
    blockingFindings: {
      punchItems: 1, criticalNcrs: 1, stopWorks: 1, total: 3, items: BLOCKED_FINDINGS
    },
    blocked: true, readyToSign: false, ...overrides
  };
}

function clearEvaluation(): ReadinessEvaluation {
  return evaluation({
    gates: {
      total: 4, accepted: 4, waived: 0, pending: 0, underReview: 0, rejected: 0,
      mandatoryTotal: 4, mandatoryOutstanding: 0
    },
    categories: [{ category: 'LEGAL', total: 4, satisfied: 4, outstanding: 0 }],
    blockingFindings: { punchItems: 0, criticalNcrs: 0, stopWorks: 0, total: 0, items: [] },
    blocked: false, readyToSign: true
  });
}

function codPackage(overrides: Partial<CodPackageView> = {}): CodPackageView {
  return {
    id: 'package-1', projectId: 'project-1', version: 1, status: 'SUBMITTED',
    readinessSnapshot: null, snapshotHash: 'hash-1', signedArtifactRef: null, effectiveAt: null,
    legalHold: false, submittedBy: 'user-submitter', submittedAt: '2026-07-26T10:00:00.000Z',
    signedBy: null, signedAt: null, signerSnapshot: null, versionNo: 1,
    createdBy: 'user-submitter', updatedBy: 'user-submitter',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

function gate(overrides: Partial<CodGateView> = {}): CodGateView {
  return {
    id: 'gate-1', projectId: 'project-1', category: 'LEGAL', code: 'COD-LEGAL-01',
    title: 'Giấy phép vận hành', mandatory: true, waivable: false, ownerId: 'user-1',
    dueDate: '2026-08-30', status: 'PENDING', evidenceRefs: [], evidenceExpiry: null,
    acceptedBy: null, acceptedAt: null, waivedBy: null, waivedAt: null, waiverReason: null,
    versionNo: 1, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', ...overrides
  };
}

const parties: ProjectParty[] = [
  {
    id: 'party-epc', projectId: 'project-1', companyId: 'CTY-EPC', legalEntityId: 'legal-1',
    roleCode: 'EPC', raci: 'RESPONSIBLE', effectiveFrom: '2026-01-01', effectiveTo: null,
    contactName: null, contactEmail: null, versionNo: 1
  },
  {
    id: 'party-owner', projectId: 'project-1', companyId: 'CTY-OWNER', legalEntityId: 'legal-2',
    roleCode: 'OWNER', raci: 'ACCOUNTABLE', effectiveFrom: '2026-01-01', effectiveTo: null,
    contactName: null, contactEmail: null, versionNo: 1
  }
];

function readiness(
  readinessOverrides: ReadinessEvaluation, packages: CodPackageView[] = []
): CodReadinessData {
  return { projectId: 'project-1', readiness: readinessOverrides, packages };
}

function mountBoard(overrides: Record<string, unknown> = {}) {
  return mount(CodReadinessBoard, {
    props: {
      readiness: readiness(evaluation()), gates: [], parties, busy: false,
      currentUserId: 'user-verifier', permissions: { manage: true }, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: alertStub } }
  });
}

describe('CodReadinessBoard — API-104 / API-105', () => {
  it('lists every blocking finding under its own category', () => {
    const wrapper = mountBoard();
    const groups = wrapper.findAll('.cod-blockers__group');
    expect(groups.map((group) => group.attributes('data-group'))).toEqual([
      'PUNCH_ITEM', 'NCR', 'STOP_WORK', 'MANDATORY_GATE'
    ]);
    expect(groups.map((group) => group.attributes('data-open')))
      .toEqual(['true', 'true', 'true', 'true']);
    expect(groups[0].text()).toContain('PUNCH-A-001');
    expect(groups[1].text()).toContain('NCR-007');
    expect(groups[2].text()).toContain('WORKFRONT');
    // Mandatory gates come back as per-category counts, which is exactly what API-104 answers.
    expect(groups[3].text()).toContain('Pháp lý');
    expect(groups[3].text()).toContain('còn 1 / 2 điều kiện chưa đạt');
  });

  it('marks a cleared category as clear rather than hiding it', () => {
    const wrapper = mountBoard({ readiness: readiness(clearEvaluation()) });
    const groups = wrapper.findAll('.cod-blockers__group');
    expect(groups.map((group) => group.attributes('data-open')))
      .toEqual(['false', 'false', 'false', 'false']);
    expect(groups[0].text()).toContain('Không còn punch item hạng A nào chặn COD');
  });

  it('disables SIGN_COD with every open reason spelled out instead of enabling then failing', () => {
    const wrapper = mountBoard({ readiness: readiness(evaluation(), [codPackage()]) });
    const form = wrapper.get('form.cod-sign-form');
    const signButton = form.findAll('button').find((item) => item.text() === 'Ký COD')!;
    expect(signButton.attributes('disabled')).toBeDefined();
    const reasons = form.findAll('.cod-sign-blockers li').map((item) => item.text());
    expect(reasons).toEqual([
      '1 punch item hạng A chặn COD chưa đóng',
      '1 NCR nghiêm trọng còn mở',
      '1 lệnh dừng việc chưa được gỡ',
      '2 điều kiện COD bắt buộc chưa được đáp ứng'
    ]);
  });

  it('enables SIGN_COD only when the evaluation itself is clear', async () => {
    const wrapper = mountBoard({
      readiness: readiness(clearEvaluation(), [codPackage()])
    });
    const form = wrapper.get('form.cod-sign-form');
    const signButton = form.findAll('button').find((item) => item.text() === 'Ký COD')!;
    expect(signButton.attributes('disabled')).toBeUndefined();
    expect(form.findAll('.cod-sign-blockers')).toHaveLength(0);

    await form.trigger('submit.prevent');
    expect(wrapper.emitted('command')?.[0]).toEqual([{
      commandType: 'SIGN_COD', codPackageId: 'package-1', expectedVersion: 1
    }]);
  });

  it('hides SIGN_COD entirely from the person who submitted the package', () => {
    const wrapper = mountBoard({
      readiness: readiness(clearEvaluation(), [codPackage()]),
      currentUserId: 'user-submitter'
    });
    expect(wrapper.findAll('form.cod-sign-form')).toHaveLength(0);
    expect(wrapper.findAll('button').some((item) => item.text() === 'Ký COD')).toBe(false);
    expect(wrapper.get('.cod-actions__sod').text())
      .toContain('bạn là người trình hồ sơ COD này nên lệnh ký không dành cho bạn');
  });

  it('renders a signed package as immutable with exactly handover and legal hold left', () => {
    const wrapper = mountBoard({
      readiness: readiness(clearEvaluation(), [codPackage({
        status: 'SIGNED', signedBy: 'user-verifier', signedAt: '2026-07-26T12:00:00.000Z',
        versionNo: 2
      })])
    });
    expect(wrapper.get('.cod-package__immutable').text())
      .toContain('Chỉ còn hai thao tác: ghi nhận bàn giao và đặt legal hold');
    expect(wrapper.findAll('form.cod-sign-form')).toHaveLength(0);
    expect(wrapper.findAll('form.cod-handover-form')).toHaveLength(1);
    expect(wrapper.findAll('.cod-legal-hold')).toHaveLength(1);
    // Clearing a hold is never an affordance — only prose explaining that it cannot exist.
    expect(wrapper.findAll('button').map((item) => item.text()))
      .toEqual(['Trình hồ sơ COD (SUBMIT_COD)', 'Ghi nhận bàn giao', 'Đặt legal hold', 'Khai báo điều kiện']);
    expect(wrapper.get('.cod-legal-hold__note').text())
      .toContain('Gỡ legal hold không tồn tại ở đây');
  });

  it('shows an asserted legal hold as permanent and still never offers to clear it', () => {
    const wrapper = mountBoard({
      readiness: readiness(clearEvaluation(), [codPackage({
        status: 'SIGNED', legalHold: true, signedBy: 'user-verifier', versionNo: 2
      })])
    });
    expect(wrapper.get('.cod-package__legal-hold').text())
      .toContain('legal hold không bao giờ được gỡ');
    expect(wrapper.findAll('button').some((item) => item.text().startsWith('Gỡ'))).toBe(false);
  });

  it('emits the handover command with two distinct parties', async () => {
    const wrapper = mountBoard({
      readiness: readiness(clearEvaluation(), [codPackage({ status: 'SIGNED', versionNo: 2 })])
    });
    const form = wrapper.get('form.cod-handover-form');
    await form.get('select[aria-label="Bên bàn giao"]').setValue('party-epc');
    await form.get('select[aria-label="Bên nhận bàn giao"]').setValue('party-owner');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('command')?.[0]).toEqual([{
      commandType: 'ACCEPT_HANDOVER', codPackageId: 'package-1', expectedVersion: 2,
      fromPartyId: 'party-epc', recipientPartyId: 'party-owner'
    }]);
  });

  it('excludes the handing-over party from the recipient list', async () => {
    const wrapper = mountBoard({
      readiness: readiness(clearEvaluation(), [codPackage({ status: 'SIGNED', versionNo: 2 })])
    });
    const form = wrapper.get('form.cod-handover-form');
    await form.get('select[aria-label="Bên bàn giao"]').setValue('party-epc');
    const recipient = form.get('select[aria-label="Bên nhận bàn giao"]');
    expect(recipient.findAll('option').map((option) => option.text()))
      .toEqual(['Chọn bên nhận', 'OWNER · CTY-OWNER']);
  });

  it('offers a waiver only for a gate that was declared waivable', () => {
    const nonWaivable = mountBoard({ gates: [gate()] });
    expect(nonWaivable.findAll('form.cod-waive-form')).toHaveLength(0);

    const waivable = mountBoard({ gates: [gate({ id: 'gate-2', waivable: true })] });
    const select = waivable.get('select[aria-label="Điều kiện COD được miễn trừ"]');
    expect(select.findAll('option')).toHaveLength(2);
  });

  it('sends the review command with the gate version the board last saw', async () => {
    const wrapper = mountBoard({ gates: [gate({ versionNo: 4 })] });
    const form = wrapper.get('form.cod-review-form');
    await form.get('select[aria-label="Điều kiện COD cần xử lý"]').setValue('gate-1');
    await form.findAll('textarea')[0].setValue('DOCUMENT:uuid-1');
    await form.findAll('textarea')[1].setValue('Nộp giấy phép bản chính');
    await form.trigger('submit.prevent');
    expect(wrapper.emitted('command')?.[0]).toEqual([{
      commandType: 'REVIEW_EVIDENCE', codGateId: 'gate-1', expectedVersion: 4,
      reviewAction: 'SUBMIT', evidenceRefs: ['DOCUMENT:uuid-1'],
      reason: 'Nộp giấy phép bản chính'
    }]);
  });

  it('surfaces gates resting on lapsed evidence as their own warning', () => {
    const wrapper = mountBoard({
      readiness: readiness(evaluation({ expiredEvidenceGateIds: ['gate-1'] })),
      gates: [gate({ status: 'ACCEPTED', evidenceExpiry: '2026-06-30' })]
    });
    expect(wrapper.get('.cod-expired-evidence').text()).toContain('COD-LEGAL-01');
    expect(wrapper.get('.cod-expired-evidence').text()).toContain('2026-06-30');
  });

  it('hides every COD command without the manage permission but keeps the board readable', () => {
    const wrapper = mountBoard({
      readiness: readiness(evaluation(), [codPackage()]), permissions: { manage: false }
    });
    expect(wrapper.findAll('form')).toHaveLength(0);
    expect(wrapper.findAll('.cod-blockers__group')).toHaveLength(4);
    expect(wrapper.get('.cod-board__summary').attributes('data-ready')).toBe('false');
  });
});
