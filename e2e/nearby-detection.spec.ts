import { expect, test, type Page } from '@playwright/test';
import { expectPinOnRadius, expectZoomAndPan } from './helpers/map-navigation';
test.use({ serviceWorkers: 'block' });
const anchorId = '10000000-0000-4000-8000-000000000001';
const peerId = '20000000-0000-4000-8000-000000000002';
const point = { latitude: 10.252191, longitude: 123.949475 };
type Browser = { emit: (name: string) => void; gps: (latitude: number) => void };
async function fixture(page: Page, department: string | null = null, dark = false) {
  const user = { id: 'nearby-fixture', role: department ? 'ADMIN' : 'USER', department, isMainAdmin: department === 'MAIN', status: 'ACTIVE', name: 'Synthetic nearby tester' };
  const report = { incidentId: anchorId, title: 'Selected synthetic report', description: 'Selected report description', ...point,
    status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: ['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'],
    serviceResponses: [], reviewFlags: [], attachments: [], reporter: user, reportedBy: user.id, reportedAt: '2026-10-18T00:00:00Z',
    severityLevel: 'MEDIUM', type: { typeId: 'type', typeName: 'Fire' }, location: { address: 'Synthetic selected location' } };
  const state = { present: false, unavailable: false, reads: 0, listReads: 0, detailReads: 0, bodies: [] as Record<string, unknown>[], denyDetail: false, center: { ...point } };
  await page.addInitScript(({ user, point, dark }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-response-theme', dark ? 'dark' : 'light');
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); streams.push(this); setTimeout(() => { if (!this.closed) this.onopen?.(); }, 5); }
      close() { this.closed = true; }
    }
    let callback: PositionCallback | undefined;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() {}, clearWatch() {},
      watchPosition(success: PositionCallback) { callback = success; setTimeout(() => success({ coords: { ...point, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition), 0); return 1; },
    } });
    Object.assign(window, { EventSource: Stream, __nearby: {
      emit: (name: string) => streams.filter(stream => !stream.closed).forEach(stream => stream.dispatchEvent(new Event(name))),
      gps: (latitude: number) => callback?.({ coords: { ...point, latitude, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition),
    } });
  }, { user, point, dark });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee9"/><path d="M0 100H256M80 0V256" stroke="white" stroke-width="10"/></svg>' }) : route.abort());
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/nearby-detection')) {
      state.reads++; state.bodies.push(route.request().postDataJSON());
      if (state.unavailable) return route.fulfill({ status: 503, json: { message: 'Nearby detection unavailable' } });
      return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: state.present, complete: true,
        ...(department ? { center: state.center, items: state.present ? [{ incidentId: peerId, latitude: point.latitude + 0.0003, longitude: point.longitude,
          status: 'RESPONDING', services: [department === 'DRRMO' ? 'HAZARD' : department === 'MAIN' ? 'FIRE' : department], distanceMeters: 33 }] : [] } : {}) } } });
    }
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'No mutations in nearby fixture' } });
    if (path.endsWith(`/incidents/v1/${peerId}`)) {
      state.detailReads++;
      return state.denyDetail ? route.fulfill({ status: 403, json: { message: 'No current access' } })
        : route.fulfill({ json: { data: { incident: { ...report, incidentId: peerId, title: 'Authorized nearby report', description: 'Authorized report detail from server' } } } });
    }
    if (path.endsWith('/incidents/v1')) state.listReads++;
    return route.fulfill({ json: { data: { user, incidents: department ? [report] : [], items: [], hasMore: false, observedAt: new Date().toISOString(),
      enabled: false, flags: [], pagination: { page: 1, limit: 5, total: department ? 1 : 0, pages: department ? 1 : 0 },
      summary: { total: 1, active: 0, responding: 1, resolved: 0 } } } });
  });
  return state;
}
const emit = (page: Page, name = 'nearby.changed') => page.evaluate(name => (window as typeof window & { __nearby: Browser }).__nearby.emit(name), name);

for (const dark of [false, true]) test(`citizen ${dark ? 'dark' : 'light'} receives live anonymous detection without peer pins, details or an ordinary-list refresh`, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, null, dark);
  await page.goto('/dashboard');
  const region = page.getByRole('region', { name: 'Nearby submitted reports', exact: true });
  await region.scrollIntoViewIfNeeded();
  await expect(region.getByText('No similar active submitted reports detected within 100 m.', { exact: true })).toBeVisible();
  await expect(region.getByText('Live updates connected')).toBeVisible();
  const lists = state.listReads;
  state.present = true;
  await emit(page);
  await expect(region.getByText('Submitted report within 100 m', { exact: true })).toBeVisible();
  const label = await region.getByText('Submitted report within 100 m', { exact: true }).boundingBox();
  expect(label!.width).toBeGreaterThan(80); expect(label!.height).toBeLessThan(64);
  await expect(region.locator('.leaflet-marker-icon')).toHaveCount(1);
  expect(state.listReads).toBe(lists); expect(state.detailReads).toBe(0);
  expect(await page.content()).not.toContain(peerId);
  await expectZoomAndPan(page, region.locator('.leaflet-container'));
  expect(state.listReads).toBe(lists); expect(state.detailReads).toBe(0);
  await expect(region.getByRole('button', { name: /Review nearby/ })).toHaveCount(0);
  await region.screenshot({ path: info.outputPath('citizen-nearby.png'), animations: 'disabled' });
  state.present = false; await emit(page);
  await expect(region.getByText('Submitted report within 100 m', { exact: true })).toHaveCount(0);
  await expect(region.getByText('No similar active submitted reports detected within 100 m.', { exact: true })).toBeVisible();
});

for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department} sees and opens only server-authorized nearby pins; resolved peer disappears live`, async ({ page }, info) => {
    await page.setViewportSize({ width: department === 'MAIN' ? 1280 : 390, height: 900 });
    const state = await fixture(page, department);
    await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
    const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
    await map.scrollIntoViewIfNeeded();
    await expect(map.getByText('No similar active submitted reports detected within 100 m.', { exact: true })).toBeVisible();
    state.present = true; await emit(page, 'incident.created');
    await expect(map.getByText('Nearby report · 33 m from Report A', { exact: true })).toBeVisible();
    const label = await map.getByText('Nearby report · 33 m from Report A', { exact: true }).boundingBox();
    expect(label!.width).toBeGreaterThan(80); expect(label!.height).toBeLessThan(64);
    await expect(map.locator('.leaflet-marker-icon')).toHaveCount(2);
    expect(state.bodies.every(body => Object.keys(body).sort().join(',') === 'incidentId,kind' && body.incidentId === anchorId)).toBe(true);
    await map.getByRole('button', { name: /Review nearby report ·/ }).click();
    await expect(page.getByRole('dialog').getByText('Authorized report detail from server')).toBeVisible();
    expect(state.detailReads).toBeGreaterThan(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    if (department === 'MAIN' || department === 'FIRE') await map.screenshot({ path: info.outputPath('department-nearby.png'), animations: 'disabled' });
    state.present = false; await emit(page, 'incident.updated');
    await expect(map.getByText('Nearby report · 33 m from Report A', { exact: true })).toHaveCount(0);
    await expect(map.locator('.leaflet-marker-icon')).toHaveCount(1);
  });
}

test('unavailable, offline and recovery states never claim a clear area', async ({ page }) => {
  const state = await fixture(page); state.unavailable = true;
  await page.goto('/dashboard');
  const region = page.getByRole('region', { name: 'Nearby submitted reports', exact: true });
  await expect(region.getByText('Nearby detection unavailable. Do not assume there are no nearby reports.')).toBeVisible();
  await expect(region.getByText(/No similar active/)).toHaveCount(0);
  state.unavailable = false; state.present = true; await emit(page);
  await expect(region.getByText('Submitted report within 100 m', { exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await expect(region.getByText('Submitted report within 100 m', { exact: true })).toHaveCount(0);
  await page.context().setOffline(false);
  await expect(region.getByText('Submitted report within 100 m', { exact: true })).toBeVisible();
});

test('new GPS and category invalidate the previous lookup; event bursts are bounded', async ({ page }) => {
  const state = await fixture(page); state.present = true;
  await page.goto('/dashboard');
  const region = page.getByRole('region', { name: 'Nearby submitted reports', exact: true });
  await expect(region.getByText('Submitted report within 100 m', { exact: true })).toBeVisible();
  await region.getByLabel('Response service').selectOption('MEDICAL');
  await expect.poll(() => state.bodies.some(body => JSON.stringify(body.services) === '["MEDICAL"]')).toBe(true);
  await page.evaluate(() => (window as typeof window & { __nearby: Browser }).__nearby.gps(10.2525));
  await expect.poll(() => state.bodies.some(body => body.latitude === 10.2525)).toBe(true);
  await expectPinOnRadius(region.locator('.leaflet-container'));
  const before = state.reads;
  for (let index = 0; index < 20; index++) await emit(page);
  // Wait through a coalescing window, not a refresh/poll interval.
  await expect.poll(() => state.reads).toBeGreaterThan(before);
  expect(state.reads - before).toBeLessThanOrEqual(2);
});

test('logout discards nearby labels and cancels further detection work', async ({ page }) => {
  const state = await fixture(page); state.present = true;
  await page.goto('/dashboard');
  await expect(page.getByText('Submitted report within 100 m', { exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('user'); localStorage.setItem('emergency-logout-epoch', 'synthetic-ended'); window.dispatchEvent(new StorageEvent('storage')); });
  await expect(page.getByText('Submitted report within 100 m', { exact: true })).toHaveCount(0);
  const reads = state.reads; await emit(page); expect(state.reads).toBe(reads);
});

test('the persisted selected-report center wins over stale list coordinates and admin GPS', async ({ page }) => {
  const state = await fixture(page, 'FIRE'); state.center.latitude = 10.2525;
  await page.goto('/admin/fire-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.getByText('10.252500, 123.949475', { exact: true })).toBeVisible();
  expect(state.bodies.every(body => body.kind === 'department' && !('latitude' in body))).toBe(true);
});

test('nearby review does not reveal report details after server permission denial', async ({ page }) => {
  const state = await fixture(page, 'FIRE'); state.present = true; state.denyDetail = true;
  await page.goto('/admin/fire-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await map.getByRole('button', { name: /Review nearby report ·/ }).click();
  await expect(page.getByRole('dialog').getByText(/Report unavailable or outside your current access/)).toBeVisible();
  await expect(page.getByText('Authorized report detail from server', { exact: true })).toHaveCount(0);
});
