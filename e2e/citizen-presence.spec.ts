import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.skip(process.env.NEXT_PUBLIC_CITIZEN_PRESENCE_ENABLED !== 'true', 'Requires the opt-in citizen presence build');
const point = { latitude: 10.252191, longitude: 123.949475 };
const north = { latitude: point.latitude + 25 / 111_320, longitude: point.longitude, accuracy: 15 };
const east = { latitude: point.latitude, longitude: point.longitude + 75 / (111_320 * Math.cos(point.latitude * Math.PI / 180)), accuracy: 15 };
async function fixture(page: Page, dark = false) {
  const user = { id: '10000000-0000-4000-8000-000000000001', name: 'Synthetic citizen', role: 'USER', department: null, status: 'ACTIVE' };
  const peers: WebSocketRoute[] = [], closed = new Set<WebSocketRoute>();
  const state = { user, authenticated: true, socketAuthorized: true, positions: [] as Array<{ latitude: number; longitude: number; accuracy: number }>, precision: 'exact-gps-v1', invalid: false, holdReads: null as Promise<void> | null, holdBeats: null as Promise<void> | null, beats: 0, nearbyReads: 0, leaves: 0, listReads: 0, writes: [] as Record<string, unknown>[], peers,
    rejectHeartbeats: 0,
    emit() { for (const peer of peers) if (!closed.has(peer)) peer.send('42["emergency.event",{"type":"presence.changed"}]'); }, active: () => peers.filter(peer => !closed.has(peer)).length };
  await page.addInitScript(({ user, point, dark }) => {
    if (!localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-response-theme', dark ? 'dark' : 'light');
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
    let success: PositionCallback, failure: PositionErrorCallback | null | undefined;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() {}, clearWatch() {},
      watchPosition(ok: PositionCallback, fail: PositionErrorCallback) {
        success = ok; failure = fail; setTimeout(() => ok({ coords: { ...point, accuracy: 15 }, timestamp: Date.now() - (localStorage.getItem('__presence-test-stale') ? 120_000 : 0) } as GeolocationPosition), 0); return 1;
      },
    } });
    Object.assign(window, { __presence: { denied: () => failure?.({ code: 1 } as GeolocationPositionError),
      gps: (next = point) => success?.({ coords: { ...next, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition) } });
  }, { user, point, dark });
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peers.push(peer); peer.onClose(() => closed.add(peer));
    peer.onMessage(message => { if (message === '40' && state.socketAuthorized) peer.send('40{"sid":"synthetic-presence-namespace"}'); });
    peer.send('0{"sid":"synthetic-presence-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee9"/></svg>' }) : route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/auth/v1/me') && !state.authenticated) return route.fulfill({ status: 401, json: { message: 'Synthetic signed-out session' } });
    if (path.endsWith('/auth/v1/logout')) { state.authenticated = false; return route.fulfill({ status: 204 }); }
    if (path.endsWith('/citizen-presence/v2/capability')) return route.fulfill({ json: { data: { enabled: true, precision: state.precision } } });
    if (path.endsWith('/citizen-presence/v2/leave')) { state.leaves++; return route.fulfill({ status: 204 }); }
    if (path.endsWith('/citizen-presence/v2/heartbeat') || path.endsWith('/citizen-presence/v2/nearby')) {
      if (route.request().postDataJSON().sharing !== 'exact-gps-v1') return route.fulfill({ status: 400 });
      if (path.endsWith('heartbeat')) { state.beats++; state.writes.push(route.request().postDataJSON()); } else state.nearbyReads++;
      if (path.endsWith('heartbeat') && state.holdBeats) await state.holdBeats;
      if (path.endsWith('heartbeat') && state.rejectHeartbeats > 0) {
        state.rejectHeartbeats--; return route.fulfill({ status: 409, json: { message: 'A current Socket.IO connection is required' } });
      }
      if (path.endsWith('nearby') && state.holdReads) await state.holdReads;
      return route.fulfill({ json: { data: { precision: 'exact-gps-v1', radiusMeters: 100, expiresInSeconds: 30, positions: state.invalid ? [{ ...north, userId: 'forbidden' }] : state.positions } } });
    }
    if (path.endsWith('/nearby-detection')) return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: false, complete: true } } });
    if (path.endsWith('/incidents/v1')) state.listReads++;
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403, json: { message: 'No report/provider writes in presence fixture' } });
    return route.fulfill({ json: { data: { user: state.user, incidents: [], items: [], hasMore: false,
      pagination: { page: 1, limit: 5, total: 0, pages: 0 } } } });
  });
  return state;
}
const overview = (page: Page) => page.getByRole('region', { name: 'Nearby submitted reports', exact: true });
async function join(page: Page) {
  const region = overview(page); await region.scrollIntoViewIfNeeded();
  await region.getByRole('button', { name: 'Enable automatic location sharing', exact: true }).click();
  await expect(region.getByText('Sharing is live. No nearby opted-in participants detected.', { exact: true })).toBeVisible();
  return region;
}

test('one presence conflict reconnects the shared socket and recovers automatically', async ({ page }) => {
  const state = await fixture(page); state.rejectHeartbeats = 1;
  await page.goto('/dashboard'); const region = await join(page);
  expect(state.beats).toBe(2); expect(state.peers.length).toBe(2);
  await expect(region.getByText('Location sharing is on.', { exact: true })).toBeVisible();
  expect(state.writes[0].visitId).not.toBe(state.writes[1].visitId);
});

for (const width of [1280, 390]) test(`persistent presence conflict stops its retry loop and offers recovery at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, width === 390); state.rejectHeartbeats = 10;
  await page.goto('/dashboard'); const region = overview(page); await region.scrollIntoViewIfNeeded();
  await region.getByRole('button', { name: 'Enable automatic location sharing', exact: true }).click();
  await expect(region.getByText('Online sharing could not confirm a matching connection. Dots are hidden; reporting still works.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(2); await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
  await page.clock.install(); await page.clock.runFor(31_000);
  await page.evaluate(() => (window as typeof window & { __presence: { gps: () => void } }).__presence.gps());
  expect(state.beats).toBe(2);
  const retry = region.getByRole('button', { name: 'Retry online sharing', exact: true }); await retry.scrollIntoViewIfNeeded();
  const box = await retry.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
  await retry.focus(); await expect(retry).toBeFocused();
  await page.screenshot({ path: info.outputPath(`conflict-${width}.png`) });
  state.rejectHeartbeats = 0; await retry.press('Enter');
  await expect(region.getByText('Location sharing is on.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(3); expect(state.listReads).toBeLessThan(10);
});

for (const crossTab of [false, true]) test(`session renewal clears old dots and rebinds ${crossTab ? 'across tabs' : 'in this tab'}`, async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); const region = await join(page);
  state.positions = [north]; state.emit(); await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  const oldVisit = state.writes[0].visitId; state.positions = [];
  await page.evaluate(crossTab => {
    localStorage.setItem('emergency-session-generation', 'synthetic-renewed');
    window.dispatchEvent(crossTab ? new StorageEvent('storage', { key: 'emergency-session-generation', newValue: 'synthetic-renewed' }) : new Event('emergency-session-changed'));
  }, crossTab);
  await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
  await expect.poll(() => state.writes.some(body => body.visitId !== oldVisit)).toBe(true);
  expect(state.peers.length).toBe(2); await expect(region.getByText('Location sharing is on.', { exact: true })).toBeVisible();
});
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
for (const width of [1280, 390]) test(`walking peers move their current dot without a trail, reload or map replacement at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, width === 390); await page.goto('/dashboard'); const region = await join(page);
  const map = region.getByRole('group', { name: 'Incident location map', exact: true });
  await map.scrollIntoViewIfNeeded();
  const originalMap = await map.locator('.leaflet-container').elementHandle();
  const circle = map.locator('.incident-reference-radius'), pin = map.locator('.leaflet-marker-icon');
  state.positions = [north]; state.emit();
  const dot = map.locator('.citizen-presence-dot'); await expect(dot).toHaveCount(1);
  const originalDot = await dot.elementHandle(), initialDotPath = await dot.getAttribute('d');
  const initialCircle = await circle.getAttribute('d'), initialPin = await pin.getAttribute('style');
  const lists = state.listReads, visit = state.writes[0].visitId;
  state.positions = [east]; state.emit();
  await expect.poll(() => dot.getAttribute('d')).not.toBe(initialDotPath);
  expect(await originalDot?.evaluate(node => node.isConnected)).toBe(true);
  expect(await circle.getAttribute('d')).toBe(initialCircle); expect(await pin.getAttribute('style')).toBe(initialPin);
  await expect(map.locator('.leaflet-citizen-presence-pane path')).toHaveCount(1);
  await expect(map.locator('[role="progressbar"], [aria-busy="true"]')).toHaveCount(0);
  await region.screenshot({ path: info.outputPath(`walking-peer-${width}.png`), animations: 'disabled' });
  state.positions = []; state.emit(); await expect(dot).toHaveCount(0);
  state.positions = [north]; state.emit(); await expect(dot).toHaveCount(1);
  expect(await originalMap?.evaluate(node => node.isConnected)).toBe(true);
  expect(state.listReads).toBe(lists); expect(state.active()).toBe(1);
  expect(state.writes.every(body => body.visitId === visit)).toBe(true);
});

for (const width of [1280, 390]) test(`walking own GPS publishes a new centre without moving a captured report pin at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page); await page.goto('/dashboard'); const region = await join(page);
  state.positions = [north]; state.emit(); await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  await page.getByRole('button', { name: 'Report a medical emergency', exact: true }).click();
  const form = page.getByRole('dialog'), map = form.getByRole('group', { name: 'Incident location map', exact: true });
  await map.scrollIntoViewIfNeeded(); await expect(map.locator('.citizen-presence-dot')).toHaveCount(1);
  const pin = map.locator('.leaflet-marker-icon'), circle = map.locator('.incident-reference-radius');
  const capturedPin = await pin.getAttribute('style'), capturedCircle = await circle.getAttribute('d');
  const originalMap = await map.locator('.leaflet-container').elementHandle();
  const moved = { latitude: point.latitude + 55 / 111_320, longitude: point.longitude };
  const visit = state.writes[0].visitId;
  await page.evaluate(next => (window as typeof window & { __presence: { gps: (point: { latitude: number; longitude: number }) => void } }).__presence.gps(next), moved);
  await expect.poll(() => state.writes.some(body => body.latitude === moved.latitude && body.longitude === moved.longitude && body.visitId === visit)).toBe(true);
  // The foreground overview follows live GPS, but a captured report is not
  // silently moved. Its differently anchored presence layer must stay hidden.
  await expect(map.locator('.citizen-presence-dot')).toHaveCount(0);
  expect(await pin.getAttribute('style')).toBe(capturedPin); expect(await circle.getAttribute('d')).toBe(capturedCircle);
  expect(await originalMap?.evaluate(node => node.isConnected)).toBe(true);
  await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  await expect(form.getByText('Dots use your live GPS.', { exact: false })).toBeVisible();
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
test('a malformed snapshot never renders forbidden identity fields, including after an opted-in reload', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  state.invalid = true; state.emit();
  await expect(overview(page).getByText('Online sharing is unconfirmed; dots are hidden. Retrying while this page is open.', { exact: true })).toBeVisible();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
  const beats = state.beats; await page.reload();
  await expect.poll(() => state.beats).toBeGreaterThan(beats);
  await expect(overview(page).getByText('Online sharing is unconfirmed; dots are hidden. Retrying while this page is open.', { exact: true })).toBeVisible();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
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
  await expect(region.getByRole('button', { name: 'Enable automatic location sharing', exact: true })).toHaveCount(0);
  expect(state.beats).toBe(0); await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
});

for (const width of [1280, 390]) test(`ON resumes and Stop stays OFF after refresh at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, width === 390); await page.goto('/dashboard');
  const region = await join(page), beats = state.beats;
  await expect(region.getByText('Location sharing is on.', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => state.beats).toBeGreaterThan(beats);
  await expect(overview(page).getByText('Location sharing is on.', { exact: true })).toBeVisible();
  await overview(page).getByRole('button', { name: 'Stop sharing my GPS location', exact: true }).click();
  const stopped = state.beats;
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(overview(page).getByRole('button', { name: 'Enable automatic location sharing', exact: true })).toBeVisible();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(stopped);
  await overview(page).screenshot({ path: info.outputPath(`remembered-off-${width}.png`), animations: 'disabled' });
  await join(page); await expect.poll(() => state.beats).toBeGreaterThan(stopped);
});

test('new browser stays OFF and old consent versions cannot enable automatic sharing', async ({ page }) => {
  const state = await fixture(page);
  await page.addInitScript(() => { localStorage.setItem('citizen-presence:automatic-visible-exact-gps-v0:10000000-0000-4000-8000-000000000001', 'on'); });
  await page.goto('/dashboard');
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(0);
});

test('another signed-in citizen never inherits ON and returning to the owner restores only their choice', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  const owner = state.user, beats = state.beats;
  state.user = { ...owner, id: '20000000-0000-4000-8000-000000000002' };
  await page.evaluate(user => localStorage.setItem('user', JSON.stringify(user)), state.user);
  await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
  state.user = owner;
  await page.evaluate(user => localStorage.setItem('user', JSON.stringify(user)), owner);
  await page.reload();
  await expect(overview(page).getByText('Location sharing is on.', { exact: true })).toBeVisible();
  await expect.poll(() => state.beats).toBeGreaterThan(beats);
});

test('Stop in another tab clears the current dot and pending snapshot cannot restore it', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); const region = await join(page);
  state.positions = [north]; state.emit(); await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  let release!: () => void;
  state.holdReads = new Promise<void>(resolve => { release = resolve; });
  const reads = state.nearbyReads; state.emit();
  await expect.poll(() => state.nearbyReads).toBeGreaterThan(reads);
  const other = await page.context().newPage();
  try {
    await other.goto('/privacy');
    await other.evaluate(() => localStorage.setItem('citizen-presence:automatic-visible-exact-gps-v1:10000000-0000-4000-8000-000000000001', 'off'));
    await expect(region.getByText('Online location sharing is off.', { exact: true })).toBeVisible();
    await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
    state.holdReads = null; release();
    await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
    await page.reload(); await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  } finally { state.holdReads = null; release(); await other.close(); }
});

test('saved ON does not bypass GPS denial or an obsolete capability and can still be stopped', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  await page.evaluate(() => (window as typeof window & { __presence: { denied: () => void } }).__presence.denied());
  await expect(overview(page).getByText('Sharing needs a GPS fix less than one minute old. Use Retry GPS if needed.', { exact: true })).toBeVisible();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
  state.precision = 'approximate'; const beats = state.beats;
  await page.reload();
  await expect(overview(page).getByText('Online sharing is unavailable. Reporting still works.', { exact: false })).toBeVisible();
  await overview(page).getByRole('button', { name: 'Stop sharing my GPS location', exact: true }).click();
  expect(state.beats).toBe(beats);
  state.precision = 'exact-gps-v1'; await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
});

test('clearing the remembered choice disables automatic sharing', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  await page.evaluate(() => localStorage.removeItem('citizen-presence:automatic-visible-exact-gps-v1:10000000-0000-4000-8000-000000000001'));
  const beats = state.beats; await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
});

test('saved ON waits for the authenticated WebSocket before publishing GPS', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  const beats = state.beats; state.socketAuthorized = false;
  await page.reload();
  await expect(overview(page).getByText('Connecting online sharing through Socket.IO…', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
  await overview(page).getByRole('button', { name: 'Stop sharing my GPS location', exact: true }).click();
  state.socketAuthorized = true; await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
});

test('storage write refusal cannot silently enable sharing and leaves emergency reporting usable', async ({ page }) => {
  const state = await fixture(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('citizen-presence:')) throw new DOMException('Synthetic blocked preference storage', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await page.goto('/dashboard');
  const region = overview(page);
  await region.getByRole('button', { name: 'Enable automatic location sharing', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('Your browser could not remember your sharing choice. Sharing is off.');
  await expect(region.getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(0);
  await page.getByRole('button', { name: 'Report a medical emergency', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('OFF then ON never resurrects the previous visit snapshot while the new heartbeat is pending', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); const region = await join(page);
  state.positions = [north]; state.emit(); await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  await region.getByRole('button', { name: 'Stop sharing my GPS location', exact: true }).click();
  await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
  let release!: () => void; state.holdBeats = new Promise<void>(resolve => { release = resolve; });
  state.positions = []; const beats = state.beats;
  try {
    await region.getByRole('button', { name: 'Enable automatic location sharing', exact: true }).click();
    await expect.poll(() => state.beats).toBeGreaterThan(beats);
    await expect(region.getByText('Connecting online sharing through Socket.IO…', { exact: true })).toBeVisible();
    await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
    state.holdBeats = null; release();
    await expect(region.getByText('Sharing is live. No nearby opted-in participants detected.', { exact: true })).toBeVisible();
    await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
  } finally { state.holdBeats = null; release(); }
});

test('saved ON on a hidden dashboard waits for visibility before publishing', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  const beats = state.beats;
  await page.addInitScript(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
  await page.reload();
  await expect(overview(page).getByRole('button', { name: 'Stop sharing my GPS location', exact: true })).toBeVisible();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0); expect(state.beats).toBe(beats);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(overview(page).getByText('Location sharing is on.', { exact: true })).toBeVisible();
  await expect.poll(() => state.beats).toBeGreaterThan(beats);
});

test('saved ON cannot publish an old GPS fix after reload', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); await join(page);
  const beats = state.beats;
  await page.evaluate(() => localStorage.setItem('__presence-test-stale', '1')); await page.reload();
  await expect(overview(page).getByText('Sharing needs a GPS fix less than one minute old. Use Retry GPS if needed.', { exact: true })).toBeVisible();
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0); expect(state.beats).toBe(beats);
  await page.evaluate(() => localStorage.removeItem('__presence-test-stale')); await page.reload();
  await expect(overview(page).getByText('Location sharing is on.', { exact: true })).toBeVisible();
  await expect.poll(() => state.beats).toBeGreaterThan(beats);
});

test('ordinary logout stops presence without passing the preference to another account', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); const region = await join(page);
  const home = new URL('/', page.url()).href;
  state.positions = [north]; state.emit(); await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(home);
  await expect(page.locator('.citizen-presence-dot')).toHaveCount(0);
  await expect.poll(() => state.leaves).toBeGreaterThan(0);
  const beats = state.beats; await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/\/dashboard/);
  expect(state.beats).toBe(beats);
});

test('an unwritable Stop remains OFF locally after storage recovers until its explicit retry is saved', async ({ page }) => {
  const state = await fixture(page); await page.goto('/dashboard'); const region = await join(page);
  state.positions = [north]; state.emit(); await expect(region.locator('.citizen-presence-dot')).toHaveCount(1);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    Object.assign(window, { __restorePreferenceStorage: () => { Storage.prototype.setItem = set; Storage.prototype.removeItem = remove; } });
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('citizen-presence:')) throw new DOMException('Synthetic read-only preference', 'SecurityError');
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key) {
      if (key.startsWith('citizen-presence:')) throw new DOMException('Synthetic read-only preference', 'SecurityError');
      return remove.call(this, key);
    };
  });
  await region.getByRole('button', { name: 'Stop sharing my GPS location', exact: true }).click();
  await expect(region.getByRole('alert')).toContainText('the OFF choice could not be saved');
  await expect(region.locator('.citizen-presence-dot')).toHaveCount(0);
  const beats = state.beats;
  await page.evaluate(() => {
    (window as typeof window & { __restorePreferenceStorage: () => void }).__restorePreferenceStorage();
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }));
  });
  state.emit();
  await expect(region.getByRole('button', { name: 'Retry saving Stop sharing', exact: true })).toBeVisible();
  await expect(region.getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
  await region.getByRole('button', { name: 'Retry saving Stop sharing', exact: true }).click();
  await expect(region.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(overview(page).getByText('Online location sharing is off.', { exact: true })).toBeVisible();
  expect(state.beats).toBe(beats);
});
