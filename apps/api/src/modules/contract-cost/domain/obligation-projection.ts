/**
 * FR-039: DUE and OVERDUE are never stored. The API-059 projection derives them from `due_date`
 * against the database's CURRENT_DATE — an OPEN obligation past its due date reads OVERDUE, one
 * due today reads DUE, and a decided or cancelled row always keeps its stored status. Keeping this
 * in SQL means the register can never drift from the clock the constraint checks use.
 *
 * The expression expects the obligations table to be aliased `obligation`.
 */
export const OBLIGATION_EFFECTIVE_STATUS_SQL = `CASE
    WHEN obligation.status = 'OPEN' AND obligation.due_date IS NOT NULL
      AND obligation.due_date < CURRENT_DATE THEN 'OVERDUE'
    WHEN obligation.status = 'OPEN' AND obligation.due_date IS NOT NULL
      AND obligation.due_date = CURRENT_DATE THEN 'DUE'
    ELSE obligation.status
  END`;
