import { expect, test, type Page } from '@playwright/test';

const email = `${'citizen'.repeat(8)}@${'municipality'.repeat(5)}.example.test`;
const title = 'POLICE Emergency: Bangbang, Cordova, Cebu';
async function setup(page: Page, department: string) {
  const user = { id: 'synthetic-admin', name: 'Test Admin', email: 'admin@example.test', role: 'ADMIN', department, isMainAdmin: department === 'MAIN' };
  const service = department === 'DRRMO' ? 'HAZARD' : department === 'MAIN' ? 'POLICE' : department;
  const records = [true, false].map((hasEmail, index) => ({
    incidentId: `synthetic-${index}`, title: index === 0 ? title : 'Report with unavailable reporter email',
    description: 'Synthetic report for layout testing only.', reportedBy: 'synthetic-citizen',
    severityLevel: 'MEDIUM', status: 'RESPONDING', verificationStatus: 'VERIFIED', reportedAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z',
    requestedServices: [service], serviceResponses: [{ service, status: 'RESPONDING' }],
    type: { typeName: department === 'MAIN' ? 'Police' : department },
    barangay: { name: 'Day-as' }, location: { locationName: 'Bangbang, Cordova, Cebu' },
    incidentUnits: [{ incidentUnitId: `synthetic-dispatch-${index}`, unitId: 'synthetic-unit', status: 'DISPATCHED', assignedAt: '2026-10-09T00:00:00Z', unit: { unitName: 'Synthetic response unit with a descriptive operational name' } }], attachments: [],
    reporter: { id: 'synthetic-citizen', name: 'Synthetic Citizen', role: 'USER', ...(hasEmail ? { email } : {}) },
  }));
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user));
    class Stream { addEventListener() {} close() {} }
    Object.assign(window, { EventSource: Stream });
  }, user);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/analytics/v1/dashboard')) return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 2, topArea: null, rankings: [] }, incidentsByType: { totalIncidents: 2, topType: null, distribution: [] },
      resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 2, resolvedThisMonth: 0, activeThisMonth: 2, resolutionRate: 0, totalHistorical: 2, totalResolvedAllTime: 0 },
    } } });
    if (path.endsWith('/barangays/v1')) return route.fulfill({ json: { data: { barangays: [] } } });
    if (path.endsWith('/incidents/v1')) return route.fulfill({ json: { data: {
      incidents: records, pagination: { page: 1, limit: 50, total: 2, pages: 1 },
      summary: { total: 2, active: 0, responding: 2, resolved: 0 }, verifiedSummary: { total: 2, active: 0, responding: 2, resolved: 0 },
    } } });
    return route.fulfill({ json: { data: { items: [], hasMore: false, flags: [], pagination: { total: 0, pages: 0, page: 1, limit: 20 } } } });
  });
}

for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department} report cards show the scoped reporter email and handle missing/long values`, async ({ page }, testInfo) => {
    await setup(page, department);
    await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
    const identities = page.locator('[data-reporter-identity]');
    await expect(identities).toHaveCount(2);
    await expect(identities.first().locator('[data-reporter-email]')).toHaveText(email);
    await expect(identities.last().locator('[data-reporter-email]')).toHaveText('Not provided');
    for (const width of [1365, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await identities.first().locator('[data-reporter-email]').evaluate(element => element.getBoundingClientRect().right <= innerWidth)).toBe(true);
      if (department === 'POLICE') await page.screenshot({ path: testInfo.outputPath(`report-email-${width}.png`), fullPage: true });
    }
  });
}

test('history titles and headings keep readable widths inside a keyboard-scrollable table', async ({ page }, testInfo) => {
  await setup(page, 'MAIN');
  await page.goto('/admin/barangay-history');
  const region = page.getByRole('region', { name: 'Incident history table', exact: true });
  const titleCell = region.locator('[data-history-title]').first();
  await expect(titleCell).toHaveText(title);
  await expect(region.locator('[data-reporter-email]').first()).toHaveText(email);
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await titleCell.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(260);
    expect(await titleCell.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(70);
    expect(await region.getByRole('columnheader', { name: 'Incident Title & Details', exact: true }).evaluate(element => getComputedStyle(element).whiteSpace)).toBe('nowrap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await region.focus();
    await expect(region).toBeFocused();
    await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await region.locator('[data-reporter-email]').first().scrollIntoViewIfNeeded();
    await expect(region.locator('[data-reporter-email]').first()).toBeInViewport();
    await region.evaluate(element => { element.scrollLeft = 0; });
    await page.screenshot({ path: testInfo.outputPath(`history-layout-${width}.png`), fullPage: true });
  }
});

test('an unsigned admin request does not reveal reporter identity', async ({ page }) => {
  await setup(page, 'MAIN');
  await page.route('**/api/auth/v1/me', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  await page.route('**/api/auth/v1/refresh-token', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  await page.goto('/admin/main-dashboard');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-reporter-identity]')).toHaveCount(0);
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
});
