import { randomBytes } from 'node:crypto';
import { CipherService } from 'src/modules/cipher/cipher.service';

describe('CipherService — SEC-117/SEC-118', () => {
  const plaintext = 'credential-value-with-vietnamese-Đăng nhập';

  it('encrypts with randomized AES-GCM envelopes and decrypts losslessly', () => {
    const cipher = new CipherService(randomBytes(32));
    const first = cipher.encrypt(plaintext);
    const second = cipher.encrypt(plaintext);
    expect(first).toMatch(/^enc:v1:/);
    expect(second).not.toBe(first);
    expect(cipher.decrypt(first)).toBe(plaintext);
    expect(cipher.decrypt(second)).toBe(plaintext);
  });

  it('rejects plaintext, tampered ciphertext and a wrong key', () => {
    const cipher = new CipherService(randomBytes(32));
    const encrypted = cipher.encrypt(plaintext);
    const parts = encrypted.split(':');
    parts[3] = `${parts[3].startsWith('A') ? 'B' : 'A'}${parts[3].slice(1)}`;
    const tampered = parts.join(':');
    expect(() => cipher.decrypt(plaintext)).toThrow();
    expect(() => cipher.decrypt(tampered)).toThrow();
    expect(() => new CipherService(randomBytes(32)).decrypt(encrypted)).toThrow();
  });
});
