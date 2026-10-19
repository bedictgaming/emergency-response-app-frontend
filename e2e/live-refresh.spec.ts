import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
type Probe = { emit: (name: string) => void; fail: () => void };
const main = { id: 'live-main', name: 'Synthetic Main', role: 'ADMIN', department: 'MAIN', isMainAdmin: true };
async function fixture(page: Page) {
  await page.addInitScript(user => {
    if (!sessionStorage.getItem('live-fixture')) {
      sessionStorage.setItem('live-fixture', '1');
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('emergency-session-generation', 'original');
    }
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); streams.push(this); setTimeout(() => { if (!this.closed) this.onopen?.(); }, 5); }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: Stream, __live: {
      emit: (name: string) => streams.filter(stream => !stream.closed).forEach(stream => stream.dispatchEvent(new Event(name))),
      fail: () => streams.filter(stream => !stream.closed).forEach(stream => stream.onerror?.()),
    } });
  }, main);
  const state = { status: 'ACTIVE', total: 1, title: 'Tracked report', users: 0, analytics: 0, history: [] as URL[], attention: 0, taskPresent: true, taskStatus: 'PENDING',
    denied: false, current: { ...main } as { id: string; name: string; role: string; department: string | null; isMainAdmin: boolean },
    holdMe: null as null | Promise<void> };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/\/$/, '');
    if (path === '/api/auth/v1/me') {
      const held = state.holdMe; if (held) await held;
      return route.fulfill(state.denied ? { status: 403, json: { message: 'Account inactive' } } : { json: { data: { user: state.current } } });
    }
    if (path === '/api/users/v1') {
      state.users++;
      return route.fulfill({ json: { data: { users: [{ id: 'live-citizen', name: 'Synthetic Citizen', email: 'citizen@example.invalid',
        role: 'USER', status: state.status, createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z', _count: { reportedIncidents: state.total } }] } } });
    }
    if (path === '/api/tasks/v1') return route.fulfill({ json: { data: { tasks: state.taskPresent ? [{ taskId: 'live-task', taskName: 'Tracked task', status: state.taskStatus, incidentId: 'tracked' }] : [] } } });
    if (path === '/api/analytics/v1/dashboard') {
      state.analytics++;
      return route.fulfill({ json: { data: {
        incidentsByBarangay: { totalIncidents: state.total, topArea: null, rankings: [] },
        incidentsByType: { totalIncidents: state.total, topType: null, distribution: [] },
        resolvedSummary: { month: 10, year: 2026, totalReportedThisMonth: state.total, resolvedThisMonth: 0, activeThisMonth: state.total, resolutionRate: 0, totalHistorical: state.total, totalResolvedAllTime: 0 },
      } } });
    }
    if (path === '/api/incidents/v1') {
      const historical = url.searchParams.get('limit') === '50';
      if (historical) state.history.push(url);
      return route.fulfill({ json: { data: { incidents: historical ? [{ incidentId: 'tracked', title: state.title, description: 'Synthetic record', status: 'RESPONDING', severityLevel: 'MEDIUM',
        reportedAt: '2026-10-18T00:00:00Z', type: { typeName: 'Fire' }, location: {}, barangay: null, incidentUnits: [] }] : [],
        pagination: { page: 1, pages: 1, total: historical ? 1 : 0, limit: historical ? 50 : 5 }, summary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 } } } });
    }
    if (path.includes('/attention')) state.attention++;
    return route.fulfill({ json: { data: { enabled: false, items: [], hasMore: false, observedAt: new Date().toISOString(),
      barangays: [], types: [], flags: [], pagination: { page: 1, pages: 0, total: 0, limit: 20 } } } });
  });
  return state;
}
const emit = (page: Page, name: string) => page.evaluate(name => (window as typeof window & { __live: Probe }).__live.emit(name), name);
const fail = (page: Page) => page.evaluate(() => (window as typeof window & { __live: Probe }).__live.fail());

test('Users updates accepted-report counts and deactivation/reactivation without manual refresh', async ({ page }, info) => {
  const state = await fixture(page); await page.goto('/admin/users');
  const row = page.getByRole('row').filter({ hasText: 'Synthetic Citizen' });
  await expect(row.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
  await page.getByLabel('Search user accounts').fill('Synthetic');
  state.status = 'INACTIVE'; state.total = 3; await emit(page, 'incident.created');
  await expect(row.getByRole('button', { name: 'Activate', exact: true })).toBeVisible();
  const reads = state.users, attention = state.attention;
  state.status = 'ACTIVE';
  await page.evaluate(() => { for (let i = 0; i < 30; i++) (window as typeof window & { __live: Probe }).__live.emit('users.changed'); });
  await expect(row.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
  expect(state.users - reads).toBeLessThanOrEqual(2);
  expect(state.attention).toBe(attention); // Account changes do not check/sound the siren.
  await expect(page.getByLabel('Search user accounts')).toHaveValue('Synthetic');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`users-live-${width}.png`) });
  }
});

test('analytics reacts to a committed incident event, not the 30-second fallback', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/analytics');
  await expect(page.getByText('1 total incidents', { exact: true })).toBeVisible();
  state.total = 31; await emit(page, 'incident.updated');
  await expect(page.getByText('31 total incidents', { exact: true })).toBeVisible();
});

test('operations updates tasks live without overwriting an unsaved editor or search', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/operations');
  await expect(page.getByText('Tracked task', { exact: true })).toBeVisible();
  await page.getByLabel('Search records').fill('Tracked');
  await page.getByLabel('Edit Tracked task', { exact: true }).click();
  await page.getByLabel('Task name', { exact: true }).fill('Unsaved work');
  state.taskStatus = 'IN_PROGRESS'; await emit(page, 'task.updated');
  await expect(page.getByRole('button', { name: 'Mark done', exact: true })).toBeVisible();
  await expect(page.getByLabel('Task name', { exact: true })).toHaveValue('Unsaved work');
  state.taskPresent = false; await emit(page, 'incident.updated');
  await expect(page.getByText('Tracked task', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Task name', { exact: true })).toHaveValue('Unsaved work');
  await expect(page.getByLabel('Search records')).toHaveValue('Tracked');
});

for (const surface of ['page', 'drawer'] as const) test(`${surface} history refreshes live without losing search/status/period`, async ({ page }) => {
  const state = await fixture(page); await page.goto(surface === 'page' ? '/admin/barangay-history' : '/admin/main-dashboard');
  if (surface === 'drawer') await page.getByRole('button', { name: 'Barangay History Log', exact: true }).click();
  const scope = surface === 'drawer' ? page.getByRole('dialog', { name: 'Barangay Incident History Log' }) : page.locator('body');
  await expect(scope.getByText('Tracked report', { exact: true })).toBeVisible();
  await scope.getByLabel('Search incident history', { exact: true }).fill('Tracked');
  if (surface === 'page') {
    await page.getByLabel('Filter history by status').selectOption('RESPONDING');
    await page.getByLabel('Filter history by reporting period').selectOption('THIS_MONTH');
  }
  const search = scope.getByLabel('Search incident history', { exact: true });
  await search.focus();
  state.title = 'Tracked live update'; await emit(page, 'incident.updated');
  await expect(scope.getByText('Tracked live update', { exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  expect(state.history.at(-1)?.searchParams.get('search')).toBe('Tracked');
  if (surface === 'page') {
    expect(state.history.at(-1)?.searchParams.get('status')).toBe('RESPONDING');
    expect(state.history.at(-1)?.searchParams.get('period')).toBe('THIS_MONTH');
  }
});

test('server deactivation closes the matching dashboard immediately on failed stream reauthorization', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/users');
  await expect(page.getByText('Synthetic Citizen', { exact: true })).toBeVisible();
  state.denied = true; await fail(page);
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('emergency-session-generation'))).toBeNull();
});

for (const kind of ['same-account', 'other-account'] as const) test(`late forbidden stream check cannot clear a newer ${kind} session`, async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/users');
  await expect(page.getByText('Synthetic Citizen', { exact: true })).toBeVisible();
  let release!: () => void;
  state.holdMe = new Promise<void>(resolve => { release = resolve; });
  state.denied = true;
  const pending = page.waitForRequest(request => new URL(request.url()).pathname === '/api/auth/v1/me');
  await fail(page); await pending;
  await page.evaluate(kind => {
    localStorage.setItem('emergency-session-generation', 'newer');
    if (kind === 'other-account') localStorage.setItem('user', JSON.stringify({ id: 'new-user', role: 'USER' }));
  }, kind);
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/v1/me' && response.status() === 403);
  release(); await checked;
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => localStorage.getItem('emergency-session-generation'))).toBe('newer');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user')!).id)).toBe(kind === 'other-account' ? 'new-user' : main.id);
  await expect(page).toHaveURL(/\/admin\/users$/);
});

test('a server-confirmed department change navigates to the newly authorized dashboard', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/users');
  await expect(page.getByText('Synthetic Citizen', { exact: true })).toBeVisible();
  state.current = { ...main, department: 'MEDICAL', isMainAdmin: false }; await fail(page);
  await expect(page).toHaveURL(/\/admin\/medical-dashboard$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user')!).department)).toBe('MEDICAL');
});

test('a stream reauthorization check cannot silently adopt a different server account', async ({ page }) => {
  const state = await fixture(page); await page.goto('/admin/users');
  await expect(page.getByText('Synthetic Citizen', { exact: true })).toBeVisible();
  state.current = { ...main, id: 'different-account' };
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/v1/me');
  await fail(page); await checked; await page.waitForTimeout(200);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('user')!).id)).toBe(main.id);
  expect(await page.evaluate(() => localStorage.getItem('emergency-session-generation'))).toBe('original');
  await expect(page).toHaveURL(/\/admin\/users$/);
});

test('citizen reconnect treats omitted and null department as the same assignment without reloading', async ({ page }) => {
  const state = await fixture(page);
  state.current = { ...main, role: 'USER', department: null, isMainAdmin: false };
  await page.addInitScript(() => localStorage.setItem('user', JSON.stringify({ id: 'live-main', role: 'USER' })));
  await page.goto('/dashboard');
  await expect(page.getByText('Choose emergency type', { exact: true })).toBeVisible();
  let reloads = 0;
  // Next also emits same-document history navigation during hydration; count
  // actual document requests to detect the forbidden hard reload.
  page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') reloads++; });
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/v1/me');
  await fail(page); await checked; await page.waitForTimeout(200);
  expect(reloads).toBe(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});
