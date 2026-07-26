import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  ApprovalTaskListQuery, ApprovalTaskListResponse, CancelWorkflowInstanceRequest,
  RecordApprovalDecisionRequest, WorkflowDefinitionListResponse,
  WorkflowInstanceCommandResponse, WorkflowInstanceDetailResponse
} from '@/types/workflow.types';

export const workflowApi = {
  listDefinitions(auth: ApiAuthContext, query: { cursor?: string; limit?: number } = {}): Promise<WorkflowDefinitionListResponse> {
    return httpClient.request(withQuery('/v1/workflow-definitions', query), { method: 'GET', auth });
  },

  listApprovalTasks(
    auth: ApiAuthContext, query: ApprovalTaskListQuery = {}
  ): Promise<ApprovalTaskListResponse> {
    return httpClient.request(withQuery('/v1/approval-tasks', query), { method: 'GET', auth });
  },

  getInstance(auth: ApiAuthContext, instanceId: string): Promise<WorkflowInstanceDetailResponse> {
    return httpClient.request(`/v1/workflow-instances/${instanceId}`, { method: 'GET', auth });
  },

  recordDecision(
    auth: ApiAuthContext, instanceId: string,
    input: RecordApprovalDecisionRequest, key: string
  ): Promise<WorkflowInstanceCommandResponse> {
    return httpClient.request(`/v1/workflow-instances/${instanceId}/decisions`, {
      method: 'POST', auth, headers: commandHeaders(key), body: input
    });
  },

  cancelInstance(
    auth: ApiAuthContext, instanceId: string,
    input: CancelWorkflowInstanceRequest, key: string
  ): Promise<WorkflowInstanceCommandResponse> {
    return httpClient.request(`/v1/workflow-instances/${instanceId}:cancel`, {
      method: 'POST', auth, headers: commandHeaders(key), body: input
    });
  }
};
