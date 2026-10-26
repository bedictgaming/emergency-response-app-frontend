import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
for (const width of [375, 1280]) test(`existing citizen pager retains its default controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const user = { id: 'synthetic-citizen-pager', role: 'USER', status: 'ACTIVE', department: null, isMainAdmin: false };
  const reports = Array.from({ length: 6 }, (_, n) => ({
    incidentId: `synthetic-own-report-${n + 1}`, title: `Medical report ${n + 1}`, description: `Synthetic report ${n + 1}`,
    typeId: 'synthetic-medical', locationId: 'synthetic-location', severityLevel: 'LOW', status: 'RESPONDING',
    verificationStatus: 'VERIFIED', reportedBy: user.id, reportedAt: new Date(Date.UTC(2026, 9, 23, 4) - n * 60000).toISOString(),
    updatedAt: '2026-10-23T04:00:00Z', type: { typeName: 'Medical Emergency' },
    location: { locationName: 'Synthetic test location' }, attachments: [], requestedServices: ['MEDICAL'],
  }));
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user));
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
  }, user);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"synthetic-citizen-pager-namespace"}'); });
    peer.send('0{"sid":"synthetic-citizen-pager-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  let writes = 0;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (route.request().method() !== 'GET') { writes++; return route.fulfill({ status: 403 }); }
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user } } });
    if (path === '/api/incidents/v1') {
      expect(new URL(route.request().url()).searchParams.get('reportedBy')).toBe(user.id);
      return route.fulfill({ json: { data: { incidents: reports } } });
    }
    return route.fulfill({ json: { data: { enabled: false, nearby: false, complete: true, radiusMeters: 100, barangays: [], types: [], items: [] } } });
  });
  await page.goto('/dashboard');
  const region = page.getByRole('region', { name: 'Your reports', exact: true });
  const nav = region.getByRole('navigation', { name: 'Report pages', exact: true });
  const articles = region.locator('article');
  await expect(articles).toHaveCount(3);
  await expect(articles.first()).toHaveAttribute('id', 'citizen-report-synthetic-own-report-1');
  await expect(nav.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  if (width >= 640) {
    await expect(nav.getByRole('button', { name: 'Go to page 1', exact: true })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  } else {
    await expect(nav.getByText('Page 1 of 2', { exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Next page', exact: true }).click();
  }
  await expect(articles).toHaveCount(3);
  await expect(articles.first()).toHaveAttribute('id', 'citizen-report-synthetic-own-report-4');
  await expect(articles.last()).toHaveAttribute('id', 'citizen-report-synthetic-own-report-6');
  await expect(nav.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await nav.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(articles.first()).toHaveAttribute('id', 'citizen-report-synthetic-own-report-1');
  await expect(region.getByText('6 reports total', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
});
