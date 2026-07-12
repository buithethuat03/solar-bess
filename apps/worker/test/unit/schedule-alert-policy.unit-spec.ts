import type { WorkerConfig } from '../../src/config';
import type { DomainEventJob } from '../../src/domain-event';
import { evaluateScheduleAlerts } from '../../src/schedule-alert.policy';
import { ScheduleAlertProcessor } from '../../src/schedule-alert.processor';
import type { WorkerLogger } from '../../src/worker-logger';

const calendar = { workingWeek: [1, 2, 3, 4, 5], exceptions: [] };

describe('schedule alert projection policy — TEST-013/194', () => {
  it('emits overdue and bounded near-critical candidates deterministically', () => {
    const alerts = evaluateScheduleAlerts([
      {
        id: 'a', plannedStart: '2026-07-06', plannedFinish: '2026-07-10',
        durationWorkDays: 5, percentComplete: '20.00', status: 'IN_PROGRESS'
      },
      {
        id: 'b', plannedStart: '2026-07-13', plannedFinish: '2026-07-14',
        durationWorkDays: 2, percentComplete: '0.00', status: 'READY'
      },
      {
        id: 'c', plannedStart: '2026-07-06', plannedFinish: '2026-07-06',
        durationWorkDays: 1, percentComplete: '0.00', status: 'READY'
      }
    ], [{
      predecessorId: 'a', successorId: 'b', dependencyType: 'FS', lagWorkDays: 0
    }], calendar, '2026-07-12', 10);

    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ activityId: 'a', alertType: 'OVERDUE', priority: 'HIGH' }),
      expect.objectContaining({ activityId: 'c', alertType: 'OVERDUE', priority: 'HIGH' }),
      expect.objectContaining({ activityId: 'c', alertType: 'NEAR_CRITICAL', priority: 'NORMAL' })
    ]));
  });

  it('rejects a cyclic graph instead of materializing misleading alerts', () => {
    const activities = ['a', 'b'].map((id) => ({
      id, plannedStart: '2026-07-06', plannedFinish: '2026-07-06',
      durationWorkDays: 1, percentComplete: '0', status: 'READY'
    }));
    expect(() => evaluateScheduleAlerts(activities, [
      { predecessorId: 'a', successorId: 'b', dependencyType: 'FS', lagWorkDays: 0 },
      { predecessorId: 'b', successorId: 'a', dependencyType: 'FS', lagWorkDays: 0 }
    ], calendar, '2026-07-12', 5)).toThrow('cycle');
  });

  it('routes only Project Controls event types to the projection', () => {
    const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const processor = new ScheduleAlertProcessor({} as WorkerConfig, logger);
    const event = { eventType: 'ProgressRecorded' } as DomainEventJob;
    expect(processor.supports(event)).toBe(true);
    expect(processor.supports({ ...event, eventType: 'PROJECT_CREATED' })).toBe(false);
  });
});
