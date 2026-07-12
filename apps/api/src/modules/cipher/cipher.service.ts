import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CIPHER_ENVELOPE_PREFIX, CIPHER_KEY } from './cipher.constants';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function parseCipherKey(value: string | undefined): Buffer {
  if (!value) throw new Error('CIPHER_KEY is required');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('CIPHER_KEY must be canonical base64 for exactly 32 bytes');
  }
  return key;
}

@Injectable()
export class CipherService {
  constructor(@Inject(CIPHER_KEY) private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('Cipher key must contain exactly 32 bytes');
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(CIPHER_ENVELOPE_PREFIX);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
  }

  decrypt(envelope: string): string {
    const parts = envelope.split(':');
    if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
      throw new Error('Encrypted value must use enc:v1 envelope');
    }
    try {
      const iv = Buffer.from(parts[2], 'base64url');
      const tag = Buffer.from(parts[3], 'base64url');
      const ciphertext = Buffer.from(parts[4], 'base64url');
      if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) throw new Error('Invalid envelope length');
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Encrypted value cannot be authenticated or decrypted');
    }
  }
}
