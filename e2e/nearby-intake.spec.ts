import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.skip(process.env.NEXT_PUBLIC_NEARBY_REVIEW_ENABLED !== 'true', 'Requires the separate opt-in nearby-intake export');
const first = '10000000-0000-4000-8000-000000000001';
const follow = '20000000-0000-4000-8000-000000000002';
const older = '30000000-0000-4000-8000-000000000003';
const reviewId = '40000000-0000-4000-8000-000000000004';
async function fixture(page: Page, department = 'FIRE') {
  const service = department === 'DRRMO' ? 'HAZARD' : department === 'MAIN' ? 'FIRE' : department;
  const user = { id: 'synthetic-intake-admin', role: 'ADMIN', department, isMainAdmin: department === 'MAIN', status: 'ACTIVE', name: 'Synthetic intake admin' };
  const report = { incidentId: first, title: 'Original synthetic emergency', description: 'Original report evidence text.',
    latitude: 10.251, longitude: 123.949, status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: [service],
    serviceResponses: [{ service, status: 'RESPONDING' }], reviewFlags: [], attachments: [], reporter: user, reportedBy: 'synthetic-citizen',
    reportedAt: '2026-10-19T00:00:00Z', severityLevel: 'MEDIUM', type: { typeName: service }, location: { address: 'Synthetic Cordova location' } };
  const peers: WebSocketRoute[] = [];
  const state = { status: 'PENDING', version: 1, reason: '', conflict: false, decisions: [] as Record<string, unknown>[], peers };
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
    const item = { reviewId, incidentId: follow, service, status: state.status, version: state.version, reason: state.reason,
      createdAt: '2026-10-19T00:01:00Z', incident: { title: 'Later synthetic report B', status: 'OPEN', reportedAt: '2026-10-19T00:01:00Z' } };
    if (path.endsWith(`/nearby-reviews/${reviewId}/decision`)) {
      const body = route.request().postDataJSON(); state.decisions.push(body);
      if (state.conflict) return route.fulfill({ status: 409, json: { message: 'Already reviewed by another admin' } });
      state.status = body.status; state.reason = body.reason ?? ''; state.version++;
      await route.fulfill({ json: { code: 200 } }); await emit(); return;
    }
    if (path.endsWith('/nearby-reviews')) return route.fulfill({ json: { data: { enabled: true, canDecide: department !== 'MAIN',
      items: !url.searchParams.get('status') || url.searchParams.get('status') === state.status ? [item] : [], hasMore: false } } });
    if (path.endsWith('/nearby-detection')) return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: true, complete: true,
      center: { latitude: report.latitude, longitude: report.longitude },
      items: [{ incidentId: follow, latitude: 10.25102, longitude: 123.949, status: 'OPEN', services: [service], distanceMeters: 2 },
        { incidentId: older, latitude: 10.2517, longitude: 123.949, status: 'RESPONDING', services: [service], distanceMeters: 84 }],
      reviewIncidentIds: state.status === 'PENDING' ? [follow] : [],
    } } });
    if (path.endsWith(`/incidents/v1/${follow}`)) return route.fulfill({ json: { data: { incident: { ...report, incidentId: follow,
      title: 'Later synthetic report B', description: 'Review this later report before deciding.', status: state.status === 'PENDING' ? 'OPEN' : state.status === 'REJECTED' ? 'CANCELLED' : 'RESPONDING',
      nearbyIntake: [{ service, status: state.status }],
    } } } });
    if (path.endsWith('/incidents/v1/attention')) return route.fulfill({ json: { data: { items: [], scope: department === 'MAIN' ? 'MAIN' : service,
      acknowledgementMode: department === 'MAIN' ? 'DEPARTMENT_HANDOFF' : 'PERSONAL', hasMore: false, observedAt: new Date().toISOString() } } });
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
  await fixture(page); await page.goto('/admin/fire-dashboard');
  const map = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await map.scrollIntoViewIfNeeded();
  await expect(map.getByRole('button', { name: /Review nearby report ·/ })).toHaveCount(1);
  await expect(map.getByRole('button', { name: 'Review nearby report · FIRE · 2 m', exact: true })).toBeVisible();
  await expect(map.getByRole('button', { name: /Review nearby report · FIRE · 84/ })).toHaveCount(0);
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
