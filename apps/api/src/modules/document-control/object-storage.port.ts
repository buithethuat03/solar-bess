export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObjectRef {
  bucket: string;
  objectKey: string;
}

export interface PutResult extends StoredObjectRef {
  /** SHA-256 of the bytes the server actually stored, never a client-supplied value. */
  sha256: string;
  sizeBytes: number;
  contentType: string;
}

/**
 * ADR-005 boundary. Files live in object storage; metadata and ACL stay relational. The interface is
 * intentionally S3-shaped but names nothing vendor specific, so the MinIO adapter can be replaced
 * without touching the service.
 *
 * Uploads land in the quarantine bucket first and are only copied to the release bucket after a
 * clean scan, so an unscanned byte is never reachable through a released object key.
 */
export interface ObjectStorage {
  /** Bucket that holds bytes which have not yet passed a malware scan. */
  quarantineBucket(): string;
  /** Bucket that holds scanned, releasable bytes. */
  releaseBucket(): string;
  put(ref: StoredObjectRef, body: Buffer, contentType: string): Promise<PutResult>;
  get(ref: StoredObjectRef): Promise<Buffer>;
  /** Copy quarantine → release after a clean scan; returns the released reference. */
  promote(from: StoredObjectRef, to: StoredObjectRef): Promise<StoredObjectRef>;
  remove(ref: StoredObjectRef): Promise<void>;
  exists(ref: StoredObjectRef): Promise<boolean>;
}
