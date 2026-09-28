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
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('/')))).toBe(true);
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
