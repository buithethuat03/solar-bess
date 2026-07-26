import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  decodeCommissioningCursor, encodeCommissioningCursor
} from 'src/modules/commissioning-cod/domain/cursor';

describe('Commissioning keyset cursor — API-098', () => {
  it('round-trips an encoded cursor without leaking its shape', () => {
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeCommissioningCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(encoded).not.toContain('createdAt');
    expect(decodeCommissioningCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeCommissioningCursor(undefined)).toBeNull();
    expect(decodeCommissioningCursor('')).toBeNull();
  });

  it('keeps sub-millisecond precision out of the contract by carrying the boundary id', () => {
    // The cursor deliberately carries only an ISO timestamp and the row id: the SQL predicate
    // re-reads the boundary row's stored `created_at`, so the millisecond-truncated string here is
    // never the thing rows are compared against.
    const id = randomUUID();
    const decoded = decodeCommissioningCursor(
      encodeCommissioningCursor({ createdAt: '2026-07-26T08:30:00.123Z', id })
    );
    expect(decoded).toEqual({ createdAt: '2026-07-26T08:30:00.123Z', id });
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ page: 2 })).toString('base64url')],
    ['an array', Buffer.from(JSON.stringify([1, 2])).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      createdAt: 'yesterday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: 'system-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeCommissioningCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });
});
