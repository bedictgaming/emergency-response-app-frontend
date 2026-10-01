import { expect, test, type Page, type Route } from '@playwright/test';

function monthly(month: number, count: number) {
  return { month, year: 2026, resolvedThisMonth: count, totalReportedThisMonth: count,
    activeThisMonth: 0, resolutionRate: count ? 100 : 0,
    totalHistorical: 14, totalResolvedAllTime: 14 };
}

async function setup(page: Page, onMonth?: (route: Route) => Promise<void>) {
  await page.clock.setFixedTime(new Date('2026-10-01T07:00:00Z'));
  const user = { id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
  await page.addInitScript(current => localStorage.setItem('user', JSON.stringify(current)), user);
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user } } });
    if (path === '/api/events/v1/stream') return route.fulfill({
      contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n',
    });
    if (path === '/api/analytics/v1/dashboard') return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 14, rankings: [], topArea: null },
      incidentsByType: { totalIncidents: 14, distribution: [], topType: null },
      resolvedSummary: monthly(10, 0),
    } } });
    if (path === '/api/analytics/v1/resolved-summary') {
      if (onMonth) return onMonth(route);
      const month = Number(url.searchParams.get('month'));
      return route.fulfill({ json: { data: monthly(month, month === 9 ? 14 : 0) } });
    }
    if (path === '/api/incidents/v1/review-flags') return route.fulfill({ json: {
      data: { flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } },
    } });
    if (path === '/api/incidents/v1') return route.fulfill({ json: { data: {
      // Never derive monthly counts from the visible page or all-record summary.
      incidents: [], pagination: { page: 1, limit: 5, total: 15, pages: 3 },
      summary: { total: 15, active: 0, responding: 0, resolved: 15 },
      verifiedSummary: { total: 14, active: 0, responding: 0, resolved: 14 },
    } } });
    if (path === '/api/barangays/v1') return route.fulfill({ json: { data: { barangays: [] } } });
    return route.fulfill({ json: { data: {} } });
  });
}

for (const surface of ['drawer', 'page'] as const) {
  async function open(page: Page) {
    await page.goto(surface === 'page' ? '/admin/barangay-history' : '/admin/main-dashboard');
    if (surface === 'drawer') await page.getByRole('button', { name: 'Barangay History Log' }).click();
    const card = page.locator('[aria-label="Monthly verified resolution summary"]');
    await expect(card.getByText('October 2026 · 0 of 0 verified reports (0%).')).toBeVisible();
    return card;
  }

  test(`${surface}: October resets but September records remain selectable`, async ({ page }, testInfo) => {
    const requested: URL[] = [];
    await setup(page, async route => {
      const url = new URL(route.request().url());
      requested.push(url);
      const month = Number(url.searchParams.get('month'));
      return route.fulfill({ json: { data: monthly(month, month === 9 ? 14 : 0) } });
    });
    const card = await open(page);
    await expect(card.getByLabel('Report month')).toHaveValue('2026-10');
    await card.getByLabel('Report month').fill('2026-09');
    await expect(card.getByText('September 2026 · 14 of 14 verified reports (100%).')).toBeVisible();
    expect(requested.at(-1)?.searchParams.get('year')).toBe('2026');
    expect(requested.at(-1)?.searchParams.get('month')).toBe('9');
    expect([...requested.at(-1)!.searchParams.keys()].sort()).toEqual(['month', 'year']);
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(card.getByText('14', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await card.getByLabel('Report month').evaluate(input => (input as HTMLInputElement).labels?.length)).toBe(1);
      await card.screenshot({ path: testInfo.outputPath(`monthly-${surface}-${width}.png`) });
    }
    await card.getByLabel('Report month').fill('2026-10');
    await expect(card.getByText('October 2026 · 0 of 0 verified reports (0%).')).toBeVisible();
  });

  test(`${surface}: unavailable past month offers retry instead of a false zero`, async ({ page }) => {
    let attempts = 0;
    await setup(page, async route => {
      attempts++;
      // The shared client safely retries a 503 GET once before surfacing it.
      return route.fulfill(attempts <= 2
        ? { status: 503, json: { code: 503, status: 'error', message: 'Temporarily unavailable' } }
        : { json: { data: monthly(9, 14) } });
    });
    const card = await open(page);
    await card.getByLabel('Report month').fill('2026-09');
    await expect(card.getByText('September 2026 totals unavailable.')).toBeVisible();
    await expect(card.getByText('0', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Retry monthly totals' }).click();
    await expect(card.getByText('September 2026 · 14 of 14 verified reports (100%).')).toBeVisible();
    expect(attempts).toBe(3);
  });

  test(`${surface}: stale September response cannot replace selected August`, async ({ page }) => {
    let releaseSeptember!: () => void;
    const waitForRelease = new Promise<void>(resolve => { releaseSeptember = resolve; });
    let septemberStarted!: () => void;
    const started = new Promise<void>(resolve => { septemberStarted = resolve; });
    await setup(page, async route => {
      const month = Number(new URL(route.request().url()).searchParams.get('month'));
      if (month === 9) { septemberStarted(); await waitForRelease; }
      await route.fulfill({ json: { data: monthly(month, month === 9 ? 14 : 3) } });
    });
    const card = await open(page);
    await card.getByLabel('Report month').fill('2026-09');
    await started;
    await expect(card.getByText('Loading September 2026 records…')).toBeVisible();
    await card.getByLabel('Report month').fill('2026-08');
    await expect(card.getByText('August 2026 · 3 of 3 verified reports (100%).')).toBeVisible();
    const response = page.waitForResponse(r => new URL(r.url()).searchParams.get('month') === '9');
    releaseSeptember();
    await response;
    await expect(card.getByText('August 2026 · 3 of 3 verified reports (100%).')).toBeVisible();
    await expect(card.getByText('14', { exact: true })).toHaveCount(0);
  });
}
