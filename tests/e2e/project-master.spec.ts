import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

test('TEST-001…004: create, view, activate, add Site/party and archive Project Master', async ({ page }) => {
  const credentials = e2eCredentials();
  const unique = Date.now().toString().slice(-8);
  const projectCode = `E2E-${unique}`;
  const projectName = `Dự án E2E ${unique}`;

  await page.goto('/login');
  await page.getByLabel('Mã tenant').fill(credentials.tenantCode);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Mật khẩu').fill(credentials.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.getByRole('button', { name: 'Mở Project Master' }).click();
  await expect(page.getByRole('heading', { name: 'Danh mục dự án' })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo dự án' }).click();

  await page.getByLabel('Mã dự án').fill(projectCode);
  await page.getByLabel('Tên dự án').fill(projectName);
  await page.getByLabel('Portfolio').selectOption({ label: 'DEMO_PORTFOLIO · Demo Renewable Portfolio' });
  await page.getByLabel('Pháp nhân sở hữu').selectOption({ label: 'Demo Owner Legal Entity' });
  await page.getByLabel('Khách hàng').selectOption({ label: 'DEMO_CUSTOMER · Demo Customer Company' });
  await page.getByLabel('COD kế hoạch').fill('2028-06-30');
  await page.getByLabel('Tên Site').fill(`Site E2E ${unique}`);
  await page.getByLabel('Địa điểm').fill('Dữ liệu kiểm thử E2E');
  await page.getByRole('button', { name: 'Tạo dự án' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  await expect(page.getByText('DRAFT', { exact: true }).first()).toBeVisible();

  await page.getByPlaceholder('Lý do kích hoạt/lưu trữ').fill('Kích hoạt từ E2E');
  await page.getByRole('button', { name: 'Kích hoạt' }).click();
  await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Thêm Site' }).click();
  await page.getByPlaceholder('Mã Site').fill(`S${unique}`);
  await page.getByPlaceholder('Tên Site').fill(`Site phụ ${unique}`);
  await page.getByRole('button', { name: 'Lưu Site' }).click();
  await expect(page.getByText(`Site phụ ${unique}`)).toBeVisible();

  await page.getByRole('button', { name: 'Gán đối tác' }).click();
  await page.locator('.inline-form--party select').nth(0).selectOption({ label: 'Demo Owner Company' });
  await page.locator('.inline-form--party select').nth(1).selectOption({ label: 'Demo Owner Legal Entity' });
  await page.getByPlaceholder('Người liên hệ').fill('E2E Contact');
  await page.getByPlaceholder('Email liên hệ').fill('e2e@example.test');
  await page.getByRole('button', { name: 'Lưu quan hệ' }).click();
  await expect(page.getByText('E2E Contact')).toBeVisible();

  await page.getByPlaceholder('Lý do kích hoạt/lưu trữ').fill('Lưu trữ sau E2E');
  await page.getByRole('button', { name: 'Lưu trữ' }).click();
  await expect(page.getByText('ARCHIVED', { exact: true }).first()).toBeVisible();
});
