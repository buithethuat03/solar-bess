import type { Pool } from 'pg';
import type { WorkerConfig } from '../../src/config';
import {
  RiskChangeAlertProcessor, RiskChangeAlertScanner
} from '../../src/risk-change-alert.processor';
import type { WorkerLogger } from '../../src/worker-logger';

async function waitFor(check: () => boolean, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for Risk/Change scanner test condition');
}

function workerConfig(): WorkerConfig {
  return {
    riskChange: {
      highExposureThreshold: 15,
      criticalExposureThreshold: 20,
      alertScanIntervalMs: 60_000,
      thresholdVersion: 'RISK_CHANGE_THRESHOLDS_V1'
    },
    shutdownTimeoutMs: 1_000
  } as WorkerConfig;
}

describe('RiskChangeAlertScanner reconciliation boundary — TEST-015/194', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const projectId = '20000000-0000-4000-8000-000000000001';

  it('commits each project reconciliation and releases its dedicated client', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const release = jest.fn();
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ tenantId, projectId }] }),
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release })
    } as unknown as Pool;
    const scanProject = jest.fn().mockResolvedValue(4);
    const processor = { scanProject } as unknown as RiskChangeAlertProcessor;
    const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const scanner = new RiskChangeAlertScanner(pool, processor, workerConfig(), logger);

    scanner.start();
    await waitFor(() => release.mock.calls.length === 1);
    await scanner.stop();

    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(scanProject).toHaveBeenCalledWith(expect.anything(), tenantId, projectId);
    expect(release).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rolls back a failed project and keeps future scans available', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const release = jest.fn();
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ tenantId, projectId }] }),
      connect: jest.fn().mockResolvedValue({ query: clientQuery, release })
    } as unknown as Pool;
    const scanProject = jest.fn().mockRejectedValue(new Error('synthetic reconciliation failure'));
    const processor = { scanProject } as unknown as RiskChangeAlertProcessor;
    const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const scanner = new RiskChangeAlertScanner(pool, processor, workerConfig(), logger);

    scanner.start();
    await waitFor(() => release.mock.calls.length === 1);
    await scanner.stop();

    expect(clientQuery.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'risk_change_alert_project_scan_failed',
      expect.objectContaining({ tenantId, projectId, errorCode: expect.stringMatching(/^ERR_/) })
    );
  });
});
