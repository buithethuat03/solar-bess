import { PermitToWorkStatus } from 'src/database/entities';
import {
  evaluatePermitValidity, type PermitFacts
} from 'src/modules/operations-maintenance/domain/work-order-policy';

const siteId = '11111111-1111-4111-8111-111111111111';
const otherSiteId = '22222222-2222-4222-8222-222222222222';
const validFrom = new Date('2026-07-20T00:00:00.000Z');
const validTo = new Date('2026-07-30T00:00:00.000Z');
const inWindow = new Date('2026-07-25T12:00:00.000Z');

function permit(overrides: Partial<PermitFacts> = {}): PermitFacts {
  return {
    status: PermitToWorkStatus.ISSUED, siteId, validFrom, validTo, ...overrides
  };
}

describe('permit validity evaluator — API-119 PTW_REQUIRED / API-120 PTW_NOT_VALID', () => {
  it('authorizes a live permit on the right site inside its window', () => {
    expect(evaluatePermitValidity(permit(), siteId, inWindow)).toBeNull();
    expect(evaluatePermitValidity(
      permit({ status: PermitToWorkStatus.ACTIVE }), siteId, inWindow
    )).toBeNull();
  });

  it('refuses when no permit is referenced at all', () => {
    expect(evaluatePermitValidity(null, siteId, inWindow)).toBe('MISSING');
  });

  it('refuses a permit issued for another site', () => {
    expect(evaluatePermitValidity(permit(), otherSiteId, inWindow)).toBe('SITE');
  });

  it.each([
    PermitToWorkStatus.DRAFT,
    PermitToWorkStatus.REQUESTED,
    PermitToWorkStatus.VERIFIED,
    PermitToWorkStatus.SUSPENDED,
    PermitToWorkStatus.EXPIRED,
    PermitToWorkStatus.CLOSED
  ])('refuses a permit in status %s', (status) => {
    expect(evaluatePermitValidity(permit({ status }), siteId, inWindow)).toBe('STATUS');
  });

  it('refuses outside the validity window on both sides', () => {
    expect(evaluatePermitValidity(
      permit(), siteId, new Date('2026-07-19T23:59:59.999Z')
    )).toBe('WINDOW');
    expect(evaluatePermitValidity(
      permit(), siteId, new Date('2026-07-30T00:00:00.001Z')
    )).toBe('WINDOW');
  });

  it('treats both window boundaries as inclusive', () => {
    expect(evaluatePermitValidity(permit(), siteId, validFrom)).toBeNull();
    expect(evaluatePermitValidity(permit(), siteId, validTo)).toBeNull();
  });

  it('reports the site mismatch before the status, so a cross-site permit is never "expired"', () => {
    // Ordering matters for the operator: "this permit belongs to another site" is a different
    // problem from "this permit has run out", and the first one must not be hidden by the second.
    expect(evaluatePermitValidity(
      permit({ status: PermitToWorkStatus.EXPIRED }), otherSiteId, inWindow
    )).toBe('SITE');
  });

  it('is pure: the same facts give the same verdict and nothing is mutated', () => {
    const facts = permit();
    const snapshot = { ...facts };
    expect(evaluatePermitValidity(facts, siteId, inWindow)).toBeNull();
    expect(evaluatePermitValidity(facts, siteId, inWindow)).toBeNull();
    expect(facts).toEqual(snapshot);
  });
});
