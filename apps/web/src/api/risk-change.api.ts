import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ActionCommandResponse, ActionListQuery, ActionListResponse, CancelRiskIssueActionRequest,
  ChangeCommandResponse, ChangeDecisionRequest, ChangeListQuery, ChangeListResponse,
  ClosureDecisionRequest, CompleteRiskIssueActionRequest, CreateChangeRequestRequest,
  CreateIssueRequest, CreateRiskIssueActionRequest, CreateRiskRequest, IssueCommandResponse,
  IssueDetailResponse, IssueListQuery, IssueListResponse, RiskChangeHistoryQuery,
  RiskChangeHistoryResponse, RiskChangeSummaryQuery, RiskChangeSummaryResponse,
  RiskCommandResponse, RiskDetailResponse, RiskIssueAction, RiskListQuery, RiskListResponse,
  UpdateChangeRequestRequest, UpdateIssueRequest, UpdateRiskIssueActionFieldsRequest,
  UpdateRiskRequest, VerifyRiskIssueActionRequest
} from '@/types/risk-change.types';

function command<TResponse, TBody>(
  auth: ApiAuthContext, path: string, method: 'POST' | 'PATCH', body: TBody,
  idempotencyKey: string
): Promise<TResponse> {
  return httpClient.request<TResponse, TBody>(path, {
    method, auth, headers: commandHeaders(idempotencyKey), body
  });
}

export const riskChangeApi = {
  listRisks(auth: ApiAuthContext, projectId: string, query: RiskListQuery = {}): Promise<RiskListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/risks`, query), { method: 'GET', auth });
  },

  createRisk(auth: ApiAuthContext, projectId: string, input: CreateRiskRequest, key: string): Promise<RiskCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risks`, 'POST', input, key);
  },

  getRisk(
    auth: ApiAuthContext, projectId: string, riskId: string,
    closureCycleCursor?: string, closureCycleLimit = 50
  ): Promise<RiskDetailResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/risks/${riskId}`, {
      closureCycleCursor, closureCycleLimit
    }), { method: 'GET', auth });
  },

  updateRisk(auth: ApiAuthContext, projectId: string, riskId: string, input: UpdateRiskRequest, key: string): Promise<RiskCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risks/${riskId}`, 'PATCH', input, key);
  },

  decideRiskClosure(auth: ApiAuthContext, projectId: string, riskId: string, input: ClosureDecisionRequest, key: string): Promise<RiskCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risks/${riskId}:closure-decision`, 'POST', input, key);
  },

  listIssues(auth: ApiAuthContext, projectId: string, query: IssueListQuery = {}): Promise<IssueListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/issues`, query), { method: 'GET', auth });
  },

  createIssue(auth: ApiAuthContext, projectId: string, input: CreateIssueRequest, key: string): Promise<IssueCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/issues`, 'POST', input, key);
  },

  getIssue(
    auth: ApiAuthContext, projectId: string, issueId: string,
    closureCycleCursor?: string, closureCycleLimit = 50
  ): Promise<IssueDetailResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/issues/${issueId}`, {
      closureCycleCursor, closureCycleLimit
    }), { method: 'GET', auth });
  },

  updateIssue(auth: ApiAuthContext, projectId: string, issueId: string, input: UpdateIssueRequest, key: string): Promise<IssueCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/issues/${issueId}`, 'PATCH', input, key);
  },

  decideIssueClosure(auth: ApiAuthContext, projectId: string, issueId: string, input: ClosureDecisionRequest, key: string): Promise<IssueCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/issues/${issueId}:closure-decision`, 'POST', input, key);
  },

  listActions(auth: ApiAuthContext, projectId: string, query: ActionListQuery = {}): Promise<ActionListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/risk-issue-actions`, query), { method: 'GET', auth });
  },

  createAction(auth: ApiAuthContext, projectId: string, input: CreateRiskIssueActionRequest, key: string): Promise<ActionCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risk-issue-actions`, 'POST', input, key);
  },

  getAction(auth: ApiAuthContext, projectId: string, actionId: string): Promise<{ data: RiskIssueAction; correlationId: string }> {
    return httpClient.request(`/v1/projects/${projectId}/risk-issue-actions/${actionId}`, { method: 'GET', auth });
  },

  updateActionFields(auth: ApiAuthContext, projectId: string, actionId: string, input: UpdateRiskIssueActionFieldsRequest, key: string): Promise<ActionCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risk-issue-actions/${actionId}`, 'PATCH', input, key);
  },

  completeAction(auth: ApiAuthContext, projectId: string, actionId: string, input: CompleteRiskIssueActionRequest, key: string): Promise<ActionCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risk-issue-actions/${actionId}`, 'PATCH', input, key);
  },

  verifyAction(auth: ApiAuthContext, projectId: string, actionId: string, input: VerifyRiskIssueActionRequest, key: string): Promise<ActionCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risk-issue-actions/${actionId}`, 'PATCH', input, key);
  },

  cancelAction(auth: ApiAuthContext, projectId: string, actionId: string, input: CancelRiskIssueActionRequest, key: string): Promise<ActionCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/risk-issue-actions/${actionId}`, 'PATCH', input, key);
  },

  listChanges(auth: ApiAuthContext, projectId: string, query: ChangeListQuery = {}): Promise<ChangeListResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/change-requests`, query), { method: 'GET', auth });
  },

  createChange(auth: ApiAuthContext, projectId: string, input: CreateChangeRequestRequest, key: string): Promise<ChangeCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/change-requests`, 'POST', input, key);
  },

  getChange(auth: ApiAuthContext, projectId: string, changeId: string): Promise<ChangeCommandResponse> {
    return httpClient.request(`/v1/projects/${projectId}/change-requests/${changeId}`, { method: 'GET', auth });
  },

  updateChange(auth: ApiAuthContext, projectId: string, changeId: string, input: UpdateChangeRequestRequest, key: string): Promise<ChangeCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/change-requests/${changeId}`, 'PATCH', input, key);
  },

  submitChange(auth: ApiAuthContext, projectId: string, changeId: string, expectedVersion: number, comment: string, key: string): Promise<ChangeCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/change-requests/${changeId}:submit`, 'POST', {
      expectedVersion, ...(comment ? { comment } : {})
    }, key);
  },

  decideChange(auth: ApiAuthContext, projectId: string, changeId: string, input: ChangeDecisionRequest, key: string): Promise<ChangeCommandResponse> {
    return command(auth, `/v1/projects/${projectId}/change-requests/${changeId}:decision`, 'POST', input, key);
  },

  getSummary(auth: ApiAuthContext, projectId: string, query: RiskChangeSummaryQuery = {}): Promise<RiskChangeSummaryResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/risk-change-summary`, query), { method: 'GET', auth });
  },

  listHistory(auth: ApiAuthContext, projectId: string, query: RiskChangeHistoryQuery = {}): Promise<RiskChangeHistoryResponse> {
    return httpClient.request(withQuery(`/v1/projects/${projectId}/risk-change-history`, query), { method: 'GET', auth });
  }
};
