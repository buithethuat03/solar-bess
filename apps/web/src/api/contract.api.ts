import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ContractAppendixResponse, ContractCommandResponse, ContractDetailResponse, ContractListQuery,
  ContractListResponse, ContractPartyResponse, BudgetVersionResponse, CommitmentResponse,
  CostSummaryResponse, CreateBudgetVersionRequest, CreateCommitmentRequest,
  CreateContractAppendixRequest, CreateContractPartyRequest, CreateContractRequest,
  CreateObligationRequest, CreatePaymentRequest, FulfillObligationRequest, ObligationCommandResponse,
  ObligationListQuery, ObligationListResponse, PaymentCommandResponse, PaymentDetailResponse,
  UpdateContractRequest
} from '@/types/contract.types';

/**
 * Every Contract & Cost command requires an Idempotency-Key of 8–200 characters. Monetary fields
 * in every body are strings and are serialized untouched — this module never converts them.
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string,
  method: 'POST' | 'PATCH' = 'POST'
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method, auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const contractApi = {
  /** API-053 — project contract register with type/status filters and cursor pagination. */
  listContracts(
    auth: ApiAuthContext, projectId: string, query: ContractListQuery = {}
  ): Promise<ContractListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/contracts`, query), {
      method: 'GET', auth
    });
  },

  /** API-054 — register a contract; it is born DRAFT, unsigned and without legal hold. */
  createContract(
    auth: ApiAuthContext, projectId: string, input: CreateContractRequest, key: string
  ): Promise<ContractCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/contracts`, input, key);
  },

  /** API-055 — consolidated view: contract + parties + appendices + Postgres-computed value. */
  getContract(auth: ApiAuthContext, contractId: string): Promise<ContractDetailResponse> {
    return httpClient.request(`/v1/contracts/${contractId}`, { method: 'GET', auth });
  },

  /** API-056 — DRAFT-only PATCH under optimistic concurrency (`expectedVersion` in the body). */
  updateContract(
    auth: ApiAuthContext, contractId: string, input: UpdateContractRequest, key: string
  ): Promise<ContractCommandResponse> {
    return command(auth, `/v1/contracts/${contractId}`, input, key, 'PATCH');
  },

  /** API-057 — append a party as a legal snapshot; the master can never rewrite it afterwards. */
  createContractParty(
    auth: ApiAuthContext, contractId: string, input: CreateContractPartyRequest, key: string
  ): Promise<ContractPartyResponse> {
    return command(auth, `/v1/contracts/${contractId}/parties`, input, key);
  },

  /** API-058 — appendix; a currency other than the contract's is a CURRENCY_MISMATCH. */
  createContractAppendix(
    auth: ApiAuthContext, contractId: string, input: CreateContractAppendixRequest, key: string
  ): Promise<ContractAppendixResponse> {
    return command(auth, `/v1/contracts/${contractId}/appendices`, input, key);
  },

  /** API-059 — obligations of one contract; DUE/OVERDUE are derived by the server at read time. */
  listObligations(
    auth: ApiAuthContext, contractId: string, query: ObligationListQuery = {}
  ): Promise<ObligationListResponse> {
    return httpClient.request(withQuery(`/v1/contracts/${contractId}/obligations`, query), {
      method: 'GET', auth
    });
  },

  /** API-060 — obligation over two distinct parties of this contract. */
  createObligation(
    auth: ApiAuthContext, contractId: string, input: CreateObligationRequest, key: string
  ): Promise<ObligationCommandResponse> {
    return command(auth, `/v1/contracts/${contractId}/obligations`, input, key);
  },

  /**
   * API-061 — fulfil or waive with reason + evidence. The server enforces SoD: neither the
   * obligation owner nor its creator may decide, whatever the UI shows.
   */
  fulfillObligation(
    auth: ApiAuthContext, obligationId: string, input: FulfillObligationRequest, key: string
  ): Promise<ObligationCommandResponse> {
    return command(auth, `/v1/obligations/${obligationId}:fulfill`, input, key);
  },

  /** API-062 — cost summary grouped by currency; the API never totals across currencies. */
  getCostSummary(auth: ApiAuthContext, projectId: string): Promise<CostSummaryResponse> {
    return httpClient.request(`/v1/projects/${projectId}/cost-summary`, { method: 'GET', auth });
  },

  /** API-063 — new budget version, born SUBMITTED; the version number is server-allocated. */
  createBudgetVersion(
    auth: ApiAuthContext, projectId: string, input: CreateBudgetVersionRequest, key: string
  ): Promise<BudgetVersionResponse> {
    return command(auth, `/v1/projects/${projectId}/budget-versions`, input, key);
  },

  /** API-064 — record a commitment; a replayed source version conflicts instead of double-counting. */
  createCommitment(
    auth: ApiAuthContext, projectId: string, input: CreateCommitmentRequest, key: string
  ): Promise<CommitmentResponse> {
    return command(auth, `/v1/projects/${projectId}/commitments`, input, key);
  },

  /**
   * API-065 — payment request with nested invoice/components/fxSnapshot in one transaction. A
   * breakdown that does not sum to the requested amount fails as COMPONENT_SUM_MISMATCH (422).
   */
  createPayment(
    auth: ApiAuthContext, contractId: string, input: CreatePaymentRequest, key: string
  ): Promise<PaymentCommandResponse> {
    return command(auth, `/v1/contracts/${contractId}/payments`, input, key);
  },

  /** API-066 — one payment and its component breakdown. */
  getPayment(auth: ApiAuthContext, paymentId: string): Promise<PaymentDetailResponse> {
    return httpClient.request(`/v1/payments/${paymentId}`, { method: 'GET', auth });
  }
};
