import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ConvertOpportunityRequest, ConvertOpportunityResponse, CreateInvestmentScenarioRequest,
  CreateOpportunityRequest, CreateSurveyPackageRequest, InvestmentScenarioResponse,
  OpportunityCommandResponse, OpportunityDetailResponse, OpportunityListQuery,
  OpportunityListResponse, SubmitInvestmentScenarioRequest, SurveyPackageResponse,
  UpdateOpportunityRequest
} from '@/types/opportunity.types';

/**
 * Opportunity transport (API-026…API-033).
 *
 * Every command carries an Idempotency-Key of 8–200 characters. Capacity, capex, NPV and IRR are
 * serialized as the exact strings that were typed — this module never parses or reformats them.
 *
 * There is deliberately no `approveOpportunity` here: the V1 catalog has no such operation. Submit
 * (API-032) records the submission on the aggregate because the DB-071 engine cannot host a
 * pre-project workflow target, and no other operation writes stage APPROVED.
 */
function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, body: TBody, idempotencyKey: string,
  method: 'POST' | 'PATCH' = 'POST'
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method, auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const opportunityApi = {
  /** API-026 — the tenant pipeline, filterable by stage and customer, keyset-paged. */
  listOpportunities(
    auth: ApiAuthContext, query: OpportunityListQuery = {}
  ): Promise<OpportunityListResponse> {
    return httpClient.request(withQuery('/v1/opportunities', query), { method: 'GET', auth });
  },

  /** API-027 — create a LEAD; the server computes the duplicate key from customer + location. */
  createOpportunity(
    auth: ApiAuthContext, input: CreateOpportunityRequest, key: string
  ): Promise<OpportunityCommandResponse> {
    return command(auth, '/v1/opportunities', input, key);
  },

  /** API-028 — detail with survey revisions and the projected scenario statuses. */
  getOpportunity(
    auth: ApiAuthContext, opportunityId: string
  ): Promise<OpportunityDetailResponse> {
    return httpClient.request(`/v1/opportunities/${opportunityId}`, { method: 'GET', auth });
  },

  /** API-029 — optimistic-concurrency PATCH; only adjacent WF-002 stage moves are accepted. */
  updateOpportunity(
    auth: ApiAuthContext, opportunityId: string, input: UpdateOpportunityRequest, key: string
  ): Promise<OpportunityCommandResponse> {
    return command(auth, `/v1/opportunities/${opportunityId}`, input, key, 'PATCH');
  },

  /** API-030 — append a survey revision; the revision number is allocated by the server. */
  createSurveyPackage(
    auth: ApiAuthContext, opportunityId: string, input: CreateSurveyPackageRequest, key: string
  ): Promise<SurveyPackageResponse> {
    return command(auth, `/v1/opportunities/${opportunityId}/survey-packages`, input, key);
  },

  /**
   * API-031 — append a scenario version. `npv`, `irr` and `capexTotal` are client evidence stored
   * verbatim next to `formulaVersion`; the server derives none of them and neither does this
   * client.
   */
  createInvestmentScenario(
    auth: ApiAuthContext, opportunityId: string, input: CreateInvestmentScenarioRequest,
    key: string
  ): Promise<InvestmentScenarioResponse> {
    return command(auth, `/v1/opportunities/${opportunityId}/investment-scenarios`, input, key);
  },

  /** API-032 — submit a DRAFT/RETURNED scenario; recorded on the aggregate, no engine instance. */
  submitInvestmentScenario(
    auth: ApiAuthContext, scenarioId: string, input: SubmitInvestmentScenarioRequest, key: string
  ): Promise<InvestmentScenarioResponse> {
    return command(auth, `/v1/investment-scenarios/${scenarioId}:submit`, input, key);
  },

  /**
   * API-033 — convert into a project. A replay is not an error: the response comes back with
   * `alreadyConverted: true` and the project the opportunity already became.
   */
  convertOpportunity(
    auth: ApiAuthContext, opportunityId: string, input: ConvertOpportunityRequest, key: string
  ): Promise<ConvertOpportunityResponse> {
    return command(auth, `/v1/opportunities/${opportunityId}:convert`, input, key);
  }
};
