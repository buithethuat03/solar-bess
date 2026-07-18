import { riskChangeApi } from './risk-change.api';
import type { EvidenceReference } from '@/types/risk-change.types';

const auth = { accessToken: 'access', tenantId: 'tenant-id' };
const evidence: EvidenceReference[] = [{ objectType: 'DOCUMENT', objectId: '11111111-1111-4111-8111-111111111111' }];

function response(data: unknown = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

describe('risk-change API — API-038/143…164', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps Risk register and full-filter summary query names distinct', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [], meta: { nextCursor: null, limit: 50 } }));
    vi.stubGlobal('fetch', fetchMock);
    await riskChangeApi.listRisks(auth, 'project-id', {
      packageId: 'package-id', status: 'MONITORING', reviewBefore: '2026-07-20', cursor: 'opaque', limit: 50
    });
    await riskChangeApi.getSummary(auth, 'project-id', {
      packageId: 'package-id', riskStatus: 'MONITORING', riskReviewBefore: '2026-07-20',
      scoringVersion: 'S1', thresholdVersion: 'T1'
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/risks?packageId=package-id&status=MONITORING&reviewBefore=2026-07-20&cursor=opaque&limit=50');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/v1/projects/project-id/risk-change-summary?packageId=package-id&riskStatus=MONITORING&riskReviewBefore=2026-07-20&scoringVersion=S1&thresholdVersion=T1');
  });

  it('serializes closure-cycle cursor independently from register cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: {}, closureCycles: [], closureCycleMeta: { nextCursor: null, limit: 50 }
    }));
    vi.stubGlobal('fetch', fetchMock);
    await riskChangeApi.getRisk(auth, 'project-id', 'risk-id', 'closure-cursor', 100);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/risks/risk-id?closureCycleCursor=closure-cursor&closureCycleLimit=100');
  });

  it('sends four Action command branches as isolated payloads with idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await riskChangeApi.updateActionFields(auth, 'project-id', 'action-id', {
      expectedVersion: 1, ownerId: 'owner-2', status: 'IN_PROGRESS'
    }, 'routine-key');
    await riskChangeApi.completeAction(auth, 'project-id', 'action-id', {
      expectedVersion: 2, status: 'DONE', evidenceRefs: evidence,
      residualAssessment: { probability: 2, costImpactRating: 2, scheduleImpactRating: 3, hseImpactRating: 1 },
      residualRiskVersion: 7
    }, 'complete-key');
    await riskChangeApi.verifyAction(auth, 'project-id', 'action-id', {
      expectedVersion: 3, status: 'VERIFIED', evidenceRefs: evidence
    }, 'verify-key');
    await riskChangeApi.cancelAction(auth, 'project-id', 'action-id', {
      expectedVersion: 3, status: 'CANCELLED', statusReason: 'Không còn phù hợp', evidenceRefs: evidence
    }, 'cancel-key');
    const payloads = fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>);
    expect(payloads[2]).toEqual({ expectedVersion: 3, status: 'VERIFIED', evidenceRefs: evidence });
    expect(payloads[2]).not.toHaveProperty('ownerId');
    expect(payloads[2]).not.toHaveProperty('residualAssessment');
    expect(payloads[3]).not.toHaveProperty('title');
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[2]?.[1] as RequestInit).headers as Headers).get('Idempotency-Key')).toBe('verify-key');
  });

  it('uses immutable Change decision and reverse-safe detail endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await riskChangeApi.getChange(auth, 'project-id', 'change-id');
    await riskChangeApi.decideChange(auth, 'project-id', 'change-id', {
      decision: 'APPROVE', expectedVersion: 4, comment: 'Phê duyệt độc lập'
    }, 'decision-key');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/projects/project-id/change-requests/change-id');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/v1/projects/project-id/change-requests/change-id:decision');
  });
});
