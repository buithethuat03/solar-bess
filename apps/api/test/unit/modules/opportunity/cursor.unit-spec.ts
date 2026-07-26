import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  decodeOpportunityCursor, encodeOpportunityCursor
} from 'src/modules/opportunity/domain/cursor';

describe('Opportunity keyset cursor — API-026', () => {
  it('round-trips an encoded cursor', () => {
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeOpportunityCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(decodeOpportunityCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeOpportunityCursor(undefined)).toBeNull();
    expect(decodeOpportunityCursor('')).toBeNull();
  });

  it('cannot carry sub-millisecond precision, so the page predicate reads the boundary row', () => {
    // Postgres keeps `opportunities.created_at` to the microsecond; the JS Date the driver hydrates
    // and `pageMeta` re-serialises only holds milliseconds.
    const stored = '2026-07-26T08:30:00.123456Z';
    const id = randomUUID();
    const decoded = decodeOpportunityCursor(
      encodeOpportunityCursor({ createdAt: new Date(stored).toISOString(), id })
    );
    expect(decoded).toEqual({ createdAt: '2026-07-26T08:30:00.123Z', id });
    // So neither `created_at < cursor` nor `created_at = cursor` holds for the row the cursor names.
    // `OpportunityService.applyCursor` therefore compares against the boundary row read back out of
    // `opportunities`; this string is only the stale-cursor fallback.
    expect(decoded?.createdAt).not.toBe(stored);
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ page: 2 })).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      createdAt: 'yesterday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: 'opportunity-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeOpportunityCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });
});
