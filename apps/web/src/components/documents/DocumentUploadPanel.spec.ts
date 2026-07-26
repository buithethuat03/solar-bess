import { mount } from '@vue/test-utils';
import DocumentUploadPanel from './DocumentUploadPanel.vue';
import type { DocumentRevisionView, UploadOutcome } from '@/types/document.types';

const buttonStub = {
  props: ['loading', 'type'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function revision(scanStatus: DocumentRevisionView['scanStatus']): DocumentRevisionView {
  return {
    id: 'revision-1', documentId: 'document-1', projectId: 'project-1', revisionCode: 'A',
    workingVersion: 1, status: 'DRAFT', purpose: 'Phát hành thi công', fileName: 'sld.pdf',
    mimeType: 'application/pdf', hasQuarantinedObject: scanStatus !== 'CLEAN',
    hasReleasedObject: scanStatus === 'CLEAN', contentHash: null, sizeBytes: null,
    scanStatus, scanSignature: scanStatus === 'INFECTED' ? 'Eicar-Test-Signature' : null,
    scannedAt: '2026-07-26T10:05:00.000Z', scannerVersion: 'clamav-1', lockState: 'UNLOCKED',
    reviewCycleNo: 0, approvedBy: null, approvedAt: null, issuedBy: null, issuedAt: null,
    uploadedBy: 'owner-1', versionNo: 2, createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:05:00.000Z'
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(DocumentUploadPanel, {
    props: {
      documentCode: 'SLD-001', busy: false, outcome: null, retryable: false, ...overrides
    },
    global: { stubs: { ElButton: buttonStub, ElAlert: true } }
  });
}

async function fill(
  wrapper: ReturnType<typeof mountPanel>,
  values: { revisionCode: string; purpose: string; file?: File }
): Promise<void> {
  const inputs = wrapper.findAll('input');
  await inputs[0].setValue(values.revisionCode);
  await inputs[1].setValue(values.purpose);
  if (values.file) {
    Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', {
      value: [values.file], configurable: true
    });
  }
  await wrapper.get('form').trigger('submit');
  await wrapper.vm.$nextTick();
}

describe('DocumentUploadPanel — US-005 / TEST-018', () => {
  it('emits the upload session payload with the file read as base64', async () => {
    const wrapper = mountPanel();
    await fill(wrapper, {
      revisionCode: 'A', purpose: 'Phát hành thi công',
      file: new File([new Uint8Array([72, 101, 108, 108, 111])], 'sld.pdf', {
        type: 'application/pdf'
      })
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(wrapper.emitted('upload')?.[0]?.[0]).toEqual({
      revisionCode: 'A', purpose: 'Phát hành thi công', fileName: 'sld.pdf',
      mimeType: 'application/pdf', content: 'SGVsbG8='
    });
  });

  it('refuses a revision code the API pattern would reject', async () => {
    const wrapper = mountPanel();
    await fill(wrapper, {
      revisionCode: 'rev a', purpose: 'Phát hành thi công',
      file: new File([new Uint8Array([1])], 'sld.pdf', { type: 'application/pdf' })
    });
    expect(wrapper.emitted('upload')).toBeUndefined();
  });

  it('refuses to send a file with no bytes to scan', async () => {
    const wrapper = mountPanel();
    await fill(wrapper, {
      revisionCode: 'A', purpose: 'Phát hành thi công',
      file: new File([], 'empty.pdf', { type: 'application/pdf' })
    });
    expect(wrapper.emitted('upload')).toBeUndefined();
  });

  it('reports a clean finalize as released', () => {
    const outcome: UploadOutcome = {
      verdict: 'CLEAN', revision: revision('CLEAN'), message: 'Đã quét sạch; revision được đưa sang release bucket.'
    };
    const wrapper = mountPanel({ outcome });
    expect(wrapper.get('.upload-outcome').attributes('data-verdict')).toBe('CLEAN');
    expect(wrapper.get('.scan-chip').attributes('data-blocked')).toBe('false');
    expect(wrapper.findAll('button').some((item) => item.text() === 'Quét lại')).toBe(false);
  });

  it('reports an infected finalize as a destroyed, unusable revision', () => {
    const outcome: UploadOutcome = {
      verdict: 'INFECTED', revision: revision('INFECTED'),
      message: 'Phát hiện mã độc: tệp trong quarantine đã bị hủy và revision này không dùng được.'
    };
    const wrapper = mountPanel({ outcome, retryable: true });
    expect(wrapper.get('.upload-outcome').attributes('data-verdict')).toBe('INFECTED');
    expect(wrapper.get('.scan-chip').attributes('data-scan')).toBe('INFECTED');
    expect(wrapper.text()).toContain('Eicar-Test-Signature');
    // An infected upload is terminal; retrying the scan would be theatre.
    expect(wrapper.findAll('button').some((item) => item.text() === 'Quét lại')).toBe(false);
  });

  it('reports a scanner outage as retryable and never as clean', async () => {
    const outcome: UploadOutcome = {
      verdict: 'UNAVAILABLE', revision: null,
      message: 'Không liên hệ được trình quét mã độc; tệp vẫn bị giữ trong quarantine'
    };
    const wrapper = mountPanel({ outcome, retryable: true });
    expect(wrapper.get('.upload-outcome').attributes('data-verdict')).toBe('UNAVAILABLE');
    expect(wrapper.text()).toContain('tệp vẫn bị giữ trong quarantine');

    await wrapper.findAll('button').find((item) => item.text() === 'Quét lại')!.trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('hides the retry once the session is no longer finalizable', () => {
    const wrapper = mountPanel({
      outcome: { verdict: 'UNAVAILABLE', revision: null, message: 'Trình quét không phản hồi' },
      retryable: false
    });
    expect(wrapper.findAll('button').some((item) => item.text() === 'Quét lại')).toBe(false);
  });
});
