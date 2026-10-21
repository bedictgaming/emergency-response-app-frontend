import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.skip(process.env.NEXT_PUBLIC_NEARBY_REVIEW_ENABLED !== 'true', 'Requires the separate opt-in nearby-intake export');
const first = '10000000-0000-4000-8000-000000000001';
const follow = '20000000-0000-4000-8000-000000000002';
const older = '30000000-0000-4000-8000-000000000003';
const reviewId = '40000000-0000-4000-8000-000000000004';
async function fixture(page: Page, department = 'FIRE', distances = { pending: 2, older: 84 }, explicitStart = false) {
  const service = department === 'DRRMO' ? 'HAZARD' : department === 'MAIN' ? 'FIRE' : department;
  const user = { id: 'synthetic-intake-admin', role: 'ADMIN', department, isMainAdmin: department === 'MAIN', status: 'ACTIVE', name: 'Synthetic intake admin' };
  const report = { incidentId: first, title: 'Original synthetic emergency', description: 'Original report evidence text.',
    latitude: 10.251, longitude: 123.949, status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: [service],
    serviceResponses: [{ service, status: 'RESPONDING' }], reviewFlags: [], attachments: [], reporter: user, reportedBy: 'synthetic-citizen',
    reportedAt: '2026-10-19T00:00:00Z', severityLevel: 'MEDIUM', type: { typeName: service }, location: { address: 'Synthetic Cordova location' } };
  const peers: WebSocketRoute[] = [];
  const state = { status: 'PENDING', version: 1, reason: '', conflict: false, omitReviewIds: false, started: false,
    starts: [] as Record<string, unknown>[], attention: [] as Record<string, unknown>[], attentionReads: 0,
    flags: [] as Record<string, unknown>[], flagged: false, photo: false, reportContact: '',
    decisions: [] as Record<string, unknown>[], detailIds: [] as string[], peers };
  await page.addInitScript(({ user, websocket }) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-response-theme', 'light');
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); streams.push(this); setTimeout(() => { if (!this.closed) this.onopen?.(); }, 0); }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: websocket ? undefined : Stream, __intakeEmit: () => streams.filter(stream => !stream.closed).forEach(stream => stream.dispatchEvent(new Event('incident.updated'))) });
  }, { user, websocket: process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT === 'socket.io' });
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peers.push(peer);
    peer.onMessage(message => { if (message === '40') peer.send('40{"sid":"synthetic-intake-namespace"}'); });
    peer.send(`0${JSON.stringify({ sid: 'synthetic-intake-engine', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1024 })}`);
  });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee9"/></svg>' }) : route.abort());
  const emit = async () => {
    for (const peer of peers) peer.send(`42${JSON.stringify(['emergency.event', { type: 'incident.updated', entityId: follow }])}`);
    await page.evaluate(() => (window as typeof window & { __intakeEmit: () => void }).__intakeEmit());
  };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, '');
    if (path.endsWith(`/incidents/v1/${follow}`) || path.endsWith(`/incidents/v1/${older}`)) state.detailIds.push(path.split('/').at(-1)!);
    const item = { reviewId, incidentId: follow, service, status: state.status, version: state.version, reason: state.reason,
      ...(explicitStart && { responseStarted: state.started }),
      createdAt: '2026-10-19T00:01:00Z', incident: { title: 'Later synthetic report B', status: 'OPEN', reportedAt: '2026-10-19T00:01:00Z' } };
    if (path.endsWith(`/nearby-reviews/${reviewId}/flag`)) {
      state.flags.push(route.request().postDataJSON());
      if (state.conflict) return route.fulfill({ status: 409, json: { message: 'Synthetic stale flag' } });
      state.flagged = true; await route.fulfill({ json: { code: 200 } }); await emit(); return;
    }
    if (path.endsWith(`/nearby-reviews/${reviewId}/start-response`)) {
      state.starts.push(route.request().postDataJSON());
      if (state.conflict) return route.fulfill({ status: 409, json: { message: 'Synthetic stale start' } });
      state.started = true; state.version++; await route.fulfill({ json: { code: 200 } }); await emit(); return;
    }
    if (path.endsWith(`/nearby-reviews/${reviewId}/decision`)) {
      const body = route.request().postDataJSON(); state.decisions.push(body);
      if (state.conflict) return route.fulfill({ status: 409, json: { message: 'Already reviewed by another admin' } });
      state.status = body.status; state.reason = body.reason ?? ''; state.version++;
      await route.fulfill({ json: { code: 200 } }); await emit(); return;
    }
    if (path.endsWith('/nearby-reviews')) return route.fulfill({ json: { data: { enabled: true, canDecide: department !== 'MAIN', ...(explicitStart && { requiresResponseStart: true }),
      items: !url.searchParams.get('status') || url.searchParams.get('status') === state.status ? [item] : [], hasMore: false } } });
    if (path.endsWith('/nearby-detection')) return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: true, complete: true,
      center: { latitude: report.latitude, longitude: report.longitude },
      items: [{ incidentId: follow, latitude: report.latitude + distances.pending / 111320, longitude: 123.949, status: 'OPEN', services: [service], distanceMeters: distances.pending },
        { incidentId: older, latitude: report.latitude + distances.older / 111320, longitude: 123.949, status: 'RESPONDING', services: [service], distanceMeters: distances.older }],
      ...(!state.omitReviewIds && { reviewIncidentIds: state.status === 'PENDING' || explicitStart && state.status === 'ACKNOWLEDGED' && !state.started ? [follow] : [] }),
      ...(explicitStart && { waitingIncidentIds: state.status === 'ACKNOWLEDGED' && !state.started ? [follow] : [] }),
    } } });
    if (path.endsWith(`/incidents/v1/${follow}`)) return route.fulfill({ json: { data: { incident: { ...report, incidentId: follow,
      title: 'Later synthetic report B', description: `${state.reportContact ? `[Contact: ${state.reportContact}]\n` : ''}Review this later report before deciding.`, status: state.status === 'PENDING' || explicitStart && !state.started && state.status === 'ACKNOWLEDGED' ? 'OPEN' : state.status === 'REJECTED' ? 'CANCELLED' : 'RESPONDING',
      reporter: { ...user, phone: '00000000001' }, // Synthetic profile phone is not the submitted contact.
      nearbyIntake: [{ service, status: state.status }],
      reviewFlags: state.flagged ? [{ reviewFlagId: '50000000-0000-4000-8000-000000000005', status: 'PENDING', department, reason: 'Synthetic suspicion, not a confirmed decision' }] : [],
      attachments: state.photo ? [{ attachmentId: 'popup-photo', fileUrl: 'http://localhost:8000/api/attachments/v1/popup-photo/content', fileType: 'image/png', fileName: 'synthetic-popup-photo.png' }] : [],
    } } } });
    if (path.endsWith('/incidents/v1/attention')) { state.attentionReads++; return route.fulfill({ json: { data: { items: state.attention, scope: department === 'MAIN' ? 'MAIN' : service,
      acknowledgementMode: department === 'MAIN' ? 'DEPARTMENT_HANDOFF' : 'PERSONAL', hasMore: false, observedAt: '2026-10-20T00:00:00Z' } } }); }
    return route.fulfill({ json: { data: { user, incidents: [report], items: [], hasMore: false, observedAt: new Date().toISOString(),
      enabled: false, flags: [], pagination: { page: 1, limit: 5, total: 1, pages: 1 }, summary: { total: 1, active: 0, responding: 1, resolved: 0 } } } });
  });
  return state;
}
for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) test(`${department} reviews and acknowledges the pending follow-up`, async ({ page }, info) => {
  await page.setViewportSize({ width: department === 'FIRE' ? 1280 : 390, height: 900 });
  const state = await fixture(page, department);
  await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
  const queue = page.getByRole('region', { name: 'Nearby report intake', exact: true });
  await expect(queue.getByText('Later synthetic report B')).toBeVisible();
  if (process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT === 'socket.io') await expect.poll(() => state.peers.length).toBe(1);
  await queue.getByRole('button', { name: 'Review nearby report', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Review this later report before deciding.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Reject as fake — retain record' })).toBeDisabled();
  if (department === 'FIRE' || department === 'MEDICAL') await dialog.screenshot({ path: info.outputPath('nearby-intake-review.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Acknowledge and admit report' }).click();
  await expect.poll(() => state.status).toBe('ACKNOWLEDGED');
  expect(state.decisions).toEqual([{ status: 'ACKNOWLEDGED', version: 1 }]);
  await expect(dialog.getByRole('button', { name: 'Acknowledge and admit report' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(queue.getByText('No pending nearby reviews on this page.')).toBeVisible();
  await queue.getByRole('combobox').selectOption('ACKNOWLEDGED');
  await expect(queue.getByText('Later synthetic report B')).toBeVisible();
});
for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) test(`${department} explicit start keeps acknowledged B waiting without automatic popup`, async ({ page }, info) => {
  await page.setViewportSize({ width: department === 'FIRE' ? 1280 : 390, height: 900 });
  const state = await fixture(page, department, { pending: 2, older: 84 }, true);
  await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
  const queue = page.getByRole('region', { name: 'Nearby report intake', exact: true });
  await expect(queue.getByText('1 pending nearby reviews on this page.')).toBeVisible();
  await expect.poll(() => state.attentionReads).toBeGreaterThan(0);
  const reads = state.attentionReads;
  state.attention = [{ incidentId: follow, version: 1, scope: department === 'DRRMO' ? 'HAZARD' : department,
    title: 'Quiet pending B', status: 'OPEN', pendingNearbyReview: true, reportedAt: '2026-10-20T00:01:00Z' }];
  for (const peer of state.peers) peer.send(`42${JSON.stringify(['emergency.event', { type: 'incident.created', entityId: follow }])}`);
  await expect.poll(() => state.attentionReads).toBeGreaterThan(reads);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await queue.getByRole('button', { name: 'Review nearby report', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nearby submitted report', exact: true });
  await dialog.getByRole('button', { name: 'Acknowledge report', exact: true }).click();
  await expect(dialog.getByText('Review acknowledged. This report is still waiting and is not in Responding.')).toBeVisible();
  expect(state.starts).toEqual([]); expect(state.started).toBe(false);
  if (department === 'FIRE' || department === 'MEDICAL') await dialog.screenshot({ path: info.outputPath('acknowledged-waiting.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.getByTitle('Review acknowledged nearby report · 2 m', { exact: true })).toBeVisible();
  if (department === 'FIRE' || department === 'MEDICAL') await map.screenshot({ path: info.outputPath('acknowledged-map.png'), animations: 'disabled' });
  await map.getByTitle('Review acknowledged nearby report · 2 m', { exact: true }).click();
  const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(popup.getByText('Review this later report before deciding.')).toBeVisible();
  await popup.getByRole('button', { name: 'Start response', exact: true }).click();
  await expect.poll(() => state.started).toBe(true);
  expect(state.starts).toEqual([{ version: 2 }]); expect(state.started).toBe(true);
  await expect(map.getByTitle('Review acknowledged nearby report · 2 m', { exact: true })).toHaveCount(0);
  await expect(popup).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.peers).toHaveLength(1);
});

test('explicit-start Main monitoring cannot start a waiting department response', async ({ page }) => {
  const state = await fixture(page, 'MAIN', { pending: 2, older: 84 }, true); state.status = 'ACKNOWLEDGED'; state.version = 2;
  await page.goto('/admin/main-dashboard');
  const queue = page.getByRole('region', { name: 'Nearby report intake', exact: true });
  await queue.getByRole('combobox').selectOption('ACKNOWLEDGED');
  await queue.getByRole('button', { name: 'Review nearby report', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Only the assigned department administrator can decide. Main Admin monitoring is read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start response', exact: true })).toHaveCount(0);
  expect(state.starts).toEqual([]);
});

for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) test(`${department} dot opens report B inside map with Flag and Acknowledge`, async ({ page }, info) => {
  const width = department === 'FIRE' ? 1280 : 390;
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, department, { pending: 2, older: 84 }, true);
  await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  const dot = map.getByTitle('Review pending nearby report · 2 m', { exact: true });
  await expect(dot).toBeVisible();
  expect(state.detailIds).toEqual([]);
  await dot.focus(); await page.keyboard.press('Enter');
  const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
  await expect(popup.getByRole('heading', { name: 'Later synthetic report B', exact: true })).toBeVisible();
  await expect(popup.getByText('Review this later report before deciding.', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Acknowledge report', exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Flag suspected false report', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The controls must remain mounted but cannot cover or receive focus above
  // the report. This also catches a dev server serving pre-correction CSS.
  const zoomControls = map.locator('.leaflet-control-zoom');
  await expect(zoomControls).toHaveCount(1);
  await expect(zoomControls).toHaveCSS('visibility', 'hidden');
  await expect(zoomControls).toBeHidden();
  await expect(map.getByText('Acknowledged · waiting to respond', { exact: false })).toHaveCount(0);
  const bounds = await map.getByRole('group', { name: 'Incident location map', exact: true }).boundingBox();
  const box = await map.locator('.nearby-report-popup').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(bounds!.x); expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  expect(box!.y).toBeGreaterThanOrEqual(bounds!.y); expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  if (department === 'FIRE' || department === 'MEDICAL') await map.screenshot({ path: info.outputPath(`report-popup-${width}.png`), animations: 'disabled' });
  await popup.getByRole('button', { name: 'Flag suspected false report', exact: true }).click();
  await expect(popup.getByRole('button', { name: 'Send review request' })).toBeDisabled();
  await popup.getByLabel('Why do you suspect this report is false?', { exact: true }).fill('Synthetic on-site review requested; proximity alone is not proof.');
  await popup.getByRole('button', { name: 'Send review request' }).click();
  await expect.poll(() => state.flagged).toBe(true);
  await expect(popup.getByText('This report already has a review flag. Flagging does not admit or reject it.')).toBeVisible();
  expect(state.status).toBe('PENDING'); expect(state.started).toBe(false);
  expect(state.flags).toEqual([{ version: 1, reason: 'Synthetic on-site review requested; proximity alone is not proof.' }]);
  await popup.getByRole('button', { name: 'Acknowledge report', exact: true }).click();
  await expect(popup.getByText('Review acknowledged. This report is still waiting and is not in Responding.')).toBeVisible();
  expect(state.status).toBe('ACKNOWLEDGED'); expect(state.started).toBe(false); expect(state.starts).toEqual([]);
  expect(state.detailIds.every(id => id === follow)).toBe(true);
  expect(state.peers).toHaveLength(1);
  await map.locator('.nearby-report-popup .leaflet-popup-close-button').click();
  await expect(popup).toHaveCount(0);
  await expect(map.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
  await expect(map.getByTitle('Review acknowledged nearby report · 2 m', { exact: true })).toBeFocused();
});

test('an anchored popup never shows denied report B or action controls', async ({ page }) => {
  const state = await fixture(page, 'MEDICAL', { pending: 2, older: 84 }, true);
  state.reportContact = '00000000000';
  await page.route(`**/api/incidents/v1/${follow}`, route => route.fulfill({ status: 403, json: { message: 'Synthetic scope denial' } }));
  await page.goto('/admin/medical-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true }); await map.scrollIntoViewIfNeeded();
  await map.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
  await expect(popup.getByRole('alert')).toContainText('Report unavailable or outside your current access.');
  await expect(popup.getByText('Review this later report before deciding.')).toHaveCount(0);
  await expect(popup.getByText('00000000000', { exact: true })).toHaveCount(0);
  await expect(popup.getByText('Contact number:', { exact: true })).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Acknowledge report', exact: true })).toHaveCount(0);
  expect(state.flags).toEqual([]); expect(state.decisions).toEqual([]);
});

test('Main Admin anchored report popup is read-only', async ({ page }) => {
  const state = await fixture(page, 'MAIN', { pending: 2, older: 84 }, true);
  await page.goto('/admin/main-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true }); await map.scrollIntoViewIfNeeded();
  await map.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
  await expect(popup.getByText('Only the assigned department administrator can decide. Main Admin monitoring is read-only.')).toBeVisible();
  await expect(popup.getByText('Not provided', { exact: true })).toBeVisible();
  await expect(popup.getByText('00000000001', { exact: true })).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Acknowledge report', exact: true })).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Flag suspected false report', exact: true })).toHaveCount(0);
  expect(state.flags).toEqual([]); expect(state.decisions).toEqual([]);
});

for (const width of [1280, 390]) test(`anchored report photo returns to its popup at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, 'MEDICAL', { pending: 2, older: 84 }, true); state.photo = true; state.reportContact = '00000000000';
  await page.route('**/api/attachments/v1/popup-photo/access-url', route => route.fulfill({ json: { data: { url: 'https://res.cloudinary.com/nearby-popup-fixture/photo.svg', expiresInSeconds: 60 } } }));
  await page.route('https://res.cloudinary.com/nearby-popup-fixture/photo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="#e9eee9"/></svg>' }));
  await page.goto('/admin/medical-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true }); await map.scrollIntoViewIfNeeded();
  await map.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
  await expect(popup.getByRole('heading', { name: 'Later synthetic report B' })).toBeVisible();
  await expect(popup.getByText('00000000000', { exact: true })).toBeVisible();
  await expect(popup.getByText('Review this later report before deciding.', { exact: true })).toBeVisible();
  await expect(map.locator('.leaflet-control-zoom')).toHaveCount(1);
  await expect(map.locator('.leaflet-control-zoom')).toHaveCSS('visibility', 'hidden');
  await expect(map.locator('.leaflet-control-zoom')).toBeHidden();
  await popup.getByRole('button', { name: 'View attached photo', exact: true }).click();
  const photo = page.getByRole('dialog', { name: 'Report photo', exact: true }); await expect(photo).toBeVisible();
  await expect(photo.getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(photo).toHaveCount(0);
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'Acknowledge report', exact: true }).scrollIntoViewIfNeeded();
  await map.screenshot({ path: info.outputPath(`photo-popup-${width}.png`), animations: 'disabled' });
  await map.locator('.nearby-report-popup .leaflet-popup-close-button').focus();
  await page.keyboard.press('Escape'); await expect(popup).toHaveCount(0);
  await expect(map.getByTitle('Review pending nearby report · 2 m', { exact: true })).toBeFocused();
  await expect(map.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
  expect(state.flags).toEqual([]); expect(state.decisions).toEqual([]);
});

test('a stale anchored flag preserves the reason and does not acknowledge B', async ({ page }) => {
  const state = await fixture(page, 'MEDICAL', { pending: 2, older: 84 }, true); state.conflict = true;
  await page.goto('/admin/medical-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true }); await map.scrollIntoViewIfNeeded();
  await map.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
  await popup.getByRole('button', { name: 'Flag suspected false report', exact: true }).click();
  await popup.getByLabel('Why do you suspect this report is false?', { exact: true }).fill('Synthetic facts retained after a concurrent update.');
  await popup.getByRole('button', { name: 'Send review request' }).click();
  await expect(popup.getByRole('alert')).toBeVisible();
  await expect(popup.getByLabel('Why do you suspect this report is false?', { exact: true })).toHaveValue('Synthetic facts retained after a concurrent update.');
  expect(state.flagged).toBe(false); expect(state.status).toBe('PENDING'); expect(state.decisions).toEqual([]);
});

test('signing out removes an open anchored report', async ({ page }) => {
  await fixture(page, 'MEDICAL', { pending: 2, older: 84 }, true);
  await page.goto('/admin/medical-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true }); await map.scrollIntoViewIfNeeded();
  await map.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  await expect(map.getByRole('region', { name: 'Nearby submitted report', exact: true }).getByText('Review this later report before deciding.')).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('user'); localStorage.setItem('emergency-logout-epoch', 'synthetic-popup-logout'); window.dispatchEvent(new StorageEvent('storage', { key: 'user' })); });
  await expect(page.getByText('Review this later report before deciding.')).toHaveCount(0);
  await expect(page.locator('.nearby-report-popup')).toHaveCount(0);
});

test('explicit-start quiet B does not silence a distinct normal new arrival', async ({ page }) => {
  const state = await fixture(page, 'FIRE', { pending: 2, older: 84 }, true);
  await page.goto('/admin/fire-dashboard');
  await expect.poll(() => state.attentionReads).toBeGreaterThan(0);
  const reads = state.attentionReads;
  state.attention = [{ incidentId: follow, version: 1, scope: 'FIRE', title: 'Quiet B', pendingNearbyReview: true, status: 'OPEN', reportedAt: '2026-10-20T00:01:00Z' },
    { incidentId: older, version: 1, scope: 'FIRE', title: 'New normal arrival', status: 'RESPONDING', reportedAt: '2026-10-20T00:02:00Z' }];
  for (const peer of state.peers) peer.send(`42${JSON.stringify(['emergency.event', { type: 'incident.created', entityId: older }])}`);
  await expect.poll(() => state.attentionReads).toBeGreaterThan(reads);
  await expect(page.getByRole('dialog').getByText('New normal arrival', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Quiet B', { exact: true })).toHaveCount(0);
});

test('explicit-start stale response start leaves B waiting with a recoverable error', async ({ page }) => {
  const state = await fixture(page, 'MEDICAL', { pending: 2, older: 84 }, true); state.status = 'ACKNOWLEDGED'; state.version = 2;
  await page.goto('/admin/medical-dashboard');
  const queue = page.getByRole('region', { name: 'Nearby report intake', exact: true });
  await queue.getByRole('combobox').selectOption('ACKNOWLEDGED');
  await queue.getByRole('button', { name: 'Review nearby report', exact: true }).click();
  state.conflict = true;
  const dialog = page.getByRole('dialog', { name: 'Nearby submitted report', exact: true });
  await dialog.getByRole('button', { name: 'Start response', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Decision not confirmed or another admin already reviewed it. Reload the decision before retrying.');
  expect(state.started).toBe(false); expect(state.version).toBe(2);
  await expect(dialog.getByText('Review acknowledged. This report is still waiting and is not in Responding.')).toBeVisible();
});

test('department rejection requires a reason and retains a visible history', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/fire-dashboard');
  const queue = page.getByRole('region', { name: 'Nearby report intake', exact: true });
  await queue.getByRole('button', { name: 'Review nearby report', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Rejection reason — required only when rejecting').fill('Reviewed synthetic evidence and confirmed this was a false submission.');
  await dialog.getByRole('button', { name: 'Reject as fake — retain record' }).click();
  await expect.poll(() => state.status).toBe('REJECTED');
  expect(state.decisions[0]).toMatchObject({ status: 'REJECTED', version: 1, reason: expect.any(String) });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await queue.getByRole('combobox').selectOption('REJECTED');
  await expect(queue.getByText('Later synthetic report B')).toBeVisible();
});
test('Main Admin sees the pending review without department decision controls', async ({ page }) => {
  const state = await fixture(page, 'MAIN'); await page.goto('/admin/main-dashboard');
  await page.getByRole('region', { name: 'Nearby report intake', exact: true }).getByRole('button', { name: 'Review nearby report', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Only the assigned department administrator can decide. Main Admin monitoring is read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge and admit report' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject as fake — retain record' })).toHaveCount(0);
  expect(state.decisions).toEqual([]);
});
test('original map offers only its pending follow-up, not the older 84m peer', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/fire-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(1);
  await expect(map.getByRole('button', { name: 'Review nearby report · FIRE · 2 m', exact: true })).toBeVisible();
  await expect(map.getByRole('button', { name: /Review nearby report · FIRE · 84/ })).toHaveCount(0);
  await expect(map.locator('[data-mapcn-marker-label]')).toHaveCount(1);
  await expect(map.getByRole('button', { name: 'Pending nearby report · 2 m', exact: true })).toBeVisible();
  await expect(map.getByText('Nearby report · 84 m', { exact: true })).toHaveCount(0);
  const pendingPin = map.getByTitle('Review pending nearby report · 2 m', { exact: true });
  await expect(pendingPin).toHaveClass(/nearby-report-dot-pending/);
  await pendingPin.click();
  await expect(page.getByRole('dialog').getByText('Review this later report before deciding.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await pendingPin.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByText('Review this later report before deciding.')).toBeVisible();
  expect(state.detailIds.length).toBeGreaterThan(0);
  expect(state.detailIds.every(id => id === follow)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await pendingPin.focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('dialog').getByText('Review this later report before deciding.')).toBeVisible();
});

for (const width of [1280, 390]) test(`only the later 84m report has a clickable pending label at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, 'MEDICAL', { pending: 84, older: 2 });
  await page.goto('/admin/medical-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(map.locator('.incident-location-pin')).toHaveCount(1);
  await expect(map.locator('.nearby-report-dot')).toHaveCount(2);
  await expect(map.locator('.nearby-report-dot-pending')).toHaveCount(1);
  const pendingDot = map.getByTitle('Review pending nearby report · 84 m', { exact: true });
  await expect(pendingDot.locator('path')).toHaveCount(0);
  await expect(pendingDot.locator('circle').first()).toHaveAttribute('r', '12');
  await expect(pendingDot.locator('circle').last()).toHaveAttribute('fill', '#0089ff');
  const dotBounds = await pendingDot.boundingBox();
  expect(dotBounds!.width).toBe(44);
  expect(dotBounds!.height).toBe(44);
  const radiusBounds = await map.locator('.incident-reference-radius').boundingBox();
  expect(Math.abs(dotBounds!.x + 22 - (radiusBounds!.x + radiusBounds!.width / 2))).toBeLessThanOrEqual(2);
  // Fixture B is 84m due north: the dot centre, not its tip, marks that GPS fix.
  expect((radiusBounds!.y + radiusBounds!.height / 2 - (dotBounds!.y + 22)) / (radiusBounds!.height / 2)).toBeCloseTo(0.84, 1);
  await expect(map.locator('[data-mapcn-marker-label]')).toHaveCount(1);
  await expect(map.getByText('Nearby report · 2 m', { exact: true })).toHaveCount(0);
  const label = map.getByRole('button', { name: 'Pending nearby report · 84 m', exact: true });
  await expect(label).toBeVisible();
  const mapBounds = await map.getByRole('group', { name: 'Incident location map', exact: true }).boundingBox();
  const labelBounds = await map.locator('[data-mapcn-marker-label]').boundingBox();
  expect(labelBounds!.y).toBeGreaterThanOrEqual(mapBounds!.y);
  expect(labelBounds!.y + labelBounds!.height).toBeLessThanOrEqual(mapBounds!.y + mapBounds!.height);
  expect(labelBounds!.x).toBeGreaterThanOrEqual(mapBounds!.x);
  expect(labelBounds!.x + labelBounds!.width).toBeLessThanOrEqual(mapBounds!.x + mapBounds!.width);
  await expect(map.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(1);
  await expect(map.getByRole('button', { name: 'Review nearby report · MEDICAL · 84 m', exact: true })).toBeVisible();
  await map.screenshot({ path: info.outputPath(`pending-map-${width}.png`), animations: 'disabled' });
  if (width === 1280) await label.click();
  else await map.getByTitle('Review pending nearby report · 84 m', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Review this later report before deciding.')).toBeVisible();
  expect(state.detailIds.every(id => id === follow)).toBe(true);
  await dialog.getByRole('button', { name: 'Acknowledge and admit report' }).click();
  await expect.poll(() => state.status).toBe('ACKNOWLEDGED');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(map.locator('[data-mapcn-marker-label]')).toHaveCount(0);
  await expect(map.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(0);
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(map.locator('.incident-location-pin')).toHaveCount(1);
  await expect(map.locator('.nearby-report-dot')).toHaveCount(2);
  await expect(map.locator('.nearby-report-dot-pending')).toHaveCount(0);
});

for (const width of [1280, 390]) test(`in-app map reviews B without closing the map or opening a tab at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const state = await fixture(page, 'MEDICAL');
  await page.goto('/admin/medical-dashboard');
  const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await card.scrollIntoViewIfNeeded();
  const viewMap = card.getByRole('button', { name: 'View map', exact: true });
  const urlBefore = page.url();
  await viewMap.click();
  const viewer = page.getByRole('dialog', { name: 'Incident map', exact: true });
  await expect(viewer.locator('.nearby-report-dot-pending')).toHaveCount(1);
  await expect(viewer.locator('.incident-location-pin')).toHaveCount(1);
  await expect(viewer.locator('.nearby-report-dot')).toHaveCount(2);
  await expect(page.locator('.leaflet-container')).toHaveCount(1);
  await expect(viewer.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(1);
  await viewer.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Nearby submitted report', exact: true });
  await expect(review.getByText('Review this later report before deciding.')).toBeVisible();
  expect(state.detailIds.length).toBeGreaterThan(0);
  expect(state.detailIds.every(id => id === follow)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expect(viewer).toBeVisible();
  await viewer.screenshot({ path: info.outputPath(`in-app-pending-${width}.png`), animations: 'disabled' });
  // A server reread, not a local admission or event payload, changes the overlay.
  state.status = 'ACKNOWLEDGED'; state.version++;
  if (process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT === 'socket.io') {
    await expect.poll(() => state.peers.length).toBe(1);
    state.peers[0].send(`42${JSON.stringify(['emergency.event', { type: 'incident.updated', entityId: follow }])}`);
  } else await page.evaluate(() => (window as typeof window & { __intakeEmit: () => void }).__intakeEmit());
  await expect(viewer.locator('.nearby-report-dot-pending')).toHaveCount(0);
  await expect(viewer.locator('.nearby-report-dot')).toHaveCount(2);
  await expect(viewer.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(0);
  expect(state.decisions).toEqual([]);
  expect(page.url()).toBe(urlBefore);
  expect(page.context().pages()).toHaveLength(1);
  await viewer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(viewMap).toBeFocused();
  await expect(card.locator('.nearby-report-dot')).toHaveCount(2);
});

test('missing server intake metadata does not label or offer every nearby peer for review', async ({ page }) => {
  const state = await fixture(page); state.omitReviewIds = true;
  await page.goto('/admin/fire-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator('.leaflet-marker-icon')).toHaveCount(3);
  await expect(map.locator('[data-mapcn-marker-label]')).toHaveCount(0);
  await expect(map.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(0);
  expect(state.detailIds).toEqual([]);
});
test('a stale decision reports a conflict without locally admitting the report', async ({ page }) => {
  const state = await fixture(page); state.conflict = true; await page.goto('/admin/fire-dashboard');
  await page.getByRole('region', { name: 'Nearby report intake', exact: true }).getByRole('button', { name: 'Review nearby report', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: 'Acknowledge and admit report' }).click();
  await expect(dialog.getByText('Decision not confirmed or another admin already reviewed it. Reload the decision before retrying.')).toBeVisible();
  expect(state.status).toBe('PENDING');
});
test('WebSocket hints refresh the pending queue through one shared connection, without EventSource', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT !== 'socket.io', 'Requires the WebSocket opt-in export');
  const state = await fixture(page); await page.goto('/admin/fire-dashboard');
  const queue = page.getByRole('region', { name: 'Nearby report intake', exact: true });
  await expect(queue.getByText('Later synthetic report B')).toBeVisible();
  await expect.poll(() => state.peers.length).toBe(1);
  state.status = 'ACKNOWLEDGED'; state.version++;
  state.peers[0].send(`42${JSON.stringify(['emergency.event', { type: 'incident.updated', entityId: follow, title: 'Untrusted hint is not report data' }])}`);
  await expect(queue.getByText('No pending nearby reviews on this page.')).toBeVisible();
  await expect(page.getByText('Untrusted hint is not report data')).toHaveCount(0);
  expect(state.peers).toHaveLength(1); expect(state.decisions).toEqual([]);
});

test('the in-app map never reveals B details after server access denial', async ({ page }) => {
  const state = await fixture(page, 'MEDICAL');
  await page.route(`**/api/incidents/v1/${follow}`, route => route.fulfill({ status: 403, json: { message: 'Synthetic scope denial' } }));
  await page.goto('/admin/medical-dashboard');
  const card = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'View map', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Incident map', exact: true });
  await viewer.getByTitle('Review pending nearby report · 2 m', { exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Nearby submitted report', exact: true });
  await expect(review.getByText('Report unavailable or outside your current access. Close this view and retry.')).toBeVisible();
  await expect(page.getByText('Review this later report before deciding.', { exact: true })).toHaveCount(0);
  expect(state.decisions).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expect(viewer).toBeVisible();
});

for (const width of [1280, 390]) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`B dot expands and collapses the same Leaflet map at ${width}px with ${reducedMotion} motion`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion });
    const state = await fixture(page, 'MEDICAL', { pending: 2, older: 84 }, true);
    state.reportContact = '00000000000';
    await page.goto('/admin/medical-dashboard');
    const map = page.getByRole('group', { name: 'Reported emergency location', exact: true }); await map.scrollIntoViewIfNeeded();
    const expansion = map.locator('[data-expanded-map]');
    const viewport = map.locator('.leaflet-container');
    await expect(expansion).toHaveAttribute('data-expanded', 'false');
    await expect(expansion).toHaveAttribute('data-motion-mode', reducedMotion === 'reduce' ? 'reduced' : 'animated');
    await expect(expansion).toHaveCSS('height', '260px');
    await expect(viewport).toHaveCount(1);
    const original = await viewport.elementHandle();
    const circle = map.locator('.incident-reference-radius');
    const beforeZoomPath = await circle.getAttribute('d');
    await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
    // Leaflet sets its animated CSS transform on a later frame. Wait for the
    // actual SVG redraw, not a transient scaled path, before measuring radius.
    await expect.poll(() => circle.getAttribute('d')).not.toBe(beforeZoomPath);
    await expect(viewport).not.toHaveClass(/leaflet-zoom-anim/);
    // CSS reduced-motion can deliver Leaflet's transitionend before the final
    // composited frame. Take the reference measurement after two actual paints.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect.poll(() => circle.evaluate(node => (node as SVGGraphicsElement).getScreenCTM()?.a)).toBe(1);
    const radiusWidth = (await circle.boundingBox())!.width;
    const circleCentre = async () => {
      const bounds = (await circle.boundingBox())!; const frame = (await viewport.boundingBox())!;
      return { x: bounds.x + bounds.width / 2 - frame.x, y: bounds.y + bounds.height / 2 - frame.y };
    };
    const originalCentre = await circleCentre();
    const coordinates = await map.locator('.tabular-nums').first().textContent();
    expect(state.detailIds).toEqual([]);
    await expect(map.getByText('00000000000', { exact: true })).toHaveCount(0);
    for (let cycle = 0; cycle < 2; cycle++) {
      const dot = map.getByTitle('Review pending nearby report · 2 m', { exact: true });
      if (cycle === 0) { await dot.focus(); await page.keyboard.press('Enter'); } else await dot.click();
      const popup = map.getByRole('region', { name: 'Nearby submitted report', exact: true });
      await expect(expansion).toHaveAttribute('data-expanded', 'true');
      await expect(expansion).toHaveCSS('height', '420px');
      await expect(dot).toHaveAttribute('aria-expanded', 'true');
      await expect(popup.getByRole('heading', { name: 'Later synthetic report B', exact: true })).toBeVisible();
      await expect(popup.getByText('00000000000', { exact: true })).toBeVisible();
      await expect(popup.getByText('Review this later report before deciding.', { exact: true })).toBeVisible();
      await expect(popup.getByText('00000000001', { exact: true })).toHaveCount(0);
      await expect(popup.getByRole('button', { name: 'Acknowledge report', exact: true })).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Flag suspected false report', exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0); await expect(viewport).toHaveCount(1);
      expect(await original?.evaluate(node => node.isConnected)).toBe(true);
      await expect.poll(async () => (await circle.boundingBox())!.width).toBeCloseTo(radiusWidth, 0);
      expect(await map.locator('.tabular-nums').first().textContent()).toBe(coordinates);
      if (cycle === 0 && reducedMotion === 'no-preference') await map.screenshot({ path: info.outputPath(`expanded-map-${width}.png`), animations: 'disabled' });
      await map.locator('.nearby-report-popup .leaflet-popup-close-button').focus(); await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0); await expect(expansion).toHaveAttribute('data-expanded', 'false');
      await expect(expansion).toHaveCSS('height', '260px'); await expect(dot).toHaveAttribute('aria-expanded', 'false');
      await expect(dot).toBeFocused(); expect(await original?.evaluate(node => node.isConnected)).toBe(true);
      // Closing must undo popup auto-pan, not leave the original's circle
      // clipped beneath the compact card. Compare map-relative geometry.
      await expect.poll(async () => (await circleCentre()).x).toBeCloseTo(originalCentre.x, 0);
      await expect.poll(async () => (await circleCentre()).y).toBeCloseTo(originalCentre.y, 0);
    }
    if (reducedMotion === 'no-preference') await map.screenshot({ path: info.outputPath(`collapsed-map-${width}.png`), animations: 'disabled' });
    expect(state.status).toBe('PENDING'); expect(state.decisions).toEqual([]); expect(state.flags).toEqual([]); expect(state.starts).toEqual([]);
    expect(state.detailIds.every(id => id === follow)).toBe(true); expect(state.peers).toHaveLength(1);
  });
}
