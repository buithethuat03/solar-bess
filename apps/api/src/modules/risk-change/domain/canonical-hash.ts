import { createHash } from 'node:crypto';

/**
 * Canonical SHA-256 over a stable, key-sorted serialization. Extracted from RiskChangeService so
 * every module that stores a snapshot hash (risk-change impact snapshots, contract party legal
 * snapshots, budget snapshots) hashes byte-identical input the same way instead of growing a
 * second serializer.
 */
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`
  )).join(',')}}`;
}
