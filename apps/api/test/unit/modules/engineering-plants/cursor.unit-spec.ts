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
