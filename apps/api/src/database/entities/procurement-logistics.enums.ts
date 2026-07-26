/** FR-061 supplier qualification lifecycle (DB-044). Profiles expire; they are never hard-deleted. */
export enum SupplierQualificationStatus {
  PENDING = 'PENDING',
  QUALIFIED = 'QUALIFIED',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED'
}

/**
 * FR-062 requisition lifecycle (DB-045). V1 writes DRAFT on create only: the check/approval walk
 * (TECHNICAL_CHECK…SOURCING) rides the US-015 workflow engine later — recorded deferral.
 */
export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  TECHNICAL_CHECK = 'TECHNICAL_CHECK',
  COST_CHECK = 'COST_CHECK',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  RETURNED = 'RETURNED',
  REJECTED = 'REJECTED',
  SOURCING = 'SOURCING'
}

/**
 * FR-063/FR-066 RFQ lifecycle (DB-046). API-078 creates ISSUED directly — the catalog has no draft
 * endpoint. Bid-window guards compare now() vs due_date lazily; no scheduler flips BID_OPEN/CLOSED.
 */
export enum RfqStatus {
  RFQ_DRAFT = 'RFQ_DRAFT',
  ISSUED = 'ISSUED',
  BID_OPEN = 'BID_OPEN',
  CLOSED = 'CLOSED',
  TECHNICAL_EVALUATION = 'TECHNICAL_EVALUATION',
  COMMERCIAL_EVALUATION = 'COMMERCIAL_EVALUATION',
  AWARD_SUBMITTED = 'AWARD_SUBMITTED',
  AWARD_APPROVED = 'AWARD_APPROVED',
  REJECTED = 'REJECTED'
}

/**
 * The RFQ states in which sealed-bid commercial fields (total, currency, payload_ref) may be
 * serialized: everything from CLOSED onward. Before that the fields are omitted from every
 * response — sealing is a serialization-level ACL, not just a column.
 */
export const RFQ_BID_VISIBLE_STATUSES: readonly RfqStatus[] = [
  RfqStatus.CLOSED, RfqStatus.TECHNICAL_EVALUATION, RfqStatus.COMMERCIAL_EVALUATION,
  RfqStatus.AWARD_SUBMITTED, RfqStatus.AWARD_APPROVED, RfqStatus.REJECTED
];

/** DB-047 sealed-bid state. Rows exist only via the internal fixture path while API-079 is deferred. */
export enum BidSealedStatus {
  SEALED = 'SEALED',
  OPENED = 'OPENED'
}

/** FR-065 evaluation axis (DB-048). */
export enum EvaluationType {
  TECHNICAL = 'TECHNICAL',
  COMMERCIAL = 'COMMERCIAL'
}

/** FR-067 purchase order lifecycle (DB-049). API-082 creates ISSUED directly in V1. */
export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  ISSUED = 'ISSUED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  AMENDED = 'AMENDED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED'
}

/** FR-069/FR-070 shipment lifecycle (DB-051); derived monotonically from its milestones. */
export enum ShipmentStatus {
  PLANNED = 'PLANNED',
  BOOKED = 'BOOKED',
  IN_TRANSIT = 'IN_TRANSIT',
  CUSTOMS = 'CUSTOMS',
  DELIVERED = 'DELIVERED',
  EXCEPTION = 'EXCEPTION',
  CLOSED = 'CLOSED'
}

/**
 * Milestone allowlist for the shipment_milestones aggregate child of DB-051 (it carries no own
 * DB id — recorded). Ranked types drive the monotonic status derivation; EXCEPTION is unranked
 * and may be reported at any point before closure.
 */
export enum ShipmentMilestoneType {
  BOOKED = 'BOOKED',
  DEPARTED = 'DEPARTED',
  ARRIVED = 'ARRIVED',
  CUSTOMS_CLEARED = 'CUSTOMS_CLEARED',
  DELIVERED = 'DELIVERED',
  EXCEPTION = 'EXCEPTION'
}

export enum ShipmentMilestoneSource {
  MANUAL = 'MANUAL',
  CARRIER = 'CARRIER'
}

/** FR-071 receipt condition (DB-052); anything but GOOD quarantines the receipt. */
export enum GoodsReceiptCondition {
  GOOD = 'GOOD',
  DAMAGED = 'DAMAGED',
  SHORTAGE = 'SHORTAGE',
  WRONG_ITEM = 'WRONG_ITEM'
}

export enum GoodsReceiptStatus {
  RECEIVING = 'RECEIVING',
  ACCEPTED = 'ACCEPTED',
  PARTIAL = 'PARTIAL',
  QUARANTINED = 'QUARANTINED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED'
}

/** DB-053 append-only inventory ledger movement types. */
export enum InventoryTransactionType {
  RECEIPT = 'RECEIPT',
  ISSUE = 'ISSUE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  QUARANTINE_IN = 'QUARANTINE_IN',
  QUARANTINE_RELEASE = 'QUARANTINE_RELEASE'
}
