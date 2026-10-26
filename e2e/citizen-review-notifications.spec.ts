import { expect, test, type Page } from '@playwright/test';
import { installSyntheticEventStream } from './helpers/synthetic-event-stream';
test.use({ serviceWorkers: 'block' });
const incidentId = '10000000-0000-4000-8000-000000000001';
const flagId = '20000000-0000-4000-8000-000000000002';
const userId = '30000000-0000-4000-8000-000000000003';
const bell = (page: Page) => page.getByRole('button', { name: 'Report notifications', exact: true });
const panel = (page: Page) => page.getByRole('dialog', { name: 'Notifications', exact: true });
async function fixture(page: Page, options: { empty?: boolean; theme?: string; blockedStorage?: boolean } = {}) {
  const transport = await installSyntheticEventStream(page, 'synthetic-notifications');
  const user = { id: userId, name: 'Synthetic citizen', role: 'USER', status: 'ACTIVE', department: null, isMainAdmin: false };
  const state = { user, items: options.empty ? [] : [{ id: flagId, incidentId, reportTitle: 'Synthetic own report <script>plain text only</script>',
    department: 'FIRE', status: 'PENDING', updatedAt: '2026-10-23T00:00:00.000Z' }],
    error: false, detailError: false, wrongOwner: false, hold: false, hasMore: false,
    get joined() { return transport.state.joined; }, get connections() { return transport.state.connections; },
    reads: 0, details: 0, writes: 0, peers: transport.state.peers, release: (() => {}) as () => void };
  await page.addInitScript(({ user, theme, blockedStorage }) => {
    if (!localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('emergency-response-theme', theme || 'light');
    if (blockedStorage) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key.startsWith('citizen-review-read:')) throw new Error('Synthetic storage full'); original.call(this, key, value); };
    }
  }, { user, theme: options.theme, blockedStorage: options.blockedStorage });
  await page.route(/https:\/\/.*tile.*\//, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e5e7eb"/></svg>' }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, '');
    if (route.request().method() !== 'GET') { state.writes++; return route.fulfill({ status: 403, json: { message: 'Synthetic writes blocked' } }); }
    if (path.endsWith('/auth/v1/me')) return route.fulfill({ json: { data: { user: state.user } } });
    if (path.endsWith('/notifications/v1/report-reviews')) {
      state.reads++; const snapshot = JSON.parse(JSON.stringify(state.items));
      if (state.hold) await new Promise<void>(resolve => { state.release = resolve; });
      return route.fulfill(state.error ? { status: 503, json: { message: 'Synthetic temporary outage' } } : { json: { data: { items: snapshot, limit: 50, hasMore: state.hasMore } } });
    }
    if (path === `/api/incidents/v1/${incidentId}`) {
      state.details++;
      return route.fulfill(state.detailError ? { status: 404, json: { message: 'Unavailable' } } : { json: { data: { incident: {
        incidentId, title: 'Synthetic authorized report detail', description: 'OWN SYNTHETIC DESCRIPTION [Contact: 09000000000]',
        reportedBy: state.wrongOwner ? 'another-account' : userId, status: 'RESPONDING', verificationStatus: 'VERIFIED', requestedServices: ['FIRE'],
        reportedAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z', type: { typeName: 'Fire Outbreak' },
        location: { locationName: 'Synthetic location' }, attachments: [],
      } } } });
    }
    if (path === '/api/incidents/v1') return route.fulfill({ json: { data: { incidents: [] } } });
    return route.fulfill({ json: { data: { enabled: false, items: [], alerts: [], complete: true, nearby: false, radiusMeters: 100 } } });
  });
  return { state, emit: async () => {
    await transport.emit('incident.updated', { entityId: incidentId });
  } };
}
for (const [width, theme] of [[1280, 'light'], [375, 'dark'], [1280, 'dark'], [375, 'light']] as const) test(`private review bell, actions and readable layout at ${width}px ${theme}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); const { state } = await fixture(page, { theme });
  await page.goto('/dashboard'); await expect(bell(page)).toContainText('1 unread review updates');
  await bell(page).click(); const content = panel(page);
  await expect(content).toContainText('Fire · Report flagged for review');
  await expect(content).toContainText('A flag alone is not a confirmed false report or a violation');
  await expect(content).toContainText('<script>plain text only</script>');
  await expect(content.getByText(/Welcome|system update|reminder/i)).toHaveCount(0);
  await expect(content).toHaveCSS('opacity', '1'); await expect(content.locator('li').first()).toHaveCSS('opacity', '1');
  for (const control of [content.getByRole('button', { name: 'Mark all as read', exact: true }), content.getByRole('button', { name: /^View report:/ }), content.getByRole('button', { name: 'Close notifications', exact: true })]) {
    const box = await control.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await content.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width); expect(box!.y + box!.height).toBeLessThanOrEqual(850);
  expect(box!.width).toBeLessThanOrEqual(320); expect(box!.height).toBeLessThanOrEqual(400);
  expect((await bell(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // The incumbent rounded-xl token resolves to the14px card radius.
  await expect(bell(page)).toHaveCSS('border-radius', '14px'); await expect(bell(page).locator('svg')).toHaveAttribute('width', '16');
  await expect(content.locator('time')).toHaveAttribute('aria-label', /Manila/);
  await expect(content.locator('[data-notification-unread-dot]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(content.getByRole('button', { name: /^Mark as read:/ })).toHaveAccessibleName(/Synthetic own report/);
  await expect(content.getByRole('button', { name: /^View report:/ })).toHaveAccessibleName(/Synthetic own report/);
  // Composite translucent colors over white: the darkest-reference panel's
  // worst contrast substrate, rather than ignoring the reference's alpha.
  const ratios = await content.evaluate(element => {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
    const rgba = (color: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data); };
    const over = (color: number[], background: number[]) => color.slice(0, 3).map((channel, i) => channel * color[3] / 255 + background[i] * (1 - color[3] / 255));
    const luminance = (color: number[]) => color.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (color: string, background: number[]) => { const x = luminance(over(rgba(color), background)), y = luminance(background); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const unread = element.querySelector('li > div > span')!, badge = document.querySelector('button[aria-label="Report notifications"] span[aria-hidden]')!;
    const style = getComputedStyle(badge);
    const background = over(rgba(getComputedStyle(element).backgroundColor), [255, 255, 255]);
    return [contrast(getComputedStyle(unread).color, background), contrast(style.color, over(rgba(style.backgroundColor), [255, 255, 255])),
      contrast(getComputedStyle(element.querySelector('time')!).color, background)];
  });
  ratios.forEach(value => expect(value).toBeGreaterThanOrEqual(4.5));
  await content.screenshot({ path: info.outputPath(`citizen-review-${width}-${theme}.png`), animations: 'disabled' });
  await page.screenshot({ path: info.outputPath(`citizen-review-header-${width}-${theme}.png`), animations: 'disabled' });
  await content.getByRole('button', { name: /^Mark as read:/ }).click(); await expect(bell(page)).toContainText('0 unread review updates');
  await page.keyboard.press('Escape'); await expect(content).toHaveCount(0); await expect(bell(page)).toBeFocused();
  await page.reload(); await expect(bell(page)).toContainText('0 unread review updates'); await bell(page).click();
  await expect(panel(page).getByRole('button', { name: /^Read:/ })).toBeDisabled();
  expect(state.writes).toBe(0);
});
test('committed live hint refreshes latest assessment without page reload or false strike claims', async ({ page }) => {
  const { state, emit } = await fixture(page, { empty: true }); await page.goto('/dashboard'); await bell(page).click();
  await expect(panel(page)).toContainText('No report review notifications.'); await page.keyboard.press('Escape');
  state.items = [{ id: flagId, incidentId, reportTitle: 'Synthetic own report', department: 'MEDICAL', status: 'PENDING', updatedAt: '2026-10-23T01:00:00.000Z' }];
  await emit(); await expect(bell(page)).toContainText('1 unread review updates'); await bell(page).click();
  await panel(page).getByRole('button', { name: /^Mark as read:/ }).click();
  state.items[0].status = 'CONFIRMED'; state.items[0].updatedAt = '2026-10-23T02:00:00.000Z'; await emit();
  await expect(panel(page)).toContainText('Department assessment recorded'); await expect(panel(page)).toContainText('Any violation or sanction follows the report-review rules');
  await expect(bell(page)).toContainText('1 unread review updates');
  state.items[0].status = 'DISMISSED'; state.items[0].updatedAt = '2026-10-23T03:00:00.000Z'; await emit();
  await expect(panel(page)).toContainText('Suspicion dismissed'); await expect(panel(page)).toContainText('does not automatically reopen'); expect(state.writes).toBe(0);
});

for (const department of ['FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) test(`${department}: a first flag updates the closed bell over the selected authenticated transport without refresh`, async ({ page }) => {
  const { state, emit } = await fixture(page, { empty: true });
  let navigations = 0; page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto('/dashboard'); await expect(bell(page)).toContainText('0 unread review updates');
  // Wait for the initial load AND namespace-open refresh before changing data.
  await expect.poll(() => state.joined).toBe(true); await expect.poll(() => state.reads).toBeGreaterThanOrEqual(2);
  const reads = state.reads, loadedNavigation = navigations;
  state.items = [{ id: flagId, incidentId, reportTitle: 'Synthetic newly flagged own report', department, status: 'PENDING', updatedAt: '2026-10-25T00:00:00.000Z' }];
  await emit();
  // Five seconds cannot be satisfied by the 30-second recovery interval.
  await expect(bell(page)).toContainText('1 unread review updates', { timeout: 5000 });
  expect(state.reads).toBeGreaterThan(reads); expect(navigations).toBe(loadedNavigation);
  await expect(panel(page)).toHaveCount(0); // Never auto-open an emergency popup.
  await bell(page).click(); await expect(panel(page)).toContainText('Report flagged for review');
  await expect(panel(page)).toContainText('Synthetic newly flagged own report'); expect(state.writes).toBe(0);
});

test('reconnect automatically catches a saved flag while the citizen was offline without reloading', async ({ page, context }) => {
  const { state } = await fixture(page, { empty: true });
  let navigations = 0; page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto('/dashboard'); await expect.poll(() => state.joined).toBe(true);
  await expect.poll(() => state.reads).toBeGreaterThanOrEqual(2);
  const loadedNavigation = navigations;
  await context.setOffline(true); await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  state.items = [{ id: flagId, incidentId, reportTitle: 'Synthetic flag saved while disconnected', department: 'FIRE', status: 'PENDING', updatedAt: '2026-10-25T01:00:00.000Z' }];
  const connections = state.connections;
  await context.setOffline(false);
  await expect.poll(() => state.connections).toBeGreaterThan(connections);
  await expect(bell(page)).toContainText('1 unread review updates', { timeout: 5000 });
  expect(navigations).toBe(loadedNavigation); expect(state.writes).toBe(0);
});
test('View report fetches authorized current detail inside system, never starts or deletes reports', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/dashboard'); await bell(page).click();
  await panel(page).getByRole('button', { name: /^View report:/ }).click();
  const detail = page.getByRole('dialog', { name: 'Your reported emergency', exact: true });
  await expect(detail).toContainText('OWN SYNTHETIC DESCRIPTION'); await expect(detail).toContainText('09000000000');
  await expect(detail.getByRole('button', { name: /flag|acknowledge|start response|delete/i })).toHaveCount(0);
  expect(state.details).toBe(1); expect(page.context().pages()).toHaveLength(1); expect(state.writes).toBe(0);
});
test('wrong-owner and unavailable details stay private and can be retried safely', async ({ page }) => {
  const { state } = await fixture(page); state.wrongOwner = true; await page.goto('/dashboard'); await bell(page).click();
  await panel(page).getByRole('button', { name: /^View report:/ }).click();
  const detail = page.getByRole('dialog', { name: 'Your reported emergency', exact: true });
  await expect(detail).toContainText('no longer available'); await expect(detail).not.toContainText('OWN SYNTHETIC DESCRIPTION');
  state.wrongOwner = false; state.detailError = true; await detail.getByRole('button', { name: 'Retry report' }).click();
  await expect.poll(() => state.details).toBe(2); await expect(detail).not.toContainText('OWN SYNTHETIC DESCRIPTION');
  state.detailError = false; await detail.getByRole('button', { name: 'Retry report' }).click(); await expect(detail).toContainText('OWN SYNTHETIC DESCRIPTION');
});
test('feed errors are visible, retry recovers, read storage failure never claims persistence', async ({ page }) => {
  const { state } = await fixture(page, { blockedStorage: true }); state.error = true; await page.goto('/dashboard'); await bell(page).click();
  await expect(panel(page)).toContainText('Review updates could not be refreshed');
  state.error = false; state.hasMore = true; await panel(page).getByRole('button', { name: 'Retry notifications' }).click();
  await expect(panel(page)).toContainText('latest 50');
  await panel(page).getByRole('button', { name: /^Mark as read:/ }).click(); await expect(panel(page)).toContainText('could not be saved in this browser');
  await expect(bell(page)).toContainText('0 unread review updates'); await page.reload(); await expect(bell(page)).toContainText('1 unread review updates');
});
test('account switch clears an open feed and rejects a pending previous-account read', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/dashboard'); await bell(page).click(); await expect(panel(page)).toContainText('Report flagged for review');
  state.hold = true; const previous = state.reads; await page.keyboard.press('Escape'); await bell(page).click(); await expect.poll(() => state.reads).toBeGreaterThan(previous);
  await page.evaluate(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'another-account', role: 'USER' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }));
  });
  state.release(); await expect(panel(page)).toHaveCount(0); await expect(bell(page)).toContainText('0 unread review updates');
  await bell(page).click(); await expect(panel(page)).toHaveCount(0); expect(state.writes).toBe(0);
});
test('read receipts belong only to their account and logout clears loaded report detail', async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/dashboard'); await bell(page).click();
  await panel(page).getByRole('button', { name: /^Mark as read:/ }).click();
  state.user = { ...state.user, id: '40000000-0000-4000-8000-000000000004' };
  await page.evaluate(user => localStorage.setItem('user', JSON.stringify(user)), state.user);
  await page.reload(); await expect(bell(page)).toContainText('1 unread review updates');
  state.user = { ...state.user, id: userId };
  await page.evaluate(user => localStorage.setItem('user', JSON.stringify(user)), state.user);
  await page.reload(); await expect(bell(page)).toContainText('0 unread review updates'); await bell(page).click();
  await panel(page).getByRole('button', { name: /^View report:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Your reported emergency' })).toContainText('OWN SYNTHETIC DESCRIPTION');
  await page.evaluate(() => {
    localStorage.removeItem('user'); localStorage.setItem('emergency-logout-epoch', 'synthetic-logout');
    window.dispatchEvent(new StorageEvent('storage', { key: 'emergency-logout-epoch' }));
  });
  await expect(page.getByRole('dialog', { name: 'Your reported emergency' })).toHaveCount(0);
  await expect(page.getByText('OWN SYNTHETIC DESCRIPTION', { exact: false })).toHaveCount(0); expect(state.writes).toBe(0);
});
test('long current feed scrolls within a short mobile viewport with close and footer visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); const { state } = await fixture(page);
  state.items = Array.from({ length: 50 }, (_, n) => ({ ...state.items[0], id: `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`, reportTitle: `Synthetic report ${n}: ${'Long report text '.repeat(12)}` }));
  await page.goto('/dashboard'); await expect(bell(page)).toContainText('50 unread review updates'); await bell(page).click(); const content = panel(page);
  const close = await content.getByRole('button', { name: 'Close notifications' }).boundingBox();
  const footer = await content.getByRole('status').boundingBox();
  expect(close!.y).toBeGreaterThanOrEqual(0); expect(footer!.y + footer!.height).toBeLessThanOrEqual(667);
  const scroll = content.locator('ul').locator('..');
  expect(await scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(content.getByText(/^Synthetic report 49:/)).toBeVisible();
  await content.getByRole('button', { name: 'Close notifications' }).click(); await expect(content).toHaveCount(0);
  expect(state.writes).toBe(0);
});

test('mark all displayed notifications persists one batch and a new live version becomes unread again', async ({ page }) => {
  const { state, emit } = await fixture(page);
  state.items = Array.from({ length: 3 }, (_, n) => ({ ...state.items[0], id: `20000000-0000-4000-8000-${String(n).padStart(12, '0')}` }));
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Object.assign(window, { __reviewReadWrites: 0 });
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('citizen-review-read:')) (window as typeof window & { __reviewReadWrites: number }).__reviewReadWrites++;
      original.call(this, key, value);
    };
  });
  await page.goto('/dashboard'); await expect(bell(page)).toContainText('3 unread review updates'); await bell(page).click();
  await panel(page).getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(bell(page)).toContainText('0 unread review updates');
  expect(await page.evaluate(() => (window as typeof window & { __reviewReadWrites: number }).__reviewReadWrites)).toBe(1);
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem(`citizen-review-read:v1:${id}`)!).length, userId)).toBe(3);
  await expect(panel(page).getByRole('button', { name: 'Mark all as read', exact: true })).toBeDisabled();
  state.items[0].updatedAt = '2026-10-25T02:00:00.000Z'; state.items[0].status = 'DISMISSED'; await emit();
  await expect(bell(page)).toContainText('1 unread review updates');
  await expect(panel(page)).toContainText('Suspicion dismissed');
  await page.reload(); await expect(bell(page)).toContainText('1 unread review updates'); expect(state.writes).toBe(0);
});

test('mark all cannot save another account boundary and storage failures remain explicit', async ({ page }) => {
  const { state } = await fixture(page, { blockedStorage: true });
  await page.goto('/dashboard'); await bell(page).click();
  await panel(page).getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(panel(page)).toContainText('could not be saved in this browser');
  await expect(bell(page)).toContainText('0 unread review updates');
  await page.reload(); await expect(bell(page)).toContainText('1 unread review updates'); await bell(page).click();
  await panel(page).getByRole('button', { name: 'Mark all as read', exact: true }).evaluate(element => {
    localStorage.setItem('user', JSON.stringify({ id: 'another-account', role: 'USER' }));
    (element as HTMLButtonElement).click();
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }));
  });
  await expect(panel(page)).toHaveCount(0);
  expect(await page.evaluate(id => localStorage.getItem(`citizen-review-read:v1:${id}`), userId)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('citizen-review-read:v1:another-account'))).toBeNull(); expect(state.writes).toBe(0);
});

for (const key of ['user', 'emergency-session-generation']) test(`${key} boundary removes private notification text without waiting for an exit animation`, async ({ page }) => {
  const { state } = await fixture(page); await page.goto('/dashboard'); await bell(page).click();
  await expect(panel(page)).toContainText('Synthetic own report <script>plain text only</script>');
  await expect(panel(page)).toHaveCSS('opacity', '1');
  // Freeze beyond the next React frame, not long enough to finish a200ms exit.
  await page.clock.install();
  await page.evaluate(key => {
    if (key === 'user') localStorage.setItem('user', JSON.stringify({ id: 'another-account', role: 'USER' }));
    else localStorage.setItem(key, 'synthetic-renewed-session');
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, key);
  await page.clock.runFor(16);
  expect(await page.getByText('Synthetic own report <script>plain text only</script>', { exact: true }).count()).toBe(0);
  expect(state.writes).toBe(0);
});
