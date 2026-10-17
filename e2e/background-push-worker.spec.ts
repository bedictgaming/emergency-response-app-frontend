import { expect, test } from '@playwright/test';

test('installed worker requests a notification with all pages closed (display/provider mocked)', async ({ context, page }) => {
  await page.goto('/');
  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);
  const worker = context.serviceWorkers()[0];
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.close(); expect(context.pages()).toHaveLength(0);
  const requested = await worker.evaluate(async () => {
    const sw = globalThis as unknown as {
      registration: ServiceWorkerRegistration; dispatchEvent: (event: Event) => void; fetch: typeof fetch;
    };
    const displays: Array<{ title: string; body: string | undefined }> = [];
    // Automated Chromium denies native OS permission in this environment.
    // Keep the actual worker execution; mock only relevance and OS display.
    sw.fetch = async () => new Response(JSON.stringify({ relevant: true }));
    sw.registration.showNotification = async (title, options) => { displays.push({ title, body: options?.body }); };
    let pending: Promise<unknown> = Promise.resolve();
    const event = new Event('push');
    Object.defineProperties(event, {
      data: { value: { json: () => ({ title: 'Private test name', body: 'Private test location', data: {
        notificationId: '00000000-0000-0000-0000-000000009990', expiresAt: new Date(Date.now() + 60000).toISOString(),
      } }) } },
      waitUntil: { value: (value: Promise<unknown>) => { pending = value; } },
    });
    sw.dispatchEvent(event); await pending; return displays;
  });
  expect(requested).toEqual([{ title: 'Emergency response update', body: 'Open the app and sign in to view your update.' }]);
});

test('native notification display with every page closed — explicit device acceptance gate', async ({ context, page }) => {
  test.skip(process.env.EMERGENCY_E2E_NATIVE_NOTIFICATION !== 'true', 'Requires a browser/device that actually grants native OS notification permission');
  // No provider send or real emergency. This verifies browser worker execution,
  // not FCM acceptance, physical Android receipt, or OS sound.
  await context.grantPermissions(['notifications'], { origin: 'http://127.0.0.1:3100' });
  await page.goto('/');
  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);
  const worker = context.serviceWorkers()[0];
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(await page.evaluate(() => Notification.permission)).toBe('granted');
  await page.close(); expect(context.pages()).toHaveLength(0);
  const shown = await worker.evaluate(async () => {
    const sw = globalThis as unknown as {
      registration: ServiceWorkerRegistration; dispatchEvent: (event: Event) => void;
      fetch: typeof fetch;
    };
    // Synthetic current-state lookup is local to this disposable worker.
    sw.fetch = async () => new Response(JSON.stringify({ relevant: true }), { headers: { 'Content-Type': 'application/json' } });
    let pending: Promise<unknown> = Promise.resolve();
    const event = new Event('push');
    Object.defineProperties(event, {
      data: { value: { json: () => ({ title: 'Private test name', body: 'Private test location', data: {
        notificationId: '00000000-0000-0000-0000-000000009991', expiresAt: new Date(Date.now() + 60000).toISOString(),
      } }) } },
      waitUntil: { value: (value: Promise<unknown>) => { pending = value; } },
    });
    sw.dispatchEvent(event); await pending;
    const notifications = await sw.registration.getNotifications();
    const result = notifications.map(item => ({ title: item.title, body: item.body }));
    notifications.forEach(item => item.close()); return result;
  });
  expect(shown).toEqual([{ title: 'Emergency response update', body: 'Open the app and sign in to view your update.' }]);
});
