import type { AppConfig } from 'src/config/environment';
import { PasswordService } from 'src/modules/identity-access/password.service';

const config = {
  auth: { argonMemoryCost: 8_192, argonTimeCost: 1, argonParallelism: 1 }
} as AppConfig;

describe('PasswordService — SEC-101', () => {
  it('stores a salted Argon2id hash and verifies without reversible encryption', async () => {
    const service = new PasswordService(config);
    const raw = 'Password!NotStoredRaw2026';
    const first = await service.hash(raw);
    const second = await service.hash(raw);
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(raw);
    expect(second).not.toBe(first);
    await expect(service.verify(raw, first)).resolves.toBe(true);
    await expect(service.verify('wrong-password', first)).resolves.toBe(false);
  });
});
