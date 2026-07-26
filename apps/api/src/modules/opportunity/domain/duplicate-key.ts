import { createHash } from 'node:crypto';

/**
 * Server-computed duplicate identity for DB-014 (API-027 duplicate check — recorded Assumption).
 *
 * `duplicate_key = sha256(lower(customer_company_id) + '|' + normalize(location_text))` when both
 * parts are present, else NULL. Normalization is lower(trim(...)) with internal whitespace
 * collapsed, so "  Khu CN   Long Thành " and "khu cn long thành" identify the same site of the
 * same customer. The partial unique index `uq_opportunity_duplicate_key` turns a collision into
 * 409 DUPLICATE_OPPORTUNITY.
 */
export function computeDuplicateKey(
  customerCompanyId: string | null | undefined,
  locationText: string | null | undefined
): string | null {
  if (!customerCompanyId) return null;
  const location = normalizeLocationText(locationText);
  if (location === null) return null;
  return createHash('sha256')
    .update(`${customerCompanyId.toLowerCase()}|${location}`)
    .digest('hex');
}

/** lower(trim(...)) with internal whitespace collapsed; blank input normalizes to null. */
export function normalizeLocationText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/gu, ' ');
  return normalized.length === 0 ? null : normalized;
}
