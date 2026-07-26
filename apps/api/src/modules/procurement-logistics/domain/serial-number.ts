/**
 * DB-054 serial normalization: trim then uppercase. The database re-asserts the identity with
 * `ck_serial_number_normalized` (normalized_serial = upper(btrim(serial_no))), so the API and the
 * schema can never disagree about what "the same serial" means. Uniqueness is enforced on the
 * normalized form per (tenant, equipment model) — recorded Assumption while the dictionary scope
 * stays TBD.
 */
export function normalizeSerial(serialNo: string): string {
  return serialNo.trim().toUpperCase();
}

/** A serial that is empty after trimming carries no identity and is rejected before any write. */
export function isSerialPresent(serialNo: string): boolean {
  return serialNo.trim().length > 0;
}
