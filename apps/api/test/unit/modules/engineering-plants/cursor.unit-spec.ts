import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  decodeEngineeringCursor, encodeEngineeringCursor
} from 'src/modules/engineering-plants/domain/cursor';

describe('Engineering & Plants keyset cursor — API-067/API-069', () => {
  it('round-trips an encoded cursor', () => {
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeEngineeringCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(decodeEngineeringCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeEngineeringCursor(undefined)).toBeNull();
    expect(decodeEngineeringCursor('')).toBeNull();
  });

  it('cannot carry sub-millisecond precision, so the page predicate reads the boundary row', () => {
    // Postgres keeps `equipment_models.created_at` / `bill_of_materials.created_at` to the
    // microsecond; the JS Date the driver hydrates and `pageMeta` re-serialises only holds
    // milliseconds.
    const stored = '2026-07-26T08:30:00.123456Z';
    const id = randomUUID();
    const decoded = decodeEngineeringCursor(
      encodeEngineeringCursor({ createdAt: new Date(stored).toISOString(), id })
    );
    expect(decoded).toEqual({ createdAt: '2026-07-26T08:30:00.123Z', id });
    // So neither `created_at < cursor` nor `created_at = cursor` holds for the row the cursor names.
    // `EngineeringPlantsService.applyCursor` therefore compares against the boundary row read back
    // out of the paged table; this string is only the stale-cursor fallback.
    expect(decoded?.createdAt).not.toBe(stored);
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ page: 2 })).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      createdAt: 'yesterday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: 'model-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeEngineeringCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });
});
