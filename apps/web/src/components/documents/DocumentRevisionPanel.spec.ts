import { mount } from '@vue/test-utils';
import DocumentRevisionPanel from './DocumentRevisionPanel.vue';
import type { DocumentRevisionView, DocumentView } from '@/types/document.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

const document: DocumentView = {
  id: 'document-1', projectId: 'project-1', packageId: null, documentCode: 'SLD-001',
  title: 'Sơ đồ đơn tuyến', discipline: 'ELECTRICAL', type: 'DRAWING',
  classification: 'CONFIDENTIAL', ownerId: 'owner-1', currentRevisionId: null,
  legalHold: false, status: 'ACTIVE', versionNo: 1, createdBy: 'owner-1', updatedBy: 'owner-1',
  createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z'
};

function revision(overrides: Partial<DocumentRevisionView> = {}): DocumentRevisionView {
  return {
    id: 'revision-1', documentId: 'document-1', projectId: 'project-1', revisionCode: 'A',
    workingVersion: 1, status: 'DRAFT', purpose: 'Phát hành thi công', fileName: 'sld.pdf',
    mimeType: 'application/pdf', hasQuarantinedObject: false, hasReleasedObject: true,
    contentHash: 'a'.repeat(64), sizeBytes: 2048, scanStatus: 'CLEAN', scanSignature: null,
    scannedAt: '2026-07-26T10:05:00.000Z', scannerVersion: 'clamav-1', lockState: 'UNLOCKED',
    reviewCycleNo: 0, approvedBy: null, approvedAt: null, issuedBy: null, issuedAt: null,
    uploadedBy: 'owner-1', versionNo: 2, createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:05:00.000Z', ...overrides
  };
}

const allPermissions = { submitReview: true, comment: true, approve: true, issue: true };

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(DocumentRevisionPanel, {
    props: {
      document, currentRevision: null, revisions: [revision()], nextCursor: null,
      busy: false, permissions: allPermissions, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: true } }
  });
}

function action(wrapper: ReturnType<typeof mountPanel>, label: string) {
  return wrapper.findAll('button').find((item) => item.text() === label);
}

describe('DocumentRevisionPanel — US-005 / TEST-019', () => {
  it('offers no forward action while the scanner has not cleared the revision', () => {
    for (const scanStatus of ['QUARANTINED', 'SCANNING', 'INFECTED', 'UNAVAILABLE'] as const) {
      const wrapper = mountPanel({ revisions: [revision({ scanStatus })] });
      expect(action(wrapper, 'Trình duyệt')).toBeUndefined();
      expect(wrapper.text()).toContain('Bị chặn cho tới khi quét sạch');
      expect(wrapper.get('tbody tr').attributes('data-scan')).toBe(scanStatus);
    }
  });

  it('sends the review with the version the operator was shown', async () => {
    const wrapper = mountPanel();
    await action(wrapper, 'Trình duyệt')!.trigger('click');
    await wrapper.get('textarea').setValue('Trình duyệt vòng 1');
    await wrapper.get('.document-action-form').trigger('submit');
    expect(wrapper.emitted('submit-review')?.[0]).toEqual([
      'revision-1', { expectedVersion: 2, note: 'Trình duyệt vòng 1' }
    ]);
  });

  it('keeps approve and issue behind their own permissions', () => {
    const reviewer = mountPanel({
      revisions: [revision({ status: 'IN_REVIEW' })],
      permissions: { ...allPermissions, approve: false, issue: false }
    });
    expect(action(reviewer, 'Phê duyệt')).toBeUndefined();
    expect(action(reviewer, 'Ghi ý kiến review')).toBeDefined();

    const approver = mountPanel({ revisions: [revision({ status: 'IN_REVIEW' })] });
    expect(action(approver, 'Phê duyệt')).toBeDefined();
  });

  it('only offers issue on an approved revision', () => {
    expect(action(mountPanel({ revisions: [revision({ status: 'APPROVED' })] }), 'Phát hành')).toBeDefined();
    expect(action(mountPanel({ revisions: [revision({ status: 'IN_REVIEW' })] }), 'Phát hành')).toBeUndefined();
  });

  it('emits a review comment with its severity', async () => {
    const wrapper = mountPanel({ revisions: [revision({ status: 'IN_REVIEW' })] });
    await action(wrapper, 'Ghi ý kiến review')!.trigger('click');
    await wrapper.get('select').setValue('CRITICAL');
    await wrapper.get('textarea').setValue('Thiếu ghi chú tải');
    await wrapper.get('.document-action-form').trigger('submit');
    expect(wrapper.emitted('comment')?.[0]).toEqual([
      'revision-1', { severity: 'CRITICAL', body: 'Thiếu ghi chú tải' }
    ]);
  });

  it('labels every select for the accessible-name based E2E suite', () => {
    const wrapper = mountPanel({ revisions: [revision({ status: 'IN_REVIEW' })] });
    return action(wrapper, 'Ghi ý kiến review')!.trigger('click').then(() => {
      for (const select of wrapper.findAll('select')) {
        expect(select.attributes('aria-label')).toBeTruthy();
      }
    });
  });

  it('states plainly when no revision has been issued yet', () => {
    expect(mountPanel().text()).toContain('Chưa phát hành revision nào');
  });
});
