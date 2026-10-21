import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.skip(process.env.NEXT_PUBLIC_CITIZEN_PRESENCE_ENABLED !== 'true', 'Requires the opt-in citizen presence build');
const point = { latitude: 10.252191, longitude: 123.949475 };
const north = { latitude: point.latitude + 25 / 111_320, longitude: point.longitude, accuracy: 15 };
const east = { latitude: point.latitude, longitude: point.longitude + 75 / (111_320 * Math.cos(point.latitude * Math.PI / 180)), accuracy: 15 };
async function fixture(page: Page, dark = false) {
  const user = { id: '10000000-0000-4000-8000-000000000001', name: 'Synthetic citizen', role: 'USER', department: null, status: 'ACTIVE' };
  const peers: WebSocketRoute[] = [], closed = new Set<WebSocketRoute>();
  const state = { positions: [] as Array<{ latitude: number; longitude: number; accuracy: number }>, precision: 'exact-gps-v1', invalid: false, holdReads: null as Promise<void> | null, beats: 0, nearbyReads: 0, leaves: 0, listReads: 0, writes: [] as Record<string, unknown>[], peers,
    emit() { for (const peer of peers) if (!closed.has(peer)) peer.send('42["emergency.event",{"type":"presence.changed"}]'); }, active: () => peers.filter(peer => !closed.has(peer)).length };
  await page.addInitScript(({ user, point, dark }) => {
    localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('emergency-response-theme', dark ? 'dark' : 'light');
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
    let success: PositionCallback, failure: PositionErrorCallback | null | undefined;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() {}, clearWatch() {},
      watchPosition(ok: PositionCallback, fail: PositionErrorCallback) {
        success = ok; failure = fail; setTimeout(() => ok({ coords: { ...point, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition), 0); return 1;
      },
    } });
    Object.assign(window, { __presence: { denied: () => failure?.({ code: 1 } as GeolocationPositionError),
      gps: () => success?.({ coords: { ...point, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition) } });
  }, { user, point, dark });
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peers.push(peer); peer.onClose(() => closed.add(peer));
    peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"synthetic-presence-namespace"}'); });
    peer.send('0{"sid":"synthetic-presence-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee9"/></svg>' }) : route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/citizen-presence/v2/capability')) return route.fulfill({ json: { data: { enabled: true, precision: state.precision } } });
    if (path.endsWith('/citizen-presence/v2/leave')) { state.leaves++; return route.fulfill({ status: 204 }); }
    if (path.endsWith('/citizen-presence/v2/heartbeat') || path.endsWith('/citizen-presence/v2/nearby')) {
      if (route.request().postDataJSON().sharing !== 'exact-gps-v1') return route.fulfill({ status: 400 });
      if (path.endsWith('heartbeat')) { state.beats++; state.writes.push(route.request().postDataJSON()); } else state.nearbyReads++;
      if (path.endsWith('nearby') && state.holdReads) await state.holdReads;
      return route.fulfill({ json: { data: { precision: 'exact-gps-v1', radiusMeters: 100, expiresInSeconds: 30, positions: state.invalid ? [{ ...north, userId: 'forbidden' }] : state.positions } } });
    }
    if (path.endsWith('/nearby-detection')) return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: false, complete: true } } });
    if (path.endsWith('/incidents/v1')) state.listReads++;
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'No report/provider writes in presence fixture' } });
    return route.fulfill({ json: { data: { user, incidents: [], items: [], hasMore: false,
      pagination: { page: 1, limit: 5, total: 0, pages: 0 } } } });
  });
  return state;
}
const overview = (page: Page) => page.getByRole('region', { name: 'Nearby submitted reports', exact: true });
async function join(page: Page) {
  const region = overview(page); await region.scrollIntoViewIfNeeded();
  await region.getByRole('button', { name: 'Share my GPS location and show nearby citizens', exact: true }).click();
  await expect(region.getByText('Sharing is live. No nearby opted-in participants detected.', { exact: true })).toBeVisible();
  return region;
}
for (const width of [1280, 390]) test(`opt-in GPS dots update both citizen maps without reports at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const state = await fixture(page, width === 390);
  await page.goto('/dashboard'); const region = overview(page); await region.scrollIntoViewIfNeeded();
  await expect(region.getByText('Online location sharing is off.', { exact: true })).toBeVisible(); expect(state.beats).toBe(0);
  await join(page); const lists = state.listReads;
  await expect(region.getByText(/share your reported GPS coordinates with other participating citizens within 100 m/)).toBeVisible();
  state.positions = [north, east]; state.emit();
  await expect(region.locator('.citizen-presence-dot')).toHaveCount(2);
  await expect(region.locator('.leaflet-marker-icon')).toHaveCount(1);
  await expect(region.locator('.leaflet-citizen-presence-pane')).toHaveCSS('z-index', '610');
  await expect(region.locator('.leaflet-citizen-presence-pane')).toHaveCSS('pointer-events', 'none');
  expect(state.listReads).toBe(lists); expect(state.active()).toBe(1);
  expect(state.writes.every(body => body.sharing === 'exact-gps-v1' && !('userId' in body) && !('reportedBy' in body))).toBe(true);
  await region.screenshot({ path: info.outputPath(`online-overview-${width}.png`), animations: 'disabled' });
  await page.getByRole('button', { name: 'Report a medical emergency', exact: true }).click();
  const form = page.getByRole('dialog'); await expect(form).toBeVisible();
  const map = form.getByRole('group', { name: 'Incident location map', exact: true }); await map.scrollIntoViewIfNeeded();
  await expect(map.locator('.citizen-presence-dot')).toHaveCount(2);
  await expect(form.getByRole('button', { name: 'Stop sharing my GPS location', exact: true })).toBeVisible();
  await map.screenshot({ path: info.outputPath(`online-form-${width}.png`), animations: 'disabled' });
  const consent = form.getByRole('region', { name: 'Online citizens', exact: true });
  await consent.scrollIntoViewIfNeeded();
  await consent.screenshot({ path: info.outputPath(`online-form-consent-${width}.png`), animations: 'disabled' });
  await form.getByRole('button', { name: 'Stop sharing my GPS location', exact: true }).click();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0); await expect.poll(() => state.leaves).toBeGreaterThan(0);
  expect(state.active()).toBe(1);
});
test('pagehide leaves, clears dots and resumes with a new visit only when the page returns', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  state.positions = [north]; state.emit(); await expect(overview(page).locator('.citizen-presence-dot')).toHaveCount(1);
  const visit = state.writes[0].visitId;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0); await expect.poll(() => state.leaves).toBeGreaterThan(0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow')));
  await expect.poll(() => state.writes.some(body => body.visitId !== visit)).toBe(true);
  await expect.poll(() => state.active()).toBe(1);
});
test('permission revocation and account switch clear presence without changing report data', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  state.positions = [north]; state.emit(); await expect(overview(page).locator('.citizen-presence-dot')).toHaveCount(1);
  await page.evaluate(() => (window as typeof window & { __presence: { denied: () => void } }).__presence.denied());
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0); await expect.poll(() => state.leaves).toBeGreaterThan(0);
  await expect(overview(page).getByText('Sharing needs a GPS fix less than one minute old. Use Retry GPS if needed.', { exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.setItem('user', JSON.stringify({ id: 'other-account', role: 'USER' })); window.dispatchEvent(new StorageEvent('storage', { key: 'user' })); });
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
});
test('a malformed snapshot never renders forbidden identity fields and reload never opts in automatically', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  state.invalid = true; state.emit();
  await expect(overview(page).getByText('Online sharing is unconfirmed; dots are hidden. Retrying while this page is open.', { exact: true })).toBeVisible();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
  const beats = state.beats; await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible(); expect(state.beats).toBe(beats);
});

for (const width of [1280, 390]) test(`background presence refresh keeps the map usable and preserves GPS and zoom at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, width === 390); await page.goto('/dashboard'); const region = await join(page);
  state.positions = [east]; state.emit();
  await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  const map = region.getByRole('group', { name: 'Incident location map', exact: true });
  await map.scrollIntoViewIfNeeded();
  const originalMap = await map.locator('.leaflet-container').elementHandle();
  const pin = map.locator('.leaflet-marker-icon'), circle = map.locator('.incident-reference-radius');
  const oldPath = await circle.getAttribute('d'), reads = state.nearbyReads, lists = state.listReads;
  let release!: () => void;
  state.holdReads = new Promise<void>(resolve => { release = resolve; });
  state.positions = []; state.emit();
  try {
    await expect.poll(() => state.nearbyReads).toBeGreaterThan(reads);
    // A slow refresh must not replace the map with a loader or disable zoom.
    await expect(map.locator('.citizen-presence-dot')).toHaveCount(1);
    await expect(region.getByText('Connecting online sharing through Socket.IO…', { exact: true })).toHaveCount(0);
    await expect(map.locator('[role="progressbar"], [aria-busy="true"]')).toHaveCount(0);
    await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(() => circle.getAttribute('d')).not.toBe(oldPath);
    await expect(map.locator('.leaflet-container')).not.toHaveClass(/leaflet-zoom-anim/);
    const zoomedPath = await circle.getAttribute('d'), zoomedPin = await pin.getAttribute('style');
    state.holdReads = null; release();
    await expect(map.locator('.citizen-presence-dot')).toHaveCount(0);
    expect(await originalMap?.evaluate(node => node.isConnected)).toBe(true);
    expect(await circle.getAttribute('d')).toBe(zoomedPath);
    expect(await pin.getAttribute('style')).toBe(zoomedPin);
    await expect(map.getByText('100 m reference radius', { exact: true })).toBeVisible();
    expect(state.listReads).toBe(lists); expect(state.active()).toBe(1);
  } finally { state.holdReads = null; release(); }
});

test('old approximate capability cannot opt a citizen into exact GPS', async ({ page }) => {
  const state = await fixture(page); state.precision = 'approximate'; await page.goto('/dashboard');
  const region = overview(page); await region.scrollIntoViewIfNeeded();
  await expect(region.getByText('Online sharing is unavailable. Reporting still works.', { exact: false })).toBeVisible();
  await expect(region.getByRole('button', { name: 'Share my GPS location and show nearby citizens', exact: true })).toHaveCount(0);
  expect(state.beats).toBe(0); await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
});
