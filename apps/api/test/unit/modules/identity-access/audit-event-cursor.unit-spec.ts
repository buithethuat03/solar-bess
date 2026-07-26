import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  decodeAuditEventCursor, encodeAuditEventCursor
} from 'src/modules/identity-access/audit-event.cursor';

describe('Audit trail keyset cursor — API-013', () => {
  it('round-trips an encoded cursor', () => {
    const cursor = { occurredAt: '2026-07-26T08:30:00.000Z', id: randomUUID() };
    const encoded = encodeAuditEventCursor(cursor);
    expect(encoded).not.toContain('{');
    expect(decodeAuditEventCursor(encoded)).toEqual(cursor);
  });

  it('returns null for an absent cursor', () => {
    expect(decodeAuditEventCursor(undefined)).toBeNull();
    expect(decodeAuditEventCursor('')).toBeNull();
  });

  it.each([
    ['not base64url json', 'not-a-cursor'],
    ['json but wrong shape', Buffer.from(JSON.stringify({ page: 2 })).toString('base64url')],
    ['contract-cost shape (createdAt key)', Buffer.from(JSON.stringify({
      createdAt: '2026-07-26T08:30:00.000Z', id: randomUUID()
    })).toString('base64url')],
    ['invalid timestamp', Buffer.from(JSON.stringify({
      occurredAt: 'yesterday', id: randomUUID()
    })).toString('base64url')],
    ['invalid uuid', Buffer.from(JSON.stringify({
      occurredAt: '2026-07-26T08:30:00.000Z', id: 'audit-1'
    })).toString('base64url')]
  ])('rejects %s with INVALID_CURSOR', (_label, value) => {
    let caught: unknown;
    try {
      decodeAuditEventCursor(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_CURSOR', retryable: false
    });
  });
});
