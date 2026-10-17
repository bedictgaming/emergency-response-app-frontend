import { expect, test, type Page } from '@playwright/test';
type Item = { incidentId: string; title: string; version: number; scope: string; reportedAt: string; status: string };
const make = (index: number, version = 1): Item => ({ incidentId: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`, title: `Outstanding report ${index}`, version, scope: 'FIRE', reportedAt: '2026-09-29T00:00:00.000Z', status: 'RESPONDING' });
const fresh = (index: number): Item => ({ ...make(index), reportedAt: '2026-10-17T00:00:01.000Z' });
async function setup(page: Page, initial: Item[], more = false, department = 'FIRE') {
  const scope = department === 'DRRMO' ? 'HAZARD' : department;
  let items = initial.map(item => ({ ...item, scope })), hasMore = more, failures = false, ackFailure = false;
  let heldRead: Promise<void> | null = null, heldCount = 0;
  const acknowledgements: unknown[] = [];
  await page.addInitScript(department => {
    localStorage.setItem('user', JSON.stringify({ id: 'queue-admin', role: 'ADMIN', department, isMainAdmin: department === 'MAIN' }));
    class Stream extends EventTarget {
      static all: Stream[] = []; onopen: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor() { super(); Stream.all.push(this); setTimeout(() => this.onopen?.(), 5); }
      close() {};
    }
    Object.assign(window, { EventSource: Stream, __testStreams: Stream.all });
  }, department);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user: { id: 'queue-admin', name: 'Test Queue Admin', role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN' } } } });
    if (path.endsWith('/incidents/v1/attention')) {
      const snapshot = { items, hasMore, scope, acknowledgementMode: department === 'MAIN' ? 'DEPARTMENT_HANDOFF' : 'PERSONAL', observedAt: '2026-10-17T00:00:00.000Z' }, pause = heldRead; heldRead = null;
      if (pause) { heldCount++; await pause; }
      return route.fulfill({ status: failures ? 503 : 200, json: failures ? { message: 'Unavailable' } : { data: snapshot } });
    }
    if (path.endsWith('/attention/acknowledge')) {
      acknowledgements.push({ url: path, body: route.request().postDataJSON() });
      if (ackFailure) return route.fulfill({ status: 503, json: { message: 'Unavailable' } });
      const id = path.split('/')[4], body = route.request().postDataJSON();
      items = items.filter(item => item.incidentId !== id || item.version !== body.version);
      return route.fulfill({ json: { message: 'Acknowledged' } });
    }
    return route.fulfill({ json: { data: { incidents: [], pagination: { page: 1, total: 0, totalPages: 1 }, users: [], units: [], alerts: [], types: [], barangays: [], serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 } } } });
  });
  await page.goto(`/admin/${department === 'DRRMO' ? 'drrmo' : department.toLowerCase()}-dashboard`);
  return { set: (next: Item[], remaining = false) => { items = next.map(item => ({ ...item, scope })); hasMore = remaining; }, failure: (value: boolean) => { failures = value; }, ackFailure: (value: boolean) => { ackFailure = value; }, acknowledgements,
    held: () => heldCount, holdNext: () => { let release!: () => void; heldRead = new Promise<void>(resolve => { release = resolve; }); return release; } };
}
async function refresh(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); }
async function openQueue(page: Page, count: number, more = false) {
  await page.getByRole('button', { name: `Outstanding alerts: ${count}${more ? '+' : ''}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('outage recovery cannot carry old playback into the next report siren', async ({ page }) => {
  const state = await setup(page, []);
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  state.set([fresh(1)]); await refresh(page);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  state.failure(true); await refresh(page);
  await expect(page.getByRole('dialog')).toContainText('Alert queue unavailable');
  state.failure(false); await refresh(page);
  await expect(page.getByRole('dialog')).not.toContainText('Alert queue unavailable');
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  state.set([fresh(1), fresh(2)]); await refresh(page);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  state.set([fresh(1)]); await refresh(page);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
});
test('finishing an audible report stops its siren even when other muted work remains', async ({ page }) => {
  const state = await setup(page, [make(1)]);
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 1', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Any ordinary dashboard interaction arms audio without unmuting retained work.
  await page.getByRole('button', { name: 'Outstanding alerts: 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enable sound', exact: true })).toHaveCount(0);
  // The first item stays muted, but a genuinely new item can still sound.
  state.set([make(1), fresh(2)]); await refresh(page);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  state.set([make(1)]); await refresh(page);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('Outstanding report 1');
});

for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department}: old work, refresh and reload stay quiet; only a new report triggers the siren`, async ({ page }) => {
    const state = await setup(page, [make(1)], false, department);
    await expect(page.getByRole('button', { name: 'Outstanding alerts: 1', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Ordinary interaction can arm audio but cannot sound the baseline.
    await page.getByRole('heading', { level: 1 }).click();
    await refresh(page);
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
    state.set([make(1), make(51)]); await refresh(page);
    await expect(page.getByRole('button', { name: 'Outstanding alerts: 2', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // A new submission, not old queue pagination or a status update, alarms.
    state.set([make(1), make(51), fresh(90)]); await refresh(page);
    await expect(page.getByRole('dialog')).toContainText('Outstanding report 90');
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
    await refresh(page);
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
    // Even a previously new, still outstanding report is quiet on reload.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Outstanding alerts: 3', exact: true })).toBeVisible();
    await page.getByRole('heading', { level: 1 }).click();
    await refresh(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
    state.set([make(1), make(51), fresh(90), fresh(91)]); await refresh(page);
    await expect(page.getByRole('dialog')).toContainText('Outstanding report 91');
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    expect(state.acknowledgements).toEqual([]);
  });
}
test('startup/backlog and twelve simultaneous reports remain individually visible; one acknowledgement does not clear all', async ({ page }, testInfo) => {
  const state = await setup(page, Array.from({ length: 12 }, (_, index) => make(index + 1)));
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 12', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openQueue(page, 12);
  await expect(page.getByLabel('Choose a report to review').locator('option')).toHaveCount(12);
  await expect(page.getByRole('dialog')).toContainText('before you opened');
  await page.screenshot({ path: testInfo.outputPath('outstanding-desktop.png') });
  await page.getByRole('button', { name: 'Acknowledge this report', exact: true }).click();
  await expect(page.getByLabel('Choose a report to review').locator('option')).toHaveCount(11);
  expect(state.acknowledgements).toHaveLength(1);
  expect(state.acknowledgements[0]).toMatchObject({ body: { version: 1, responseService: 'FIRE' } });
});
test('resolved work disappears and a reopened version returns quietly without pretending to be a new submission', async ({ page }) => {
  const state = await setup(page, [make(1)]);
  await openQueue(page, 1); state.set([]); await refresh(page);
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  state.set([make(1, 2)]); await refresh(page);
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 1', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await openQueue(page, 1); await expect(page.getByRole('dialog')).toContainText('Outstanding report 1');
});
test('reconnecting triggers catch-up and header/list share one stream', async ({ page }) => {
  const state = await setup(page, []);
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __testStreams: unknown[] }).__testStreams.length)).toBe(1);
  state.set([fresh(2)]);
  await page.evaluate(() => { const streams = (window as unknown as { __testStreams: Array<{ onopen: () => void }> }).__testStreams; streams[0].onopen(); });
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('failed acknowledgement and queue outage never claim that work was cleared', async ({ page }) => {
  const state = await setup(page, [make(1)]); await openQueue(page, 1);
  state.ackFailure(true); await page.getByRole('button', { name: 'Acknowledge this report', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Outstanding report 1');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Acknowledgement not confirmed');
  state.failure(true); await refresh(page); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('may be out of date');
  state.failure(false); state.ackFailure(false); await refresh(page); await expect(page.getByRole('button', { name: 'Acknowledge this report', exact: true })).toBeEnabled();
});
test('an in-flight old snapshot cannot resurrect an acknowledged alert', async ({ page }) => {
  const state = await setup(page, [make(1)]); await openQueue(page, 1);
  // Wait for initial connection catch-up before holding the next read.
  await page.waitForTimeout(100);
  const release = state.holdNext(); await refresh(page); await expect.poll(state.held).toBe(1);
  await page.getByRole('button', { name: 'Acknowledge this report', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); release();
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  await refresh(page); await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('an event during a running read schedules another read instead of being dropped', async ({ page }) => {
  const state = await setup(page, []); await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  const release = state.holdNext(); await refresh(page); await expect.poll(state.held).toBe(1);
  state.set([fresh(7)]); await refresh(page); release(); await expect(page.getByRole('dialog')).toContainText('Outstanding report 7');
});
test('fifty-item bounded queue explicitly retains more server-side work; mobile dialog and keyboard stay usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await setup(page, Array.from({ length: 50 }, (_, index) => make(index + 1)), true);
  await openQueue(page, 50, true);
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible(); await expect(dialog).toContainText('More reports remain');
  await expect(page.getByLabel('Choose a report to review').locator('option')).toHaveCount(50);
  await expect(dialog).toHaveJSProperty('scrollWidth', 375);
  await page.screenshot({ path: testInfo.outputPath('outstanding-mobile.png') });
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Outstanding alerts: 50+', exact: true }).click(); await expect(dialog).toBeVisible();
});
