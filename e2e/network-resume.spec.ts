import { expect, test, type Page } from '@playwright/test';

type BrowserState = {
  __networkTest: { visible: boolean; online: boolean; streams: Array<{ closed: boolean; onerror: (() => void) | null }> };
};

async function setup(page: Page, operations = false) {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'fire-admin', role: 'ADMIN', department: 'FIRE' }));
    const state = { visible: true, online: true, streams: [] as Stream[] };
    Object.defineProperty(document, 'visibilityState', { get: () => state.visible ? 'visible' : 'hidden' });
    Object.defineProperty(navigator, 'onLine', { get: () => state.online });
    class Stream extends EventTarget {
      closed = false;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { super(); state.streams.push(this); setTimeout(() => { if (!this.closed) this.onopen?.(); }, 5); }
      close() { this.closed = true; }
    }
    Object.assign(window, { EventSource: Stream, __networkTest: state });
  });
  let me = 0, attention = 0, failMe = false;
  let heldMe: Promise<void> | null = null;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) {
      me++;
      const pause = heldMe;
      heldMe = null;
      if (pause) await pause;
      if (failMe) return route.abort('failed');
      return route.fulfill({ json: { data: { user: { id: 'fire-admin', name: 'Test Fire Admin', role: 'ADMIN', department: 'FIRE' } } } });
    }
    if (path.endsWith('/attention')) attention++;
    return route.fulfill({ json: { data: { items: [], hasMore: false, scope: 'FIRE', incidents: [], units: [], users: [], resources: [], tasks: [], alerts: [], types: [], barangays: [], pagination: { page: 1, total: 0, totalPages: 1 }, serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 } } } });
  });
  await page.goto(operations ? '/admin/operations' : '/admin/fire-dashboard');
  await expect(page.getByRole('heading', { name: operations ? 'Operations management' : 'Fire Emergency Dashboard', exact: true })).toBeVisible();
  if (!operations) await expect.poll(() => page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams.length)).toBe(1);
  return { me: () => me, attention: () => attention, failMe: (value: boolean) => { failMe = value; },
    holdMe: () => { let release!: () => void; heldMe = new Promise<void>(resolve => { release = resolve; }); return release; } };
}

test('healthy hidden stream stays active, but suspension errors wait for foreground recovery', async ({ page }) => {
  const state = await setup(page);
  await page.waitForTimeout(100);
  const checks = state.me();
  await page.evaluate(() => {
    const state = (window as unknown as BrowserState).__networkTest;
    state.visible = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams[0].closed)).toBe(false);
  await page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams[0].onerror?.());
  await page.waitForTimeout(1200);
  expect(state.me()).toBe(checks);
  expect(await page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams.length)).toBe(1);
  const reads = state.attention();
  await page.evaluate(() => {
    (window as unknown as BrowserState).__networkTest.visible = true;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams.length)).toBe(2);
  await expect.poll(state.attention).toBeGreaterThan(reads);
  expect(await page.evaluate(() => localStorage.getItem('user'))).toContain('fire-admin');
});

test('freeze closes the stream and clustered resume events reconnect only once', async ({ page }) => {
  const state = await setup(page);
  await page.waitForTimeout(100);
  const checks = state.me();
  await page.evaluate(() => {
    document.dispatchEvent(new Event('freeze'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(100);
  expect(state.me()).toBe(checks);
  expect(await page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams[0].closed)).toBe(true);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('resume'));
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(state.me).toBe(checks + 1);
  await expect.poll(() => page.evaluate(() => (window as unknown as BrowserState).__networkTest.streams.length)).toBe(2);
});

test('offline revalidation is deferred and transient me failure keeps the session', async ({ page }) => {
  const state = await setup(page, true);
  await page.waitForTimeout(100);
  const checks = state.me();
  state.failMe(true);
  await page.evaluate(() => {
    (window as unknown as BrowserState).__networkTest.online = false;
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(100);
  expect(state.me()).toBe(checks);
  await page.evaluate(() => {
    (window as unknown as BrowserState).__networkTest.online = true;
    window.dispatchEvent(new Event('online'));
  });
  await expect.poll(state.me).toBe(checks + 2); // One bounded foreground GET retry.
  await expect(page.getByRole('heading', { name: 'Operations management' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('user'))).toContain('fire-admin');
  state.failMe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(state.me).toBe(checks + 3);
});

test('a me request interrupted while hidden is not replayed until the page returns', async ({ page }) => {
  const state = await setup(page, true);
  await page.waitForTimeout(100);
  const checks = state.me();
  const release = state.holdMe();
  state.failMe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(state.me).toBe(checks + 1);
  await page.evaluate(() => {
    (window as unknown as BrowserState).__networkTest.visible = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  release();
  await page.waitForTimeout(200);
  expect(state.me()).toBe(checks + 1);
  expect(await page.evaluate(() => localStorage.getItem('user'))).toContain('fire-admin');
  state.failMe(false);
  await page.evaluate(() => {
    (window as unknown as BrowserState).__networkTest.visible = true;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(state.me).toBe(checks + 2);
  await expect(page.getByRole('heading', { name: 'Operations management' })).toBeVisible();
});
