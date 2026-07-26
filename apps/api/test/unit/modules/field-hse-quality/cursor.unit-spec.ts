import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  decodeFieldHseQualityCursor, encodeFieldHseQualityCursor
} from 'src/modules/field-hse-quality/domain/cursor';

describe('Field, HSE & Quality keyset cursor — API-086', () => {
  it('round-trips an encoded cursor', () => {
    const cursor = { createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeFieldHseQualityCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(decodeFieldHseQualityCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeFieldHseQualityCursor(undefined)).toBeNull();
    expect(decodeFieldHseQualityCursor('')).toBeNull();
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ page: 2 })).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      createdAt: 'yesterday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: 'workfront-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeFieldHseQualityCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });
});
