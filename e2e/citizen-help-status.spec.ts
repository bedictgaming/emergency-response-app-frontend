import { expect, test, type Page } from '@playwright/test';

const citizen = { id: 'test-user', name: 'Test Citizen', email: 'citizen@example.test', role: 'USER' };

function incident(index: number) {
  return {
    incidentId: `own-report-${index}`,
    title: `Fire report ${index}`,
    description: `Report details ${index}`,
    typeId: 'fire',
    locationId: 'poblacion',
    severityLevel: 'HIGH',
    status: index === 1 ? 'RESPONDING' : 'RESOLVED',
    verificationStatus: 'VERIFIED',
    reportedBy: citizen.id,
    reportedAt: new Date(Date.now() - (index - 1) * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    type: { typeId: 'fire', typeName: 'Fire' },
    location: { locationId: 'poblacion', locationName: 'Poblacion' },
    attachments: [],
  };
}

async function mockCitizenDashboard(page: Page, reports: ReturnType<typeof incident>[], onList?: () => void) {
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), citizen);
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: citizen } } }));
  await page.route('**/api/incidents/v1/**', route => {
    if (route.request().method() === 'GET') {
      expect(new URL(route.request().url()).searchParams.get('reportedBy')).toBe(citizen.id);
      onList?.();
    }
    return route.fulfill({ json: { data: { incidents: reports } } });
  });
  await page.route('**/api/events/v1/stream', route => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'event: connected\ndata: {"ok":true}\n\n',
  }));
}

test('help panel shows truthful own status and opens the latest report across history pages', async ({ page }) => {
  let listRequests = 0;
  await mockCitizenDashboard(page, [1, 2, 3, 4, 5].map(incident), () => { listRequests += 1; });
  await page.goto('/dashboard');

  const help = page.getByRole('complementary', { name: 'Help and status' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('link', { name: 'Call 911 for emergency help' })).toHaveAttribute('href', 'tel:911');
  await expect(help.getByText('Coordination in progress')).toBeVisible();
  await expect(help.getByText('No daily report limit.')).toBeVisible();
  await expect(help.getByText('Similar active emergencies within 100 metres', { exact: false })).toBeVisible();
  if (process.env.HELP_STATUS_CAPTURE === '1') {
    await page.screenshot({ path: 'test-results/help-status-desktop.png', fullPage: true });
  }

  await page.getByRole('button', { name: 'Go to page 2' }).click();
  await expect(page.locator('#citizen-report-own-report-1')).toHaveCount(0);
  const requestsBeforeView = listRequests;
  await help.getByRole('button', { name: 'View latest fire report' }).click();
  await expect(page.locator('#citizen-report-own-report-1')).toBeFocused();
  expect(listRequests).toBe(requestsBeforeView);
});

test('mobile keeps the telephone action ahead of emergency choices and handles unavailable reports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.addInitScript((user) => localStorage.setItem('user', JSON.stringify(user)), citizen);
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: citizen } } }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({ status: 503, json: { status: 'error', message: 'Unavailable' } }));
  await page.route('**/api/events/v1/stream', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/dashboard');

  const call = page.getByRole('link', { name: 'Call 911 for emergency help' });
  const help = page.getByRole('complementary', { name: 'Help and status' });
  await expect(call).toBeVisible();
  await expect(call).toHaveAttribute('href', 'tel:911');
  await expect(help.getByText('No daily report limit.')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Latest report', exact: true }).getByText('Your latest report is unavailable. Retry reports to check its status.')).toBeVisible();
  if (process.env.HELP_STATUS_CAPTURE === '1') {
    await page.screenshot({ path: 'test-results/help-status-mobile.png', fullPage: true });
  }
  const callBox = await call.boundingBox();
  const fireBox = await page.getByRole('button', { name: 'Report a fire emergency' }).boundingBox();
  expect(callBox && fireBox && callBox.y < fireBox.y).toBeTruthy();
  await expect(page.getByRole('button', { name: 'Report a fire emergency' })).toBeEnabled();
  await expect(page.getByText('No emergency reports')).toHaveCount(0);
});

test('an empty history and a later refresh failure remain distinct', async ({ page }) => {
  await mockCitizenDashboard(page, []);
  await page.goto('/dashboard');
  const help = page.getByRole('complementary', { name: 'Help and status' });
  await expect(help.getByText('No daily report limit.')).toBeVisible();
  await expect(help.getByText('No reports yet. Choose an emergency type to start a report.')).toBeVisible();
  await expect(page.getByText('No emergency reports')).toBeVisible();

  await page.route('**/api/incidents/v1/**', route => route.fulfill({ status: 503, json: { status: 'error', message: 'Unavailable' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Reports could not be refreshed.', { exact: false })).toBeVisible();
  await expect(help.getByText('No daily report limit.')).toBeVisible();
  await expect(page.getByText('No emergency reports')).toBeVisible();
  await expect(help.getByRole('link', { name: 'Call 911 for emergency help' })).toBeVisible();
});

test('all emergency choices stay available after more than two same-day reports, including across midnight', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-24T15:59:00.000Z') });
  const report = { ...incident(1), reportedAt: '2026-09-24T15:55:00.000Z' };
  await mockCitizenDashboard(page, [1, 2, 3, 4, 5].map(index => ({ ...report, incidentId: `same-day-${index}` })));
  await page.goto('/dashboard');
  const help = page.getByRole('complementary', { name: 'Help and status' });
  await expect(help.getByText('No daily report limit.')).toBeVisible();
  for (const name of ['Report a fire emergency', 'Report a medical emergency', 'Report a police emergency', 'Report a hazard emergency', 'Report an emergency that needs other or multiple services']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Report a fire emergency', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.clock.fastForward(61_000);
  await expect(help.getByText('No daily report limit.')).toBeVisible();
  await expect(page.getByText(/remaining today|daily report limit reached|allowance resets/i)).toHaveCount(0);
});
