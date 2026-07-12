import { httpClient } from './http-client';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ApplyScheduleDraftRequest,
  ApplyScheduleDraftResponse,
  BaselineDecisionRequest,
  ProgressHistoryResponse,
  ProgressUpdateCommandResponse,
  ProgressUpdateRequest,
  ProjectScheduleResponse,
  ScheduleBaselineCommandResponse,
  ScheduleQuery,
  SubmitScheduleBaselineRequest
} from '@/types/schedule.types';

function queryString(query: ScheduleQuery): string {
  const params = new URLSearchParams();
  if (query.dataDate) params.set('dataDate', query.dataDate);
  if (query.lookAheadDays !== undefined) params.set('lookAheadDays', String(query.lookAheadDays));
  if (query.baselineNumber !== undefined) params.set('baselineNumber', String(query.baselineNumber));
  const value = params.toString();
  return value ? `?${value}` : '';
}

function commandHeaders(idempotencyKey: string): HeadersInit {
  return { 'Idempotency-Key': idempotencyKey };
}

export const scheduleApi = {
  getProjectSchedule(
    auth: ApiAuthContext,
    projectId: string,
    query: ScheduleQuery = {}
  ): Promise<ProjectScheduleResponse> {
    return httpClient.request(`/v1/projects/${projectId}/schedule${queryString(query)}`, {
      method: 'GET', auth
    });
  },

  exportLookAhead(
    auth: ApiAuthContext,
    projectId: string,
    query: Pick<ScheduleQuery, 'dataDate' | 'lookAheadDays'> = {}
  ): Promise<string> {
    return httpClient.request(
      `/v1/projects/${projectId}/schedule-look-ahead.csv${queryString(query)}`,
      { method: 'GET', auth }
    );
  },

  applyDraft(
    auth: ApiAuthContext,
    projectId: string,
    input: ApplyScheduleDraftRequest,
    idempotencyKey: string
  ): Promise<ApplyScheduleDraftResponse> {
    return httpClient.request(`/v1/projects/${projectId}/schedule:apply-draft`, {
      method: 'POST', auth, headers: commandHeaders(idempotencyKey), body: input
    });
  },

  submitBaseline(
    auth: ApiAuthContext,
    projectId: string,
    input: SubmitScheduleBaselineRequest,
    idempotencyKey: string
  ): Promise<ScheduleBaselineCommandResponse> {
    return httpClient.request(`/v1/projects/${projectId}/schedule-baselines`, {
      method: 'POST', auth, headers: commandHeaders(idempotencyKey), body: input
    });
  },

  recordProgress(
    auth: ApiAuthContext,
    projectId: string,
    input: ProgressUpdateRequest,
    idempotencyKey: string
  ): Promise<ProgressUpdateCommandResponse> {
    return httpClient.request(`/v1/projects/${projectId}/progress-updates`, {
      method: 'POST', auth, headers: commandHeaders(idempotencyKey), body: input
    });
  },

  listProgressHistory(
    auth: ApiAuthContext,
    projectId: string,
    activityId: string,
    cursor?: string
  ): Promise<ProgressHistoryResponse> {
    const params = new URLSearchParams({ activityId, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    return httpClient.request(`/v1/projects/${projectId}/progress-updates?${params}`, {
      method: 'GET', auth
    });
  },

  decideBaseline(
    auth: ApiAuthContext,
    baselineId: string,
    input: BaselineDecisionRequest,
    idempotencyKey: string
  ): Promise<ScheduleBaselineCommandResponse> {
    return httpClient.request(`/v1/schedule-baselines/${baselineId}:decision`, {
      method: 'POST', auth, headers: commandHeaders(idempotencyKey), body: input
    });
  }
};
