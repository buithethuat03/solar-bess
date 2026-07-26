export type DocumentClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type DocumentRecordStatus = 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED';
export type DocumentRevisionStatus =
  'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ISSUED' | 'SUPERSEDED' | 'REJECTED';
/**
 * `UNAVAILABLE` is a scanner outage, not a clean verdict: the bytes stay quarantined. The UI must
 * never collapse it into `QUARANTINED` or into a usable state.
 */
export type DocumentScanStatus =
  'QUARANTINED' | 'SCANNING' | 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';
export type DocumentLockState = 'UNLOCKED' | 'LOCKED' | 'LEGAL_HOLD';
export type ReviewCommentSeverity = 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL';
export type ReviewCommentDisposition = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'CLOSED';
/** Only the finalize response carries a verdict; it is not persisted on the revision. */
export type DocumentScanVerdict = 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';

export interface DocumentView {
  id: string;
  projectId: string;
  packageId: string | null;
  documentCode: string;
  title: string;
  discipline: string;
  type: string;
  classification: DocumentClassification;
  ownerId: string;
  currentRevisionId: string | null;
  legalHold: boolean;
  status: DocumentRecordStatus;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRevisionView {
  id: string;
  documentId: string;
  projectId: string;
  revisionCode: string;
  workingVersion: number;
  status: DocumentRevisionStatus;
  purpose: string;
  fileName: string;
  mimeType: string;
  /** Object keys never leave the server; the client only learns which bucket holds the bytes. */
  hasQuarantinedObject: boolean;
  hasReleasedObject: boolean;
  contentHash: string | null;
  sizeBytes: number | null;
  scanStatus: DocumentScanStatus;
  scanSignature: string | null;
  scannedAt: string | null;
  scannerVersion: string | null;
  lockState: DocumentLockState;
  reviewCycleNo: number;
  approvedBy: string | null;
  approvedAt: string | null;
  issuedBy: string | null;
  issuedAt: string | null;
  uploadedBy: string;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadSessionView extends DocumentRevisionView {
  /** API-042 makes the revision row the session; the id is repeated for the finalize call. */
  uploadSessionId: string;
}

export interface FinalizedRevisionView extends DocumentRevisionView {
  scanVerdict: DocumentScanVerdict;
}

export interface IssuedRevisionView extends DocumentRevisionView {
  supersededRevisionId: string | null;
}

export interface DocumentReviewCommentView {
  id: string;
  revisionId: string;
  sequenceNo: number;
  cycleNo: number;
  authorId: string;
  location: string | null;
  severity: ReviewCommentSeverity;
  body: string;
  disposition: ReviewCommentDisposition;
  dispositionNote: string | null;
  createdAt: string;
}

export interface DocumentPageMeta {
  nextCursor: string | null;
  limit: number;
}

export interface DocumentListQuery {
  cursor?: string;
  limit?: number;
  type?: string;
  discipline?: string;
  classification?: DocumentClassification;
  packageId?: string;
}

export interface DocumentDetailQuery {
  cursor?: string;
  limit?: number;
}

export interface CreateDocumentRequest {
  documentCode: string;
  title: string;
  discipline: string;
  type: string;
  classification: DocumentClassification;
  packageId?: string;
  ownerId?: string;
}

export interface CreateUploadSessionRequest {
  revisionCode: string;
  purpose: string;
  fileName: string;
  mimeType: string;
  /** Base64 payload; the API caps it at 8_000_000 characters. */
  content: string;
}

export interface FinalizeUploadSessionRequest {
  contentHash?: string;
}

export interface SubmitRevisionReviewRequest {
  expectedVersion: number;
  note: string;
}

export interface ApproveRevisionRequest {
  expectedVersion: number;
  comment: string;
}

export interface IssueRevisionRequest {
  expectedVersion: number;
  comment: string;
}

export interface CreateReviewCommentRequest {
  severity: ReviewCommentSeverity;
  body: string;
  location?: string;
}

export interface DocumentListResponse {
  data: DocumentRegisterRow[];
  meta: DocumentPageMeta;
  correlationId: string;
}

export interface DocumentCommandResponse {
  data: DocumentView;
  correlationId: string;
}

export interface DocumentDetailResponse {
  data: DocumentView;
  currentRevision: DocumentRevisionView | null;
  revisions: DocumentRevisionView[];
  meta: DocumentPageMeta;
  correlationId: string;
}

export interface RevisionDetailResponse {
  data: DocumentRevisionView;
  document: DocumentView;
  correlationId: string;
}

export interface RevisionCommandResponse {
  data: DocumentRevisionView;
  correlationId: string;
}

export interface UploadSessionResponse {
  data: UploadSessionView;
  correlationId: string;
}

export interface FinalizeUploadSessionResponse {
  data: FinalizedRevisionView;
  correlationId: string;
}

export interface IssueRevisionResponse {
  data: IssuedRevisionView;
  correlationId: string;
}

export interface ReviewCommentResponse {
  data: DocumentReviewCommentView;
  correlationId: string;
}

/**
 * The compact revision summary API-039 embeds in every register row. It carries only what the
 * register table renders — no content hash, no object-key flags, no scanner diagnostics.
 */
export interface DocumentRegisterRevisionView {
  id: string;
  revisionCode: string;
  workingVersion: number;
  status: DocumentRevisionStatus;
  scanStatus: DocumentScanStatus;
}

/**
 * One row of the register, exactly as API-039 returns it. Both summaries come embedded, so the table
 * issues no per-row revision request.
 */
export interface DocumentRegisterRow extends DocumentView {
  /** The ISSUED revision `currentRevisionId` points at; null until the first issue. */
  currentRevision: DocumentRegisterRevisionView | null;
  /**
   * The newest revision by `(createdAt, id)` whatever its status. This is the only field that can
   * show an INFECTED or still-quarantined upload, because such a revision is never ISSUED and so is
   * never pointed at by `currentRevisionId`.
   */
  latestRevision: DocumentRegisterRevisionView | null;
}

/** What the two-step upload actually produced, including the 503 outage the API reports. */
export interface UploadOutcome {
  verdict: DocumentScanVerdict;
  revision: DocumentRevisionView | null;
  message: string;
}
