import { ExposureLevel } from '../../../database/entities';

export interface RiskScoreInput {
  probability: number;
  costImpactRating: number;
  scheduleImpactRating: number;
  hseImpactRating: number;
}

export interface ExposureThresholds {
  high: number;
  critical: number;
}

export interface RiskScore {
  probability: number;
  costImpactRating: number;
  scheduleImpactRating: number;
  hseImpactRating: number;
  impactRating: number;
  exposure: number;
  level: ExposureLevel;
}

export function scoreRisk(input: RiskScoreInput, thresholds: ExposureThresholds): RiskScore {
  const values = [
    input.probability, input.costImpactRating, input.scheduleImpactRating, input.hseImpactRating
  ];
  if (!values.every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) {
    throw new RangeError('Risk scoring inputs must be integers from 1 to 5');
  }
  if (!Number.isInteger(thresholds.high) || !Number.isInteger(thresholds.critical)
    || thresholds.high < 2 || thresholds.high >= thresholds.critical
    || thresholds.critical > 25) {
    throw new RangeError('Risk thresholds are invalid');
  }
  const impactRating = Math.max(
    input.costImpactRating, input.scheduleImpactRating, input.hseImpactRating
  );
  const exposure = input.probability * impactRating;
  const level = exposure >= thresholds.critical
    ? ExposureLevel.CRITICAL
    : exposure >= thresholds.high
      ? ExposureLevel.HIGH
      : exposure >= 8 ? ExposureLevel.MEDIUM : ExposureLevel.LOW;
  return { ...input, impactRating, exposure, level };
}

export function effectiveRiskScore<T extends {
  inherentExposure: number; inherentLevel: ExposureLevel;
  residualExposure: number | null; residualLevel: ExposureLevel | null;
}>(risk: T): { exposure: number; level: ExposureLevel } {
  return risk.residualExposure !== null && risk.residualLevel !== null
    ? { exposure: risk.residualExposure, level: risk.residualLevel }
    : { exposure: risk.inherentExposure, level: risk.inherentLevel };
}
