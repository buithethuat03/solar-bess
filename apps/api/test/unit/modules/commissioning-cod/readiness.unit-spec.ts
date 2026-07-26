import { randomUUID } from 'node:crypto';
import { CodGateStatus } from 'src/database/entities';
import {
  evaluateReadiness, isEvidenceExpired, isGateSatisfied, type BlockingFinding, type ReadinessGate
} from 'src/modules/commissioning-cod/domain/readiness';

const asOf = new Date('2026-07-26T00:00:00.000Z');

function gate(overrides: Partial<ReadinessGate> = {}): ReadinessGate {
  return {
    id: randomUUID(), category: 'TECHNICAL', code: 'GATE-1',
    status: CodGateStatus.ACCEPTED, mandatory: true, waivable: false, evidenceExpiry: null,
    ...overrides
  };
}

function finding(overrides: Partial<BlockingFinding> = {}): BlockingFinding {
  return {
    type: 'PUNCH_ITEM', id: randomUUID(), reference: 'PN-001',
    detail: 'category A punch item is OPEN', ...overrides
  };
}

describe('COD readiness evaluator — API-104/FR-112', () => {
  it('reports a clear project as ready to sign', () => {
    const evaluation = evaluateReadiness({
      gates: [
        gate({ category: 'LEGAL', code: 'L-1' }),
        gate({ category: 'SAFETY', code: 'S-1', status: CodGateStatus.WAIVED, waivable: true })
      ],
      findings: [], asOf
    });
    expect(evaluation.gates).toMatchObject({
      total: 2, accepted: 1, waived: 1, mandatoryTotal: 2, mandatoryOutstanding: 0
    });
    expect(evaluation.blocked).toBe(false);
    expect(evaluation.readyToSign).toBe(true);
    expect(evaluation.asOf).toBe(asOf.toISOString());
  });

  it('blocks on an open category-A punch item and names it', () => {
    const punch = finding({ reference: 'PN-A1' });
    const evaluation = evaluateReadiness({ gates: [gate()], findings: [punch], asOf });
    expect(evaluation.blocked).toBe(true);
    expect(evaluation.readyToSign).toBe(false);
    expect(evaluation.blockingFindings).toMatchObject({
      punchItems: 1, criticalNcrs: 0, stopWorks: 0, total: 1
    });
    expect(evaluation.blockingFindings.items[0].reference).toBe('PN-A1');
  });

  it('counts each blocking finding type separately', () => {
    const evaluation = evaluateReadiness({
      gates: [gate()],
      findings: [
        finding(),
        finding({ type: 'NCR', reference: 'NCR-9', detail: 'critical NCR is OPEN' }),
        finding({ type: 'NCR', reference: 'NCR-10', detail: 'critical NCR is CONTAINED' }),
        finding({ type: 'STOP_WORK', reference: 'PROJECT', detail: 'unlifted stop-work' })
      ],
      asOf
    });
    expect(evaluation.blockingFindings).toMatchObject({
      punchItems: 1, criticalNcrs: 2, stopWorks: 1, total: 4
    });
    expect(evaluation.blocked).toBe(true);
  });

  it('refuses readiness while a mandatory gate is outstanding, even with nothing blocking', () => {
    const evaluation = evaluateReadiness({
      gates: [
        gate({ code: 'G-1' }),
        gate({ code: 'G-2', status: CodGateStatus.PENDING }),
        gate({ code: 'G-3', status: CodGateStatus.UNDER_REVIEW }),
        gate({ code: 'G-4', status: CodGateStatus.REJECTED })
      ],
      findings: [], asOf
    });
    expect(evaluation.blocked).toBe(false);
    expect(evaluation.readyToSign).toBe(false);
    expect(evaluation.gates.mandatoryOutstanding).toBe(3);
    expect(evaluation.gates).toMatchObject({ pending: 1, underReview: 1, rejected: 1 });
  });

  it('ignores an outstanding NON-mandatory gate', () => {
    const evaluation = evaluateReadiness({
      gates: [gate(), gate({ code: 'INFO-1', status: CodGateStatus.PENDING, mandatory: false })],
      findings: [], asOf
    });
    expect(evaluation.gates.mandatoryOutstanding).toBe(0);
    expect(evaluation.readyToSign).toBe(true);
  });

  it('treats an accepted gate whose evidence has lapsed as outstanding (AC-059)', () => {
    const lapsed = gate({ code: 'DOC-1', evidenceExpiry: '2026-07-25' });
    const evaluation = evaluateReadiness({ gates: [lapsed], findings: [], asOf });
    expect(evaluation.expiredEvidenceGateIds).toEqual([lapsed.id]);
    expect(evaluation.gates.mandatoryOutstanding).toBe(1);
    expect(evaluation.readyToSign).toBe(false);
  });

  it('keeps evidence valid through the whole of its expiry day', () => {
    const sameDay = gate({ evidenceExpiry: '2026-07-26' });
    expect(isEvidenceExpired(sameDay, asOf)).toBe(false);
    expect(isGateSatisfied(sameDay, asOf)).toBe(true);
    expect(isEvidenceExpired(sameDay, new Date('2026-07-27T00:00:00.000Z'))).toBe(true);
  });

  it('never expires a gate that carries no expiry', () => {
    expect(isEvidenceExpired(gate({ evidenceExpiry: null }), asOf)).toBe(false);
  });

  it('summarizes each category independently and sorts them', () => {
    const evaluation = evaluateReadiness({
      gates: [
        gate({ category: 'SAFETY', code: 'S-1' }),
        gate({ category: 'LEGAL', code: 'L-1', status: CodGateStatus.PENDING }),
        gate({ category: 'LEGAL', code: 'L-2' })
      ],
      findings: [], asOf
    });
    expect(evaluation.categories).toEqual([
      { category: 'LEGAL', total: 2, satisfied: 1, outstanding: 1 },
      { category: 'SAFETY', total: 1, satisfied: 1, outstanding: 0 }
    ]);
  });

  it('is a pure function: the same input yields a deeply equal result', () => {
    const gates = [gate({ code: 'G-1' }), gate({ code: 'G-2', status: CodGateStatus.PENDING })];
    const findings = [finding()];
    expect(evaluateReadiness({ gates, findings, asOf }))
      .toEqual(evaluateReadiness({ gates, findings, asOf }));
  });

  it('handles a project with no gates at all — nothing outstanding, still blockable', () => {
    expect(evaluateReadiness({ gates: [], findings: [], asOf })).toMatchObject({
      readyToSign: true, blocked: false, categories: []
    });
    expect(evaluateReadiness({ gates: [], findings: [finding()], asOf }).readyToSign).toBe(false);
  });
});
