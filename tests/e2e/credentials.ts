import { readFileSync } from 'node:fs';

export function e2eCredentials() {
  const path = process.env.E2E_PASSWORD_FILE;
  if (!path) throw new Error('E2E_PASSWORD_FILE is required');
  const password = readFileSync(path, 'utf8').trim();
  if (password.length < 16) throw new Error('E2E password file is invalid');
  return { tenantCode: 'demo', email: 'e2e-runner@example.test', password };
}
