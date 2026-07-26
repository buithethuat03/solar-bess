import { documentApi } from './document.api';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };

function response(data: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' }
  });
}

describe('document API — API-039…048', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes only the register filters that were supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [], meta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await documentApi.listDocuments(auth, 'project-id');
    await documentApi.listDocuments(auth, 'project-id', {
      cursor: 'opaque', limit: 25, type: 'DRAWING', discipline: 'ELECTRICAL',
      classification: 'CONFIDENTIAL', packageId: 'package-id'
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/documents');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/v1/projects/project-id/documents?cursor=opaque&limit=25&type=DRAWING'
      + '&discipline=ELECTRICAL&classification=CONFIDENTIAL&packageId=package-id'
    );
  });

  it('sends the create-document body with tenant context and an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await documentApi.createDocument(auth, 'project-id', {
      documentCode: 'SLD-001', title: 'Sơ đồ đơn tuyến', discipline: 'ELECTRICAL',
      type: 'DRAWING', classification: 'INTERNAL', packageId: 'package-id'
    }, 'create-document-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/documents');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      documentCode: 'SLD-001', title: 'Sơ đồ đơn tuyến', discipline: 'ELECTRICAL',
      type: 'DRAWING', classification: 'INTERNAL', packageId: 'package-id'
    });
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('create-document-key');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
    expect(headers.get('Authorization')).toBe('Bearer access');
  });

  it('carries the base64 payload into the upload session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await documentApi.createUploadSession(auth, 'document-id', {
      revisionCode: 'A', purpose: 'Phát hành thi công', fileName: 'sld.pdf',
      mimeType: 'application/pdf', content: 'JVBERi0='
    }, 'upload-session-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/documents/document-id/upload-sessions');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      revisionCode: 'A', fileName: 'sld.pdf', content: 'JVBERi0='
    });
  });

  it('uses the colon-suffixed finalize path and forwards the declared hash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { scanVerdict: 'CLEAN', scanStatus: 'CLEAN' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await documentApi.finalizeUploadSession(auth, 'session-id', {
      contentHash: 'a'.repeat(64)
    }, 'finalize-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/upload-sessions/session-id:finalize');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ contentHash: 'a'.repeat(64) });
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('finalize-key');
    expect(result.data.scanVerdict).toBe('CLEAN');
  });

  it('surfaces a scanner outage as a retryable error instead of a clean finalize', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'SCANNER_UNAVAILABLE',
      message: 'Không liên hệ được trình quét mã độc; tệp vẫn bị giữ trong quarantine',
      retryable: true
    }, 503)));

    await expect(documentApi.finalizeUploadSession(auth, 'session-id', {}, 'outage-key'))
      .rejects.toMatchObject({ status: 503, code: 'SCANNER_UNAVAILABLE', retryable: true });
  });

  it('refuses to hide an unscanned revision behind a successful approve', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      code: 'REVISION_NOT_SCANNED',
      message: 'Revision chưa được quét sạch nên không thể sử dụng', retryable: false
    }, 422)));

    await expect(documentApi.approveRevision(auth, 'revision-id', {
      expectedVersion: 2, comment: 'Đồng ý'
    }, 'approve-key')).rejects.toMatchObject({
      status: 422, code: 'REVISION_NOT_SCANNED'
    });
  });

  it('sends review, comment and issue commands to their own paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await documentApi.submitReview(auth, 'revision-id', {
      expectedVersion: 1, note: 'Trình duyệt vòng 1'
    }, 'submit-review-key');
    await documentApi.createReviewComment(auth, 'revision-id', {
      severity: 'MAJOR', body: 'Thiếu ghi chú tải', location: 'Sheet 2'
    }, 'comment-key');
    await documentApi.issueRevision(auth, 'revision-id', {
      expectedVersion: 3, comment: 'Phát hành thi công'
    }, 'issue-key');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/document-revisions/revision-id:submit-review',
      '/v1/document-revisions/revision-id/comments',
      '/v1/document-revisions/revision-id:issue'
    ]);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('Idempotency-Key')).toMatch(/.{8,200}/);
    }
  });

  it('reads one revision without sending a command header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {}, document: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await documentApi.getRevision(auth, 'revision-id');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/document-revisions/revision-id');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeNull();
  });
});
