import {
  CalendarValidationError,
  DayLevelCalendar,
  addWorkDays,
  validateCalendar,
  type DayLevelCalendarConfig
} from 'src/modules/project-controls/domain';

const calendarConfig: DayLevelCalendarConfig = {
  timezone: 'Asia/Ho_Chi_Minh',
  workingWeek: [1, 2, 3, 4, 5],
  exceptions: [
    { date: '2026-07-14', working: false, reason: 'Synthetic test holiday' },
    { date: '2026-07-18', working: true, reason: 'Synthetic test working Saturday' }
  ]
};

describe('day-level work calendar — TEST-010', () => {
  it('validates IANA provenance and applies explicit weekday exceptions deterministically', () => {
    expect(validateCalendar(calendarConfig)).toEqual({ valid: true, issues: [] });
    const calendar = new DayLevelCalendar(calendarConfig);

    expect(calendar.isWorkingDay('2026-07-13')).toBe(true);
    expect(calendar.isWorkingDay('2026-07-14')).toBe(false);
    expect(calendar.isWorkingDay('2026-07-18')).toBe(true);
    expect(calendar.addWorkdays('2026-07-13', 1)).toBe('2026-07-15');
    expect(calendar.addWorkdays('2026-07-15', -1)).toBe('2026-07-13');
    expect(calendar.countWorkdays('2026-07-13', '2026-07-18')).toBe(5);
    expect(calendar.workdayDistance('2026-07-13', '2026-07-18')).toBe(4);
  });

  it('uses inclusive activity duration while keeping zero-duration milestones on one date', () => {
    expect(addWorkDays('2026-07-13', 1, calendarConfig)).toBe('2026-07-13');
    expect(addWorkDays('2026-07-13', 5, calendarConfig)).toBe('2026-07-18');
    expect(addWorkDays('2026-07-13', 0, calendarConfig)).toBe('2026-07-13');
  });

  it('rejects hidden calendar assumptions and invalid business dates with stable codes', () => {
    expect(validateCalendar({ ...calendarConfig, timezone: 'GMT+7' })).toMatchObject({
      valid: false,
      issues: [{ code: 'INVALID_IANA_TIMEZONE', path: 'calendar' }]
    });
    expect(validateCalendar({ ...calendarConfig, workingWeek: [1, 1] })).toMatchObject({
      valid: false,
      issues: [{ code: 'INVALID_WORKING_WEEK' }]
    });
    expect(validateCalendar({
      ...calendarConfig,
      exceptions: [
        { date: '2026-07-14', working: false },
        { date: '2026-07-14', working: true }
      ]
    })).toMatchObject({ valid: false, issues: [{ code: 'DUPLICATE_CALENDAR_EXCEPTION' }] });

    const calendar = new DayLevelCalendar(calendarConfig);
    expect(() => calendar.isWorkingDay('2026-02-29')).toThrow(CalendarValidationError);
    expect(() => calendar.calculatePlannedFinish('2026-07-14', 1)).toThrow(
      expect.objectContaining({ code: 'NON_WORKING_PLANNED_START' })
    );
    expect(() => calendar.countWorkdays('2026-07-18', '2026-07-13')).toThrow(
      expect.objectContaining({ code: 'INVALID_DATE_RANGE' })
    );
  });

  it('does not change civil-date results across a daylight-saving transition', () => {
    const calendar = new DayLevelCalendar({
      timezone: 'America/New_York',
      workingWeek: [1, 2, 3, 4, 5],
      exceptions: []
    });
    expect(calendar.addWorkdays('2026-03-06', 1)).toBe('2026-03-09');
    expect(calendar.countWorkdays('2026-03-06', '2026-03-09')).toBe(2);
  });
});
