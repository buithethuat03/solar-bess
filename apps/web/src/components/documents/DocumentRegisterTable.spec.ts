import { mount } from '@vue/test-utils';
import DocumentRegisterTable from './DocumentRegisterTable.vue';
import type {
  DocumentRegisterRevisionView, DocumentRegisterRow, DocumentScanStatus
} from '@/types/document.types';

const buttonStub = {
  props: ['loading', 'type', 'text'], emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
};

function revision(
  overrides: Partial<DocumentRegisterRevisionView> = {}
): DocumentRegisterRevisionView {
  return {
    id: 'revision-1', revisionCode: 'A', workingVersion: 1, status: 'ISSUED',
    scanStatus: 'CLEAN', ...overrides
  };
}

function row(overrides: Partial<DocumentRegisterRow> = {}): DocumentRegisterRow {
  return {
    id: 'document-1', projectId: 'project-1', packageId: null, documentCode: 'SLD-001',
    title: 'Sơ đồ đơn tuyến', discipline: 'ELECTRICAL', type: 'DRAWING',
    classification: 'INTERNAL', ownerId: 'owner-1', currentRevisionId: 'revision-1',
    legalHold: false, status: 'ACTIVE', versionNo: 1, createdBy: 'owner-1',
    updatedBy: 'owner-1', createdAt: '2026-07-26T10:00:00.000Z',
    updatedAt: '2026-07-26T10:00:00.000Z',
    currentRevision: revision(), latestRevision: revision(), ...overrides
  };
}

function mountTable(overrides: Record<string, unknown> = {}) {
  return mount(DocumentRegisterTable, {
    props: {
      rows: [row()], nextCursor: null, loadingMore: false, selectedId: null, ...overrides
    },
    global: { stubs: { ElButton: buttonStub } }
  });
}

describe('DocumentRegisterTable — US-005 / TEST-018…019', () => {
  it('renders the register columns straight from the embedded row, issuing no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const text = mountTable().text();
    for (const value of ['SLD-001', 'Sơ đồ đơn tuyến', 'ELECTRICAL', 'DRAWING', 'Nội bộ', 'A']) {
      expect(text).toContain(value);
    }
    expect(text).toContain('Đã phát hành');
    // API-039 embeds the revision summaries; the old per-row API-044 fan-out is gone for good.
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it.each([
    ['CLEAN', 'Đã quét sạch', ''],
    ['SCANNING', 'Đang quét', 'Đang chờ kết quả quét, chưa dùng được.'],
    ['QUARANTINED', 'Đang cách ly', 'Tệp còn trong quarantine, chưa dùng được.'],
    ['INFECTED', 'Nhiễm mã độc', 'Tệp đã bị hủy, revision không dùng được.'],
    ['UNAVAILABLE', 'Chưa quét được', 'Trình quét không phản hồi, tệp vẫn bị giữ.']
  ] as Array<[DocumentScanStatus, string, string]>)(
    'renders %s as its own chip with a semantic marker',
    (scanStatus, label, hint) => {
      const wrapper = mountTable({ rows: [row({ currentRevision: revision({ scanStatus }) })] });
      const chip = wrapper.get('.scan-chip');
      expect(chip.text()).toContain(label);
      expect(chip.attributes('data-scan')).toBe(scanStatus);
      // The chip, not just the row, has to say whether the revision is usable.
      expect(chip.attributes('data-blocked')).toBe(String(scanStatus !== 'CLEAN'));
      expect(wrapper.get('tbody tr').attributes('data-scan')).toBe(scanStatus);
      if (hint) expect(wrapper.text()).toContain(hint);
    }
  );

  it('never lets a non-clean revision borrow the clean styling', () => {
    const wrapper = mountTable({
      rows: [
        row({ currentRevision: revision({ id: 'revision-clean', scanStatus: 'CLEAN' }) }),
        row({
          id: 'document-2', documentCode: 'SLD-002',
          currentRevision: revision({ id: 'revision-bad', scanStatus: 'INFECTED' })
        })
      ]
    });
    const chips = wrapper.findAll('.scan-chip');
    expect(chips.map((chip) => chip.attributes('data-scan'))).toEqual(['CLEAN', 'INFECTED']);
    expect(chips.map((chip) => chip.attributes('data-blocked'))).toEqual(['false', 'true']);
  });

  /**
   * The half of the defect that mattered most: `currentRevisionId` is only written on ISSUE, so a
   * document whose single upload came back INFECTED has no current revision at all. Reading only
   * `currentRevision` would show the operator a blank cell instead of an infection.
   */
  it('surfaces an infected upload that was never issued, through latestRevision', () => {
    const wrapper = mountTable({
      rows: [row({
        currentRevisionId: null, currentRevision: null,
        latestRevision: revision({ id: 'revision-bad', status: 'DRAFT', scanStatus: 'INFECTED' })
      })]
    });
    const chip = wrapper.get('.scan-chip');
    expect(chip.attributes('data-scan')).toBe('INFECTED');
    expect(chip.attributes('data-blocked')).toBe('true');
    expect(chip.text()).toContain('Nhiễm mã độc');
    expect(wrapper.get('tbody tr').attributes('data-scan')).toBe('INFECTED');
    // Still readable as "not issued yet", so nobody mistakes it for the current-for-use revision.
    expect(wrapper.text()).toContain('chưa phát hành');
    expect(wrapper.text()).toContain('Nháp');
  });

  it('separates "chưa phát hành" from "chưa có revision nào"', () => {
    const unissued = mountTable({
      rows: [row({
        currentRevisionId: null, currentRevision: null,
        latestRevision: revision({ status: 'DRAFT', scanStatus: 'QUARANTINED' })
      })]
    });
    expect(unissued.text()).toContain('chưa phát hành');

    const empty = mountTable({
      rows: [row({ currentRevisionId: null, currentRevision: null, latestRevision: null })]
    });
    expect(empty.text()).toContain('Chưa có revision nào');
    expect(empty.text()).toContain('Chưa có kết quả quét');
    expect(empty.get('tbody tr').attributes('data-scan')).toBe('NONE');
    expect(empty.find('.scan-chip').exists()).toBe(false);
  });

  it('emits open with the document id', async () => {
    const wrapper = mountTable();
    await wrapper.get('tbody button').trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['document-1']);
  });

  it('offers cursor pagination only when the server returned a cursor', async () => {
    expect(mountTable().findAll('button').some((item) => item.text() === 'Tải thêm tài liệu')).toBe(false);
    const paged = mountTable({ nextCursor: 'opaque' });
    await paged.findAll('button').find((item) => item.text() === 'Tải thêm tài liệu')!.trigger('click');
    expect(paged.emitted('more')).toHaveLength(1);
  });

  it('distinguishes an empty authorized register from hidden documents', () => {
    const wrapper = mountTable({ rows: [] });
    expect(wrapper.text()).toContain('Không có tài liệu phù hợp');
    expect(wrapper.text()).toContain('không suy ra thành số đếm bằng không');
  });
});
