import { expect, test, type Page } from '@playwright/test';
import { installQuietEventStream, waitForQuietEventStream, waitForInitialLiveReads } from './helpers/quiet-event-stream';
const initialReads = new WeakMap<Page, { completed: number }>();

async function setup(page: Page, department = 'MAIN', historical = { totalHistorical: 8, totalResolvedAllTime: 8 }) {
  await installQuietEventStream(page);
  await page.clock.setFixedTime(new Date('2026-10-14T08:00:00Z'));
  const user = { id: `synthetic-${department}`, role: 'ADMIN', department, isMainAdmin: department === 'MAIN' };
  await page.addInitScript(current => localStorage.setItem('user', JSON.stringify(current)), user);
  const requests: URL[] = [];
  const reads = { completed: 0 }; initialReads.set(page, reads);
  const resolution = (month: number) => ({
    month, year: 2026, totalReportedThisMonth: 4, resolvedThisMonth: 4,
    activeThisMonth: 0, resolutionRate: 100, ...historical,
  });
  const area = { barangayId: 'synthetic-area', name: 'Synthetic barangay', status: 'ACTIVE',
    incidentCount: 3, activeCount: 0, respondingCount: 0, resolvedCount: 3, percentage: 38, riskLevel: 'HIGH' };
  const type = { typeId: 'synthetic-fire', typeName: 'Fire Outbreak', count: 8, percentage: 100, color: '#ef4444' };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, '');
    requests.push(url);
    if (route.request().method() !== 'GET') return route.fulfill({ status: 403, json: { message: 'Synthetic read-only fixture' } });
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user } } });
    if (path === '/api/events/v1/stream') return route.fulfill({
      contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
    });
    if (path === '/api/analytics/v1/dashboard') { await route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 8, topArea: area, rankings: [area] },
      incidentsByType: { totalIncidents: 8, topType: type, distribution: [type] },
      resolvedSummary: resolution(10),
    } } }); reads.completed++; return; }
    if (path === '/api/analytics/v1/resolved-summary') return route.fulfill({ json: { data: resolution(Number(url.searchParams.get('month'))) } });
    if (path === '/api/barangays/v1') return route.fulfill({ json: { data: { barangays: [] } } });
    if (path === '/api/incidents/v1/review-flags') return route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    if (path === '/api/incidents/v1') return route.fulfill({ json: { data: {
      // All-record totals, verified all-time totals and the visible page are
      // intentionally different; none may substitute for the report month.
      incidents: [], pagination: { page: 1, limit: 50, total: 9, pages: 1 },
      summary: { total: 9, active: 0, responding: 0, resolved: 9 },
      verifiedSummary: { total: 8, active: 0, responding: 0, resolved: 8 },
    } } });
    return route.fulfill({ json: { data: {} } });
  });
  return requests;
}

async function open(page: Page, surface: 'drawer' | 'page', department = 'MAIN') {
  await page.goto(surface === 'page' ? '/admin/barangay-history' : department === 'MAIN' ? '/admin/main-dashboard' : '/admin/fire-dashboard');
  await waitForQuietEventStream(page);
  if (surface === 'drawer') await page.getByRole('button', { name: 'Barangay History Log', exact: true }).click();
  await waitForInitialLiveReads(page, () => initialReads.get(page)!.completed, surface === 'page' ? 2 : 1);
  const scope = surface === 'drawer' ? page.getByRole('dialog', { name: 'Barangay Incident History Log' }) : page.locator('main');
  const card = scope.locator('[aria-label="Monthly verified resolution summary"]');
  await expect(card.getByText('October 2026 · 4 of 4 verified reports (100%).')).toBeVisible();
  return { scope, card, allTime: card.locator('[aria-label="All-time verified resolution summary"]') };
}

for (const surface of ['drawer', 'page'] as const) {
  for (const department of ['MAIN', 'FIRE']) {
    for (const width of [375, 1366]) {
      test(`${surface} ${department} ${width}px: eight all-time resolutions are distinct from four October reports`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const requests = await setup(page, department);
        const { scope, card, allTime } = await open(page, surface, department);
        await expect(allTime.getByText('8 of 8 verified reports resolved across all report dates.', { exact: true })).toBeVisible();
        await expect(scope.getByText('Rankings cover all-time verified reports', { exact: false })).toContainText('Unverified, rejected, cancelled and confirmed-false reports are excluded.');
        await expect(card).toContainText('not necessarily resolved during that month');
        await expect(scope.getByText(surface === 'drawer'
          ? '8 verified reports (100%) · all time'
          : 'Represents 100% of all-time verified reports (8 reports)', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (department === 'MAIN') await card.screenshot({ path: testInfo.outputPath(`resolution-scope-${surface}-${width}.png`) });
        const dashboardReads = requests.filter(url => url.pathname === '/api/analytics/v1/dashboard').length;
        await scope.getByLabel('Search incident history', { exact: true }).fill('synthetic');
        await expect.poll(() => requests.some(url => url.pathname.replace(/\/$/, '') === '/api/incidents/v1' && url.searchParams.get('search') === 'synthetic')).toBe(true);
        await expect(allTime).toContainText('8 of 8 verified reports');
        await card.getByLabel('Report month').fill('2026-09');
        await expect(card.getByText('September 2026 · 4 of 4 verified reports (100%).')).toBeVisible();
        await expect(allTime).toContainText('8 of 8 verified reports');
        expect(requests.filter(url => url.pathname === '/api/analytics/v1/dashboard')).toHaveLength(dashboardReads);
        expect([...requests.find(url => url.pathname === '/api/analytics/v1/resolved-summary')!.searchParams.keys()].sort()).toEqual(['month', 'year']);
      });
    }
  }
  for (const historical of [
    { totalHistorical: -1, totalResolvedAllTime: 8 },
    { totalHistorical: 8, totalResolvedAllTime: 9 },
    { totalHistorical: 8, totalResolvedAllTime: 3.5 },
  ]) {
    test(`${surface}: invalid all-time ${JSON.stringify(historical)} is unavailable, not guessed from history`, async ({ page }) => {
      await setup(page, 'MAIN', historical);
      const { allTime } = await open(page, surface);
      await expect(allTime.getByText('All-time totals unavailable.')).toBeVisible();
      await expect(allTime).not.toContainText('of 8 verified reports');
    });
  }
}
