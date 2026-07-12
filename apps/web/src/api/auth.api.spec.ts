import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-error';
import { authApi } from './auth.api';

describe('auth API — API-137…139', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uses the centralized JSON client and includes cookie credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: 'token' }), {
      status: 200, headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    await authApi.login({ tenantCode: 'demo', email: 'user@example.test', password: 'password-value' });
    expect(fetchMock).toHaveBeenCalledWith('/v1/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include', body: expect.any(String)
    }));
  });

  it('maps the standard API error payload to a typed ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'AUTH_INVALID_CREDENTIALS', message: 'Thông tin đăng nhập không hợp lệ', retryable: false
    }), { status: 401, headers: { 'content-type': 'application/json' } })));
    await expect(authApi.refresh()).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Thông tin đăng nhập không hợp lệ',
      retryable: false,
      name: 'ApiError'
    } satisfies Partial<ApiError>);
  });
});
