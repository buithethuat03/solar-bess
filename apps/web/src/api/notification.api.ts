import { httpClient } from './http-client';
import { commandHeaders, withQuery } from './request-utils';
import type { ApiAuthContext } from '@/types/auth.types';
import type {
  NotificationCommandResponse, NotificationListQuery, NotificationListResponse
} from '@/types/notification.types';

export const notificationApi = {
  list(
    auth: ApiAuthContext, query: NotificationListQuery = {}
  ): Promise<NotificationListResponse> {
    return httpClient.request(withQuery('/v1/notifications', query), { method: 'GET', auth });
  },

  acknowledge(
    auth: ApiAuthContext, notificationId: string, key: string
  ): Promise<NotificationCommandResponse> {
    return httpClient.request(`/v1/notifications/${notificationId}:acknowledge`, {
      method: 'POST', auth, headers: commandHeaders(key), body: {}
    });
  }
};
