import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ApproveRevisionRequest, CreateDocumentRequest, CreateReviewCommentRequest,
  CreateUploadSessionRequest, DocumentCommandResponse, DocumentDetailQuery,
  DocumentDetailResponse, DocumentListQuery, DocumentListResponse,
  FinalizeUploadSessionRequest, FinalizeUploadSessionResponse, IssueRevisionRequest,
  IssueRevisionResponse, RevisionCommandResponse, RevisionDetailResponse,
  ReviewCommentResponse, SubmitRevisionReviewRequest, UploadSessionResponse
} from '@/types/document.types';

/** Every document command is a POST and every one of them requires an Idempotency-Key. */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method: 'POST', auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const documentApi = {
  /**
   * API-039 — project document register.
   *
   * Every row already carries `currentRevision` and `latestRevision`, so the register never fans out
   * over API-044 to learn a revision code, status or scan verdict.
   */
  listDocuments(
    auth: ApiAuthContext, projectId: string, query: DocumentListQuery = {}
  ): Promise<DocumentListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/documents`, query), {
      method: 'GET', auth
    });
  },

  /** API-040 — register a logical document; its bytes arrive later as revisions. */
  createDocument(
    auth: ApiAuthContext, projectId: string, input: CreateDocumentRequest, key: string
  ): Promise<DocumentCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/documents`, input, key);
  },

  /** API-041 — register entry, current-for-use revision and the paged revision history. */
  getDocument(
    auth: ApiAuthContext, documentId: string, query: DocumentDetailQuery = {}
  ): Promise<DocumentDetailResponse> {
    return httpClient.request(withQuery(`/v1/documents/${documentId}`, query), {
      method: 'GET', auth
    });
  },

  /** API-042 — open an upload session; the response id is the revision that owns the bytes. */
  createUploadSession(
    auth: ApiAuthContext, documentId: string, input: CreateUploadSessionRequest, key: string
  ): Promise<UploadSessionResponse> {
    return command(auth, `/v1/documents/${documentId}/upload-sessions`, input, key);
  },

  /**
   * API-043 — hash, scan and release. A CLEAN or INFECTED verdict comes back as 200; a scanner
   * outage comes back as 503 `SCANNER_UNAVAILABLE` and a retry needs a fresh Idempotency-Key.
   */
  finalizeUploadSession(
    auth: ApiAuthContext, uploadSessionId: string,
    input: FinalizeUploadSessionRequest, key: string
  ): Promise<FinalizeUploadSessionResponse> {
    return command(auth, `/v1/upload-sessions/${uploadSessionId}:finalize`, input, key);
  },

  /** API-044 — revision metadata, scan state and hash. */
  getRevision(auth: ApiAuthContext, revisionId: string): Promise<RevisionDetailResponse> {
    return httpClient.request(`/v1/document-revisions/${revisionId}`, { method: 'GET', auth });
  },

  /** API-045 — open a review cycle. */
  submitReview(
    auth: ApiAuthContext, revisionId: string, input: SubmitRevisionReviewRequest, key: string
  ): Promise<RevisionCommandResponse> {
    return command(auth, `/v1/document-revisions/${revisionId}:submit-review`, input, key);
  },

  /** API-046 — append a review comment; the history is never rewritten. */
  createReviewComment(
    auth: ApiAuthContext, revisionId: string, input: CreateReviewCommentRequest, key: string
  ): Promise<ReviewCommentResponse> {
    return command(auth, `/v1/document-revisions/${revisionId}/comments`, input, key);
  },

  /** API-047 — approve; the server refuses anything the scanner has not cleared. */
  approveRevision(
    auth: ApiAuthContext, revisionId: string, input: ApproveRevisionRequest, key: string
  ): Promise<RevisionCommandResponse> {
    return command(auth, `/v1/document-revisions/${revisionId}:approve`, input, key);
  },

  /** API-048 — issue; the outgoing revision is superseded in the same transaction. */
  issueRevision(
    auth: ApiAuthContext, revisionId: string, input: IssueRevisionRequest, key: string
  ): Promise<IssueRevisionResponse> {
    return command(auth, `/v1/document-revisions/${revisionId}:issue`, input, key);
  }
};
