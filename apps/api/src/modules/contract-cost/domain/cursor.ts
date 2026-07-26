import { BadRequestException } from '@nestjs/common';

/** Opaque keyset cursor for the newest-first Contract & Cost listings; `id` breaks ties. */
export interface ContractCostCursor { createdAt: string; id: string }

export function encodeContractCostCursor(value: ContractCostCursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeContractCostCursor(value: string | undefined): ContractCostCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isContractCostCursor(parsed)) throw new Error('invalid cursor shape');
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'INVALID_CURSOR', message: 'Cursor không hợp lệ', retryable: false
    });
  }
}

function isContractCostCursor(value: unknown): value is ContractCostCursor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.createdAt === 'string'
    && Number.isFinite(Date.parse(candidate.createdAt))
    && typeof candidate.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.id);
}
