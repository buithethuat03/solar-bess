import { materializeProgressProjection } from 'src/modules/project-controls/domain/progress-projector';

interface ProgressFact {
  id: string;
  activityId: string;
  correctionOfId: string | null;
  dataDate: string;
  percentComplete: string;
  remainingDurationWorkDays: number;
  actualStart: string | null;
  actualFinish: string | null;
  recordedAt: string;
}

const ACTIVITY_ID = '44444444-4444-4444-8444-444444444444';

function fact(overrides: Partial<ProgressFact> & Pick<ProgressFact, 'id'>): ProgressFact {
  return {
    activityId: ACTIVITY_ID,
    correctionOfId: null,
    dataDate: '2026-07-13',
    percentComplete: '20.00',
    remainingDurationWorkDays: 8,
    actualStart: '2026-07-13',
    actualFinish: null,
    recordedAt: '2026-07-13T10:00:00.000Z',
    ...overrides
  };
}

describe('progress correction projection — TEST-011/185', () => {
  it('does not let a late correction of an older data date roll back the current projection', () => {
    const older = fact({ id: 'older', dataDate: '2026-07-13' });
    const current = fact({
      id: 'current', dataDate: '2026-07-14', percentComplete: '40.00',
      remainingDurationWorkDays: 6, recordedAt: '2026-07-14T10:00:00.000Z'
    });
    const correctionOfOlder = fact({
      id: 'older-correction', correctionOfId: older.id, dataDate: older.dataDate,
      percentComplete: '15.00', remainingDurationWorkDays: 9,
      recordedAt: '2026-07-15T10:00:00.000Z'
    });

    expect(materializeProgressProjection([
      correctionOfOlder, current, older
    ])).toMatchObject({
      id: current.id, dataDate: current.dataDate,
      percentComplete: current.percentComplete,
      remainingDurationWorkDays: current.remainingDurationWorkDays
    });
  });

  it('resolves a correction chain independently of repository/input order', () => {
    const original = fact({ id: 'original', percentComplete: '40.00' });
    const firstCorrection = fact({
      id: 'correction-1', correctionOfId: original.id, percentComplete: '35.00',
      recordedAt: '2026-07-13T11:00:00.000Z'
    });
    const finalCorrection = fact({
      id: 'correction-2', correctionOfId: firstCorrection.id, percentComplete: '37.00',
      recordedAt: '2026-07-13T12:00:00.000Z'
    });

    expect(materializeProgressProjection([
      finalCorrection, original, firstCorrection
    ])).toMatchObject({ id: finalCorrection.id, percentComplete: '37.00' });
  });

  it('uses the latest sibling correction when several corrections target the same fact', () => {
    const original = fact({ id: 'original', percentComplete: '40.00' });
    const firstCorrection = fact({
      id: 'correction-1', correctionOfId: original.id, percentComplete: '35.00',
      recordedAt: '2026-07-13T11:00:00.000Z'
    });
    const latestCorrection = fact({
      id: 'correction-2', correctionOfId: original.id, percentComplete: '37.00',
      recordedAt: '2026-07-13T12:00:00.000Z'
    });

    expect(materializeProgressProjection([
      latestCorrection, original, firstCorrection
    ])).toMatchObject({ id: latestCorrection.id, percentComplete: '37.00' });
  });

  it('uses recordedAt as a deterministic tie after dataDate', () => {
    const first = fact({ id: 'update-a' });
    const later = fact({
      id: 'update-b', percentComplete: '25.00',
      recordedAt: '2026-07-13T11:00:00.000Z'
    });

    expect(materializeProgressProjection([later, first])).toMatchObject({ id: later.id });
    expect(materializeProgressProjection([first, later])).toMatchObject({ id: later.id });
  });

  it('uses the lexicographically greatest id when dataDate and recordedAt tie', () => {
    const first = fact({ id: 'update-a' });
    const second = fact({ id: 'update-b', percentComplete: '25.00' });

    expect(materializeProgressProjection([second, first])).toMatchObject({ id: second.id });
    expect(materializeProgressProjection([first, second])).toMatchObject({ id: second.id });
  });

  it('returns null when an activity has no progress facts', () => {
    expect(materializeProgressProjection([])).toBeNull();
  });
});
