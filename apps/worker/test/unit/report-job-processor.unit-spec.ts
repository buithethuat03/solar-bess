import type { PoolClient } from 'pg';
import type { DomainEventJob } from '../../src/domain-event';
import type { ReportStorage, StoredReportRef } from '../../src/report-storage';
import type { WorkerLogger } from '../../src/worker-logger';
import {
  csvDocument,
  csvField,
  REPORT_EXPIRY_MS,
  ReportJobProcessor,
  RISK_REGISTER_CSV_HEADER
} from '../../src/report-job.processor';

const tenantId = '20000000-0000-4000-8000-000000000001';
const jobId = '40000000-0000-4000-8000-000000000001';
const projectId = '50000000-0000-4000-8000-000000000001';
const requesterId = '70000000-0000-4000-8000-000000000001';
const dataAsOf = new Date('2026-07-26T10:00:00.000Z');

interface RecordedQuery { sql: string; params: unknown[] }

function fakeClient(
  route: (sql: string, params: unknown[]) => { rows?: unknown[]; rowCount?: number } | undefined,
  recorded: RecordedQuery[]
): PoolClient {
  return {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      recorded.push({ sql, params });
      const result = route(sql, params) ?? { rows: [], rowCount: 0 };
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? (result.rows?.length ?? 0) };
    })
  } as unknown as PoolClient;
}

class FakeStorage implements ReportStorage {
  puts: Array<{ objectKey: string; body: string; contentType: string }> = [];
  async put(objectKey: string, body: Buffer, contentType: string): Promise<StoredReportRef> {
    this.puts.push({ objectKey, body: body.toString('utf8'), contentType });
    return { bucket: 'release-bucket', objectKey };
  }
}

function event(overrides: Partial<DomainEventJob> = {}): DomainEventJob {
  return {
    eventId: '10000000-0000-4000-8000-000000000001',
    tenantId,
    actorId: requesterId,
    eventKey: 'report:test',
    aggregateType: 'ReportJob',
    aggregateId: jobId,
    aggregateVersion: 1,
    eventType: 'ReportJob.Requested',
    schemaVersion: 1,
    payload: { reportType: 'RISK_REGISTER_CSV', projectId },
    occurredAt: '2026-07-26T00:00:00.000Z',
    correlationId: '60000000-0000-4000-8000-000000000001',
    ...overrides
  };
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: jobId,
    reportType: 'RISK_REGISTER_CSV',
    status: 'QUEUED',
    filterSnapshot: { projectId },
    requestedBy: requesterId,
    ...overrides
  };
}

const logger: WorkerLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('ReportJobProcessor — API-133 worker side', () => {
  it('supports exactly the ReportJob.Requested event', () => {
    const processor = new ReportJobProcessor(new FakeStorage(), logger);
    expect(processor.supports(event())).toBe(true);
    expect(processor.supports(event({ eventType: 'ReportJob.Completed' }))).toBe(false);
    expect(processor.supports(event({ aggregateType: 'Risk' }))).toBe(false);
  });

  it('escapes CSV fields RFC-4180 style and never loses a quote', () => {
    expect(csvField(null)).toBe('');
    expect(csvField('plain')).toBe('plain');
    expect(csvField('has,comma')).toBe('"has,comma"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvDocument(['a', 'b'], [['1', 'x,y']])).toBe('a,b\n1,"x,y"\n');
  });

  it('skips a replayed event whose job is already terminal', async () => {
    const recorded: RecordedQuery[] = [];
    const storage = new FakeStorage();
    const client = fakeClient((sql) => {
      if (sql.includes('FROM report_jobs')) return { rows: [jobRow({ status: 'COMPLETED' })] };
      return undefined;
    }, recorded);
    await new ReportJobProcessor(storage, logger).process(client, event());
    expect(storage.puts).toHaveLength(0);
    expect(recorded.some((query) => query.sql.includes("status = 'RUNNING'"))).toBe(false);
  });

  it('fails the job with PERMISSION_REVOKED when the requester lost live reach', async () => {
    const recorded: RecordedQuery[] = [];
    const storage = new FakeStorage();
    const client = fakeClient((sql) => {
      if (sql.includes('FROM report_jobs')) return { rows: [jobRow()] };
      if (sql.includes('FROM role_assignments assignment')) return { rows: [] };
      if (sql.includes('FROM projects')) return { rows: [{ ok: 1 }], rowCount: 1 };
      return undefined;
    }, recorded);
    await new ReportJobProcessor(storage, logger).process(client, event());
    const failed = recorded.find((query) => query.sql.includes("status = 'FAILED'"));
    expect(failed).toBeDefined();
    expect(failed!.params[2]).toBe('PERMISSION_REVOKED');
    expect(storage.puts).toHaveLength(0);
  });

  it('renders the scoped risk register, stores it and completes with a 72h expiry', async () => {
    const recorded: RecordedQuery[] = [];
    const storage = new FakeStorage();
    const client = fakeClient((sql) => {
      if (sql.includes('FROM report_jobs')) return { rows: [jobRow()] };
      if (sql.includes('FROM role_assignments assignment')) {
        return { rows: [{ scopeType: 'PROJECT', scopeId: projectId }] };
      }
      if (sql.includes('FROM projects')) return { rows: [{ ok: 1 }], rowCount: 1 };
      if (sql.includes('FROM risks risk')) {
        return {
          rows: [{
            code: 'RSK-001', category: 'Thi công', event: 'Mưa lớn, "ngập" hố móng',
            status: 'ASSESSED', inherentLevel: 'HIGH', inherentExposure: 16,
            residualLevel: null, residualExposure: null, reviewDate: '2026-08-01',
            ownerId: requesterId, packageId: null
          }]
        };
      }
      return undefined;
    }, recorded);

    const processor = new ReportJobProcessor(storage, logger, () => dataAsOf);
    await processor.process(client, event());

    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0].objectKey).toBe(`reports/${tenantId}/${jobId}.csv`);
    expect(storage.puts[0].contentType).toContain('text/csv');
    const [header, row] = storage.puts[0].body.trim().split('\n');
    expect(header).toBe(RISK_REGISTER_CSV_HEADER.join(','));
    expect(row).toContain('RSK-001');
    expect(row).toContain('"Mưa lớn, ""ngập"" hố móng"');

    const completed = recorded.find((query) => query.sql.includes("status = 'COMPLETED'"));
    expect(completed).toBeDefined();
    expect(completed!.params[2]).toEqual(dataAsOf);
    expect(JSON.parse(completed!.params[3] as string)).toEqual({
      bucket: 'release-bucket', objectKey: `reports/${tenantId}/${jobId}.csv`
    });
    expect((completed!.params[4] as Date).getTime()).toBe(dataAsOf.getTime() + REPORT_EXPIRY_MS);
  });

  it('propagates a storage outage without marking the job FAILED, so the queue retries', async () => {
    const recorded: RecordedQuery[] = [];
    const brokenStorage: ReportStorage = {
      put: async () => { throw new Error('minio unreachable'); }
    };
    const client = fakeClient((sql) => {
      if (sql.includes('FROM report_jobs')) return { rows: [jobRow()] };
      if (sql.includes('FROM role_assignments assignment')) {
        return { rows: [{ scopeType: 'TENANT', scopeId: null }] };
      }
      if (sql.includes('FROM projects')) return { rows: [{ ok: 1 }], rowCount: 1 };
      if (sql.includes('FROM risks risk')) return { rows: [] };
      return undefined;
    }, recorded);
    await expect(new ReportJobProcessor(brokenStorage, logger).process(client, event()))
      .rejects.toThrow('minio unreachable');
    expect(recorded.some((query) => query.sql.includes("status = 'FAILED'"))).toBe(false);
  });
});
