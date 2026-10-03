import { expect, test, type Page } from '@playwright/test';

const departments = ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO'] as const;
const viewports = [{ width: 688, height: 640 }, { width: 390, height: 640 }];

async function openHistory(page: Page, department: typeof departments[number]) {
  const user = { id: `history-${department}`, role: 'ADMIN', department, isMainAdmin: department === 'MAIN' };
  await page.clock.setFixedTime(new Date('2026-10-03T07:00:00Z'));
  await page.addInitScript(current => localStorage.setItem('user', JSON.stringify(current)), user);
  const incidents = Array.from({ length: 24 }, (_, index) => ({
    incidentId: `synthetic-history-${index}`, title: `Synthetic history record ${index}`,
    description: 'Synthetic scroll regression record', status: 'RESOLVED', verificationStatus: 'VERIFIED',
    severityLevel: 'LOW', reportedAt: '2026-10-01T07:00:00Z', updatedAt: '2026-10-01T07:00:00Z',
    type: { typeId: 'fire', typeName: 'Fire Outbreak' },
    barangay: { barangayId: `area-${index % 5}`, name: `Synthetic area ${index % 5}` },
    attachments: [], incidentUnits: [], requestedServices: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'],
  }));
  const rankings = Array.from({ length: 5 }, (_, index) => ({
    barangayId: `area-${index}`, name: `Synthetic area ${index}`, incidentCount: 4, percentage: 17, riskLevel: 'HIGH',
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user } } });
    if (path === '/api/events/v1/stream') return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n' });
    if (path === '/api/analytics/v1/dashboard') return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 24, rankings, topArea: rankings[0] },
      incidentsByType: { totalIncidents: 24, distribution: [], topType: { typeName: 'Fire Outbreak', count: 24, percentage: 100 } },
      resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 24, resolvedThisMonth: 24 },
    } } });
    if (path === '/api/incidents/v1') return route.fulfill({ json: { data: {
      incidents, pagination: { page: 1, limit: 100, total: 24, pages: 1 },
      summary: { total: 24, active: 0, responding: 0, resolved: 24 },
      verifiedSummary: { total: 24, active: 0, responding: 0, resolved: 24 },
    } } });
    if (path === '/api/incidents/v1/review-flags') return route.fulfill({ json: { data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
    return route.fulfill({ json: { data: {} } });
  });
  await page.goto(`/admin/${department === 'MAIN' ? 'main' : department.toLowerCase()}-dashboard`);
  await page.getByRole('button', { name: 'Barangay History Log', exact: true }).click();
  const body = page.getByRole('region', { name: 'Incident history content', exact: true });
  await expect(body.getByRole('heading', { name: 'Synthetic history record 23', exact: true })).toBeAttached();
  return body;
}

for (const department of departments) {
  for (const viewport of viewports) {
    test(`${department}: one scroll reaches every history section at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const body = await openHistory(page, department);
      const header = page.getByRole('heading', { name: 'Barangay Incident History Log', exact: true });
      const initialHeader = await header.boundingBox();
      await expect(body).toBeInViewport();
      const dimensions = await body.evaluate(element => ({
        top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom,
        height: element.clientHeight, scrollHeight: element.scrollHeight,
        nestedScrollers: [...element.querySelectorAll('*')].filter(child =>
          ['auto', 'scroll'].includes(getComputedStyle(child).overflowY) && child.scrollHeight > child.clientHeight).length,
      }));
      expect(dimensions.height).toBeGreaterThan(100);
      expect(dimensions.bottom).toBeLessThanOrEqual(viewport.height);
      expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
      expect(dimensions.nestedScrollers).toBe(0);
      await body.hover({ position: { x: 30, y: 60 } });
      await page.mouse.wheel(0, 500);
      await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
      await body.focus();
      await page.keyboard.press('End');
      const last = body.getByRole('heading', { name: 'Synthetic history record 23', exact: true });
      await expect(last).toBeInViewport();
      expect((await header.boundingBox())?.y).toBe(initialHeader?.y);
      await expect(page.getByRole('button', { name: 'Close incident history' })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (department === 'MAIN') await page.screenshot({ path: testInfo.outputPath(`history-bottom-${viewport.width}.png`) });
      await page.keyboard.press('Home');
      await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0);
      if (department === 'MAIN') await page.screenshot({ path: testInfo.outputPath(`history-top-${viewport.width}.png`) });
      const search = body.getByLabel('Search incident history', { exact: true });
      await search.fill('Synthetic history record 23');
      await expect(body.locator('h4')).toHaveCount(1);
      await expect(last).toHaveText('Synthetic history record 23');
      await search.fill('no-matching-record');
      await expect(body.getByRole('heading', { name: 'No Incident Records Found' })).toBeVisible();
      await page.getByRole('button', { name: 'Close incident history' }).click();
      await expect(body).toHaveCount(0);
    });
  }
}

test('phone touch swipe scrolls the history body without moving its header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const body = await openHistory(page, 'FIRE');
  const header = page.getByRole('heading', { name: 'Barangay Incident History Log', exact: true });
  const initialHeader = await header.boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 560 }] });
  for (const y of [500, 440, 380, 320, 260]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  expect((await header.boundingBox())?.y).toBe(initialHeader?.y);
  await session.detach();
});
