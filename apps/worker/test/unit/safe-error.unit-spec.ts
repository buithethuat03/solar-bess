import { safeErrorCode, safeErrorHash } from '../../src/safe-error';

describe('safe worker errors', () => {
  it('stores a deterministic hash/code without the raw error text', () => {
    const error = new Error('password=do-not-log');
    expect(safeErrorHash(error)).toMatch(/^[0-9a-f]{64}$/);
    expect(safeErrorCode(error)).toMatch(/^ERR_[0-9A-F]{16}$/);
    expect(safeErrorCode(error)).not.toContain('password');
  });
});
