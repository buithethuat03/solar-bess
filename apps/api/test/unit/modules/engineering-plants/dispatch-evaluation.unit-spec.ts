import {
  evaluateDispatchScenario, parseOperatingEnvelope,
  type OperatingEnvelopeBounds
} from 'src/modules/engineering-plants/domain/dispatch-evaluation';

const storedEnvelope = {
  note: 'Demo data — advisory bounds only, never a setpoint source',
  power: { minMw: '-2.0', maxMw: '2.0' },
  energy: { minMwh: '0.4', maxMwh: '4.0' },
  stateOfCharge: { minPercent: '10', maxPercent: '90' },
  ramp: { maxMwPerMinute: '1.0' },
  efficiency: { roundTripPercent: '88' },
  temperature: { minCelsius: '-10', maxCelsius: '45' }
};

describe('API-075 dispatch evaluation — pure advisory, exact decimals', () => {
  it('parses the canonical stored envelope and ignores non-bound blocks', () => {
    const envelope = parseOperatingEnvelope(storedEnvelope);
    expect(envelope).toEqual({
      power: { minMw: '-2.0', maxMw: '2.0' },
      stateOfCharge: { minPercent: '10', maxPercent: '90' },
      ramp: { maxMwPerMinute: '1.0' }
    });
  });

  it('accepts a minimal envelope carrying only the power band', () => {
    expect(parseOperatingEnvelope({ power: { minMw: '-1', maxMw: '1' } })).toEqual({
      power: { minMw: '-1', maxMw: '1' }
    });
  });

  it.each([
    ['not an object', 'power'],
    ['missing power', {}],
    ['non-decimal power bound', { power: { minMw: 'low', maxMw: '2' } }],
    ['numeric instead of string', { power: { minMw: -2, maxMw: 2 } }],
    ['inverted power band', { power: { minMw: '2', maxMw: '-2' } }],
    ['inverted SOC band', {
      power: { minMw: '-2', maxMw: '2' },
      stateOfCharge: { minPercent: '90', maxPercent: '10' }
    }],
    ['malformed ramp', { power: { minMw: '-2', maxMw: '2' }, ramp: { maxMwPerMinute: 'fast' } }]
  ] as const)('rejects %s as invalid', (_label, raw) => {
    expect(parseOperatingEnvelope(raw)).toBeNull();
  });

  it('declares a scenario inside every bound feasible', () => {
    const envelope = parseOperatingEnvelope(storedEnvelope) as OperatingEnvelopeBounds;
    const verdict = evaluateDispatchScenario(envelope, {
      intervalMinutes: 15, initialSocPercent: '50',
      steps: [
        { powerMw: '1.5' }, { powerMw: '2.0' }, { powerMw: '-2.0' }, { powerMw: '0' }
      ]
    });
    // 2.0 → -2.0 swings 4 MW; the ramp limit is 1.0 MW/min × 15 min = 15 MW, so it passes.
    expect(verdict).toEqual({ feasible: true, evaluatedSteps: 4, violations: [] });
  });

  it('reports every violated constraint with its step, limit and actual', () => {
    const envelope = parseOperatingEnvelope(storedEnvelope) as OperatingEnvelopeBounds;
    const verdict = evaluateDispatchScenario(envelope, {
      intervalMinutes: 1, initialSocPercent: '95',
      steps: [{ powerMw: '2.0001' }, { powerMw: '-2.5' }, { powerMw: '0' }]
    });
    expect(verdict.feasible).toBe(false);
    expect(verdict.evaluatedSteps).toBe(3);
    expect(verdict.violations).toEqual([
      { code: 'SOC_OUT_OF_ENVELOPE', stepIndex: null, limit: '90', actual: '95' },
      { code: 'POWER_ABOVE_MAX', stepIndex: 0, limit: '2.0', actual: '2.0001' },
      { code: 'POWER_BELOW_MIN', stepIndex: 1, limit: '-2.0', actual: '-2.5' },
      // 2.0001 → -2.5 swings 4.5001 MW against a 1 MW/min × 1 min limit.
      { code: 'RAMP_EXCEEDED', stepIndex: 1, limit: '1', actual: '4.5001' },
      { code: 'RAMP_EXCEEDED', stepIndex: 2, limit: '1', actual: '2.5' }
    ]);
  });

  it('scales the ramp limit by the interval exactly', () => {
    const envelope = parseOperatingEnvelope(storedEnvelope) as OperatingEnvelopeBounds;
    const atLimit = evaluateDispatchScenario(envelope, {
      intervalMinutes: 5, steps: [{ powerMw: '-2' }, { powerMw: '2' }]
    });
    // Swing 4 MW < 5 MW limit: feasible.
    expect(atLimit.feasible).toBe(true);
    const overLimit = evaluateDispatchScenario(envelope, {
      intervalMinutes: 2, steps: [{ powerMw: '-2' }, { powerMw: '2' }]
    });
    expect(overLimit.violations).toEqual([
      { code: 'RAMP_EXCEEDED', stepIndex: 1, limit: '2', actual: '4' }
    ]);
  });

  it('skips SOC and ramp checks when the envelope does not define them', () => {
    const verdict = evaluateDispatchScenario({ power: { minMw: '-1', maxMw: '1' } }, {
      intervalMinutes: 1, initialSocPercent: '99',
      steps: [{ powerMw: '-1' }, { powerMw: '1' }]
    });
    expect(verdict).toEqual({ feasible: true, evaluatedSteps: 2, violations: [] });
  });
});
