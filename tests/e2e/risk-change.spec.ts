import { expect, test, type Locator, type Page } from '@playwright/test';
import { e2eApproverCredentials, e2eCredentials } from './credentials';

interface IdentityPayload {
  user?: { id?: string };
}

type Credentials = ReturnType<typeof e2eCredentials>;

function addUtcDays(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loginAndReadUserId(
  page: Page,
  credentials: Credentials,
  loginUrl = '/login'
): Promise<string> {
  await page.goto(loginUrl);
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

function queryUuid(page: Page, key: string): string {
  const value = new URL(page.url()).searchParams.get(key);
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`E2E deep-link does not contain a valid ${key}`);
  }
  return value;
}

function projectUuid(page: Page): string {
  const match = new URL(page.url()).pathname.match(/^\/projects\/([0-9a-f-]{36})$/i);
  if (!match?.[1]) throw new Error('E2E project detail URL does not contain projectId');
  return match[1];
}

function detailPanel(page: Page, heading: string): Locator {
  return page.locator('section.risk-change-detail').filter({
    has: page.getByRole('heading', { name: heading, exact: true })
  });
}

async function submitWithoutNativeValidation(panel: Locator): Promise<void> {
  await panel.locator('form').first().evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function selectAssignee(panel: Locator, userId: string): Promise<void> {
  const select = panel.getByLabel('Assignee');
  await select.focus();
  await expect(select.locator(`option[value="${userId}"]`)).toHaveCount(1);
  await select.selectOption(userId);
}

test('TEST-014…017 UI: Risk → Issue/Action → Change with deep-link, SoD and mobile guards', async ({
  browser,
  page
}) => {
  test.setTimeout(120_000);
  const runnerCredentials = e2eCredentials();
  const runnerId = await loginAndReadUserId(page, runnerCredentials);
  const unique = Date.now().toString(36).toUpperCase();
  const projectCode = `RC-E2E-${unique}`;
  const projectName = `Risk Change E2E ${unique}`;
  const riskCode = `RSK-${unique}`;
  const issueCode = `ISS-${unique}`;
  const actionCode = `ACT-${unique}`;
  const changeCode = `CHG-${unique}`;

  await page.getByRole('button', { name: 'Mở Project Master' }).click();
  await expect(page.getByRole('heading', { name: 'Danh mục dự án' })).toBeVisible();
  await page.getByRole('button', { name: 'Tạo dự án' }).click();
  await page.getByLabel('Mã dự án').fill(projectCode);
  await page.getByLabel('Tên dự án').fill(projectName);
  await page.getByLabel('Portfolio').selectOption({
    label: 'DEMO_PORTFOLIO · Demo Renewable Portfolio'
  });
  await page.getByLabel('Pháp nhân sở hữu').selectOption({ label: 'Demo Owner Legal Entity' });
  await page.getByLabel('Khách hàng').selectOption({
    label: 'DEMO_CUSTOMER · Demo Customer Company'
  });
  await page.getByLabel('COD kế hoạch').fill(addUtcDays(365));
  await page.getByLabel('Tên Site').fill(`Risk Change Site ${unique}`);
  await page.getByLabel('Địa điểm').fill('Synthetic Playwright risk/change fixture');
  await page.getByRole('button', { name: 'Tạo dự án' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  const projectId = projectUuid(page);
  await page.getByPlaceholder('Lý do kích hoạt/lưu trữ').fill('Kích hoạt để kiểm thử Risk & Change');
  await page.getByRole('button', { name: 'Kích hoạt' }).click();
  await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible();

  const summaryPattern = '**/v1/projects/*/risk-change-summary*';
  let releaseSummary = (): void => undefined;
  const summaryGate = new Promise<void>((resolve) => { releaseSummary = resolve; });
  await page.route(summaryPattern, async (route) => {
    await summaryGate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Risk & Change' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/risk-change\\?tab=risks`));
  await expect(page.getByText('Đang tải authorized Risk/Issue/Change projection…')).toBeVisible();
  releaseSummary();
  await expect(page.getByRole('heading', { name: 'Không có Risk phù hợp' })).toBeVisible();
  await page.unroute(summaryPattern);

  await page.getByRole('button', { name: 'Tạo Risk', exact: true }).click();
  let panel = detailPanel(page, 'Tạo Risk');
  await submitWithoutNativeValidation(panel);
  await expect(panel.getByText(
    'Vui lòng nhập đủ code, category, cause-event-impact, owner và review date.'
  )).toBeVisible();
  await panel.getByLabel('Code', { exact: true }).fill(riskCode);
  await panel.getByLabel('Category', { exact: true }).fill('SCHEDULE');
  await panel.getByLabel('Cause', { exact: true }).fill('Thiết kế bàn giao chậm');
  await panel.getByLabel('Event', { exact: true }).fill('Mốc thi công có thể trễ');
  await panel.getByLabel('Impact', { exact: true }).fill('Ảnh hưởng đường găng dự án');
  await panel.getByLabel('Probability', { exact: true }).selectOption('3');
  await panel.getByLabel('Schedule impact', { exact: true }).selectOption('4');
  await panel.getByLabel('Review date', { exact: true }).fill(addUtcDays(30));
  await selectAssignee(panel, runnerId);
  await panel.getByLabel('Response strategy', { exact: true }).selectOption('MITIGATE');
  await panel.getByLabel('Response plan', { exact: true }).fill('Theo dõi và xử lý đường găng');
  await panel.getByRole('button', { name: 'Tạo Risk', exact: true }).click();
  await expect(page.getByText('Risk đã được tạo cùng audit/outbox.')).toBeVisible();
  await expect(page).toHaveURL(/riskId=[0-9a-f-]{36}/i);
  const riskId = queryUuid(page, 'riskId');

  await page.reload();
  panel = detailPanel(page, `${riskCode} · Risk detail`);
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`riskId=${riskId}`));
  await panel.getByRole('button', { name: 'Đóng' }).click();

  await page.getByRole('button', { name: 'Issue Register' }).click();
  await expect(page.getByRole('heading', { name: 'Không có Issue phù hợp' })).toBeVisible();
  await page.getByRole('button', { name: 'Báo cáo Issue' }).click();
  panel = detailPanel(page, 'Báo cáo Issue');
  await submitWithoutNativeValidation(panel);
  await expect(panel.getByText(
    'Issue bắt buộc code, title, description, occurred time, root cause, actual impact, owner và target date.'
  )).toBeVisible();
  await panel.getByLabel('Code', { exact: true }).fill(issueCode);
  await panel.getByLabel('Title', { exact: true }).fill(`Issue phát sinh ${unique}`);
  await panel.getByLabel('Description', { exact: true }).fill('Sự kiện Risk đã cần được xử lý thực tế');
  await panel.getByLabel('Root cause', { exact: true }).fill('Thiếu đầu vào thiết kế đúng hạn');
  await panel.getByLabel('Actual impact', { exact: true }).fill('Công việc bị chậm so với kế hoạch');
  await panel.getByLabel('Severity', { exact: true }).selectOption('HIGH');
  await panel.getByLabel('Target date', { exact: true }).fill(addUtcDays(20));
  await panel.getByLabel('Source Risk ID', { exact: true }).fill(riskId);
  await selectAssignee(panel, runnerId);
  await panel.getByRole('button', { name: 'Tạo Issue' }).click();
  await expect(page.getByText('Issue đã được tạo.')).toBeVisible();
  await expect(page).toHaveURL(/issueId=[0-9a-f-]{36}/i);
  const issueId = queryUuid(page, 'issueId');

  await page.getByRole('button', { name: 'Tạo Action' }).click();
  panel = detailPanel(page, 'Tạo Action');
  await panel.getByLabel('Code', { exact: true }).fill(actionCode);
  await panel.getByLabel('Action type', { exact: true }).selectOption('CORRECTIVE');
  await panel.getByLabel('Title', { exact: true }).fill(`Xử lý Issue ${unique}`);
  await panel.getByLabel('Description', { exact: true }).fill('Bổ sung và kiểm tra đầu vào thiết kế');
  await panel.getByLabel('Due date', { exact: true }).fill(addUtcDays(14));
  await selectAssignee(panel, runnerId);
  await panel.getByRole('button', { name: 'Tạo Action' }).click();
  await expect(page.getByText('Action đã được tạo trong parent scope.')).toBeVisible();
  await expect(page).toHaveURL(/actionId=[0-9a-f-]{36}/i);
  const actionId = queryUuid(page, 'actionId');

  await page.reload();
  await expect(detailPanel(page, `${actionCode} · Action detail`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`actionId=${actionId}`));
  await page.goto(`/projects/${projectId}/risk-change?tab=issues&issueId=${issueId}`);
  await expect(detailPanel(page, `${issueCode} · Issue detail`)).toBeVisible();
  await page.getByRole('button', { name: 'Tạo Change từ Issue' }).click();

  panel = detailPanel(page, 'Tạo Change Request');
  await submitWithoutNativeValidation(panel);
  await expect(panel.getByText('Change bắt buộc code, title, reason và owner.')).toBeVisible();
  await expect(panel.getByLabel('Source', { exact: true })).toHaveValue('ISSUE');
  await expect(panel.getByLabel('Source ID', { exact: true })).toHaveValue(issueId);
  await panel.getByLabel('Code', { exact: true }).fill(changeCode);
  await panel.getByLabel('Title', { exact: true }).fill(`Change xử lý Issue ${unique}`);
  await panel.getByLabel('Reason', { exact: true }).fill('Cần điều chỉnh kế hoạch xử lý Issue');
  await selectAssignee(panel, runnerId);
  await panel.getByLabel('Options, mỗi dòng một phương án').fill(
    'Giữ nguyên kế hoạch\nĐiều chỉnh trình tự triển khai'
  );
  await panel.getByLabel('Recommendation', { exact: true }).fill('Điều chỉnh trình tự triển khai');

  for (const dimension of ['Scope', 'Schedule', 'Cost', 'Quality', 'HSE', 'Contract']) {
    await panel.getByRole('checkbox', { name: dimension, exact: true }).check();
  }
  await panel.getByLabel('Scope impact summary').fill('Điều chỉnh phạm vi triển khai nội bộ');
  await panel.getByLabel('Schedule impact summary').fill('Đổi trình tự nhưng không rebaseline');
  await panel.getByLabel('Duration delta days').fill('0');
  await panel.getByLabel('Cost impact summary').fill('Chi phí bổ sung đã được kiểm soát');
  await panel.getByLabel('Amount delta').fill('2500');
  await panel.getByLabel('Currency').fill('USD');
  await panel.getByLabel('Quality impact summary').fill('Bổ sung một bước rà soát chất lượng');
  await panel.getByLabel('HSE impact summary').fill('Không tăng rủi ro HSE hiện hữu');
  await panel.getByLabel('Contract impact summary').fill('Không thay đổi nghĩa vụ hợp đồng');
  await panel.getByRole('button', { name: 'Tạo Change draft' }).click();
  await expect(page.getByText('Change draft đã được tạo với source snapshot.')).toBeVisible();
  await expect(page).toHaveURL(/changeRequestId=[0-9a-f-]{36}/i);
  const changeId = queryUuid(page, 'changeRequestId');

  await page.reload();
  panel = detailPanel(page, `${changeCode} · Change detail`);
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`changeRequestId=${changeId}`));
  await panel.getByLabel('Draft state').selectOption('ASSESSED');
  await panel.getByRole('button', { name: 'Lưu assessment' }).click();
  await expect(page.getByText('Change assessment draft đã được lưu.')).toBeVisible();
  await panel.getByRole('button', { name: 'Submit', exact: true }).click();
  await panel.getByLabel('Submit comment').fill('Đề nghị duyệt độc lập từ E2E');
  await panel.getByRole('button', { name: 'Submit Change' }).click();
  await expect(page.getByText('Change đã được submit với immutable impact snapshot.')).toBeVisible();
  await expect(panel.getByText('Submitted/approved snapshot và decision facts là bất biến.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Decision', exact: true })).toHaveCount(0);

  const origin = new URL(page.url()).origin;
  const approverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const approverPage = await approverContext.newPage();
    const approverId = await loginAndReadUserId(
      approverPage,
      e2eApproverCredentials(),
      `${origin}/login`
    );
    expect(approverId).not.toBe(runnerId);
    await approverPage.goto(
      `${origin}/projects/${projectId}/risk-change?tab=changes&changeRequestId=${changeId}`
    );
    const approverPanel = detailPanel(approverPage, `${changeCode} · Change detail`);
    await expect(approverPanel).toBeVisible();
    const decisionButton = approverPanel.getByRole('button', { name: 'Decision', exact: true });
    await expect(decisionButton).toBeHidden();
    await expect(approverPanel.locator('.desktop-decision:visible')).toHaveCount(0);

    await approverPage.setViewportSize({ width: 1280, height: 900 });
    await expect(decisionButton).toBeVisible();
    await decisionButton.click();
    await approverPanel.getByLabel('Decision comment').fill('Phê duyệt độc lập qua Playwright E2E');
    await approverPanel.getByRole('button', { name: 'Ghi quyết định độc lập' }).click();
    await expect(approverPage.getByText('Change decision độc lập đã được ghi.')).toBeVisible();
    await expect(approverPanel.getByText('APPROVED', { exact: true })).toBeVisible();
  } finally {
    await approverContext.close();
  }
});
