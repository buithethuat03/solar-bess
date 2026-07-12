const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const MAX_CALENDAR_ITERATIONS = 3_660_000;

export interface CalendarException {
  date: string;
  working: boolean;
  reason?: string;
}

export interface DayLevelCalendarConfig {
  timezone: string;
  /** ISO weekday numbers: Monday = 1, Sunday = 7. */
  workingWeek: readonly number[];
  exceptions: readonly CalendarException[];
}

export class CalendarValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CalendarValidationError';
  }
}

export interface CalendarValidationIssue {
  code: string;
  path: 'calendar';
  message: string;
}

export interface CalendarValidationResult {
  valid: boolean;
  issues: readonly CalendarValidationIssue[];
}

export function isValidIanaTimezone(timezone: string): boolean {
  if (typeof timezone !== 'string' || timezone.trim() !== timezone || timezone.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function assertIsoDate(value: string, fieldName = 'date'): void {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new CalendarValidationError('INVALID_ISO_DATE', `${fieldName} must use YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new CalendarValidationError('INVALID_ISO_DATE', `${fieldName} is not a Gregorian calendar date`);
  }
}

export function compareIsoDates(left: string, right: string): number {
  assertIsoDate(left, 'left date');
  assertIsoDate(right, 'right date');
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Deterministic day-level calendar. The IANA timezone is validated and retained as
 * provenance, while calculations operate on local civil dates and never on instants.
 */
export class DayLevelCalendar {
  readonly timezone: string;
  readonly workingWeek: readonly number[];
  readonly exceptions: readonly CalendarException[];

  private readonly workingWeekSet: ReadonlySet<number>;
  private readonly exceptionMap: ReadonlyMap<string, boolean>;

  constructor(config: DayLevelCalendarConfig) {
    if (!isValidIanaTimezone(config.timezone)) {
      throw new CalendarValidationError('INVALID_IANA_TIMEZONE', 'timezone must be a valid IANA timezone');
    }
    const uniqueWeekdays = new Set(config.workingWeek);
    if (
      config.workingWeek.length === 0
      || uniqueWeekdays.size !== config.workingWeek.length
      || config.workingWeek.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)
    ) {
      throw new CalendarValidationError(
        'INVALID_WORKING_WEEK',
        'workingWeek must contain unique ISO weekday integers between 1 and 7'
      );
    }

    const exceptionMap = new Map<string, boolean>();
    if (config.exceptions.length > 3660) {
      throw new CalendarValidationError(
        'TOO_MANY_CALENDAR_EXCEPTIONS',
        'calendar must not contain more than 3660 explicit exceptions'
      );
    }
    for (const exception of config.exceptions) {
      assertIsoDate(exception.date, 'calendar exception date');
      if (typeof exception.working !== 'boolean') {
        throw new CalendarValidationError(
          'INVALID_CALENDAR_EXCEPTION',
          `calendar exception ${exception.date} must declare a boolean working value`
        );
      }
      if (exceptionMap.has(exception.date)) {
        throw new CalendarValidationError(
          'DUPLICATE_CALENDAR_EXCEPTION',
          `calendar exception ${exception.date} is duplicated`
        );
      }
      exceptionMap.set(exception.date, exception.working);
    }

    this.timezone = config.timezone;
    this.workingWeek = Object.freeze([...config.workingWeek].sort((left, right) => left - right));
    this.exceptions = Object.freeze(config.exceptions.map((exception) => Object.freeze({ ...exception })));
    this.workingWeekSet = uniqueWeekdays;
    this.exceptionMap = exceptionMap;
  }

  isWorkingDay(date: string): boolean {
    assertIsoDate(date);
    const exception = this.exceptionMap.get(date);
    if (exception !== undefined) return exception;
    return this.workingWeekSet.has(isoWeekday(date));
  }

  /**
   * Moves by working-day boundaries. Offset zero preserves the input date; a
   * positive offset counts working dates after it and a negative offset before it.
   */
  addWorkdays(date: string, offset: number): string {
    assertIsoDate(date);
    if (!Number.isSafeInteger(offset)) {
      throw new CalendarValidationError('INVALID_WORKDAY_OFFSET', 'workday offset must be a safe integer');
    }
    if (offset === 0) return date;

    const direction = offset > 0 ? 1 : -1;
    let remaining = Math.abs(offset);
    let epochDay = isoToEpochDay(date);
    let iterations = 0;
    while (remaining > 0) {
      epochDay += direction;
      const candidate = epochDayToIso(epochDay);
      if (this.isWorkingDay(candidate)) remaining -= 1;
      iterations += 1;
      if (iterations > MAX_CALENDAR_ITERATIONS) {
        throw new CalendarValidationError(
          'CALENDAR_RANGE_EXCEEDED',
          'calendar calculation exceeded the supported date range'
        );
      }
    }
    return epochDayToIso(epochDay);
  }

  /** Counts working dates inclusively. The caller must provide start <= end. */
  countWorkdays(start: string, end: string): number {
    assertIsoDate(start, 'start date');
    assertIsoDate(end, 'end date');
    if (start > end) {
      throw new CalendarValidationError('INVALID_DATE_RANGE', 'start date must not be after end date');
    }

    let count = 0;
    const endEpochDay = isoToEpochDay(end);
    let epochDay = isoToEpochDay(start);
    let iterations = 0;
    while (epochDay <= endEpochDay) {
      if (this.isWorkingDay(epochDayToIso(epochDay))) count += 1;
      epochDay += 1;
      iterations += 1;
      if (iterations > MAX_CALENDAR_ITERATIONS) {
        throw new CalendarValidationError(
          'CALENDAR_RANGE_EXCEEDED',
          'calendar calculation exceeded the supported date range'
        );
      }
    }
    return count;
  }

  /**
   * Returns the signed number of working-day moves between two working dates.
   * This is the inverse of addWorkdays for CPM coordinates.
   */
  workdayDistance(from: string, to: string): number {
    assertIsoDate(from, 'from date');
    assertIsoDate(to, 'to date');
    if (!this.isWorkingDay(from) || !this.isWorkingDay(to)) {
      throw new CalendarValidationError(
        'NON_WORKING_DISTANCE_ENDPOINT',
        'workday distance endpoints must both be working dates'
      );
    }
    if (from === to) return 0;
    if (from < to) return this.countWorkdays(this.addCivilDays(from, 1), to);
    return -this.countWorkdays(this.addCivilDays(to, 1), from);
  }

  calculatePlannedFinish(plannedStart: string, durationWorkDays: number): string {
    assertIsoDate(plannedStart, 'planned start');
    if (!Number.isSafeInteger(durationWorkDays) || durationWorkDays < 0) {
      throw new CalendarValidationError(
        'INVALID_DURATION_WORKDAYS',
        'durationWorkDays must be a non-negative safe integer'
      );
    }
    if (!this.isWorkingDay(plannedStart)) {
      throw new CalendarValidationError('NON_WORKING_PLANNED_START', 'planned start must be a working date');
    }
    return durationWorkDays === 0
      ? plannedStart
      : this.addWorkdays(plannedStart, durationWorkDays - 1);
  }

  private addCivilDays(date: string, amount: number): string {
    return epochDayToIso(isoToEpochDay(date) + amount);
  }
}

export function addWorkdays(config: DayLevelCalendarConfig, date: string, offset: number): string {
  return new DayLevelCalendar(config).addWorkdays(date, offset);
}

export function countWorkdays(config: DayLevelCalendarConfig, start: string, end: string): number {
  return new DayLevelCalendar(config).countWorkdays(start, end);
}

export function calculatePlannedFinish(
  config: DayLevelCalendarConfig,
  plannedStart: string,
  durationWorkDays: number
): string {
  return new DayLevelCalendar(config).calculatePlannedFinish(plannedStart, durationWorkDays);
}

/** Facade used by application services before accepting a calendar command. */
export function validateCalendar(config: DayLevelCalendarConfig): CalendarValidationResult {
  try {
    new DayLevelCalendar(config);
    return { valid: true, issues: [] };
  } catch (error) {
    const calendarError = error as CalendarValidationError;
    return {
      valid: false,
      issues: [{
        code: calendarError.code ?? 'INVALID_CALENDAR',
        path: 'calendar',
        message: calendarError.message
      }]
    };
  }
}

/** Duration-oriented facade: a one-day task finishes on its start workday. */
export function addWorkDays(
  plannedStart: string,
  durationWorkDays: number,
  config: DayLevelCalendarConfig
): string {
  return calculatePlannedFinish(config, plannedStart, durationWorkDays);
}

function isoWeekday(date: string): number {
  const day = new Date(isoToEpochDay(date) * MILLISECONDS_PER_DAY).getUTCDay();
  return day === 0 ? 7 : day;
}

function isoToEpochDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / MILLISECONDS_PER_DAY);
}

function epochDayToIso(epochDay: number): string {
  const date = new Date(epochDay * MILLISECONDS_PER_DAY);
  const iso = date.toISOString().slice(0, 10);
  assertIsoDate(iso);
  return iso;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
