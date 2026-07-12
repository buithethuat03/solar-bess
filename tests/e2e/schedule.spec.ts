import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials } from './credentials';

interface IdentityPayload {
  user?: { id?: string };
}

function addUtcDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function futureMonday(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 14);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function loginAndReadUserId(page: Page): Promise<string> {
  const credentials = e2eCredentials();
  await page.goto('/login');
  await page.getByLabel('Mã tenant').fill(credentials.tenantCode);
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Mật khẩu').fill(credentials.password);
  const identityResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === '/v1/me'
    && response.request().method() === 'GET'
    && response.ok()
  ));
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  const identity = await (await identityResponse).json() as IdentityPayload;
  if (!identity.user?.id) throw new Error('E2E identity response does not contain user.id');
  return identity.user.id;
}

test('TEST-010 UI: validate and commit schedule, then exercise progress and baseline smoke paths', async ({ page }) => {
  test.setTimeout(90_000);
  const ownerId = await loginAndReadUserId(page);
  const unique = Date.now().toString().slice(-8);
  const projectCode = `SCH-E2E-${unique}`;
  const projectName = `Schedule E2E ${unique}`;
  const taskName = `Thi công móng E2E ${unique}`;
  const milestoneName = `Milestone sẵn sàng E2E ${unique}`;
  const taskStart = futureMonday();
  const milestoneStart = addUtcDays(taskStart, 7);

  await page.getByRole('button', { name: 'Mở Project Master' }).click();
  await expect(page.getByRole('heading', { name: 'Danh mục dự án' })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo dự án' }).click();
  await page.getByLabel('Mã dự án').fill(projectCode);
  await page.getByLabel('Tên dự án').fill(projectName);
  await page.getByLabel('Portfolio').selectOption({ label: 'DEMO_PORTFOLIO · Demo Renewable Portfolio' });
  await page.getByLabel('Pháp nhân sở hữu').selectOption({ label: 'Demo Owner Legal Entity' });
  await page.getByLabel('Khách hàng').selectOption({ label: 'DEMO_CUSTOMER · Demo Customer Company' });
  await page.getByLabel('COD kế hoạch').fill(addUtcDays(taskStart, 180));
  await page.getByLabel('Tên Site').fill(`Schedule Site ${unique}`);
  await page.getByLabel('Địa điểm').fill('Synthetic Playwright schedule fixture');
  await page.getByRole('button', { name: 'Tạo dự án' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await page.getByPlaceholder('Lý do kích hoạt/lưu trữ').fill('Kích hoạt để kiểm thử schedule');
  await page.getByRole('button', { name: 'Kích hoạt' }).click();
  await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'WBS & Schedule' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/schedule$/);
  await expect(page.getByRole('heading', { name: 'WBS & Schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Schedule chưa được khởi tạo' })).toBeVisible();
  await page.getByRole('button', { name: 'Khởi tạo schedule' }).click();

  const canonicalDraft = {
    source: { format: 'CANONICAL_JSON', sourceName: `schedule-e2e-${unique}.json` },
    calendar: {
      timezone: 'Asia/Ho_Chi_Minh',
      calendarCode: `E2E_${unique}`,
      workingWeek: [1, 2, 3, 4, 5],
      exceptions: []
    },
    wbsUpserts: [{
      clientRef: 'wbs-root',
      ownerId,
      code: `WBS_${unique}`,
      name: `WBS E2E ${unique}`,
      weight: '100',
      sortOrder: 0
    }],
    activityUpserts: [{
      clientRef: 'task-foundation',
      wbsClientRef: 'wbs-root',
      ownerId,
      code: `TASK_${unique}`,
      name: taskName,
      activityType: 'TASK',
      weight: '80',
      plannedStart: taskStart,
      durationWorkDays: 5
    }, {
      clientRef: 'milestone-ready',
      wbsClientRef: 'wbs-root',
      ownerId,
      code: `MS_${unique}`,
      name: milestoneName,
      activityType: 'MILESTONE',
      weight: '20',
      plannedStart: milestoneStart,
      durationWorkDays: 0
    }],
    dependencyUpserts: [{
      predecessorClientRef: 'task-foundation',
      successorClientRef: 'milestone-ready',
      dependencyType: 'FS',
      lagWorkDays: 0
    }],
    archiveWbsIds: [],
    archiveActivityIds: [],
    unlinkDependencyIds: []
  };

  await page.locator('.schedule-json-editor').fill(JSON.stringify(canonicalDraft, null, 2));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByText('Preview hợp lệ', { exact: true })).toBeVisible();
  await expect(page.getByText('Preview hoàn tất, chưa có dữ liệu nào được ghi.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Schedule chưa được khởi tạo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commit draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Commit draft' }).click();

  await expect(page.getByText('Schedule draft đã được commit nguyên tử.')).toBeVisible();
  await expect(page.getByText(taskName, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(milestoneName, { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Không đủ mẫu số kế hoạch')).toBeVisible();

  const taskRow = page.locator('.schedule-gantt__row').filter({ hasText: taskName });
  await taskRow.getByRole('button', { name: 'Cập nhật' }).click();
  await page.getByLabel('Hoàn thành (%)').fill('25');
  await page.getByLabel('Thời lượng còn lại').fill('3');
  await page.getByLabel('Evidence references, mỗi dòng một tham chiếu').fill(`PHOTO-E2E-${unique}`);
  await page.getByRole('button', { name: 'Ghi tiến độ' }).click();
  await expect(page.getByText('Tiến độ đã được ghi thành một bản ghi mới.')).toBeVisible();

  const actualProgress = page.locator('.schedule-kpis article').filter({ hasText: 'Tiến độ thực tế' });
  await expect(actualProgress.getByText('20%', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'WBS & Schedule' })).toBeVisible();
  await expect(page.getByText(taskName, { exact: false }).first()).toBeVisible();
  await expect(actualProgress.getByText('20%', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Baseline', exact: true }).click();
  await page.getByLabel('Lý do').fill('Chốt initial baseline từ synthetic E2E');
  await page.getByLabel('Tóm tắt tác động').fill('Thiết lập mốc kiểm soát đầu tiên cho hành trình E2E');
  await page.getByRole('button', { name: 'Submit baseline' }).click();
  await expect(page.getByText('Baseline đã được submit cho approver độc lập.')).toBeVisible();
  await expect(page.getByText('SUBMITTED', { exact: true })).toBeVisible();
});
