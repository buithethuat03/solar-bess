import { createHash } from 'node:crypto';

export function safeErrorHash(error: unknown): string {
  const source = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return createHash('sha256').update(source).digest('hex');
}

export function safeErrorCode(error: unknown): string {
  return `ERR_${safeErrorHash(error).slice(0, 16).toUpperCase()}`;
}
