export interface UserAssignee {
  id: string;
  displayName: string;
}

export interface UserAssigneeQuery {
  projectId: string;
  packageId?: string;
  requiredPermission: 'riskChange.read' | 'riskChange.manage';
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface CursorMeta {
  nextCursor: string | null;
  limit: number;
}

export interface UserAssigneeListResponse {
  data: UserAssignee[];
  meta: CursorMeta;
  correlationId: string;
}
