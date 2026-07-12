import type { Pool } from 'pg';
import type { WorkerConfig } from '../../src/config';
import {
  ScheduleAlertProcessor, ScheduleAlertScanner
} from '../../src/schedule-alert.processor';
import type { WorkerLogger } from '../../src/worker-logger';

async function waitFor(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for schedule scanner test condition');
}

function workerConfig(): WorkerConfig {
  return {
    schedule: {
      nearCriticalFloatDays: 5,
      alertScanIntervalMs: 60_000,
      thresholdVersion: 'SCHEDULE_THRESHOLDS_V1'
    },
    shutdownTimeoutMs: 1_000
  } as WorkerConfig;
}

describe('ScheduleAlertScanner transaction boundary — TEST-013/194', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const projectId = '20000000-0000-4000-8000-000000000001';

  it('commits each project scan and releases its dedicated client', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const release = jest.fn();
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ tenantId, projectId }] }),
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release })
    } as unknown as Pool;
    const scanProject = jest.fn().mockResolvedValue(2);
    const processor = { scanProject } as unknown as ScheduleAlertProcessor;
    const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const scanner = new ScheduleAlertScanner(pool, processor, workerConfig(), logger);

    scanner.start();
    await waitFor(() => release.mock.calls.length === 1);
    await scanner.stop();

    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(scanProject).toHaveBeenCalledWith(expect.anything(), tenantId, projectId);
    expect(release).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rolls back one failed project without leaking its client', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const release = jest.fn();
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ tenantId, projectId }] }),
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release })
    } as unknown as Pool;
    const scanProject = jest.fn().mockRejectedValue(new Error('synthetic scan failure'));
    const processor = { scanProject } as unknown as ScheduleAlertProcessor;
    const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const scanner = new ScheduleAlertScanner(pool, processor, workerConfig(), logger);

    scanner.start();
    await waitFor(() => release.mock.calls.length === 1);
    await scanner.stop();

    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'schedule_alert_project_scan_failed',
      expect.objectContaining({ tenantId, projectId, errorCode: expect.stringMatching(/^ERR_/) })
    );
  });
});
