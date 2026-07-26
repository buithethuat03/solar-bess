import type {
  DocumentClassification, DocumentRevisionStatus, DocumentScanStatus
} from '@/types/document.types';

/**
 * Mirrors `MAX_UPLOAD_BASE64_LENGTH` in the API upload DTO. Checking it in the browser turns a
 * 400 on a multi-megabyte request into an instant local message.
 */
export const MAX_UPLOAD_BASE64_LENGTH = 8_000_000;

/** API-042 bounds: `^[A-Z0-9][A-Z0-9_.-]{0,39}$`. */
export const REVISION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{0,39}$/;

/** API-040 bounds: `^[A-Z0-9][A-Z0-9_./-]{1,79}$`. */
export const DOCUMENT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_./-]{1,79}$/;

export const DOCUMENT_CLASSIFICATIONS: readonly DocumentClassification[] = [
  'PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'
];

export const CLASSIFICATION_LABEL: Record<DocumentClassification, string> = {
  PUBLIC: 'Công khai',
  INTERNAL: 'Nội bộ',
  CONFIDENTIAL: 'Bảo mật',
  RESTRICTED: 'Hạn chế'
};

export const REVISION_STATUS_LABEL: Record<DocumentRevisionStatus, string> = {
  DRAFT: 'Nháp',
  IN_REVIEW: 'Đang review',
  APPROVED: 'Đã phê duyệt',
  ISSUED: 'Đã phát hành',
  SUPERSEDED: 'Đã thay thế',
  REJECTED: 'Bị từ chối'
};

/**
 * Scan vocabulary. The three non-clean outcomes are named separately on purpose: an operator must be
 * able to tell "chưa quét xong" from "nhiễm mã độc" from "trình quét chết" without opening anything.
 */
export const SCAN_STATUS_LABEL: Record<DocumentScanStatus, string> = {
  QUARANTINED: 'Đang cách ly',
  SCANNING: 'Đang quét',
  CLEAN: 'Đã quét sạch',
  INFECTED: 'Nhiễm mã độc',
  UNAVAILABLE: 'Chưa quét được'
};

export const SCAN_STATUS_GLYPH: Record<DocumentScanStatus, string> = {
  QUARANTINED: '⏳',
  SCANNING: '⏳',
  CLEAN: '✓',
  INFECTED: '⛔',
  UNAVAILABLE: '⚠'
};

/** Why the revision cannot be used yet; empty for CLEAN. */
export const SCAN_STATUS_HINT: Record<DocumentScanStatus, string> = {
  QUARANTINED: 'Tệp còn trong quarantine, chưa dùng được.',
  SCANNING: 'Đang chờ kết quả quét, chưa dùng được.',
  CLEAN: '',
  INFECTED: 'Tệp đã bị hủy, revision không dùng được.',
  UNAVAILABLE: 'Trình quét không phản hồi, tệp vẫn bị giữ.'
};
