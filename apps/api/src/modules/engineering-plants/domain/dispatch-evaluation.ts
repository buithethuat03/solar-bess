import {
  absDecimal, compareDecimal, isDecimalString, multiplyDecimalByInt, subtractDecimal
} from './exact-decimal';

/**
 * API-075 — STATELESS advisory evaluation of a dispatch scenario against a released BESS
 * operating envelope (FR-133, SEC-128).
 *
 * This file is pure TypeScript with zero I/O: it reads the envelope document stored on
 * DB-082, compares the scenario against its bounds with exact decimal string arithmetic, and
 * returns a verdict. It persists nothing, emits nothing, and by construction cannot address any
 * OT system — there is no connectivity data anywhere in its inputs (the schema-level absence of
 * such columns is the SEC-127/SEC-128 control).
 */

/** Canonical envelope document shape stored in bess_plants.operating_envelope. */
export interface OperatingEnvelopeBounds {
  power: { minMw: string; maxMw: string };
  stateOfCharge?: { minPercent: string; maxPercent: string };
  ramp?: { maxMwPerMinute: string };
}

export interface DispatchScenario {
  intervalMinutes: number;
  initialSocPercent?: string;
  steps: Array<{ powerMw: string }>;
}

export type DispatchViolationCode =
  | 'POWER_ABOVE_MAX'
  | 'POWER_BELOW_MIN'
  | 'RAMP_EXCEEDED'
  | 'SOC_OUT_OF_ENVELOPE';

export interface DispatchViolation {
  code: DispatchViolationCode;
  stepIndex: number | null;
  limit: string;
  actual: string;
}

export interface DispatchEvaluation {
  feasible: boolean;
  evaluatedSteps: number;
  violations: DispatchViolation[];
}

/**
 * Parses the stored jsonb envelope into typed bounds. Returns null when the document does not
 * carry the minimum shape (power min/max as decimal strings) — the caller maps that to
 * OPERATING_ENVELOPE_INVALID. Optional blocks (SOC, ramp) are validated only when present.
 */
export function parseOperatingEnvelope(raw: unknown): OperatingEnvelopeBounds | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const document = raw as Record<string, unknown>;
  const power = document.power as Record<string, unknown> | undefined;
  if (typeof power !== 'object' || power === null
    || !isDecimalString(power.minMw) || !isDecimalString(power.maxMw)
    || compareDecimal(power.minMw, power.maxMw) === 1) {
    return null;
  }
  const bounds: OperatingEnvelopeBounds = {
    power: { minMw: power.minMw, maxMw: power.maxMw }
  };
  if (document.stateOfCharge !== undefined) {
    const soc = document.stateOfCharge as Record<string, unknown>;
    if (typeof soc !== 'object' || soc === null
      || !isDecimalString(soc.minPercent) || !isDecimalString(soc.maxPercent)
      || compareDecimal(soc.minPercent, soc.maxPercent) === 1) {
      return null;
    }
    bounds.stateOfCharge = { minPercent: soc.minPercent, maxPercent: soc.maxPercent };
  }
  if (document.ramp !== undefined) {
    const ramp = document.ramp as Record<string, unknown>;
    if (typeof ramp !== 'object' || ramp === null || !isDecimalString(ramp.maxMwPerMinute)) {
      return null;
    }
    bounds.ramp = { maxMwPerMinute: ramp.maxMwPerMinute };
  }
  return bounds;
}

/**
 * Compares every scenario input against the envelope bounds. Deliberately comparison-only: no SOC
 * trajectory is integrated (that would require energy arithmetic the advisory scope does not
 * cover); the initial SOC is checked against the SOC band, each step power against the power
 * band, and each step-to-step swing against ramp × interval.
 */
export function evaluateDispatchScenario(
  envelope: OperatingEnvelopeBounds, scenario: DispatchScenario
): DispatchEvaluation {
  const violations: DispatchViolation[] = [];

  if (scenario.initialSocPercent !== undefined && envelope.stateOfCharge) {
    const { minPercent, maxPercent } = envelope.stateOfCharge;
    if (compareDecimal(scenario.initialSocPercent, minPercent) === -1) {
      violations.push({
        code: 'SOC_OUT_OF_ENVELOPE', stepIndex: null,
        limit: minPercent, actual: scenario.initialSocPercent
      });
    } else if (compareDecimal(scenario.initialSocPercent, maxPercent) === 1) {
      violations.push({
        code: 'SOC_OUT_OF_ENVELOPE', stepIndex: null,
        limit: maxPercent, actual: scenario.initialSocPercent
      });
    }
  }

  const rampLimit = envelope.ramp
    ? multiplyDecimalByInt(envelope.ramp.maxMwPerMinute, scenario.intervalMinutes)
    : null;
  let previousPowerMw: string | null = null;
  scenario.steps.forEach((step, stepIndex) => {
    if (compareDecimal(step.powerMw, envelope.power.maxMw) === 1) {
      violations.push({
        code: 'POWER_ABOVE_MAX', stepIndex, limit: envelope.power.maxMw, actual: step.powerMw
      });
    } else if (compareDecimal(step.powerMw, envelope.power.minMw) === -1) {
      violations.push({
        code: 'POWER_BELOW_MIN', stepIndex, limit: envelope.power.minMw, actual: step.powerMw
      });
    }
    if (rampLimit !== null && previousPowerMw !== null) {
      const swing = absDecimal(subtractDecimal(step.powerMw, previousPowerMw));
      if (compareDecimal(swing, rampLimit) === 1) {
        violations.push({ code: 'RAMP_EXCEEDED', stepIndex, limit: rampLimit, actual: swing });
      }
    }
    previousPowerMw = step.powerMw;
  });

  return {
    feasible: violations.length === 0,
    evaluatedSteps: scenario.steps.length,
    violations
  };
}
