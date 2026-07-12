import {
  CPM_FORMULA_VERSION,
  CriticalPathValidationError,
  calculateCriticalPath,
  validateDependencyGraph,
  type CriticalPathActivityInput,
  type DayLevelCalendarConfig,
  type ScheduleDependencyInput
} from 'src/modules/project-controls/domain';

const calendar: DayLevelCalendarConfig = {
  timezone: 'Asia/Ho_Chi_Minh',
  workingWeek: [1, 2, 3, 4, 5],
  exceptions: []
};

const activities: CriticalPathActivityInput[] = [
  { id: 'A', activityType: 'TASK', plannedStart: '2026-07-13', durationWorkDays: 3 },
  { id: 'B', activityType: 'TASK', plannedStart: '2026-07-13', durationWorkDays: 2 },
  { id: 'C', activityType: 'TASK', plannedStart: '2026-07-13', durationWorkDays: 2 },
  { id: 'D', activityType: 'MILESTONE', plannedStart: '2026-07-13', durationWorkDays: 0 },
  { id: 'E', activityType: 'TASK', plannedStart: '2026-07-13', durationWorkDays: 2 }
];

const dependencies: ScheduleDependencyInput[] = [
  { predecessorId: 'A', successorId: 'B', dependencyType: 'FS', lagWorkDays: 0 },
  { predecessorId: 'A', successorId: 'C', dependencyType: 'SS', lagWorkDays: 1 },
  { predecessorId: 'B', successorId: 'D', dependencyType: 'FF', lagWorkDays: 1 },
  { predecessorId: 'C', successorId: 'E', dependencyType: 'SF', lagWorkDays: 3 }
];

describe('dependency DAG and CPM_WORKDAY_V1 — TEST-010/TEST-011', () => {
  it('orders the DAG stably and calculates FS/SS/FF/SF early, late and float metrics', () => {
    const graph = validateDependencyGraph([...activities].reverse(), [...dependencies].reverse());
    expect(graph.valid).toBe(true);
    expect(graph.topologicalOrder).toEqual(['A', 'B', 'C', 'D', 'E']);

    const result = calculateCriticalPath(activities, dependencies, calendar, { nearCriticalFloatDays: 1 });
    expect(result.formulaVersion).toBe(CPM_FORMULA_VERSION);
    expect(result.projectStart).toBe('2026-07-13');
    expect(result.projectFinish).toBe('2026-07-20');
    expect([...result.metricsByActivity]).toEqual([
      ['A', expect.objectContaining({
        earlyStart: '2026-07-13', earlyFinish: '2026-07-15',
        lateStart: '2026-07-13', lateFinish: '2026-07-15',
        totalFloatWorkDays: 0, critical: true, nearCritical: false
      })],
      ['B', expect.objectContaining({
        earlyStart: '2026-07-16', earlyFinish: '2026-07-17',
        totalFloatWorkDays: 0, critical: true
      })],
      ['C', expect.objectContaining({
        earlyStart: '2026-07-14', earlyFinish: '2026-07-15',
        totalFloatWorkDays: 1, critical: false, nearCritical: true
      })],
      ['D', expect.objectContaining({
        earlyStart: '2026-07-20', earlyFinish: '2026-07-20',
        totalFloatWorkDays: 0, critical: true
      })],
      ['E', expect.objectContaining({
        earlyStart: '2026-07-16', earlyFinish: '2026-07-17',
        totalFloatWorkDays: 1, critical: false, nearCritical: true
      })]
    ]);
  });

  it('supports negative workday lag without using wall-clock arithmetic', () => {
    const result = calculateCriticalPath(
      activities.slice(0, 2),
      [{ predecessorId: 'A', successorId: 'B', dependencyType: 'FS', lagWorkDays: -1 }],
      calendar
    );
    expect(result.metricsByActivity.get('B')).toMatchObject({
      earlyStart: '2026-07-15',
      earlyFinish: '2026-07-16'
    });
  });

  it('reports self links, unknown scope, lag bounds and the concrete cycle path', () => {
    const invalid = validateDependencyGraph(
      [
        { id: 'A', tenantId: 'tenant-1', projectId: 'project-1', scheduleId: 'schedule-1' },
        { id: 'B', tenantId: 'tenant-1', projectId: 'project-1', scheduleId: 'schedule-1' },
        { id: 'C', tenantId: 'tenant-1', projectId: 'project-1', scheduleId: 'schedule-1' }
      ],
      [
        { predecessorId: 'A', successorId: 'B', dependencyType: 'FS', lagWorkDays: 0 },
        { predecessorId: 'B', successorId: 'C', dependencyType: 'FS', lagWorkDays: 0 },
        { predecessorId: 'C', successorId: 'A', dependencyType: 'FS', lagWorkDays: 0 },
        { predecessorId: 'A', successorId: 'A', dependencyType: 'FS', lagWorkDays: 0 },
        { predecessorId: 'missing', successorId: 'B', dependencyType: 'FS', lagWorkDays: 3651 }
      ],
      {
        maxAbsoluteLagDays: 3650,
        scope: { tenantId: 'tenant-1', projectId: 'project-1', scheduleId: 'schedule-1' }
      }
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.topologicalOrder).toEqual([]);
    expect(invalid.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SELF_DEPENDENCY' }),
      expect.objectContaining({ code: 'UNKNOWN_PREDECESSOR' }),
      expect.objectContaining({ code: 'LAG_OUT_OF_RANGE' }),
      expect.objectContaining({ code: 'DEPENDENCY_CYCLE', cycle: ['A', 'B', 'C', 'A'] })
    ]));
  });

  it('fails closed when a known activity belongs to another schedule — TEST-193', () => {
    const result = validateDependencyGraph(
      [{
        id: 'outside', tenantId: 'tenant-1', projectId: 'project-1', scheduleId: 'schedule-2'
      }],
      [],
      { scope: { tenantId: 'tenant-1', projectId: 'project-1', scheduleId: 'schedule-1' } }
    );
    expect(result).toMatchObject({
      valid: false,
      issues: [{ code: 'ACTIVITY_SCOPE_MISMATCH', path: 'activities[0]' }]
    });
  });

  it('rejects a non-canonical imported finish instead of silently accepting it', () => {
    expect(() => calculateCriticalPath(
      [{
        id: 'A', activityType: 'TASK', plannedStart: '2026-07-13',
        plannedFinish: '2026-07-16', durationWorkDays: 3
      }],
      [],
      calendar
    )).toThrow(CriticalPathValidationError);
    try {
      calculateCriticalPath([{
        id: 'A', activityType: 'TASK', plannedStart: '2026-07-13',
        plannedFinish: '2026-07-16', durationWorkDays: 3
      }], [], calendar);
    } catch (error) {
      expect((error as CriticalPathValidationError).issues).toEqual([
        expect.objectContaining({ code: 'PLANNED_FINISH_MISMATCH' })
      ]);
    }
  });
});
