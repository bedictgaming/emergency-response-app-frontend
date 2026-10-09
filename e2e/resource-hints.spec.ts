import { expect, test } from '@playwright/test';

const unusedLogoPreload = 'link[rel="preload"][as="image"][href$="/emergency-icon.png"]';

async function expectStylesheetsConsumed(page: import('@playwright/test').Page) {
  // The fallback stylesheet must be linked, not merely speculatively preloaded.
  // Do not rely on a hash, a console filter, or a fixed timing delay.
  await expect.poll(() => page.evaluate(() => {
    const loaded = new Set([...document.styleSheets].map(sheet => sheet.href));
    return [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="style"]')]
      .filter(link => !loaded.has(link.href)).map(link => link.href);
  })).toEqual([]);
}

test('login logo loads without an unnecessary preload', async ({ page }) => {
  await page.goto('/login');
  const logo = page.locator('header img[src="/emergency-icon.png"]');
  await expect(logo).toHaveAttribute('alt', '');
  await expect(logo).toHaveAttribute('aria-hidden', 'true');
  await expect(logo).toHaveAttribute('fetchpriority', 'low');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(unusedLogoPreload)).toHaveCount(0);
  await expectStylesheetsConsumed(page);
});

test('citizen dashboard logo loads without an unnecessary preload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'citizen', name: 'Citizen', role: 'USER' }));
  });
  await page.route('**/api/auth/v1/me', route => route.fulfill({
    json: { data: { user: { id: 'citizen', name: 'Citizen', email: 'citizen@example.test', role: 'USER', permissions: ['incident:create-own'] } } },
  }));
  await page.route('**/api/incidents/v1/**', route => route.fulfill({
    json: { data: { incidents: [], pagination: { page: 1, pages: 1, total: 0, limit: 50 } } },
  }));
  await page.goto('/dashboard');
  const logo = page.locator('header img[src="/emergency-icon.png"]');
  await expect(logo).toHaveAttribute('alt', '');
  await expect(logo).toHaveAttribute('aria-hidden', 'true');
  await expect(logo).toHaveAttribute('fetchpriority', 'low');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(unusedLogoPreload)).toHaveCount(0);
  await expectStylesheetsConsumed(page);
});

test('normal route HTML does not leave fallback-only CSS preloads unused', async ({ request }) => {
  for (const path of ['/', '/login', '/dashboard', '/admin/main-dashboard']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const tags = html.match(/<link\b[^>]*>/g) ?? [];
    const href = (tag: string) => tag.match(/href="([^"]+)"/)?.[1];
    const linked = new Set(tags.filter(tag => /rel="stylesheet"/.test(tag)).map(href));
    const unused = tags.filter(tag => /rel="preload"/.test(tag) && /as="style"/.test(tag))
      .map(href).filter(url => !linked.has(url));
    expect(unused, path).toEqual([]);
  }
});
