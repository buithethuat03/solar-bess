import { httpClient } from './http-client';
import type { ApiAuthContext, AuthIdentity, AuthSession, LoginInput } from '@/types/auth.types';

export const authApi = {
  login(input: LoginInput): Promise<AuthSession> {
    return httpClient.request<AuthSession, LoginInput>('/v1/auth/login', {
      method: 'POST', body: input
    });
  },

  refresh(): Promise<AuthSession> {
    return httpClient.request<AuthSession>('/v1/auth/refresh', { method: 'POST' });
  },

  logout(): Promise<void> {
    return httpClient.request<void>('/v1/auth/logout', { method: 'POST' });
  },

  me(auth: ApiAuthContext): Promise<AuthIdentity> {
    return httpClient.request<AuthIdentity>('/v1/me', { method: 'GET', auth });
  }
};
