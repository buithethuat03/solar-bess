import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  decodeSavedViewCursor, encodeSavedViewCursor
} from 'src/modules/search-reporting/domain/cursor';

describe('Saved-view keyset cursor — API-131', () => {
  it('round-trips an encoded cursor', () => {
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeSavedViewCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(decodeSavedViewCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeSavedViewCursor(undefined)).toBeNull();
    expect(decodeSavedViewCursor('')).toBeNull();
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ offset: 10 })).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      createdAt: 'someday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: 'view-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeSavedViewCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });
});
