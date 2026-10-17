import { expect, test, type Page } from '@playwright/test';

type Permission = 'default' | 'granted' | 'denied';
type Options = { department?: string; permission?: Permission; answer?: Permission; rejectsPrompt?: boolean; offline?: boolean; unauthorized?: boolean; disabled?: string; rejectRegistration?: boolean; holdRegistration?: boolean };
const warning = 'Background notifications could not register. Check browser site permissions and keep the dashboard open.';
type Calls = { prompts: number; subscriptions: number; displays: number; unsubscribes: number };
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __pushTest: Calls }).__pushTest);
async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function noControls(page: Page) {
  await expect(page.locator('[data-admin-push]')).toHaveCount(0);
  for (const name of ['Enable notifications', 'Check notification setup', 'Show device test']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('Background notifications', { exact: true })).toHaveCount(0);
}
async function setup(page: Page, options: Options = {}) {
  const department = options.department ?? 'MAIN';
  let keys = 0, registrations = 0, deletions = 0;
  const warnings: string[] = [];
  page.on('console', message => { if (message.type() === 'warning' && message.text() === warning) warnings.push(message.text()); });
  let releaseRegistration = () => {};
  const gate = new Promise<void>(resolve => { releaseRegistration = resolve; });
  await page.addInitScript(({ department, permission, answer, rejectsPrompt, offline }) => {
    localStorage.setItem('user', JSON.stringify({ id: 'push-admin', role: 'ADMIN', department, isMainAdmin: department === 'MAIN' }));
    const tracked = { prompts: 0, subscriptions: 0, displays: 0, unsubscribes: 0 };
    const notification = { permission, requestPermission: async () => {
      tracked.prompts++;
      if (rejectsPrompt) throw new DOMException('Synthetic browser prompt refusal', 'NotAllowedError');
      notification.permission = answer; return answer;
    } };
    let subscribed = false, online = !offline;
    const subscription = {
      toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/synthetic-browser-test', keys: { p256dh: 'synthetic', auth: 'synthetic' } }),
      unsubscribe: async () => { tracked.unsubscribes++; subscribed = false; return true; },
    };
    const worker = { update: async () => {}, pushManager: {
      getSubscription: async () => subscribed ? subscription : null,
      subscribe: async () => { tracked.subscriptions++; subscribed = true; return subscription; },
    }, showNotification: async () => { tracked.displays++; } };
    Object.defineProperty(window, 'Notification', { configurable: true, value: notification });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => worker, ready: Promise.resolve(worker), getRegistration: async () => worker } });
    class Stream extends EventTarget { onopen = null; onerror = null; close() {} }
    Object.assign(window, { EventSource: Stream, __pushTest: tracked,
      __pushSetOnline: () => { online = true; window.dispatchEvent(new Event('online')); },
      // Fixture only: models a human granting permission in browser site settings.
      __pushAllowInSettings: () => { notification.permission = 'granted'; document.dispatchEvent(new Event('visibilitychange')); },
    });
  }, { department, permission: options.permission ?? 'default', answer: options.answer ?? 'granted', rejectsPrompt: options.rejectsPrompt ?? false, offline: options.offline ?? false });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return options.unauthorized
      ? route.fulfill({ status: 401, json: { message: 'Synthetic signed-out session' } })
      : route.fulfill({ json: { data: { user: { id: 'push-admin', name: 'Synthetic admin', role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN' } } } });
    if (path.endsWith('/web-push-key')) { keys++; return route.fulfill({ json: { data: { enabled: !options.disabled, publicKey: options.disabled ? null : 'B'.repeat(87), reason: options.disabled ?? null } } }); }
    if (path.endsWith('/device-token')) {
      if (route.request().method() === 'DELETE') { deletions++; return route.fulfill({ json: { data: {} } }); }
      registrations++;
      if (options.holdRegistration) await gate;
      return route.fulfill({ status: options.rejectRegistration ? 503 : 200, json: { data: { deviceTokenId: 'synthetic' } } });
    }
    return route.fulfill({ json: { data: { items: [], hasMore: false, scope: department === 'DRRMO' ? 'HAZARD' : department,
      incidents: [], flags: [], users: [], alerts: [], types: [], barangays: [],
      pagination: { page: 1, total: 0, totalPages: 1 }, serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 },
    } } });
  });
  const departmentRoute = department === 'DRRMO' ? 'drrmo' : department.toLowerCase();
  await page.goto('/admin/' + departmentRoute + '-dashboard');
  if (options.unauthorized) await expect.poll(() => new URL(page.url()).pathname).not.toContain('/admin/');
  else {
    await expect(page.locator('header[data-header-frame="shared"]')).toBeVisible();
    if (!options.offline && !options.unauthorized) {
      if ((options.permission ?? 'default') === 'default') await expect.poll(async () => (await calls(page)).prompts).toBe(1);
      if (options.permission === 'granted' || (!options.permission && !options.rejectsPrompt && (options.answer ?? 'granted') === 'granted')) {
        if (options.disabled) await expect.poll(() => warnings.length).toBe(1);
        else await expect.poll(() => registrations).toBe(1);
      }
    }
  }
  await settle(page); await noControls(page);
  return { keys: () => keys, registrations: () => registrations, deletions: () => deletions, warnings, releaseRegistration };
}

for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(department + ' registers automatically without a panel or buttons, and closing the page does not unregister', async ({ page, context }) => {
    const state = await setup(page, { department });
    expect(state.keys()).toBe(1); expect(state.registrations()).toBe(1);
    expect((await calls(page)).prompts).toBe(1); expect((await calls(page)).subscriptions).toBe(1);
    expect((await calls(page)).displays).toBe(0); expect((await calls(page)).unsubscribes).toBe(0);
    expect(state.warnings).toHaveLength(0);
    await page.close(); expect(context.pages()).toHaveLength(0); expect(state.deletions()).toBe(0);
  });
}
test('denied permission stays unregistered without prompting, backend calls or hidden manual controls', async ({ page }) => {
  const state = await setup(page, { permission: 'denied' });
  expect((await calls(page)).prompts).toBe(0); expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
});
test('dismissed permission is not requested again after reload', async ({ page }) => {
  const state = await setup(page, { answer: 'default' });
  expect((await calls(page)).prompts).toBe(1); expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
  await page.reload(); await expect(page.locator('header[data-header-frame="shared"]')).toBeVisible(); await settle(page);
  expect((await calls(page)).prompts).toBe(0); expect(state.registrations()).toBe(0); await noControls(page);
});
test('a browser refusing the automatic prompt is respected without programmatic consent or repeated prompting', async ({ page }) => {
  const state = await setup(page, { rejectsPrompt: true });
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  await settle(page);
  expect((await calls(page)).prompts).toBe(1); expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
});
test('allowing notifications in browser settings triggers background registration on return without an app button', async ({ page }) => {
  const state = await setup(page, { permission: 'denied' });
  await page.evaluate(() => (window as unknown as { __pushAllowInSettings: () => void }).__pushAllowInSettings());
  await expect.poll(() => state.registrations()).toBe(1);
  expect((await calls(page)).prompts).toBe(0); await noControls(page);
});
test('already allowed browsers register without another permission prompt or device-test display', async ({ page }) => {
  const state = await setup(page, { permission: 'granted' });
  expect(state.registrations()).toBe(1); expect((await calls(page)).prompts).toBe(0); expect((await calls(page)).displays).toBe(0);
});
test('stale local admin data cannot trigger permission or registration when the authoritative session is signed out', async ({ page }) => {
  const state = await setup(page, { unauthorized: true });
  expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0); expect((await calls(page)).prompts).toBe(0);
});
test('a disabled worker never registers and only produces a sanitized diagnostic', async ({ page }) => {
  const state = await setup(page, { permission: 'granted', disabled: 'worker-disabled' });
  expect(state.registrations()).toBe(0); expect(state.warnings).toEqual([warning]); await noControls(page);
});
test('failed persistence retries automatically on recovery while reusing the subscription', async ({ page }) => {
  const options: Options = { permission: 'granted', rejectRegistration: true };
  const state = await setup(page, options);
  await expect.poll(() => state.warnings.length).toBe(1);
  options.rejectRegistration = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => state.registrations()).toBe(2);
  expect((await calls(page)).subscriptions).toBe(1); expect((await calls(page)).prompts).toBe(0); await noControls(page);
});
test('offline setup waits for connectivity without consuming the automatic permission attempt', async ({ page }) => {
  const state = await setup(page, { offline: true });
  expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0); expect((await calls(page)).prompts).toBe(0);
  await page.evaluate(() => (window as unknown as { __pushSetOnline: () => void }).__pushSetOnline());
  await expect.poll(() => state.registrations()).toBe(1); expect((await calls(page)).prompts).toBe(1);
});
test('clustered foreground and online events do not duplicate pending or completed registration', async ({ page }) => {
  const state = await setup(page, { permission: 'granted', holdRegistration: true });
  const resume = () => page.evaluate(() => { for (let index = 0; index < 8; index++) { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); } });
  await resume(); await settle(page); expect(state.registrations()).toBe(1);
  state.releaseRegistration(); await settle(page); await resume(); await settle(page);
  expect(state.registrations()).toBe(1); expect(state.keys()).toBe(1); expect((await calls(page)).subscriptions).toBe(1);
});
test('desktop and Android-width admin headers have no notification panel or controls and do not overflow', async ({ page }, testInfo) => {
  await setup(page);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 }); await noControls(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('admin-headless-push-' + width + '.png') });
  }
});
