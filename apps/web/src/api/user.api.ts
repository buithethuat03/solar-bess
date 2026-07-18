import { httpClient } from './http-client';
import { withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type { UserAssigneeListResponse, UserAssigneeQuery } from '@/types/user.types';

export const userApi = {
  listAssignees(auth: ApiAuthContext, query: UserAssigneeQuery): Promise<UserAssigneeListResponse> {
    return httpClient.request(withQuery('/v1/users', query), { method: 'GET', auth });
  }
};
