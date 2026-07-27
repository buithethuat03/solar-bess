/**
 * Procurement & Logistics (API-076…API-085, API-079 deferred) wire types.
 *
 * MONEY AND QUANTITIES ARE TEXT. Every `quantity`, `unitPrice`, `totalValue` and `normalizedTotal`
 * below is a `string` because the API hands Postgres `numeric` through untouched. Nothing in the
 * web app may run such a value through `Number()`, `parseFloat` or JS arithmetic — display may
 * group digits, and the only arithmetic allowed is the exact BigInt reference sum in
 * `@/constants/procurement`, which is explicitly a hint while Postgres stays the arbiter.
 */

/** FR-061 (DB-044). Profiles expire — they are never deleted, so EXPIRED must stay renderable. */
export type SupplierQualificationStatus = 'PENDING' | 'QUALIFIED' | 'SUSPENDED' | 'EXPIRED';

/** FR-062 (DB-045). API-077 only ever writes DRAFT; the rest is the deferred workflow walk. */
export type RequisitionStatus =
  'DRAFT' | 'TECHNICAL_CHECK' | 'COST_CHECK' | 'SUBMITTED' | 'APPROVED'
  | 'RETURNED' | 'REJECTED' | 'SOURCING';

/** FR-063/FR-066 (DB-046). API-078 issues straight to ISSUED; there is no draft endpoint. */
export type RfqStatus =
  'RFQ_DRAFT' | 'ISSUED' | 'BID_OPEN' | 'CLOSED' | 'TECHNICAL_EVALUATION'
  | 'COMMERCIAL_EVALUATION' | 'AWARD_SUBMITTED' | 'AWARD_APPROVED' | 'REJECTED';

/**
 * The RFQ states from which the API is allowed to serialize a bid's commercial fields. Mirrors
 * `RFQ_BID_VISIBLE_STATUSES` on the server; the UI uses it only to explain WHY a bid reads sealed,
 * never to decide it — the absence of the keys themselves is the decision.
 */
export const RFQ_BID_VISIBLE_STATUSES: readonly RfqStatus[] = [
  'CLOSED', 'TECHNICAL_EVALUATION', 'COMMERCIAL_EVALUATION',
  'AWARD_SUBMITTED', 'AWARD_APPROVED', 'REJECTED'
];

export type BidSealedStatus = 'SEALED' | 'OPENED';
export type EvaluationType = 'TECHNICAL' | 'COMMERCIAL';

export type PurchaseOrderStatus =
  'DRAFT' | 'REVIEW' | 'SUBMITTED' | 'APPROVED' | 'ISSUED'
  | 'ACKNOWLEDGED' | 'AMENDED' | 'CLOSED' | 'CANCELLED';

export type ShipmentStatus =
  'PLANNED' | 'BOOKED' | 'IN_TRANSIT' | 'CUSTOMS' | 'DELIVERED' | 'EXCEPTION' | 'CLOSED';

export type ShipmentMilestoneType =
  'BOOKED' | 'DEPARTED' | 'ARRIVED' | 'CUSTOMS_CLEARED' | 'DELIVERED' | 'EXCEPTION';

export type ShipmentMilestoneSource = 'MANUAL' | 'CARRIER';

export type GoodsReceiptCondition = 'GOOD' | 'DAMAGED' | 'SHORTAGE' | 'WRONG_ITEM';

export type GoodsReceiptStatus =
  'RECEIVING' | 'ACCEPTED' | 'PARTIAL' | 'QUARANTINED' | 'REJECTED' | 'CLOSED';

export type InventoryTransactionType =
  'RECEIPT' | 'ISSUE' | 'RETURN' | 'ADJUSTMENT' | 'QUARANTINE_IN' | 'QUARANTINE_RELEASE';

export interface SupplierView {
  id: string;
  companyId: string;
  legalEntityId: string | null;
  category: string;
  qualificationStatus: SupplierQualificationStatus;
  validFrom: string | null;
  /** ISO date or null (open-ended). A past `validTo` disqualifies whatever the status says. */
  validTo: string | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequisitionView {
  id: string;
  projectId: string;
  packageId: string;
  wbsId: string | null;
  costCodeId: string;
  number: string;
  title: string;
  description: string | null;
  needByDate: string;
  status: RequisitionStatus;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RfqView {
  id: string;
  requisitionId: string;
  projectId: string;
  number: string;
  revision: number;
  dueDate: string;
  invitedSupplierIds: string[];
  status: RfqStatus;
  awardedBidId: string | null;
  awardSubmittedBy: string | null;
  awardSubmittedAt: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A sealed bid as the API serializes it.
 *
 * `total`, `currency` and `payloadRef` are OPTIONAL, not nullable: while the parent RFQ is before
 * CLOSED the server omits the keys entirely. The UI must therefore branch on key presence
 * (`'total' in bid`), never on a falsy value — a missing price is "Niêm phong", and rendering it
 * as `—`, `0` or `undefined` would be a leak of a different kind: a claim about a number nobody
 * is allowed to see yet.
 */
export interface SealedBidView {
  id: string;
  rfqId: string;
  supplierProfileId: string;
  revision: number;
  sealedStatus: BidSealedStatus;
  submittedAt: string;
  createdAt: string;
  total?: string;
  currency?: string;
  payloadRef?: Record<string, unknown> | null;
}

export interface EvaluationView {
  id: string;
  bidId: string;
  evaluationType: EvaluationType;
  version: number;
  evaluatorId: string;
  normalizedTotal: string | null;
  currency: string | null;
  normalizationBasis: string | null;
  overrideReason: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

/** API-080 answers the evaluation together with the bid it was recorded against. */
export interface EvaluationWithBidView extends EvaluationView {
  bid: SealedBidView;
}

export interface PurchaseOrderView {
  id: string;
  projectId: string;
  supplierProfileId: string;
  awardedRfqId: string | null;
  poNo: string;
  revision: number;
  title: string;
  status: PurchaseOrderStatus;
  totalValue: string;
  currency: string;
  issuedAt: string | null;
  approvedBy: string;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLineView {
  id: string;
  purchaseOrderId: string;
  lineNo: number;
  description: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  currency: string;
  requisitionId: string | null;
  bomLineId: string | null;
  createdAt: string;
}

export interface PurchaseOrderWithLinesView extends PurchaseOrderView {
  lines: PurchaseOrderLineView[];
  commitmentId: string;
}

export interface ShipmentView {
  id: string;
  purchaseOrderId: string;
  /** Frozen at insert by trigger — slippage is measured against it, so it never changes. */
  committedDate: string;
  etd: string | null;
  eta: string | null;
  actualDeliveryDate: string | null;
  carrier: string | null;
  trackingNo: string | null;
  status: ShipmentStatus;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentMilestoneView {
  id: string;
  shipmentId: string;
  milestoneType: ShipmentMilestoneType;
  eventTime: string;
  source: ShipmentMilestoneSource;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ShipmentMilestoneWithShipmentView extends ShipmentMilestoneView {
  shipment: ShipmentView;
}

export interface GoodsReceiptView {
  id: string;
  projectId: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  shipmentId: string | null;
  siteId: string;
  receiptNo: string;
  quantity: string;
  condition: GoodsReceiptCondition;
  status: GoodsReceiptStatus;
  notes: string | null;
  versionNo: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransactionView {
  id: string;
  projectId: string;
  siteId: string;
  purchaseOrderLineId: string;
  goodsReceiptId: string;
  transactionType: InventoryTransactionType;
  quantity: string;
  uom: string;
  sourceKey: string;
  createdAt: string;
}

export interface SerialNumberView {
  id: string;
  goodsReceiptId: string;
  equipmentModelId: string;
  serialNo: string;
  normalizedSerial: string;
  createdAt: string;
}

export interface GoodsReceiptWithLedgerView extends GoodsReceiptView {
  inventoryTransactions: InventoryTransactionView[];
  serials: SerialNumberView[];
}

export interface ProcurementPageMeta {
  nextCursor: string | null;
  limit: number;
}

export interface SupplierListQuery {
  cursor?: string;
  limit?: number;
  category?: string;
  qualificationStatus?: SupplierQualificationStatus;
}

export interface CreateRequisitionRequest {
  number: string;
  title: string;
  description?: string;
  packageId: string;
  wbsId?: string;
  costCodeId: string;
  needByDate: string;
}

export interface CreateRfqRequest {
  number: string;
  revision?: number;
  dueDate: string;
  /** Every id must be a QUALIFIED supplier whose `validTo` is not in the past. */
  invitedSupplierIds: string[];
}

export interface CreateEvaluationRequest {
  evaluationType: EvaluationType;
  normalizedTotal?: string;
  currency?: string;
  normalizationBasis?: string;
  overrideReason?: string;
  notes?: string;
}

export interface SubmitAwardRequest {
  awardedBidId: string;
  reason?: string;
}

export interface PurchaseOrderLineInput {
  lineNo: number;
  description: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  requisitionId?: string;
  bomLineId?: string;
}

export interface CreatePurchaseOrderRequest {
  poNo: string;
  revision?: number;
  title: string;
  supplierProfileId: string;
  awardedRfqId?: string;
  /** Must equal the SQL `SUM(quantity * unit_price)` of the lines — Postgres is the arbiter. */
  totalValue: string;
  currency: string;
  /** SoD: must differ from the caller (`ck_purchase_order_sod`). */
  approvedBy: string;
  costCodeId: string;
  lines: PurchaseOrderLineInput[];
}

export interface CreateShipmentRequest {
  committedDate: string;
  etd?: string;
  eta?: string;
  carrier?: string;
  trackingNo?: string;
}

export interface CreateShipmentMilestoneRequest {
  milestoneType: ShipmentMilestoneType;
  eventTime: string;
  source: ShipmentMilestoneSource;
  notes?: string;
  eta?: string;
}

export interface SerialInput {
  serialNo: string;
  equipmentModelId: string;
}

export interface CreateGoodsReceiptRequest {
  purchaseOrderLineId: string;
  shipmentId?: string;
  siteId: string;
  receiptNo: string;
  quantity: string;
  condition: GoodsReceiptCondition;
  notes?: string;
  serials?: SerialInput[];
}

export interface SupplierListResponse {
  data: SupplierView[];
  meta: ProcurementPageMeta;
  correlationId: string;
}

export interface RequisitionResponse { data: RequisitionView; correlationId: string }
export interface RfqResponse { data: RfqView; correlationId: string }
export interface EvaluationResponse { data: EvaluationWithBidView; correlationId: string }
export interface PurchaseOrderResponse {
  data: PurchaseOrderWithLinesView;
  correlationId: string;
}
export interface ShipmentResponse { data: ShipmentView; correlationId: string }
export interface ShipmentMilestoneResponse {
  data: ShipmentMilestoneWithShipmentView;
  correlationId: string;
}
export interface GoodsReceiptResponse {
  data: GoodsReceiptWithLedgerView;
  correlationId: string;
}
