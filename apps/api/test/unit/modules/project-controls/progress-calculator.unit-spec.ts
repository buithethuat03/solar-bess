import {
  SPI_FORMULA_VERSION,
  calculateProgress,
  calculateSpi,
  type DayLevelCalendarConfig
} from 'src/modules/project-controls/domain';

const calendar: DayLevelCalendarConfig = {
  timezone: 'Asia/Ho_Chi_Minh',
  workingWeek: [1, 2, 3, 4, 5],
  exceptions: []
};

describe('SPI_WEIGHTED_LINEAR_V1 — TEST-011', () => {
  it('multiplies WBS/activity weights and interpolates planned progress by workday', () => {
    const result = calculateProgress(
      [
        {
          id: 'engineering-task', wbsId: 'engineering', weight: '100.0000',
          plannedStart: '2026-07-13', durationWorkDays: 5, percentComplete: '50.00'
        },
        {
          id: 'construction-task', wbsId: 'construction', weight: '100.0000',
          plannedStart: '2026-07-13', durationWorkDays: 10, percentComplete: '20.00'
        }
      ],
      '2026-07-15',
      calendar,
      [
        { id: 'engineering', weight: '60.0000' },
        { id: 'construction', weight: '40.0000' }
      ]
    );

    expect(result).toMatchObject({
      formulaVersion: SPI_FORMULA_VERSION,
      dataDate: '2026-07-15',
      plannedProgress: '48.0000',
      actualProgress: '38.0000',
      spi: '0.7917'
    });
    expect(result.activityMetrics).toEqual([
      expect.objectContaining({
        activityId: 'construction-task', effectiveWeight: '40.0000',
        plannedProgress: '30.0000', weightedPlannedContribution: '12.0000',
        actualProgress: '20.0000', weightedActualContribution: '8.0000'
      }),
      expect.objectContaining({
        activityId: 'engineering-task', effectiveWeight: '60.0000',
        plannedProgress: '60.0000', weightedPlannedContribution: '36.0000',
        actualProgress: '50.0000', weightedActualContribution: '30.0000'
      })
    ]);
  });

  it('treats a milestone as planned at its date and supports project-level activity weights', () => {
    const result = calculateProgress([
      {
        id: 'milestone', weight: '25.0000', plannedStart: '2026-07-13',
        durationWorkDays: 0, percentComplete: '100.00'
      },
      {
        id: 'task', weight: '75.0000', plannedStart: '2026-07-13',
        durationWorkDays: 1, percentComplete: '50.00'
      }
    ], '2026-07-13', calendar);
    expect(result).toMatchObject({
      plannedProgress: '100.0000',
      actualProgress: '62.5000',
      spi: '0.6250'
    });
  });

  it('returns N/A rather than inventing SPI when the planned denominator is zero', () => {
    const result = calculateProgress([{
      id: 'future', weight: '100.0000', plannedStart: '2026-07-20',
      durationWorkDays: 5, percentComplete: '10.00'
    }], '2026-07-17', calendar);
    expect(result).toMatchObject({ plannedProgress: '0.0000', actualProgress: '10.0000', spi: null });
    expect(calculateSpi('10.0000', '0.0000')).toBeNull();
  });

  it('keeps exact public SPI rounding at four decimal places', () => {
    expect(calculateSpi('38.0000', '48.0000')).toBe('0.7917');
  });
});
