import { expect, test, type Page } from '@playwright/test';

type Options = { department?: string; permission?: 'default' | 'granted' | 'denied'; answer?: 'default' | 'granted' | 'denied'; requiresGesture?: boolean; unauthorized?: boolean; disabled?: string; rejectRegistration?: boolean };
async function setup(page: Page, options: Options = {}) {
  const department = options.department ?? 'MAIN'; let keys = 0, registrations = 0;
  await page.addInitScript(({ department, permission, answer, requiresGesture }) => {
    localStorage.setItem('user', JSON.stringify({ id: 'push-admin', role: 'ADMIN', department, isMainAdmin: department === 'MAIN' }));
    const calls = { prompts: 0, subscriptions: 0, displays: 0 };
    const notification = { permission, requestPermission: async () => {
      calls.prompts++;
      // Navigation automation can retain activation. Deterministically simulate
      // refusal of the first automatic request, then require a real click to retry.
      if (requiresGesture && (calls.prompts === 1 || !navigator.userActivation.isActive)) throw new DOMException('Synthetic gesture restriction', 'NotAllowedError');
      notification.permission = answer; return answer;
    } };
    const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/synthetic-browser-test', keys: { p256dh: 'synthetic', auth: 'synthetic' } }) };
    const worker = { update: async () => {}, pushManager: { getSubscription: async () => null, subscribe: async () => { calls.subscriptions++; return subscription; } }, showNotification: async () => { calls.displays++; } };
    Object.defineProperty(window, 'Notification', { configurable: true, value: notification });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: async () => worker, ready: Promise.resolve(worker), getRegistration: async () => worker } });
    class Stream extends EventTarget { onopen = null; onerror = null; close() {} }
    Object.assign(window, { EventSource: Stream, __pushTest: calls });
  }, { department, permission: options.permission ?? 'default', answer: options.answer ?? 'granted', requiresGesture: options.requiresGesture ?? false });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/v1/me')) return options.unauthorized
      ? route.fulfill({ status: 401, json: { message: 'Synthetic signed-out session' } })
      : route.fulfill({ json: { data: { user: { id: 'push-admin', name: 'Synthetic admin', role: 'ADMIN', status: 'ACTIVE', department, isMainAdmin: department === 'MAIN' } } } });
    if (path.endsWith('/web-push-key')) { keys++; return route.fulfill({ json: { data: { enabled: !options.disabled, publicKey: options.disabled ? null : 'B'.repeat(87), reason: options.disabled ?? null } } }); }
    if (path.endsWith('/device-token')) { registrations++; return route.fulfill({ status: options.rejectRegistration ? 503 : 200, json: { data: { deviceTokenId: 'synthetic' } } }); }
    return route.fulfill({ json: { data: { items: [], hasMore: false, scope: department === 'DRRMO' ? 'HAZARD' : department,
      incidents: [], flags: [], users: [], alerts: [], types: [], barangays: [],
      pagination: { page: 1, total: 0, totalPages: 1 }, serviceSummary: { total: 0, active: 0, responding: 0, resolved: 0 }, verifiedSummary: { total: 0, active: 0, responding: 0, resolved: 0 },
    } } });
  });
  const route = department === 'DRRMO' ? 'drrmo' : department.toLowerCase();
  await page.goto(`/admin/${route}-dashboard`);
  const panel = page.locator('[data-admin-push]');
  if (options.unauthorized) {
    await expect.poll(() => new URL(page.url()).pathname).not.toContain('/admin/');
    await expect(panel).toHaveCount(0);
    return { panel, keys: () => keys, registrations: () => registrations };
  }
  await expect(panel.locator('summary')).not.toContainText('Checking');
  if (!await panel.evaluate(element => (element as HTMLDetailsElement).open)) await panel.locator('summary').click();
  return { panel, keys: () => keys, registrations: () => registrations };
}

for (const department of ['MAIN', 'FIRE', 'MEDICAL', 'POLICE', 'DRRMO']) {
  test(`${department} automatically requests permission on its first verified admin visit`, async ({ page }) => {
    const state = await setup(page, { department });
    await expect(state.panel.locator('summary')).toContainText('Registered');
    expect(state.keys()).toBe(1);
    expect(state.registrations()).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __pushTest: { prompts: number } }).__pushTest.prompts)).toBe(1);
    await expect(state.panel).toContainText('Stay signed in');
  });
}
test('blocked permission gives recovery instructions, never a registration success', async ({ page }) => {
  const state = await setup(page, { permission: 'denied' });
  await expect(state.panel).toContainText('Notifications are blocked');
  expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
});
test('dismissed automatic permission is not requested again after reload', async ({ page }) => {
  const state = await setup(page, { answer: 'default' });
  await expect(state.panel).toContainText('Not enabled');
  expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __pushTest: { prompts: number } }).__pushTest.prompts)).toBe(1);
  await page.reload();
  await expect(state.panel.locator('summary')).toContainText('Not enabled');
  expect(await page.evaluate(() => (window as unknown as { __pushTest: { prompts: number } }).__pushTest.prompts)).toBe(0);
  expect(state.registrations()).toBe(0);
});
test('gesture-only browsers retain a visible explicit retry after refusing the automatic attempt', async ({ page }) => {
  const state = await setup(page, { requiresGesture: true });
  await expect(state.panel).toContainText('If your browser did not show the permission prompt');
  const enable = state.panel.getByRole('button', { name: 'Enable notifications', exact: true });
  await expect(enable).toBeVisible(); expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
  await enable.click();
  await expect(state.panel.locator('summary')).toContainText('Registered');
  expect(state.registrations()).toBe(1);
});
test('stale local admin details cannot prompt when the authoritative session is signed out', async ({ page }) => {
  const state = await setup(page, { unauthorized: true });
  expect(state.keys()).toBe(0); expect(state.registrations()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __pushTest: { prompts: number } }).__pushTest.prompts)).toBe(0);
});
test('disabled worker is explicitly unavailable rather than registered', async ({ page }) => {
  const state = await setup(page, { permission: 'granted', disabled: 'worker-disabled' });
  await expect(state.panel).toContainText('server notification worker is disabled');
  await expect(state.panel.locator('summary')).toContainText('Unavailable'); expect(state.registrations()).toBe(0);
});
test('failed subscription persistence stays unavailable with a retry', async ({ page }) => {
  const state = await setup(page, { permission: 'granted', rejectRegistration: true });
  await expect(state.panel).toContainText('Could not register this browser');
  await expect(state.panel.getByRole('button', { name: 'Check notification setup', exact: true })).toBeEnabled();
});
test('device display test is labelled honestly and does not send a server notification', async ({ page }) => {
  const state = await setup(page, { permission: 'granted' }); const writes = state.registrations();
  await state.panel.getByRole('button', { name: 'Show device test', exact: true }).click();
  await expect(state.panel).toContainText('not server delivery or closed-tab receipt');
  expect(state.registrations()).toBe(writes);
});
test('notification controls fit desktop and Android-width screens', async ({ page }, testInfo) => {
  const state = await setup(page, { answer: 'default' });
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const button = state.panel.getByRole('button', { name: 'Enable notifications', exact: true });
    await expect(button).toBeVisible(); expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`admin-push-${width}.png`) });
  }
});
