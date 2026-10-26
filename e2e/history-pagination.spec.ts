import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const admin = { id: 'synthetic-history-admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
const records = Array.from({ length: 6 }, (_, index) => ({
  incidentId: `10000000-0000-4000-8000-${String(100 - index).padStart(12, '0')}`,
  title: `Report ${String(index + 1).padStart(2, '0')}`, status: 'RESPONDING', severityLevel: 'LOW',
  // First two share a timestamp; backend's incidentId DESC provides a stable tie.
  reportedAt: new Date(Date.UTC(2026, 9, 23, 4, 0) - Math.max(0, index - 1) * 60_000).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 23, 5, index)).toISOString(),
  type: { typeName: 'Medical Emergency' }, barangay: { name: 'Bangbang' }, location: {},
}));
async function setup(page: Page) {
  const peers: WebSocketRoute[] = [], closed = new Set<WebSocketRoute>();
  const state = { records: [] as typeof records, calls: [] as URL[], writes: 0, holdReads: null as Promise<void> | null,
    emit() { for (const peer of peers) if (!closed.has(peer)) peer.send('42["emergency.event",{"type":"incident.updated"}]'); } };
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user));
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
  }, admin);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peers.push(peer); peer.onClose(() => closed.add(peer));
    peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"synthetic-history-namespace"}'); });
    peer.send('0{"sid":"synthetic-history-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, '');
    if (route.request().method() !== 'GET') { state.writes++; return route.fulfill({ status: 403 }); }
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user: admin } } });
    if (path === '/api/analytics/v1/dashboard') return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 0, rankings: [], topArea: null },
      incidentsByType: { totalIncidents: 0, distribution: [], topType: null },
      resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: 0, resolvedThisMonth: 0,
        activeThisMonth: 0, resolutionRate: 0, totalHistorical: 0, totalResolvedAllTime: 0 },
    } } });
    if (path === '/api/incidents/v1') {
      const isHistory = url.searchParams.get('includeTotal') === 'true';
      if (isHistory) state.calls.push(url);
      if (isHistory && state.holdReads) await state.holdReads;
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const filtered = (isHistory ? state.records : []).filter(r => r.title.toLowerCase().includes(search));
      const current = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 5);
      return route.fulfill({ json: { data: { incidents: filtered.slice((current - 1) * limit, current * limit),
        pagination: { page: current, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
        summary: { total: filtered.length, active: 0, responding: filtered.length, resolved: 0 },
      } } });
    }
    return route.fulfill({ json: { data: { enabled: false, barangays: [], types: [], flags: [], items: [], hasMore: false,
      pagination: { page: 1, limit: 20, total: 0, pages: 0 } } } });
  });
  return state;
}

for (const surface of ['page', 'drawer'] as const) for (const width of [375, 1280]) {
  test(`${surface} ${width}px: newest-first server pages, empty/single boundaries and shrink recovery`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page);
    await page.goto(surface === 'page' ? '/admin/barangay-history' : '/admin/main-dashboard');
    if (surface === 'drawer') await page.getByRole('button', { name: 'Barangay History Log', exact: true }).click();
    const scope = surface === 'page' ? page.locator('main') : page.getByRole('dialog', { name: 'Barangay Incident History Log', exact: true });
    const nav = scope.locator('[data-history-pagination]');
    const refresh = scope.getByRole('button', { name: surface === 'page' ? 'Refresh Records' : 'Refresh history', exact: true });
    const titles = surface === 'page' ? scope.locator('[data-history-title]') : scope.locator('h4');
    await expect(nav).toContainText('0 records · 0 pages');
    await expect(nav.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
    await expect(nav.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    await expect(scope.getByText('Newest reports first · 5 records per page', { exact: true })).toBeVisible();
    state.records = records.slice(0, 2); await refresh.click();
    await expect(nav).toContainText('Records 1–2 of 2 · Page 1 of 1');
    await expect(titles).toHaveText(['Report 01', 'Report 02']);
    await expect(nav.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    state.records = records.slice(0, 5); await refresh.click();
    await expect(nav).toContainText('Records 1–5 of 5 · Page 1 of 1');
    await expect(titles).toHaveCount(5);
    await expect(nav.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    state.records = [...records]; state.emit();
    await expect(nav).toContainText('Records 1–5 of 6 · Page 1 of 2');
    await expect(titles.first()).toHaveText('Report 01'); await expect(titles.last()).toHaveText('Report 05');
    const next = nav.getByRole('button', { name: 'Next page', exact: true });
    await expect(nav.getByRole('navigation', { name: 'History pages', exact: true })).toBeVisible();
    if (width >= 640) {
      await expect(nav.getByRole('button', { name: 'Go to page 1', exact: true })).toHaveAttribute('aria-current', 'page');
      let release!: () => void;
      state.holdReads = new Promise<void>(resolve => { release = resolve; });
      const started = page.waitForRequest(request => {
        const url = new URL(request.url());
        return url.pathname.replace(/\/$/, '') === '/api/incidents/v1'
          && url.searchParams.get('includeTotal') === 'true' && url.searchParams.get('page') === '2';
      });
      await nav.getByRole('button', { name: 'Go to page 2', exact: true }).focus();
      await page.keyboard.press('Enter');
      await started;
      for (const button of await nav.getByRole('button').all()) await expect(button).toBeDisabled();
      state.holdReads = null; release();
    } else {
      await expect(nav.getByText('Page 1 of 2', { exact: true })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Go to page 2', exact: true })).toHaveCount(0);
      await next.click();
    }
    await expect(nav).toContainText('Records 6–6 of 6 · Page 2 of 2');
    await expect(titles).toHaveText(['Report 06']);
    expect(state.calls.at(-1)?.searchParams.get('page')).toBe('2');
    expect(state.calls.at(-1)?.searchParams.get('includeTotal')).toBe('true');
    expect(state.calls.at(-1)?.searchParams.get('limit')).toBe('5');
    if (surface === 'page') {
      expect(await nav.evaluate(el => el.closest('[aria-label="Incident history table"]') === null)).toBe(true);
      await expect(scope.getByRole('columnheader', { name: 'Date / Time', exact: true })).toHaveAttribute('aria-sort', 'descending');
    }
    await next.scrollIntoViewIfNeeded();
    const bounds = await next.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await nav.screenshot({ path: info.outputPath(`${surface}-${width}-pagination.png`) });
    if (width >= 640) await expect(nav.getByRole('button', { name: 'Go to page 2', exact: true })).toHaveAttribute('aria-current', 'page');
    await nav.getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(nav).toContainText('Records 1–5 of 6 · Page 1 of 2');
    await expect(titles).toHaveCount(5);
    await nav.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(nav).toContainText('Page 2 of 2');
    await scope.getByLabel('Search incident history', { exact: true }).fill('Report 02');
    await expect(nav).toContainText('Records 1–1 of 1 · Page 1 of 1');
    await expect(titles).toHaveText(['Report 02']);
    expect(state.calls.at(-1)?.searchParams.get('page')).toBe('1');
    await scope.getByLabel('Search incident history', { exact: true }).fill('');
    await expect(nav).toContainText('Records 1–5 of 6 · Page 1 of 2');
    await nav.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(nav).toContainText('Page 2 of 2');
    state.records = records.slice(0, 1); state.emit();
    await expect(nav).toContainText('Records 1–1 of 1 · Page 1 of 1');
    await expect(titles).toHaveText(['Report 01']);
    state.records = []; await refresh.click();
    await expect(nav).toContainText('0 records · 0 pages');
    await expect(nav.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
    expect(state.writes).toBe(0);
  });
}
