import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
const incidentId = '10000000-0000-4000-8000-000000000001';
const flagId = '20000000-0000-4000-8000-000000000002';
const notes = 'Contacted the reporter and checked the evidence before this assessment.';
type QueueRow = { reviewFlagId: string; incidentId: string; department: string; status: string; reason: string;
  reviewNotes?: string | null; createdAt: string; updatedAt: string; reviewedAt?: string | null; reviewer?: { id: string; name: string };
  incident: { incidentId: string; title: string; status: string } };
async function fixture(page: Page, department: string) {
  const main = department === 'MAIN', service = department === 'DRRMO' ? 'HAZARD' : main ? 'FIRE' : department;
  const user = { id: `synthetic-${department}`, name: 'Synthetic reviewer', role: 'ADMIN', department, isMainAdmin: main, status: 'ACTIVE' };
  const state = { decision: 'PENDING', reason: 'Synthetic investigation requested. <script>plain text only</script>', fail: false, joined: false,
    queueError: false, holdNext: false, release: (() => {}) as () => void, extra: [] as QueueRow[], reads: [] as { view: string; page: number }[],
    writes: [] as { path: string; data: unknown }[], peers: [] as WebSocketRoute[] };
  const flag = () => ({ reviewFlagId: flagId, incidentId, department: main ? 'FIRE' : department, status: state.decision,
    reason: state.reason, reviewAuthority: state.decision === 'PENDING' ? 'MAIN' : 'DEPARTMENT', departmentReviewEnabled: true,
    reviewNotes: state.decision === 'PENDING' ? null : notes, createdAt: '2026-10-23T01:00:00Z', updatedAt: '2026-10-23T02:00:00Z',
    reviewedAt: state.decision === 'PENDING' ? null : '2026-10-23T03:00:00Z', reviewer: { id: user.id, name: user.name } });
  const report = () => ({ incidentId, title: 'Synthetic nearby incident for department review', description: 'Synthetic description and contact: 09000000000. Not a real emergency.',
    status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: [service], reportedBy: 'synthetic-citizen',
    reportedAt: '2026-10-23T01:00:00Z', updatedAt: '2026-10-23T02:00:00Z', type: { typeName: service }, location: { locationName: 'Synthetic location' },
    attachments: [], incidentUnits: [], serviceResponses: [{ service, status: 'RESPONDING' }], reviewFlags: state.decision === 'DISMISSED' ? [] : [flag()], reviewNotices: [flag()],
    reportReview: { departmentReviewEnabled: true, readOnly: main, canFlag: !main, canReview: !main, canCorrect: !main,
      canCancelFalse: !main && state.decision === 'CONFIRMED', wholeConfirmedFalse: state.decision === 'CONFIRMED' } });
  await page.addInitScript(value => {
    localStorage.setItem('user', JSON.stringify(value)); localStorage.setItem('emergency-response-theme', 'light');
    // This shared UI works with either configured transport. Keep default
    // production SSE and explicitly built Socket.IO fixtures fully isolated.
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); streams.push(this); setTimeout(() => this.onopen?.(), 0); }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: Stream, __reviewStreamReady: () => streams.some(s => !s.closed),
      __reviewEmit: () => streams.filter(s => !s.closed).forEach(s => s.dispatchEvent(new Event('incident.updated'))) });
  }, user);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    state.peers.push(peer); peer.onMessage(message => { if (message === '40') { peer.send('40{"sid":"synthetic-review"}'); state.joined = true; } });
    peer.send('0{"sid":"synthetic-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace(/\/$/, '');
    if (req.method() !== 'GET') {
      const data = req.postDataJSON(); state.writes.push({ path, data });
      if (state.fail) return route.fulfill({ status: 409, json: { message: 'This flag was changed or reviewed. Refresh before deciding.' } });
      state.decision = path.endsWith('/correction') ? 'DISMISSED' : data.status;
      return route.fulfill({ json: { data: { flag: flag() } } });
    }
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user } } });
    if (path.endsWith('/review-flags')) {
      const query = new URL(req.url()).searchParams, view = query.get('view') || 'all', pageNumber = Number(query.get('page') || 1);
      state.reads.push({ view, page: pageNumber });
      const rows = [{ ...flag(), incident: { incidentId, title: report().title, status: report().status } }, ...state.extra]
        .filter(row => view === 'all' || (view === 'pending' ? row.status === 'PENDING' : row.status !== 'PENDING'));
      if (view === 'reviewed') rows.sort((a, b) => Date.parse(b.reviewedAt || '') - Date.parse(a.reviewedAt || ''));
      const flags = rows.slice((pageNumber - 1) * 20, pageNumber * 20), total = rows.length;
      if (state.holdNext && view === 'reviewed') { state.holdNext = false; await new Promise<void>(resolve => { state.release = resolve; }); }
      if (state.queueError) return route.fulfill({ status: 503, json: { message: 'Synthetic history outage' } });
      return route.fulfill({ json: { data: { view, departmentReviewEnabled: true, canReview: !main, flags, pagination: { page: pageNumber, limit: 20, pages: Math.ceil(total / 20), total } } } });
    }
    if (path.endsWith('/nearby-reviews')) return route.fulfill({ json: { data: { enabled: true, departmentReviewEnabled: true, canDecide: !main, requiresResponseStart: true, items: [], hasMore: false } } });
    if (path.includes('/incidents/v1')) {
      const view = new URL(req.url()).searchParams.get('reportView'), wholeFalse = state.decision === 'CONFIRMED';
      const visible = view === 'false-reports' ? wholeFalse : view === 'operational' ? !wholeFalse : true;
      return route.fulfill({ json: { data: { incidents: visible ? [report()] : [], incident: report(),
        pagination: { page: 1, limit: 5, pages: visible ? 1 : 0, total: visible ? 1 : 0 }, summary: { active: 0, responding: wholeFalse ? 0 : 1, falseReports: wholeFalse ? 1 : 0, resolved: 0, total: 1 } } } });
    }
    return route.fulfill({ json: { data: { alerts: [], items: [], enabled: false, hasMore: false, scope: department, pending: [] } } });
  });
  return { state, emit: async () => {
    await expect.poll(async () => state.joined || page.evaluate(() => (window as typeof window & { __reviewStreamReady: () => boolean }).__reviewStreamReady())).toBe(true);
    for (const peer of state.peers) peer.send('42["emergency.event",{"type":"incident.updated","entityId":"'+incidentId+'"}]');
    await page.evaluate(() => (window as typeof window & { __reviewEmit: () => void }).__reviewEmit());
  } };
}
for (const department of ['FIRE','MEDICAL','POLICE','DRRMO']) test(`${department} queue reviews only its server-authorized flag`, async ({ page }) => {
  const { state } = await fixture(page, department);
  await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
  const queue = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Report review queue' }) });
  await expect(queue).toContainText('Your department reviews its own flags');
  await queue.getByRole('button').filter({ hasText: /review|flag/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Department report review');
  await expect(dialog.getByRole('button', { name: 'Confirm false report', exact: true })).toBeDisabled();
  await dialog.getByLabel('Review explanation (required)').fill(notes);
  await dialog.getByRole('button', { name: 'Confirm false report', exact: true }).click();
  await expect(dialog).toContainText('Whole report confirmed false.');
  expect(state.writes).toEqual([{ path: `/api/incidents/v1/${incidentId}/review-flags/${flagId}`, data: { status: 'CONFIRMED', reviewNotes: notes, expectedUpdatedAt: '2026-10-23T02:00:00Z' } }]);
  await expect(dialog.getByRole('button', { name: /delete/i })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Correct mistaken confirmation' }).click();
  await dialog.getByLabel('Why was the false-report decision incorrect?').fill(notes);
  await dialog.getByRole('button', { name: 'Save correction and dismiss flag' }).click();
  await expect(dialog).toContainText('Correction saved.'); expect(state.writes).toHaveLength(2);
});
for (const width of [1280,390]) for (const department of ['MAIN','FIRE']) test(`${department} review layout and controls at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const { state } = await fixture(page, department);
  state.reason = 'Synthetic long reason with supporting evidence. '.repeat(8);
  await page.goto(`/admin/${department === 'MAIN' ? 'main' : 'fire'}-dashboard`);
  const queue = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Report review queue' }) });
  await queue.getByRole('button').filter({ hasText: /review|flag/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(department === 'MAIN' ? 'Monitoring only — decisions belong' : 'Review explanation (required)');
  if (department === 'MAIN') {
    await expect(dialog.getByRole('button', { name: /confirm false|dismiss suspicion|cancel confirmed|delete/i })).toHaveCount(0);
  } else {
    await dialog.getByLabel('Review explanation (required)').fill(notes);
    await expect(dialog.getByRole('button', { name: 'Confirm false report', exact: true })).toBeEnabled();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Measure the finished panel, not a fractional frame of its entrance scale.
  // Keep the exact 44px CSS target and non-overlap assertions unchanged.
  await dialog.evaluate(element => { for (const animation of element.getAnimations()) animation.finish(); });
  const closeButton = dialog.getByRole('button', { name: 'Close', exact: true });
  expect(await closeButton.evaluate(element => parseFloat(getComputedStyle(element).height))).toBeGreaterThanOrEqual(44);
  const close = await closeButton.boundingBox();
  const scroll = await dialog.locator('.dialog-scroll-area').boundingBox();
  expect(close!.height).toBeGreaterThanOrEqual(44); expect(close!.y + close!.height).toBeLessThanOrEqual(scroll!.y + 1);
  await dialog.screenshot({ path: info.outputPath(`department-${department}-${width}.png`), animations: 'disabled' });
  expect(state.writes).toHaveLength(0);
});
test('stale department decision preserves the explanation and shows a recoverable conflict', async ({ page }) => {
  const { state } = await fixture(page, 'FIRE'); state.fail = true; await page.goto('/admin/fire-dashboard');
  await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Report review queue' }) }).getByRole('button').first().click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel('Review explanation (required)').fill(notes);
  await dialog.getByRole('button', { name: 'Confirm false report', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Refresh before deciding');
  await expect(dialog.getByLabel('Review explanation (required)')).toHaveValue(notes);
});
test('Main monitoring receives live department decisions without acquiring review actions', async ({ page }) => {
  const { state, emit } = await fixture(page, 'MAIN'); await page.goto('/admin/main-dashboard');
  const queue = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Report review queue' }) });
  await expect(queue).toContainText('Awaiting review');
  state.decision = 'DISMISSED'; await emit(); await expect(queue).toContainText('No pending review flags');
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect(queue).toContainText('Suspicion dismissed');
  await queue.getByRole('button').first().click();
  await expect(page.getByRole('dialog')).toContainText('Monitoring only');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Dismiss suspicion' })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});
for (const width of [1280, 390]) test(`completed review history is readable, retained and keyboard accessible at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const { state } = await fixture(page, 'FIRE'); state.decision = 'CONFIRMED';
  state.reason = 'Synthetic flag reason with Unicode: café / Cebu. '.repeat(3);
  await page.goto('/admin/fire-dashboard'); const queue = page.getByRole('region', { name: 'Report review queue' });
  await expect(queue).toContainText('No pending review flags');
  const pendingTab = queue.getByRole('tab', { name: 'Pending reviews', exact: true }), history = queue.getByRole('tab', { name: 'Reviewed / Flag history' });
  await pendingTab.focus(); await page.keyboard.press('ArrowRight'); await expect(history).toBeFocused(); await expect(history).toHaveAttribute('aria-selected', 'true');
  const panel = queue.getByRole('tabpanel'); await expect(panel).toContainText('Department confirmed false'); await expect(panel).toContainText(notes);
  await expect(panel).toContainText('Synthetic reviewer'); await expect(panel).toContainText('Manila'); await expect(panel.locator('script')).toHaveCount(0);
  for (const tab of [pendingTab, history]) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await queue.screenshot({ path: info.outputPath(`review-history-${width}.png`), animations: 'disabled' });
  await panel.getByRole('button', { name: 'View review / correction' }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('Department report review'); await expect(dialog).toContainText('Correct mistaken confirmation');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload(); await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect(queue).toContainText(notes); expect(state.writes).toHaveLength(0);
});
test('a completed department review moves out of Pending only after the open decision dialog closes', async ({ page }) => {
  const { state } = await fixture(page, 'FIRE'); await page.goto('/admin/fire-dashboard'); const queue = page.getByRole('region', { name: 'Report review queue' });
  await queue.getByRole('button', { name: 'Review report', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Review explanation (required)').fill(notes); await dialog.getByRole('button', { name: 'Dismiss suspicion', exact: true }).click();
  await expect(dialog).toContainText('Suspicion dismissed. Response status is unchanged.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await expect(queue).toContainText('No pending review flags');
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect(queue).toContainText('Suspicion dismissed'); await expect(queue).toContainText(notes);
  expect(state.writes).toHaveLength(1);
});
test('reviewed pagination requests the right server view and resets when switching tabs', async ({ page }) => {
  const { state } = await fixture(page, 'FIRE');
  state.extra = Array.from({ length: 21 }, (_, n) => ({ reviewFlagId: `synthetic-history-${n}`, incidentId: `synthetic-history-report-${n}`, department: 'FIRE',
    status: n % 2 ? 'CONFIRMED' : 'DISMISSED', reason: `Synthetic reason ${n}`, reviewNotes: `Synthetic review note ${n}`, reviewedAt: new Date(Date.UTC(2027, 0, 1, 0, n)).toISOString(),
    createdAt: '2026-10-23T01:00:00Z', updatedAt: '2026-10-23T02:00:00Z', incident: { incidentId: `synthetic-history-report-${n}`, title: `Completed report ${n}`, status: n === 20 ? 'CANCELLED' : 'RESPONDING' } }));
  await page.goto('/admin/fire-dashboard'); const queue = page.getByRole('region', { name: 'Report review queue' });
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect(queue.locator('li')).toHaveCount(20);
  await expect(queue.getByRole('heading', { level: 3 }).first()).toHaveText('Completed report 20'); await expect(queue).toContainText('CANCELLED · record retained');
  await queue.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(queue.locator('li')).toHaveCount(1); await expect(queue).toContainText('Completed report 0');
  await queue.getByRole('tab', { name: 'Pending reviews', exact: true }).click(); await expect(queue).toContainText('Awaiting review');
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect(queue.locator('li')).toHaveCount(20);
  expect(state.reads).toContainEqual({ view: 'reviewed', page: 2 }); expect(state.reads.at(-1)).toEqual({ view: 'reviewed', page: 1 }); expect(state.writes).toHaveLength(0);
});
test('a delayed history response cannot overwrite Pending and an error can be retried', async ({ page }) => {
  const { state } = await fixture(page, 'FIRE'); await page.goto('/admin/fire-dashboard'); const queue = page.getByRole('region', { name: 'Report review queue' });
  await expect(queue).toContainText('Awaiting review'); state.holdNext = true;
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect.poll(() => state.reads.at(-1)?.view).toBe('reviewed');
  await queue.getByRole('tab', { name: 'Pending reviews', exact: true }).click(); state.release(); await expect(queue).toContainText('Awaiting review');
  state.queueError = true; await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click(); await expect(queue.getByRole('alert')).toContainText('could not be refreshed');
  state.queueError = false; await queue.getByRole('button', { name: 'Retry review queue' }).click(); await expect(queue).toContainText('No completed reviews in this history');
  expect(state.writes).toHaveLength(0);
});
test('switching views cannot resurrect a previously loaded list after a same-window account change', async ({ page }) => {
  const { state } = await fixture(page, 'FIRE'); await page.goto('/admin/fire-dashboard'); const queue = page.getByRole('region', { name: 'Report review queue' });
  await expect(queue).toContainText(state.reason);
  // Same-window writes do not emit storage. Render-time identity guards must
  // reject the old loaded page even if it is selected again before redirect.
  await page.evaluate(() => localStorage.setItem('user', JSON.stringify({ id: 'different-synthetic-fire', role: 'ADMIN', department: 'FIRE', status: 'ACTIVE' })));
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click();
  await queue.getByRole('tab', { name: 'Pending reviews', exact: true }).click();
  await expect(queue).not.toContainText(state.reason); await expect(queue.locator('li')).toHaveCount(0); expect(state.writes).toHaveLength(0);
});

for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) test(`${department} confirmation moves the report to False Reports without a Resolve/cancel request`, async ({ page }) => {
  const { state } = await fixture(page, department); await page.goto(`/admin/${department.toLowerCase()}-dashboard`);
  await expect(page.getByRole('button', { name: 'Responding (1)', exact: true })).toBeVisible();
  const queue = page.getByRole('region', { name: 'Report review queue' });
  await queue.getByRole('button', { name: 'Review report', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Review explanation (required)').fill(notes); await dialog.getByRole('button', { name: 'Confirm false report', exact: true }).click();
  await expect(dialog).toContainText('Automatically retained in False Reports');
  await expect(dialog.getByRole('button', { name: /cancel confirmed false|mark as resolved/i })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Responding (0)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'False Reports (1)', exact: true }).click();
  const retention = page.getByRole('region', { name: 'Retained false report' }); await expect(retention).toContainText('No Resolve action is needed');
  await expect(page.getByRole('button', { name: /mark as resolved|mark as responding/i })).toHaveCount(0);
  await expect(page.getByText('FALSE REPORT', { exact: true })).toBeVisible();
  await queue.getByRole('tab', { name: 'Reviewed / Flag history' }).click();
  await queue.getByRole('button', { name: 'View review / correction' }).click();
  await dialog.getByRole('button', { name: 'Correct mistaken confirmation' }).click();
  await dialog.getByLabel('Why was the false-report decision incorrect?').fill(notes);
  await dialog.getByRole('button', { name: 'Save correction and dismiss flag' }).click(); await expect(dialog).toContainText('Correction saved');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await expect(retention).toHaveCount(0);
  await page.getByRole('button', { name: 'Responding (1)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Department report records', exact: true }).getByRole('heading', { name: 'Synthetic nearby incident for department review', exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(2); expect(state.writes.every(write => write.path.includes('/review-flags/'))).toBe(true);
});
for (const width of [1280, 375]) for (const department of ['MAIN', 'FIRE']) test(`${department} retained false view and controls at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); const { state } = await fixture(page, department); state.decision = 'CONFIRMED';
  await page.goto(`/admin/${department === 'MAIN' ? 'main' : 'fire'}-dashboard`);
  const tab = page.getByRole('button', { name: 'False Reports (1)', exact: true }); await tab.click(); await expect(tab).toHaveAttribute('aria-pressed', 'true');
  const notice = page.getByRole('region', { name: 'Retained false report' }); await expect(notice).toBeVisible();
  await expect(notice).toContainText('Last recorded incident status: RESPONDING');
  await expect(page.getByRole('button', { name: /mark as resolved|cancel confirmed false/i })).toHaveCount(0);
  expect(await tab.evaluate(element => parseFloat(getComputedStyle(element).height))).toBeGreaterThanOrEqual(44);
  expect((await tab.boundingBox())!.width).toBeGreaterThanOrEqual(width < 600 ? 120 : 140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: info.outputPath(`false-reports-${department}-${width}.png`), fullPage: true, animations: 'disabled' });
  expect(state.writes).toHaveLength(0);
});
test('Main sees a live false classification without receiving department decision controls', async ({ page }) => {
  const { state, emit } = await fixture(page, 'MAIN'); await page.goto('/admin/main-dashboard');
  await page.getByRole('button', { name: 'Responding (1)', exact: true }).click();
  state.decision = 'CONFIRMED'; await emit(); await expect(page.getByRole('button', { name: 'Responding (0)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'False Reports (1)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Retained false report' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark as Resolved' })).toHaveCount(0); expect(state.writes).toHaveLength(0);
});
test('a failed false-view read clears old response rows and offers an explicit retry', async ({ page }) => {
  const { state } = await fixture(page, 'FIRE'); await page.goto('/admin/fire-dashboard');
  await expect(page.getByRole('button', { name: 'Responding (1)', exact: true })).toBeVisible();
  await page.route('**/api/incidents/v1/?*', async route => {
    if (new URL(route.request().url()).searchParams.get('reportView') === 'false-reports') return route.fulfill({ status: 503, json: { message: 'Synthetic list outage' } });
    return route.fallback();
  });
  await page.getByRole('button', { name: 'False Reports (0)', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Report list could not be refreshed' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Department report records', exact: true }).getByRole('heading', { name: 'Synthetic nearby incident for department review', exact: true })).toHaveCount(0);
  await page.unroute('**/api/incidents/v1/?*'); state.decision = 'CONFIRMED';
  await page.getByRole('button', { name: 'Retry report list', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Retained false report' })).toBeVisible(); expect(state.writes).toHaveLength(0);
});
