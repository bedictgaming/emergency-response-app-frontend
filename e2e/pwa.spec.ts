import { expect, test } from '@playwright/test';

test('PWA manifest, icons, and service worker are deployable', async ({ page, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: 'Emergency Response App',
    short_name: 'Emergency Response',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#db0000',
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
    expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
    expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
  ]));

  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }

  const workerResponse = await request.get('/sw.js');
  expect(workerResponse.ok()).toBe(true);
  const worker = await workerResponse.text();
  expect(worker).toContain("url.pathname.startsWith('/api/')");
  expect(worker).toContain("const OFFLINE_URL = '/offline.html'");

  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('crossorigin', 'use-credentials');
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/')))).toBe(true);
});

test('browser manifest fetch includes an existing same-origin access cookie', async ({ page, context }) => {
  await context.addCookies([{
    name: 'synthetic-platform-access',
    value: 'manifest-test-only',
    url: 'http://127.0.0.1:3100',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  let receivedCookie = false;
  await context.route('**/manifest.webmanifest', async (route) => {
    const headers = await route.request().allHeaders();
    receivedCookie = headers.cookie?.includes('synthetic-platform-access=manifest-test-only') ?? false;
    await route.fulfill({
      status: receivedCookie ? 200 : 401,
      contentType: 'application/manifest+json',
      body: JSON.stringify({ name: 'Credentialed manifest test', start_url: '/', display: 'standalone' }),
    });
  });
  await page.goto('/');
  const session = await context.newCDPSession(page);
  try {
    // Exercise the browser's manifest loader, not a normal fetch() with different defaults.
    const result = await session.send('Page.getAppManifest');
    expect(result.errors).toEqual([]);
    expect(receivedCookie).toBe(true);
    expect(JSON.parse(result.data ?? '{}').name).toBe('Credentialed manifest test');
  } finally {
    await session.detach();
  }
});

test('supported browsers can show and accept the install prompt', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pwaInstallReady)).toBe('true');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(event, {
      prompt: {
        value: async () => {
          (window as Window & { pwaPromptInvoked?: boolean }).pwaPromptInvoked = true;
        },
      },
      userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) },
    });
    window.dispatchEvent(event);
  });

  await expect(page.getByText('Install Emergency Response', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { pwaPromptInvoked?: boolean }).pwaPromptInvoked)).toBe(true);
});

test('the open app clearly warns when connectivity is lost', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);
  const offlineNotice = page.getByRole('status').filter({ hasText: 'You are offline.' });
  try {
    await expect(offlineNotice).toContainText('Reports are not submitted');
  } finally {
    await context.setOffline(false);
  }
  await expect(offlineNotice).toHaveCount(0);
});
