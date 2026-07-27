import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  CreateEvaluationRequest, CreateGoodsReceiptRequest, CreatePurchaseOrderRequest,
  CreateRequisitionRequest, CreateRfqRequest, CreateShipmentMilestoneRequest, CreateShipmentRequest,
  EvaluationResponse, GoodsReceiptResponse, PurchaseOrderResponse, RequisitionResponse, RfqResponse,
  ShipmentMilestoneResponse, ShipmentResponse, SubmitAwardRequest, SupplierListQuery,
  SupplierListResponse
} from '@/types/procurement.types';

/**
 * Procurement & Logistics transport (API-076…API-085).
 *
 * Every command carries an Idempotency-Key of 8–200 characters — the server answers 400
 * IDEMPOTENCY_KEY_REQUIRED without one. Quantities and money are strings and are serialized
 * verbatim; this module never converts, rounds or re-scales them.
 *
 * API-079 (supplier bid submission) is DEFERRED on the server — no external supplier identity
 * exists — so there is deliberately NO bid-submission function here, and no stub pretending to be
 * one. Bids reach the UI only as the embedded `bid` of an API-080 evaluation response.
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method: 'POST', auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const procurementApi = {
  /** API-076 — the tenant supplier/qualification register, filtered by category and status. */
  listSuppliers(
    auth: ApiAuthContext, query: SupplierListQuery = {}
  ): Promise<SupplierListResponse> {
    return httpClient.request(withQuery('/v1/suppliers', query), { method: 'GET', auth });
  },

  /** API-077 — requisition header, born DRAFT; the approval walk rides the workflow engine. */
  createRequisition(
    auth: ApiAuthContext, projectId: string, input: CreateRequisitionRequest, key: string
  ): Promise<RequisitionResponse> {
    return command(auth, `/v1/projects/${projectId}/requisitions`, input, key);
  },

  /**
   * API-078 — issues the RFQ directly. Every invited supplier must be QUALIFIED with a `validTo`
   * that is not in the past; the server decides that against CURRENT_DATE (422 SUPPLIER_INELIGIBLE).
   */
  createRfq(
    auth: ApiAuthContext, requisitionId: string, input: CreateRfqRequest, key: string
  ): Promise<RfqResponse> {
    return command(auth, `/v1/requisitions/${requisitionId}/rfqs`, input, key);
  },

  /**
   * API-080 — record a technical/commercial evaluation. Refused with 422 BID_ACCESS_DENIED while
   * the RFQ is still before CLOSED: nobody evaluates a bid that is still sealed.
   */
  createEvaluation(
    auth: ApiAuthContext, bidId: string, input: CreateEvaluationRequest, key: string
  ): Promise<EvaluationResponse> {
    return command(auth, `/v1/bids/${bidId}/evaluations`, input, key);
  },

  /** API-081 — colon-suffixed award submission; an evaluator of this RFQ is refused (SoD). */
  submitAward(
    auth: ApiAuthContext, rfqId: string, input: SubmitAwardRequest, key: string
  ): Promise<RfqResponse> {
    return command(auth, `/v1/rfqs/${rfqId}:submit-award`, input, key);
  },

  /**
   * API-082 — one transaction: the ISSUED order, its lines and the PURCHASE_ORDER commitment. A
   * breakdown that does not sum to `totalValue` fails as 422 PO_LINE_SUM_MISMATCH, decided by the
   * Postgres trigger over `SUM(quantity * unit_price)` — never by JS arithmetic.
   */
  createPurchaseOrder(
    auth: ApiAuthContext, projectId: string, input: CreatePurchaseOrderRequest, key: string
  ): Promise<PurchaseOrderResponse> {
    return command(auth, `/v1/projects/${projectId}/purchase-orders`, input, key);
  },

  /** API-083 — plan a shipment against an open PO; `committedDate` freezes at insert. */
  createShipment(
    auth: ApiAuthContext, purchaseOrderId: string, input: CreateShipmentRequest, key: string
  ): Promise<ShipmentResponse> {
    return command(auth, `/v1/purchase-orders/${purchaseOrderId}/shipments`, input, key);
  },

  /**
   * API-084 — append to the immutable milestone stream. Out-of-order reports answer 422
   * MILESTONE_OUT_OF_ORDER; a replay of the same (type, time, source) answers 409.
   */
  createShipmentMilestone(
    auth: ApiAuthContext, shipmentId: string, input: CreateShipmentMilestoneRequest, key: string
  ): Promise<ShipmentMilestoneResponse> {
    return command(auth, `/v1/shipments/${shipmentId}/milestones`, input, key);
  },

  /**
   * API-085 — one transaction: receipt + inventory ledger + serials. Over-receipt against the PO
   * line is refused server-side (422 OVER_RECEIPT) with the whole write rolled back.
   */
  createGoodsReceipt(
    auth: ApiAuthContext, purchaseOrderId: string, input: CreateGoodsReceiptRequest, key: string
  ): Promise<GoodsReceiptResponse> {
    return command(auth, `/v1/purchase-orders/${purchaseOrderId}/goods-receipts`, input, key);
  }
};
