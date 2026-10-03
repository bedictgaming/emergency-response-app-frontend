import { expect, test, type Page } from '@playwright/test';
async function setup(page: Page) {
  const user = { id: 'synthetic-admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
  await page.addInitScript(current => localStorage.setItem('user', JSON.stringify(current)), user);
  const records = Array.from({ length: 52 }, (_, index) => ({ incidentId: `synthetic-${index}`, title: index === 51 ? 'Oldest matching record' : `History record ${index}`, severityLevel: 'LOW', status: index === 51 ? 'RESPONDING' : 'CLOSED', reportedAt: '2026-09-30T16:00:00Z', type: { typeName: 'Fire Outbreak' }, barangay: null, location: {}, incidentUnits: index === 51 ? [{ unit: { unitName: 'Synthetic Fire unit' } }] : [] }));
  const requests: URL[] = []; let unavailable = false; let analyticsUnavailable = false;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, '');
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user } } });
    if (path === '/api/events/v1/stream') return route.fulfill({ contentType: 'text/event-stream', body: 'event: connected\ndata: {"ok":true}\n\n' });
    if (path === '/api/analytics/v1/dashboard') return route.fulfill(analyticsUnavailable ? { status: 503, json: { message: 'Unavailable' } } : { json: { data: {
      incidentsByBarangay: { totalIncidents: 52, topArea: null, rankings: [] }, incidentsByType: { totalIncidents: 52, topType: null, distribution: [] },
      resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 52, resolvedThisMonth: 51, activeThisMonth: 1, resolutionRate: 98, totalHistorical: 52, totalResolvedAllTime: 51 },
    } } });
    if (path === '/api/barangays/v1') return route.fulfill({ json: { data: { barangays: [] } } });
    if (path === '/api/incidents/v1/review-flags') return route.fulfill({ json: { data: { flags: [], pagination: { total: 0, pages: 0, page: 1, limit: 20 } } } });
    if (path === '/api/incidents/v1') {
      const history = url.searchParams.get('limit') === '50';
      if (history) { requests.push(url); if (unavailable) return route.fulfill({ status: 503, json: { message: 'Unavailable' } }); }
      const search = (url.searchParams.get('search') ?? '').toLowerCase(), status = url.searchParams.get('status');
      const filtered = records.filter(record => record.title.toLowerCase().includes(search) && (!status || status === record.status));
      const pageNumber = Number(url.searchParams.get('page') ?? 1), limit = Number(url.searchParams.get('limit') ?? 50);
      return route.fulfill({ json: { data: { incidents: filtered.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { page: pageNumber, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) }, summary: { total: 52, active: 0, responding: 1, resolved: 51 }, verifiedSummary: { total: 52, active: 0, responding: 1, resolved: 51 } } } });
    }
    return route.fulfill({ json: { data: {} } });
  });
  return { requests, fail: () => { unavailable = true; }, recover: () => { unavailable = false; }, failAnalytics: () => { analyticsUnavailable = true; } };
}
for (const surface of ['drawer', 'page'] as const) {
  test(`${surface}: older records, server search, errors and retry`, async ({ page }, testInfo) => {
    const fixture = await setup(page);
    await page.goto(surface === 'drawer' ? '/admin/main-dashboard' : '/admin/barangay-history');
    if (surface === 'drawer') await page.getByRole('button', { name: 'Barangay History Log', exact: true }).click();
    const scope = surface === 'drawer' ? page.getByRole('dialog', { name: 'Barangay Incident History Log' }) : page.locator('main');
    // Page currently has a div shell rather than a main landmark.
    const content = surface === 'drawer' ? scope : page.locator('body');
    await expect(content.getByRole('button', { name: 'Next records' })).toBeVisible();
    await content.getByRole('button', { name: 'Next records' }).click();
    await expect(content.getByText('Oldest matching record', { exact: true })).toBeVisible();
    await content.getByLabel('Search incident history', { exact: true }).fill('Oldest matching');
    await expect.poll(() => fixture.requests.at(-1)?.searchParams.get('search')).toBe('Oldest matching');
    await expect(content.getByText('Oldest matching record', { exact: true })).toBeVisible();
    expect(fixture.requests.at(-1)?.searchParams.get('page')).toBe('1');
    if (surface === 'page') {
      expect(fixture.requests.at(-1)?.searchParams.get('includeUnits')).toBe('true');
      await expect(content.getByText('Synthetic Fire unit', { exact: true })).toBeVisible();
      await expect(content.getByText('Barangay unavailable', { exact: true })).toBeVisible();
      await content.getByLabel('Filter history by status').selectOption('RESPONDING');
      await expect.poll(() => fixture.requests.at(-1)?.searchParams.get('status')).toBe('RESPONDING');
      await content.getByLabel('Filter history by reporting period').selectOption('THIS_MONTH');
      await expect.poll(() => fixture.requests.at(-1)?.searchParams.get('period')).toBe('THIS_MONTH');
    }
    fixture.fail();
    await content.getByRole('button', { name: surface === 'drawer' ? 'Refresh history' : 'Refresh Records', exact: true }).click();
    await expect(content.getByRole('alert').filter({ hasText: 'History could not be loaded' })).toBeVisible();
    await expect(content.getByText('Oldest matching record', { exact: true })).toBeVisible();
    await expect(content.getByText('No Incident Records Found', { exact: true })).toHaveCount(0);
    fixture.recover(); await content.getByRole('button', { name: 'Retry history', exact: true }).click();
    await expect(content.getByRole('alert').filter({ hasText: 'History could not be loaded' })).toHaveCount(0);
    if (surface === 'drawer') {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 720 });
        await page.screenshot({ path: testInfo.outputPath(`history-${width}.png`) });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
  });
}
test('drawer traps focus, isolates the dashboard, supports Escape and restores focus', async ({ page }) => {
  await setup(page); await page.goto('/admin/main-dashboard');
  const trigger = page.getByRole('button', { name: 'Barangay History Log', exact: true }); await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Barangay Incident History Log' });
  const close = dialog.getByRole('button', { name: 'Close incident history' });
  await expect(close).toBeFocused();
  await trigger.evaluate(element => (element as HTMLElement).focus()); await expect(close).toBeFocused();
  const targets = dialog.locator('button:enabled, input, [tabindex="0"]');
  await targets.last().focus(); await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (const button of [close, dialog.getByRole('button', { name: 'Refresh history' })]) {
    const box = await button.boundingBox(); expect(box?.width).toBeGreaterThanOrEqual(44); expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const contrast = await dialog.locator('p[id]').first().evaluate(description => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const rgba = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return Array.from(context.getImageData(0, 0, 1, 1).data); };
    let ancestor = description.parentElement; let background = [255, 255, 255, 255];
    while (ancestor) { const candidate = rgba(getComputedStyle(ancestor).backgroundColor); if (candidate[3] === 255) { background = candidate; break; } ancestor = ancestor.parentElement; }
    const foreground = rgba(getComputedStyle(description).color), alpha = foreground[3] / 255;
    const composite = foreground.slice(0, 3).map((color, index) => color * alpha + background[index] * (1 - alpha));
    const luminance = (colors: number[]) => colors.slice(0, 3).map(color => { const value = color / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const light = Math.max(luminance(composite), luminance(background)), dark = Math.min(luminance(composite), luminance(background));
    return (light + .05) / (dark + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.setViewportSize({ width: 390, height: 720 });
  // Wait for the existing responsive font transition after resizing; do not
  // measure an intermediate animation value or weaken the 16px requirement.
  await expect.poll(() => dialog.getByLabel('Search incident history', { exact: true }).evaluate(input => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
});
test('first history outage is not presented as an empty dataset', async ({ page }) => {
  const fixture = await setup(page); fixture.fail(); fixture.failAnalytics();
  await page.goto('/admin/barangay-history');
  await expect(page.getByRole('alert').filter({ hasText: 'History could not be loaded' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Analytics unavailable' })).toBeVisible();
  await expect(page.getByText('No Incident Records Found', { exact: true })).toHaveCount(0);
});
test('changing accounts closes the drawer and discards private history', async ({ page }) => {
  await setup(page); await page.goto('/admin/main-dashboard');
  await page.getByRole('button', { name: 'Barangay History Log', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Barangay Incident History Log' });
  await expect(dialog.getByText('History record 0', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'another-account', role: 'USER' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }));
  });
  await expect(dialog).toHaveCount(0);
});
test('verification recovery sends one explicit request and displays a cooldown', async ({ page }) => {
  await page.route('**/api/auth/v1/resend-email-verification', route => route.fulfill({ status: 202, json: { message: 'If an eligible account exists, verification delivery has been requested.' } }));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter your account email' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('verification delivery has been requested');
  await expect(page.getByRole('button', { name: 'Verification requested · wait one minute' })).toBeDisabled();
});
