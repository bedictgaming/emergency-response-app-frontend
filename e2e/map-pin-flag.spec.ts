import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const id = '10000000-0000-4000-8000-000000000001', flagId = '20000000-0000-4000-8000-000000000002';
const reason = 'The reporter says this is a training test; please investigate the supporting evidence.';
async function fixture(page: Page, department = 'FIRE') {
  const main = department === 'MAIN', service = department === 'DRRMO' ? 'HAZARD' : main ? 'FIRE' : department;
  const user = { id: `synthetic-${department}`, role: 'ADMIN', department, isMainAdmin: main, status: 'ACTIVE', name: 'Synthetic reviewer' };
  const state = { status: 'NONE', version: 1, conflict: false, coordinates: true, foreign: false, legacy: false, joined: false,
    contact: '09000000000', attention: false, writes: [] as { path: string; data: unknown }[], detailReads: 0, peers: [] as WebSocketRoute[] };
  const flag = (foreign = false) => ({ reviewFlagId: foreign ? '30000000-0000-4000-8000-000000000003' : flagId, incidentId: id,
    department: foreign ? 'MEDICAL' : service === 'HAZARD' ? 'DRRMO' : service, status: foreign ? 'PENDING' : state.status,
    reason, reviewAuthority: 'DEPARTMENT', departmentReviewEnabled: true, createdAt: '2026-10-23T01:00:00Z',
    updatedAt: new Date(Date.UTC(2026,9,23,2,state.version)).toISOString() });
  const report = () => ({ incidentId: id, title: 'Synthetic map-pin emergency', description: `${state.contact ? `[Contact: ${state.contact}]\n` : ''}Synthetic report, not a real emergency.`,
    reporter: { name: 'Synthetic reporter', phone: '09999999999' },
    ...(state.coordinates && { latitude: 10.251, longitude: 123.949 }), status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: [service],
    reportedBy: 'synthetic-citizen', reportedAt: '2026-10-23T01:00:00Z', updatedAt: '2026-10-23T01:00:00Z', severityLevel: 'MEDIUM',
    type: { typeName: service }, location: { address: 'Synthetic Cordova location' }, attachments: [], incidentUnits: [],
    serviceResponses: [{ service, status: 'RESPONDING' }],
    reviewFlags: state.status === 'NONE' || state.status === 'DISMISSED' ? [] : [flag()],
    reviewNotices: [...(state.status === 'NONE' ? [] : [flag()]), ...(state.foreign ? [flag(true)] : [])],
    ...(!state.legacy && { reportReview: { departmentReviewEnabled: true, canReview: !main, canFlag: !main, canCorrect: !main,
      readOnly: main, canCancelFalse: false, wholeConfirmedFalse: false } }) });
  await page.addInitScript(value => {
    localStorage.setItem('user', JSON.stringify(value)); localStorage.setItem('emergency-response-theme', 'light');
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); streams.push(this); setTimeout(() => this.onopen?.(), 0); }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: Stream, __pinReady: () => streams.some(s => !s.closed),
      __pinEmit: () => streams.filter(s => !s.closed).forEach(s => s.dispatchEvent(new Event('incident.updated'))) });
  }, user);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    state.peers.push(peer); peer.onMessage(message => { if (message === '40') { state.joined = true; peer.send('40{"sid":"synthetic-pin"}'); } });
    peer.send('0{"sid":"synthetic-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.route(/^https:\/\//, route => route.request().url().includes('tile.openstreetmap.org')
    ? route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee9"/></svg>' }) : route.abort());
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/\/$/, '');
    if (path.endsWith('/nearby-detection')) return route.fulfill({ json: { data: { radiusMeters: 100, active: true, nearby: false, complete: true,
      center: { latitude: 10.251, longitude: 123.949 }, items: [], reviewIncidentIds: [], waitingIncidentIds: [] } } });
    if (req.method() !== 'GET') {
      state.writes.push({ path, data: req.postDataJSON() });
      if (state.conflict) return route.fulfill({ status: 409, json: { message: 'Report changed. Refresh before flagging again.' } });
      state.status = req.postDataJSON().status ?? 'PENDING'; state.version++;
      return route.fulfill({ json: { data: { flag: flag() } } });
    }
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/attention')) return route.fulfill({ json: { data: { scope: main ? 'MAIN' : service, items: state.attention ? [{ ...report(), scope: service, version: 1 }] : [], hasMore: false, observedAt: '2026-10-23T02:00:00Z' } } });
    if (path.endsWith('/review-flags')) return route.fulfill({ json: { data: { view: new URL(req.url()).searchParams.get('view') || 'all', departmentReviewEnabled: true, canReview: !main, flags: [], pagination: { page: 1, pages: 0, total: 0, limit: 20 } } } });
    if (path.endsWith(`/incidents/v1/${id}`)) { state.detailReads++; return route.fulfill({ json: { data: { incident: report() } } }); }
    return route.fulfill({ json: { data: { user, incidents: [report()], items: [], enabled: false, canDecide: false, hasMore: false, flags: [],
      scope: main ? 'MAIN' : service, pagination: { page: 1, limit: 5, total: 1, pages: 1 }, summary: { total: 1, responding: 1, active: 0, resolved: 0 } } } });
  });
  return { state, emit: async () => {
    await expect.poll(async () => state.joined || page.evaluate(() => (window as typeof window & { __pinReady: () => boolean }).__pinReady())).toBe(true);
    for (const peer of state.peers) peer.send('42["emergency.event",{"type":"incident.updated","entityId":"'+id+'"}]');
    await page.evaluate(() => (window as typeof window & { __pinEmit: () => void }).__pinEmit());
  } };
}
async function showPin(page: Page, department = 'FIRE') {
  await page.goto(`/admin/${department === 'MAIN' ? 'main' : department.toLowerCase()}-dashboard`);
  const location = page.getByRole('group', { name: 'Reported emergency location', exact: true });
  await location.scrollIntoViewIfNeeded();
  return location;
}
for (const department of ['MAIN','FIRE','MEDICAL','POLICE','DRRMO']) test(`${department}: submitted contact is a safe dialer link, not the profile number`, async ({ page }, info) => {
  const width = department === 'MEDICAL' ? 390 : 1280;
  await page.setViewportSize({ width, height: 900 });
  const { state } = await fixture(page, department); const location = await showPin(page, department);
  const call = page.getByRole('link', { name: 'Call report contact 09000000000', exact: true });
  await expect(call).toHaveAttribute('href', 'tel:09000000000'); await call.scrollIntoViewIfNeeded();
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('link', { name: /09999999999/ })).toHaveCount(0);
  // Exercise keyboard activation without launching the OS dialer or calling.
  await call.evaluate(link => link.addEventListener('click', event => { event.preventDefault(); link.setAttribute('data-test-activated', 'true'); }));
  await call.focus(); await call.press('Enter'); await expect(call).toHaveAttribute('data-test-activated', 'true');
  expect(page.context().pages()).toHaveLength(1); expect(state.writes).toEqual([]);
  // Center the contact below the existing sticky mobile header for the capture.
  await call.evaluate(link => link.scrollIntoView({ block: 'center' }));
  await expect(call).toBeInViewport();
  const contactBounds = (await call.boundingBox())!, headerBounds = (await page.getByRole('banner').boundingBox())!;
  expect(contactBounds.y).toBeGreaterThanOrEqual(headerBounds.y + headerBounds.height);
  if (department === 'FIRE' || department === 'MEDICAL') await page.screenshot({ path: info.outputPath(`contact-card-${width}.png`) });
  if (department !== 'MAIN') {
    await location.getByRole('button', { name: 'Review or flag report at this pin', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Department report review', exact: true });
    await expect(dialog.getByRole('link', { name: 'Call report contact 09000000000', exact: true })).toHaveAttribute('href', 'tel:09000000000');
    await expect(dialog).not.toContainText('[Contact:'); await expect(dialog).toContainText('Synthetic report, not a real emergency.');
    expect(state.writes).toEqual([]);
  }
});
for (const contact of ['', 'javascript:alert(911)']) test(`unsupported submitted contact stays plain text: ${contact || 'missing'}`, async ({ page }) => {
  const { state } = await fixture(page); state.contact = contact;
  await showPin(page);
  await expect(page.getByRole('link', { name: /Call report contact/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Call Contact', exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Contact:/).getByText(contact || 'Not provided', { exact: true })).toBeVisible();
  await expect(page.getByText('09999999999', { exact: true })).toHaveCount(0); expect(state.writes).toEqual([]);
});
for (const width of [1280, 390]) test(`outstanding alert links only the submitted contact at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const { state } = await fixture(page); state.attention = true;
  await page.goto('/admin/fire-dashboard');
  await page.getByRole('button', { name: 'Outstanding alerts: 1', exact: true }).click();
  const alert = page.getByRole('dialog', { name: 'Outstanding report', exact: true });
  const call = alert.getByRole('link', { name: 'Call report contact 09000000000', exact: true });
  await expect(call).toHaveAttribute('href', 'tel:09000000000'); await call.scrollIntoViewIfNeeded();
  expect((await call.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(alert.getByRole('link', { name: /09999999999/ })).toHaveCount(0);
  await call.evaluate(link => link.addEventListener('click', event => { event.preventDefault(); link.setAttribute('data-test-activated', 'true'); }));
  await call.focus(); await call.press('Enter'); await expect(call).toHaveAttribute('data-test-activated', 'true');
  expect(page.context().pages()).toHaveLength(1); expect(state.writes).toEqual([]);
  await alert.screenshot({ path: info.outputPath(`contact-alert-${width}.png`), animations: 'disabled' });
});
for (const department of ['FIRE','MEDICAL','POLICE','DRRMO']) test(`${department}: pin opens review; reason saves the flag without moving coordinates`, async ({ page }, info) => {
  const width = department === 'FIRE' ? 1280 : 390; await page.setViewportSize({ width, height: 900 });
  const { state } = await fixture(page, department); const location = await showPin(page, department);
  const pin = location.getByRole('button', { name: 'Review or flag report at this pin', exact: true });
  await expect(pin).toBeVisible(); await expect(pin).toHaveAttribute('data-report-flag-status', 'NONE');
  await expect(page.getByRole('button', { name: 'Review / flag report', exact: true })).toHaveCount(0);
  const geometry = (element: HTMLElement | SVGElement) => ({ transform: element.style.transform, marginLeft: element.style.marginLeft, marginTop: element.style.marginTop, width: element.style.width, height: element.style.height });
  const position = await pin.evaluate(geometry); const bounds = await pin.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await pin.click(); const dialog = page.getByRole('dialog', { name: 'Department report review', exact: true });
  await expect(dialog).toContainText('Synthetic report, not a real emergency.'); expect(state.writes).toHaveLength(0);
  await expect(dialog.getByRole('button', { name: 'Send review request', exact: true })).toBeDisabled();
  await dialog.getByLabel('Why do you suspect this report is false?').fill(reason);
  await dialog.getByRole('button', { name: 'Send review request', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Flag saved in your department');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  const flagged = location.getByRole('button', { name: 'Review flagged report at this pin', exact: true });
  await expect(flagged).toHaveAttribute('data-report-flag-status', 'PENDING'); await expect(flagged).toHaveClass(/report-review-pin-flagged/);
  // Leaflet temporarily suppresses mouse outlines; that is not a GPS move.
  // Assert every geometry field exactly, plus the saved coordinate label.
  expect(await flagged.evaluate(geometry)).toEqual(position); await expect(location).toContainText('10.251000, 123.949000');
  expect(state.writes).toEqual([{ path: `/api/incidents/v1/${id}/review-flags`, data: { reason } }]);
  if (department === 'FIRE' || department === 'MEDICAL') await location.screenshot({ path: info.outputPath(`flagged-pin-${width}.png`), animations: 'disabled' });
  await flagged.focus(); await flagged.press('Enter');
  await expect(dialog).toBeVisible(); await expect.poll(() => state.detailReads).toBe(3); // initial open + post-save read + keyboard open
  await expect(dialog.getByRole('button', { name: 'Confirm false report', exact: true })).toBeDisabled();
});
test('failed flag keeps the reason and never plants a success badge', async ({ page }) => {
  const { state } = await fixture(page); state.conflict = true; const location = await showPin(page);
  await location.getByRole('button', { name: 'Review or flag report at this pin', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel('Why do you suspect this report is false?').fill(reason);
  await dialog.getByRole('button', { name: 'Send review request', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Refresh before flagging'); await expect(dialog.getByLabel('Why do you suspect this report is false?')).toHaveValue(reason);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(location.locator('.report-review-pin')).toHaveAttribute('data-report-flag-status', 'NONE');
});
test('live own-department flags/corrections update the pin; foreign notices do not grant a badge or action', async ({ page }) => {
  const { state, emit } = await fixture(page); state.foreign = true; const location = await showPin(page);
  const pin = location.locator('.report-review-pin'); await expect(pin).toHaveAttribute('data-report-flag-status', 'NONE');
  await pin.click(); await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  state.status = 'PENDING'; state.version++; await emit(); await expect(pin).toHaveAttribute('data-report-flag-status', 'PENDING');
  state.status = 'CONFIRMED'; state.version++; await emit(); await expect(pin).toHaveAttribute('data-report-flag-status', 'CONFIRMED');
  state.status = 'DISMISSED'; state.version++; await emit(); await expect(pin).toHaveAttribute('data-report-flag-status', 'NONE'); await expect(pin).not.toHaveClass(/report-review-pin-flagged/);
  expect(state.writes).toHaveLength(0);
});
test('expanded in-system map retains the pin action without opening a tab', async ({ page }) => {
  await fixture(page); const location = await showPin(page); await location.getByRole('button', { name: 'View map', exact: true }).click();
  const map = page.getByRole('dialog', { name: 'Incident map', exact: true }); await map.getByRole('button', { name: 'Review or flag report at this pin', exact: true }).click();
  const report = page.getByRole('dialog', { name: 'Department report review', exact: true }); await expect(report).toBeVisible();
  expect(page.context().pages()).toHaveLength(1); await report.getByRole('button', { name: 'Close', exact: true }).click(); await expect(map).toBeVisible();
});
test('missing GPS retains a review fallback rather than inventing a pin', async ({ page }) => {
  const { state } = await fixture(page); state.coordinates = false; await page.goto('/admin/fire-dashboard');
  await expect(page.getByText('Map unavailable: this report has no valid recorded coordinates.')).toBeVisible();
  await page.getByRole('button', { name: 'Review / flag report', exact: true }).click(); await expect(page.getByRole('dialog', { name: 'Department report review' })).toBeVisible();
  await expect(page.locator('.report-review-pin')).toHaveCount(0);
});
test('Main monitoring map never receives the department pin action', async ({ page }) => {
  await fixture(page, 'MAIN'); const location = await showPin(page, 'MAIN');
  await expect(location.getByRole('button', { name: 'Emergency location pin', exact: true })).toBeVisible();
  await expect(location.locator('.report-review-pin')).toHaveCount(0);
});
