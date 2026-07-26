export enum DocumentClassification {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  RESTRICTED = 'RESTRICTED'
}

export enum DocumentRecordStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  ARCHIVED = 'ARCHIVED'
}

/**
 * FR-027/FR-029 lifecycle. A revision is only reachable for use once ISSUED; SUPERSEDED keeps the
 * bytes but must be watermarked by any reader.
 */
export enum DocumentRevisionStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  ISSUED = 'ISSUED',
  SUPERSEDED = 'SUPERSEDED',
  REJECTED = 'REJECTED'
}

/**
 * Bytes start QUARANTINED. `UNAVAILABLE` is a distinct state from `INFECTED`: a scanner outage must
 * hold the revision, never release it and never mark it clean.
 */
export enum DocumentScanStatus {
  QUARANTINED = 'QUARANTINED',
  SCANNING = 'SCANNING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  UNAVAILABLE = 'UNAVAILABLE'
}

export enum DocumentLockState {
  UNLOCKED = 'UNLOCKED',
  /** Set the moment a revision is ISSUED; the bytes and metadata become immutable. */
  LOCKED = 'LOCKED',
  LEGAL_HOLD = 'LEGAL_HOLD'
}

export enum ReviewCommentSeverity {
  INFO = 'INFO',
  MINOR = 'MINOR',
  MAJOR = 'MAJOR',
  CRITICAL = 'CRITICAL'
}

export enum ReviewCommentDisposition {
  OPEN = 'OPEN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED'
}

export enum TransmittalStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CLOSED = 'CLOSED'
}

export enum TransmittalResponseStatus {
  PENDING = 'PENDING',
  RESPONDED = 'RESPONDED',
  OVERDUE = 'OVERDUE'
}

export enum SignatureEnvelopeStatus {
  /** Created locally; no external provider has been contacted. */
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  COMPLETED = 'COMPLETED',
  DECLINED = 'DECLINED',
  VOIDED = 'VOIDED'
}

export enum ExternalShareStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED'
}

export interface DocumentRecipientSnapshot {
  partyId: string | null;
  organisation: string;
  contactName: string;
  contactEmail: string;
}

export interface SignerSnapshotRecord {
  name: string;
  email: string;
  order: number;
  role: string;
}
