import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleApi } from './schedule.api';
import type { ApplyScheduleDraftRequest } from '@/types/schedule.types';

const auth = { accessToken: 'access-token', tenantId: 'tenant-id' };

function jsonResponse(data: unknown = {}): Response {
  return new Response(JSON.stringify({ data, correlationId: 'correlation-id' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('Schedule API — API-034…037/140/141', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('serializes the schedule snapshot query and central auth context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await scheduleApi.getProjectSchedule(auth, 'project-id', {
      dataDate: '2026-07-12', lookAheadDays: 35, baselineNumber: 2
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/projects/project-id/schedule?dataDate=2026-07-12&lookAheadDays=35&baselineNumber=2');
    expect(options.method).toBe('GET');
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('X-Tenant-Id')).toBe('tenant-id');
  });

  it('sends an explicit preview delta with its idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);
    const input: ApplyScheduleDraftRequest = {
      mode: 'PREVIEW',
      expectedVersion: 4,
      source: { format: 'CANONICAL_JSON', sourceName: 'schedule.json' },
      calendar: { timezone: 'Asia/Ho_Chi_Minh', calendarCode: 'STANDARD', workingWeek: [1, 2, 3, 4, 5], exceptions: [] },
      wbsUpserts: [], activityUpserts: [], dependencyUpserts: [],
      archiveWbsIds: [], archiveActivityIds: [], unlinkDependencyIds: []
    };

    await scheduleApi.applyDraft(auth, 'project-id', input, 'draft-key');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/projects/project-id/schedule:apply-draft');
    expect(options.method).toBe('POST');
    expect((options.headers as Headers).get('Idempotency-Key')).toBe('draft-key');
    expect(JSON.parse(options.body as string)).toEqual(input);
  });

  it('routes progress and baseline decisions to their canonical command URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal('fetch', fetchMock);

    await scheduleApi.recordProgress(auth, 'project-id', {
      activityId: 'activity-id', dataDate: '2026-07-12', percentComplete: '40',
      remainingDurationWorkDays: 6, expectedActivityVersion: 3
    }, 'progress-key');
    await scheduleApi.decideBaseline(auth, 'baseline-id', {
      decision: 'RETURN', comment: 'Bổ sung logic đường găng', expectedVersion: 2
    }, 'decision-key');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/progress-updates');
    expect((fetchMock.mock.calls[0]?.[1].headers as Headers).get('Idempotency-Key')).toBe('progress-key');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/v1/schedule-baselines/baseline-id:decision');
    expect((fetchMock.mock.calls[1]?.[1].headers as Headers).get('Idempotency-Key')).toBe('decision-key');
  });

  it('reads cursor-paginated progress history for correction selection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await scheduleApi.listProgressHistory(auth, 'project-id', 'activity-id', 'cursor-id');

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      '/v1/projects/project-id/progress-updates?activityId=activity-id&limit=100&cursor=cursor-id'
    );
    expect(options.method).toBe('GET');
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('requests the audited look-ahead CSV with the active snapshot filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('csv-body', {
      status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await scheduleApi.exportLookAhead(auth, 'project-id', {
      dataDate: '2026-07-12', lookAheadDays: 21
    });

    expect(result).toBe('csv-body');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/v1/projects/project-id/schedule-look-ahead.csv?dataDate=2026-07-12&lookAheadDays=21'
    );
  });
});
