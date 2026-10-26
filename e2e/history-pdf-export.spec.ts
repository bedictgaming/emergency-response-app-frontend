import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const user = { id: 'pdf-synthetic-admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
const monthly = (month = 10) => ({ month, year: 2026, totalReportedThisMonth: 14, resolvedThisMonth: 10,
  activeThisMonth: 4, resolutionRate: 71, totalHistorical: 200, totalResolvedAllTime: 150 });
const ranking = { barangayId: 'alegria', name: 'Alegria', status: 'ACTIVE', incidentCount: 160,
  activeCount: 10, respondingCount: 30, resolvedCount: 120, percentage: 80, riskLevel: 'HIGH' };
const category = { typeId: 'fire', typeName: 'Fire Outbreak', count: 140, percentage: 70, color: '#f00' };
const records = Array.from({ length: 107 }, (_, i) => ({
  incidentId: `10000000-0000-4000-8000-${String(1000 - i).padStart(12, '0')}`,
  title: `PDF-${String(i + 1).padStart(3, '0')} Niño`,
  description: i === 0 ? 'First report - Peña. Unsupported glyph: 🚨. <script>plain text only</script>. '.repeat(12) : `Synthetic report details ${i + 1}.`,
  reportedAt: new Date(Date.UTC(2026, 9, 22, 10) - i * 60_000).toISOString(), updatedAt: '2026-10-22T12:00:00Z',
  typeId: 'fire', type: { typeName: 'Fire Outbreak' }, barangayId: 'alegria', barangay: { name: 'Alegria' }, location: {},
  status: 'RESPONDING', severityLevel: 'HIGH', verificationStatus: i === 0 ? 'UNVERIFIED' : 'VERIFIED',
  reporter: { name: 'Synthetic Peña', email: 'synthetic@example.test' },
}));

async function setup(page: Page) {
  const state = { calls: [] as URL[], writes: 0, printed: 0, mode: 'ok', hold: null as Promise<void> | null,
    me: user, downloads: 0, exportReads: 0, monthCalls: [] as URL[] };
  await page.addInitScript(current => {
    localStorage.setItem('user', JSON.stringify(current)); localStorage.setItem('emergency-session-generation', 'pdf-test-session');
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
    Object.defineProperty(window, 'print', { value: () => { (window as Window & { printed?: number }).printed = 1; } });
  }, user);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"pdf-synthetic-namespace"}'); });
    peer.send('0{"sid":"pdf-synthetic-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  page.on('download', () => { state.downloads++; });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, '');
    if (route.request().method() !== 'GET') { state.writes++; return route.fulfill({ status: 403 }); }
    if (path === '/api/auth/v1/me') return route.fulfill({ json: { data: { user: state.me } } });
    if (path === '/api/analytics/v1/dashboard') return route.fulfill({ json: { data: {
      incidentsByBarangay: { totalIncidents: 200, rankings: [ranking], topArea: ranking },
      incidentsByType: { totalIncidents: 200, distribution: [category], topType: category }, resolvedSummary: monthly(),
    } } });
    if (path === '/api/analytics/v1/resolved-summary') {
      state.monthCalls.push(url);
      return route.fulfill({ json: { data: monthly(Number(url.searchParams.get('month'))) } });
    }
    if (path === '/api/barangays/v1') return route.fulfill({ json: { data: { barangays: [{ barangayId: 'alegria', name: 'Alegria', status: 'ACTIVE' }] } } });
    if (path === '/api/incidents/v1') {
      const current = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 5);
      const exporting = limit === 100;
      if (exporting) {
        state.calls.push(url); state.exportReads++;
        if (state.hold) await state.hold;
        if (state.mode === 'failure') return route.fulfill({ status: 500, json: { message: 'synthetic unavailable' } });
      }
      const filtered = state.mode === 'empty' ? [] : records;
      const total = exporting && state.mode === 'limit' ? 1001 : exporting && state.mode === 'changed' && current === 2 ? 106 : filtered.length;
      return route.fulfill({ json: { data: { incidents: filtered.slice((current - 1) * limit, Math.min(current * limit, total)),
        pagination: { page: current, limit, total, pages: Math.ceil(total / limit) },
      } } });
    }
    // Unknown endpoints cannot reach the owner's live backend.
    return route.fulfill({ status: 404, json: { data: {} } });
  });
  await page.goto('/admin/barangay-history');
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  return state;
}

test('download every filtered batch and selected summaries, never print', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 }); const state = await setup(page);
  await page.getByRole('button', { name: /Fire Outbreak.*140 cases/ }).click();
  await page.getByLabel('Filter history by barangay', { exact: true }).selectOption('alegria');
  await page.getByLabel('Filter history by status', { exact: true }).selectOption('RESPONDING');
  await page.getByLabel('Filter history by reporting period', { exact: true }).selectOption('LAST_30_DAYS');
  await page.getByLabel('Search incident history', { exact: true }).fill('PDF');
  await page.getByLabel('Report month', { exact: true }).fill('2026-09');
  let release!: () => void; state.hold = new Promise<void>(resolve => { release = resolve; });
  const exportButton = page.getByRole('button', { name: 'Export PDF', exact: true });
  await exportButton.click(); await expect.poll(() => state.calls.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Preparing PDF', exact: true })).toBeDisabled();
  await page.locator('header').screenshot({ path: info.outputPath('desktop-export-busy.png') });
  state.hold = null; release();
  const download = await page.waitForEvent('download'); await download.saveAs(info.outputPath('filtered-history.pdf'));
  await expect(page.getByRole('status')).toContainText('107 matching records, plus summaries');
  expect(state.calls.map(url => url.searchParams.get('page'))).toEqual(['1', '2', '1']);
  for (const url of state.calls) {
    expect(Object.fromEntries(['typeName', 'barangayId', 'status', 'period', 'search'].map(key => [key, url.searchParams.get(key)])))
      .toEqual({ typeName: 'Fire Outbreak', barangayId: 'alegria', status: 'RESPONDING', period: 'LAST_30_DAYS', search: 'PDF' });
    expect(url.searchParams.get('to')).toBeTruthy();
  }
  expect(new Set(state.calls.map(url => url.searchParams.get('to'))).size).toBe(1);
  expect(state.monthCalls.at(-1)?.searchParams.get('month')).toBe('9');
  expect(state.downloads).toBe(1); expect(state.writes).toBe(0);
  expect(await page.evaluate(() => (window as Window & { printed?: number }).printed ?? 0)).toBe(0);
});

test('mobile empty export is a PDF with summaries and an accessible control', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 900 }); const state = await setup(page); state.mode = 'empty';
  const control = page.getByRole('button', { name: 'Export PDF', exact: true });
  await control.focus(); const bounds = await control.boundingBox();
  expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  const downloadPromise = page.waitForEvent('download'); await page.keyboard.press('Enter');
  const download = await downloadPromise; await download.saveAs(info.outputPath('empty-history.pdf'));
  await expect(page.getByRole('status')).toContainText('0 matching records');
  await page.screenshot({ path: info.outputPath('mobile-export-complete.png') });
  expect(state.downloads).toBe(1); expect(state.writes).toBe(0);
});

for (const mode of ['failure', 'changed', 'limit']) test(`${mode}: no partial PDF, clear retry guidance`, async ({ page }, info) => {
  const state = await setup(page); state.mode = mode;
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByLabel('PDF export status').getByRole('alert')).toContainText(mode === 'limit' ? 'More than 1,000' : 'No file was downloaded');
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  expect(state.downloads).toBe(0); expect(state.writes).toBe(0);
  if (mode === 'failure') await page.getByLabel('PDF export status').screenshot({ path: info.outputPath('desktop-export-error.png') });
});

test('a newer session invalidates an in-flight export, even for the same user', async ({ page }) => {
  const state = await setup(page); let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect.poll(() => state.exportReads).toBe(1);
  await page.evaluate(() => { localStorage.setItem('emergency-session-generation', 'newer-session'); window.dispatchEvent(new StorageEvent('storage')); });
  state.hold = null; release();
  await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeEnabled();
  expect(state.downloads).toBe(0); expect(state.writes).toBe(0);
});

test('selection changes cancel, and final server account mismatch prevents download', async ({ page }) => {
  const state = await setup(page); let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click(); await expect.poll(() => state.exportReads).toBe(1);
  await page.getByLabel('Search incident history', { exact: true }).fill('changed selection');
  state.hold = null; release();
  await expect(page.getByLabel('PDF export status').getByRole('alert')).toContainText('cancelled');
  state.me = { ...user, department: 'FIRE', isMainAdmin: false };
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  await expect(page.getByLabel('PDF export status').getByRole('alert')).toContainText('No file was downloaded');
  expect(state.downloads).toBe(0); expect(state.writes).toBe(0);
});
