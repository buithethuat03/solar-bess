import { CodGateStatus } from '../../../database/entities';

/**
 * The COD readiness evaluator (API-104, FR-112) as a PURE function.
 *
 * Reading the rows is the service's job — and it reads them through the caller's ABAC scope, never
 * around it. Deciding what those rows mean is this function's job, which is why it is a pure
 * transformation over already-authorized input: the same evaluation answers the GET in API-104 and
 * gates `SIGN_COD` in API-105, and a signature must never be judged by a second, drifting copy of
 * these rules.
 */

export interface ReadinessGate {
  id: string;
  category: string;
  code: string;
  status: CodGateStatus;
  mandatory: boolean;
  waivable: boolean;
  /** ISO date (yyyy-mm-dd) or null. AC-059: expired evidence can never satisfy a gate. */
  evidenceExpiry: string | null;
}

/** One open finding that blocks COD, already narrowed to what the caller may see. */
export interface BlockingFinding {
  type: 'PUNCH_ITEM' | 'NCR' | 'STOP_WORK';
  id: string;
  reference: string;
  detail: string;
}

export interface ReadinessInput {
  gates: readonly ReadinessGate[];
  findings: readonly BlockingFinding[];
  /** Evaluation instant; evidence expiry is compared against this date, never against `new Date()`. */
  asOf: Date;
}

export interface CategoryReadiness {
  category: string;
  total: number;
  satisfied: number;
  outstanding: number;
}

export interface ReadinessEvaluation {
  asOf: string;
  gates: {
    total: number;
    accepted: number;
    waived: number;
    pending: number;
    underReview: number;
    rejected: number;
    mandatoryTotal: number;
    mandatoryOutstanding: number;
  };
  categories: CategoryReadiness[];
  /** Gates whose acceptance rests on evidence that has lapsed as of `asOf`. */
  expiredEvidenceGateIds: string[];
  blockingFindings: {
    punchItems: number;
    criticalNcrs: number;
    stopWorks: number;
    total: number;
    items: BlockingFinding[];
  };
  /** True when at least one blocking finding is open — SIGN_COD is refused with GATE_BLOCKED. */
  blocked: boolean;
  /** True when nothing blocks and every mandatory gate is satisfied with unexpired evidence. */
  readyToSign: boolean;
}

/** A gate counts as satisfied when it is ACCEPTED or WAIVED and its evidence has not lapsed. */
export function isGateSatisfied(gate: ReadinessGate, asOf: Date): boolean {
  if (gate.status !== CodGateStatus.ACCEPTED && gate.status !== CodGateStatus.WAIVED) return false;
  return !isEvidenceExpired(gate, asOf);
}

/** AC-059: a gate resting on evidence that expired before `asOf` no longer satisfies anything. */
export function isEvidenceExpired(gate: ReadinessGate, asOf: Date): boolean {
  if (gate.evidenceExpiry === null) return false;
  const expiry = Date.parse(`${gate.evidenceExpiry}T23:59:59.999Z`);
  return Number.isFinite(expiry) && expiry < asOf.getTime();
}

export function evaluateReadiness(input: ReadinessInput): ReadinessEvaluation {
  const { gates, findings, asOf } = input;
  const counted = (status: CodGateStatus) => gates.filter((gate) => gate.status === status).length;
  const mandatory = gates.filter((gate) => gate.mandatory);
  const expiredEvidenceGateIds = gates
    .filter((gate) => (
      (gate.status === CodGateStatus.ACCEPTED || gate.status === CodGateStatus.WAIVED)
      && isEvidenceExpired(gate, asOf)
    ))
    .map((gate) => gate.id);

  const categories = [...new Set(gates.map((gate) => gate.category))].sort().map((category) => {
    const scoped = gates.filter((gate) => gate.category === category);
    const satisfied = scoped.filter((gate) => isGateSatisfied(gate, asOf)).length;
    return {
      category, total: scoped.length, satisfied, outstanding: scoped.length - satisfied
    };
  });

  const items = [...findings];
  const blockingFindings = {
    punchItems: items.filter((finding) => finding.type === 'PUNCH_ITEM').length,
    criticalNcrs: items.filter((finding) => finding.type === 'NCR').length,
    stopWorks: items.filter((finding) => finding.type === 'STOP_WORK').length,
    total: items.length,
    items
  };
  const mandatoryOutstanding = mandatory
    .filter((gate) => !isGateSatisfied(gate, asOf)).length;
  const blocked = blockingFindings.total > 0;

  return {
    asOf: asOf.toISOString(),
    gates: {
      total: gates.length,
      accepted: counted(CodGateStatus.ACCEPTED),
      waived: counted(CodGateStatus.WAIVED),
      pending: counted(CodGateStatus.PENDING),
      underReview: counted(CodGateStatus.UNDER_REVIEW),
      rejected: counted(CodGateStatus.REJECTED),
      mandatoryTotal: mandatory.length,
      mandatoryOutstanding
    },
    categories,
    expiredEvidenceGateIds,
    blockingFindings,
    blocked,
    readyToSign: !blocked && mandatoryOutstanding === 0
  };
}
