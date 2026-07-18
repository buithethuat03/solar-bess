export type QueryValue = string | number | boolean | null | undefined;

export function withQuery(path: string, query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function commandHeaders(idempotencyKey: string): HeadersInit {
  return { 'Idempotency-Key': idempotencyKey };
}
