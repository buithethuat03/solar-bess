import { ApiError } from './api-error';
import type { ApiAuthContext } from '@/types/auth.types';

interface ApiRequestOptions<TBody> extends Omit<RequestInit, 'body'> {
  body?: TBody;
  auth?: ApiAuthContext;
}

export class HttpClient {
  constructor(private readonly baseUrl = '') {}

  async request<TResponse, TBody = never>(
    path: string,
    options: ApiRequestOptions<TBody> = {}
  ): Promise<TResponse> {
    const { body, auth, headers: suppliedHeaders, ...init } = options;
    const headers = new Headers(suppliedHeaders);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (auth) {
      headers.set('Authorization', `Bearer ${auth.accessToken}`);
      headers.set('X-Tenant-Id', auth.tenantId);
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await this.readPayload(response);
    if (!response.ok) throw ApiError.from(response.status, payload);
    return payload as TResponse;
  }

  private async readPayload(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) return response.json().catch(() => ({}));
    const text = await response.text().catch(() => '');
    return text || {};
  }
}

export const httpClient = new HttpClient();
