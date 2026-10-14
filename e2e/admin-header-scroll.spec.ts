import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const surfaces = ['main-dashboard', 'fire-dashboard', 'medical-dashboard', 'police-dashboard', 'drrmo-dashboard', 'users', 'analytics', 'barangay-history', 'operations'];
async function setup(page: Page, surface: string) {
  const department = surface.endsWith('-dashboard') ? surface.split('-')[0].toUpperCase() : 'MAIN';
  const user = { id: 'synthetic-scroll-admin', role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN' };
  await page.addInitScript(current => {
    localStorage.setItem('user', JSON.stringify(current));
    localStorage.setItem('emergency-response-theme', 'light');
    Object.assign(window, { headerScrollCloseCalls: 0 });
    class Stream extends EventTarget { close() { (window as unknown as { headerScrollCloseCalls: number }).headerScrollCloseCalls++; } }
    Object.assign(window, { EventSource: Stream });
  }, user);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'Synthetic scroll fixture forbids mutations' } });
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/analytics/v1/dashboard')) return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 0, topArea: null, rankings: [] }, incidentsByType: { totalIncidents: 0, topType: null, distribution: [] },
      resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 0, resolvedThisMonth: 0, activeThisMonth: 0, resolutionRate: 0, totalHistorical: 0, totalResolvedAllTime: 0 },
    } } });
    return route.fulfill({ json: { data: { incidents: [], users: [], tasks: [], units: [], resources: [], alerts: [], types: [], barangays: [], flags: [], items: [], hasMore: false, scope: department,
      pagination: { page: 1, limit: 50, total: 0, pages: 0, totalPages: 0 }, summary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 }, serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 },
    } } });
  });
  await page.route('https://**', route => route.abort());
  await page.goto('/admin/' + surface);
  const header = page.locator('header[data-header-frame="shared"]');
  await expect(header).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Give empty synthetic pages scrollable content inside their real sticky containing block.
  await header.evaluate(element => { const spacer = document.createElement('div'); spacer.style.height = '1600px'; spacer.dataset.headerScrollFixture = 'true'; element.parentElement!.append(spacer); });
  return header;
}
for (const width of [375, 1366]) for (const surface of surfaces) {
  test(`${surface} hides down, restores up and keeps focused controls reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 667 });
    const header = await setup(page, surface);
    await expect(header).toHaveAttribute('data-pinned', 'false');
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await expect(header.locator('a[href="/settings"]')).toHaveCount(0);
    const position = await page.locator('main').evaluate(element => element.getBoundingClientRect().top + scrollY);
    const closes = await page.evaluate(() => (window as unknown as { headerScrollCloseCalls: number }).headerScrollCloseCalls);
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 500, behavior: 'instant' }); });
    await expect(header).toHaveAttribute('data-hidden', 'true');
    await expect.poll(async () => { const box = (await header.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual(0);
    await page.evaluate(() => window.scrollTo({ top: 480, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await expect.poll(async () => (await header.boundingBox())!.y).toBeGreaterThanOrEqual(-1);
    expect(await page.locator('main').evaluate(element => element.getBoundingClientRect().top + scrollY)).toBe(position);
    expect(await page.evaluate(() => (window as unknown as { headerScrollCloseCalls: number }).headerScrollCloseCalls)).toBe(closes);
    await page.evaluate(() => window.scrollTo({ top: 650, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'true');
    const control = header.locator('button, a[href]').first();
    await control.focus(); await expect(control).toBeFocused();
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await page.evaluate(() => window.scrollTo({ top: 750, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
    await expect(header).toHaveAttribute('data-hidden', 'false');
    if (surface === 'main-dashboard') await page.screenshot({ path: test.info().outputPath(`admin-header-${width}.png`) });
  });
}
for (const surface of ['main-dashboard', 'barangay-history', 'operations']) {
  test(`${surface} retains direction behavior without transitions for reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const header = await setup(page, surface);
    const motion = await header.evaluate(element => ({
      requested: parseFloat((element as HTMLElement).style.transitionDuration),
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      durations: getComputedStyle(element).transitionDuration.split(',').map(value => parseFloat(value) / (value.trim().endsWith('ms') ? 1000 : 1)),
    }));
    expect(motion.requested).toBe(0);
    expect(motion.reduce).toBe(true);
    // globals.css intentionally retains 0.01ms !important rather than zero.
    expect(motion.durations.every(value => Number.isFinite(value) && value >= 0 && value <= 0.00001)).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'true');
    await page.evaluate(() => window.scrollTo({ top: 480, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'false');
  });
}

test('history print keeps its header visible even when screen scroll has hidden it', async ({ page }) => {
  const header = await setup(page, 'barangay-history');
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-hidden', 'true');
  await page.emulateMedia({ media: 'print' });
  expect(await header.evaluate(element => getComputedStyle(element).position)).toBe('static');
  expect(await header.evaluate(element => getComputedStyle(element).transform)).toBe('none');
});
