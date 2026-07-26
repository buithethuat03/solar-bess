/**
 * SEC-127/SEC-128 — the schema-level control that PM Web can never store the coordinates of an OT
 * write path. A plant table (DB-081/DB-082) must not carry any column whose name even suggests
 * connectivity or credentials; this guard is asserted by a unit test against the TypeORM entity
 * metadata and by the migration integration test against the live information_schema.
 */
export const CREDENTIAL_COLUMN_PATTERN = /host|password|secret|token|credential|url|endpoint|username|api_key|apikey/i;

/** Returns the subset of column names that look like connectivity/credential storage. */
export function findCredentialShapedColumns(columnNames: readonly string[]): string[] {
  return columnNames.filter((name) => CREDENTIAL_COLUMN_PATTERN.test(name));
}
