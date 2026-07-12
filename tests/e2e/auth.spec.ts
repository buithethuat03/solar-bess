import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

test('TEST-230/233: login, reload and logout', async ({ page }) => {
  const credentials = e2eCredentials();

  await page.goto('/login');
  await page.getByLabel('Mã tenant').fill(credentials.tenantCode);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Mật khẩu').fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Solar & BESS Project Management' })).toBeVisible();
  await page.reload();
  await expect(page.getByText(credentials.email)).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('TEST-231: invalid credential is generic', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mã tenant').fill('unknown');
  await page.getByLabel('Email').fill('unknown@example.test');
  await page.getByLabel('Mật khẩu').fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Thông tin đăng nhập không hợp lệ')).toBeVisible();
});
